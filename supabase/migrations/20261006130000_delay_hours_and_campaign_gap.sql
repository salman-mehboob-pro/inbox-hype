-- 1) Follow-up wait = days + hours (for example 1 day 2 hours, or 0 days 2 hours).
-- 2) The pause between two emails from the same inbox is now a CAMPAIGN setting,
--    a min and a max in minutes (each email waits a random time in between).
--    The old per-inbox gap columns stay in the table but are no longer used.

alter table public.sequence_steps
  add column delay_hours smallint not null default 0
  check (delay_hours between 0 and 23);

alter table public.campaigns
  add column gap_min_minutes smallint not null default 1 check (gap_min_minutes between 1 and 1440),
  add column gap_max_minutes smallint not null default 3 check (gap_max_minutes between 1 and 1440),
  add constraint campaigns_gap_order check (gap_max_minutes >= gap_min_minutes);

-- save_sequence: also stores delay_hours ------------------------------------------
create or replace function public.save_sequence(p_campaign_id uuid, p_steps jsonb)
returns setof public.sequence_steps
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_count integer;
  v_step jsonb;
  v_pos integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_format text;
begin
  select workspace_id into v_workspace_id from public.campaigns where id = p_campaign_id;
  if v_workspace_id is null then
    raise exception 'campaign_not_found';
  end if;

  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_steps);
  if v_count < 1 or v_count > 20 then
    raise exception 'step_count_out_of_range';
  end if;

  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_steps) s
  where s ->> 'id' is not null;

  if exists (
    select 1 from public.sequence_steps st
    where st.campaign_id = p_campaign_id
      and not (st.id = any(v_keep))
      and exists (select 1 from public.sent_messages m where m.sequence_step_id = st.id)
  ) then
    raise exception 'step_has_sends';
  end if;

  delete from public.sequence_steps st
  where st.campaign_id = p_campaign_id and not (st.id = any(v_keep));

  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_pos := v_pos + 1;
    v_id := (v_step ->> 'id')::uuid;
    v_format := coalesce(v_step ->> 'body_format', 'rich');
    if v_id is null then
      insert into public.sequence_steps (campaign_id, workspace_id, position, delay_days, delay_hours, subject, body, body_format)
      values (
        p_campaign_id, v_workspace_id, v_pos,
        case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
        case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_hours')::integer, 0) end,
        coalesce(v_step ->> 'subject', ''),
        coalesce(v_step ->> 'body', ''),
        v_format
      );
    else
      update public.sequence_steps set
        position = v_pos,
        delay_days = case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
        delay_hours = case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_hours')::integer, 0) end,
        subject = coalesce(v_step ->> 'subject', ''),
        body = coalesce(v_step ->> 'body', ''),
        body_format = v_format
      where id = v_id and campaign_id = p_campaign_id;
      if not found then
        raise exception 'step_not_found';
      end if;
    end if;
  end loop;

  return query
    select * from public.sequence_steps where campaign_id = p_campaign_id order by position;
end;
$$;

-- finalize_send: the next step is due after days + hours ------------------------------
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
          then now() + make_interval(days => v_next.delay_days, hours => v_next.delay_hours)
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

