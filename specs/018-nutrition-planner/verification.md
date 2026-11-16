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

## Slice 4: T011 — Selection carry-forward in publish

- **Base `origin/main` SHA after required sync**: `68f62a2d`; initial slice base: `5616c2633debd66d760bc716b3dca8aa35e2c330`.
- **Stack**: A (`LIFTER_SUPABASE_STACK=a`, API port 54321, DB port 54322).
- **Migration**: `supabase/migrations/20261119150000_f18_nutrition_selection_carry_forward.sql` (`CREATE OR REPLACE public.publish_nutrition_revision`).
- **Integration suite**: `tests/integration/nutrition-carry-forward.test.ts` (4 tests): stable-ID carry, removed/replaced item refusal, deauthorized-client refusal, and lock-ordered concurrent publish/selection.
- **RED**: `nutrition-carry-forward.test.ts` failed because publishing the next revision omitted the prior stable-ID selection. The removed/replaced and deauthorized guards also have dedicated assertions.
- **GREEN**: 4/4 passed after applying the migration on Stack A.
- **Mutation**: changed the target item/alternative eligibility from matching stable IDs to accepting any populated item/alternative in the target document (position-style carry). KILLED: replacement-reference case failed because an old selection appeared on the next revision. Restored the migration; `git diff --exit-code` exited 0; clean Stack A reset + provisioning; restored suite passed 4/4.
- **Design**: the publish transaction retains F19's plan-root serialization; eligibility rechecks approved/non-deactivated client, active current subscription, delivery binding, source/target stable item+alternative IDs, and matching plan client. Carried rows preserve source `created_by`; one per-revision counter row is created; the single publish audit adds `selection` only when rows carried.
- **Migration scan**: all 312 current origin refs scanned before migration creation, zero lane-range hits. The reserved `20261119150000–20261119155959` registry row was already present (S59-R51).
- **Function body diff**: `C:/Users/NEW LAP/.lifter/runs/s59-hy-f18t011/body.diff`.
- **Final local CI-equivalent**: lint, typecheck, changed-file and repo-wide format checks, and migration timestamp checks passed. Full unit suite: 3,206/3,206 across 277 files. Final Stack A reset + provisioning; touched integration suites: 56/56 across carry-forward (4), selection (3), publish (7), and `rls-catalog` (42).

## Slice 5 (Versioning + benchmark): T020 and T021

- **Base `origin/main` SHA**: `1d7f007ad94b6e814c3fa3fb429712c65f940fd0`; merged latest `origin/main` before push (up to date; includes #157).
- **Stack**: A (`LIFTER_SUPABASE_STACK=a`, API 54321, DB 54322); safe reset and `client-accounts-provision.mjs` completed before final integration suites.
- **Host/run**: Windows 11 Pro 10.0.26200; Intel Core i7-13650HX; 23.8 GiB RAM; Node `v24.19.0`; Docker `29.9.2`; PostgreSQL `17.11.0.006`. Four baseline request-mix runs; 3 publish RPCs + 30 revision reads per run.
- **Measured maxima**: 112,953 request bytes; 21 meals; 168 items; 504 alternatives; precision 3; publish p95 262.824 ms; read p95 113.792 ms; revision payload 144,079 bytes (document 123,182); template document 132,011 bytes.
- **Threshold rule and envelope**: ceil(max observed × 1.25), capped at any applicable spec target; where no target exists, retain 25% headroom. SC-006 publish cap 300 ms leaves 37.176 ms (about 12% of ceiling); read limit 143 ms remains under the 300 ms target. Decimal precision stays at 3. Envelope: request bytes 141,192; meals 27; items 210; alternatives 630; publish 300 ms; reads 143 ms; revision payload 180,099 bytes; revision document 153,978 bytes; template document 165,014 bytes. Each numeric threshold has a corresponding benchmark assertion. Domain CPU is diagnostic, not a threshold.
- **GREEN**: after reset/provision, versioning + benchmark integration files passed 2/2 tests with `SC006_TIMING_RUN=true` (2026-11-16 02:29:44; 4.45 s).
- **T020 mutation (KILLED, restored)**: integer-rounding v1 compute mutation caused versioning test failure (`248` persisted vs frozen `247.500`); migration restored, Stack A reset/provisioned, restored test passed.
- **T021 mutation (KILLED, restored)**: tightened `document.max_items` from 210 to 1; test failed with `expected 168 to be <= 1`. Restored to 210. Restored envelope SHA-256: `64912824a9fdae1b6032a6ec14e6583330d578c1a929bc21204b3d9099f85510`; tracked source mutation diff returned clean. No migration authored.
