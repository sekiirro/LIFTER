-- F17 T014: Assignment runs, items, copies ledgers and per-workspace distribution state
-- (FR-010, FR-011; SC-003, SC-004) with forced RLS, immutability triggers, and PO-only select.

create table public.workout_template_assignment_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_key uuid not null,
  request_hash text not null check (pg_catalog.char_length(pg_catalog.btrim(request_hash)) > 0),
  template_selection_mode text not null
    check (template_selection_mode in ('all', 'specific', 'all_except')),
  selected_template_ids uuid[],
  excluded_template_ids uuid[],
  target_mode text not null
    check (target_mode in ('all_workspaces', 'specific_workspaces')),
  selected_workspace_ids uuid[],
  assigned_workspace_count integer not null check (assigned_workspace_count > 0),
  skipped_already_assigned_count integer not null default 0
    check (skipped_already_assigned_count >= 0),
  no_copies_workspace_count integer not null default 0
    check (no_copies_workspace_count >= 0),
  denied_workspace_count integer not null default 0
    check (denied_workspace_count >= 0),
  created_copies_count integer not null check (created_copies_count > 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
    check (pg_catalog.isfinite(created_at)),
  unique (actor_id, operation_key),
  check (
    (template_selection_mode = 'specific')
    = (selected_template_ids is not null and pg_catalog.cardinality(selected_template_ids) > 0)
  ),
  check ((template_selection_mode = 'all_except') = (excluded_template_ids is not null)),
  check (
    (target_mode = 'specific_workspaces')
    = (selected_workspace_ids is not null and pg_catalog.cardinality(selected_workspace_ids) > 0)
  )
);

