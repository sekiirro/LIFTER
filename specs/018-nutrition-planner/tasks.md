# Tasks: F18 — Nutrition Templates & Nutrition Planner

**Input**: [spec.md](spec.md) (requirements), [plan.md](plan.md) and [data-model.md](data-model.md) (design is binding), [contracts/](contracts/), the pending F19 Plan Core contract at `C:/Users/NEW LAP/Desktop/LFTR-s42-f19/specs/019-plan-core/`, F16 catalog contracts on `main`.

**Status**: Updated spec-only draft (S43, 2026-11-10). Every task is unticked. No implementation, migration, test or workflow change is authorized by this file. Implementation entry requires the F19 contract merged; S43-MCQ-A is resolved by S43-PO-5 (architect mapping (S43-R6)). S43-MCQ-B is resolved by S43-PO-2.

**Execution rule per task**: write the named failing test first and record the intended failing assertion (RED); make the smallest implementation change; run the named test and the relevant regressions (GREEN); run the listed mutation and prove the intended test fails; restore. A task is ticked only with executed evidence cited in [traceability.md](traceability.md).

**Ownership tags**: `SKILL=DB/SECURITY` (migrations, RLS, SECURITY DEFINER, locking, idempotency), `SKILL=TS/DOMAIN` (schema, arithmetic, contracts), `SKILL=UI/DESIGN` (design-system UI, RTL, accessibility), `SKILL=EXPORT` (PDF/Excel/prompt), `SKILL=TEST` (fixtures, negative matrices, benchmarks). `RISK=HIGH|MEDIUM|LOW`. No agent or model name is recorded here.

**Dependency tags**: `[INDEPENDENT]`, `[NEEDS-F16]` (landed), `[NEEDS-F19]` (pending), `[NEEDS-STACK]`, `[PROMPT-APPROVED-S43-PO-5]`.

## Phase 0 — Frozen contracts and fixtures

- [ ] **T001 (45m) - Nutrition document v1 validator fixtures.** `SKILL=TS/DOMAIN`, `RISK=MEDIUM`. `[INDEPENDENT]`. Files: `lib/plans/nutrition/schema.ts`, `tests/unit/nutrition-schema.test.ts`. RED: reject `single_day` without `implicitDayTypeId`, duplicate/missing `dayIndex`, duplicate ids, unknown keys, non-positive quantity, non-declared unit, wrong-host or non-HTTPS recipe URL; assert conditional visibility by matching day type and leave no-matching-day Ready/publish validation blocked pending S44-MCQ-F18-1. GREEN: accept the valid single-day and seven-day fixtures. **Mutation**: remove the always-required `implicitDayTypeId` rule; the paired test must fail. Covers F18-FR-002, F18-FR-004, F18-FR-006 (alternative shape), F18-FR-021. No DB.
- [ ] **T002 (60m) - Canonical macro/total goldens (TS half).** `SKILL=TS/DOMAIN`, `RISK=HIGH`. `[INDEPENDENT]`, `[RESOLVED-S43-PO-1: half-up display; S43-R9 Sol-1 exact persistence]`. Files: `lib/plans/nutrition/macros.ts`, `tests/golden/nutrition-macros.ts`. RED: finite-decimal ties and precision boundaries, exact `1.44996 -> 1.4` at one decimal, aggregates-not-from-rounded-items, inactive conditional meals excluded from day totals, alternatives and selected-alternative values. GREEN: exact decimal persistence and half-up display once from exact values. **Mutation**: round at storage, sum displayed values into a total, or include a rest-day-inactive meal in its day total; a golden must fail. Covers F18-FR-002, F18-FR-003, F18-FR-004. No DB.
- [ ] **T003 (45m) — Publish ignore-caller-data contract.** `SKILL=TEST`, `RISK=HIGH`. `[INDEPENDENT]`. Files: `tests/contracts/nutrition-publish.test.ts`. RED: a payload carrying snapshots/totals must be ignored; an identical key/request returns the original receipt; a new authorized operation key appends a revision and delivery even when content is unchanged; a missing food version aborts. GREEN: contract holds at the RPC boundary. **Mutation**: conflate fresh publish with exact replay; the contract test must fail. Covers F18-FR-005, F18-FR-019. No DB.
- [ ] **T004 (45m) - Selection contract.** `SKILL=TEST`, `RISK=HIGH`. `[INDEPENDENT]`. Files: `tests/contracts/nutrition-selection.test.ts`. RED: forged plan/version/client/item/alternative tuples, coach-source overwrite, stale revision and clear-to-default are all asserted; clear then select advances the durable per-revision counter, while a no-op does not. GREEN: self-only, ids-only, derived totals, generic failures. **Mutation**: accept an alternative id not in the item list or reset the selection counter after clear; a paired test must fail. Covers F18-FR-011..013, F18-FR-016.
- [ ] **T005 (45m) — Export and prompt fidelity contract.** `SKILL=EXPORT`, `RISK=MEDIUM`. `[INDEPENDENT]`, `[RESOLVED-S43-PO-5: byte-exact approved body]`. Files: `tests/contracts/nutrition-export-contract.test.ts`. RED: missing meal/quantity/macro/alternative/note/link, formula prefix executed, selected content primary, recalculated totals, labelled per-item coach-original note in PDF/Excel and copied prompt; totals rows contain client-selection totals only; prompt invention instruction. GREEN: faithful projection; both sides carried separately. **Mutation**: drop the client selection section; the contract test must fail. Covers F18-FR-006 (alternatives in export), F18-FR-014, F18-FR-015. No DB.
- [ ] **T006 (45m) — Assignment state-machine contract.** `SKILL=TS/DOMAIN`, `RISK=MEDIUM`. `[INDEPENDENT]`, `[RESOLVED-S43-PO-1: skip and report any held copy]`. Files: `lib/plans/nutrition/template-assignment.ts`, `tests/unit/nutrition-assignment.test.ts`. RED: All×All on partial workspace, future workspace, duplicate copy, overwrite, retired template, nutrition/workout independence. GREEN: pure state machine returns the per-target outcome. **Mutation**: make All top up a partial workspace; the test must fail. Covers F18-FR-008, F18-FR-009.

