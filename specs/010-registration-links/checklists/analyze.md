# Analyze: F10 Registration Links

- **Date:** 2026-11-03
- **Analysed commit:** `5e68ef508a83e5747afbaa1968530371b1016a32` (Part 3 branch head before the local F10 clarification)
- **Scope:** static artifact/source/evidence review; no tests executed.
- **Inventory:** `spec.md` (FR-001..014, SC-001..006, scenarios, ND-F10 and carried ND-F9 decisions), `plan.md`, `tasks.md` (T001..T034 complete with prior evidence and FR/SC crosswalk), research, data-model, contracts, quickstart, F12 addendum, `checklists/requirements.md`; no feature `checklists/analyze.md` or `traceability.md` existed.

## Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F10-A01 | MEDIUM | `spec.md:102-106` | ND-F10-1: no source defines staff revocation/cancellation; no control or endpoint is specified. | Preserved as open; raised as SK-010-01. |
| F10-A02 | MEDIUM | `spec.md:103` | ND-F10-2: maximum schedule count/offset and first-offset-zero rule remain undecided. | Preserved as open; raised as SK-010-02. |
| F10-A03 | MEDIUM | `spec.md:104` | ND-F10-3: production issuance rate-limit values are not approved; local/dev placeholders remain bounded. | Preserved as open; raised as SK-010-03. |
| F10-A04 | MEDIUM | `spec.md:105` | ND-F10-4: future public content/branding scope remains open; current increment is bounded to validity messages. | Preserved as open; raised as SK-010-04. |
| F10-A05 | MEDIUM | `spec.md:106` | ND-F10-5: interim Sales/Trainer price visibility is specified, but PO confirmation remains required. | Preserved as open; raised as SK-010-05. |

## Coverage and consistency

- FR-to-task mapping: 14/14; SC-to-task mapping: 6/6. Existing task IDs carry FR tags and the task artifact includes implementation/test evidence plus the F12 addendum.
- Clarifications cite D-17, D-23, and the final F12 PO decision record; ND-F10-1..5 remain open. Carried F9 items refer to existing run items SK-009-01..05 and are not duplicated.
- Existing implementation/test evidence is recorded in `tasks.md:T034` and the linked test files. No tests were executed by this lane. No task status was changed.

## Verdict

**PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 5 MEDIUM; 20/20 FR/SC items mapped. Static evidence only; historical evidence is not a fresh test run.
