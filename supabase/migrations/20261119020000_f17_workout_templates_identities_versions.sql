-- F17 Slice 1 (T013, T016, T017): Workout template identities and immutable versions
-- (global + workspace), with forced RLS, provenance column protection, and direct-DML denial.

create table public.workout_global_templates (
  id uuid primary key default gen_random_uuid(),
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'retired')),
  current_version integer not null check (current_version > 0),
  origin_workspace_id uuid references public.workspaces(id) on delete restrict,
  origin_workspace_template_id uuid,
  origin_workspace_template_version integer
    check (origin_workspace_template_version is null or origin_workspace_template_version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete restrict,
  constraint workout_global_templates_origin_all_or_none check (
    (origin_workspace_id is null and origin_workspace_template_id is null and origin_workspace_template_version is null)
    or (origin_workspace_id is not null and origin_workspace_template_id is not null and origin_workspace_template_version is not null)
  ),
  constraint workout_global_templates_retired_fields check (
    (lifecycle_state = 'active' and retired_at is null and retired_by is null)
    or (lifecycle_state = 'retired' and retired_at is not null and retired_by is not null)
  )
);

create table public.workout_global_template_versions (
  template_id uuid not null references public.workout_global_templates(id) on delete restrict,
  version integer not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  schema_version integer not null default 1 check (schema_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (template_id, version)
);

alter table public.workout_global_templates
  add constraint workout_global_templates_current_version_fk
  foreign key (id, current_version)
  references public.workout_global_template_versions(template_id, version)
  deferrable initially deferred;

create table public.workout_workspace_templates (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'retired')),
  current_version integer not null check (current_version > 0),
  origin_global_template_id uuid references public.workout_global_templates(id) on delete restrict,
  origin_global_template_version integer
    check (origin_global_template_version is null or origin_global_template_version > 0),
  origin_assignment_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by uuid references auth.users(id) on delete restrict,
  primary key (workspace_id, id),
  unique (workspace_id, id),
  constraint workout_workspace_templates_origin_all_or_none check (
    (origin_global_template_id is null and origin_global_template_version is null and origin_assignment_id is null)
    or (origin_global_template_id is not null and origin_global_template_version is not null and origin_assignment_id is not null)
  ),
  constraint workout_workspace_templates_origin_global_version_fk
    foreign key (origin_global_template_id, origin_global_template_version)
    references public.workout_global_template_versions(template_id, version)
    on delete restrict,
  constraint workout_workspace_templates_retired_fields check (
    (lifecycle_state = 'active' and retired_at is null and retired_by is null)
    or (lifecycle_state = 'retired' and retired_at is not null and retired_by is not null)
  )
);

create unique index workout_workspace_templates_origin_global_uidx
  on public.workout_workspace_templates(workspace_id, origin_global_template_id)
  where origin_global_template_id is not null;

create table public.workout_workspace_template_versions (
  workspace_id uuid not null,
  template_id uuid not null,
  version integer not null check (version > 0),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  schema_version integer not null default 1 check (schema_version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, template_id, version),
  foreign key (workspace_id, template_id)
    references public.workout_workspace_templates(workspace_id, id) on delete restrict
);

alter table public.workout_workspace_templates
  add constraint workout_workspace_templates_current_version_fk
  foreign key (workspace_id, id, current_version)
  references public.workout_workspace_template_versions(workspace_id, template_id, version)
  deferrable initially deferred;

alter table public.workout_global_templates
  add constraint workout_global_templates_origin_workspace_version_fk
  foreign key (origin_workspace_id, origin_workspace_template_id, origin_workspace_template_version)
  references public.workout_workspace_template_versions(workspace_id, template_id, version)
  on delete restrict;

create index workout_workspace_template_versions_workspace_idx
  on public.workout_workspace_template_versions(workspace_id, template_id);

-- Immutability & provenance guards
create function app_private.f17_reject_template_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'template_version_immutable';
end;
$$;
alter function app_private.f17_reject_template_version_mutation() owner to postgres;
revoke all on function app_private.f17_reject_template_version_mutation()
  from public, anon, authenticated, service_role;

create function app_private.f17_reject_template_identity_delete()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'template_identity_immutable';
end;
$$;
alter function app_private.f17_reject_template_identity_delete() owner to postgres;
revoke all on function app_private.f17_reject_template_identity_delete()
  from public, anon, authenticated, service_role;

