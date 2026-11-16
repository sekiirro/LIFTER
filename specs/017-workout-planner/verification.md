# F17 Verification Report — Slice 1 (T013 + partial T016/T017)

- **Branch**: `017-slice-1`
- **Stack**: Stack C (`lifter-stack-c`)
- **Runtime**: Node `v24.19.0`, Vitest `5.1.0`, PostgreSQL `public.ecr.aws/supabase/postgres:17.11.0.006`
- **Migration**: `supabase/migrations/20261119020000_f17_workout_templates_identities_versions.sql`

## Scope

- **T013 (complete)**: `public.workout_global_templates`, `public.workout_global_template_versions`, `public.workout_workspace_templates`, `public.workout_workspace_template_versions`, `(template_id, version)` and `(workspace_id, template_id, version)` uniqueness, deferrable `current_version` FKs, monotonic `current_version` CAS guard, immutable versions/provenance triggers, and single-copy-per-origin index `workout_workspace_templates_origin_global_uidx`.
- **T016 (partial — slice 1 tables only)**: `FORCE ROW LEVEL SECURITY` on all four template tables; PO-only read on global template tables; `coaching_work` workspace isolation on workspace template tables; Sales, client, foreign workspace, and revoked membership denied generically.
- **T017 (partial — slice 1 tables and guards only)**: `REVOKE ALL` from `public, anon, authenticated, service_role`; `SELECT`-only grant to `authenticated` with `origin_*` provenance columns withheld on `workout_workspace_templates`; `SECURITY DEFINER`, `OWNER TO postgres`, `SET search_path = ''`, and `EXECUTE` revoked from all client roles on `app_private.f17_*` guard functions.

## TDD & Mutation Evidence

1. **RED**: Executed `tests/integration/workout-templates-schema.test.ts` (3 failed: `relation "public.workout_global_templates" does not exist`) and `tests/integration/rls-catalog.test.ts -t "F17 T013"` (1 failed) before applying the migration.
2. **GREEN**: Applied `20261119020000_f17_workout_templates_identities_versions.sql` on Stack C, provisioned accounts, and ran `tests/integration/workout-templates-schema.test.ts` (4/4 passed) + `tests/integration/rls-catalog.test.ts` (42/42 passed), total 46/46 passed.
3. **Mutation (kill -> restore -> diff exit 0)**:
   - `supabase/migrations/20261119020000_f17_workout_templates_identities_versions.sql:222`: widened `workout_global_templates_po_read` policy from `((select app_private.is_platform_owner()))` to `true` -> `tests/integration/workout-templates-schema.test.ts` failed (`enforces RLS isolation ... expected [ Array(1) ] to have a length of +0 but got 1`).
   - `supabase/migrations/20261119020000_f17_workout_templates_identities_versions.sql:246`: added `grant insert on public.workout_global_templates to authenticated;` -> `tests/integration/rls-catalog.test.ts` failed (`authenticated INSERT public.workout_global_templates: expected true to be false`).
   - Restored both lines, reset Stack C, re-ran `workout-templates-schema.test.ts` + `rls-catalog.test.ts` (46/46 passed), and verified clean restore.
