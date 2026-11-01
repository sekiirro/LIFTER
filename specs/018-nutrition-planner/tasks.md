# Tasks: F18 — Nutrition Templates & Nutrition Planner

**Input**: [spec.md](spec.md), [plan.md](plan.md) (Design section is binding). Shared Plan Core contract: [../019-plan-core/spec.md](../019-plan-core/spec.md). F16 catalog contracts: [../016-exercise-food-catalogs/spec.md](../016-exercise-food-catalogs/spec.md).

**Status**: Planning only. Every task is a 30-60 minute unit. Begin with its negative or contract test, capture RED, make the smallest implementation change, capture GREEN, and run its listed mutation check before marking complete. No task is authorized to run before the architect assigns the F18 database stack; UI tasks may proceed against mocked projections when their dependency class permits.

**Owner tags**: `OWNER=Luna` owns migrations, RLS, SECURITY DEFINER functions, security, authorization, idempotency, locking and benchmarks. `OWNER=MiniMax` owns non-sensitive TypeScript, UI, fixtures and client tests. Cross-owner handoffs name the receiving task explicitly.

**Tests**: Mandatory red-before-green. Run each named test first and record its intended failing assertion before its paired implementation; then run green plus relevant regressions.

## Migration range

`20261108000000`-`20261108235959` inclusive, valid UTC clock times (2026-11-08 00:00:00Z through 2026-11-08 23:59:59Z), per plan.md. F16 ended at `20261106195959`; the ranges do not overlap.

## Task format, ownership and execution rules

