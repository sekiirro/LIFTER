# F18 Nutrition Planner — Verification Report

## Slice 4: T016 audit allowlist and log scrub

- **RED:** On Stack C after safe reset/provision without the new migration, `nutrition-audit.test.ts` had 2 passing cases and failed the forbidden `food_name` insert case because it was accepted by `public.audit_events`.
- **GREEN:** After the allowlist migration was added and Stack C reset/provisioned, `nutrition-audit.test.ts` passed 3/3.
- **Mutation:** Temporarily added `food_name: "Forbidden Mutation Food"` to `app_private.nutrition_template_write_audit` payload. The successful template mutation test failed because the database guard rejected the event with `nutrition_audit_field_not_allowlisted`. Restored the migration and reset Stack C.
- **F18 RPC regression:** 11 integration files passed, 81 tests total: audit, Assign, Make it Global, templates, template RPCs, publish, selection/carry-forward, snapshots, parity, content, and `rls-catalog.test.ts`.
- **Other local gates:** typecheck, lint, formatting, migration timestamp check, and full unit suite (277 files / 3,206 tests) passed. Local checks and logs are recorded in `C:/Users/NEW LAP/.lifter/runs/s60-luna-f18t016/report.md`.
- **Local validate flake:** `ci:local` had one full-suite attempt with timeouts in three unrelated unit tests; the standalone full `npm test` rerun passed 277/277 files and 3,206/3,206 tests. Recorded in `C:/Users/NEW LAP/.lifter/backlog/flakes.md`; exact-head CI remains required.

## S60-R14 denial identifier scrub

- **RED:** On Stack C, the audit denial scrub test failed when `p_item_id` was `Chicken breast 200g`; the real-item / invalid-alternative test also failed because that unverified alternative was stored. Each case observed exactly one denial event.
- **GREEN:** Migration `20261120110200_f18_selection_audit_verified_ids.sql` now includes a denied `item_id` only when it exists in the target revision document, and includes a denied `alternative_id` only when it exists under that item. Success audit payloads are unchanged. Focused audit/selection suites passed 7/7; after merging PR #157, all 12 F18 nutrition integration suites including `rls-catalog.test.ts` passed 86/86 on Stack C.
- **Mutation:** Temporarily restored raw `p_item_id` in the denied audit payload; the food-name scrub assertion failed with the raw text present. Restored the implementation and `git diff --exit-code` returned 0 against the staged clean baseline.
- **Local gates:** After the main sync, full unit passed 277 files / 3,206 tests; typecheck, lint, both format gates, spec consistency, and migration timestamp validation passed. S60-Q1 ID-format hardening is pending PO decision; this fix does not change the ID contract or validator.

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

## Slice 5 (Security Matrix): T018 (`Authorization and security matrix`)

- **Base `origin/main` SHA**: `1d7f007a`
- **Stack**: B (`LIFTER_SUPABASE_STACK=b`, API port 25421, DB port 25422)
- **Node**: `v24.19.0`
- **Vitest**: `vitest/5.1.0`
- **Target Suite**: `tests/integration/nutrition-security-matrix.test.ts` (21 tests)
- **GREEN**: 21/21 tests passed covering all 21 rows of `contracts/nutrition-api.md §8` on clean Stack B reset and provisioning (`tests/integration/client-accounts-provision.mjs`).

### Mutation Evidence (all 21 rows killed, restored, `git diff --exit-code` 0)

