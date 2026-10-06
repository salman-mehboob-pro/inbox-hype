-- Step 6: sending tick.
--
-- The tick (a Next.js route, called every minute) uses these functions through
-- the service role. They are the only place that decides "may this email be
-- sent right now?", so two ticks running at once can never double send:
--   * claim_send locks the inbox + the lead, checks caps, then inserts the
--     sent_messages row. unique (campaign_lead_id, sequence_step_id) is the
--     last line of defence.
--   * finalize_send / fail_send close the claim and move the lead forward.

-- Retry bookkeeping on the lead's progress row.
alter table public.campaign_leads
  add column attempts smallint not null default 0,
  add column last_error text;

-- Daily-cap counts and "due" scans.
create index sent_messages_account_created_idx on public.sent_messages (email_account_id, created_at desc);
create index sent_messages_campaign_created_idx on public.sent_messages (campaign_id, created_at desc);
create index sent_messages_sending_idx on public.sent_messages (created_at) where status = 'sending';
create index campaign_leads_unassigned_idx on public.campaign_leads (campaign_id, created_at)
  where email_account_id is null and status in ('queued', 'in_progress');
create index campaign_leads_account_due_idx on public.campaign_leads (email_account_id, next_send_at)
  where status = 'in_progress';

-- Helpers ---------------------------------------------------------------------

-- A timezone name Postgres knows, or the fallback (a bad name would raise an
-- error and stop every send).
create or replace function private.safe_tz(p_tz text, p_fallback text default 'UTC')
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select n.name from pg_catalog.pg_timezone_names n where n.name = p_tz limit 1),
    p_fallback
  );
$$;

-- Start of the current day in a timezone.
create or replace function private.day_start(p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone private.safe_tz(p_tz)) at time zone private.safe_tz(p_tz);
$$;

