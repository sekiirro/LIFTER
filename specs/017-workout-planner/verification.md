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

## F17 Verification — T044 slices 1+2 (template manager + assignment wizard UI)

- **Branch / stack**: slice 1 `017-template-manager-slice-1` (merged as PR #173) + slice 2 `017-assign-wizard-slice-2` / no DB stack (UI-only, mocked props; T025 RPC not called).
- **Implementation**: slice 1 `components/workout-planner/TemplateManager.tsx` (global/own/assigned scopes, load/create/edit, PO-only global gating, provenance masking); slice 2 `components/workout-planner/TemplateAssignWizard.tsx` + `TemplateAssignWizard.module.css` (Step 1 selection all/specific/all-except with retired not selectable; Step 2 target all/specific; review with `assigned` / `skipped_already_assigned` / `skipped_existing` / `no_copies` + zero-copies `assignNothing`; non-PO returns null). Copy: 20 `templates.assign*`/`outcome*`/`explain*` keys byte-exact EN+AR per S60-PO-8 in one contiguous block after `templates.empty`.
- **RED**: slice 2 `tests/unit/template-assign-wizard.test.tsx` (8 tests) failed 8/8 before the wizard existed (missing component + keys).
- **GREEN**: 8/8 pass on this head; slice 1 `tests/unit/workout-template-manager.test.tsx` (7 tests) passes on this head (merged).
- **Mutation (kill -> restore; component file matches pre-mutation bytes)**:
  - Removed the PO scope gate (`if (!allowed) return null;`) -> `non-PO roles render nothing` failed (WO rendered the wizard); restored.
  - Collapsed the state distinction (`skipped_existing` label -> `skipped_already_assigned`) -> `review shows all four receipt outcomes` failed (`Skipped: already has it` missing); restored.

## F17 Verification — T028 (s60-luna-f17t028)

- **Branch / stack**: `017-promote-global-slice-1` / Stack D (`lifter-stack-d`). Migration `20261120190001_f17_promote_workspace_template.sql` is in the lane-reserved `20261120190000–20261120195959` range.
- **Implementation**: `public.promote_workout_workspace_template(uuid,uuid,integer,uuid)` checks platform-owner authorization before revealing source existence, checks the expected source version, creates a distinct global template identity and immutable version 1 with origin workspace/template/version provenance, copies only the validated workout-template document, preserves the workspace source, writes an audit event, and returns unresolved reference path/status flags. `app_private.f17_workout_template_unresolved_refs(jsonb,uuid)` checks pinned global/private exercise identity/version resolution and returns `RED` for unresolved or foreign workspace references. It is private and registered in the RLS function inventory. Loading is not implemented here; T029 owns load blocking.
- **RED**: Added the promotion test before the migration; it failed with PostgreSQL `42883` because the promotion RPC did not exist. The existing T023/T024 cases passed.
- **GREEN**: On Stack D after safe reset + synthetic fixture provisioning, `workout-template-rpcs.test.ts` passed 4/4 and `rls-catalog.test.ts` passed 43/43. Final restored migration also passed the promotion suite 4/4.
- **Mutation (kill → restore)**: Temporarily changed the RPC to retire the source workspace template before creating its global copy. `workout-template-rpcs.test.ts` failed because source lifecycle was `retired` instead of `active`, proving source retention is asserted. Restored migration SHA-1 object hash: `84c1af8aebbc8cbaa7952450a126d51945997ef1` (same before mutation and after restore). Safe reset + provisioning performed after restoration.
- **S61-R4 follow-up**: Kept T028 unticked. Added integration assertions for resolved active global + own-workspace private refs (empty unresolved list), foreign-workspace private refs (RED), missing global identity and version (RED), stale expected version (`40001`), and retired/absent sources returning generic `42501` to both PO and non-PO callers. Final restored Stack D run after safe reset + provisioning: `workout-template-rpcs.test.ts` 5/5; full unit suite 3,228/3,228; lint, typecheck, both format gates, and all-origin migration timestamp scan (366 remote refs) passed. Mutation: changed `app_private.f17_workout_template_unresolved_refs` to treat every exercise ref as unresolved; the resolved-reference integration assertion failed as expected. Restored the migration; `git hash-object` before and after was `84c1af8aebbc8cbaa7952450a126d51945997ef1`.
- **R6 Analyze note**: No FR, SC, acceptance-criterion, or plan design text changed; only implementation, tests, task status, traceability evidence, and verification evidence changed, so no Analyze re-date is needed.

## F17 Verification — T029 and S61-R4/T024/T028 load blocking (s61-luna-f17t029)

- **Branch / stack**: `017-load-template-slice-1`, based on `origin/017-promote-global-slice-1` (Stacked on PR #181); Stack D (`supabase-stack-d`) only. Migration `20261121010000_f17_load_workout_template_version.sql` is within the lane-reserved `20261121010000–20261121015959` range.
- **Implementation**: `public.load_workout_template_version(plan, template kind, template id, explicit version, operation key)` authorizes the workout draft's owning workspace and PO-only global access, locks the draft/template, requires the empty workout draft shape, reads only the requested active immutable version, flags unresolved global/private refs with the T028 helper and fails before writes, remaps every day/item/set UUID, preserves the source values, updates the draft/audit once, and supports authorized exact replay. New private helper has empty search_path and is non-executable to application roles; RPC grants authenticated only.
- **RED**: Added T029/S61-R4 integration case first. On Stack D with Vault provisioning, it failed with `PGRST202` because `public.load_workout_template_version` was absent. This test covers pinned v1 vs current v2, ID remapping, 0 RIR/source values, source immutability, cross-workspace denial, staff denial for global templates, promotion RED status, and load blocking with no draft write.
- **GREEN**: After migration and Stack D safe reset + `tests/integration/client-accounts-provision.mjs`, `f19-plan-copy.test.ts`, `workout-template-rpcs.test.ts`, and `rls-catalog.test.ts` passed: 3 files / 57 tests.
- **Mutation evidence (kill → restore)**:
  1. Replaced `app_private.f17_remap_workout_template_ids` in Stack D with an identity function. `f19-plan-copy.test.ts` failed at the day-ID inequality assertion (source ID remained unchanged). Restored with safe `db reset --local` + provisioning; the test passed.
  2. Mutated both template lookups to choose `t.current_version` instead of `p_version`. After safe reset + provisioning, `f19-plan-copy.test.ts` failed because pinned v1 loaded the later `Later` document. Restored both explicit-version predicates.
  3. Mutated the unresolved-reference guard to `if false`. After safe reset + provisioning, `f19-plan-copy.test.ts` failed because a promoted RED ref loaded successfully (`blocked.error?.code` was undefined). Restored the guard.
  - Final restored Stack D safe reset + Vault provisioning; all 3 touched integration suites passed 57/57. Final migration file hash: recorded in `R/report.md`; no mutation scratch persisted.
- **T028 S61-R4**: Promoted source stays in workspace, promoted identity is separate, unresolved reference response is RED, and the promoted RED ref cannot load. Existing T028 promotion mutation and RED coverage are recorded above in this file's earlier T028 section; T028 and T024 are now complete.
- **Analyze**: No FR, SC, acceptance, or plan design text changed; only implementation/test/status/evidence changed, so no Analyze re-date is needed.