## Phase 1 — Persistence

- [ ] **T007 (60m) — Revision content table and immutability.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F19][NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-content.test.ts`. RED: content without revision, two contents for one revision, UPDATE/DELETE/TRUNCATE allowed, foreign-workspace read. GREEN: 1:1 insert-only table with composite key and RLS. **Mutation**: drop the unique constraint or the append-only trigger; the paired test must fail. Covers F18-FR-002, F18-FR-005, F18-FR-020.
- [ ] **T008 (60m) - SQL compute function and TS parity.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F16][NEEDS-STACK]`. Files: `app_private.nutrition_compute_values`, `tests/integration/nutrition-parity.test.ts`. RED: SQL disagrees with finite-decimal tie and double-rounding goldens (including exact `1.44996 -> 1.4` at one decimal), includes a conditional meal on an inactive day in totals, or accepts a cross-basis unit. GREEN: exact persistence, condition-aware totals and identical serialized outputs with half-up applied once at display. **Mutation**: round at storage, aggregate from rounded items, or sum an inactive meal; the paired test must fail. Covers F18-FR-002, F18-FR-003, F18-FR-004, F18-SC-001, F18-SC-011.
- [ ] **T009 (60m) — `publish_nutrition_revision`.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F19][NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-publish.test.ts`. RED: stale expected revision, unauthorized publish, no current subscription, forged snapshots, missing food version, duplicate revision. GREEN: one atomic revision + content under the F19 transaction. **Mutation**: remove the caller-data ignore or the CAS; the paired test must fail. Covers F18-FR-001, F18-FR-005, F18-FR-019.
- [ ] **T010 (60m) - `select_nutrition_alternative`.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F19][NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-selection.test.ts`. RED: forged ids, foreign client, expired subscription, stale revision, coach overwrite, direct DML, no-op select/clear writing nothing; clear then reselect advances the durable revision counter. GREEN: self-only upsert/delete with generic failures, required denial audits and audited real changes. **Mutation**: accept a caller-supplied client id or store the counter on the deletable selection row; the paired test must fail. Covers F18-FR-011, F18-FR-013, F18-FR-016, F18-FR-019.
- [ ] **T011 (45m) — Selection carry-forward in publish.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F19][NEEDS-STACK]`. Files: publish migration update + `tests/integration/nutrition-carry-forward.test.ts`. RED: a selection carried across a removed item, a replaced food reference, a deauthorized client, or a concurrent publish/selection race. GREEN: carry only for the same stable item+alternative ids and authorized client; otherwise none. **Mutation**: carry by position/name; the paired test must fail. Covers F18-FR-012.
- [ ] **T012 (60m) — Template tables (global and workspace).** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-templates.test.ts`. RED: workspace read of a global template, non-PO global write, cross-workspace template read, UPDATE of a version. GREEN: platform-scope global tables (no workspace read policy), tenant-scope workspace tables with composite FKs. **Mutation**: add a workspace SELECT policy on the global table; the isolation test must fail. Covers F18-FR-007, F18-FR-009.
- [ ] **T013 (60m) — Template CRUD/version/retire/load RPCs.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-template-rpcs.test.ts`. RED: staff global write, retired template load, load cross-workspace, version without expected match, load into a non-empty draft (must refuse), load does not deep-copy. GREEN: immutable versioning, non-destructive retire, independent creation-time copy. **Mutation**: make load share the source object / live-link; the paired test must fail. Covers F18-FR-007, F18-FR-009, F18-FR-019.
- [ ] **T014 (60m) - `assign_nutrition_templates`.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`, `[RESOLVED-S43-PO-1: skip and report any held copy]`. Files: migration + `tests/integration/nutrition-assign.test.ts`. RED: non-PO assign, all-by-all on a partial workspace, duplicate copy, overwrite, future workspace, authorized replay before zero-copy validation, concurrent replay, retired held copy skipped/reported, retired template between resolution and copy, and new-operation zero-copy rejected before writes. GREEN: one atomic batch with per-target outcomes only when at least one copy is created, while exact committed replays return the original batch. **Mutation**: make All target initialized workspaces or apply the zero-copy check before replay lookup; the paired test must fail. Covers F18-FR-008, F18-FR-019, F18-SC-007.
- [ ] **T015 (45m) — `make_nutrition_template_global`.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: migration + `tests/integration/nutrition-make-global.test.ts`. RED: non-PO, private content present, source mutated, duplicate global on a key retry, retired source promoted. GREEN: separate global identity/version with field-code refusal. **Mutation**: strip private fields silently instead of refusing; the paired test must fail. Covers F18-FR-007, F18-SC-009.