-- Marks a campaign completed when no lead is left to contact.
create or replace function private.complete_campaign_if_done(p_campaign_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.campaigns c
  set status = 'completed'
  where c.id = p_campaign_id
    and c.status = 'active'
    and not exists (
      select 1 from public.campaign_leads cl
      where cl.campaign_id = c.id and cl.status in ('queued', 'in_progress')
    );
$$;

revoke all on function private.safe_tz(text, text) from public, anon, authenticated;
revoke all on function private.day_start(text) from public, anon, authenticated;
revoke all on function private.complete_campaign_if_done(uuid) from public, anon, authenticated;
grant execute on function private.safe_tz(text, text) to service_role;
grant execute on function private.day_start(text) to service_role;
grant execute on function private.complete_campaign_if_done(uuid) to service_role;

-- claim_send ------------------------------------------------------------------
-- Reserves one email (this lead, this step, this inbox). Returns:
--   claimed          you may send now (out_sent_message_id is the new row)
--   inbox_busy       inbox is locked by another tick, or still waiting out its random gap
--   inbox_inactive   inbox is paused / in error
--   inbox_cap        inbox reached its daily limit
--   campaign_cap     campaign reached its daily limit
--   campaign_inactive campaign is not active
--   lead_busy        another tick is working on this lead
--   not_due          the lead moved on (already sent, replied, other inbox, wrong step ...)
--   suppressed       the address is on the suppression list (the lead is stopped)
--   already_sent     this step already has a sent_messages row
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

  -- 3. The campaign. NO KEY UPDATE makes claims for one campaign run one at a
  -- time (so the campaign cap can't be passed) without blocking foreign keys.
  select * into v_camp from public.campaigns where id = v_cl.campaign_id for no key update;
  if v_camp.status <> 'active' then
    return query select 'campaign_inactive'::text, null::uuid; return;
  end if;
  -- A lead without an inbox yet may only start from an inbox the campaign uses.
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

  -- Random wait before this inbox may send again.
  update public.email_accounts
  set next_available_at = now() + make_interval(
    secs => v_acc.min_delay_seconds + random() * (v_acc.max_delay_seconds - v_acc.min_delay_seconds)
  )
  where id = v_acc.id;

  return query select 'claimed'::text, v_id;
end;
$$;

-- finalize_send ---------------------------------------------------------------
-- The email was accepted by the SMTP server. Marks it sent, moves the lead to
-- the next step (or completes it) and writes the "sent" event.
create or replace function public.finalize_send(
  p_sent_message_id uuid,
  p_subject text,
  p_metadata jsonb default '{}'::jsonb
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
  set status = 'sent', sent_at = now(), subject = left(p_subject, 998), error = null
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

-- fail_send -------------------------------------------------------------------
-- The email was NOT sent (or its fate is unknown). Modes:
--   release  not sent, try again later. The claim is deleted. p_count = false
--            for inbox problems (they must not use up the lead's retries);
--            after 5 counted attempts the lead is marked failed.
--   fail     give up on this lead (message refused, delivery unknown ...).
--   bounce   the address was rejected by the server: lead bounced + suppressed.
-- Returns what happened: released | failed | bounced | gone.
create or replace function public.fail_send(
  p_sent_message_id uuid,
  p_mode text,
  p_error text,
  p_retry_in interval default interval '15 minutes',
  p_count boolean default true
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_msg public.sent_messages;
  v_cl public.campaign_leads;
  v_err text := left(coalesce(p_error, ''), 500);
  v_status text;
begin
  if p_mode not in ('release', 'fail', 'bounce') then
    raise exception 'bad_mode';
  end if;

  select * into v_msg from public.sent_messages where id = p_sent_message_id and status = 'sending' for update;
  if not found then
    return 'gone';
  end if;

  select * into v_cl from public.campaign_leads where id = v_msg.campaign_lead_id for update;

  if p_mode = 'release' then
    delete from public.sent_messages where id = v_msg.id;

    update public.campaign_leads
    set attempts = attempts + case when p_count then 1 else 0 end,
        last_error = v_err,
        -- A lead that never got an email can move to another inbox.
        email_account_id = case when next_step = 1 then null else email_account_id end,
        next_send_at = now() + coalesce(p_retry_in, interval '15 minutes'),
        status = case when p_count and attempts + 1 >= 5 then 'failed' else status end
    where id = v_cl.id and status in ('queued', 'in_progress')
    returning status into v_status;

    if v_status = 'failed' then
      update public.campaign_leads set next_send_at = null where id = v_cl.id;
      insert into public.events (workspace_id, campaign_id, lead_id, type, metadata)
      values (v_cl.workspace_id, v_cl.campaign_id, v_cl.lead_id, 'failed',
              jsonb_build_object('step', v_msg.step_position, 'error', v_err, 'reason', 'too_many_attempts'));
      perform private.complete_campaign_if_done(v_cl.campaign_id);
    end if;
    return 'released';
  end if;

  update public.sent_messages set status = 'failed', error = v_err where id = v_msg.id;

  update public.campaign_leads
  set status = case when p_mode = 'bounce' then 'bounced' else 'failed' end,
      next_send_at = null,
      last_error = v_err
  where id = v_cl.id and status in ('queued', 'in_progress');

  if p_mode = 'bounce' then
    insert into public.suppressions (workspace_id, email, reason)
    values (v_msg.workspace_id, v_msg.to_email, 'bounced')
    on conflict (workspace_id, email) do nothing;
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'bounced',
            jsonb_build_object('step', v_msg.step_position, 'error', v_err, 'source', 'smtp'));
  else
    insert into public.events (workspace_id, campaign_id, lead_id, sent_message_id, type, metadata)
    values (v_msg.workspace_id, v_msg.campaign_id, v_msg.lead_id, v_msg.id, 'failed',
            jsonb_build_object('step', v_msg.step_position, 'error', v_err));
  end if;

  perform private.complete_campaign_if_done(v_msg.campaign_id);
  return case when p_mode = 'bounce' then 'bounced' else 'failed' end;
end;
$$;

-- sweep_stale_sends -----------------------------------------------------------
-- A claim stuck in "sending" means a tick died mid-send. We can't know if the
-- email went out, so we never retry it (no double sends): it is marked failed.
create or replace function public.sweep_stale_sends(p_older_than interval default interval '10 minutes')
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select m.id from public.sent_messages m
    where m.status = 'sending' and m.created_at < now() - p_older_than
    order by m.created_at
    limit 200
    for update skip locked
  loop
    perform public.fail_send(
      v_id, 'fail',
      'Sending was interrupted. The email may or may not have been delivered. Check the inbox''s Sent folder.'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Only the server (service role) may call these: a logged-in user must never be
-- able to create or close a send.
revoke all on function public.claim_send(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_send(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_send(uuid, text, text, interval, boolean) from public, anon, authenticated;
revoke all on function public.sweep_stale_sends(interval) from public, anon, authenticated;
grant execute on function public.claim_send(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_send(uuid, text, jsonb) to service_role;
grant execute on function public.fail_send(uuid, text, text, interval, boolean) to service_role;
grant execute on function public.sweep_stale_sends(interval) to service_role;

-- Cron hook -------------------------------------------------------------------
-- pg_cron calls private.call_tick() every minute (scheduled at deploy time, see
-- supabase/cron/schedule_tick.sql). It reads the tick URL + secret from Vault,
-- so no secret lives in the code or in a migration. Until both Vault secrets
-- exist, it does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.call_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'tick_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function private.call_tick() from public, anon, authenticated;
