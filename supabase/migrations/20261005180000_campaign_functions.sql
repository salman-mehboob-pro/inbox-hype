-- Step 5: campaigns + sequences.
-- All functions are SECURITY INVOKER (RLS applies).

-- Send in the lead's own timezone when it has one (FoxReach "lead timezone").
alter table public.campaigns
  add column use_lead_timezone boolean not null default true;

-- Replace a campaign's sequence in one transaction.
-- p_steps: [{ id?: uuid, delay_days: int, subject: text, body: text }, ...] in order.
-- Steps with an id are updated, steps without one are created, missing steps are
-- deleted, unless they already sent emails (then we refuse, to keep history).
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

  -- Ids that will be kept.
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

  -- Positions are unique per campaign but checked at commit (deferrable), so
  -- reordering inside this transaction is fine.
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_pos := v_pos + 1;
    v_id := (v_step ->> 'id')::uuid;
    if v_id is null then
      insert into public.sequence_steps (campaign_id, workspace_id, position, delay_days, subject, body)
      values (
        p_campaign_id, v_workspace_id, v_pos,
        case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
        coalesce(v_step ->> 'subject', ''),
        coalesce(v_step ->> 'body', '')
      );
    else
      update public.sequence_steps set
        position = v_pos,
        delay_days = case when v_pos = 1 then 0 else coalesce((v_step ->> 'delay_days')::integer, 0) end,
        subject = coalesce(v_step ->> 'subject', ''),
        body = coalesce(v_step ->> 'body', '')
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

-- Add leads to a campaign: all leads, leads with a tag, or a list of ids.
-- Already-added leads are skipped. Returns how many were added.
create or replace function public.add_leads_to_campaign(
  p_campaign_id uuid,
  p_tag text default null,
  p_lead_ids uuid[] default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_added integer;
begin
  select workspace_id into v_workspace_id
  from public.campaigns where id = p_campaign_id and status <> 'completed';
  if v_workspace_id is null then
    raise exception 'campaign_not_found';
  end if;

  with added as (
    insert into public.campaign_leads (workspace_id, campaign_id, lead_id)
    select v_workspace_id, p_campaign_id, l.id
    from public.leads l
    where l.workspace_id = v_workspace_id
      and (p_tag is null or p_tag = any(l.tags))
      and (p_lead_ids is null or l.id = any(p_lead_ids))
    on conflict (campaign_id, lead_id) do nothing
    returning 1
  )
  select count(*)::integer into v_added from added;
  return v_added;
end;
$$;

-- Remove leads from a campaign. Leads that already got emails are marked
-- "stopped" (keeps sent history); the rest are deleted.
create or replace function public.remove_leads_from_campaign(p_campaign_id uuid, p_campaign_lead_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
  v_stopped integer;
begin
  with stopped as (
    update public.campaign_leads cl set status = 'stopped', next_send_at = null
    where cl.campaign_id = p_campaign_id
      and cl.id = any(p_campaign_lead_ids)
      and exists (select 1 from public.sent_messages m where m.campaign_lead_id = cl.id)
    returning 1
  )
  select count(*)::integer into v_stopped from stopped;

  with deleted as (
    delete from public.campaign_leads cl
    where cl.campaign_id = p_campaign_id
      and cl.id = any(p_campaign_lead_ids)
      and not exists (select 1 from public.sent_messages m where m.campaign_lead_id = cl.id)
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted + v_stopped;
end;
$$;

-- Custom field names used in a workspace (for the "Insert variable" menu).
create or replace function public.workspace_custom_field_keys(p_workspace_id uuid)
returns table (key text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct k
  from public.leads l, jsonb_object_keys(l.custom_fields) k
  where l.workspace_id = p_workspace_id
  order by k;
$$;

revoke all on function public.save_sequence(uuid, jsonb) from public, anon;
revoke all on function public.add_leads_to_campaign(uuid, text, uuid[]) from public, anon;
revoke all on function public.remove_leads_from_campaign(uuid, uuid[]) from public, anon;
revoke all on function public.workspace_custom_field_keys(uuid) from public, anon;
grant execute on function public.save_sequence(uuid, jsonb) to authenticated;
grant execute on function public.add_leads_to_campaign(uuid, text, uuid[]) to authenticated;
grant execute on function public.remove_leads_from_campaign(uuid, uuid[]) to authenticated;
grant execute on function public.workspace_custom_field_keys(uuid) to authenticated;