4. **T013 Uniqueness & CAS/FK Mutation Evidence (live Stack C DB only; committed migration `20261119020000_f17_workout_templates_identities_versions.sql` untouched, `git diff --exit-code` = 0)**:
   - **(a1) Global `(template_id, version)` uniqueness**: dropped `workout_global_template_versions_pkey` (and dependent FKs `workout_global_templates_current_version_fk`, `workout_workspace_templates_origin_global_version_fk`) on Stack C -> `tests/integration/workout-templates-schema.test.ts` failed (`enforces global template identity, (template_id, version) uniqueness, CAS pointer, and immutability` at line 46: `promise resolved "[]" instead of rejecting`). Restored via safe `db reset --local` + provisioning -> 4/4 passed.
   - **(a2) Workspace `(workspace_id, template_id, version)` uniqueness**: dropped `workout_workspace_template_versions_pkey` (and dependent FKs `workout_workspace_templates_current_version_fk`, `workout_global_templates_origin_workspace_version_fk`) on Stack C -> initially survived (4/4 passed); added real-DB duplicate `(workspace_id, template_id, version)` assertion (plus workspace `current_version` FK and `template_version_regression` assertions) in `tests/integration/workout-templates-schema.test.ts` -> RED with mutant (`enforces workspace template composite keys, provenance immutability, single-copy-per-origin, and version immutability` at line 174: `promise resolved "[]" instead of rejecting`). Restored via safe `db reset --local` + provisioning -> GREEN (4/4 passed).
   - **(b1) Monotonic `current_version` CAS guard (`template_version_regression`)**: replaced `app_private.f17_guard_template_identity_update()` on Stack C without `if new.current_version < old.current_version` -> `tests/integration/workout-templates-schema.test.ts` failed both `enforces global template identity, (template_id, version) uniqueness, CAS pointer, and immutability` (line 88) and `enforces workspace template composite keys, provenance immutability, single-copy-per-origin, and version immutability` (line 208). Restored function -> GREEN (4/4 passed).
   - **(b2-global) Global deferrable `current_version` FK**: dropped `workout_global_templates_current_version_fk` on Stack C -> `tests/integration/workout-templates-schema.test.ts` failed (`enforces global template identity, (template_id, version) uniqueness, CAS pointer, and immutability` at line 55). Restored via safe `db reset --local` + provisioning -> GREEN (4/4 passed).
   - **(b2-workspace) Workspace deferrable `current_version` FK**: dropped `workout_workspace_templates_current_version_fk` on Stack C -> `tests/integration/workout-templates-schema.test.ts` failed (`enforces workspace template composite keys, provenance immutability, single-copy-per-origin, and version immutability` at line 183). Restored via safe `db reset --local` + provisioning and verified `git diff --exit-code supabase/migrations/20261119020000_f17_workout_templates_identities_versions.sql` = 0.

## S58 T012/T015 Slice Evidence

- Branch `017-plan-slice-1`; Stack B only (`lifter-stack-b`, API 25421, DB 25422), through `supabase-safe.mjs`. T012 attaches workout content to F19 draft/revision rows without creating plan lifecycle or template tables.
- T015 accepts schema v1 with a `days` array and applies the historical 512 KiB size guard as provisional only; SC-014 re-benchmark remains open.
- Initial RED: 1 passed / 2 failed because F19 accepted unknown schema versions. Mutation checks: disabling schema triggers broke schema/revision assertions; disabling size triggers broke oversized rejection; dropping `plan_drafts_workspace_id_plan_id_fkey` broke the composite-key assertion. Restored, safely reset, and reprovisioned Stack B.
- After merging origin/main through PR #124 and safely resetting/reprovisioning Stack B, final affected integration suites passed: 7 files / 86 tests, including F17 plan content, F19 plan behavior, T013 template schema, and the shared RLS catalog checks. Full unit suite: 268 files / 3,166 tests passed.
- Final merged-tree local validation passed typecheck, lint, formatting, spec consistency, edge/cron builds, secrets, size, and migration timestamp checks (263 migrations). `npm test` timed out once on `playwright-server-log-config.test.ts` during concurrent validation; standalone full-unit rerun passed (268 files / 3,166 tests). The repeat is recorded in the lane backlog. Remote migration scan passed across 280 refs before the final required fetch.
- PR #130 first CI run `43718567107` failed because the RLS catalog lacked the two F17 trigger functions. Both functions are now included in inventory and execute-grant checks. Updated exact-head CI for the current head is pending. Local validate summary: `C:/Users/NEW LAP/.lifter/runs/s58-luna-f17plan/ci-local-summary-final-merged.json`.

## S59 T031 Slice Evidence (`017-add-exercise-slice-1`)

- **Branch**: `017-add-exercise-slice-1` | **Stack**: Stack C (`lifter-stack-c`, API `35421`, DB `35422`)
- **Runtime**: Node `v24.19.0`, Vitest `5.1.0`, PostgreSQL `public.ecr.aws/supabase/postgres:17.11.0.006`
- **Migration**: `supabase/migrations/20261119110000_f17_add_workout_exercise_rpc.sql`
- **Scope**:
  - `public.f17_add_workout_exercise(...)`: bounded search selection follow-up, workspace exclusion, source-specific immutable version pins (`global` + `overrideVersion`/`overrideWorkspaceId`, or `workspace_private` + `workspace_id`), F16 effective non-video copy (name, description, notes, alternatives, 3 defaults with absent-stays-blank, zero set rows, never stores video), rest-day `invalid_document` rejection, idempotency via `app_private.f17_workout_operation_keys` with authorization re-check on replay.
  - `app_private.f17_workout_has_foreign_private_reference` + `app_private.f17_guard_workout_references`: trigger on `plan_drafts` and `plan_revisions` refusing foreign `workspace_private` references.
  - `public.f17_resolve_workout_exercise_muscles(...)`: resolves primary/secondary muscle codes from the pinned immutable version.
