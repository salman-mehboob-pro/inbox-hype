-- Multiple workspaces in one account.
-- Each user has one OPEN (active) workspace. private.user_workspace_ids() now
-- returns only that one, so every RLS policy and every RPC that runs as the
-- user only sees the open workspace. Safe for the old app code: with no choice
-- saved, the open workspace is the oldest one (what the old code picked).

-- Which workspace each user has open. Read and written only through the
-- functions below (RLS on, no policies).
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active_workspace_id uuid references public.workspaces (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index user_settings_active_workspace_id_idx on public.user_settings (active_workspace_id);

alter table public.user_settings enable row level security;

-- The open workspace: the saved choice if the user is still a member of it,
-- else their oldest workspace.
create or replace function private.active_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select s.active_workspace_id
      from public.user_settings s
      join public.workspace_members m
        on m.workspace_id = s.active_workspace_id and m.user_id = s.user_id
      where s.user_id = (select auth.uid())
    ),
    (
      select m.workspace_id
      from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
      where m.user_id = (select auth.uid())
      order by w.created_at, w.id
      limit 1
    )
  );
$$;

revoke all on function private.active_workspace_id() from public;

create or replace function private.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from (select private.active_workspace_id() as id) a
  where a.id is not null;
$$;

revoke all on function private.user_workspace_ids() from public;
grant execute on function private.user_workspace_ids() to authenticated;

-- All workspaces of the user, for the switcher.
create or replace function public.my_workspaces()
returns table (id uuid, name text, role text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, m.role, w.id = private.active_workspace_id()
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid())
  order by w.created_at, w.id;
$$;

-- Open another workspace (only one the user is a member of).
create or replace function public.switch_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = uid
  ) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  insert into public.user_settings (user_id, active_workspace_id)
  values (uid, p_workspace_id)
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();
end;
$$;

-- New empty workspace: the user is its owner and it opens right away.
-- Timezone copied from the workspace that is open now. Max 50 per user.
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws_name text := trim(coalesce(p_name, ''));
  ws_tz text;
  ws_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if char_length(ws_name) not between 1 and 100 then
    raise exception 'Workspace name must be 1-100 characters' using errcode = '22023';
  end if;
  -- One at a time per user, so the limit can't be passed with parallel calls.
  perform pg_advisory_xact_lock(hashtextextended('create_workspace:' || uid::text, 0));
  if (select count(*) from public.workspace_members m where m.user_id = uid) >= 50 then
    raise exception 'Workspace limit reached' using errcode = '54000';
  end if;

  select w.timezone into ws_tz from public.workspaces w where w.id = private.active_workspace_id();

  insert into public.workspaces (name, timezone)
  values (ws_name, coalesce(ws_tz, 'UTC'))
  returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, uid, 'owner');

  insert into public.user_settings (user_id, active_workspace_id)
  values (uid, ws_id)
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();

  return ws_id;
end;
$$;

-- Delete a workspace and everything in it (leads, campaigns, inboxes, Unibox,
-- stats). Owner only, and never the user's last workspace.
create or replace function public.delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = uid and m.role = 'owner'
  ) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.workspace_members m where m.user_id = uid) <= 1 then
    raise exception 'You cannot delete your only workspace' using errcode = '22023';
  end if;

  delete from public.workspaces w where w.id = p_workspace_id;
end;
$$;

revoke all on function public.my_workspaces() from public, anon;
revoke all on function public.switch_workspace(uuid) from public, anon;
revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.delete_workspace(uuid) from public, anon;
grant execute on function public.my_workspaces() to authenticated;
grant execute on function public.switch_workspace(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.delete_workspace(uuid) to authenticated;

-- One inbox (email address) can be connected in only ONE workspace in the
-- whole app, so its replies always land in one place.
alter table public.email_accounts drop constraint email_accounts_workspace_id_email_key;
create unique index email_accounts_email_key on public.email_accounts (email);
create index email_accounts_workspace_id_idx on public.email_accounts (workspace_id);
