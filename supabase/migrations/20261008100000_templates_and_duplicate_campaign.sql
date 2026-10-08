-- 1) Email templates: saved subject + body per workspace, picked in the sequence editor
--    (the template is COPIED into the step; editing the template later does not change steps).
-- 2) duplicate_campaign: copies a campaign's settings, sequence and inboxes (not its leads
--    or history). The copy starts as a draft.

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  subject text not null default '' check (char_length(subject) <= 500),
  body text not null default '' check (char_length(body) <= 200000),
  body_format text not null default 'rich' check (body_format in ('rich', 'html')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_templates_workspace_name_idx on public.email_templates (workspace_id, lower(name));

create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function private.set_updated_at();

alter table public.email_templates enable row level security;

create policy "members can view" on public.email_templates for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));
create policy "members can insert" on public.email_templates for insert to authenticated
  with check (workspace_id in (select private.user_workspace_ids()));
create policy "members can update" on public.email_templates for update to authenticated
  using (workspace_id in (select private.user_workspace_ids()))
  with check (workspace_id in (select private.user_workspace_ids()));
create policy "members can delete" on public.email_templates for delete to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- duplicate_campaign --------------------------------------------------------------------
create or replace function public.duplicate_campaign(p_campaign_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_src public.campaigns;
  v_new_id uuid;
begin
  -- RLS: only a campaign of the open workspace is found.
  select * into v_src from public.campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  insert into public.campaigns (
    workspace_id, name, status, timezone, send_days, window_start, window_end, use_lead_timezone,
    daily_limit, gap_min_minutes, gap_max_minutes, track_opens, track_clicks, stop_on_reply,
    include_unsubscribe
  )
  values (
    v_src.workspace_id, left(v_src.name, 193) || ' (copy)', 'draft', v_src.timezone, v_src.send_days,
    v_src.window_start, v_src.window_end, v_src.use_lead_timezone, v_src.daily_limit,
    v_src.gap_min_minutes, v_src.gap_max_minutes, v_src.track_opens, v_src.track_clicks,
    v_src.stop_on_reply, v_src.include_unsubscribe
  )
  returning id into v_new_id;

  insert into public.sequence_steps (
    campaign_id, workspace_id, position, delay_days, delay_hours, subject, body, body_format
  )
  select v_new_id, workspace_id, position, delay_days, delay_hours, subject, body, body_format
  from public.sequence_steps
  where campaign_id = p_campaign_id;

  insert into public.campaign_email_accounts (campaign_id, email_account_id, workspace_id)
  select v_new_id, email_account_id, workspace_id
  from public.campaign_email_accounts
  where campaign_id = p_campaign_id;

  return v_new_id;
end;
$$;

revoke all on function public.duplicate_campaign(uuid) from public, anon;
grant execute on function public.duplicate_campaign(uuid) to authenticated;