- **RED -> GREEN**:
  - **RED**: `tests/integration/f17-add-exercise-rpc.test.ts` on Stack C before migration -> 2/2 failed (`Could not find the function public.f17_add_workout_exercise(...) in the schema cache`).
  - **GREEN**: After applying `20261119110000_f17_add_workout_exercise_rpc.sql` and registering `app_private.f17_*` functions in `tests/integration/rls-catalog.test.ts`, `tests/integration/f17-add-exercise-rpc.test.ts` (2/2) + `tests/integration/rls-catalog.test.ts` (42/42) -> 44/44 passed.
- **Mutation Evidence (kill -> restore -> `git diff --exit-code` = 0)**:
  1. **Remove workspace exclusion**: dropped `e.workspace_id = root.workspace_id` check in `public.f17_add_workout_exercise` on Stack C -> `f17-add-exercise-rpc.test.ts` failed (exit 1, foreign-private refusal assertion failed); restored.
  2. **Remove source pins**: mutated `'version', v_version` to `'version', 0` in `public.f17_add_workout_exercise` on Stack C -> `f17-add-exercise-rpc.test.ts` failed (exit 1, source pin assertion failed); restored.
  3. **Remove save/reload preservation**: mutated `save_plan_draft` on Stack C to overwrite item `name` -> `f17-add-exercise-rpc.test.ts` failed (exit 1, `Trainer Custom Bench` preservation assertion failed); restored.
  4. **Remove publication of current entry values**: mutated `ready_and_publish_plan` on Stack C to overwrite item `name` on insert into `plan_revisions` -> `f17-add-exercise-rpc.test.ts` failed (exit 1, published `Trainer Custom Bench` assertion failed); restored.
  5. **Remove pinned-version muscle resolution**: mutated `public.f17_resolve_workout_exercise_muscles` on Stack C to join `exercises.current_version` instead of `v_version` -> `f17-add-exercise-rpc.test.ts` failed (exit 1, `chest`/`triceps` vs `front_delts`/`abs` mismatch); restored.
  - Verified `git diff --exit-code supabase/migrations/20261119110000_f17_add_workout_exercise_rpc.sql` = 0.
- **S59-R49 Deduplication Follow-up (`20261119110200_f17_dedup_foreign_private_ref_helper.sql`)**:
  - Updated `app_private.f17_guard_workout_references()` to call `#139`'s invoker helper `app_private.f17_workout_has_foreign_private_reference(new.content, new.workspace_id)` and dropped the colliding `(uuid, jsonb)` `SECURITY DEFINER` overload; removed the overload's `SECURITY DEFINER` catalog entries from `tests/integration/rls-catalog.test.ts`.
  - After Stack C safe reset + Vault provisioning, `f17-add-exercise-rpc`, `f17-plan-content`, `workout-template-rpcs`, `rls-catalog`, and `client-accounts-catalog` all passed (5 files / 74 tests).
  - Mutating `app_private.f17_guard_workout_references()` to `if false then` on Stack C failed `tests/integration/f17-add-exercise-rpc.test.ts` (exit 1); restored -> exit 0.

## F17 Verification — T023/T024 (s58-luna-f17tpl)

- **Branch / stack**: `017-template-rpcs-slice-1` / Stack B (`lifter-stack-b`). The migration was applied by safe reset on Stack B and followed by `tests/integration/client-accounts-provision.mjs`.
- **Implementation**: `20261119080000_f17_workout_template_rpcs_governance.sql` adds schema-v1 shape constraints and document validation, PO-only global create/version/retire, workspace `coaching_work` create/version/retire, operation-key replay/conflict handling, CAS, append-only versions, transactional audit, rejection of private refs on fresh global authoring, and non-PO provenance column masking.
- **RED**: With tests added first, dropped `public.create_workout_global_template(text,jsonb,uuid)` on Stack B. Both cases failed with SQLSTATE `42883` instead of expected authorization/validation results. Safe reset restored the migration; provisioning followed.
- **GREEN**: `workout-template-rpcs.test.ts` passed 2/2 after reset/provision. Together with `workout-templates-schema.test.ts`, the touched template integration suites passed 6/6.
- **Mutation evidence (DB-only scratch; restored)**:
  - Removed the PO predicate from global create: test failed at auth-before-validation (`expected 42501; received 22023`). Restored the function definition.
  - Removed the expected-version comparison from global version: test failed because the stale request resolved with version 2. Restored the function definition.
  - Removed the active-state check from workspace version: test failed because the retired template accepted a new version 3. Restored the function definition.
  - Granted non-PO access to workspace provenance columns: test failed because the provenance query returned all three columns. Revoked the grant.
  - After all restores, the touched template integration suites passed 6/6. Temporary mutation scripts and state were not committed.
