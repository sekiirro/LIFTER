# Analyze: F10 Registration Links

- **Date:** 2026-11-03
- **Analyzed commit:** `5e68ef508a83e5747afbaa1968530371b1016a32` (Part 3 branch head before the local F10 clarification)
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
- Clarifications cite D-17, D-23, and the final F12 PO decision record. As of the 2026-11-03 session ND-F10-1..5 remained open as written; this line is historical and is superseded by the 2026-11-04 S31 round 6 refresh below (ND-F10-1..3 decided by S31-PO-3/4; ND-F10-4/5 remain open). Carried F9 items refer to existing run items SK-009-01..05 and are not duplicated.
- Existing implementation/test evidence is recorded in `tasks.md:T034` and the linked test files. No tests were executed by this lane. No task status was changed.

## Verdict

**PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 5 MEDIUM (2026-11-03 baseline; superseded by the 2026-11-04 S31 round 6 refresh below — current: 2 MEDIUM); 20/20 FR/SC items mapped. Static evidence only; historical evidence is not a fresh test run.

## S31 round 6 refresh

- **Date:** 2026-11-04
- **Reviewed after:** S31-PO-3/4 updates to `spec.md`, `plan.md`, `tasks.md`, `research.md`, and `data-model.md`; no tests or implementation changes.
- **Decisions:** ND-F10-1 no revocation, ND-F10-2 no business maximum, ND-F10-3 50/account/rolling 24 hours including Trainer/WO/PO, with no exceptions or per-workspace resets. ND-F9-4 remains denied per S31-PO-4; SK-009-01 remains in the separate F9 lane.
- **Implementation gap:** current local 20/hour placeholder does not match the approved 50/24-hour rule. T035 is an unchecked future Spec Kit implementation task. ND-F10-4/5 and ND-F9-1..3/5 remain open.
- **Coverage:** FR-to-task 14/14, SC-to-task 6/6; 0 CRITICAL/HIGH, 2 MEDIUM (remaining content/price decisions). Static only. The T035 rate-limit implementation gap is an unchecked future Spec Kit implementation task; implementation blockers are excluded from this finding count and are not counted as analyze findings.

## S33 SK-52 round 7 refresh

- **Date:** 2026-11-04T18:13:06+02:00 (after the S33 PR #52 fix-round edits).
- **Analyzed commit:** this fix commit (S33 round for PR #52; base `2eb3733`). The reviewed patch changes `specs/010-registration-links/checklists/analyze.md` (lines 21/26/34 reconciliation), `specs/010-registration-links/research.md` (line 72 register row) and this refresh only.
- **Scope:** static consistency and internal-consistency review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F10-R7-01 | LOW | `checklists/analyze.md:21,26,34` | Line 21 still stated "ND-F10-1..5 remain open", the 2026-11-03 baseline verdict (5 MEDIUM) was presented without noting supersession, and the T035 implementation gap was not explicitly excluded from the finding count. | Corrected as a historical reconciliation, no history deleted: line 21 is marked historical and superseded by the 2026-11-04 S31 round 6 refresh below (ND-F10-1..3 decided by S31-PO-3/4; ND-F10-4/5 remain open); the baseline verdict line now notes supersession and the current 2 MEDIUM; line 34 now states the T035 rate-limit implementation gap is an unchecked future Spec Kit implementation task and implementation blockers are excluded from this finding count. |
| F10-R7-02 | LOW | `research.md:72` (R10 register) | Rate-limit register row still said rate values were absent and selected a local 20/hour function, stale vs R8 and S31-PO-3 (50/account/rolling 24h). | Corrected as documentation-only wording: row marked historical (2026-10-27) and superseded by R8 and S31-PO-3 (SK-010-03): 50 issuances per authorized account per rolling 24 hours, including Trainer/WO/PO, no exceptions or per-workspace resets — recorded, not implemented (T035). No new public error code; limit rejection maps to `unavailable`. |

### Coverage and verdict

- FR-to-task mapping remains 14/14; SC-to-task mapping remains 6/6 (20/20 total). No task status changed; T035 remains unchecked.
- Requirement semantics are unchanged (S31-PO-3 remains the authority; no scope or behavior change); no FR/SC re-mapping is required. ND-F10-4/5 remain open; ND-F9-1..3/5 remain open; ND-F9-4 remains denied per S31-PO-4.
- The S31 round 6 refresh section above remains the latest substantive dated analysis; this refresh documents the S33 reconciliation only.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (remaining content/price decisions), 2 LOW documentation-only corrections in this round; 20/20 FR/SC items mapped.