## Phase 2 — Attribution, security and operations

- [ ] **T016 (45m) — Audit allowlist and log scrub.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: audit mapping migration + `tests/integration/nutrition-audit.test.ts`. RED: forbidden field in an event, missing event for a success/denial, duplicate event. GREEN: one event per action, ids/codes only, zero health-content occurrences. **Mutation**: add a food name to the audit payload; the scrub test must fail. Covers F18-FR-016, F18-SC-010.
- [ ] **T017 (45m) — Contributor attribution.** `SKILL=DB/SECURITY`, `RISK=MEDIUM`. `[NEEDS-F19][NEEDS-STACK]`. Files: migration or F19 integration + `tests/integration/nutrition-contributors.test.ts`. RED: foreign-workspace contributor row, mutable contributor row, missing contributor after a second staff edit. GREEN: immutable workspace-scoped set per revision. **Mutation**: allow a contributor row from another workspace; the test must fail. Covers F18-FR-018. Reconcile with F19 ownership (conflicts F18-C-11).
- [ ] **T018 (60m) — Authorization and security matrix.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: `tests/integration/nutrition-security-matrix.test.ts`. RED: every row of `contracts/nutrition-api.md` §8 fails before the guard exists. GREEN: full denial matrix. **Mutation**: remove one named guard per run; the matching row must fail. Covers F18-FR-017, F18-SC-002.
- [ ] **T019 (45m) — Concurrency and idempotency matrix.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: `tests/integration/nutrition-concurrency.test.ts`. RED: 100 concurrent/replayed publishes, selections, loads and assigns; ambiguous commit retry. GREEN: one result, no duplicates, no partial batch. **Mutation**: remove the plan-root lock before selection; a race test must fail. Covers F18-FR-019, F18-SC-002.
- [ ] **T020 (45m) — Schema/algorithm version freeze.** `SKILL=TS/DOMAIN`, `RISK=MEDIUM`. `[NEEDS-STACK]`. Files: `tests/integration/nutrition-versioning.test.ts`. RED: a new algorithm relabels an old revision; an unknown schema version is rendered. GREEN: frozen per revision; unknown version refused. **Mutation**: reinterpret a v1 document with v2 rules; the test must fail. Covers F18-FR-020.
- [ ] **T021 (45m) — Benchmark envelope.** `SKILL=TEST`, `RISK=MEDIUM`. `[NEEDS-STACK]`. Files: `tests/integration/nutrition-benchmark.test.ts` + recorded envelope. RED: envelope undefined. GREEN: maximum document/request mix measured; provisional targets replaced with evidence-backed numbers. **Mutation**: relax a recorded threshold; the benchmark must fail. Covers F18-SC-006.

