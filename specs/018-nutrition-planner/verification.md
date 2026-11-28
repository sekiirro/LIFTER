# F18 Nutrition Planner — Verification Report

## Slice 5: T017 contributor attribution (F18-FR-018 / S60-R43)

- **RED:** On Stack B after safe reset without the contributor attribution migration, all 4 test cases in `tests/integration/nutrition-contributors.test.ts` failed because `public.plan_revision_contributors` did not exist.
- **GREEN:** After adding migration `20261120180000_f19_plan_revision_contributors.sql` and registering `app_private.f19_guard_plan_revision_contributors` and `app_private.f19_track_plan_draft_contributor` in `tests/integration/rls-catalog.test.ts`, all 4 test cases in `nutrition-contributors.test.ts` passed (4/4), and `rls-catalog.test.ts` passed (43/43).
- **Mutation:** Allowed a contributor row from another workspace by mutating the foreign keys in `public.plan_revision_contributors` to non-composite foreign keys (`foreign key (revision_id) references public.plan_revisions(id)` and `foreign key (plan_id) references public.plan_roots(id)`). The test `rejects foreign-workspace contributor rows via composite FK and isolates via RLS` was KILLED (`AssertionError: promise resolved "[]" instead of rejecting` at `tests/integration/nutrition-contributors.test.ts:268`). Restored migration and verified `git diff --exit-code` exited 0; 4/4 tests passed on the restored state.
- **Regression suites:** Touched integration suites passed on Stack B: `nutrition-contributors.test.ts` (4/4), `nutrition-publish.test.ts` (7/7), `nutrition-versioning.test.ts` (1/1), `nutrition-audit.test.ts` (3/3), `rls-catalog.test.ts` (43/43).

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

## Slice 5: T019 — Concurrency and idempotency matrix

- **Branch/base**: `20261120160000–20261120165959`, fresh from `origin/main` at `08a6dcc73167bc1d5e984abdeb983d6c1a991532`.
- **Main sync and documentation union**: merged `origin/main` at `a4eea2efcdba8a9f9dd88f8873f9b35f39cb3cad`. `tasks.md` retains all 30 task rows and IDs; `traceability.md` retains all 106 table rows with first-cell sequence identical to `origin/main`. T019 is checked alongside the merged T020/T021 evidence; verification retains both slice sections and Analyze retains both freshness notes.
- **Stack**: A, safe reset and `tests/integration/client-accounts-provision.mjs` completed before integration.
- **Test**: `tests/integration/nutrition-concurrency.test.ts` uses Promise.all with independent database transactions (bounded pool, 12 simultaneous sessions) for 100 publish, selection, template-load, and Assign calls sharing each operation key.
- **Coverage**: one receipt/revision/delivery/audit after publish replays; simulated ambiguous-commit retry returns the committed receipt; selection counter/audit and template-load draft/audit remain single-write; Assign returns one batch/item/copy with no partial batch when a target workspace is invalid. A concurrent publish/selection race verifies the selected alternative carries to the next revision.
- **RED / mutation**: temporarily removed `FOR UPDATE` from the installed `public.select_nutrition_alternative` plan-root query. The race test failed at `RPC did not wait behind the competing transaction: select_nutrition_alternative`. Restored the original function and verified its installed definition matched byte-for-byte. `git diff --exit-code -- supabase/migrations` returned 0; no migration was needed.
- **GREEN**: targeted integration file passed 5/5 tests after restore on Stack A.
- **Harness correction**: an initial run at 100 physical connections exceeded the local Postgres connection cap; the test retains 100 parallel attempts using a 12-session pool, preserving independent concurrent database transactions within the stack limit.

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

## S60-PO-3 UUID-only item and alternative ids (T029)

