# F17 Implementation Tasks

Planning only. Every task is a 30-60 minute unit. Begin with its negative or contract test, capture RED, make the smallest implementation change, capture GREEN, and run its listed mutation checks before marking complete. No database task is authorized to run before the architect assigns the F17 database stack. UI and pure-TypeScript tasks may proceed without a stack when their dependency permits.

**Owner tags**: `OWNER=Luna` owns migrations, RLS, definer functions, security, concurrency, caps and idempotency. `OWNER=MiniMax` owns non-sensitive UI, i18n, unit tests and Playwright using fixtures. `OWNER=TBD` where ownership is unclear. Cross-owner handoffs name the receiving task explicitly.

**Dependency classes**: `[INDEPENDENT]` can start now (pure TS schemas, validation, fixtures, UI on mocked projections, contract tests) before F16 and Plan Core merge. `[NEEDS-F16]` needs F16 catalog contracts/merged. `[NEEDS-PLAN-CORE]` needs shared Plan Core merged. `[NEEDS-F13]` needs subscription lifecycle. `[NEEDS-STACK]` is DB work; stack assigned later by the architect.

## Phase 0 — contract tests and foundations

- [ ] **T001 (50m) — Freeze TypeScript/SQL role parity fixture for F17 operations.** [INDEPENDENT] `OWNER=Luna`. Add matrix tests for PO, WO, Trainer, Sales, Client and unknown across plan, template, export and volume operations. RED: demonstrate at least one mismatch fixture. GREEN: TS and SQL expectation fixtures derive from the same documented matrix. **Mutation:** change/remove each role's expected permission and prove parity test fails. No database calls.
- [x] **T002 (50m) — Define workout document schema v1.** [INDEPENDENT] `OWNER=MiniMax`. Add hand-written normalizer/types for ordered days (session/rest), ordered exercise items with stable item ids, exercise reference `{source:'global'|'workspace', id, version, variation?:{id,version}}`, ordered sets (`warmup`|`working`) with reps (`{min,max}` or `{value}`), and the per-set tagged load union (`bodyweight` with no value/unit, `added_weight` and `assisted` each requiring a positive exact decimal and explicit `kg`/`lb` unit), plus rest seconds, RIR and notes. RED: invalid/missing fields rejected. GREEN: spec-valid payloads accepted. **Mutation:** remove each required-field, load-variant and id-uniqueness guard and prove unit tests fail. No direct DB.
- [ ] **T003 (50m) — Freeze ExerciseSnapshotV1 embed schema and version registry.** [NEEDS-F16] `OWNER=MiniMax`. Add hand-written normalizer/types for the `snapshots` map keyed by canonical exercise identity, embedding `ExerciseSnapshotV1` only; register an immutable parser per schema version. RED: unknown version or live URL fails closed. GREEN: frozen fixtures parse. **Mutation:** include a live URL or change a frozen fixture field and prove contract test fails. No direct DB.
- [x] **T004 (50m) — Volume pure function and table-driven tests.** [INDEPENDENT] `OWNER=MiniMax`. Implement `lib/plans/workout/volume.ts` over document + snapshots; working sets only; primary 1.0, secondary 0.5 via the fixed 5,000-basis-point constant; per-session and per-week totals. RED before implementation. GREEN against table cases. **Mutation:** remove warm-up exclusion, secondary credit or per-session aggregation and prove its case fails. No direct DB.
- [ ] **T005 (50m) — Idempotency/replay contract tests for plan and template mutations.** [INDEPENDENT] `OWNER=MiniMax`. Test `operation_key` hashing, same key + same hash replay, same key + different hash conflict, 30-day retention. RED before implementation. **Mutation:** remove action binding or request-hash check and prove tests fail. No direct DB.
- [ ] **T006 (50m) — Schema registry fail-closed and registered parser fixtures.** [INDEPENDENT] `OWNER=MiniMax`. Register immutable parsers for every retained schema version; unknown versions fail closed with a generic error; new versions added by forward migration before use. RED: unregistered version accepted. GREEN: only registered versions publish/render. **Mutation:** remove fail-closed branch or a registered parser and prove tests fail. No direct DB.
- [x] **T007 (50m) — Item/set id continuity and duplicate remapping pure functions.** [INDEPENDENT] `OWNER=MiniMax`. Across revisions retain unchanged day/item ids; duplicate exercise remaps item id and all descendant set ids; duplicate day remaps day id and every descendant item/set id; copied values field-for-field identical; source ids unchanged; no collisions. RED before implementation. **Mutation:** remove remap for one descendant level and prove collision test fails. No direct DB.
- [ ] **T008 (50m) — Template document validation.** [INDEPENDENT] `OWNER=MiniMax`. Validate template documents with the same workout schema v1 minus client-specific fields. RED: client-specific field accepted or template field rejected. GREEN: spec-valid template payloads accepted. **Mutation:** remove the client-field exclusion or a required shared guard and prove tests fail. No direct DB.
- [x] **T009 (45m) — Export formula-injection guard.** [INDEPENDENT] `OWNER=MiniMax`. Utility ensuring ExcelJS writes every coach-authored cell as a string; reject leading `=`, `+`, `-`, `@`. RED: formula string passes. GREEN: guarded. **Mutation:** remove one leading-character check and prove its case fails. No direct DB.
- [ ] **T010 (45m) — PDF/Excel golden rendering helpers.** [INDEPENDENT] `OWNER=MiniMax`. Shared helpers for RTL print layout and workbook skeleton used by export tasks. RED before implementation. **Mutation:** remove RTL direction or locale assertion and prove helper test fails. No direct DB.

