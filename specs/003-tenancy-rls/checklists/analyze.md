# Spec Kit Analyze — F3 Workspace Tenancy, Permission Matrix & RLS (reconciled)

- Date: 2026-11-04 19:38 +02:00 (re-run after the S33 CodeRabbit docs fixes; reconcile with S30-PO-3 Q6-Q8, S30-R8, and #47 compliance reconciliation)
- Analyzed source commit: `feb57374e6c429960f6738dafcdc34b939f6053e` (pre-fix branch head on `speckit-003-governance`; the working tree corrects the traceability totals and removes stale unresolved-Q7 wording without changing the numbered FRs or SCs).
- Static code/test evidence baseline: `d04ef52` (branch base; no code or test files changed in this amendment).
- Scope: F3 baseline (`FR-001`..`FR-012`, `SC-001`..`SC-004`) plus the S30-PO-3 Q7/Q8 governance amendment reconciled by architect ruling S30-R8 (`FR-013`, `FR-014`, `SC-005`, `SC-006`).
- Method: static cross-artifact, migration, workflow, and test-source review. No tests, builds, or CI were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..014, SC-001..006, four GWT story groups), `plan.md`, `tasks.md` (T001-T016), `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`, `traceability.md`, and this analysis.
- `spec.md` has numbered FRs including `FR-013`/`FR-014`, measurable `SC-005`/`SC-006`, and Given/When/Then acceptance scenarios for both governance behaviors, including column boundary denial, concurrent last-PO demotions, and all six mixed operation-pair races.
- Clarifications: S30-PO-3 Q6 resolves `coaching_work` as PO/WO/Trainer allowed and Sales denied; Q7/Q8 scope details are resolved for the approved scope by S30-R8 and captured in FR-013/FR-014 and SC-005/SC-006. Implementation remains tracked by T014-T016 and is not claimed complete here.
- Plan/tasks: T001-T016; T001-T013 cover the F3 baseline with explicit FR tags, T014/T015/T016 cover FR-013/FR-014 and SC-005/SC-006. No task checkbox changed. The plan records ND-F3-2 and ND-F3-3 as resolved and retains both `Project Structure` and `Complexity Tracking` sections present in parents `11657c3` and `ff6e0b9`.
- Entry check for a future implementation round: requirements and scenarios PASS; clarification PASS for the approved Q7/Q8 scope; plan/tasks PASS; Analyze is dated after spec/plan/tasks and has zero open CRITICAL/HIGH findings. T015 implementation remains blocked by the separately escalated auth-user deletion cascade contract pending explicit PO approval; no requirement change is made for that question in this docs round. Implementation still requires the listed mutation tests and architect security review.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist, but the tests do not establish every helper condition or every attempted identity-widening path. | Keep FR-004 PARTIAL pending broader assertions. |
| None | — | — | — | No open duplication, task coverage, terminology, or constitution defect remains in this amendment. | The roster column boundary and cross-operation serialization/test plan are now explicit; T014/T015 completion no longer depends on T016. S30-R8 resolves the earlier scope, active-state, operation, and failure-contract questions within the PO-approved Q7/Q8 scope; the narrower auth-user deletion cascade implementation contract is escalated as a PO decision and blocks T015 implementation pending explicit approval. |

## Coverage and constitution

- FR-to-task coverage: FR-001..FR-012 map to T001-T013 (12/12, 100%); FR-013 and FR-014 each map to implementation and shared review/evidence tasks (T014/T015/T016), 2/2 (100%).
- SC-to-task coverage: SC-001..SC-004 map to T001-T013; SC-005 maps to T015/T016 and SC-006 maps to T014/T016 (2/2, 100%).
- Every amendment task maps to FR-013/014 and/or SC-005/006; no orphan governance task found.
- Constitution v1.5.0: Principle I requires workspace isolation; Principle III requires least-authority governance; Principle VI preserves membership history. The clarified own-workspace boundary and active predicate are consistent with these principles. The analysis makes no implementation-conformity claim without code and executed tests.

## Static traceability

`traceability.md` covers 20 feature rows: 5 VERIFIED, 11 PARTIAL, 4 NOT-FOUND, 0 DEFERRED. The existing feature citations are statically checked against `d04ef52`; exact test paths and names were checked against the `ed88574` source tree. FR-013/FR-014 and SC-005/SC-006 remain NOT-FOUND because no implementation or asserting tests exist on the evidence baseline. No test suite or CI job was run. PARTIAL rows identify gaps in composite/schema assertions, source confirmation, coverage breadth, CI workflow assertions, migration direction, and PII scans.

