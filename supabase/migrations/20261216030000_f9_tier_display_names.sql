-- Task: T078. FR: FR-035, SC-025.
-- PO global per-locale tier display-name renames and Workspace Owner
-- workspace-local overrides. Resolution is override > global rename >
-- PO-approved default (defaults stay the shipped lib constants). No rank,
-- price, duration, currency or other commercial term is touched. No audit
-- action is specified for renames (FR-011 enumerates creation, publication
-- and availability only), so no audit row is emitted (MCQ-S67-T078-3).
create table public.package_tier_names (
  tier_rank smallint not null check (tier_rank in (1,2,3)),
  locale text not null check (locale in ('ar','en')),
  name text not null check (char_length(btrim(name)) >= 1 and name ~ '[^[:space:]]'),
  updated_by uuid not null default auth.uid() references public.staff_profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint package_tier_names_identity_key unique (tier_rank, locale)
);
alter table public.package_tier_names owner to postgres;
create table public.package_tier_name_overrides (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tier_rank smallint not null check (tier_rank in (1,2,3)),
  locale text not null check (locale in ('ar','en')),
  name text not null check (char_length(btrim(name)) >= 1 and name ~ '[^[:space:]]'),
  updated_by uuid not null default auth.uid() references public.staff_profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint package_tier_name_overrides_identity_key unique (workspace_id, tier_rank, locale)
);
alter table public.package_tier_name_overrides owner to postgres;

-- RPC-only access: no API role holds any table privilege or policy.
alter table public.package_tier_names enable row level security;
alter table public.package_tier_names force row level security;
revoke all on public.package_tier_names from public, anon, authenticated, service_role;
alter table public.package_tier_name_overrides enable row level security;
alter table public.package_tier_name_overrides force row level security;
revoke all on public.package_tier_name_overrides from public, anon, authenticated, service_role;

-- Renaming never deletes; no authorized delete path exists.
create trigger package_tier_names_no_delete before delete on public.package_tier_names
  for each row execute function app_private.forbid_delete();
create trigger package_tier_names_no_truncate before truncate on public.package_tier_names
  for each statement execute function app_private.forbid_delete();
create trigger package_tier_name_overrides_no_delete before delete on public.package_tier_name_overrides
  for each row execute function app_private.forbid_delete();
create trigger package_tier_name_overrides_no_truncate before truncate on public.package_tier_name_overrides
  for each statement execute function app_private.forbid_delete();

-- Identity (rank/locale/workspace target) is immutable; a rename only sets
-- the label. The actor wall re-checks the signed identity independently of
-- the calling RPC (FR-010 second wall).
create function app_private.guard_package_tier_name_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tier_rank is distinct from old.tier_rank or new.locale is distinct from old.locale then
    raise exception 'immutable' using errcode = '23514';
  end if;
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
alter function app_private.guard_package_tier_name_update() owner to postgres;
revoke execute on function app_private.guard_package_tier_name_update() from public, anon, authenticated, service_role;
create trigger package_tier_names_guard before update on public.package_tier_names
  for each row execute function app_private.guard_package_tier_name_update();

create function app_private.guard_package_tier_name_override_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.tier_rank is distinct from old.tier_rank or new.locale is distinct from old.locale then
    raise exception 'immutable' using errcode = '23514';
  end if;
  -- FR-035 grants the override to the Workspace Owner of that workspace
  -- only; the PO's granted power is the global rename (fail-closed).
  if auth.uid() is null or app_private.current_staff_role() is distinct from 'workspace_owner'::public.staff_role
    or not app_private.has_workspace_access(new.workspace_id, null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return new;
end;
$$;
alter function app_private.guard_package_tier_name_override_update() owner to postgres;
revoke execute on function app_private.guard_package_tier_name_override_update() from public, anon, authenticated, service_role;
create trigger package_tier_name_overrides_guard before update on public.package_tier_name_overrides
  for each row execute function app_private.guard_package_tier_name_override_update();

-- PO-only global per-locale rename. Non-blank label; no length cap is
-- specified (MCQ-S67-T078-2).
create function public.set_package_tier_name(tier_rank smallint, locale text, name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.is_platform_owner() then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if tier_rank is null or tier_rank not between 1 and 3
    or locale is null or locale not in ('ar','en')
    or name is null or char_length(btrim(name)) < 1 or name !~ '[^[:space:]]' then
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

-- Workspace Owner override inside that owner's workspace only. The PO,
-- Sales, Trainers, revoked members, non-staff and anonymous are denied
-- before any validation or target lookup, with no existence disclosure.
create function public.set_package_tier_name_override(workspace_id uuid, tier_rank smallint, locale text, name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or app_private.current_staff_role() is distinct from 'workspace_owner'::public.staff_role
    or workspace_id is null or not app_private.has_workspace_access(workspace_id, null) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  if tier_rank is null or tier_rank not between 1 and 3
    or locale is null or locale not in ('ar','en')
    or name is null or char_length(btrim(name)) < 1 or name !~ '[^[:space:]]' then
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

-- Resolved read under the FR-008 packages read scope. Returns all six
-- rank x locale rows; name is null when neither an override nor a global
-- rename exists, leaving the PO-approved default authoritative.
create function public.get_package_tier_names(workspace_id uuid)
returns table(tier_rank smallint, locale text, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or workspace_id is null
    or not app_private.has_workspace_access(workspace_id, 'generate_registration_link')
    or not exists (select 1 from public.workspaces w where w.id = get_package_tier_names.workspace_id) then
    raise exception 'not_permitted' using errcode = '42501';
  end if;
  return query
    select r.tier_rank, r.locale, coalesce(o.name, g.name) as name
    from (values (1::smallint,'ar'::text),(2::smallint,'ar'::text),(3::smallint,'ar'::text),
                 (1::smallint,'en'::text),(2::smallint,'en'::text),(3::smallint,'en'::text)) as r(tier_rank, locale)
    left join public.package_tier_name_overrides o
      on o.workspace_id = get_package_tier_names.workspace_id
      and o.tier_rank = r.tier_rank and o.locale = r.locale
    left join public.package_tier_names g
      on g.tier_rank = r.tier_rank and g.locale = r.locale
    order by r.tier_rank, r.locale;
end;
$$;
alter function public.get_package_tier_names(uuid) owner to postgres;
revoke execute on function public.get_package_tier_names(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_package_tier_names(uuid) to authenticated;
