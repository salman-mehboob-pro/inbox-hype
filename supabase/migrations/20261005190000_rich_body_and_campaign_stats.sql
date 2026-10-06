-- Rich email bodies + campaign analytics/activity.

-- 'rich' = written in the text editor (HTML made by the editor)
-- 'html' = pasted / imported raw HTML (kept exactly)
alter table public.sequence_steps
  add column body_format text not null default 'rich'
  check (body_format in ('rich', 'html'));

-- save_sequence now also stores body_format.
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
      insert into public.sequence_steps (campaign_id, workspace_id, position, delay_days, subject, body, body_format)
      values (
        p_campaign_id, v_workspace_id, v_pos,
        case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
        coalesce(v_step ->> 'subject', ''),
        coalesce(v_step ->> 'body', ''),
        v_format
      );
    else
      update public.sequence_steps set
        position = v_pos,
        delay_days = case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
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

-- All numbers for the campaign Analytics tab in one call.
-- "Today" = the current day in the campaign's timezone.
create or replace function public.campaign_stats(p_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (
    select id, timezone, daily_limit from public.campaigns where id = p_campaign_id
  ),
  day_start as (
    select (date_trunc('day', now() at time zone c.timezone) at time zone c.timezone) as ts from c
  ),
  leads as (
    select
      count(*) as total,
      count(*) filter (where last_sent_at is not null) as contacted,
      count(*) filter (where status = 'replied' or replied_at is not null) as replied,
      count(*) filter (where status = 'bounced') as bounced,
      count(*) filter (where status = 'unsubscribed') as unsubscribed,
      count(*) filter (where status in ('completed', 'replied', 'bounced', 'unsubscribed', 'stopped', 'failed')) as finished
    from public.campaign_leads where campaign_id = p_campaign_id
  ),
  msgs as (
    select
      count(*) filter (where status in ('sent', 'bounced')) as sent,
      count(*) filter (where status in ('sent', 'bounced') and sent_at >= (select ts from day_start)) as sent_today,
      count(*) filter (where opened_at is not null) as opened,
      count(*) filter (where clicked_at is not null) as clicked,
      count(*) filter (where status = 'failed') as failed
    from public.sent_messages where campaign_id = p_campaign_id
  ),
  steps as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'position', st.position,
      'sent', (select count(*) from public.sent_messages m where m.sequence_step_id = st.id and m.status in ('sent', 'bounced')),
      'opened', (select count(*) from public.sent_messages m where m.sequence_step_id = st.id and m.opened_at is not null),
      'clicked', (select count(*) from public.sent_messages m where m.sequence_step_id = st.id and m.clicked_at is not null),
      'replied', (select count(*) from public.sent_messages m where m.sequence_step_id = st.id and m.replied_at is not null)
    ) order by st.position), '[]'::jsonb) as rows
    from public.sequence_steps st where st.campaign_id = p_campaign_id
  )
  select jsonb_build_object(
    'total_leads', leads.total,
    'contacted', leads.contacted,
    'finished', leads.finished,
    'replied', leads.replied,
    'bounced', leads.bounced,
    'unsubscribed', leads.unsubscribed,
    'sent', msgs.sent,
    'sent_today', msgs.sent_today,
    'opened', msgs.opened,
    'clicked', msgs.clicked,
    'failed', msgs.failed,
    'daily_limit', c.daily_limit,
    'steps', steps.rows
  )
  from c, leads, msgs, steps;
$$;

-- Campaign activity feed with search + filters, newest first.
-- p_since: only events after this time (null = all). Returns total_count on every row.
create or replace function public.campaign_activity(
  p_campaign_id uuid,
  p_search text default null,
  p_type text default null,
  p_step integer default null,
  p_since timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  type text,
  created_at timestamptz,
  lead_id uuid,
  lead_email text,
  lead_name text,
  step_position integer,
  subject text,
  inbox_email text,
  metadata jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id, e.type, e.created_at, e.lead_id,
    l.email::text,
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    m.step_position,
    m.subject,
    a.email::text,
    e.metadata,
    count(*) over ()
  from public.events e
  left join public.leads l on l.id = e.lead_id
  left join public.sent_messages m on m.id = e.sent_message_id
  left join public.email_accounts a on a.id = m.email_account_id
  where e.campaign_id = p_campaign_id
    and (p_type is null or e.type = p_type)
    and (p_step is null or m.step_position = p_step)
    and (p_since is null or e.created_at >= p_since)
    and (
      p_search is null or p_search = ''
      or l.email ilike '%' || p_search || '%'
      or m.subject ilike '%' || p_search || '%'
    )
  order by e.created_at desc, e.id desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.campaign_stats(uuid) from public, anon;
revoke all on function public.campaign_activity(uuid, text, text, integer, timestamptz, integer, integer) from public, anon;
grant execute on function public.campaign_stats(uuid) to authenticated;
grant execute on function public.campaign_activity(uuid, text, text, integer, timestamptz, integer, integer) to authenticated;
