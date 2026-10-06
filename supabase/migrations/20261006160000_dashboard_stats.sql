-- Step 9: dashboard numbers.
--
-- dashboard_stats(workspace, days): one call returns everything the dashboard
-- needs (totals for the last N days and the N days before, a per-day series,
-- today's sending, counts, a campaign list and inbox health).
-- dashboard_activity(workspace, limit): the newest events across all campaigns.
--
-- Both run as the logged-in user (security invoker), so row level security keeps
-- every workspace's numbers private: asking for another workspace returns zeros.
-- Days are cut at midnight in the WORKSPACE timezone.

create index if not exists sent_messages_workspace_sent_idx
  on public.sent_messages (workspace_id, sent_at desc);

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
          'reads_replies', a.imap_host is not null,
          'last_checked_at', a.imap_last_synced_at
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

create or replace function public.dashboard_activity(p_workspace_id uuid, p_limit integer default 12)
returns table (
  id bigint,
  type text,
  created_at timestamptz,
  lead_id uuid,
  lead_email text,
  lead_name text,
  campaign_id uuid,
  campaign_name text,
  step_position integer
)
language sql
stable
set search_path = ''
as $$
  select
    e.id,
    e.type,
    e.created_at,
    e.lead_id,
    l.email::text,
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    e.campaign_id,
    c.name,
    m.step_position
  from public.events e
  left join public.leads l on l.id = e.lead_id
  left join public.campaigns c on c.id = e.campaign_id
  left join public.sent_messages m on m.id = e.sent_message_id
  where e.workspace_id = p_workspace_id
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

revoke all on function public.dashboard_stats(uuid, integer) from public, anon;
revoke all on function public.dashboard_activity(uuid, integer) from public, anon;
grant execute on function public.dashboard_stats(uuid, integer) to authenticated, service_role;
grant execute on function public.dashboard_activity(uuid, integer) to authenticated, service_role;
