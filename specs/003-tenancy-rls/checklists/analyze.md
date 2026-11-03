# Spec Kit Analyze - F3 Workspace Tenancy, Permission Matrix & RLS

- Date: 2026-11-03
- Analyzed source commit: `ed88574ae09c722b1f6ded4fc0b66122bbeb4f13` (`origin/main` at branch creation); task FR tags are part of this docs change.
- Method: static cross-artifact, migration, workflow, and test-source review. No tests or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..012, SC-001..004, four GWT story groups), `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`.
- Missing at base: Analyze, traceability, standalone Clarifications section.
- Clarifications: plan `NEEDS DECISION` records Sales coaching rights, WO membership visibility, and PO bootstrap/last-PO protection. FR-006 itself says Sales denial is unconfirmed. All are in the PO register for this round; the clarification entry gate remains incomplete.
- Plan/tasks: 12 FRs map to T001-T013; explicit FR tags added to each task. No requirement or checkbox changed.
- Constitution I, III, VII, VIII and IX reviewed; role boundaries and deny-by-default are central requirements. Product/security ambiguities remain open.

## Findings

| ID | Category | Severity | Location | Finding | Recommendation |
|---|---|---|---|---|---|
| A1 | Permission decision | HIGH | `spec.md:48,92`; `plan.md:44`; D-09 `docs/04-changes-and-questions.md:15` | `coaching_work` for PO/WO/Trainer is added beyond D-09's listed matrix, and Sales denial is explicitly marked unconfirmed. The actual authorization matrix is therefore not fully PO-sourced. | Keep Sales denied by default; PO must confirm the complete `coaching_work` role matrix. Raised as SK-003-01. |
| A2 | Membership visibility | MEDIUM | `plan.md:45`; `spec.md` User Story 1 / Edge Cases | Whether a WO may read other members' rows in its own workspace is not specified by the cited sources; current behavior permits PO and self only. | Preserve least privilege; ask PO whether this remains the intended policy. Raised as SK-003-02. |
| A3 | PO bootstrap / last-owner protection | HIGH | `plan.md:46`; `research.md:17` | The first PO is inserted by operator SQL and there is no last-PO protection. The plan records this but no cited PO decision resolves acceptable bootstrap, recovery, or lockout behavior. | Do not infer a guard or recovery flow; PO must choose the governance policy. Raised as SK-003-03. |

## Coverage and constitution

FR-to-task mapping is 12/12 (100%) after the explicit tags. No checkboxes changed. Constitution I/III support isolation and PO-only governance; the open role matrix and last-PO behavior need PO resolution rather than reinterpretation.

## Static traceability

`traceability.md`: 7 VERIFIED, 9 PARTIAL, 0 NOT-FOUND, 0 DEFERRED across 16 FR/SC rows. Exact test paths and names were checked statically; no test suite or CI was run. PARTIAL rows identify gaps in composite/schema assertions, source confirmation, coverage breadth, CI workflow assertions, migration direction, and PII scans.

## Verdict

**FAIL** ? 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW. The PO permission and account-governance decisions remain open, so the feature's acceptance gate is not complete.

## History

- First SK-A merged-feature review on `origin/main` `ed88574`; no earlier Analyze history existed.
