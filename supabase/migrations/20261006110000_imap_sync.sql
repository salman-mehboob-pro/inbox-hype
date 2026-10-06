-- Step 7: replies + bounces read over IMAP, and the Unibox.

-- What we sent (so the Unibox can show the whole conversation).
alter table public.sent_messages add column body_html text;

-- How an inbound message was matched to one of our emails:
--   header = In-Reply-To / References contained our Message-ID
--   sender = from the lead's address (Gmail may replace our Message-ID)
--   bounce = delivery report naming the lead's address or our Message-ID
alter table public.inbox_messages add column match_method text;

create index inbox_messages_unread_idx on public.inbox_messages (workspace_id)
  where is_read = false and direction = 'inbound';

-- finalize_send now also stores the email's HTML.
drop function public.finalize_send(uuid, text, jsonb);

create or replace function public.finalize_send(
  p_sent_message_id uuid,
  p_subject text,
  p_metadata jsonb default '{}'::jsonb,
  p_body_html text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.sent_messages;
  v_next public.sequence_steps;
begin
  update public.sent_messages
  set status = 'sent', sent_at = now(), subject = left(p_subject, 998), error = null,
      body_html = left(p_body_html, 500000)
  where id = p_sent_message_id and status = 'sending'
  returning * into v_msg;
  if not found then
    return false;
  end if;

  select * into v_next
  from public.sequence_steps
  where campaign_id = v_msg.campaign_id and position = v_msg.step_position + 1;

  -- If the lead was stopped meanwhile (reply, unsubscribe ...), keep that status.
  update public.campaign_leads
  set status = case
        when status not in ('queued', 'in_progress') then status
        when v_next.id is null then 'completed'
        else 'in_progress' end,
      next_step = case
        when status in ('queued', 'in_progress') and v_next.id is not null then v_msg.step_position + 1
        else next_step end,
      next_send_at = case
        when status in ('queued', 'in_progress') and v_next.id is not null
          then now() + make_interval(days => v_next.delay_days)
        else null end,
      last_sent_at = now(),
      last_message_id = v_msg.message_id,
      thread_message_id = coalesce(thread_message_id, v_msg.message_id),
      attempts = 0,
      last_error = null
  where id = v_msg.campaign_lead_id;

  insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
  values (
    v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'sent',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('step', v_msg.step_position)
  );

  update public.email_accounts set last_sent_at = now() where id = v_msg.email_account_id;
  perform private.complete_campaign_if_done(v_msg.campaign_id);
  return true;
end;
$$;

revoke all on function public.finalize_send(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.finalize_send(uuid, text, jsonb, text) to service_role;

-- ingest_inbound ----------------------------------------------------------------
-- Records one inbound message that belongs to one of our emails.
--   p_kind = reply       a person answered: the sequence stops (if the campaign says so)
--   p_kind = auto_reply  out of office: stored, nothing else changes
--   p_kind = bounce      delivery failed: lead bounced, address suppressed
-- p_message: { message_id, in_reply_to, references, from_email, from_name, to_email,
--              subject, text_body, html_body, imap_uid, received_at }
-- Safe to run twice for the same message. Returns: stored | duplicate | no_match.
create or replace function public.ingest_inbound(
  p_account_id uuid,
  p_kind text,
  p_sent_message_id uuid,
  p_match_method text,
  p_message jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sm public.sent_messages;
  v_id uuid;
  v_received timestamptz := coalesce((p_message ->> 'received_at')::timestamptz, now());
  v_stop boolean;
  v_first boolean;
begin
  if p_kind not in ('reply', 'auto_reply', 'bounce') then
    raise exception 'bad_kind';
  end if;

  select * into v_sm
  from public.sent_messages
  where id = p_sent_message_id and email_account_id = p_account_id
  for update;
  if not found then
    return 'no_match';
  end if;

  insert into public.inbox_messages (
    workspace_id, email_account_id, lead_id, campaign_id, sent_message_id,
    direction, kind, message_id, in_reply_to, references_header,
    from_email, from_name, to_email, subject, text_body, html_body,
    imap_uid, received_at, is_read, match_method
  )
  values (
    v_sm.workspace_id, p_account_id, v_sm.lead_id, v_sm.campaign_id, v_sm.id,
    'inbound', p_kind, p_message ->> 'message_id', p_message ->> 'in_reply_to', p_message ->> 'references',
    p_message ->> 'from_email', p_message ->> 'from_name', p_message ->> 'to_email',
    coalesce(left(p_message ->> 'subject', 998), ''),
    left(p_message ->> 'text_body', 200000), left(p_message ->> 'html_body', 500000),
    (p_message ->> 'imap_uid')::bigint, v_received,
    -- only real replies count as "unread" in the Unibox
    p_kind <> 'reply', p_match_method
  )
  on conflict (email_account_id, message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return 'duplicate';
  end if;

  if p_kind = 'reply' then
    v_first := v_sm.replied_at is null;
    update public.sent_messages set replied_at = coalesce(replied_at, v_received) where id = v_sm.id;

    select c.stop_on_reply into v_stop from public.campaigns c where c.id = v_sm.campaign_id;
    update public.campaign_leads
    set replied_at = coalesce(replied_at, v_received),
        status = case when v_stop and status in ('queued', 'in_progress', 'completed') then 'replied' else status end,
        next_send_at = case when v_stop and status in ('queued', 'in_progress', 'completed') then null else next_send_at end
    where id = v_sm.campaign_lead_id;

    if v_first then
      insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
      values (v_sm.workspace_id, v_sm.campaign_id, v_sm.lead_id, v_sm.id, 'replied',
              jsonb_build_object('step', v_sm.step_position, 'inbox_message_id', v_id));
    end if;
    perform private.complete_campaign_if_done(v_sm.campaign_id);

  elsif p_kind = 'bounce' then
    v_first := v_sm.status = 'sent';
    update public.sent_messages
    set status = 'bounced', bounced_at = coalesce(bounced_at, v_received)
    where id = v_sm.id and status = 'sent';

    update public.campaign_leads
    set status = 'bounced', next_send_at = null
    where id = v_sm.campaign_lead_id and status in ('queued', 'in_progress', 'completed');

    insert into public.suppressions (workspace_id, email, reason)
    values (v_sm.workspace_id, v_sm.to_email, 'bounced')
    on conflict (workspace_id, email) do nothing;

    if v_first then
      insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
      values (v_sm.workspace_id, v_sm.campaign_id, v_sm.lead_id, v_sm.id, 'bounced',
              jsonb_build_object('step', v_sm.step_position, 'source', 'imap', 'inbox_message_id', v_id));
    end if;
    perform private.complete_campaign_if_done(v_sm.campaign_id);
  end if;

  return 'stored';
end;
$$;

revoke all on function public.ingest_inbound(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, uuid, text, jsonb) to service_role;