- **Scope note**: T028 promotion and T029 loading remain outside this slice; promoted-private-reference RED/loading behavior is verified with those tasks. T024 remains unticked in `tasks.md` until those tasks complete.

### S59-R18 Review Fixes (s59-hy-139b)

- **B1 (Fresh global private-reference mutation & test coverage)**:
  - Added `version_workout_global_template` private-reference rejection test in `tests/integration/workout-template-rpcs.test.ts` (GREEN 2/2).
  - Mutation 1 (DB-only scratch, `public.create_workout_global_template(text,jsonb,uuid)`): removed `app_private.f17_workout_has_private_reference(p_document)` refusal -> `workout-template-rpcs.test.ts` failed at line 305 (promise resolved instead of rejecting with `22023`). Restored function definition.
  - Mutation 2 (DB-only scratch, `public.version_workout_global_template(uuid,integer,text,jsonb,uuid)`): removed `app_private.f17_workout_has_private_reference(p_document)` refusal -> `workout-template-rpcs.test.ts` failed at line 326 (promise resolved instead of rejecting with `22023`). Restored function definition.
  - Re-ran `workout-template-rpcs.test.ts` -> 2/2 passed.
- **B2 (Task & traceability status)**: Unticked T024 in `specs/017-workout-planner/tasks.md` and updated `specs/017-workout-planner/traceability.md` to record verified parts (provenance masking, fresh global private-ref refusal, workspace private-ref tenancy) and remaining part (promoted-private-ref RED flagging + load blocking with T028/T029). Kept T023 ticked.
- **B3 (Workspace template `workspace_private` tenancy)**:
  - **RED**: Added `refuses foreign workspace_private exercise and alternative references in workspace template RPCs` to `tests/integration/workout-template-rpcs.test.ts` before creating the migration -> failed at line 400 (`create_workout_workspace_template` resolved instead of rejecting with `22023`).
  - **Migration**: Added `supabase/migrations/20261119081000_f17_workspace_template_private_ref_tenancy.sql` introducing `app_private.f17_workout_has_foreign_private_reference(jsonb, uuid)` and enforcing `22023 invalid_workout_template` (zero writes) in `public.create_workout_workspace_template` and `public.version_workout_workspace_template`; registered `f17_workout_has_foreign_private_reference` in `tests/integration/rls-catalog.test.ts`.
  - **GREEN**: Safe reset Stack B + provisioned client accounts -> `workout-template-rpcs.test.ts` + `workout-templates-schema.test.ts` + `rls-catalog.test.ts` passed 3/3 files, 49/49 tests.
  - **Mutation (DB-only scratch; restored)**:
    - Dropped `app_private.f17_workout_has_foreign_private_reference(p_document, p_workspace_id)` from `public.create_workout_workspace_template(uuid,text,jsonb,uuid)` -> `workout-template-rpcs.test.ts` failed at line 400. Restored function definition.
    - Dropped `app_private.f17_workout_has_foreign_private_reference(p_document, p_workspace_id)` from `public.version_workout_workspace_template(uuid,uuid,integer,text,jsonb,uuid)` -> `workout-template-rpcs.test.ts` failed at line 435. Restored function definition.
    - Verified `git diff --exit-code supabase/migrations/20261119080000_f17_workout_template_rpcs_governance.sql` = 0.

## F17 Verification — T014 (s59-hy-f17t014)