| Row | Guard (path:line)                                                                                                                 | Mutant                                                                                                  | KILLED (failing test names)                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `public.create_nutrition_workspace_template` (`supabase/migrations/20261119030000_f18_nutrition_templates.sql:362,377`)           | Remove workspace `coaching_work` access check                                                           | `Row 1: refuses foreign workspace read, write, export, and prompt`, `Row 20: enforces generic denial for Sales role across all plan, template, and export surfaces`                            |
| 2   | `public.select_nutrition_alternative` (`supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:206-211`)     | Return `{ status: 'ok' }` for unapproved / foreign client                                               | `Row 2: refuses foreign client selection with generic denial and audit`, `Row 20: enforces generic denial for Sales role across all plan, template, and export surfaces`                       |
| 3   | `public.select_nutrition_alternative` (`supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:389`)         | Remove `not v_alt_valid` check in alternative validity guard                                            | `Row 3: refuses selection id not in the approved alternatives list`                                                                                                                            |
| 4   | `public.select_nutrition_alternative` (`supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:328-338`)     | Remove stale revision comparison against latest/delivered revision                                      | `Row 4: refuses selection against an older superseded revision with stale_version`, `Row 12: guarantees deterministic outcome and zero mixed revisions under publish and selection sequencing` |
| 5   | `public.select_nutrition_alternative` (`supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:230-235`)     | Remove subscription entitlement check                                                                   | `Row 5: refuses selection when subscription is inactive or expired`                                                                                                                            |
| 6   | Direct DML privilege revocation (`supabase/migrations/20261119010000_f18_nutrition_plan_version_contents.sql:62`)                 | Grant `INSERT` on `nutrition_plan_version_contents` to `authenticated`                                  | `Row 6: denies direct table DML by application roles`                                                                                                                                          |
| 7   | `public.publish_nutrition_revision` (`supabase/migrations/20261119150000_f18_nutrition_selection_carry_forward.sql:71`)           | Accept caller-supplied snapshots from `p_caller_payload->'snapshots'`                                   | `Row 7: ignores caller-supplied snapshots and totals during publish`                                                                                                                           |
| 8   | `app_private.nutrition_build_snapshot_map` (`supabase/migrations/20261119060000_f18_publish_nutrition_revision.sql:246-248`)      | Fall back to dummy snapshot on missing food version instead of raising `nutrition_missing_food_version` | `Row 8: aborts whole publish transaction when food version is missing`                                                                                                                         |
| 9   | `app_private.ready_and_publish_plan_impl` (`supabase/migrations/20261119060100_f18_block_generic_nutrition_publish.sql:81,93`)    | Bypass subscription eligibility and entitlement checks on publish                                       | `Row 9: refuses new publish key without subscription, but honors exact authorized replay`                                                                                                      |
| 10  | `public.publish_nutrition_revision` (`supabase/migrations/20261119150000_f18_nutrition_selection_carry_forward.sql:55-62`)        | Remove idempotent receipt return so replay re-inserts content row                                       | `Row 10: returns original receipt on publish replay with zero duplicates`, `Row 9: refuses new publish key without subscription, but honors exact authorized replay`                           |
| 11  | `app_private.ready_and_publish_plan_impl` (`supabase/migrations/20261119060100_f18_block_generic_nutrition_publish.sql:89-91`)    | Reject any publish when `current_version > 0`                                                           | `Row 11: appends new revision and delivery on new authorized key with unchanged content`                                                                                                       |
| 12  | `public.select_nutrition_alternative` (`supabase/migrations/20261119140000_f18_nutrition_alternative_selections.sql:263,328-338`) | Remove stale revision check (shares mutant with Row 4)                                                  | `Row 12: guarantees deterministic outcome and zero mixed revisions under publish and selection sequencing`, `Row 4: refuses selection against an older superseded revision with stale_version` |
| 13  | `public.create_nutrition_global_template` (`supabase/migrations/20261119030000_f18_nutrition_templates.sql:268-272`)              | Remove idempotent replay return so replays create duplicate rows                                        | `Row 13: produces identical result and zero duplicates across 100 replay attempts`                                                                                                             |
| 14  | `public.assign_nutrition_templates` (`supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:94-98`)            | Remove idempotent replay return so retries attempt second batch                                         | `Row 14: replaying template assignment returns same batch with zero duplicate copies`                                                                                                          |
| 15  | `public.assign_nutrition_templates` (`supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:124-126,136-138`)  | Remove `where not exists (... outcome='assigned')` partial workspace filter                             | `Row 15: skips partial workspace and does not top up in All Workspaces assignment`                                                                                                             |
| 16  | `public.assign_nutrition_templates` (`supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:156,180`)          | Remove `skipped_existing` branch / zero copies check                                                    | `Row 16: marks existing copies skipped_existing without overwrite in Specific Workspaces`, `Row 17: rejects assign when zero copies would be created`                                          |
| 17  | `public.assign_nutrition_templates` (`supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:180`)              | Remove `if assigned=0 then raise exception 'zero_copies'` check                                         | `Row 17: rejects assign when zero copies would be created`, `Row 16: marks existing copies skipped_existing without overwrite in Specific Workspaces`                                          |
| 18  | `public.make_nutrition_template_global` (`supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:255-256`)      | Remove `private_nutrition_template_fields` check                                                        | `Row 18: refuses Make it Global when private client data is present`                                                                                                                           |
| 19  | `nutrition_global_templates_po_read` policy (`supabase/migrations/20261119030000_f18_nutrition_templates.sql:83-84`)              | Change policy using clause to `true`                                                                    | `Row 19: enforces generic denial on non-PO global template read and write`                                                                                                                     |
| 20  | `public.create_nutrition_global_template` (`supabase/migrations/20261119030000_f18_nutrition_templates.sql:258,362`)              | Remove PO authorization check                                                                           | `Row 20: enforces generic denial for Sales role across all plan, template, and export surfaces`, `Row 19: enforces generic denial on non-PO global template read and write`                    |
| 21  | `app_private.f18_guard_plan_version_content` (`supabase/migrations/20261119010000_f18_nutrition_plan_version_contents.sql:22-24`) | Remove `if tg_op <> 'INSERT'` immutability exception                                                    | `Row 21: rejects UPDATE, DELETE, and TRUNCATE on immutable tables and selections`                                                                                                              |

