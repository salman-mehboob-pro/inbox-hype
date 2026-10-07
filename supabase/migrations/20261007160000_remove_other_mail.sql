-- Remove "other mail" (user decision): mail that is not about one of our emails
-- is not stored any more. Apply after the app code without "other mail" is live.

drop function public.ingest_other(uuid, jsonb);

-- unibox_list without the 'other' filter.
create or replace function public.unibox_list(
  p_filter text default 'all',
  p_category text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, kind text, from_email text, from_name text, subject text, preview text,
  received_at timestamptz, is_read boolean, unread_count bigint, message_count bigint,
  category text, lead_id uuid, lead_name text, campaign_id uuid, campaign_name text,
  inbox_email text, total_count bigint
)
language sql
stable
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