- **Branch / stack**: `017-assignment-slice-1` / Stack B (`lifter-stack-b`). Migration `20261119090000_f17_workout_template_assignment_ledgers.sql` applied via safe reset on Stack B followed by `tests/integration/client-accounts-provision.mjs`.
- **Implementation**: `public.workout_template_assignment_runs`, `public.workout_template_assignment_items`, `public.workout_template_assignment_copies`, and `public.workout_template_distribution_state`, with uniqueness keys `(actor_id, operation_key)`, `(run_id, workspace_id)`, `(run_id, workspace_id, global_template_id, global_template_version)`, and `(workspace_id, global_template_id)`, forced RLS, PO-only `SELECT` policies, direct-DML denial, ledger immutability/no-truncate triggers (`app_private.f17_reject_assignment_ledger_mutation()`), and monotonic distribution-state guard (`app_private.f17_guard_distribution_state_update()`). Both `app_private` trigger functions are registered in `tests/integration/rls-catalog.test.ts`.
- **RED**: Added `tests/integration/workout-assignment-schema.test.ts` and the `F17 T014` catalog block in `tests/integration/rls-catalog.test.ts` before creating the migration. On Stack B: `workout-assignment-schema.test.ts` failed 3/3 (`relation "public.workout_template_assignment_runs" does not exist`) and `rls-catalog.test.ts -t "F17 T014"` failed 1/1 (`relation "public.workout_template_distribution_state" does not exist`).
- **GREEN**: After applying `20261119090000_f17_workout_template_assignment_ledgers.sql` and provisioning Stack B, `workout-assignment-schema.test.ts`, `rls-catalog.test.ts`, `workout-templates-schema.test.ts`, and `workout-template-rpcs.test.ts` passed 4/4 files (53/53 tests).
- **Mutation (DB-only scratch on Stack B; restored via safe reset; `git diff --exit-code` = 0)**:
  - Dropped `workout_template_assignment_c_workspace_id_global_template__key` (`UNIQUE (workspace_id, global_template_id)`) on `public.workout_template_assignment_copies` -> `tests/integration/workout-assignment-schema.test.ts` failed at line 236 (`AssertionError: promise resolved "undefined" instead of rejecting`), proving duplicate-on-retry succeeds when copy uniqueness is removed.
  - Restored Stack B via `db reset --local` + `tests/integration/client-accounts-provision.mjs` and verified `git diff --exit-code` on the migration is 0.

## F17 Verification — T037 (s60-fl-f17t037 / s60-fl-160b)

- **Status**: T037 unticked `[ ]`; traceability PARTIAL ("T037 renderer verified; route pending authorized revision read").
- **Renderer & RTL CSS**: `components/workout-planner/WorkoutPrintView.tsx`, `components/workout-planner/WorkoutPrintView.module.css`, `lib/workout-planner/excel-export.ts`, `tests/unit/workout-print-view.test.tsx`.
- Reused merged T038 Excel export S58-PO-5 approved column headings and shared formatting helpers (`PRINT_TABLE_COLUMNS`, `formatWorkoutExportLoad`, `formatWorkoutExportReps`, `formatWorkoutExportSetType`, `getWorkoutExportLabels`) without duplicated strings. Full FR-018 field parity, AR RTL print CSS (`table-header-group`, `break-inside: avoid`), and Bidi isolation verified.
- **RED -> GREEN**: Unit tests in `tests/unit/workout-print-view.test.tsx` (10 tests) failed against unexported columns/labels, then passed cleanly.
- **Mutations (killed -> restored -> clean diff)**:
  1. Forcing `dir="ltr"` fails AR RTL assertion (1 failed / 9 passed).
  2. Removing alternatives column fails FR-018 field assertions (2 failed / 8 passed).
- **Authorized Revision Read Gap**: Merged codebase does not contain an authorized server-side read of ONE explicitly selected revision into `WorkoutExportPayload` (no staff revision read RPC; no server loader querying `plan_revisions` or calling `buildWorkoutExportPayload`). Per brief ruling S60-R8, T037 remains unticked and traceability is PARTIAL pending authorized revision read implementation.

## S60-R4 Verification — T016/T017 (s60-luna-f17t016)

