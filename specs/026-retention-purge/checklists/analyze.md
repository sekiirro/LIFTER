# Spec Kit Analyze — F26 Retention Purge Entry Point (DP-08)

**Analysis date**: 2026-11-24T00:36:13Z (after spec.md, plan.md and tasks.md were written; no later requirement-text change).
**Inputs**: `spec.md`, `plan.md`, `tasks.md`.
**Scope**: Spec-only. No code, SQL, migration, scheduler activation, hosted change, or task tick.
**Authority**: S70-PO-1 item 3 (SHA-256 `D8E0EAF354F3923630BA38CD258EDD8E94DD63B86D9345405D40A520A790F20E`), S70-PO-3, S70-PO-4, S70-PO-5 (SHA-256 `FBE1F9186AD1B853890617EF4AAFCDE967C81C2518C466744EB1250C2697C957`), docs/13 DP-01/02/06/08 and OP-01, BR-01/BR-02/BR-04, FN-03, docs/04 S70 entries and D-10.

## Verdict

Within the decided scope: **0 open CRITICAL, 0 open HIGH**. The 30-day value, both clock starts, the open-refund/dispute hold and restart, the disabled scheduler, the open backup gate, D-10 authorization, RLS, idempotency, dry-run/evidence and mutation evidence are all encoded in numbered FRs, measurable SCs and Given/When/Then scenarios. Four implementation-facing PO questions are open and explicitly marked in the spec text; none is guessed, and none reopens a decided retention rule. No user-visible copy is added. The spec-only gate is satisfied; implementation requires its own later approval.

## Counts verified against the artifacts

- Functional requirements: 12 (FR-001..FR-012). Success criteria: 10 (SC-001..SC-010).
- User stories: 4 (Story 1 eligibility, Story 2 hold/restart, Story 3 authz/idempotency/dry-run/evidence, Story 4 scheduler/backup). All scenarios are Given/When/Then.
- Tasks: 16 (T001 documentation; T002–T008 test tasks with named test files, all RED-first; T009–T015 implementation; T016 final gates). Task ticks: 0.
- Open PO decisions: 4 (Q1 open-state list; Q2 deletion vs pseudonymization of immutable evidence; Q3 audit deletion mechanism; Q4 invoice objects). Each has 2–4 options, implications, a recommendation and a blocked-scope statement in `spec.md`, and a numbered MCQ in the lane report.
- `[NEEDS PO DECISION: Qn]` markers: Q1 in FR-004 and Story 2 scenario 1; Q2 in FR-001/FR-002/FR-011 and Story 1 scenario 5; Q3 in FR-011 and Story 1 scenario 5; Q4 in FR-001.
- Named test files: `tests/unit/retention-purge-clocks.test.ts`, `tests/unit/retention-purge-idempotency.test.ts`, `tests/integration/retention-purge-eligibility.test.ts`, `tests/integration/retention-purge-hold-restart.test.ts`, `tests/integration/retention-purge-dryrun-evidence.test.ts`, `tests/integration/retention-purge-authz.test.ts`, `tests/integration/retention-purge-audit.test.ts`, `tests/integration/retention-purge-scheduler-disabled.test.ts`; existing regression `tests/unit/backup-retention.test.ts`.
- Slice size: each test + implementation pair is planned as a small RED→GREEN slice (~400 changed lines) with one FR cluster per slice.

## Cross-reference review

- FR-001/FR-002/FR-003 ↔ SC-001 ↔ T002/T003/T009/T010: 30 days, active-account retention, audit-from-creation and no-delete-inside-window are aligned.
- FR-004 ↔ SC-002 ↔ T004/T010/T011: hold, no carry-over and restart from resolution are aligned; Q1 blocks finalisation of the open-state list.
- FR-005/FR-006 ↔ SC-006/SC-007 ↔ T008/T015: scheduler disabled and backup gate open are aligned with OP-01, BR-01/02/04 and FN-03.
- FR-007/FR-010 ↔ SC-003 ↔ T006/T013/T016: D-10 authorization and mutation evidence are aligned.
- FR-008/FR-009 ↔ SC-004/SC-005 ↔ T005/T012: dry-run and idempotency are aligned.
- FR-011 ↔ SC-001 ↔ T007/T014: audit clock from creation is aligned; Q2/Q3 block the mechanism.
- FR-012 ↔ SC-010 ↔ T001/T016: spec-only scope and no task tick are aligned.

## Ambiguities and conflicts recorded (not resolved by this feature)

1. S70-PO-5 "deleted 30 days after..." vs Constitution VII (`specs/011-client-accounts/plan.md:139-140`) and F13 (`specs/013-freeze-renewal-refunds/spec.md:323`) — Q2.
2. Immutable `public.audit_events` (`supabase/migrations/20261027150000_audit_log.sql:29-41`) vs DP-02 audit deletion — Q3.
3. No `invoices` table exists although S70-PO-4 names invoice data — Q4.
4. "Open refund/dispute" has no status enumeration in the PO sources — Q1.

## Findings

| Severity    | Open count | Findings                                                                                         |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------ |
| CRITICAL    | 0          | None within the decided scope.                                                                   |
| HIGH        | 0          | None within the decided scope.                                                                   |
| PO decision | 4          | Q1–Q4; marked in spec text and reported as numbered MCQs with recommendations. No guess encoded. |
