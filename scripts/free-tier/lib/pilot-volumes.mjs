// S65 T012: offline S31-PO-4 pilot-unit -> relation volume projection.
// Pure: no DB, no network, no secrets. Every table entry cites the
// supabase/migrations file:line that fixes its row cardinality.

export const PILOT_INPUTS = Object.freeze({
  workspaces: 2,
  clientsPerWorkspace: 150,
  staffPerWorkspace: 2,
  plansPerClient: 2,
  newPlanVersionsPerClientPerMonth: 2,
});

// Each entry is derived directly from a decided S31-PO-4 pilot input.
// `basis` names the schema constraint that fixes one row per unit.
export const PILOT_TABLE_UNITS = Object.freeze([
  {
    table: 'public.workspaces',
    unit: 'workspaces',
    basis: 'primary key id',
    source: 'supabase/migrations/20261027120000_tenancy.sql:10-16',
  },
  {
    table: 'public.clients',
    unit: 'clients',
    basis: 'primary key id; workspace_id FK; auth_user_id unique',
    source:
      'supabase/migrations/20261031121000_client_accounts_model.sql:62-78',
  },
  {
    table: 'public.workspace_memberships',
    unit: 'staffMemberships',
    basis: 'unique active (workspace_id, user_id) where revoked_at is null',
    source: 'supabase/migrations/20261027120000_tenancy.sql:18-31',
  },
  {
    table: 'public.plan_roots',
    unit: 'plans',
    basis:
      'primary key id; unique (workspace_id, id); FK (workspace_id, client_id)',
    source:
      'supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:2-12',
  },
  {
    table: 'public.plan_drafts',
    unit: 'plans',
    basis: 'primary key (workspace_id, plan_id); FK to plan_roots',
    source:
      'supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:14-26',
  },
  {
    table: 'public.plan_revisions',
    unit: 'newPlanVersionsPerMonth',
    basis: 'primary key id; unique (workspace_id, plan_id, revision_number)',
    source:
      'supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:28-43',
  },
]);

// Inputs that cannot be derived from the decided pilot values or from the
// schema alone. They are recorded, never guessed.
export const UNVERIFIED_INPUTS = Object.freeze([
  {
    input: 'public.staff_profiles distinct user total',
    reason:
      'pilot fixes 2 staff per workspace but not whether the same staff are shared across the 2 workspaces; PK is user_id',
    source: 'supabase/migrations/20261027120000_tenancy.sql:4-8',
  },
  {
    input: 'auth.user rows',
    reason:
      'Supabase Auth managed table, not created in repo migrations; total depends on the unresolved distinct staff total',
    source: 'supabase/migrations/20261031121000_client_accounts_model.sql:65',
  },
  {
    input: 'public.nutrition_plan_version_contents rows',
    reason:
      '1:1 with nutrition plan_revisions, but the pilot does not split plans by plan_kind',
    source:
      'supabase/migrations/20261119010000_f18_nutrition_plan_version_contents.sql:3-17',
  },
  {
    input: 'public.audit_events rows',
    reason: 'no S31-PO-4 pilot unit determines audit volume',
    source: 'supabase/migrations/20261027150000_audit_log.sql:2-11',
  },
  {
    input: 'public.jobs rows',
    reason: 'no S31-PO-4 pilot unit determines job volume',
    source: 'supabase/migrations/20261027160000_jobs.sql:2-19',
  },
  {
    input: 'bytes per row (total_bytes / reltuples)',
    reason:
      'no offline DB measurement exists; the only reltuples values in the repo are synthetic test fixtures (one is -1) and are invalid per the T012 unknown-basis rule',
    source: 'tests/unit/free-tier-projection.test.ts:4-9',
  },
]);

export function deriveVolumes(inputs = PILOT_INPUTS) {
  const clients = inputs.workspaces * inputs.clientsPerWorkspace;
  return Object.freeze({
    workspaces: inputs.workspaces,
    clients,
    staffMemberships: inputs.workspaces * inputs.staffPerWorkspace,
    plans: clients * inputs.plansPerClient,
    newPlanVersionsPerMonth: clients * inputs.newPlanVersionsPerClientPerMonth,
  });
}

export function projectPilotVolumes(inputs = PILOT_INPUTS) {
  const derived = deriveVolumes(inputs);
  return {
    inputs: { ...inputs },
    derivedVolumes: { ...derived },
    tables: PILOT_TABLE_UNITS.map((entry) => ({
      table: entry.table,
      unit: entry.unit,
      expectedRows: derived[entry.unit],
      basis: entry.basis,
      source: entry.source,
      status: 'VERIFIED',
    })),
    unverified: UNVERIFIED_INPUTS.map((entry) => ({
      ...entry,
      status: 'UNVERIFIED',
    })),
    // A byte-level projection is not completed: a per-row byte basis cannot
    // be verified offline (see UNVERIFIED_INPUTS).
    complete: false,
  };
}
