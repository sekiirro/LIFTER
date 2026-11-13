-- F16 T090: storage prerequisite for the Global and workspace-private detail
-- validators in T074/T075. Validation of Notes/Defaults payload values remains
-- in those tasks; this migration defines nullable version storage and the
-- immutable, bounded Alternatives child rows.
alter table public.exercise_versions
  add column notes text,
  add column default_rest_time integer,
  add column default_rir smallint,
  add column default_reps jsonb;

alter table public.workspace_exercise_versions
  add column notes text,
  add column default_rest_time integer,
  add column default_rir smallint,
  add column default_reps jsonb;

comment on column public.exercise_versions.default_rest_time is
  'Optional canonical Default Rest Time value; bounds are validated by T074 (F16 FR-003).';
comment on column public.exercise_versions.default_rir is
  'Optional canonical Default RIR value; bounds are validated by T074 (F16 FR-003).';
comment on column public.exercise_versions.default_reps is
  'Optional canonical Default Reps scalar or range; shape is validated by T074 (F16 FR-003).';
comment on column public.workspace_exercise_versions.default_rest_time is
  'Optional workspace-private Default Rest Time value; bounds are validated by T075 (F16 FR-003).';
comment on column public.workspace_exercise_versions.default_rir is
  'Optional workspace-private Default RIR value; bounds are validated by T075 (F16 FR-003).';
comment on column public.workspace_exercise_versions.default_reps is
  'Optional workspace-private Default Reps scalar or range; shape is validated by T075 (F16 FR-003).';

create table public.exercise_version_alternatives (
  exercise_id uuid not null,
  version integer not null check (version > 0),
  position smallint not null check (position between 1 and 3),
  global_exercise_id uuid not null,
  primary key (exercise_id, version, position),
  constraint exercise_version_alternatives_parent_fk
    foreign key (exercise_id, version)
    references public.exercise_versions(exercise_id, version) on delete restrict,
  constraint exercise_version_alternatives_global_target_fk
    foreign key (global_exercise_id) references public.exercises(id) on delete restrict,
  constraint exercise_version_alternatives_unique_target
    unique (exercise_id, version, global_exercise_id)
);

create table public.workspace_exercise_version_alternatives (
  workspace_id uuid not null,
  workspace_exercise_id uuid not null,
  version integer not null check (version > 0),
  position smallint not null check (position between 1 and 3),
  global_exercise_id uuid,
  alternative_workspace_exercise_id uuid,
  primary key (workspace_id, workspace_exercise_id, version, position),
  constraint workspace_exercise_version_alternatives_one_target_check
    check (num_nonnulls(global_exercise_id, alternative_workspace_exercise_id) = 1),
  constraint workspace_exercise_version_alternatives_parent_fk
    foreign key (workspace_id, workspace_exercise_id, version)
    references public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version) on delete restrict,
  constraint workspace_exercise_version_alternatives_global_target_fk
    foreign key (global_exercise_id) references public.exercises(id) on delete restrict,
  constraint workspace_exercise_version_alternatives_private_target_fk
    foreign key (workspace_id, alternative_workspace_exercise_id)
    references public.workspace_exercises(workspace_id, id) on delete restrict,
  constraint workspace_exercise_version_alternatives_unique_global
    unique (workspace_id, workspace_exercise_id, version, global_exercise_id),
  constraint workspace_exercise_version_alternatives_unique_private
    unique (workspace_id, workspace_exercise_id, version, alternative_workspace_exercise_id)
);

create index workspace_exercise_version_alternatives_private_target_idx
  on public.workspace_exercise_version_alternatives(workspace_id, alternative_workspace_exercise_id)
  where alternative_workspace_exercise_id is not null;

create function app_private.validate_exercise_version_alternative()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_state text;
begin
  select e.lifecycle_state into target_state
    from public.exercises e where e.id = new.global_exercise_id;
  if target_state is distinct from 'active' then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.validate_exercise_version_alternative() owner to postgres;
revoke all on function app_private.validate_exercise_version_alternative() from public, anon, authenticated, service_role;

create function app_private.validate_workspace_exercise_version_alternative()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_state text;
begin
  if new.global_exercise_id is not null then
    select e.lifecycle_state into target_state
      from public.exercises e where e.id = new.global_exercise_id;
  else
    select e.lifecycle_state into target_state
      from public.workspace_exercises e
      where e.workspace_id = new.workspace_id and e.id = new.alternative_workspace_exercise_id;
  end if;
  if target_state is distinct from 'active' then
    raise exception 'catalog_exercise_alternatives_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;
alter function app_private.validate_workspace_exercise_version_alternative() owner to postgres;
revoke all on function app_private.validate_workspace_exercise_version_alternative() from public, anon, authenticated, service_role;

create trigger exercise_version_alternatives_active_target
  before insert on public.exercise_version_alternatives
  for each row execute function app_private.validate_exercise_version_alternative();
create trigger exercise_version_alternatives_append_only
  before update or delete on public.exercise_version_alternatives
  for each row execute function app_private.reject_catalog_version_mutation();
create trigger exercise_version_alternatives_no_truncate
  before truncate on public.exercise_version_alternatives
  for each statement execute function app_private.reject_catalog_version_mutation();
create trigger workspace_exercise_version_alternatives_active_target
  before insert on public.workspace_exercise_version_alternatives
  for each row execute function app_private.validate_workspace_exercise_version_alternative();
create trigger workspace_exercise_version_alternatives_append_only
  before update or delete on public.workspace_exercise_version_alternatives
  for each row execute function app_private.reject_catalog_version_mutation();
create trigger workspace_exercise_version_alternatives_no_truncate
  before truncate on public.workspace_exercise_version_alternatives
  for each statement execute function app_private.reject_catalog_version_mutation();

alter table public.exercise_version_alternatives enable row level security;
alter table public.exercise_version_alternatives force row level security;
alter table public.workspace_exercise_version_alternatives enable row level security;
alter table public.workspace_exercise_version_alternatives force row level security;
create policy exercise_version_alternatives_global_read
  on public.exercise_version_alternatives for select to authenticated
  using ((select app_private.catalog_can_read_global()));
create policy workspace_exercise_version_alternatives_scope_read
  on public.workspace_exercise_version_alternatives for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
revoke all on public.exercise_version_alternatives, public.workspace_exercise_version_alternatives
  from public, anon, authenticated, service_role;
grant select on public.exercise_version_alternatives, public.workspace_exercise_version_alternatives to authenticated;