- **Branch / stack**: `017-rls-grants-slice-1` / Stack A (`lifter`, API 54321, DB 54322). Safe reset via the approved wrapper, followed by `tests/integration/client-accounts-provision.mjs`; Vault values were not printed.
- **Source review**: Existing migrations already define eight forced-RLS read policies for all F17 template and assignment tables and authenticated-only EXECUTE grants for six template RPCs. No policy/grant migration gap was found, so this slice adds no migration.
- **RED / mutation evidence (Stack A; each mutant was isolated in its own run and restored)**: Replaced each policy's sole `USING` predicate with `true`, one policy per run. `tests/integration/workout-rls-grants.test.ts` failed on the corresponding authorization assertion for all eight policies: `workout_global_templates_po_read`, `workout_global_template_versions_po_read`, `workout_workspace_templates_staff_read`, `workout_workspace_template_versions_staff_read`, `workout_template_assignment_runs_po_read`, `workout_template_assignment_items_po_read`, `workout_template_assignment_copies_po_read`, and `workout_template_distribution_state_po_read`. After each run, the exact original predicate was restored and catalog-verified.
- **T017 mutation evidence**: Granting authenticated `INSERT` on `public.workout_global_templates` made the direct-DML denial assertion fail; the grant was revoked. Granting `anon` EXECUTE on `public.create_workout_global_template(text,jsonb,uuid)` made the narrow-EXECUTE assertion fail; the grant was revoked. Both restores completed before later suites.
- **GREEN**: On the final scoped-fixture version, `workout-rls-grants.test.ts`, `workout-template-rpcs.test.ts`, `workout-templates-schema.test.ts`, `workout-assignment-schema.test.ts`, and `rls-catalog.test.ts` passed: 5 files / 55 tests. The matrix uses synthetic workspace owner, trainer, Sales, client, unaffiliated and foreign-workspace actors, including a revoked membership. It also asserts FORCE RLS, no client-role base-table DML, empty definer search paths, schema-qualified application references, and narrow RPC execution.
- A combined run initially exposed that unscoped row counts included prior committed fixtures from repeated integration invocations. The new test was changed to select only its own seeded row IDs/workspace IDs; the final combined run above passed.

## S60 T018 Create plan

- **Branch / stack**: `017-create-plan-slice-1` / Stack D (`lifter-stack-d`). Reset and every post-reset provisioning used `C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs` plus `tests/integration/client-accounts-provision.mjs`.
- **Implementation**: Added the authenticated workout-plan server action and API service. It derives workspace from the selected client, denies non-staff/foreign staff generically, sends blank creation to F19 `create_plan_draft`, and sends template/existing-plan creation to F19 `copy_plan_to_draft`. No parallel lifecycle writer or migration was added.
- **RED**: The unit suite was added first and failed because `lib/plans/create` did not exist. The focused integration test asserts 12 concurrent identical blank-plan submits return one Plan ID, one root, one draft, and one operation receipt.
- **GREEN**: After safe reset and provisioning, `f17-plan-create.test.ts`, `f19-plan-copy.test.ts`, and `f19-plan-core-schema.test.ts` passed: 3 files / 16 tests. Coverage includes concurrent duplicate creation, generic Sales/foreign-staff/client denial with no root/draft/ledger writes, copy modes, source semantics, and F19 authorization/replay behavior.
- **Mutation (DB-only scratch; restored)**: Added temporary migration `20261120120001_t018_remove_plan_create_ledger_mutant.sql`, replacing `create_plan_draft` without its operation-key fingerprint/ledger insert/replay guard. After safe reset and provisioning, the concurrent duplicate-submit test failed as required: expected one Plan ID, received 12; 1 failed, 5 skipped. Removed the scratch migration, safely reset and reprovisioned Stack D, reran the three integration files (16/16 passed), and verified the mutation file is absent.
- **Local gates**: `npm run lint`, `npm run typecheck`, both format gates, all-origin migration scan, and full unit suite passed. Final full unit run: 278 files / 3,213 tests. One earlier default-worker run had two scheduling timeouts; the passing rerun was recorded in the lane flakes backlog.

## F17 Verification — T043 (PARTIAL — slice 1) (s60-fl-f17t043)

- **Status**: PARTIAL — slice 1 verified: structure, reorder/cross-day move/duplicate, keyboard alternatives, rest-day rejection (3 mutants); slice 2 open: field editing (notes, reps, set load/rest/RIR, day title/kind) and AlternativesEditor (T034) integration.
- **Branch / stack**: `017-plan-builder-slice-1` / NO DB stack (pure UI and document transforms).
- **Implementation**:
  - `components/workout-planner/WorkoutPlanBuilder.tsx` and `components/workout-planner/WorkoutPlanBuilder.module.css`.
  - Added pure document transform functions to `lib/workout-planner/document.ts` (`reorderWorkoutItem`, `duplicateWorkoutItem`, `removeWorkoutItem`, `addWorkoutDay`, `reorderWorkoutDay`, `duplicateWorkoutDay`, `removeWorkoutDay`).
  - Added PO-approved S28-PO-2 `builder.*` keys to `lib/i18n/messages/en.ts` and `ar.ts`.
