-- Lead import + tag helpers. SECURITY INVOKER: they run as the logged-in
-- user, so RLS on public.leads still decides what they can touch.

-- Bulk import. p_rows is a JSON array of lead objects:
-- { email, first_name, last_name, company, title, phone, website,
--   linkedin_url, timezone, tags: [], custom_fields: {} }
-- If p_update_existing: existing leads (same email) get new non-empty values,
-- tags are merged and custom fields are merged. Otherwise they are skipped.
create or replace function public.import_leads(
  p_workspace_id uuid,
  p_rows jsonb,
  p_update_existing boolean default false
)
returns table (inserted integer, updated integer, skipped integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total > 1000 then
    raise exception 'At most 1000 rows per call';
  end if;

  return query
  with input as (
    select
      lower(trim(r ->> 'email'))::extensions.citext as email,
      nullif(trim(r ->> 'first_name'), '') as first_name,
      nullif(trim(r ->> 'last_name'), '') as last_name,
      nullif(trim(r ->> 'company'), '') as company,
      nullif(trim(r ->> 'title'), '') as title,
      nullif(trim(r ->> 'phone'), '') as phone,
      nullif(trim(r ->> 'website'), '') as website,
      nullif(trim(r ->> 'linkedin_url'), '') as linkedin_url,
      nullif(trim(r ->> 'timezone'), '') as timezone,
      coalesce(
        (select array_agg(distinct t) from jsonb_array_elements_text(coalesce(r -> 'tags', '[]'::jsonb)) t
          where trim(t) <> ''),
        '{}'
      ) as tags,
      case when jsonb_typeof(r -> 'custom_fields') = 'object' then r -> 'custom_fields' else '{}'::jsonb end
        as custom_fields
    from jsonb_array_elements(p_rows) r
  ),
  -- Same email twice in one batch: keep the first.
  deduped as (
    select distinct on (email) * from input order by email
  ),
  upserted as (
    insert into public.leads as l (
      workspace_id, email, first_name, last_name, company, title, phone,
      website, linkedin_url, timezone, tags, custom_fields
    )
    select
      p_workspace_id, d.email, d.first_name, d.last_name, d.company, d.title, d.phone,
      d.website, d.linkedin_url, d.timezone, d.tags, d.custom_fields
    from deduped d
    on conflict (workspace_id, email) do update set
      first_name = coalesce(excluded.first_name, l.first_name),
      last_name = coalesce(excluded.last_name, l.last_name),
      company = coalesce(excluded.company, l.company),
      title = coalesce(excluded.title, l.title),
      phone = coalesce(excluded.phone, l.phone),
      website = coalesce(excluded.website, l.website),
      linkedin_url = coalesce(excluded.linkedin_url, l.linkedin_url),
      timezone = coalesce(excluded.timezone, l.timezone),
      tags = (select coalesce(array_agg(distinct t), '{}') from unnest(l.tags || excluded.tags) t),
      custom_fields = l.custom_fields || excluded.custom_fields
    where p_update_existing
    returning (xmax = 0) as was_inserted
  )
  select
    (count(*) filter (where was_inserted))::integer,
    (count(*) filter (where not was_inserted))::integer,
    (v_total - count(*))::integer
  from upserted;
end;
$$;

-- Add tags to many leads.
create or replace function public.add_lead_tags(p_lead_ids uuid[], p_tags text[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with changed as (
    update public.leads l
    set tags = (select coalesce(array_agg(distinct t), '{}') from unnest(l.tags || p_tags) t where trim(t) <> '')
    where l.id = any(p_lead_ids)
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- Remove tags from many leads.
create or replace function public.remove_lead_tags(p_lead_ids uuid[], p_tags text[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with changed as (
    update public.leads l
    set tags = (select coalesce(array_agg(t), '{}') from unnest(l.tags) t where not (t = any(p_tags)))
    where l.id = any(p_lead_ids)
    returning 1
  )
  select count(*)::integer from changed;
$$;

-- All distinct tags in a workspace (for filters and autocomplete).
create or replace function public.workspace_lead_tags(p_workspace_id uuid)
returns table (tag text, lead_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t, count(*)::integer
  from public.leads l, unnest(l.tags) t
  where l.workspace_id = p_workspace_id
  group by t
  order by t;
$$;

revoke all on function public.import_leads(uuid, jsonb, boolean) from public, anon;
revoke all on function public.add_lead_tags(uuid[], text[]) from public, anon;
revoke all on function public.remove_lead_tags(uuid[], text[]) from public, anon;
revoke all on function public.workspace_lead_tags(uuid) from public, anon;
grant execute on function public.import_leads(uuid, jsonb, boolean) to authenticated;
grant execute on function public.add_lead_tags(uuid[], text[]) to authenticated;
grant execute on function public.remove_lead_tags(uuid[], text[]) to authenticated;
grant execute on function public.workspace_lead_tags(uuid) to authenticated;
