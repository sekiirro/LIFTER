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

## S33 SK-52 fix round 2 refresh

- **Date:** 2026-11-04T19:51:07+02:00 (after the S33 PR #52 fix-round-2 edits).
- **Analyzed commit:** this fix commit (S33 round 2 for PR #52; base `327bce2`). The reviewed patch changes `spec.md` (Status line), `plan.md` (Summary line 11, Constitution Check IV row), `addendum-f12-flexible-installments.md` (F12 ownership statement) and this refresh only.
- **Scope:** static consistency and internal-consistency review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F10-R2-01 | LOW | `spec.md:7` (Status) | The Status line still said implementation and the Claude audit were pending while `tasks.md` records T001–T034 complete (T034 ticked after independent Claude audit on 2026-10-28). | Corrected as historical reconciliation: the 2026-10-27 draft status is marked superseded; completed local evidence (T001–T033) and the independent Claude audit (T034, 2026-10-28) are distinguished from the remaining T035 future task and open production validation. No FR/SC text changed; no checkbox changed. |
| F10-R2-02 | LOW | `addendum-f12-flexible-installments.md:33` | The F12 ownership statement described `20261101131000_flexible_registration_link_terms_forward.sql` as future work. The migration exists on disk; T049 and T052 are checked; T050, T051, T053 and T054 remain unchecked. | Corrected as documentation-only wording: the addendum now states the migration is existing and records the exact task state (T049/T052 checked; T050/T051/T053/T054 unchecked). Ownership scope and behavior constraints are preserved. |
| F10-R2-03 | LOW | `plan.md:11` (Summary); `plan.md:33` (Constitution Check IV row) | The Summary said all five F10 decisions remain open and the Constitution Check IV row said all NDs remain open, while line 68 of the same file records ND-F10-1/2 decided, ND-F10-3 recorded but not implemented, and only ND-F10-4/5 open. | Corrected as historical reconciliation: both statements now identify ND-F10-1 and ND-F10-2 as decided, ND-F10-3 as recorded but not implemented, and ND-F10-4/5 (with carried ND-F9 decisions) as open. No requirement meaning changed; ND-F10-4/5 remain open and are not defaulted. |

### Coverage and verdict

- FR-to-task mapping remains 14/14; SC-to-task mapping remains 6/6 (20/20 total). No task status changed; T035 remains an unchecked future Spec Kit implementation task.
- Requirement semantics are unchanged; no FR/SC re-mapping is required. ND-F10-4/5 remain open; ND-F9-1..3/5 remain open; ND-F9-4 remains denied per S31-PO-4.
- The S31 round 6 refresh section above remains the latest substantive dated analysis; this refresh documents the S33 fix-round-2 reconciliation only.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (remaining content/price decisions), 3 LOW documentation-only corrections in this round; 20/20 FR/SC items mapped.

## S33 SK-52 fix round 3 refresh

- **Date:** 2026-11-04T20:55:00+02:00 (after the S33 PR #52 fix-round-3 edits).
- **Analyzed commit:** this fix commit (S33 round 3 for PR #52; base `ff2174d`). The reviewed patch changes `research.md` (Staff price vs commission register row) and this refresh only. No `spec.md`, `plan.md` or `tasks.md` text changed.
- **Scope:** static consistency and internal-consistency review; no tests, scans, stacks, or implementation actions performed.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F10-R3-01 | LOW | `research.md:77` (Staff price vs commission row) | The row still stated both decisions remain open, stale vs the recorded S31-PO-4 decision (SK-009-04): ND-F9-4 Sales/Trainer commission visibility is denied, while ND-F10-5 price visibility remains open (interim binding default yes; PO confirmation required). | Corrected as a historical reconciliation, no history deleted: the 2026-10-27 row is marked historical and superseded by S31-PO-4 (SK-009-04); the row now records ND-F9-4 as denied (carried F9 decision; `specs/009` untouched, separate F9 lane) and ND-F10-5 as open. No requirement meaning changed; ND-F10-4/5 remain open and are not defaulted. |

### Coverage and verdict

- FR-to-task mapping remains 14/14; SC-to-task mapping remains 6/6 (20/20 total). No task status changed; T035 remains an unchecked future Spec Kit implementation task.
- Requirement semantics are unchanged; no FR/SC re-mapping is required. ND-F10-4/5 remain open; ND-F9-1..3/5 remain open; ND-F9-4 remains denied per S31-PO-4.
- The S31 round 6 refresh section above remains the latest substantive dated analysis; this refresh documents the S33 fix-round-3 reconciliation only.
- **PASS WITH OPEN PO DECISIONS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (remaining content/price decisions), 1 LOW documentation-only correction in this round; 20/20 FR/SC items mapped.