## Phase 1 — base schema, identity and isolation

- [ ] **T011 (50m) — Migration: workout plan roots, drafts and versions tables.** [NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE] `OWNER=Luna`. Create `workout_plans`, `workout_plan_drafts`, `workout_plan_versions` with workspace/client/subscription relationships, document JSONB, revision, ready_at/ready_by, published_at/by, schema_version, version, contributor sets. RED: assert tables/columns/constraints after clean migration. GREEN: migration applies. **Mutation:** remove a required FK or NOT NULL and prove assertion fails. Assigned stack required.
- [ ] **T012 (50m) — Migration: global and workspace template tables and versions.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Create `workout_global_templates`, `workout_global_template_versions`, `workout_workspace_templates`, `workout_workspace_template_versions` with identity + immutable versions, `UNIQUE(template_id, version)`, `current_version` composite FK. RED first. **Mutation:** remove unique/composite FK and prove test fails. Assigned stack required.
- [ ] **T013 (50m) — Migration: schema_version and byte cap DB checks.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Add DB checks for `schema_version` registration and provisional 512 KB document cap. RED: oversized/unknown version rejected. GREEN: valid accepted. **Mutation:** drop each check and prove targeted invalid payload test fails. Assigned stack required.
- [ ] **T014 (50m) — Implement plan and template RLS policies.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Workspace isolation for plans; template reads by scope; Sales/Client/unaffiliated denial; foreign-workspace indistinguishable denial. RED: all role/scope negative tests before policy change. GREEN: policies pass. **Mutation:** remove each RLS predicate and prove affected matrix row fails. Assigned stack required.
- [ ] **T015 (50m) — SECURITY DEFINER grants and direct-DML denial.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. F12-F15 owner/search_path/grant pattern; authenticated RPC execution; no authenticated base-table DML for every role. RED first. **Mutation:** grant direct DML or widen EXECUTE and prove denial tests fail. Assigned stack required.

## Phase 2 — plan lifecycle integration

- [ ] **T016 (50m) — Explicit plan creation via Plan Core creation lock.** [NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE] `OWNER=Luna`. Implement Create New Plan (blank/template/existing authorized plan) using transaction-scoped creation lock keyed by actor and operation identity; check ledger; create root. RED: duplicate submit creates second plan. GREEN: exactly one Plan ID. **Mutation:** remove creation lock or ledger check and prove duplicate test fails. Assigned stack required.
- [ ] **T017 (50m) — Draft autosave and Save as Draft with optimistic concurrency.** [NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE] `OWNER=Luna`. Silent autosave to private draft; Save as Draft; stale revision rejected with conflict; no data loss. RED first. **Mutation:** remove revision check and prove conflict test fails. Assigned stack required.
- [ ] **T018 (50m) — Ready & Publish RPC with gates.** [NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE] `OWNER=Luna`. Ready requires submitted intake (D17-5=A) and approval; stale ready_revision refused by publish; no-op autosave preserves readiness when canonical hash unchanged. RED first. **Mutation:** remove intake gate or stale ready_revision check and prove tests fail. Assigned stack required.
- [ ] **T019 (50m) — Independent first delivery and exactly-once activation.** [NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE][NEEDS-F13] `OWNER=Luna`. Record first workout delivery idempotently; on second independent delivery activate exactly once or persist durable retry; later edits do not restart. RED first. **Mutation:** remove activation guard or durable retry and prove tests fail. Assigned stack required.
- [ ] **T020 (50m) — Immutable versions trigger, grants and newest-first listing.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Trigger + grants prevent mutation; published plans retained and listed newest first; no auto-archive. RED first. **Mutation:** remove immutability trigger or grant restriction and prove tests fail. Assigned stack required.
- [ ] **T021 (50m) — Contributor set tracking per published version.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Each successful draft save and publication attributes acting staff; published version exposes immutable contributor set (staff ids, action codes, timestamps only) since previous version. RED first. **Mutation:** remove attribution or widen contributor payload and prove tests fail. Assigned stack required.

