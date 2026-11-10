# Spec Kit Analyze - F17 Workout Planner

**Analyzed:** 2026-11-10 05:43 UTC
**Method:** Cross-artifact and S41 hostile review of the updated F17 spec-only scope after S43-R9 Sol-3/Sol-4.

## Entry check at the start of the S44 lane (2026-11-10 05:43 UTC)

- PASS at lane entry - numbered FRs, measurable SCs, and Given/When/Then scenarios covered the then-touched scope, including A1-9 zero-set prescription persistence and A2-13 fresh-authoring/promoted-reference distinction.
- PASS at lane entry - prior resolved decisions were recorded with byte-exact PO quotations separate from architect mappings (spec.md section 8.6). S43-MCQ-A and S43-MCQ-C were resolved; S44-MCQ-1 and S44-MCQ-2 were discovered during this review and are listed below.
- PASS at lane entry - plan/tasks covered program-day weeks; T053 verified zero-set entry prescriptions survive save/reload and changed library defaults; T011 aligned canonical-only fresh global authoring with promoted unresolved references flagged RED and blocked from load.
- PASS at lane entry - the then-current Analyze followed the last prior spec/plan/tasks edits and reported 0 open CRITICAL/HIGH findings.

## Cross-artifact findings

| Severity | Finding                 | Evidence / disposition                                                                                                                                                                                                                             |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0 open                  | None.                                                                                                                                                                                                                                              |
| HIGH     | 0 open                  | None.                                                                                                                                                                                                                                              |
| MEDIUM   | 0 open in touched scope | Program-day boundaries, entry-level Rest/RIR/Reps/Notes/Alternatives independent of set rows, and canonical-only fresh authoring versus promoted RED references align across spec, plan, data-model, contracts, tasks T053/T011, and traceability. |
| LOW      | 0 open                  | IDs and task tags agree; task checkboxes remain unticked because no implementation tests were run.                                                                                                                                                 |

## Resolved decision checks

- S43-MCQ-C: exact S43-PO-5 quote is in spec.md; architect mapping (S43-R6) encodes day-indexed blocks without a calendar start. No stale blocked-by clause remains in active F17 contract/plan/tasks.
- S43-MCQ-A: S43-PO-5 approval is recorded; prompt P1/P2 are copied from the approved source into the local contract. Golden acceptance compares each locale byte-for-byte after payload substitution.
- Coach-original notes remain per item and in the copied prompt; totals rows exclude them.

## Analyze result

Entry Analyze result before the S44 PR #78 fix lane: CRITICAL 0; HIGH 0; MEDIUM 0; LOW 0. F17 open PO MCQ IDs at that point: none. Superseded by the S44 fix-lane Analyze below.

## S44 PR #78 fix-lane Analyze - 2026-11-10 12:25 UTC

Scope: eight in-scope technical corrections after the initial review and CodeRabbit follow-up replies. These cover export completeness/template substitution, private reference identity, assigned-copy versioning, PO template authorization, promoted-template task coverage, explicit all-role plan isolation, and static-only copy approval. S44-MCQ-1/2 remain unencoded pending PO decision.

### Entry and cross-artifact checks

- PASS - numbered FRs, measurable SCs, and Given/When/Then scenarios remain in `spec.md`; FR-018/019 name document-level notes consistently; FR-020 denies cross-workspace plan access to every role; workspace staff cannot access other workspace templates; the PO may view/edit templates and promote to global, while cross-workspace template copies remain unauthorized.
- PASS - Clarifications (section 8), PO decision register and exact PO sources are cited; the two newly discovered product choices are explicit in `runs/s44-luna-fix78/report.md`. No ambiguity is treated as decided.
- PASS - `plan.md` covers exports, exercise resolution/publication and template assignment; `tasks.md` T007/T008/T011/T024/T025/T028/T031 cover the touched scope with unchanged FR tags; `traceability.md` descriptions align for FR-012/018/019.
- PASS - this Analyze record is dated after the final spec/plan/tasks edits in this lane.

### Hostile cross-artifact findings

| Severity | Finding        | Evidence / disposition                                                                                                                                                                                  |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0 open         | No new code, schema or privilege behavior is being implemented.                                                                                                                                         |
| HIGH     | 0 open         | PO scope exception is explicit; private-reference source workspace is retained; copy identity and version 1 are both specified; static prompt approval does not prohibit authored payload substitution. |
| MEDIUM   | 2 PO questions | S44-MCQ-1 controls mixed per-workspace outcomes; S44-MCQ-2 controls exercise effective-value capture timing. Both remain in the lane report and their review threads stay unresolved.                   |
| LOW      | 0 open         | Task checkboxes remain unticked; no implementation tests were run.                                                                                                                                      |

### Disposition summary

Eight technical findings fixed within current PO decisions; two behavior choices remain blocked. Plan-level notes flow through PDF, Excel and prompt payload under the existing complete-plan contract. The approved prompt template bytes are untouched. No stale prohibition of promoted private references or PO cross-workspace governance remains in the touched FR/task text. The PO template exception does not grant cross-workspace plan access to any role or authorize copying workspace templates into a different workspace. Static-only byte approval is consistent at both contract status and detailed rule.

