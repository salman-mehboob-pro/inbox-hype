-- Core: workspaces, members, helper functions, signup trigger.
-- Every app table is scoped to a workspace. RLS uses private.user_workspace_ids().

create extension if not exists citext with schema extensions;

-- Private schema: not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- updated_at helper
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Workspaces ---------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function private.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

-- Workspaces the current user belongs to. SECURITY DEFINER so policies on
-- workspace_members don't recurse.
create or replace function private.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid());
$$;

revoke all on function private.user_workspace_ids() from public;
grant execute on function private.user_workspace_ids() to authenticated;

-- RLS ------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "members can view their workspaces"
  on public.workspaces for select to authenticated
  using (id in (select private.user_workspace_ids()));

create policy "members can update their workspaces"
  on public.workspaces for update to authenticated
  using (id in (select private.user_workspace_ids()))
  with check (id in (select private.user_workspace_ids()));

create policy "members can view workspace members"
  on public.workspace_members for select to authenticated
  using (workspace_id in (select private.user_workspace_ids()));

-- Signup: create one workspace per new user ----------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  ws_name text;
begin
  ws_name := left(
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'workspace_name'), ''),
      split_part(new.email, '@', 1) || '''s workspace'
    ),
    100
  );

  insert into public.workspaces (name) values (ws_name) returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