## Phase 3 — templates

- [ ] **T022 (50m) — Template CRUD RPCs.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. `template_create`, `template_version(expected_version, operation_key)`, `template_retire` with append-only versioning and expected-version concurrency. RED first. **Mutation:** remove CAS or append-only guard and prove tests fail. Assigned stack required.
- [ ] **T023 (50m) — Global template governance and Make it Global.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. PO-only global writes/retirement; PO may Make it Global from eligible workspace template only after private data and references removed; audit `workspace_id` NULL. RED first. **Mutation:** remove PO guard or private-data check and prove tests fail. Assigned stack required.
- [ ] **T024 (50m) — Template load into draft RPC.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. `template_load_into_draft(template_version, expected_revision, operation_key)` selects one explicit visible version, copies content, remaps all document ids. RED first. **Mutation:** remove id remap or version pinning and prove tests fail. Assigned stack required.
- [ ] **T025 (50m) — Template security-barrier view masking.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Global reads via F16 `can_read_global_coaching_content()` through security-barrier view masking creator/origin for non-PO. RED first. **Mutation:** remove either mask and prove projection test fails. Assigned stack required.

## Phase 4 — exercise integration

- [ ] **T026 (50m) — Server: add exercise to draft from F16 bounded search.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Add exercise via bounded indexed AR/EN search selecting explicit exercise (and variation) version; exclude other workspaces' exercises/variations; never unbounded queries; copy defaults. RED first. **Mutation:** remove workspace exclusion or version pin and prove tests fail. Assigned stack required.
- [ ] **T027 (50m) — UI: exercise picker with bounded search and version selection.** [NEEDS-F16] `OWNER=MiniMax`. AR/EN search, filters, explicit version selection, defaults display. Unit tests with mocked projections. RED first. **Mutation:** remove bounded-search assertion or version selector and prove UI test fails. No direct DB.
- [ ] **T028 (50m) — Defaults copy and coach override wiring.** [NEEDS-F16] `OWNER=MiniMax`. Defaults from F16 catalog entry populate on add; coaches may override per plan; no platform defaults screen. RED first. **Mutation:** remove override path or add platform defaults control and prove tests fail. No direct DB.
- [ ] **T029 (50m) — Dynamic workspace video resolution on read/export.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Resolve selected workspace video dynamically per authorized read/export; never store in snapshot; never require republish. RED first. **Mutation:** store URL in snapshot or skip authorization and prove tests fail. Assigned stack required.
- [ ] **T030 (50m) — Alternative exercise handling and removed/replaced indicator.** [NEEDS-F16] `OWNER=MiniMax`. Catalog-based coach-approved alternatives editable per plan; removed alternative keeps snapshot and shows indicator. RED first. **Mutation:** drop removed indicator or snapshot preservation and prove tests fail. No direct DB.

## Phase 5 — volume and export

