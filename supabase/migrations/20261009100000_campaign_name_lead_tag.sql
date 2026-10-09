-- When leads are added to a campaign, the campaign name is added to each lead
-- as a tag (max 50 characters, like every tag). A trigger, so every way of
-- adding leads (campaign page, lead page, new lead form) does it.
-- Renaming a campaign later does not change tags already given.
-- SECURITY INVOKER: RLS applies (the leads are in the user's own workspace).

create or replace function private.tag_leads_with_campaign_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.leads l
  set tags = l.tags || array(select x from unnest(t.tags) x where not (x = any(l.tags)))
  from (
    select n.lead_id, array_agg(distinct left(btrim(c.name), 50)) as tags
    from new_rows n
    join public.campaigns c on c.id = n.campaign_id
    where btrim(c.name) <> ''
    group by n.lead_id
  ) t
  where l.id = t.lead_id
    and not (t.tags <@ l.tags);
  return null;
end;
$$;

revoke all on function private.tag_leads_with_campaign_name() from public, anon, authenticated;

create trigger campaign_leads_tag_lead
  after insert on public.campaign_leads
  referencing new table as new_rows
  for each statement
  execute function private.tag_leads_with_campaign_name();

-- Leads already in a campaign get its name as a tag too.
update public.leads l
set tags = l.tags || array(select x from unnest(t.tags) x where not (x = any(l.tags)))
from (
  select cl.lead_id, array_agg(distinct left(btrim(c.name), 50)) as tags
  from public.campaign_leads cl
  join public.campaigns c on c.id = cl.campaign_id
  where btrim(c.name) <> ''
  group by cl.lead_id
) t
where l.id = t.lead_id
  and not (t.tags <@ l.tags);