- **RED**: Initial test `tests/unit/WorkoutPlanBuilder.test.tsx` executed and failed before implementation.
- **GREEN**: All 13 tests passed covering AR RTL, EN LTR, sessions/rest days, items, sets, notes, alternatives, reorder, cross-day move, duplicate, keyboard move controls, and rest-day rejection. Full unit suite green (278 files, 3,219 passed).
- **Acceptance Tests**:
  - Adding or moving an item to a rest day is rejected with `invalid_document` and no write (`onChange` is not called).
  - A rejected move leaves the item on its source day.
  - Rest days cannot display or retain items.
- **Mutations (3/3 killed; restored; `git diff --exit-code` = 0)**:
  - Mutation 1 (remove keyboard alternative): Removed `move-item-up` button -> test failed at line 347 (`expected 0 to be greater than 0`). Restored.
  - Mutation 2 (remove ID preservation): Regenerated ID on reorder -> test failed at line 407 (`expected '...' to be 'bbbb1111-1111-4111-8111-111111111111'`). Restored.
  - Mutation 3 (remove rest-day rejection): Removed rest-day rejection in document parser -> test failed at line 299 (`expected "vi.fn()" to not be called at all, but actually been called 1 times`). Restored.
- **Design Gate Screenshots**: Rendered via Playwright across {AR-RTL, EN-LTR} × {light, dark} × {mobile 390px, desktop 1440px} saved to `C:/Users/NEW LAP/.lifter/runs/s60-fl-f17t043/screenshots/`.

## F17 Verification — T044 slices 1+2 (template manager + assignment wizard UI)

