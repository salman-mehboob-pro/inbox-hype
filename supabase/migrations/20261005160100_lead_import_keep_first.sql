-- import_leads: when the same email appears twice in one batch, keep the first row
-- (ordered by position in the batch, not random).

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
        as custom_fields,
      src.ord
    from jsonb_array_elements(p_rows) with ordinality as src(r, ord)
  ),
  -- Same email twice in one batch: keep the first.
  deduped as (
    select distinct on (email) * from input order by email, ord
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
