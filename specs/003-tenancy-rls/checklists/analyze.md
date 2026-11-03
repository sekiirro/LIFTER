# Spec Kit Analyze — F3 governance amendment

- Date: 2026-11-03 (refreshed after explicit open-ambiguity statement)
- Analyzed source commit: `d04ef52` (`origin/main` at branch creation). This amendment is documentation-only.
- Scope: S30-PO-3 Q6 source record and Q7 active-member roster / Q8 final-PO guard.
- Method: static analysis of spec, plan, tasks, test/code tree and Constitution v1.5.0. No tests or builds run.

## Inventory and entry check

- Present at base: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/db-contract.md`, `tasks.md`, `checklists/requirements.md`. `checklists/analyze.md` and `traceability.md` were missing and are added in this cycle.
- Existing requirements: FR-001..FR-012, SC-001..SC-004, Given/When/Then user stories. This amendment adds FR-013..FR-014, SC-005..SC-006 and two explicit scenario groups.
- Clarifications cite S30-PO-3 Q6/Q7/Q8. Unresolved product questions are listed in the out-of-repository SK-A PO register.
- Plan covers forward-only database RLS/guard design, executed mutation tests and security review. T014..T016 are FR tagged and unchecked. S30-PO-3 Q6 is recorded as resolved in spec and plan.
- Entry gate for implementation: FAIL pending PO clarification and architect security review.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Ambiguity / access scope | HIGH | `spec.md` FR-013; PO register SK-003-04..06 | Q7 approves active-member visibility but does not define workspace boundary or which member fields a WO can read. | Do not implement FR-013 until PO answers. |
| A2 | Ambiguity / data semantics | MEDIUM | `spec.md` FR-013 / SC-006; PO register SK-003-06 | The existing membership model distinguishes active/revoked, but Q7 does not separately state whether `revoked_at IS NULL` is the accepted active predicate for this roster. | Confirm PO interpretation before policy and tests. |
| A3 | Concurrency / lockout | HIGH | `spec.md` FR-014; PO register SK-003-08 | Q8 approves a database guard but not concurrent remove/demote serialization or behavior when two mutations race. | Keep implementation blocked pending decision and architect review. |
| A4 | Failure contract | MEDIUM | `spec.md` FR-014 / SC-005; PO register SK-003-09 | Database rejection is approved, but the SQL/API error contract is unspecified. | Do not add user-facing error semantics until PO decides. |
| A5 | Traceability | MEDIUM | `traceability.md` FR-013/FR-014 and SC-005/SC-006 rows | No shipped code or asserting tests for FR-013/FR-014 or SC-005/SC-006 exist on analyzed commit; the existing 16 FR/SC rows are also mapped statically. | Rows correctly remain NOT-FOUND; tests are future tasks. |
| A6 | Cross-artifact task coverage | LOW | `tasks.md` T014..T016 | Amendment tasks are tagged; T016 is shared review/evidence work. | Coverage recorded 2/2 FRs; 2/2 SCs. |
| A7 | Operation semantics | HIGH | `spec.md` FR-014 / SC-005; PO register SK-003-10 | Q8 says the database refuses to "remove" the final PO but does not identify whether this means staff-profile deletion, auth-user deletion, role demotion, or another operation. | Do not choose the protected mutation; T015/T016 remain blocked pending PO decision. |

## Coverage and constitution

- FR to task coverage: 2/2 (100%); SC to task coverage: 2/2 (100%).
- Task to requirement coverage: all amendment tasks map to FR-013/FR-014. T014/T015/T016 remain unchecked.
- Constitution v1.5.0 review: Principle I isolation and Principle III least-authority governance make RLS/security review relevant; Principle VI requires preserving membership history. No implementation-level conformity claim is made before code and executed tests exist.

## Static traceability

`traceability.md` contains 20 feature rows: 6 VERIFIED, 10 PARTIAL, 4 NOT-FOUND, 0 DEFERRED. All 16 existing FR/SC test citations were checked on the analyzed commit; the four amendment rows are NOT-FOUND. No test suite was run.

## Verdict

**FAIL — implementation gate blocked**: 3 HIGH, 3 MEDIUM, 1 LOW. The requirements capture only PO-approved behavior; open subquestions remain escalated. Do not implement until the HIGH items are resolved.

## History

- Refresh: spec clarification explicitly lists the open ambiguities and points to the external SK-A register; no ambiguity was resolved.

- Refresh: Q6 provenance is now reflected in spec and plan; T014/T015 precede T016 in the task dependency graph. "Remove" operation semantics are separately escalated as SK-003-10. The PO register consolidates roster field and contact visibility in SK-003-05. The FR-006 literal matrix test plus bidirectional parity prove the approved S30-PO-3 Q6 coaching_work roles; FR-006 is VERIFIED.

- First SK-A amendment analysis on `origin/main` `d04ef52`; no prior Analyze history.
- Refresh: plan ND-F3-2/ND-F3-3 now quote the resolved S30-PO-3 Q7/Q8 behavior and link the remaining subquestions to SK-003-04..09. No requirement meaning changed.
