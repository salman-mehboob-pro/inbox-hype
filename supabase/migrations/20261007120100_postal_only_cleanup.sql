-- Postal-only, step 2 of 2: remove everything that belonged to Gmail / SMTP / IMAP
-- inboxes. Apply ONLY after the Postal-only app code is live (the older code
-- still reads and writes these columns).

-- Email accounts: every inbox is a Postal inbox.
alter table public.email_accounts drop constraint email_accounts_connection_check;
alter table public.email_accounts
  drop column provider,
  drop column smtp_host,
  drop column smtp_port,
  drop column smtp_secure,
  drop column smtp_username,
  drop column imap_host,
  drop column imap_port,
  drop column imap_secure,
  drop column imap_username,
  drop column imap_uid_validity,
  drop column imap_last_uid,
  drop column imap_last_synced_at,
  drop column min_delay_seconds,
  drop column max_delay_seconds,
  alter column postal_server_id set not null;

-- Secrets: only the Postal API key.
drop trigger email_account_secrets_sync_api_key on public.email_account_secrets;
drop function private.sync_api_key_columns();
alter table public.email_account_secrets
  drop column smtp_password_enc,
  drop column imap_password_enc,
  alter column api_key_enc set not null;

-- ingest_inbound without the IMAP position (incoming mail comes from the Postal route).
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
    received_at, is_read, match_method
  )
  values (
    v_sm.workspace_id, p_account_id, v_sm.lead_id, v_sm.campaign_id, v_sm.id,
    'inbound', p_kind, p_message ->> 'message_id', p_message ->> 'in_reply_to', p_message ->> 'references',
    p_message ->> 'from_email', p_message ->> 'from_name', p_message ->> 'to_email',
    coalesce(left(p_message ->> 'subject', 998), ''),
    left(p_message ->> 'text_body', 200000), left(p_message ->> 'html_body', 500000),
    v_received,
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
              jsonb_build_object('step', v_sm.step_position,
                                 'source', coalesce(p_message ->> 'source', 'postal_route'),
                                 'inbox_message_id', v_id));
    end if;
    perform private.complete_campaign_if_done(v_sm.campaign_id);
  end if;

  return 'stored';
end;
$$;

revoke all on function public.ingest_inbound(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, uuid, text, jsonb) to service_role;

alter table public.inbox_messages drop column imap_uid;

