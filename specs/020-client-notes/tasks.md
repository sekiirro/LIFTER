# Tasks: F20 Client Notes

**Status**: Planning only. No implementation tasks are authorized until the PENDING-PO decisions are resolved and Analyze is rerun.

## Documentation / planning task

- [ ] **T001 [FR-001, FR-002, FR-003, FR-004, FR-005]** Prepare the spec-only feature contract, plan, data model, research, and decision register. Do not implement code or SQL. Evidence will be the reviewed artifacts and documentation gates; not implementation acceptance.

## Future implementation tasks (blocked by PO decisions)

- [ ] **T002 [FR-004, FR-005]** Confirm current Client Details authorization integration and record app/database role-action parity. Blocked by CN-MCQ-04 if current client Trainer scope is not explicit.
- [ ] **T003 [FR-002, FR-004, FR-005]** Add forward-only workspace/client note persistence and deny-by-default RLS, after a fresh all-origin migration scan. Blocked by CN-MCQ-02 and CN-MCQ-07.
- [ ] **T004 [FR-002, FR-003, FR-004]** Implement server-side read/create/edit/hard-delete boundaries using verified actor and existing membership/role model. Blocked by CN-MCQ-02, CN-MCQ-03, CN-MCQ-05, CN-MCQ-06, CN-MCQ-07 and CN-MCQ-11.
- [ ] **T005 [FR-001, FR-002, FR-003, FR-007]** Implement the approved bilingual Client Notes tab and interaction states within Client Details. Blocked by CN-MCQ-01, CN-MCQ-02, CN-MCQ-03, CN-MCQ-08, CN-MCQ-09, CN-MCQ-10, CN-MCQ-11 and CN-MCQ-12.
- [ ] **T006 [FR-004, FR-005]** Add RLS/integration denial tests for every role/action, revoked membership, forged scope and cross-workspace access, plus authorized actor cases.
- [ ] **T007 [FR-001, FR-002, FR-003, FR-004, FR-005]** Run independent UI/security review, Analyze, repository checks, and required PR gates on the implementation head.

## Dependency order

Resolve MCQs and rerun Analyze first. T002 precedes T003–T005; T003 and T004 precede the integrated tab; T006 verifies all boundaries; T007 is last. Every implementation task remains unchecked until its tests have executed and passed on the implementation head.
