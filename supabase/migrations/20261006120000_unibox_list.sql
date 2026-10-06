-- Unibox list: inbound messages (replies, out-of-office, bounces), newest first,
-- with a short preview so the page never loads full bodies for the list.
-- SECURITY INVOKER: row level security keeps it to the user's workspace.
create or replace function public.unibox_list(
  p_filter text default 'all',
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
  select
    m.id,
    m.kind,
    m.from_email::text,
    m.from_name,
    m.subject,
    left(coalesce(m.text_body, ''), 600),
    m.received_at,
    m.is_read,
    m.lead_id,
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    m.campaign_id,
    c.name,
    a.email::text,
    count(*) over ()
  from public.inbox_messages m
  join public.email_accounts a on a.id = m.email_account_id
  left join public.leads l on l.id = m.lead_id
  left join public.campaigns c on c.id = m.campaign_id
  where m.direction = 'inbound'
    and case p_filter
      when 'unread' then m.is_read = false
      when 'replies' then m.kind = 'reply'
      when 'auto' then m.kind = 'auto_reply'
      when 'bounced' then m.kind = 'bounce'
      else true
    end
    and (
      p_search is null or p_search = ''
      or m.from_email ilike '%' || p_search || '%'
      or m.from_name ilike '%' || p_search || '%'
      or m.subject ilike '%' || p_search || '%'
      or l.company ilike '%' || p_search || '%'
    )
  order by m.received_at desc, m.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.unibox_list(text, text, integer, integer) from public, anon;
grant execute on function public.unibox_list(text, text, integer, integer) to authenticated;
