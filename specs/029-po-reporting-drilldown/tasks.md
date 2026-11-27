# Tasks: PO aggregate reporting drill-down

**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/. No task is done by this docs-only PR.

## Phase 1: Authorization and aggregate RED

- [ ] T001 [US1] [FR-002,FR-003,FR-005] RED route/RPC tests for PO, own/foreign WO, Trainer, Sales, Client, revoked and anonymous access; include direct RPC and count/existence probes before reader changes. Preserve existing WO workspace report authorization.
- [ ] T002 [US1] [FR-003,FR-005] RED row-level tests prove own-workspace boundary and selected workspace filters before aggregation.
- [ ] T003 [US1] [FR-004,FR-006] RED fixture proves PO platform total → workspace subtotal → source rows using established BRD/PRD measures; assert period boundaries and currency partitions.

## Phase 2: Reconciliation and bounded readers

- [ ] T004 [US1] [FR-004,FR-006] RED synthetic fixtures reconcile parent totals to source rows across each PO-approved dimension and currency; test rounding, reversals/refunds, and pending FX according to existing source semantics.
- [ ] T005 [US1] [FR-004,FR-005,FR-006] Extend the identified existing `/reports` aggregate reader/RPC using only established measures and then MCQ-approved dimensions; preserve currency/event representation, validated filters and bounded deterministic cursor.
- [ ] T006 [US1] [FR-005,FR-008] Verify integer minor-unit math, period boundaries, stable pagination, query bound, safe generic errors, and exclusion of leaderboard/export/audit browsing.

## Phase 3: Existing report view and acceptance

- [ ] T007 [US1] [FR-001,FR-008] Extend existing ReportsView, do not add another page; add states, locale and accessibility coverage.
- [ ] T008 [US1] [FR-001..008] Add explicit negative UI/contract checks proving leaderboard, comprehensive export, raw audit browsing, and new WO cross-workspace access are absent.
- [ ] T009 [US1] [FR-001..008] Run FR acceptance, security/RLS, finance reconciliation and UI suites on exact implementation head; add executed evidence to traceability.

Dependencies: T001-T004 RED tests precede reader implementation. Resolve MCQ 029-01 before selected dimensions are added. T005-T006 precede T007-T008; run T009 after all preceding work. No copy is implemented until PO approves each affected screen.
