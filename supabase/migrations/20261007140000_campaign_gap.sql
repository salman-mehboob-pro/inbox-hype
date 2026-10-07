-- The time gap between emails is per CAMPAIGN (like FoxReach): the campaign
-- sends one email, then waits a random time between gap_min_minutes and
-- gap_max_minutes before its next email, which goes from the next inbox in
-- rotation. Several inboxes never send for the same campaign at the same time.
--
-- email_accounts.next_available_at is now only used to rest an inbox after a
-- problem (provider limit, server busy), no longer for the gap.

alter table public.campaigns add column next_available_at timestamptz;

update public.email_accounts set next_available_at = null where next_available_at is not null;

create or replace function public.claim_send(
  p_campaign_lead_id uuid,
  p_step_id uuid,
  p_account_id uuid,
  p_message_id text,
  p_in_reply_to text default null
)
returns table (out_result text, out_sent_message_id uuid)
language plpgsql
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
  select * into v_acc from public.email_accounts where id = p_account_id for update skip locked;
  if not found then
    return query select 'inbox_busy'::text, null::uuid; return;
  end if;
  if v_acc.status <> 'active' then
    return query select 'inbox_inactive'::text, null::uuid; return;
  end if;
  -- The inbox is resting after a problem (limit reached, server busy).
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

  -- Locking the campaign row makes two claims for the same campaign wait for
  -- each other, so the gap can't be skipped by sending from two inboxes at once.
  select * into v_camp from public.campaigns where id = v_cl.campaign_id for update;
  if v_camp.status <> 'active' then
    return query select 'campaign_inactive'::text, null::uuid; return;
  end if;
  if v_camp.next_available_at is not null and v_camp.next_available_at > now() then
    return query select 'campaign_wait'::text, null::uuid; return;
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

  update public.campaign_leads set email_account_id = v_acc.id where id = v_cl.id;

  -- The campaign's next email waits a random gap (whichever inbox sends it).
  update public.campaigns
  set next_available_at = now() + make_interval(
    secs => v_camp.gap_min_minutes * 60 + random() * ((v_camp.gap_max_minutes - v_camp.gap_min_minutes) * 60)
  )
  where id = v_camp.id;

  return query select 'claimed'::text, v_id;
end;
$$;

revoke all on function public.claim_send(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_send(uuid, uuid, uuid, text, text) to service_role;
