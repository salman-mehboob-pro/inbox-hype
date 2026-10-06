-- Unibox: one row per conversation (thread), categories, delete.
--
-- A thread = one lead in one campaign on one inbox (or, when the lead was
-- deleted, one sender address on one inbox).
--
-- * category: set by the user (Interested, Not interested ...). Stored on the
--   messages of the thread; a thread's category is its newest set category.
-- * deleted_at: "delete" hides the messages (soft delete). They stay in the
--   database so the IMAP sync can never bring the same message back; a NEW
--   reply from the lead starts a fresh thread.

alter table public.inbox_messages
  add column category text
    check (category in ('interested', 'meeting_booked', 'not_interested', 'wrong_person', 'follow_up_later')),
  add column deleted_at timestamptz;

-- Users may change only these three columns (everything else is written by the server).
revoke update on public.inbox_messages from authenticated;
grant update (is_read, category, deleted_at) on public.inbox_messages to authenticated;

-- The list: one row per thread, newest first. Shows the newest inbound message.
drop function if exists public.unibox_list(text, text, integer, integer);

create or replace function public.unibox_list(
  p_filter text default 'all',
  p_category text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind text,
  from_email text,
  from_name text,
  subject text,
  preview text,
  received_at timestamptz,
  is_read boolean,
  unread_count bigint,
  message_count bigint,
  category text,
  lead_id uuid,
  lead_name text,
  campaign_id uuid,
  campaign_name text,
  inbox_email text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with inbound as (
    select
      m.id, m.kind, m.from_email::text as from_email, m.from_name, m.subject, m.text_body,
      m.received_at, m.is_read, m.category, m.lead_id, m.campaign_id, m.email_account_id,
      m.email_account_id::text || ':' || coalesce(m.lead_id::text, lower(m.from_email::text)) || ':'
        || coalesce(m.campaign_id::text, '-') as thread_key
    from public.inbox_messages m
    where m.direction = 'inbound' and m.deleted_at is null
  ),
  threads as (
    select distinct on (i.thread_key)
      i.thread_key, i.id, i.kind, i.from_email, i.from_name, i.subject, i.text_body, i.received_at,
      i.lead_id, i.campaign_id, i.email_account_id
    from inbound i
    order by i.thread_key, i.received_at desc, i.id desc
  ),
  stats as (
    select
      i.thread_key,
      count(*) as message_count,
      count(*) filter (where not i.is_read) as unread_count,
      (array_agg(i.category order by i.received_at desc) filter (where i.category is not null))[1] as thread_category
    from inbound i
    group by i.thread_key
  )
  select
    t.id,
    t.kind,
    t.from_email,
    t.from_name,
    t.subject,
    left(coalesce(t.text_body, ''), 600),
    t.received_at,
    st.unread_count = 0,
    st.unread_count,
    st.message_count,
    st.thread_category,
    t.lead_id,
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    t.campaign_id,
    c.name,
    a.email::text,
    count(*) over ()
  from threads t
  join stats st on st.thread_key = t.thread_key
  join public.email_accounts a on a.id = t.email_account_id
  left join public.leads l on l.id = t.lead_id
  left join public.campaigns c on c.id = t.campaign_id
  where case p_filter
      when 'unread' then st.unread_count > 0
      when 'replies' then t.kind = 'reply'
      when 'auto' then t.kind = 'auto_reply'
      when 'bounced' then t.kind = 'bounce'
      else true
    end
    and case
      when p_category is null or p_category = '' then true
      when p_category = 'none' then st.thread_category is null
      else st.thread_category = p_category
    end
    and (
      p_search is null or p_search = ''
      or t.from_email ilike '%' || p_search || '%'
      or t.from_name ilike '%' || p_search || '%'
      or t.subject ilike '%' || p_search || '%'
      or l.company ilike '%' || p_search || '%'
    )
  order by t.received_at desc, t.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- Bulk actions on whole threads. p_ids = any message of each thread (the list
-- sends the newest). Actions: delete | read | unread | category (p_value = the
-- category, or null to clear it). Returns how many messages changed.
-- SECURITY INVOKER: row level security keeps it to the user's own workspace.
create or replace function public.unibox_bulk(p_ids uuid[], p_action text, p_value text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_action not in ('delete', 'read', 'unread', 'category') then
    raise exception 'bad_action';
  end if;
  if p_action = 'category'
     and p_value is not null
     and p_value not in ('interested', 'meeting_booked', 'not_interested', 'wrong_person', 'follow_up_later') then
    raise exception 'bad_category';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    raise exception 'bad_selection';
  end if;

  with seeds as (
    select distinct m.email_account_id, m.lead_id, m.campaign_id, lower(m.from_email::text) as from_email
    from public.inbox_messages m
    where m.id = any (p_ids)
  ),
  targets as (
    select t.id
    from public.inbox_messages t
    join seeds s
      on t.email_account_id = s.email_account_id
     and t.campaign_id is not distinct from s.campaign_id
     and (
       (s.lead_id is not null and t.lead_id = s.lead_id)
       or (s.lead_id is null and t.lead_id is null and lower(t.from_email::text) = s.from_email)
     )
    where t.deleted_at is null
  )
  update public.inbox_messages x
  set deleted_at = case when p_action = 'delete' then now() else x.deleted_at end,
      is_read = case
        when p_action = 'read' then true
        when p_action = 'unread' and x.direction = 'inbound' then false
        else x.is_read end,
      category = case when p_action = 'category' then p_value else x.category end
  from targets
  where x.id = targets.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.unibox_list(text, text, text, integer, integer) from public, anon;
revoke all on function public.unibox_bulk(uuid[], text, text) from public, anon;
grant execute on function public.unibox_list(text, text, text, integer, integer) to authenticated;
grant execute on function public.unibox_bulk(uuid[], text, text) to authenticated;