- **RED:** `npm run test:unit -- tests/unit/nutrition-schema.test.ts -t "rejects non-UUID"` failed because the validator returned no error. The Stack A integration RED run showed publish accepted `item-not-uuid` and selection returned `status: ok` for non-UUID IDs already present in the document.
- **GREEN:** after implementation, `npm run test:unit` passed 280 files / 3,230 tests. Stack A `-t=nutrition` passed 11 files / 69 tests; `tests/integration/rls-catalog.test.ts` passed 43/43. The focused non-UUID publish/selection/audit checks passed 4/4.
- **Implementation:** TypeScript returns `invalid_document` for non-UUID or uppercase item/alternative IDs. Migration `20261120200100_f18_uuid_item_alternative_ids.sql` enforces lowercase UUIDv4 for published documents, selection table rows and selection RPC inputs (`invalid_selection`); the audit allowlist rejects malformed IDs as `nutrition_audit_id_invalid`. All nutrition fixtures were converted to lowercase UUIDv4 values; deliberately malformed values remain only in rejection tests.
- **Mutation:** temporarily weakened the item/alternative branch of `app_private.f18_audit_allowlist_guard` to accept any nonempty string. Both audit tests failed because the inserts succeeded. Restored the migration from the pre-mutation copy; SHA-256 returned to `EF67CA0590B47F8C0AAB42A6A853854D340810937D4FB38EE163D78F06DD646F`, and `git diff --exit-code` returned 0 against the staged slice.
- **Static gates:** lint, typecheck, changed-file format check, full `npm run format:check`, and local migration timestamp validation passed. The new migration timestamp is valid and lies in the lane-reserved range.
- **Analyze:** full requirement re-analysis is recorded in `checklists/analyze.md`; 0 CRITICAL / 0 HIGH findings.
- **Run report:** `C:/Users/NEW LAP/.lifter/runs/s60-luna-f18uuid/report.md`.

## S61-R24 publish alternative-id rejection follow-up

- **Integration:** Added a Stack A integration case that stores a valid nutrition draft with a non-UUID alternative id and expects `publish_nutrition_revision` to reject it with SQLSTATE `22023`. After Stack A reset and provisioning, `tests/integration/nutrition-publish.test.ts` passed 9/9.
- **Mutation:** Removed the single-day alternative-id branch from `app_private.f18_guard_nutrition_document_ids` in migration `20261120200100_f18_uuid_item_alternative_ids.sql`, reset and provisioned Stack A, and ran the focused test. It failed because publishing returned `null` instead of SQLSTATE `22023`. Restored the migration; its SHA-256 matches the original `EF67CA0590B47F8C0AAB42A6A853854D340810937D4FB38EE163D78F06DD646F`, and `git diff --exit-code` was clean. Stack A was reset and provisioned again with the restored migration before the passing integration run.

## Slice 6: T026 — Multi-plan projection regression (Stack D)

- **Branch/base**: `018-multi-plan-slice-1`, fresh `origin/main` at `8e2ceaf68b1a8b19cf5b3b37e735ae1a7f422721`.
- **Scope**: added `tests/integration/nutrition-multi-plan.test.ts`; no product change or migration was needed. F19's `client_plan_projection()` already returns every delivered plan and each plan's latest revision.
- **RED / fixture correction**: initial assertion received `status: invalid` because the synthetic subscription fixture had no F19 activation. Added its normal `subscription_activations` fact; this was fixture setup, not a product defect. A baseline run then passed against the existing projection.
- **GREEN**: Stack D safe reset followed immediately by `client-accounts-provision.mjs`; touched suite passed 1/1. The fixture publishes a one-meal plan and a two-meal plan, revises the second to four meals, then asserts both IDs, nutrition kinds, revision numbers, and exact meal counts through the client-scoped projection.
- **Mutation**: temporarily changed F19's migration projection query to filter to the first plan. After Stack D reset, the test failed at the all-plan ID assertion (received one ID, expected two): **KILLED**. Restored the migration byte-for-byte, reset Stack D, provisioned again, and restored test passed 1/1. A first mutation expression using `min(uuid)` errored before assertions; replaced with ordered first-row selection for the valid mutation run.
- **Final local gates**: lint passed; typecheck passed; changed-file format check passed; `npm run format:check` passed; touched integration passed 1/1. Full unit first run had one timeout in `tests/unit/optimize-body-fat-assets.test.ts` (3234/3235); rerun in isolation passed 281 files / 3235 tests. Recorded as a transient timeout in the shared flakes backlog.
- **Migration audit**: none authored; no migration timestamp consumed.
- **CI / review**: pending push and exact-head CI.

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

## Slice 6: T023 (`PDF and Excel export`)

- **Base `origin/main` SHA**: `2739a4d973f30478afcdaa75f9d2d52bbc8b6669`
- **Stack**: B (`LIFTER_SUPABASE_STACK=b`, API port 25421, DB port 25422)
- **Node**: `v24.19.0`
- **Vitest**: `vitest/5.1.0`
- **Migration**: `supabase/migrations/20261120210000_f18_nutrition_export_audit.sql` (in reserved range `20261120210000–20261120215959`)
- **Key Files**:
  - `lib/plans/nutrition/export.ts`
  - `tests/golden/nutrition-export-ar-en.test.ts`
  - `tests/integration/nutrition-export.test.ts`
  - `tests/integration/rls-catalog.test.ts` (registered `public.record_nutrition_export_audit`)