- [ ] **T031 (50m) — Volume UI (per session and per week).** [INDEPENDENT] `OWNER=MiniMax`. Render weekly volume per muscle group from pure function; working sets only. RED first. **Mutation:** include warm-up sets or drop secondary credit and prove UI test fails. No direct DB.
- [ ] **T032 (50m) — Export print route and RTL print CSS (PDF).** [INDEPENDENT] `OWNER=MiniMax`. Print route rendering a selected published version with RTL print CSS; browser print. RED first. **Mutation:** remove RTL direction or version selection and prove golden test fails. No direct DB.
- [ ] **T033 (50m) — ExcelJS workbook generation.** [INDEPENDENT] `OWNER=MiniMax`. Build workbook in browser from published-version API response; all coach-authored cells as strings. RED first. **Mutation:** allow a formula cell and prove injection test fails. No direct DB.
- [ ] **T034 (50m) — Export audit events.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Every export emits audit event (actor, workspace, plan/version id, format) with no content, notes, client data or PII filenames. RED first. **Mutation:** add content/PII to audit payload and prove privacy test fails. Assigned stack required.
- [ ] **T035 (50m) — Export denial audit and published-only enforcement.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Drafts not exportable; every denial audited; indistinguishable unauthorized/not-found. RED first. **Mutation:** allow draft export or skip denial audit and prove tests fail. Assigned stack required.

## Phase 6 — UI

- [ ] **T036 (50m) — Plan builder UI.** [INDEPENDENT] `OWNER=MiniMax`. Sessions and rest days, exercises, warm-up/working sets with per-set reps/load/rest/RIR/notes, notes, manual alternatives and video refs; reorder, drag across days, duplicate exercises/days; keyboard move up/down/to-day controls. RED first. **Mutation:** remove a keyboard alternative or id preservation and prove UI test fails. No direct DB.
- [ ] **T037 (50m) — Template management UI.** [INDEPENDENT] `OWNER=MiniMax`. List global/workspace templates, load into draft, create/edit workspace templates, PO global governance controls. RED first. **Mutation:** remove scope gating or load copy semantics and prove tests fail. No direct DB.
- [ ] **T038 (50m) — Ready/publish UI and conflict handling.** [NEEDS-PLAN-CORE] `OWNER=MiniMax`. Ready & Publish action, Save as Draft, conflict display, no-op autosave readiness preservation. RED first. **Mutation:** clear readiness on no-op autosave or hide conflict and prove tests fail. No direct DB.
- [ ] **T039 (50m) — AR/EN Playwright and accessibility fixtures.** [INDEPENDENT] `OWNER=MiniMax`. Catalog/plan list, search, add/edit, reorder in AR RTL and EN, keyboard and axe, mobile/desktop, light/dark. RED first. **Mutation:** remove one role-gated control, accessible name or RTL direction assertion and prove suite fails. No direct DB.

## Phase 7 — security, performance and release

- [ ] **T040 (50m) — SC-002 negative matrix.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Foreign-workspace app + RLS tests, direct-DML denial, Sales/client/unaffiliated denial, revoked-membership denial, global creator/origin masking, operation-key replay vs conflict, indistinguishable denied/not-found. RED first. **Mutation:** remove each guard and prove its test fails. Assigned stack required.
- [ ] **T041 (50m) — Property test for 1,000 randomized reorder/move/duplicate.** [INDEPENDENT] `OWNER=MiniMax`. Verify zero parameter corruption (SC-001). RED before implementation. **Mutation:** corrupt one parameter in a generated case and prove test catches. No direct DB.
- [ ] **T042 (50m) — Export golden tests AR/EN.** [INDEPENDENT] `OWNER=MiniMax`. Version N matches N exactly in AR and EN (SC-003). RED first. **Mutation:** change one cell and prove golden mismatch. No direct DB.
- [ ] **T043 (50m) — SC-005 performance benchmark and byte cap decision.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. 7-day/40-exercise plan and max accepted bytes, 10,000 requests; Worker CPU p95 <= 8 ms, max < 10 ms; DB/API p95 <= 300 ms; bounded indexed access; size recorded against 350 MB (70%) exit trigger; choose final byte cap. RED first. **Mutation:** remove each perf assertion and prove gate fails. Assigned stack required.
- [ ] **T044 (50m) — Migration validation and audit atomicity release gate.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Validate migration range/order, fresh and upgrade paths, audit atomicity, zero direct DML, no skipped security denials, all mutation checks. RED first. **Mutation:** remove each security-critical assertion in turn and prove gate fails. Assigned stack required.
- [ ] **T045 (50m) — Frontend Design Gate evidence and handoff.** [INDEPENDENT] `OWNER=MiniMax`. Capture gate evidence, review responsive and bilingual states, hand off approved API contracts and fixture coverage. RED first. **Mutation:** remove one role-gated control, accessible name or RTL assertion and prove suite fails. No direct DB.

