# Spec Kit Analyze - F3 Workspace Tenancy, Permission Matrix & RLS

- Date: 2026-11-03 (refreshed after S30-PO-3 Q6-Q8 and S30 round 6 review corrections)
- Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13` (`origin/main` at branch creation); task FR tags are part of this docs change.
- Method: static cross-artifact, migration, workflow, and test-source review. No tests or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..012, SC-001..004, four GWT story groups), `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`.
- Missing at original base: Analyze, traceability, standalone Clarifications section; Clarifications now records S30-PO-3 Q6-Q8.
- Clarifications: S30-PO-3 Q6 resolves `coaching_work` as PO/WO/Trainer and denies Sales. Q7 records the future-cycle decision `WO sees active members`; Q8 records a database guard on the final PO. Scope details and implementation acceptance are routed to the separate governance cycle, not implemented by this baseline.
- Plan/tasks: 12 FRs map to T001-T013; explicit FR tags reconcile task scope with traceability. No task checkbox changed. Clarifications and the plan resolved-decisions section cite S30-PO-3.
- Constitution I, III, VII, VIII and IX reviewed; role boundaries and deny-by-default are central requirements. Q7/Q8 scope details remain in the new governance feature cycle.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist, but the tests do not establish every helper condition or every attempted identity-widening path. | Keep FR-004 PARTIAL pending broader assertions. |

## Coverage and constitution

FR-to-task mapping is 12/12 (100%) after the explicit tags. No checkboxes changed. Constitution I/III support isolation and PO-only governance; the remaining evidence gaps are explicit, and Q7/Q8 implementation is routed to the new governance cycle.

## Static traceability

`traceability.md`: 5 VERIFIED, 11 PARTIAL, 0 NOT-FOUND, 0 DEFERRED across 16 FR/SC rows. Exact test paths and names were checked statically; no test suite or CI was run. PARTIAL rows identify gaps in composite/schema assertions, source confirmation, coverage breadth, CI workflow assertions, migration direction, and PII scans.

## Verdict

**PASS WITH OPEN MEDIUM EVIDENCE GAPS** ? 0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW. Decision records close prior PO ambiguities; two newly approved behaviors require the separate cycle. Static traceability retains PARTIAL rows for gaps in assertion breadth.

## History

- First SK-A merged-feature review on `origin/main` `ed88574`; initial verdict 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW.
- S30-PO-3 Q6-Q8 refresh: Q6 resolved; Q7/Q8 recorded as future-cycle decisions. Round 6 clarified the source and fixed task/traceability mappings. Static only; no suite run.