- **RED Evidence**:
  - Golden test `tests/golden/nutrition-export-ar-en.test.ts` initially authored and executed prior to implementation; asserted all 9 RED requirements:
    1. Frozen food names and serving labels when no selection exists.
    2. Comprehensive plan content (meals, items, quantities/units, macros, alternatives, notes, recipe link).
    3. Formula injection resistance: cells beginning with `=+\-@\t\r` stored as text with `@` format, preventing spreadsheet execution.
    4. Two-wall authorization: application authorization check (`canExportNutritionPlan`) + database RLS check on authenticated session client.
    5. Current-revision selection as primary with recalculated totals.
    6. Historical-revision export uses that revision's last valid selection (S43-PO-8; S43-R10).
    7. Displays coach original as labelled per-item side note for selected items only.
    8. Totals rows carry client-selection totals only (no coach original in totals; S43-PO-2).
    9. Audit event emission on both success and denial (`plan.nutrition_export`).
- **GREEN Evidence**:
  - `tests/golden/nutrition-export-ar-en.test.ts`: 13/13 tests passed (canonical AR/EN goldens, all 9 RED cases, mutation test).
  - `tests/integration/nutrition-export.test.ts`: 4/4 tests passed against live Stack B Supabase:
    - Denies export for unpermitted actor (Sales) and logs denial audit.
    - Denies export for non-existent revision and logs `not_found` denial audit.
    - Allows authorized export on published revision under real RLS and logs success audit with strict allowlist.
    - Historical-revision export reads that specific revision selection (S43-PO-8; S43-R10).
  - `tests/integration/nutrition-audit.test.ts`: 3/3 tests passed.
  - `tests/integration/rls-catalog.test.ts`: 43/43 tests passed.
  - `tests/integration/client-accounts-catalog.test.ts`: 22/22 tests passed (asserts 42501 on pending synthetic JWT callers across catalog RPCs).
- **Mutation Evidence (KILLED, restored, `git diff --exit-code` 0)**:
  - **Mutation target**: `tests/golden/nutrition-export-ar-en.test.ts:779-804`
  - **Mutant**: Substituted current revision selection (`Egg 2 piece`, 355 kcal total) into historical revision 1 export projection (which expected `Grilled Chicken 150 g`, 800 kcal total).
  - **Result**: KILLED — historical golden assertion threw `AssertionError: expected '... Egg 2 piece ... 355 ...' to contain 'Grilled Chicken 150 g'` / `expected '... Egg 2 piece ...' not to contain 'Egg 2 piece'`.
  - **Restore**: Mutation test wrapper asserted `.toThrow()`, golden projection cleanly preserved. Tracked baseline clean.
- **Local Gates**:
  - Full unit test suite: 281 files / 3,241 tests passed.
  - TypeScript typecheck (`tsc --noEmit`): clean, 0 errors.
  - ESLint (`eslint . --max-warnings=0`): clean, 0 errors, 0 warnings.
  - Prettier format check (`prettier --check .` and `format-check-changed.mjs`): 100% formatted.
- Migration timestamp check: 284 migrations validated, valid timestamp strictly within reserved range.

## S61-R25 — PR #188 export audit repair

- Edited the existing, unmerged `20261120210000_f18_nutrition_export_audit.sql` in place (reserved range `20261120210000–20261120215959`; no new migration). The recorder gets `workspace_id` and the plan client from `plan_roots`, rejects an unrelated revision, and permits only the PO, coaching-work staff with an active membership in the derived workspace, or that plan's own approved client. Caller workspace is ignored. Outcome and reason are constrained to `success`/`denied` and `null`/`not_permitted`/`not_found` as appropriate; all authorization/shape denials use generic `42501` and write no row.
- `readNutritionExport` now fails closed on audit RPC errors (including returned PostgREST errors), plan-root errors/missing rows, selection errors, and missing version content. It no longer falls back to `plan_revisions.content`. The Excel document totals cell uses approved `L.totals`.
- **RED, Stack D after safe reset and provisioning:** ran the new integration cases against the original PR migration. The suite failed 6 tests: foreign-workspace coach, different approved client, mismatched plan/revision, coach scope derivation, client scope derivation, and audit allowlist. The mismatched-scope audit used the caller's workspace; invalid outcome/reason reached a table check (`23514`) instead of generic `42501`.
- **GREEN, Stack D after restoring the fix, safe reset, and provisioning:** `tests/integration/nutrition-export.test.ts` passed 13/13, including foreign coach denied with no row; different approved client denied with no row; cross-plan revision denied with no row; own-workspace coach and plan's own approved client accepted with derived workspace; invalid allowlist denied; audit RPC failure, root read error, and missing-content fallback all fail closed.
- **Mutation, killed and restored:** changed the membership scope predicate from `wm.workspace_id = v_workspace_id` to `wm.workspace_id = wm.workspace_id`. The foreign-coach test failed at `expect(error).toBe('42501')` (received `null`), proving it detects the scope bypass. Restored the predicate, safely reset and reprovisioned Stack D, then reran the touched integration suite successfully (13/13).
- **Focused export golden:** `tests/golden/nutrition-export-ar-en.test.ts` passed 13/13 after the success path's selection read was included in its mock. The test now expects an application-wall denial to return before attempting a database audit write.

