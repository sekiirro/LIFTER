-- Task: T079. FR: FR-035, SC-025.
-- Apply the package publication-name rule to tier labels and grant the PO
-- workspace override authority approved by S67-PO-10. Rename audit behavior
-- remains unchanged: no audit rows are emitted.

alter table public.package_tier_names
  drop constraint package_tier_names_name_check,
  add constraint package_tier_names_name_check
    check (char_length(name) between 1 and 120
      and char_length(btrim(name)) >= 1 and name ~ '[^[:space:]]');

alter table public.package_tier_name_overrides
  drop constraint package_tier_name_overrides_name_check,
  add constraint package_tier_name_overrides_name_check
    check (char_length(name) between 1 and 120
      and char_length(btrim(name)) >= 1 and name ~ '[^[:space:]]');

create or replace function app_private.guard_package_tier_name_override_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.tier_rank is distinct from old.tier_rank or new.locale is distinct from old.locale then
    raise exception 'immutable' using errcode = '23514';
  end if;
  if auth.uid() is null or not (
    app_private.is_platform_owner()
    or (app_private.current_staff_role() = 'workspace_owner'::public.staff_role
      and app_private.has_workspace_access(new.workspace_id, null))
  ) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
alter function app_private.guard_package_tier_name_override_update() owner to postgres;
revoke execute on function app_private.guard_package_tier_name_override_update() from public, anon, authenticated, service_role;

create or replace function public.set_package_tier_name(tier_rank smallint, locale text, name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if tier_rank is null or tier_rank not between 1 and 3
    or locale is null or locale not in ('ar','en')
    or name is null or char_length(name) not between 1 and 120
    or char_length(btrim(name)) < 1 or name !~ '[^[:space:]]' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.package_tier_names(tier_rank, locale, name, updated_by)
  values (set_package_tier_name.tier_rank, set_package_tier_name.locale, set_package_tier_name.name, auth.uid())
  on conflict on constraint package_tier_names_identity_key do update
    set name = excluded.name, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
alter function public.set_package_tier_name(smallint,text,text) owner to postgres;
revoke execute on function public.set_package_tier_name(smallint,text,text) from public, anon, authenticated, service_role;
grant execute on function public.set_package_tier_name(smallint,text,text) to authenticated;

create or replace function public.set_package_tier_name_override(workspace_id uuid, tier_rank smallint, locale text, name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or workspace_id is null then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if not app_private.is_platform_owner()
    and (app_private.current_staff_role() is distinct from 'workspace_owner'::public.staff_role
      or not app_private.has_workspace_access(workspace_id, null)) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if tier_rank is null or tier_rank not between 1 and 3
    or locale is null or locale not in ('ar','en')
    or name is null or char_length(name) not between 1 and 120
    or char_length(btrim(name)) < 1 or name !~ '[^[:space:]]' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  insert into public.package_tier_name_overrides(workspace_id, tier_rank, locale, name, updated_by)
  values (set_package_tier_name_override.workspace_id, set_package_tier_name_override.tier_rank,
    set_package_tier_name_override.locale, set_package_tier_name_override.name, auth.uid())
  on conflict on constraint package_tier_name_overrides_identity_key do update
    set name = excluded.name, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
alter function public.set_package_tier_name_override(uuid,smallint,text,text) owner to postgres;
revoke execute on function public.set_package_tier_name_override(uuid,smallint,text,text) from public, anon, authenticated, service_role;
grant execute on function public.set_package_tier_name_override(uuid,smallint,text,text) to authenticated;
