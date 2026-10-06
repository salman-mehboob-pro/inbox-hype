-- A lead waiting for a step that no longer exists (the step was deleted) is
-- done. Used by the sending tick; also completes the campaign when it was the
-- last open lead.
create or replace function public.complete_lead(p_campaign_lead_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  update public.campaign_leads
  set status = 'completed', next_send_at = null
  where id = p_campaign_lead_id and status in ('queued', 'in_progress')
  returning campaign_id into v_campaign_id;

  if v_campaign_id is not null then
    perform private.complete_campaign_if_done(v_campaign_id);
  end if;
end;
$$;

revoke all on function public.complete_lead(uuid) from public, anon, authenticated;
grant execute on function public.complete_lead(uuid) to service_role;