- Task entries use: `- [ ] **T0nn (45m) — Title.** `OWNER=X`. **[CLASS]**. Exact files: ... RED: ... GREEN: ... **Mutation:** ... No direct DB. ... Assigned stack required.
- `[INDEPENDENT]` — can start now, before F16 and Plan Core merge: pure TS schemas, validation, fixtures, UI on mocked projections, contract tests.
- `[NEEDS-F16]` — depends on the F16 catalog/food snapshot contract landing.
- `[NEEDS-PLAN-CORE]` — depends on the shared Plan Core contract landing.
- `[NEEDS-F13]` — depends on the F13 eligibility contract landing.
- `[NEEDS-STACK]` — database work; the architect assigns the stack later and no task here selects one.

## Phase 0 — Contract fixtures and independent foundations

- [x] **T001 (45m) — Freeze nutrition document schema v1 contract fixtures.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `lib/plans/nutrition/schema.ts`, `tests/unit/nutrition-schema.test.ts`. RED: assert `single_day` without required `implicitDayTypeId`, `seven_day` with duplicate or missing dayIndex, a `training_days_only` meal with no reachable training day, non-positive quantities and negative targets are rejected. GREEN: assert spec-valid payloads are accepted. **Mutation:** remove the always-required `implicitDayTypeId` rule and prove the test fails. No direct DB.

- [x] **T002 (45m) — Freeze canonical macro algorithm golden fixtures.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `lib/plans/nutrition/macros.ts`, `tests/golden/nutrition-macros.ts`. RED: parity fixture for exact decimal arithmetic and single half-even rounding to four decimals fails. GREEN: TypeScript and SQL pass the identical golden fixture set, including repeating fractions and precision boundaries. **Mutation:** switch the TypeScript implementation to double rounding and prove the fixture fails. No direct DB. SQL parity half deferred to the first F18 DB task ([NEEDS-STACK]); TS fixtures frozen.

- [ ] **T003 (45m) — Freeze publish payload ignore-caller-data and operation-replay contract.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `tests/contracts/nutrition-publish.test.ts`. RED: forged publish payloads carrying caller-supplied snapshots or totals must be ignored, and exact operation-key replays must return the stored result. GREEN: contract holds. **Mutation:** make the operation honor caller snapshots/totals and prove the contract test fails. No direct DB. → Folded into T009 (architect ruling S24-R1: contract is RPC-only per plan.md:31/35; forged snapshots/totals ignored + exact replay asserted in T009 integration).

- [ ] **T004 (45m) — Integrate shared Plan Core lifecycle controls into nutrition plans.** `OWNER=MiniMax`. **[NEEDS-PLAN-CORE]**. Exact files: `components/plans/NutritionPlanLifecycleControls.tsx`, `tests/unit/NutritionPlanLifecycleControls.test.tsx`. RED: nutrition plan lifecycle actions must preserve the Plan ID and keep drafts private. GREEN: shared Plan Core controls govern nutrition draft, readiness and publish actions. **Mutation:** add a nutrition-specific lifecycle control path and prove the shared-control contract fails. No direct DB.

- [ ] **T005 (45m) — Freeze client alternative selection contract.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `tests/contracts/nutrition-selection.test.ts`. RED: forged plan/version/client selection keys or coach-source overwrite must be rejected. GREEN: self-only selection contract holds. **Mutation:** allow selection to overwrite the coach source or accept a forged key and prove the test fails. No direct DB. → Folded into T010 (architect ruling S24-R1: self-only selection is RPC-only per plan.md:39).

## Phase 1 — Nutrition document persistence foundations

- [ ] **T006 (50m) — Model nutrition plan/draft/version document persistence.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE]**. Migration: `supabase/migrations/20261108000000_nutrition_plans.sql`. RED: clean migration yields valid document shapes, uniqueness and draft privacy invariants. GREEN: migration invariants pass. **Mutation:** drop a document check or unique constraint and prove the intended failing test is the one that fails. Assigned stack required.

## Phase 2 — Nutrition templates

- [ ] **T007 (50m) — Model global and workspace nutrition template roots and versions, incl. PO-only Make it Global.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16]**. Migration: `supabase/migrations/20261108010000_nutrition_templates.sql`. RED: global template rows without workspace scope or missing PO-only Make it Global guard. GREEN: template invariants pass. **Mutation:** expose Make it Global to staff or drop the FORCE RLS global read policy and prove the affected test fails. Assigned stack required.

## Phase 3 — Macro computation

- [ ] **T008 (50m) — Implement `app_private.nutrition_compute_totals` SQL function and TypeScript/SQL golden parity.** `OWNER=Luna`. **[NEEDS-F16]**. Migration: `supabase/migrations/20261108020000_nutrition_compute_totals.sql`. RED: SQL compute diverges from the golden fixtures. GREEN: SQL and TypeScript both pass the identical golden set. **Mutation:** change the rounding or drop serving-equivalence handling and prove the test fails. Assigned stack required.

## Phase 4 — Publish and selection RPCs (Plan Core)

- [ ] **T009 (50m) — Implement `publish_nutrition_revision` SECURITY DEFINER RPC.** `OWNER=Luna`. **[NEEDS-F16][NEEDS-PLAN-CORE]**. Migration: `supabase/migrations/20261108030000_nutrition_publish_rpc.sql`. RED: stale expected revision, unauthorized publish, retry duplicate, forged payload and caller-supplied snapshots/totals must fail or be ignored. GREEN: one atomic append-only revision under the existing Plan ID with one audit event. **Mutation:** honor caller snapshots/totals or drop the CAS and prove the affected test fails. Assigned stack required. RED: forged publish payloads carrying caller-supplied snapshots or totals must be ignored, and exact operation-key replays must return the stored result. GREEN: contract holds. **Mutation:** make the operation honor caller snapshots/totals and prove the contract test fails.

- [ ] **T010 (45m) — Implement client alternative selection RPC `select_nutrition_alternative`.** `OWNER=Luna`. **[NEEDS-F16][NEEDS-PLAN-CORE]**. Migration: `supabase/migrations/20261108040000_nutrition_selection_rpc.sql`. RED: forged selection keys, stale version writes and coach-source overwrite must be rejected. GREEN: self-only selection contract holds with generic failures. **Mutation:** allow source overwrite or accept a forged key and prove the test fails. Assigned stack required. RED: forged plan/version/client selection keys or coach-source overwrite must be rejected. GREEN: self-only selection contract holds. **Mutation:** allow selection to overwrite the coach source or accept a forged key and prove the test fails.

## Phase 5 — Coach alternatives UI

- [ ] **T011 (45m) — Build coach manual alternative configuration UI.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `components/plans/NutritionPlanAlternativesEditor.tsx`, `tests/unit/NutritionPlanAlternativesEditor.test.tsx`. RED: alternatives require validated portion quantity with calculated macros, unified list, no AI auto-adjust, no delta-versus-original display. GREEN: UI holds. **Mutation:** remove the max-three guard or allow AI auto-adjust or delta display and prove the test fails. No direct DB.

## Phase 6 — Template management UI

- [ ] **T012 (45m) — Build global/workspace nutrition template management UI.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `components/plans/NutritionTemplateManager.tsx`, `tests/unit/NutritionTemplateManager.test.tsx`. RED: PO-only Make it Global governance and workspace template scoping hold. GREEN: UI holds. **Mutation:** expose Make it Global to staff or drop the template list pagination cap and prove the test fails. No direct DB.

## Phase 7 — Export module

- [ ] **T013 (50m) — Integrate nutrition data with shared Plan Core/F17 export helpers.** `OWNER=MiniMax`. **[NEEDS-PLAN-CORE]**. Exact files: `lib/plans/nutrition/export.ts`, `tests/golden/nutrition-export-ar-en.test.ts`. RED: export must include meals, items, quantities, alternatives, per-meal/day totals, day types and the current permitted selection, check both authorization walls before any read, write coach-authored cells as strings and resist formula injection. GREEN: golden AR/EN artifacts pass using the shared RTL print layout and workbook skeleton. **Mutation:** write coach-authored cells as formulas or skip the current selection and prove the golden test fails.

## Phase 8 — Nutrition plan builder/editor UI

- [ ] **T014 (60m) — Build nutrition plan builder/editor UI.** `OWNER=MiniMax`. **[INDEPENDENT]**. Exact files: `components/plans/NutritionPlanEditor.tsx`, `tests/unit/NutritionPlanEditor.test.tsx`. Covers FR-002, FR-012, SC-003, SC-005. RED: single_day/seven_day structures, day types, conditional meals, exact quantities, per-meal/per-day totals, live totals with accessible announcements, keyboard alternatives to drag, AR-first RTL and EN, loading/empty/error/conflict states. GREEN: UI holds. **Mutation:** remove the keyboard-accessible drag alternative or the RTL/locale assertion and prove the test fails. No direct DB.

## Phase 9 — Audit, security, benchmark and release

- [ ] **T015 (50m) — Extend audit mapping and contributor attribution action codes.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16]**. Migration: `supabase/migrations/20261108050000_nutrition_audit_map.sql`. RED: audit allowlist and log-scrub assertions fail before mapping extension. GREEN: allowlist holds. **Mutation:** add a non-allowlisted audit field or drop an action code check and prove the test fails. Assigned stack required.

- [ ] **T016 (50m) — Complete SC-002 security matrix and mutation campaign.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16]**. Exact files: `tests/integration/nutrition-security-matrix.test.ts`. RED: foreign-workspace/foreign-client negatives, direct DML denial, creator masking, PO-without-membership read, forged selection, replay/conflict, concurrency and malformed-reference cases must fail closed before the matrix is implemented. GREEN: full denial matrix passes. **Mutation:** remove one named guard and prove the matching test fails. Assigned stack required.

- [ ] **T017 (50m) — Benchmark SC-006 envelope.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16]**. Exact files: `tests/integration/nutrition-benchmark.test.ts`. RED: Worker CPU p95 or DB/API p95 envelope fails against the fixed request mix. GREEN: envelope passes. **Mutation:** relax a named performance threshold and prove the benchmark fails. Assigned stack required.

- [ ] **T018 (50m) — Final migration, audit and release gate.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16]**. Exact files: `tests/integration/nutrition-release-gate.test.ts`. RED: migration range, zero direct DML, parity, mutation and gate assertions fail before the gate is implemented. GREEN: release gate passes. **Mutation:** remove a security-critical assertion and prove the gate fails. Assigned stack required.

## Phase 10 — Eligibility gate

- [ ] **T019 (45m) — Add eligibility-gated readiness/publish checks.** `OWNER=Luna`. **[NEEDS-F13][NEEDS-F16]**. Exact files: `tests/integration/nutrition-publish.test.ts`. RED: readiness/publish before eligibility fails closed. GREEN: eligibility gate holds. **Mutation:** bypass the eligibility check and prove the test fails. Assigned stack required.
- [ ] **T020 (45m) — Define stable IDs across non-duplicate nutrition edits.** `OWNER=MiniMax`. **[INDEPENDENT]**. Specify which quantity, note, reorder and other edits preserve item/alternative IDs and which invalidate selections; freeze fixtures for both carry-forward and invalidation behavior. Required before F18 feature PR merge (PR #26 round 9 Major). **Mutation:** change an ID rule and prove the corresponding carry-forward test fails. No direct DB.
- [ ] **T021 (50m) — Split seven-day nutrition editor interactions and calculations.** `OWNER=MiniMax`. **[INDEPENDENT]** (mock nutrition schema, Plan Core projection, and F16 food snapshots). Cover day type assignment, conditional meal visibility, reorder/duplicate ID mapping, exact quantity editing and live totals in a focused component/test unit. **Mutation:** drop conditional meal/day type behavior and prove its focused cases fail. No direct DB.
- [ ] **T022 (45m) — Split nutrition editor accessibility and state matrix.** `OWNER=MiniMax`. **[INDEPENDENT]** (mock authorized projection and mutation results). Cover AR/EN RTL, keyboard move alternatives, accessible total announcements, loading/empty/error/conflict states and mobile layout. **Mutation:** remove keyboard operation or live announcement and prove targeted test fails. No direct DB.
- [ ] **T023 (45m) — Split nutrition security matrix by authorization, ledger and data-integrity seams.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE]**. T016 owns workspace/client authorization and direct-DML denials; T023 owns replay/conflict, concurrent selection/publish, malformed references and forged payload coverage. **Mutation:** remove one named authorization/idempotency guard and prove the paired case fails. Assigned stack required.
- [ ] **T024 (45m) — Split nutrition release verification into migration/replay and final gates.** `OWNER=Luna`. **[NEEDS-STACK][NEEDS-F16][NEEDS-PLAN-CORE]**. Verify migration ordering/range, F16 -> Plan Core -> F17/F18 replay, audit atomicity and schema/macros parity. T018 owns final full gate inventory and evidence. **Mutation:** remove a migration compatibility assertion and prove release check fails. Assigned stack required.

## Dependency order

T001-T005 establish contract fixtures and mocked foundations. T020 freezes stable-ID semantics before merge. T006-T007 establish persistence. T008 computes totals. T009-T010 implement publish and selection against the Plan Core contract. T011-T014 and T021-T022 build UI on mocked projections; T013 consumes F17 shared exports. T015-T019 and T023-T024 are database/security/benchmark/release gates. T019 consumes the F13 eligibility contract.

## Parallel execution

- T001, T002 and T004 can run concurrently (separate lib/tests/components files).
- T003 and T005 can run concurrently with T001, T002 and T004 where file ownership permits (disjoint contract, fixture and component files).
- T011, T012 and T014 can run concurrently among themselves once the referenced fixtures are GREEN (no shared files).
- Database tasks (T006, T007, T015-T019) use the assigned stack lane and serialize.

## Traceability

| FR / SC | Task ids |
| --- | --- |
| FR-001 | T004, T009, T010 |
| FR-001b | T003, T009, T010 |
| FR-002 | T001, T006, T014 |
| FR-003 | T002, T008, T014 |
| FR-004 | T002, T008 |
| FR-005 | T003, T008, T009, T016 |
| FR-006 | T009, T010, T011 |
| FR-007 | T007, T012 |
| FR-008 | T006, T009, T013, T019 |
| FR-009 | T005, T010, T011, T013 |
| FR-010 | T005, T010, T013 |
| FR-010a | T015, T016 |
| FR-010b | T006, T015 |
| FR-011 | none (explicitly out of scope) |
| FR-012 | T004, T014 |
| FR-013 | T001, T002, T008, T013, T018 |
| SC-001 | T002, T008, T018 |
| SC-002 | T003, T009, T010, T016 |
| SC-003 | T006, T009, T013 |
| SC-004 | T002, T008 |
| SC-005 | T013, T014 |
| SC-006 | T008, T017, T018 |

**Unmapped FR/SC:** FR-011 is excluded by design (meal check-offs, consumption logs, AI alternatives and P5 replacement requests are out of scope), so it maps to no implementation task. No other FR/SC is unmapped.

## Open questions for the architect

- Confirm the database stack assignment before any `[NEEDS-STACK]` task starts; no task here selects a stack.
- Confirm which ledger backs first deliveries and activation (`app_private.registration_operations` or `app_private.operation_keys`) as deferred by Plan Core.
- Confirm the concrete outbox/retry table shape for the Plan Core activation retry contract.
- Confirm the typed-link migration shape for activation and the forward-only compatibility migration details.
- Resolve the deferred stable-ID definition for non-duplicate edits before the F18 feature PR merges.
- Confirm whether the client alternative-selection UI is delivered by F18 or remains a P4 handoff.
- Confirm the maximum document byte cap and shared byte cap before production benchmarking.