- **Branch / stack**: slice 1 `017-template-manager-slice-1` (merged as PR #173) + slice 2 `017-assign-wizard-slice-2` / no DB stack (UI-only, mocked props; T025 RPC not called).
- **Implementation**: slice 1 `components/workout-planner/TemplateManager.tsx` (global/own/assigned scopes, load/create/edit, PO-only global gating, provenance masking); slice 2 `components/workout-planner/TemplateAssignWizard.tsx` + `TemplateAssignWizard.module.css` (Step 1 selection all/specific/all-except with retired not selectable; Step 2 target all/specific; review with `assigned` / `skipped_already_assigned` / `skipped_existing` / `no_copies` + zero-copies `assignNothing`; non-PO returns null). Copy: 20 `templates.assign*`/`outcome*`/`explain*` keys byte-exact EN+AR per S60-PO-8 in one contiguous block after `templates.empty`.
- **RED**: slice 2 `tests/unit/template-assign-wizard.test.tsx` (8 tests) failed 8/8 before the wizard existed (missing component + keys).
- **GREEN**: 8/8 pass on this head; slice 1 `tests/unit/workout-template-manager.test.tsx` (7 tests) passes on this head (merged).
- **Mutation (kill -> restore; component file matches pre-mutation bytes)**:
  - Removed the PO scope gate (`if (!allowed) return null;`) -> `non-PO roles render nothing` failed (WO rendered the wizard); restored.
  - Collapsed the state distinction (`skipped_existing` label -> `skipped_already_assigned`) -> `review shows all four receipt outcomes` failed (`Skipped: already has it` missing); restored.

## F17 Verification — T033 (s60-ds-f17t033)

- **Branch**: `017-default-override-slice-1` from `origin/main` `1d7f007a`; worktree `LFTR-s60-ds`. No DB stack.
- **Implementation**: `components/workout-planner/EntryPrescriptionFields.tsx` + `.module.css` render Rest, RIR and Reps of one plan entry as ordinary controlled inputs. The displayed values come only from the entry that the merged `resolveWorkoutExercise` filled at add time; the component has no catalog import, no effect hook and no defaults prop, so no re-default path exists. Invalid typed values stay visible but are not committed; the only error string is the approved `builder.invalidReps` for min>max.
- **RED**: `tests/unit/workout-prescription-ui.test.tsx` (6 tests) failed before the component existed with the recorded module-not-found error (`R/red.txt`).
- **GREEN**: 6/6 tests pass: EN ordinary editable fields with copied values; AR RTL plus approved labels and Arabic-Indic digits; edits commit through the merged document validator; edit-then-save/reload keeps edited values and never restores library defaults; absent defaults stay blank; no platform-defaults control and no defaults source. Full unit suite: 278 files / 3212 tests passed on this head.
- **Mutation (restored)**: added a `Restore platform defaults` button that writes fixed rest/RIR values -> `offers no platform-defaults control and keeps no defaults source` failed (`/default/i` and `<button>` matched; 1 failed / 5 passed, `R/mutation.txt`). Reverted; 6/6 passed again and no mutation marker remains.
- **Copy**: nine S28-PO-2 approved `builder.*` keys (`restHint`, `rirHint`, `reps`, `repsMode`, `fixedReps`, `repRange`, `min`, `max`, `invalidReps`) copied byte-exact from `origin/017-workout-planner` into `lib/i18n/messages/{en,ar}.ts` (9/9 byte-identical per file).

## F17 Verification — T034 (s60-muse-f17t034)

- **Branch / stack**: `017-alternatives-ui-slice-1` / none (client-side only; no server action, DB, autosave, or stack).
- **Implementation**: `lib/workout-planner/alternatives.ts` (pure add/remove/cap-3/unique/invalid-`invalid_document` helpers reusing `parseWorkoutReference` from merged `lib/workout-planner/document.ts`; `isAlternativeUnavailable` for removed/merged), `components/workout-planner/AlternativesEditor.tsx` + `AlternativesEditor.module.css` (controlled editor; availability/names/candidates as props from the F16 lookup; no fetching), 75 PO-approved `builder.*` strings byte-exact from `origin/017-workout-planner` plus `builder.alternativeUnavailable` (EN `Unavailable` / AR `مش متاح`, S60-PO-5) appended as one contiguous block to `lib/i18n/messages/{en,ar}.ts`.
- **RED**: `tests/unit/workout-alternatives-ui.test.ts` (9 tests) failed before the new files existed (import error), then GREEN 9/9 against them. Full unit suite: 279 files / 3,216 tests passed.
- **Mutation (in-place; restored byte-identical)**:
  - Dropped the `builder.alternativeUnavailable` badge (`{false && …}`) -> 2/9 failed (EN + AR badge assertions).
  - Substituted unavailable rows with the first candidate -> 2/9 failed (never-substitute list assertions).
  - Restored the component from backup, verified byte-identical, re-ran GREEN 9/9.
- **Design gate**: tokens-only CSS, native label/select/buttons, AR RTL + EN LTR asserted; Playwright/Chromium shots of the real render (component markup + actual module CSS + `tokensToCss`): `en/ar x light/dark x 390/1440` populated + `en/ar` empty + `en` 768 (11 files under the run temp dir). Fixed and re-shot: empty-select 192px artifact (row `flex-basis` became column height; `flex: none` under 600px) and 14px select text (now inherits 16px like `Field` inputs).

## F17 Verification — T025 (s60-luna-f17t025)

- **Branch / stack**: `20261120170000-20261120175959` / Stack D (`lifter-stack-d`). Migration `20261120170000_f17_workout_template_assign_run.sql` applied after safe Stack D reset followed by client-account provisioning.
- **RPC**: `public.assign_workout_templates(text,uuid[],uuid[],text,uuid[],uuid)` is PO-only with generic `not_permitted` denial. It snapshots each selected current immutable source version before waiting on locks, then locks global roots and candidate workspaces in stable order. It reads the monotonic distribution flag while holding each workspace row lock and writes copies, run/items, and distribution state in the same transaction. Each new workspace identity points to an immutable version 1. Receipt items include created copy IDs and every already-held template identity; All Workspaces records `skipped_already_assigned` for every flagged workspace. A target with no new copy receives `no_copies` when another copy is created; zero-copy total raises before any persistent write.
- **RED**: Before the RPC migration existed, the focused integration suite failed 3/3 with `function public.assign_workout_templates(...) does not exist`; it included mixed `no_copies`/`assigned` and zero-total no-write checks.
- **GREEN**: After migration, safe reset, and provisioning, the focused suite passed 3/3. Final touched integration suites (`workout-assign-run`, `workout-assignment-schema`, `workout-template-rpcs`, `workout-templates-schema`, `rls-catalog`, `function-drift-guard`) passed 6 files / 57 tests. After merging `origin/main`, full unit passed 278 files / 3,214 tests. Lint, typecheck, `FORMAT_BASE_SHA=08a6dcc73167bc1d5e984abdeb983d6c1a991532 node scripts/format-check-changed.mjs`, `npm run format:check`, migration timestamp validation, and `check:secrets` passed.
- **Mutation (Stack D; restored)**: Replaced the All Workspaces distribution-state condition with `false`, safe-reset/reprovisioned, then reran the focused suite. It failed because a previously assigned workspace received `assigned` instead of `skipped_already_assigned`, demonstrating forbidden top-up. Restored the condition, reset/provisioned again, and the final 6-file / 57-test integration run passed.
- **Scope**: T026 replay/key-conflict semantics, T027, and later UI tasks remain open and were not implemented.
