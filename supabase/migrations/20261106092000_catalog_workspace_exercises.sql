-- F16 T008: workspace-owned exercises and per-workspace mappings for a
-- canonical global exercise identity. Every dependent key carries workspace_id.
create table public.workspace_exercises (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  id uuid not null default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'removed', 'merged')),
  current_version integer not null,
  primary key (workspace_id, id),
  unique (workspace_id, id)
);

create table public.workspace_exercise_versions (
  workspace_id uuid not null,
  workspace_exercise_id uuid not null,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, workspace_exercise_id, version),
  foreign key (workspace_id, workspace_exercise_id)
    references public.workspace_exercises(workspace_id, id) on delete restrict
);

alter table public.workspace_exercises add constraint workspace_exercises_current_version_fk
  foreign key (workspace_id, id, current_version)
  references public.workspace_exercise_versions(workspace_id, workspace_exercise_id, version)
  deferrable initially deferred;

create table public.exercise_variations (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'removed', 'merged')),
  current_version integer not null,
  primary key (workspace_id, exercise_id),
  unique (workspace_id, exercise_id)
);

create table public.exercise_variation_versions (
  workspace_id uuid not null,
  exercise_id uuid not null,
  version integer not null check (version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, exercise_id, version),
  foreign key (workspace_id, exercise_id)
    references public.exercise_variations(workspace_id, exercise_id) on delete restrict
);

alter table public.exercise_variations add constraint exercise_variations_current_version_fk
  foreign key (workspace_id, exercise_id, current_version)
  references public.exercise_variation_versions(workspace_id, exercise_id, version)
  deferrable initially deferred;

create index workspace_exercise_versions_workspace_idx on public.workspace_exercise_versions(workspace_id, workspace_exercise_id);
create index exercise_variations_canonical_idx on public.exercise_variations(exercise_id, workspace_id);
create index exercise_variation_versions_workspace_idx on public.exercise_variation_versions(workspace_id, exercise_id);

alter table public.workspace_exercises enable row level security;
alter table public.workspace_exercises force row level security;
alter table public.workspace_exercise_versions enable row level security;
alter table public.workspace_exercise_versions force row level security;
alter table public.exercise_variations enable row level security;
alter table public.exercise_variations force row level security;
alter table public.exercise_variation_versions enable row level security;
alter table public.exercise_variation_versions force row level security;

create policy workspace_exercises_scope_read on public.workspace_exercises
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy workspace_exercise_versions_scope_read on public.workspace_exercise_versions
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy exercise_variations_scope_read on public.exercise_variations
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));
create policy exercise_variation_versions_scope_read on public.exercise_variation_versions
  for select to authenticated using ((select app_private.has_workspace_access(workspace_id, 'coaching_work')));

revoke all on public.workspace_exercises, public.workspace_exercise_versions,
  public.exercise_variations, public.exercise_variation_versions
  from public, anon, authenticated, service_role;
grant select on public.workspace_exercises, public.workspace_exercise_versions,
  public.exercise_variations, public.exercise_variation_versions to authenticated;