-- Dashboard inbox health: replies arrive when the Postal route is confirmed.
create or replace function public.dashboard_stats(p_workspace_id uuid, p_days integer default 7)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  params as (
    select
      coalesce((select w.timezone from public.workspaces w where w.id = p_workspace_id), 'UTC') as tz,
      greatest(1, least(coalesce(p_days, 7), 90)) as days
  ),
  bounds as (
    select
      tz,
      days,
      date_trunc('day', now() at time zone tz) as local_today,
      (date_trunc('day', now() at time zone tz) at time zone tz) as today_start,
      ((date_trunc('day', now() at time zone tz) - make_interval(days => days - 1)) at time zone tz) as range_start,
      ((date_trunc('day', now() at time zone tz) - make_interval(days => 2 * days - 1)) at time zone tz) as prev_start
    from params
  ),
  -- Events of the chosen period and of the period right before it.
  ev as (
    select
      e.type,
      e.lead_id,
      (e.created_at >= b.range_start) as is_current,
      date_trunc('day', e.created_at at time zone b.tz) as local_day
    from public.events e
    cross join bounds b
    where e.workspace_id = p_workspace_id
      and e.created_at >= b.prev_start
  ),
  by_type as (
    select is_current, type, count(*) as n, count(distinct lead_id) as leads
    from ev
    group by is_current, type
  ),
  totals as (
    select
      coalesce(jsonb_object_agg(type, n) filter (where is_current), '{}'::jsonb) as cur,
      coalesce(jsonb_object_agg(type, n) filter (where not is_current), '{}'::jsonb) as prev,
      coalesce(max(leads) filter (where is_current and type = 'sent'), 0) as contacted,
      coalesce(max(leads) filter (where not is_current and type = 'sent'), 0) as prev_contacted,
      coalesce(max(leads) filter (where is_current and type = 'replied'), 0) as replied_leads,
      coalesce(max(leads) filter (where not is_current and type = 'replied'), 0) as prev_replied_leads
    from by_type
  ),
  daily_counts as (
    select local_day, type, count(*) as n
    from ev
    where is_current
    group by local_day, type
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(s.local_day, 'YYYY-MM-DD'),
      'sent', coalesce((select d.n from daily_counts d where d.local_day = s.local_day and d.type = 'sent'), 0),
      'opened', coalesce((select d.n from daily_counts d where d.local_day = s.local_day and d.type = 'opened'), 0),
      'replied', coalesce((select d.n from daily_counts d where d.local_day = s.local_day and d.type = 'replied'), 0),
      'bounced', coalesce((select d.n from daily_counts d where d.local_day = s.local_day and d.type = 'bounced'), 0)
    ) order by s.local_day), '[]'::jsonb) as rows
    from (
      select b.local_today - make_interval(days => b.days - 1 - g) as local_day
      from bounds b, generate_series(0, 89) g
      where g < b.days
    ) s
  ),
  today as (
    select
      (
        select count(*)
        from public.sent_messages m, bounds b
        where m.workspace_id = p_workspace_id
          and m.status in ('sent', 'bounced')
          and m.sent_at >= b.today_start
      ) as sent_today,
      (
        select coalesce(sum(a.daily_limit), 0)
        from public.email_accounts a
        where a.workspace_id = p_workspace_id and a.status = 'active'
      ) as capacity
  ),
  counts as (
    select
      (select count(*) from public.campaigns c where c.workspace_id = p_workspace_id) as campaigns,
      (select count(*) from public.campaigns c where c.workspace_id = p_workspace_id and c.status = 'active') as active_campaigns,
      (select count(*) from public.leads l where l.workspace_id = p_workspace_id) as leads,
      (select count(*) from public.email_accounts a where a.workspace_id = p_workspace_id) as inboxes,
      (
        select count(*) from public.inbox_messages i
        where i.workspace_id = p_workspace_id and i.direction = 'inbound' and not i.is_read and i.deleted_at is null
      ) as unread_replies
  ),
  camps as (
    select coalesce(jsonb_agg(t.j order by t.ord), '[]'::jsonb) as rows
    from (
      select
        row_number() over (order by (c.status = 'active') desc, c.created_at desc) as ord,
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status,
          'total_leads', (select count(*) from public.campaign_leads cl where cl.campaign_id = c.id),
          'contacted', (select count(*) from public.campaign_leads cl where cl.campaign_id = c.id and cl.last_sent_at is not null),
          'replied', (
            select count(*) from public.campaign_leads cl
            where cl.campaign_id = c.id and (cl.status = 'replied' or cl.replied_at is not null)
          ),
          'bounced', (select count(*) from public.campaign_leads cl where cl.campaign_id = c.id and cl.status = 'bounced'),
          'sent', (select count(*) from public.sent_messages m where m.campaign_id = c.id and m.status in ('sent', 'bounced'))
        ) as j
      from public.campaigns c
      where c.workspace_id = p_workspace_id
      order by (c.status = 'active') desc, c.created_at desc
      limit 10
    ) t
  ),
  inbox_rows as (
    select coalesce(jsonb_agg(t.j order by t.ord), '[]'::jsonb) as rows
    from (
      select
        row_number() over (order by a.created_at) as ord,
        jsonb_build_object(
          'id', a.id,
          'email', a.email::text,
          'status', a.status,
          'last_error', left(a.last_error, 200),
          'daily_limit', a.daily_limit,
          'sent_today', (
            select count(*) from public.sent_messages m, bounds b
            where m.email_account_id = a.id and m.status in ('sent', 'bounced') and m.sent_at >= b.today_start
          ),
          'last_sent_at', a.last_sent_at,
          'reads_replies', exists (
            select 1 from public.postal_servers s where s.id = a.postal_server_id and s.route_ok_at is not null
          ),
          'last_checked_at', (select s.last_inbound_at from public.postal_servers s where s.id = a.postal_server_id)
        ) as j
      from public.email_accounts a
      where a.workspace_id = p_workspace_id
      order by a.created_at
      limit 20
    ) t
  )
  select jsonb_build_object(
    'days', (select days from params),
    'timezone', (select tz from params),
    'totals', totals.cur,
    'previous', totals.prev,
    'contacted', totals.contacted,
    'previous_contacted', totals.prev_contacted,
    'replied_leads', totals.replied_leads,
    'previous_replied_leads', totals.prev_replied_leads,
    'daily', daily.rows,
    'today', jsonb_build_object('sent', today.sent_today, 'capacity', today.capacity),
    'counts', to_jsonb(counts),
    'campaigns', camps.rows,
    'inboxes', inbox_rows.rows
  )
  from totals, daily, today, counts, camps, inbox_rows;
$$;

revoke all on function public.dashboard_stats(uuid, integer) from public, anon;
grant execute on function public.dashboard_stats(uuid, integer) to authenticated, service_role;