# S61-R38 nutrition export audit correction

- Stack C safe reset and `tests/integration/client-accounts-provision.mjs` passed with the corrected, PR-owned migration.
- `tests/integration/nutrition-export.test.ts`: 18/18 passed after the restored migration.
- Authorization mutation: temporarily removed the success authorization guard in the migration, reset/provisioned Stack C, and reran the focused integration suite. The unauthorized-success test failed because the RPC returned success (`null`) instead of SQLSTATE `42501`. Restored the guard, then reset/provisioned Stack C and reran 18/18 green.
- Migration SHA-256 before and after mutation: `02F4F54DD989AF297078BD441C8295665FD14A2958A965336BA3AFFC9B35A541` (identical).
- Full unit suite: 3,247/3,248 passed; unrelated `optimize-body-fat-assets.test.ts` timed out at 5 seconds. A serial-style `--isolate=false` diagnostic was also attempted and produced two unrelated Next registration mock failures, so it is not counted as a passing run.
- Lint and typecheck passed. `npm run format:check` passed. `npm run check:migration-timestamps` passed: 284 timestamps valid, 11 documented merged exceptions allowed.
- The required changed-file format script still reports the pre-existing committed `verification.md` as unformatted because it compares `base...HEAD` and excludes the working tree edit; direct Prettier check of the edited file passes. This gate remains unresolved until the edited file is included in a commit and checked against the base.

## S62-R7 canonical UUID audit guard re-application

- **RED (Stack A, after safe reset/provisioning, PR migration before follow-up):** `nutrition-audit.test.ts` failed both `rejects non-UUID item_id` and `rejects non-UUID alternative_id`; each insert resolved instead of rejecting. The test assertions remain unchanged.
- **GREEN (Stack A, after adding the re-application migration and safe reset/provisioning):** `nutrition-audit.test.ts` passed 5/5. The T023 export allowlist remains extended, while `item_id` and `alternative_id` use `app_private.f18_is_canonical_uuid_v4`.
- **Mutation (Stack A, on the test above):** replaced the UUIDv4 predicate with the original non-empty-string predicate in the follow-up migration, reset/provisioned, and reran the suite. Both rejection tests failed again (3 passed, 2 failed). The migration file was restored, Stack A was safely reset and provisioned, and the restored suite passed 5/5.
- **T023 export regression (Stack A):** `nutrition-export.test.ts` passed 18/18 with UUIDv4 item and alternative IDs in the fixture, persisted selections, computed values, and historical-selection assertions.

## S63 T027 — Release gate and migration audit

- **Stack D fresh replay:** after `db reset --local` and `client-accounts-provision.mjs`, the new `tests/integration/nutrition-release-gate.test.ts` passed alongside F18 parity, versioning, audit, security-matrix and `rls-catalog` coverage.
- **Upgrade replay:** reset Stack D to the 261-migration baseline before F18, then `db push --local` applied the 34 remaining migrations including F18/F17/F19 consumers. Afterward, 11 related integration files passed 108/108, including the release gate, nutrition parity/versioning/audit/security, snapshot, multi-plan, publish, F17 publish and `rls-catalog` suites.
- **Gate assertions:** every F18 data table is forced-RLS and denies INSERT/UPDATE/DELETE/TRUNCATE to `anon`, `authenticated` and `service_role`; the persisted schema/algorithm versions and SQL/TypeScript computed values match; the revision mutation guard refuses a version change; publish audit contains only the approved identifiers and changed-field code.
- **Mutation:** a transaction granted UPDATE on `nutrition_plan_version_contents` to `authenticated`; the release assertion failed on that mutant. Transaction rollback restored the ACL, and the denial assertions passed afterward.
- **Migration audit:** `npm run check:migration-versions:remote` passed across 430 remote refs. No migration was needed, so no timestamp was reserved or registry row added.
- **Traceability:** `F18-FR-020`, `F18-SC-001`, `F18-SC-002`, and `F18-SC-004` now cite T027 and this evidence.