create table public.workout_template_assignment_items (
  run_id uuid not null references public.workout_template_assignment_runs(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  outcome text not null
    check (outcome in ('assigned', 'skipped_already_assigned', 'no_copies', 'denied')),
  created_copy_ids uuid[] not null default '{}',
  created_at timestamptz not null default pg_catalog.clock_timestamp()
    check (pg_catalog.isfinite(created_at)),
  primary key (run_id, workspace_id),
  check (
    (outcome = 'assigned' and pg_catalog.cardinality(created_copy_ids) > 0)
    or (outcome <> 'assigned' and pg_catalog.cardinality(created_copy_ids) = 0)
  )
);

create table public.workout_template_assignment_copies (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  run_id uuid not null references public.workout_template_assignment_runs(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  global_template_id uuid not null,
  global_template_version integer not null check (global_template_version > 0),
  workspace_template_id uuid not null,
  workspace_template_version integer not null default 1 check (workspace_template_version = 1),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
    check (pg_catalog.isfinite(created_at)),
  unique (run_id, workspace_id, global_template_id, global_template_version),
  unique (workspace_id, global_template_id),
  foreign key (run_id, workspace_id)
    references public.workout_template_assignment_items(run_id, workspace_id) on delete restrict,
  foreign key (global_template_id, global_template_version)
    references public.workout_global_template_versions(template_id, version) on delete restrict,
  foreign key (workspace_id, workspace_template_id, workspace_template_version)
    references public.workout_workspace_template_versions(workspace_id, template_id, version)
    on delete restrict
);

create table public.workout_template_distribution_state (
  workspace_id uuid primary key references public.workspaces(id) on delete restrict,
  ever_received_global_assignment boolean not null default false,
  first_assigned_at timestamptz
    check (first_assigned_at is null or pg_catalog.isfinite(first_assigned_at)),
  first_assignment_id uuid references public.workout_template_assignment_runs(id) on delete restrict,
  last_assignment_id uuid references public.workout_template_assignment_runs(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
    check (pg_catalog.isfinite(created_at)),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
    check (pg_catalog.isfinite(updated_at)),
  check (
    (
      ever_received_global_assignment = false
      and first_assigned_at is null
      and first_assignment_id is null
      and last_assignment_id is null
    )
    or (
      ever_received_global_assignment = true
      and first_assigned_at is not null
      and first_assignment_id is not null
      and last_assignment_id is not null
    )
  )
);

-- Immutability & monotonicity guards
create function app_private.f17_reject_assignment_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'assignment_ledger_immutable';
end;
$$;
alter function app_private.f17_reject_assignment_ledger_mutation() owner to postgres;
revoke all on function app_private.f17_reject_assignment_ledger_mutation()
  from public, anon, authenticated, service_role;

create function app_private.f17_guard_distribution_state_update()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception using errcode = '23514', message = 'distribution_state_immutable';
  end if;

  if new.workspace_id is distinct from old.workspace_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'distribution_state_immutable';
  end if;

  if old.ever_received_global_assignment then
    if not new.ever_received_global_assignment
      or new.first_assigned_at is distinct from old.first_assigned_at
      or new.first_assignment_id is distinct from old.first_assignment_id then
      raise exception using errcode = '23514', message = 'distribution_state_immutable';
    end if;
  end if;

  return new;
end;
$$;
alter function app_private.f17_guard_distribution_state_update() owner to postgres;
revoke all on function app_private.f17_guard_distribution_state_update()
  from public, anon, authenticated, service_role;

create trigger workout_template_assignment_runs_immutable
  before update or delete on public.workout_template_assignment_runs
  for each row execute function app_private.f17_reject_assignment_ledger_mutation();
create trigger workout_template_assignment_runs_no_truncate
  before truncate on public.workout_template_assignment_runs
  for each statement execute function app_private.f17_reject_assignment_ledger_mutation();

create trigger workout_template_assignment_items_immutable
  before update or delete on public.workout_template_assignment_items
  for each row execute function app_private.f17_reject_assignment_ledger_mutation();
create trigger workout_template_assignment_items_no_truncate
  before truncate on public.workout_template_assignment_items
  for each statement execute function app_private.f17_reject_assignment_ledger_mutation();

create trigger workout_template_assignment_copies_immutable
  before update or delete on public.workout_template_assignment_copies
  for each row execute function app_private.f17_reject_assignment_ledger_mutation();
create trigger workout_template_assignment_copies_no_truncate
  before truncate on public.workout_template_assignment_copies
  for each statement execute function app_private.f17_reject_assignment_ledger_mutation();

create trigger workout_template_distribution_state_guard_update
  before update or delete on public.workout_template_distribution_state
  for each row execute function app_private.f17_guard_distribution_state_update();
create trigger workout_template_distribution_state_no_truncate
  before truncate on public.workout_template_distribution_state
  for each statement execute function app_private.f17_guard_distribution_state_update();

-- Forced RLS and PO-only SELECT policies
alter table public.workout_template_assignment_runs enable row level security;
alter table public.workout_template_assignment_runs force row level security;
alter table public.workout_template_assignment_items enable row level security;
alter table public.workout_template_assignment_items force row level security;
alter table public.workout_template_assignment_copies enable row level security;
alter table public.workout_template_assignment_copies force row level security;
alter table public.workout_template_distribution_state enable row level security;
alter table public.workout_template_distribution_state force row level security;

create policy workout_template_assignment_runs_po_read
  on public.workout_template_assignment_runs for select to authenticated
  using ((select app_private.is_platform_owner()));

create policy workout_template_assignment_items_po_read
  on public.workout_template_assignment_items for select to authenticated
  using ((select app_private.is_platform_owner()));

create policy workout_template_assignment_copies_po_read
  on public.workout_template_assignment_copies for select to authenticated
  using ((select app_private.is_platform_owner()));

create policy workout_template_distribution_state_po_read
  on public.workout_template_distribution_state for select to authenticated
  using ((select app_private.is_platform_owner()));

-- Direct-DML denial
revoke all on
  public.workout_template_assignment_runs,
  public.workout_template_assignment_items,
  public.workout_template_assignment_copies,
  public.workout_template_distribution_state
  from public, anon, authenticated, service_role;

grant select on
  public.workout_template_assignment_runs,
  public.workout_template_assignment_items,
  public.workout_template_assignment_copies,
  public.workout_template_distribution_state
  to authenticated;
