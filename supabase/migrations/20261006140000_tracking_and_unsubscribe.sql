-- Step 8: open tracking, click tracking and unsubscribe.
-- All functions are called by the public tracking routes through the service
-- role only (a logged-in user must not be able to call them).

-- record_open: a tracking pixel was loaded. Returns true for the first open.
-- Mail servers often fetch images the moment mail arrives (security scanners,
-- privacy proxies), so anything in the first 5 seconds after sending is ignored.
create or replace function public.record_open(p_sent_message_id uuid, p_meta jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.sent_messages;
  v_first boolean;
begin
  select * into v_msg
  from public.sent_messages
  where id = p_sent_message_id and status in ('sent', 'bounced')
  for update;
  if not found then
    return false;
  end if;
  if v_msg.sent_at is not null and now() < v_msg.sent_at + interval '5 seconds' then
    return false;
  end if;

  v_first := v_msg.opened_at is null;
  update public.sent_messages
  set open_count = open_count + 1, opened_at = coalesce(opened_at, now())
  where id = v_msg.id;

  if v_first then
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'opened',
            coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('step', v_msg.step_position));
  end if;
  return v_first;
end;
$$;

-- record_click: a tracked link was followed. Returns true for the first click.
create or replace function public.record_click(p_sent_message_id uuid, p_url text, p_meta jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.sent_messages;
  v_first boolean;
begin
  select * into v_msg
  from public.sent_messages
  where id = p_sent_message_id and status in ('sent', 'bounced')
  for update;
  if not found then
    return false;
  end if;
  -- Link scanners follow every link right after delivery: ignore the first 5 seconds.
  if v_msg.sent_at is not null and now() < v_msg.sent_at + interval '5 seconds' then
    return false;
  end if;

  v_first := v_msg.clicked_at is null;
  update public.sent_messages
  set click_count = click_count + 1, clicked_at = coalesce(clicked_at, now())
  where id = v_msg.id;

  -- A person who clicks has also seen the email.
  if v_msg.opened_at is null then
    update public.sent_messages set opened_at = now(), open_count = open_count + 1 where id = v_msg.id;
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'opened',
            jsonb_build_object('step', v_msg.step_position, 'via', 'click'));
  end if;

  if v_first then
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'clicked',
            coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('step', v_msg.step_position, 'url', left(p_url, 500)));
  end if;
  return v_first;
end;
$$;

-- unsubscribe_info: what the unsubscribe page shows (who, from whom, already done?).
create or replace function public.unsubscribe_info(p_sent_message_id uuid)
returns table (out_email text, out_sender text, out_already boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.to_email::text,
    coalesce(nullif(a.from_name, ''), a.email::text, 'the sender'),
    exists (
      select 1 from public.suppressions s
      where s.workspace_id = m.workspace_id and s.email = m.to_email
    )
  from public.sent_messages m
  left join public.email_accounts a on a.id = m.email_account_id
  where m.id = p_sent_message_id;
$$;

-- unsubscribe_by_message: the person asked to stop. The address goes on the
-- suppression list and the person is stopped in EVERY campaign of the workspace.
-- Safe to run twice. Returns unsubscribed | already | not_found.
create or replace function public.unsubscribe_by_message(p_sent_message_id uuid)
returns table (out_result text, out_email text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.sent_messages;
  v_new boolean;
  v_own boolean;
  v_campaigns uuid[];
  v_campaign uuid;
begin
  select * into v_msg from public.sent_messages where id = p_sent_message_id;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  insert into public.suppressions (workspace_id, email, reason)
  values (v_msg.workspace_id, v_msg.to_email, 'unsubscribed')
  on conflict (workspace_id, email) do nothing;
  v_new := found;

  with changed as (
    update public.campaign_leads cl
    set status = 'unsubscribed', next_send_at = null
    where cl.workspace_id = v_msg.workspace_id
      and cl.lead_id = v_msg.lead_id
      and cl.status not in ('unsubscribed', 'bounced')
    returning cl.id, cl.campaign_id
  )
  select coalesce(array_agg(distinct changed.campaign_id), '{}'::uuid[]),
         coalesce(bool_or(changed.id = v_msg.campaign_lead_id), false)
  into v_campaigns, v_own
  from changed;

  if v_own then
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'unsubscribed',
            jsonb_build_object('step', v_msg.step_position, 'source', 'link'));
  end if;

  foreach v_campaign in array v_campaigns loop
    perform private.complete_campaign_if_done(v_campaign);
  end loop;

  return query select (case when v_new or v_own then 'unsubscribed' else 'already' end)::text, v_msg.to_email::text;
end;
$$;

revoke all on function public.record_open(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_click(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.unsubscribe_info(uuid) from public, anon, authenticated;
revoke all on function public.unsubscribe_by_message(uuid) from public, anon, authenticated;
grant execute on function public.record_open(uuid, jsonb) to service_role;
grant execute on function public.record_click(uuid, text, jsonb) to service_role;
grant execute on function public.unsubscribe_info(uuid) to service_role;
grant execute on function public.unsubscribe_by_message(uuid) to service_role;
