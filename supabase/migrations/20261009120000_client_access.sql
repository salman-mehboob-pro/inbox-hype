-- Clients and admin (multi-tenant).
-- * App admins (Buildberg) see and open EVERY workspace. Set by hand:
--     insert into private.app_admins (user_id) values ('<user id>');
-- * Everyone else (clients) sees only the workspaces they are a member of.
-- * Only admins create, rename and delete workspaces and add / remove people.
-- * No public sign-up: a new account no longer gets its own workspace. People
--   get access only when an admin adds them to a workspace.
-- RLS keeps working through private.user_workspace_ids() (the open workspace).

create table private.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.app_admins enable row level security;
revoke all on table private.app_admins from public, anon, authenticated;

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.app_admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function private.is_app_admin() from public;
grant execute on function private.is_app_admin() to authenticated;

-- For the app: is the logged-in user an admin?
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_app_admin();
$$;

-- The open workspace: the saved choice if the user may still open it (member,
-- or admin), else their oldest membership, else (admin) the oldest workspace.
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
      where s.user_id = (select auth.uid())
        and s.active_workspace_id is not null
        and (
          private.is_app_admin()
          or exists (
            select 1 from public.workspace_members m
            where m.workspace_id = s.active_workspace_id and m.user_id = s.user_id
          )
        )
    ),
    (
      select m.workspace_id
      from public.workspace_members m
      join public.workspaces w on w.id = m.workspace_id
      where m.user_id = (select auth.uid())
      order by w.created_at, w.id
      limit 1
    ),
    (
      select w.id
      from public.workspaces w
      where private.is_app_admin()
      order by w.created_at, w.id
      limit 1
    )
  );
$$;

-- The workspaces for the switcher: admin = all, client = their own.
-- role: the membership role, or 'admin' for an admin who is not a member.
create or replace function public.my_workspaces()
returns table (id uuid, name text, role text, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid, private.is_app_admin() as is_admin, private.active_workspace_id() as active
  )
  select w.id, w.name, coalesce(m.role, 'admin'), w.id = me.active
  from me
  join public.workspaces w on true
  left join public.workspace_members m on m.workspace_id = w.id and m.user_id = me.uid
  where m.user_id is not null or me.is_admin
  order by w.created_at, w.id;
$$;

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
  if not (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id and m.user_id = uid
    )
    or (private.is_app_admin() and exists (select 1 from public.workspaces w where w.id = p_workspace_id))
  ) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  insert into public.user_settings (user_id, active_workspace_id)
  values (uid, p_workspace_id)
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();
end;
$$;

-- New empty workspace (admin only). The admin is its owner and it opens right away.
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
  if uid is null or not private.is_app_admin() then
    raise exception 'Only an admin can create workspaces' using errcode = '42501';
  end if;
  if char_length(ws_name) not between 1 and 100 then
    raise exception 'Workspace name must be 1-100 characters' using errcode = '22023';
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

-- Delete a workspace and everything in it (admin only, never the last one in the app).
create or replace function public.delete_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_app_admin() then
    raise exception 'Only an admin can delete workspaces' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.workspaces) <= 1 then
    raise exception 'You cannot delete the only workspace' using errcode = '22023';
  end if;

  delete from public.workspaces w where w.id = p_workspace_id;
end;
$$;

-- Only admins rename workspaces.
drop policy "members can update their workspaces" on public.workspaces;
create policy "admins can update workspaces"
  on public.workspaces for update to authenticated
  using (id in (select private.user_workspace_ids()) and (select private.is_app_admin()))
  with check (id in (select private.user_workspace_ids()) and (select private.is_app_admin()));

-- People with access to the OPEN workspace (admin only).
-- signed_in = false: the person never logged in yet (invite pending).
create or replace function public.workspace_member_list()
returns table (user_id uuid, email text, role text, is_admin boolean, added_at timestamptz, signed_in boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Only an admin can see the people of a workspace' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role,
           exists (select 1 from private.app_admins a where a.user_id = m.user_id),
           m.created_at, u.last_sign_in_at is not null
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = private.active_workspace_id()
    order by m.created_at, u.email;
end;
$$;

-- Give an existing account access to the OPEN workspace as a client (admin only).
-- Returns false when it already had access.
create or replace function public.add_workspace_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid := private.active_workspace_id();
  added integer;
begin
  if not private.is_app_admin() then
    raise exception 'Only an admin can add people' using errcode = '42501';
  end if;
  if ws is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, p_user_id, 'member')
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;

-- Take away someone's access to the OPEN workspace (admin only, not yourself).
-- Their account stays; with no workspace left they see a "no access" page.
create or replace function public.remove_workspace_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_app_admin() then
    raise exception 'Only an admin can remove people' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot remove yourself' using errcode = '22023';
  end if;
  delete from public.workspace_members m
  where m.workspace_id = private.active_workspace_id() and m.user_id = p_user_id;
end;
$$;

-- Account id for an email (server only: the invite step runs with the service role).
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.is_app_admin() from public, anon;
revoke all on function public.workspace_member_list() from public, anon;
revoke all on function public.add_workspace_member(uuid) from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.workspace_member_list() to authenticated;
grant execute on function public.add_workspace_member(uuid) to authenticated;
grant execute on function public.remove_workspace_member(uuid) to authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- No public sign-up: new accounts get no workspace of their own.
drop trigger on_auth_user_created on auth.users;
drop function private.handle_new_user();

-- The first admin: the Buildberg test account (more admins are added by hand).
insert into private.app_admins (user_id)
select u.id from auth.users u where u.email = 'test-owner@foxreach.test'
on conflict do nothing;