## Phase 3 — Snapshot, exports and UI

- [ ] **T022 (60m) - Per-version, tagged-unit snapshot build.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-F16][NEEDS-F19][NEEDS-STACK]`. Files: publish snapshot builder + `tests/integration/nutrition-snapshots.test.ts`. RED: two items of one food version with different serving units; basis `g` and catalog key `g` remain distinct; a serving with `basis_qty = 100`; a wrong version; a float round-trip. GREEN: one entry per tagged unit identity; exact fixed-scale strings; removed/merged versions still publish the exact referenced version. **Mutation**: drop the unit-kind tag from the key or key the map by food id only; the paired test must fail. Covers F18-FR-002, F18-FR-004, F18-FR-005, F18-SC-001.
- [ ] **T023 (60m) - PDF and Excel export.** `SKILL=EXPORT`, `RISK=MEDIUM`. `[NEEDS-STACK]`, `[RESOLVED-S43-PO-2: totals rows show client-selection totals only]`. Files: `lib/plans/nutrition/export.ts`, `tests/golden/nutrition-export-ar-en.test.ts`. RED: missing frozen food names/serving labels when no selection exists, missing content, formula execution, both walls not checked, current-revision selection plus recalculated totals; historical-revision export uses that revision’s last valid selection; coach original per-item note; totals rows client-selection totals only; missing audit. GREEN: current and historical revision goldens assert the last valid selection scoped to the exported revision (S43-PO-8; architect mapping (S43-R10)). **Mutation**: substitute the current revision selection into a historical-revision export; the historical golden must fail. Covers F18-FR-006, F18-FR-014, F18-SC-005.
- [ ] **T024 (45m) — Copy AI Prompt.** `SKILL=EXPORT`, `RISK=MEDIUM`. `[RESOLVED-S43-PO-5: copy-ai-prompt-approved.md P3/P4; compare bytes after {{PLAN_CONTENT}} substitution]`. Files: `lib/plans/nutrition/prompt.ts`, `tests/unit/nutrition-prompt.test.ts`. RED: invented meal, adjusted amount, replaced alternative, missing note/link, EN/AR prompt bytes differ from the approved locale contract after {{PLAN_CONTENT}} substitution, coach original per-item note, client-selection totals only, wrong actor (actor is resolved to staff export permissions). GREEN: faithful prompt from the PO-approved body template; body must match the approved locale contract byte-for-byte after substitution. **Mutation**: add an instruction to "improve" quantities; the test must fail. Covers F18-FR-015, F18-SC-005.
- [ ] **T025 (60m) — Editor, alternatives and template-manager UI.** `SKILL=UI/DESIGN`, `RISK=MEDIUM`. `[NEEDS-STACK]` + copy gate. Files: `components/plans/nutrition/*`, `tests/unit/Nutrition*.test.tsx`. RED: missing keyboard move alternative, missing live total announcement, missing unavailable-retired-loading states, AR/EN RTL regressions, unapproved copy. GREEN: design-gate matrix passes. **Mutation**: remove the keyboard alternative or the live region; the paired test must fail. Covers F18-FR-006, F18-FR-021.
- [ ] **T026 (45m) — Multi-plan projection regression.** `SKILL=DB/SECURITY`, `RISK=MEDIUM`. `[NEEDS-F19][NEEDS-STACK]`. Files: `tests/integration/nutrition-multi-plan.test.ts`. RED: a second delivered nutrition plan hidden; a later revision changing counts. GREEN: all delivered plans visible, counts unchanged. **Mutation**: filter to the first plan; the test must fail. Covers F18-FR-010, F18-SC-003.
- [ ] **T027 (60m) — Release gate and migration audit.** `SKILL=DB/SECURITY`, `RISK=HIGH`. `[NEEDS-STACK]`. Files: `tests/integration/nutrition-release-gate.test.ts`. RED: migration range collision, direct DML present, parity/frozen-version/audit assertions absent. GREEN: gate passes on fresh replay and on upgrade. **Mutation**: remove a security assertion; the gate must fail. Covers F18-FR-020, F18-SC-001, F18-SC-002, F18-SC-004.

## Dependency order

T001–T006 fix the contracts. T007–T015 build persistence and RPCs after F19 merges. T016–T021 close attribution/security/operations. T022 must land with T009 (snapshot build inside publish). T023/T024 depend on T005; prompt templates have per-locale byte-equality acceptance. T025 depends on the copy gate and the design gate. T026 needs F19's projection. T027 runs last.

## Parallelism

- T001, T002, T003, T004, T006 are disjoint files and can run concurrently; T005 waits for its MCQs.
- T008 can start once T002 freezes the goldens; T009/T010/T011 share the same feature stack lane and serialize.
- T012–T015 share template files and serialize.
- T016, T018, T019 are read-mostly matrices and can follow their target RPCs.
- T023/T024/T025 are independent surface files once their contracts are fixed.

## Open questions blocking tasks

| MCQ                                                            | Blocks                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Resolved S43-MCQ-A (S43-PO-5; prompt body EN/AR byte equality) | T024 body assertions                                                                                |
| Resolved S43-MCQ-B (S43-PO-2)                                  | T005, T023, T024: prompt per-item note; client-selection totals only                                |
| Resolved S43-F18-MCQ-7 (S43-PO-8)                              | T023 historical-revision last-valid-selection behavior and golden are specified; task is unblocked. |
| S44-MCQ-F18-1                                                  | T001 validation outcome for a training-only meal with no matching day; other schema work proceeds.  |

## Coverage

| Requirement | Tasks                              |
| ----------- | ---------------------------------- |
| F18-FR-001  | T009, T026                         |
| F18-FR-002  | T001, T007, T022, T025             |
| F18-FR-003  | T002, T008, T022                   |
| F18-FR-004  | T001, T002, T008, T022             |
| F18-FR-005  | T003, T009, T022                   |
| F18-FR-006  | T001, T005, T023, T025             |
| F18-FR-007  | T012, T013, T015                   |
| F18-FR-008  | T006, T014                         |
| F18-FR-009  | T006, T012, T013                   |
| F18-FR-010  | T026                               |
| F18-FR-011  | T004, T010                         |
| F18-FR-012  | T004, T011                         |
| F18-FR-013  | T004, T010, T023                   |
| F18-FR-014  | T005, T023                         |
| F18-FR-015  | T005, T024                         |
| F18-FR-016  | T010, T016                         |
| F18-FR-017  | T018                               |
| F18-FR-018  | T017                               |
| F18-FR-019  | T003, T009, T010, T013, T014, T019 |
| F18-FR-020  | T020, T027                         |
| F18-FR-021  | T001, T025                         |
| F18-FR-022  | none (excluded scope by design)    |
| F18-SC-001  | T002, T008, T022, T027             |
| F18-SC-002  | T018, T019, T027                   |
| F18-SC-003  | T026                               |
| F18-SC-004  | T001, T008, T027                   |
| F18-SC-005  | T005, T023, T024                   |
| F18-SC-006  | T021                               |
| F18-SC-007  | T006, T014                         |
| F18-SC-008  | T004, T010, T011                   |
| F18-SC-009  | T012, T015                         |
| F18-SC-010  | T016                               |
| F18-SC-011  | T002, T025 (half-up tie fixtures)  |