-- claim_send: the random wait before the inbox may send again comes from the campaign ---
create or replace function public.claim_send(
  p_campaign_lead_id uuid,
  p_step_id uuid,
  p_account_id uuid,
  p_message_id text,
  p_in_reply_to text default null
)
returns table (out_result text, out_sent_message_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acc public.email_accounts;
  v_cl public.campaign_leads;
  v_camp public.campaigns;
  v_step public.sequence_steps;
  v_lead public.leads;
  v_ws_tz text;
  v_count integer;
  v_reason text;
  v_id uuid;
begin
  -- 1. The inbox. Locking it makes claims for one inbox run one at a time.
  select * into v_acc from public.email_accounts where id = p_account_id for update skip locked;
  if not found then
    return query select 'inbox_busy'::text, null::uuid; return;
  end if;
  if v_acc.status <> 'active' then
    return query select 'inbox_inactive'::text, null::uuid; return;
  end if;
  if v_acc.next_available_at is not null and v_acc.next_available_at > now() then
    return query select 'inbox_busy'::text, null::uuid; return;
  end if;

  select w.timezone into v_ws_tz from public.workspaces w where w.id = v_acc.workspace_id;
  select count(*)::integer into v_count
  from public.sent_messages m
  where m.email_account_id = v_acc.id
    and m.created_at >= private.day_start(v_ws_tz)
    and m.status <> 'failed';
  if v_count >= v_acc.daily_limit then
    return query select 'inbox_cap'::text, null::uuid; return;
  end if;

  -- 2. The lead's progress row.
  select * into v_cl
  from public.campaign_leads
  where id = p_campaign_lead_id and workspace_id = v_acc.workspace_id
  for update skip locked;
  if not found then
    return query select 'lead_busy'::text, null::uuid; return;
  end if;
  if v_cl.status not in ('queued', 'in_progress')
     or (v_cl.email_account_id is not null and v_cl.email_account_id <> v_acc.id)
     or (v_cl.next_send_at is not null and v_cl.next_send_at > now()) then
    return query select 'not_due'::text, null::uuid; return;
  end if;

  select * into v_step
  from public.sequence_steps
  where id = p_step_id and campaign_id = v_cl.campaign_id;
  if not found or v_step.position <> v_cl.next_step then
    return query select 'not_due'::text, null::uuid; return;
  end if;

  -- 3. The campaign.
  select * into v_camp from public.campaigns where id = v_cl.campaign_id for no key update;
  if v_camp.status <> 'active' then
    return query select 'campaign_inactive'::text, null::uuid; return;
  end if;
  if v_cl.email_account_id is null and not exists (
    select 1 from public.campaign_email_accounts ce
    where ce.campaign_id = v_camp.id and ce.email_account_id = v_acc.id
  ) then
    return query select 'not_due'::text, null::uuid; return;
  end if;

  select count(*)::integer into v_count
  from public.sent_messages m
  where m.campaign_id = v_camp.id
    and m.created_at >= private.day_start(v_camp.timezone)
    and m.status <> 'failed';
  if v_count >= v_camp.daily_limit then
    return query select 'campaign_cap'::text, null::uuid; return;
  end if;

  -- 4. Never email suppressed addresses.
  select * into v_lead from public.leads where id = v_cl.lead_id;
  select s.reason into v_reason
  from public.suppressions s
  where s.workspace_id = v_cl.workspace_id and s.email = v_lead.email;
  if v_reason is not null then
    update public.campaign_leads
    set status = case v_reason
          when 'unsubscribed' then 'unsubscribed'
          when 'bounced' then 'bounced'
          else 'stopped' end,
        next_send_at = null
    where id = v_cl.id;
    perform private.complete_campaign_if_done(v_camp.id);
    return query select 'suppressed'::text, null::uuid; return;
  end if;

  -- 5. Claim. The unique key (campaign_lead_id, sequence_step_id) means a step
  -- can never be sent twice, whatever happens.
  insert into public.sent_messages (
    workspace_id, campaign_id, campaign_lead_id, sequence_step_id, lead_id,
    email_account_id, step_position, message_id, in_reply_to, to_email, status
  )
  values (
    v_cl.workspace_id, v_cl.campaign_id, v_cl.id, v_step.id, v_cl.lead_id,
    v_acc.id, v_step.position, p_message_id, p_in_reply_to, v_lead.email, 'sending'
  )
  on conflict (campaign_lead_id, sequence_step_id) do nothing
  returning id into v_id;
  if v_id is null then
    return query select 'already_sent'::text, null::uuid; return;
  end if;

  -- The lead keeps this inbox for all its follow-ups.
  update public.campaign_leads set email_account_id = v_acc.id where id = v_cl.id;

  -- Random wait (campaign setting, minutes) before this inbox may send again.
  update public.email_accounts
  set next_available_at = now() + make_interval(
    secs => v_camp.gap_min_minutes * 60 + random() * ((v_camp.gap_max_minutes - v_camp.gap_min_minutes) * 60)
  )
  where id = v_acc.id;

  return query select 'claimed'::text, v_id;
end;
$$;