**Analyze result: CRITICAL 0; HIGH 0; MEDIUM 2 PO-blocked; LOW 0.**

## S44 PO-decision and formatting update — 2026-11-10 12:47 UTC

This section supersedes the earlier S44 entry's two-open-MCQ status. S44-PO-2 (2026-11-10) resolves MCQ-1=A and MCQ-2=A; architect mapping S44-R2 is recorded beside the verbatim answers in `spec.md` §8.6.

### Scope and cross-artifact review

- PASS — `spec.md` FR-003, FR-010/011, SC-004/011 and §8.6 encode both decisions. No open MCQs remain.
- PASS — `workout-plan-document.md`, `data-model.md`, `plan.md`, T011/T031, and traceability encode add-time effective global/override version and value capture, persistence across draft reload, and publication from captured values; Video remains live.
- PASS — `template-assignment.md`, `data-model.md`, `plan.md`, T009/T025, and traceability encode per-workspace `no_copies` in a committed mixed-result batch and preserve rejection when total copies would be zero.
- PASS — hostile post-push review caught and corrected an unescaped union separator in the `data-model.md` exercise-reference table; it now renders as one table row and retains the pinned source semantics.
- PASS — task tags remain aligned: T009/T025 → FR-010/011 and SC-003/004; T011/T031 → FR-003 and SC-011 (T031 also FR-004/023 and SC-001). Every referenced ID exists in spec, plan, tasks, traceability and research.
- PASS — analyze is dated after these spec/plan/tasks changes; task checkboxes remain unticked because implementation tests have not run.

### Findings

| Severity | Finding | Disposition                                                                                                   |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0 open  | No implementation/schema/privilege change in this spec-only lane.                                             |
| HIGH     | 0 open  | Capture timing and mixed-batch receipt behavior match cited PO answer and architect mapping across artifacts. |
| MEDIUM   | 0 open  | Both prior S44 product questions are resolved by S44-PO-2.                                                    |
| LOW      | 0 open  | IDs, tags, and traceability align.                                                                            |

**Current Analyze result: CRITICAL 0; HIGH 0; MEDIUM 0; LOW 0; open MCQs 0.**

## S44 Greptile P2 fix-lane Analyze — 2026-11-10 13:33 UTC

Scope: three unresolved Greptile P2 findings on head `6f70703c887119f0a41bc9f4847b9e6039bedd9d` — replay check ordering before the assignment run row (`data-model.md` §5.2), run-level versus permanent identity-level copy keys (`data-model.md` §5.2), and the export field mapping for entry-level Reps/Rest/RIR (`contracts/export-and-ai-prompt.md` §2). No FR, SC, task or scope change; product behaviour is unchanged.

### Entry and cross-artifact checks

- PASS — `spec.md` has numbered FRs, measurable SCs and Given/When/Then scenarios for the touched assignment and export scope; §8 Clarifications and §8.6 PO-decision register record the cited PO sources and state "No open ambiguities".
- PASS — `plan.md` covers assignment idempotency and export content; `tasks.md` T007/T009/T025/T026/T027/T037/T038/T041/T053 carry the touched rules with unchanged FR tags; `traceability.md` FR-011/FR-018 rows remain consistent.
- PASS — the corrections restate existing decisions only: S44-PO-2/S44-R2 mixed-batch receipts, S42-PO-8 zero-copy rejection, S43-PO-1 skip-regardless-of-version, and the entry-level prescription schema. No new product decision is encoded.
- PASS — this Analyze section is dated after the final edits to `data-model.md` and `contracts/export-and-ai-prompt.md` in this lane.

### Hostile cross-artifact findings

| Severity | Finding | Disposition                                                                                                                                                                                    |
| -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0 open  | No implementation, schema or privilege change in this spec-only lane.                                                                                                                          |
| HIGH     | 0 open  | Replay ordering, copy-key scope and the export data source now agree across `data-model.md` §5.2/§5.3, `contracts/template-assignment.md` §2/§4 and `contracts/export-and-ai-prompt.md` §2/§6. |
| MEDIUM   | 0 open  | The three P2 findings are corrected in text; no behaviour change, no open MCQ.                                                                                                                 |
| LOW      | 0 open  | IDs and task tags are unchanged; task checkboxes remain unticked because no implementation tests were run.                                                                                     |

Disposition: the assignment transaction now checks the ledger by operation key before any write, creating the run row only for a new accepted request; the version-bearing run key is distinguished from the permanent `(workspace_id, global_template_id)` identity key; exports state that Reps/Rest/RIR come from the entry-level prescription and that sets carry only type and load. All three statements preserve S42-PO-8, S43-PO-1 and S44-PO-2/S44-R2 behaviour.

**Current Analyze result: CRITICAL 0; HIGH 0; MEDIUM 0; LOW 0; open MCQs 0.**
