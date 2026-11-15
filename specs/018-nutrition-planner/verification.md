# F18 Nutrition Planner — Verification Report

## Environment

- **Base `origin/main` SHA**: `9995e5b7`
- **Stack**: D (`LIFTER_SUPABASE_STACK=d`, API port 45421, DB port 45422)
- **Node**: `v24.19.0`
- **Vitest**: `vitest/5.1.0`
- **PostgreSQL image**: `public.ecr.aws/supabase/postgres:17.11.0.006`

## Slice 2: T014 (`assign_nutrition_templates`) & T015 (`make_nutrition_template_global`)

- **Migration**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql`
- **Integration suites**:
  - `tests/integration/nutrition-assign.test.ts` (6 tests)
  - `tests/integration/nutrition-make-global.test.ts` (1 test)
  - `tests/integration/rls-catalog.test.ts` (42 tests; `app_private.nutrition_template_assign_guard`, `app_private.nutrition_template_private_fields` registered)
- **GREEN**: 3 test files passed, 49/49 tests passed after clean Stack D reset and provisioning (`tests/integration/client-accounts-provision.mjs`).

### Mutation Evidence (all killed, restored, `git diff --exit-code` 0)

1. **T014 — `All` tops up a partial workspace**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:124-126,133-140`
   - **Mutation**: Removed the `not exists (... nutrition_template_assignment_items ... outcome='assigned')` filters for `p_workspace_mode='all'`.
   - **Result**: KILLED — `tests/integration/nutrition-assign.test.ts` failed 1/6 (`keeps All away from partial workspaces and reports held copies without overwriting them` at `tests/integration/nutrition-assign.test.ts:382`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision.

2. **T014 — Overwrite a held copy**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:156`
   - **Mutation**: Added `update public.nutrition_workspace_templates c set display_name = c.display_name || ' — overwritten'` in the `skipped_existing` branch instead of skipping without modification.
   - **Result**: KILLED — `tests/integration/nutrition-assign.test.ts` failed 2/6 (`nutrition_template_version_conflict` immutability guard triggered on `assign_nutrition_templates` at `tests/integration/nutrition-assign.test.ts:281,396`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision.

3. **T015 — Non-PO `make_nutrition_template_global`**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:239,246,252,257`
   - **Mutation**: Removed `not app_private.is_platform_owner()` authorization checks in `public.make_nutrition_template_global`.
   - **Result**: KILLED — `tests/integration/nutrition-make-global.test.ts` failed 1/1 (`denies non-PO callers, refuses private fields, and promotes an unchanged separate copy` at `tests/integration/nutrition-make-global.test.ts:138`, non-PO `trainerA` call resolved instead of rejecting with `42501`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision; 49/49 tests passed on restored state.

4. **T015 — Strip private fields silently instead of refusing (`M4`)**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:255-256`
   - **Mutation**: Replaced `raise exception 'private_nutrition_template_fields'` in `public.make_nutrition_template_global` with silently stripping the detected private keys (`$.clientName`, `$.created_by`, `$.workspaceId`) from `source_row.document` and continuing promotion.
   - **Result**: KILLED — `tests/integration/nutrition-make-global.test.ts` failed 1/1 (`denies non-PO callers, refuses private fields, and promotes an unchanged separate copy` at `tests/integration/nutrition-make-global.test.ts:63`, PO `make_nutrition_template_global` resolved with `{ template_id, version: 1 }` instead of rejecting with `22023` / `$.clientName,$.created_by,$.workspaceId`).
   - **Restore**: Reverted mutation (`git diff --exit-code -- supabase/migrations` = 0); clean Stack D reset + provision; 49/49 tests passed (`nutrition-make-global.test.ts`, `nutrition-assign.test.ts`, `rls-catalog.test.ts`) on restored state.

## Slice 3 (Selection): T010 (`select_nutrition_alternative`)

- **Base `origin/main` SHA**: `848e5436`
- **Stack**: A (`LIFTER_SUPABASE_STACK=a`, API port 54321, DB port 54322)
- **Migrations**: `supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql`, `supabase/migrations/20261119140100_f18_selection_self_read_policy_definer.sql`
- **Integration suites**:
  - `tests/integration/nutrition-selection.test.ts` (3 tests)
  - `tests/integration/rls-catalog.test.ts` (42 tests; `app_private.f18_guard_nutrition_selection`, `app_private.f18_selection_audit`, `app_private.f18_is_self_approved_client`, `app_private.f18_is_self_approved_plan_client`, `public.select_nutrition_alternative(uuid,text,text,uuid)` registered)
  - `tests/integration/nutrition-publish.test.ts` (7 tests)
  - `tests/integration/client-accounts-catalog.test.ts` (22 tests), `tests/integration/client-accounts-auth.test.ts`, `tests/integration/client-accounts-recovery.test.ts`
- **RED**: `tests/integration/nutrition-selection.test.ts` failed 3/3 (`PGRST202`: `Could not find the function public.select_nutrition_alternative` in schema cache).
- **GREEN**: 3/3 passed (`nutrition-selection.test.ts`), 42/42 passed (`rls-catalog.test.ts`), 7/7 passed (`nutrition-publish.test.ts`) after clean Stack A reset and provisioning (`tests/integration/client-accounts-provision.mjs`).

### Mutation Evidence (all killed, restored, `git diff --exit-code` 0)

1. **T010 — Accept a caller-supplied client id (`M1`)**
   - **Target**: `supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:159-164,202-220,485-490`
   - **Mutation**: Added optional `p_client_id uuid default null` to `public.select_nutrition_alternative` and resolved `v_client` from `p_client_id` when provided instead of deriving exclusively from `auth.uid()`.
   - **Result**: KILLED — `tests/integration/nutrition-selection.test.ts` failed 1/3 (`refuses forged ids, foreign client, coach overwrite, and stale revision with generic failures and denial audits` at line 539: `forgedClientIdAttempt.data` returned `{ status: 'ok', noop: false, ... }`).
   - **Restore**: Reverted mutation (`git diff --exit-code -- supabase/migrations` = 0); clean Stack A reset + provision.

2. **T010 — Store the counter on the deletable selection row (`M2`)**
   - **Target**: `supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:431-470`
   - **Mutation**: Removed the durable `client_nutrition_selection_revision_counters` upsert/increment and derived `v_sel_rev` from the deletable `client_nutrition_alternative_selections` row count (returning `0` on clear).
   - **Result**: KILLED — `tests/integration/nutrition-selection.test.ts` failed 2/3 (`enforces self-only upsert/delete, no-op silence, durable revision counter, idempotency, and audit allowlist` at line 340: `selection_revision` returned `0` instead of `1`, and `refuses selection and replay when subscription is expired and blocks direct DML` at line 678).
   - **Restore**: Reverted mutation (`git diff --exit-code -- supabase/migrations` = 0); clean Stack A reset + provision.