## 4h. S61 T025 slice 2 (partial) verification — nutrition template manager

Scope: the template-manager UI only
(`components/plans/nutrition/NutritionTemplateManager.tsx`,
`components/plans/nutrition/NutritionTemplateManager.module.css`,
`app/(dev)/showcase/f18-template-manager/`). Slice 1 (editor + alternatives,
PR #178) is not in this slice. **T025 remains unticked**; this section records
`PARTIAL` evidence for the template-manager clauses only.

- **RED:** `tests/unit/NutritionTemplateManager.test.tsx` created first; `npx
  vitest run` failed at collection (`Failed to resolve import ...
  NutritionTemplateManager.tsx`, 1 failed file, no tests).
- **GREEN:** after the component + CSS + showcase, the suite passes 11/11:
  PO-approved EN/AR headings with `dir`/`lang`, version isolation via
  `<bdi dir="ltr">`, active/retired distinction with no Load entry on retired
  rows (3 Load buttons for 3 active templates in the PO view), load/version/
  retire/make-global entry points with approved labels, PO-only global
  controls with the global section hidden from staff (no global read per
  `nutrition-api.md` §2), PO-only origin provenance masked from staff,
  `role="status"` loading, error with retry, `noAccess` for Sales/client/
  unaffiliated roles, EN/AR empty states, and byte-exact EN/AR assertions for
  every used key. Full unit suite: 282 files / 3,246 tests passed.
- **Mutation:** removed the `!item.retired` guard in
  `NutritionTemplateManager.tsx` (retired rows exposed Load actions).
  KILLED — `lists items with isolated version numbers and active/retired
  distinction` failed (1 failed / 10 passed; Load count 5, not 3). Restored
  the file from backup (SHA-256 identical on both sides) and re-ran 11/11.
- **Design gate:** `app/(dev)/showcase/f18-template-manager/` renders one
  manager variant per page load (role/status from search params) with static
  mocks. Matrix `{en,ar} × {light,dark} × {390,1440}` (8 full-page shots) plus
  Trainer-ready/loading/error and Sales-ready variants (`en-light-1440`,
  `ar-dark-390`) plus a keyboard-focus shot: 17 screenshots under
  `C:/Users/NEW LAP/AppData/Local/Temp/f18-tm-shots/`. Axe-core clean on all
  16 matrix/variant states (0 violations, 0 incomplete); the initial stacked
  5-manager preview failed `landmark-unique` (five identically named regions)
  and was refactored to the single-manager production shape before the clean
  run. Tokens only, no new copy: every string is a byte-exact
  `nutritionTemplates.*` key on `origin/main` (S28-PO-2) except the
  non-retired badge, which reuses byte-exact `templates.active` (documented —
  nutrition has no `nutritionTemplates.active` key); no `{name}`-composed
  aria-labels (no approved nutrition key exists), so per-item buttons use the
  approved visible label as their accessible name.
- **Local gates:** `npm run lint` clean, `npm run typecheck` clean,
  `FORMAT_BASE_SHA=$(git merge-base HEAD origin/main) node
  scripts/format-check-changed.mjs` passed, `npm run format:check` clean.