- [ ] **T046 (45m) — Enforce explicitly selected workspace authorization for template operations.** [NEEDS-STACK][NEEDS-F16] `OWNER=Luna`. Every workspace-template create, version, retire, list/read and load operation must derive/check `coaching_work` in the explicitly selected owning workspace after waits. Required before F17 feature PR merge (PR #26 round 9 Major). **Mutation:** substitute another authorized workspace and prove the request is denied without disclosure. Assigned stack required.
- [ ] **T047 (40m) — Preserve readiness for canonical no-op saves.** [NEEDS-STACK][NEEDS-PLAN-CORE] `OWNER=Luna`. Preserve readiness when canonical document hash is unchanged; clear readiness only when the hash changes. Required before F17 feature PR merge (PR #26 round 9 Minor). **Mutation:** normalize an equivalent document and prove readiness remains; change one canonical field and prove it clears. Assigned stack required.

## Dependency order

T001-T010 establish contracts and pure tests. T011-T015 establish schema/privilege foundations and wait for stack assignment. T016-T021 implement plan lifecycle and require Plan Core. T022-T025 implement templates. T026-T030 integrate F16 catalogs. T031-T035 implement volume and exports. T036-T039 build UI on mocked projections where possible. T040-T045 require preceding units; T043 is a production gate and must run before production, not during this documentation task.

## Parallel execution

The following `[INDEPENDENT]` tasks touch disjoint files and may run concurrently:

- Wave A (pure schemas/validation): T002, T004, T008, T009. (T003, T006, T007 share `lib/plans/workout/schema.ts` and the registry; serialize T002 -> T003/T006/T007.)
- Wave B (pure helpers/contract tests): T001, T005, T010.
- Wave C (volume/export/UI on mocked projections): T031, T032, T033, T041, T042.
- Wave D (UI shells): T036, T037, T039, T045. (T038 needs Plan Core; run after T018.)
- No two tasks in the same wave edit the same file; shared fixtures under `tests/fixtures/` must be appended, not overwritten, when concurrent.

## Traceability

| Requirement | Task ids |
| --- | --- |
| FR-001 | T011, T016, T019, T020 |
| FR-001a | T019 |
| FR-002 | T011, T016, T017, T018 |
| FR-003 | T002, T007, T011, T013 |
| FR-003a | T026, T027 |
| FR-004 | T007, T036, T041 |
| FR-004a | T007, T041 |
| FR-004b | T021 |
| FR-005 | T026, T027, T028 |
| FR-006 | T012, T022, T023, T024, T025, T037 |
| FR-007 | T018, T038 |
| FR-008 | T029, T032, T033 |
| FR-009 | T020, T040 |
| FR-010 | T004, T031 |
| FR-011 | T009, T032, T033, T034, T035, T042 |
| FR-012 | T014, T015, T025, T040 |
| FR-013 | T005, T015, T016, T017, T022, T040 |
| FR-014 | T003, T006, T013, T043, T044 |
| FR-015 | Excluded per spec (PRD-12); no tasks |
| FR-016 | T036, T037, T039, T045 |
| SC-001 | T007, T041 |
| SC-002 | T001, T014, T015, T040 |
| SC-003 | T032, T033, T042 |
| SC-004 | T019, T040 |
| SC-005 | T043, T044 |

## FR/SC coverage gaps

- FR-015 is intentionally excluded by spec (PRD-12 out of scope) and has no tasks.
- No other gaps identified; every other FR and SC maps to at least one task.

## Open questions for the architect

1. Confirm the F17 migration range remains `20261107000000`-`20261107235959` (valid UTC) and does not overlap F18 or Plan Core ranges.
2. Assign the F17 database stack before any `[NEEDS-STACK]` task runs; do not let tasks pick a stack.
3. Resolve the deferred Major gate: enforce `coaching_work` in the explicitly selected template workspace for every workspace-template operation (PR #26 round 9).
4. Resolve the deferred Minor gate: preserve readiness when the canonical document hash is unchanged; clear readiness only after a changed hash (PR #26 round 9).
5. Confirm the final document byte cap from the SC-005 benchmark (provisional 512 KB).
6. Confirm F16 snapshot contract and exercise defaults are merged/available before F17 exercise-integration tasks.
7. Confirm F13 subscription lifecycle availability for first-delivery activation integration.
8. Confirm whether T001 role parity fixture should be owned by Luna or split with MiniMax for the TS side.