-- F16 T007: global identities, version pointers, immutable versions, and
-- privacy-safe initial global read projections.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'removed', 'merged')),
  superseded_by uuid,
  current_version integer not null
);

create table public.exercise_versions (
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (exercise_id, version)
);

alter table public.exercises add constraint exercises_current_version_fk
  foreign key (id, current_version)
  references public.exercise_versions(exercise_id, version)
  deferrable initially deferred;

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  origin_workspace_id uuid references public.workspaces(id) on delete restrict,
  created_at timestamptz not null default now(),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'removed', 'merged')),
  superseded_by uuid,
  current_version integer not null
);

create table public.food_versions (
  food_id uuid not null references public.foods(id) on delete restrict,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (food_id, version)
);

alter table public.foods add constraint foods_current_version_fk
  foreign key (id, current_version)
  references public.food_versions(food_id, version)
  deferrable initially deferred;

create function app_private.catalog_can_read_global()
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    app_private.is_platform_owner()
    or (
      app_private.role_has_capability(app_private.current_staff_role(), 'coaching_work')
      and exists (
        select 1 from public.workspace_memberships m
        where m.user_id = auth.uid() and m.revoked_at is null
      )
    )
  );
$$;
alter function app_private.catalog_can_read_global() owner to postgres;
revoke all on function app_private.catalog_can_read_global() from public, anon, service_role;
grant execute on function app_private.catalog_can_read_global() to authenticated;

create function app_private.reject_catalog_version_mutation()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'catalog_version_immutable';
end;
$$;
alter function app_private.reject_catalog_version_mutation() owner to postgres;
revoke all on function app_private.reject_catalog_version_mutation() from public, anon, authenticated, service_role;

create function app_private.reject_catalog_provenance_change()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_catalog.to_jsonb(new) -> 'created_by' is distinct from pg_catalog.to_jsonb(old) -> 'created_by'
    or pg_catalog.to_jsonb(new) -> 'origin_workspace_id' is distinct from pg_catalog.to_jsonb(old) -> 'origin_workspace_id' then
    raise exception using errcode = '23514', message = 'catalog_provenance_immutable';
  end if;
  return new;
end;
$$;
alter function app_private.reject_catalog_provenance_change() owner to postgres;
revoke all on function app_private.reject_catalog_provenance_change() from public, anon, authenticated, service_role;

create trigger exercise_versions_append_only before update or delete on public.exercise_versions
  for each row execute function app_private.reject_catalog_version_mutation();
create trigger food_versions_append_only before update or delete on public.food_versions
  for each row execute function app_private.reject_catalog_version_mutation();
create trigger exercises_provenance_immutable before update on public.exercises
  for each row execute function app_private.reject_catalog_provenance_change();
create trigger foods_provenance_immutable before update on public.foods
  for each row execute function app_private.reject_catalog_provenance_change();
create trigger taxonomy_term_versions_append_only before update or delete on public.taxonomy_term_versions
  for each row execute function app_private.reject_catalog_version_mutation();

alter table public.exercises enable row level security;
alter table public.exercises force row level security;
alter table public.exercise_versions enable row level security;
alter table public.exercise_versions force row level security;
alter table public.foods enable row level security;
alter table public.foods force row level security;
alter table public.food_versions enable row level security;
alter table public.food_versions force row level security;

create policy exercises_global_read on public.exercises for select to authenticated
  using ((select app_private.catalog_can_read_global()));
create policy exercise_versions_global_read on public.exercise_versions for select to authenticated
  using ((select app_private.catalog_can_read_global()));
create policy foods_global_read on public.foods for select to authenticated
  using ((select app_private.catalog_can_read_global()));
create policy food_versions_global_read on public.food_versions for select to authenticated
  using ((select app_private.catalog_can_read_global()));

revoke all on public.exercises, public.exercise_versions, public.foods, public.food_versions from public, anon, authenticated, service_role;
grant select (id, created_at, lifecycle_state, superseded_by, current_version) on public.exercises to authenticated;
grant select (exercise_id, version, payload, created_at) on public.exercise_versions to authenticated;
grant select (id, created_at, lifecycle_state, superseded_by, current_version) on public.foods to authenticated;
grant select (food_id, version, payload, created_at) on public.food_versions to authenticated;

create view public.catalog_foods_safe with (security_barrier = true) as
  select f.id, f.current_version, f.lifecycle_state, f.created_at,
    case when app_private.is_platform_owner() then f.created_by else null::uuid end as created_by,
    case when app_private.is_platform_owner() then f.origin_workspace_id else null::uuid end as origin_workspace_id
  from public.foods f
  where app_private.catalog_can_read_global();

create view public.catalog_food_versions_safe with (security_barrier = true) as
  select v.food_id, v.version, v.payload, v.created_at,
    case when app_private.is_platform_owner() then f.created_by else null::uuid end as created_by,
    case when app_private.is_platform_owner() then f.origin_workspace_id else null::uuid end as origin_workspace_id
  from public.food_versions v
  join public.foods f on f.id = v.food_id
  where app_private.catalog_can_read_global();

alter view public.catalog_foods_safe owner to postgres;
alter view public.catalog_food_versions_safe owner to postgres;
revoke all on public.catalog_foods_safe, public.catalog_food_versions_safe from public, anon, service_role;
grant select on public.catalog_foods_safe, public.catalog_food_versions_safe to authenticated;
