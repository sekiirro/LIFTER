-- FR-001, FR-002, FR-011: forward-only tenancy schema; UUID generation is built in.
create type public.staff_role as enum ('platform_owner', 'workspace_owner', 'trainer', 'sales');

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role public.staff_role not null,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.staff_profiles(user_id)
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references public.staff_profiles(user_id),
  granted_at timestamptz not null default now(),
  granted_by uuid not null references public.staff_profiles(user_id),
  revoked_at timestamptz,
  revoked_by uuid references public.staff_profiles(user_id),
  unique (workspace_id, id),
  check ((revoked_at is null) = (revoked_by is null))
);

create unique index workspace_memberships_active_unique
  on public.workspace_memberships (workspace_id, user_id) where revoked_at is null;

-- FR-003, FR-004: private helpers bypass table RLS without policy recursion.
create schema app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create function app_private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select role from public.staff_profiles where user_id = auth.uid();
$$;

create function app_private.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.current_staff_role() = 'platform_owner'::public.staff_role, false);
$$;

-- FR-006, FR-008: fixed D-09/D-10 matrix, unknown and null inputs deny.
create function app_private.role_has_capability(r public.staff_role, cap text) returns boolean
language sql immutable security definer set search_path = '' as $$
  select coalesce(case
    when cap in ('set_package_pricing', 'record_refund', 'delete_client',
                 'export_client_dataset', 'manage_workspaces', 'manage_staff_access')
      then r = 'platform_owner'::public.staff_role
    when cap = 'generate_registration_link'
      then r in ('platform_owner', 'workspace_owner', 'sales', 'trainer')
    when cap in ('configure_installment_schedule', 'approve_registration', 'record_payment', 'manage_freeze')
      then r in ('platform_owner', 'workspace_owner', 'sales')
    when cap = 'coaching_work'
      then r in ('platform_owner', 'workspace_owner', 'trainer')
    else false
  end, false);
$$;

create function app_private.has_workspace_access(ws uuid, cap text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    app_private.is_platform_owner() or (
      app_private.current_staff_role() is not null
      and exists (
        select 1 from public.workspace_memberships
        where workspace_id = ws and user_id = auth.uid() and revoked_at is null
      )
      and (cap is null or app_private.role_has_capability(app_private.current_staff_role(), cap))
    )
  );
$$;

alter function app_private.current_staff_role() owner to postgres;
alter function app_private.is_platform_owner() owner to postgres;
alter function app_private.role_has_capability(public.staff_role, text) owner to postgres;
alter function app_private.has_workspace_access(uuid, text) owner to postgres;
revoke execute on all functions in schema app_private from public, anon;
grant execute on all functions in schema app_private to authenticated;

-- FR-001, FR-005: preserve membership history for every caller, including fixtures.
create function app_private.guard_membership_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.user_id is distinct from old.user_id
    or new.granted_at is distinct from old.granted_at
    or new.granted_by is distinct from old.granted_by
    or old.revoked_at is not null
    or old.revoked_by is not null
    or new.revoked_at is null
    or new.revoked_by is null
    or (auth.uid() is not null and new.revoked_by is distinct from auth.uid()) then
    raise exception 'Membership updates may only revoke an active membership' using errcode = '23514';
  end if;
  new.revoked_at := now();
  return new;
end;
$$;
alter function app_private.guard_membership_update() owner to postgres;
revoke execute on function app_private.guard_membership_update() from public, anon;
grant execute on function app_private.guard_membership_update() to authenticated;
create trigger memberships_guard before update on public.workspace_memberships
  for each row execute function app_private.guard_membership_update();

-- FR-003, FR-005: two walls, no anonymous privileges and no application DELETE.
alter table public.staff_profiles enable row level security;
alter table public.staff_profiles force row level security;
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;

revoke all on public.staff_profiles, public.workspaces, public.workspace_memberships from public, anon, authenticated;
grant select, insert, update on public.staff_profiles, public.workspaces, public.workspace_memberships to authenticated;

create policy staff_profiles_select_self on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or app_private.is_platform_owner());
create policy staff_profiles_insert_po on public.staff_profiles for insert to authenticated
  with check (app_private.is_platform_owner());
create policy staff_profiles_update_po on public.staff_profiles for update to authenticated
  using (app_private.is_platform_owner()) with check (app_private.is_platform_owner());

create policy workspaces_select_member on public.workspaces for select to authenticated
  using (app_private.has_workspace_access(id, null));
create policy workspaces_insert_po on public.workspaces for insert to authenticated
  with check (app_private.is_platform_owner() and created_by = (select auth.uid()));
create policy workspaces_update_po on public.workspaces for update to authenticated
  using (app_private.is_platform_owner())
  with check (app_private.is_platform_owner() and created_by = (select auth.uid()));

-- FR-003: ND-F3-2 permits membership reads only to the PO and the member.
create policy workspace_memberships_select_self on public.workspace_memberships for select to authenticated
  using (user_id = (select auth.uid()) or app_private.is_platform_owner());
create policy workspace_memberships_insert_po on public.workspace_memberships for insert to authenticated
  with check (app_private.is_platform_owner() and granted_by = (select auth.uid()));
create policy workspace_memberships_update_po on public.workspace_memberships for update to authenticated
  using (app_private.is_platform_owner()) with check (app_private.is_platform_owner());
