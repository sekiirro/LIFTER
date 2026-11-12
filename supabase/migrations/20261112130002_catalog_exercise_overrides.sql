-- F16 T046: workspace-scoped overrides for the shared canonical exercise identity.
-- Null values in payload mean inherit the corresponding canonical value (F16-MCQ-A).
-- alternatives_present distinguishes inherited alternatives from an explicit empty list.

create table public.exercise_overrides (
  workspace_id uuid not null,
  exercise_id uuid not null,
  current_version integer not null check (current_version > 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, exercise_id),
  foreign key (workspace_id) references public.workspaces(id) on delete restrict,
  foreign key (exercise_id) references public.exercises(id) on delete restrict
);

create table public.exercise_override_versions (
  workspace_id uuid not null,
  exercise_id uuid not null,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  alternatives_present boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, exercise_id, version),
  constraint exercise_override_versions_parent_fk
    foreign key (workspace_id, exercise_id)
    references public.exercise_overrides(workspace_id, exercise_id) on delete restrict
);

alter table public.exercise_overrides
  add constraint exercise_overrides_current_version_fk
  foreign key (workspace_id, exercise_id, current_version)
  references public.exercise_override_versions(workspace_id, exercise_id, version)
  deferrable initially deferred;

comment on column public.exercise_override_versions.payload is
  'Allowlisted workspace override fields; a JSON null field value inherits the canonical field (F16-MCQ-A).';
comment on column public.exercise_override_versions.alternatives_present is
  'False inherits canonical alternatives; true with zero child rows is an explicit empty list.';

create index exercise_override_versions_workspace_idx
  on public.exercise_override_versions(workspace_id, exercise_id, version desc);

create trigger exercise_override_versions_append_only
  before update or delete on public.exercise_override_versions
  for each row execute function app_private.reject_catalog_version_mutation();

alter table public.exercise_overrides enable row level security;
alter table public.exercise_overrides force row level security;
alter table public.exercise_override_versions enable row level security;
alter table public.exercise_override_versions force row level security;

create policy exercise_overrides_scope_read on public.exercise_overrides
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy exercise_override_versions_scope_read on public.exercise_override_versions
  for select to authenticated
  using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.exercise_overrides, public.exercise_override_versions
  from public, anon, authenticated, service_role;
grant select on public.exercise_overrides, public.exercise_override_versions to authenticated;