create function app_private.f17_guard_template_identity_update()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'template_provenance_immutable';
  end if;

  if tg_table_name = 'workout_global_templates' then
    if pg_catalog.to_jsonb(new) -> 'origin_workspace_id' is distinct from pg_catalog.to_jsonb(old) -> 'origin_workspace_id'
      or pg_catalog.to_jsonb(new) -> 'origin_workspace_template_id' is distinct from pg_catalog.to_jsonb(old) -> 'origin_workspace_template_id'
      or pg_catalog.to_jsonb(new) -> 'origin_workspace_template_version' is distinct from pg_catalog.to_jsonb(old) -> 'origin_workspace_template_version' then
      raise exception using errcode = '23514', message = 'template_provenance_immutable';
    end if;
  elsif tg_table_name = 'workout_workspace_templates' then
    if pg_catalog.to_jsonb(new) -> 'workspace_id' is distinct from pg_catalog.to_jsonb(old) -> 'workspace_id'
      or pg_catalog.to_jsonb(new) -> 'origin_global_template_id' is distinct from pg_catalog.to_jsonb(old) -> 'origin_global_template_id'
      or pg_catalog.to_jsonb(new) -> 'origin_global_template_version' is distinct from pg_catalog.to_jsonb(old) -> 'origin_global_template_version'
      or pg_catalog.to_jsonb(new) -> 'origin_assignment_id' is distinct from pg_catalog.to_jsonb(old) -> 'origin_assignment_id' then
      raise exception using errcode = '23514', message = 'template_provenance_immutable';
    end if;
  end if;

  if new.current_version < old.current_version then
    raise exception using errcode = '23514', message = 'template_version_regression';
  end if;

  if old.lifecycle_state = 'retired' and new.lifecycle_state <> 'retired' then
    raise exception using errcode = '23514', message = 'template_retired_immutable';
  end if;

  return new;
end;
$$;
alter function app_private.f17_guard_template_identity_update() owner to postgres;
revoke all on function app_private.f17_guard_template_identity_update()
  from public, anon, authenticated, service_role;

create trigger workout_global_template_versions_immutable
  before update or delete on public.workout_global_template_versions
  for each row execute function app_private.f17_reject_template_version_mutation();
create trigger workout_global_template_versions_no_truncate
  before truncate on public.workout_global_template_versions
  for each statement execute function app_private.f17_reject_template_version_mutation();

create trigger workout_workspace_template_versions_immutable
  before update or delete on public.workout_workspace_template_versions
  for each row execute function app_private.f17_reject_template_version_mutation();
create trigger workout_workspace_template_versions_no_truncate
  before truncate on public.workout_workspace_template_versions
  for each statement execute function app_private.f17_reject_template_version_mutation();

create trigger workout_global_templates_no_delete
  before delete on public.workout_global_templates
  for each row execute function app_private.f17_reject_template_identity_delete();
create trigger workout_global_templates_no_truncate
  before truncate on public.workout_global_templates
  for each statement execute function app_private.f17_reject_template_identity_delete();
create trigger workout_global_templates_guard_update
  before update on public.workout_global_templates
  for each row execute function app_private.f17_guard_template_identity_update();

create trigger workout_workspace_templates_no_delete
  before delete on public.workout_workspace_templates
  for each row execute function app_private.f17_reject_template_identity_delete();
create trigger workout_workspace_templates_no_truncate
  before truncate on public.workout_workspace_templates
  for each statement execute function app_private.f17_reject_template_identity_delete();
create trigger workout_workspace_templates_guard_update
  before update on public.workout_workspace_templates
  for each row execute function app_private.f17_guard_template_identity_update();

-- T016: Forced RLS and isolation policies
alter table public.workout_global_templates enable row level security;
alter table public.workout_global_templates force row level security;
alter table public.workout_global_template_versions enable row level security;
alter table public.workout_global_template_versions force row level security;
alter table public.workout_workspace_templates enable row level security;
alter table public.workout_workspace_templates force row level security;
alter table public.workout_workspace_template_versions enable row level security;
alter table public.workout_workspace_template_versions force row level security;

create policy workout_global_templates_po_read
  on public.workout_global_templates for select to authenticated
  using ((select app_private.is_platform_owner()));

create policy workout_global_template_versions_po_read
  on public.workout_global_template_versions for select to authenticated
  using ((select app_private.is_platform_owner()));

create policy workout_workspace_templates_staff_read
  on public.workout_workspace_templates for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

create policy workout_workspace_template_versions_staff_read
  on public.workout_workspace_template_versions for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

-- T017: Direct-DML denial and provenance column protection
revoke all on
  public.workout_global_templates,
  public.workout_global_template_versions,
  public.workout_workspace_templates,
  public.workout_workspace_template_versions
  from public, anon, authenticated, service_role;

grant select on
  public.workout_global_templates,
  public.workout_global_template_versions,
  public.workout_workspace_template_versions
  to authenticated;

grant select (
  workspace_id,
  id,
  lifecycle_state,
  current_version,
  created_by,
  created_at,
  updated_at,
  retired_at,
  retired_by
) on public.workout_workspace_templates to authenticated;

comment on table public.workout_global_templates is
  'F17 PO-owned global workout template identities; writes only through authorized RPCs.';
comment on table public.workout_global_template_versions is
  'F17 append-only immutable global workout template versions.';
comment on table public.workout_workspace_templates is
  'F17 workspace-owned workout template identities; origin_* provenance columns are hidden from direct client SELECT.';
comment on table public.workout_workspace_template_versions is
  'F17 append-only immutable workspace workout template versions.';
