-- FR-014: serialize all approved Platform Owner mutations through one row.
-- The locking read sees the current count after waiting instead of relying on
-- the stale statement snapshot held by the outer staff_profiles mutation.
create table app_private.f3_platform_owner_state (
  singleton boolean primary key default true check (singleton),
  owner_count bigint not null check (owner_count >= 0)
);
insert into app_private.f3_platform_owner_state (singleton, owner_count)
select true, count(*)
from public.staff_profiles
where role = 'platform_owner'::public.staff_role;
revoke all on app_private.f3_platform_owner_state
  from public, anon, authenticated, service_role;

create function app_private.f3_guard_platform_owner_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_delta integer := 0;
  current_count bigint;
begin
  if tg_op = 'INSERT' then
    if new.role = 'platform_owner'::public.staff_role then owner_delta := 1; end if;
  elsif tg_op = 'DELETE' then
    if old.role = 'platform_owner'::public.staff_role then owner_delta := -1; end if;
  elsif old.role is distinct from new.role then
    if old.role = 'platform_owner'::public.staff_role then owner_delta := owner_delta - 1; end if;
    if new.role = 'platform_owner'::public.staff_role then owner_delta := owner_delta + 1; end if;
  end if;

  if owner_delta <> 0 then
    select owner_count into current_count
    from app_private.f3_platform_owner_state
    where singleton
    for update;
    if not found or current_count + owner_delta < 1 then
      raise exception using errcode = '42501', message = 'not_permitted';
    end if;
    update app_private.f3_platform_owner_state
    set owner_count = current_count + owner_delta
    where singleton;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
alter function app_private.f3_guard_platform_owner_profile_change() owner to postgres;
revoke all on function app_private.f3_guard_platform_owner_profile_change()
  from public, anon, authenticated, service_role;
create trigger staff_profiles_00_owner_count_guard
  before insert or delete or update of role on public.staff_profiles
  for each row execute function app_private.f3_guard_platform_owner_profile_change();

-- Membership revocation stays in the shared serialization path by decision,
-- although S37-Q5 means it never changes the role-based owner count.
create function app_private.f3_lock_platform_owner_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.revoked_at is null and new.revoked_at is not null then
    perform 1 from app_private.f3_platform_owner_state where singleton for update;
  end if;
  return new;
end;
$$;
alter function app_private.f3_lock_platform_owner_state() owner to postgres;
revoke all on function app_private.f3_lock_platform_owner_state()
  from public, anon, authenticated, service_role;
create trigger workspace_memberships_00_owner_count_lock
  before update on public.workspace_memberships
  for each row execute function app_private.f3_lock_platform_owner_state();

-- FR-013: expose only the approved roster projection to a current Workspace Owner.
create function public.f3_workspace_owner_roster(p_workspace_id uuid)
returns table (
  user_id uuid,
  role public.staff_role,
  workspace_id uuid,
  granted_at timestamptz,
  revoked_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select member.user_id, profile.role, member.workspace_id,
         member.granted_at, member.revoked_at
  from public.workspace_memberships as member
  join public.staff_profiles as profile on profile.user_id = member.user_id
  where member.workspace_id = p_workspace_id
    and member.revoked_at is null
    and exists (
      select 1
      from public.staff_profiles as actor_profile
      join public.workspace_memberships as actor_membership
        on actor_membership.user_id = actor_profile.user_id
      where actor_profile.user_id = auth.uid()
        and actor_profile.role = 'workspace_owner'::public.staff_role
        and actor_membership.workspace_id = p_workspace_id
        and actor_membership.revoked_at is null
    );
$$;
alter function public.f3_workspace_owner_roster(uuid) owner to postgres;
revoke all on function public.f3_workspace_owner_roster(uuid)
  from public, anon, service_role;
grant execute on function public.f3_workspace_owner_roster(uuid) to authenticated;

-- FR-015: remove trainer workspace access without deleting identities or history.
create function public.f3_deactivate_trainer(p_trainer_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner()
    or p_trainer_user_id is null
    or not exists (
      select 1 from public.staff_profiles
      where user_id = p_trainer_user_id
        and role = 'trainer'::public.staff_role
    ) then
    raise exception using errcode = '42501', message = 'not_permitted';
  end if;

  update public.workspace_memberships
  set revoked_at = pg_catalog.now(), revoked_by = auth.uid()
  where user_id = p_trainer_user_id and revoked_at is null;
end;
$$;
alter function public.f3_deactivate_trainer(uuid) owner to postgres;
revoke all on function public.f3_deactivate_trainer(uuid)
  from public, anon, service_role;
grant execute on function public.f3_deactivate_trainer(uuid) to authenticated;