## Implementation gates (not Analyze defects)

- T014 and T015 remain open until their respective forward-only implementations and executed asserting mutation tests are complete. T016 follows both and remains open until architect security review and review/evidence records are complete.
- T015 implementation is blocked pending the PO decision recorded in the S33 run report on whether the `staff_profiles.user_id` foreign key should become `ON DELETE CASCADE` or the auth-user deletion cascade should be removed from the requirement. No option was applied in this docs round.
- These are implementation evidence/security/PO-approval gates, not open CRITICAL/HIGH analysis findings. Tests were not run as part of this static documentation review.

## Verdict

**PASS — 0 open findings** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW). The governance amendment is ready for implementation planning under its explicit field boundary, shared serialization protocol, pairwise test requirements, and security-review gates; decision records close prior PO ambiguities. T015 implementation remains blocked by the escalated auth-user deletion cascade PO decision recorded in the S33 run report. Two approved behaviors require implementation; static traceability retains PARTIAL rows for gaps in assertion breadth. This static document review does not claim implementation completion.

## History

- First SK-A merged-feature review on `origin/main` `ed88574`; initial verdict 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW.
- S30-PO-3 Q6-Q8 refresh: Q6 resolved; Q7/Q8 recorded as future-cycle decisions. Round 6 clarified the source and fixed task/traceability mappings. Static only; no suite run.
- 2026-11-03, base analysis on `d04ef52`: found open scope/active-state questions (A1/A2), concurrency and failure-contract questions (A3/A4), missing implementation evidence (A5), coverage note (A6), and undefined removal operation (A7). The HIGH questions were routed as SK-003-04..10.
- 2026-11-03, refreshed on `3237afa`: S30-R8 closed the scope questions as architect clarification of the existing PO-approved Q7/Q8 behavior. Implementation tests and security review remain gates, not specification defects. No PO question was raised.
- 2026-11-03, refreshed on `e9888dc`: the plan now defines the roster RPC projection and base-table boundary, the final-PO guard's shared transaction lock and six mixed race pairs, and T014/T015 independent done-conditions followed by T016 review. The stale Story 5 and `created_at` clarification wording are corrected. Static code/test statuses remain unchanged; no suite was run.
- 2026-11-03, refreshed on `e8c03d4`: updated the roster scenario and SC-006 to describe the fixed membership fields and associated staff role rather than calling the associated role a membership column. No implementation or test evidence changed.
- 2026-11-03, refreshed on `7fd9461`: FR-013 now separates membership columns from the associated staff role, and the resolved decision summary specifies that all protected owner-count mutations use the shared transaction lock. No implementation or test evidence changed.
- 2026-11-04, reconciled with #47 compliance merge `ff6e0b9`: combined #47 task FR tags, traceability row updates (commit `ed88574`, PARTIAL FR-003/FR-004 evidence gaps), and #50 governance rows FR-013/FR-014/SC-005/SC-006 + all Given/When/Then scenarios; verdict adjusted to reflect the merged 20-row traceability table (5 VERIFIED / 11 PARTIAL / 4 NOT-FOUND / 0 DEFERRED).
- 2026-11-04 17:59 +02:00, S33 SK-A9 fix round: refreshed the analysis against branch head `0a4e95c` after restoring the `Project Structure` and `Complexity Tracking` sections dropped at merge `012f9ed`. Both parents were compared; no requirement, task, decision, citation, or substantive section content was dropped. The finding set and 0 CRITICAL / 0 HIGH verdict are unchanged; no tests, builds, SQL, stacks, or code were run.
- 2026-11-04 19:38 +02:00, S33 CodeRabbit docs round: corrected the 20-row traceability summary to 5 VERIFIED / 11 PARTIAL / 4 NOT-FOUND and replaced stale Q7 future-cycle/unresolved wording in the spec and plan with the already-recorded approved scope. No numbered FR, SC, task, or requirement meaning was dropped. The auth-user deletion cascade contract was escalated as PO-DECISION-NEEDED and was not applied. The finding set and 0 CRITICAL / 0 HIGH verdict are unchanged; no tests, builds, SQL, stacks, or code were run.
