-- Unibox: (1) mail from people who are not part of a campaign ("other" mail),
-- (2) a "Sent" list of every email we sent (campaign emails + Unibox replies).

-- ingest_other ----------------------------------------------------------------
-- Stores one incoming email that does not belong to any of our emails (someone
-- who is not in a campaign, a newsletter, a delivery notice ...), sent to one of
-- the user's Postal inboxes. If the sender is a lead of the workspace, the
-- message is linked to that lead (no campaign). Nothing else changes: no
-- sequence stops. Safe to run twice. Returns: stored | duplicate | no_account.
create or replace function public.ingest_other(p_account_id uuid, p_message jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acc public.email_accounts;
  v_lead_id uuid;
  v_id uuid;
begin
  select * into v_acc from public.email_accounts where id = p_account_id;
  if not found then
    return 'no_account';
  end if;

  select l.id into v_lead_id
  from public.leads l
  where l.workspace_id = v_acc.workspace_id and l.email = (p_message ->> 'from_email');

  insert into public.inbox_messages (
    workspace_id, email_account_id, lead_id, campaign_id, sent_message_id,
    direction, kind, message_id, in_reply_to, references_header,
    from_email, from_name, to_email, subject, text_body, html_body,
    received_at, is_read, match_method
  )
  values (
    v_acc.workspace_id, v_acc.id, v_lead_id, null, null,
    'inbound', 'other', p_message ->> 'message_id', p_message ->> 'in_reply_to', p_message ->> 'references',
    p_message ->> 'from_email', p_message ->> 'from_name', p_message ->> 'to_email',
    coalesce(left(p_message ->> 'subject', 998), ''),
    left(p_message ->> 'text_body', 200000), left(p_message ->> 'html_body', 500000),
    coalesce((p_message ->> 'received_at')::timestamptz, now()), false, null
  )
  on conflict (email_account_id, message_id) do nothing
  returning id into v_id;

  return case when v_id is null then 'duplicate' else 'stored' end;
end;
$$;

revoke all on function public.ingest_other(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_other(uuid, jsonb) to service_role;

-- unibox_list: new filter 'other' (mail that is not a campaign reply) --------------
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
      when 'other' then t.kind = 'other'
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

-- unibox_sent_list ----------------------------------------------------------------
-- Every email we sent, newest first: campaign emails (source 'c', id = sent
-- message) and replies written in the Unibox (source 'r', id = inbox message).
-- Runs as the logged-in user (row level security applies).
create or replace function public.unibox_sent_list(
  p_search text default null,
  p_limit integer default 40,
  p_offset integer default 0
)
returns table (
  source text, id uuid, to_email text, lead_id uuid, lead_name text, campaign_id uuid, campaign_name text,
  inbox_email text, subject text, preview text, sent_at timestamptz, step_position integer, status text,
  delivery_status text, opened boolean, clicked boolean, replied boolean, total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with sent as (
    select
      'c'::text as source, m.id, m.to_email::text as to_email, m.lead_id, m.campaign_id, m.email_account_id,
      m.subject, coalesce(m.sent_at, m.created_at) as sent_at, m.step_position, m.status, m.delivery_status,
      m.opened_at is not null as opened, m.clicked_at is not null as clicked, m.replied_at is not null as replied,
      m.body_html as body
    from public.sent_messages m
    where m.status in ('sent', 'bounced')
    union all
    select
      'r', i.id, i.to_email, i.lead_id, i.campaign_id, i.email_account_id,
      i.subject, i.received_at, null, 'sent', null, false, false, false,
      coalesce(i.text_body, i.html_body)
    from public.inbox_messages i
    where i.direction = 'outbound' and i.deleted_at is null
  )
  select
    s.source, s.id, s.to_email, s.lead_id,
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    s.campaign_id, c.name, a.email::text, s.subject,
    -- Plain text for the list: no styles, no tags, short.
    left(regexp_replace(regexp_replace(regexp_replace(coalesce(s.body, ''),
      -- (the first quantifier is lazy, so the whole pattern is: one block at a time)
      '<(style|head|title)[^>]*?>.*?</\1>', ' ', 'gi'), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'), 400),
    s.sent_at, s.step_position, s.status, s.delivery_status, s.opened, s.clicked, s.replied,
    count(*) over ()
  from sent s
  -- left join: emails from a removed inbox still show (without the inbox)
  left join public.email_accounts a on a.id = s.email_account_id
  left join public.leads l on l.id = s.lead_id
  left join public.campaigns c on c.id = s.campaign_id
  where p_search is null or p_search = ''
    or s.to_email ilike '%' || p_search || '%'
    or s.subject ilike '%' || p_search || '%'
    or concat_ws(' ', l.first_name, l.last_name) ilike '%' || p_search || '%'
    or l.company ilike '%' || p_search || '%'
  order by s.sent_at desc, s.id desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.unibox_sent_list(text, integer, integer) from public, anon;
grant execute on function public.unibox_sent_list(text, integer, integer) to authenticated, service_role;
