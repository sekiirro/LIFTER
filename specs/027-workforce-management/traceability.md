# P7 Traceability

No implementation task is marked complete by this documentation lane. A row becomes verified only after its named tests execute and pass on the current implementation head; add commit SHA and test file/name as evidence.

| FR     | Planned task(s)  | Acceptance evidence                                                                       | Status                      |
| ------ | ---------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| FR-001 | T006             | F19 exactly-once new-client point; no renewal/upgrade/revision point                      | Planned                     |
| FR-002 | T007             | late initial plan −1, on-time zero, responsible Trainer, source immutable                 | Planned                     |
| FR-003 | T008             | post-success >24h −0.5, client lateness excluded, dedup and Late preservation             | Planned                     |
| FR-004 | T004, T005       | required fields/statuses and same-workspace all-Trainer history; foreign workspace denied | Planned                     |
| FR-005 | T004, T008       | follow-up state/history persists; no point award for follow-up                            | Planned                     |
| FR-006 | T006–T009        | signed ledger math, negative totals, F19 unchanged, separate adjustments/reversals        | Planned                     |
| FR-007 | T009, T010, T013 | PO-only manual edits/refund-fault decision; only approved automatic trigger types         | Planned                     |
| FR-008 | T011             | PO salary during provisioning, WO excluded, external paid approval, own compensation only | Pending P7-MCQ-02 semantics |
| FR-009 | T012             | monthly transformation and per-Trainer feedback defaults/settings/history                 | Planned                     |
| FR-010 | T013             | link issuer + approval + first payment +1 once; installment equality                      | Planned                     |
| FR-011 | T014             | full refund only; PO fault questionnaire; selected individual deductions; no duplicate    | Planned                     |
| FR-012 | T003, T015       | Sales denied at every surface before close; own total only after close/finalization       | Planned                     |
| FR-013 | T015             | snapshots, period boundary, finalization, concurrent close                                | Planned                     |
| FR-014 | T015             | post-close correction display/restatement rule                                            | Pending P7-MCQ-01           |
| FR-015 | T014             | F13 policy unchanged, refund and point reversal atomic/idempotent                         | Planned                     |
| FR-016 | T016             | 90-day 3/6/9 review, no discipline, departure/revocation/reassignment history             | Planned                     |
| FR-017 | T003–T016        | app/database authorization and workspace-negative probes                                  | Planned                     |
| FR-018 | T017             | F26 purge boundary, preserved non-PII attribution, no audit_events KPI dependency         | Planned                     |
| FR-019 | T018             | official-source post-launch documentation only; no runtime feature task                   | Documentation only          |
| FR-020 | T003–T017        | dedup/replay, audit rollback, stale-revision and concurrency evidence                     | Planned                     |
| FR-021 | T015             | post-close Sales total after correction follows PO decision                               | Pending P7-MCQ-01           |

| SC         | Acceptance evidence                                                             | Status  |
| ---------- | ------------------------------------------------------------------------------- | ------- |
| SC-001–003 | F19 and penalty tests; unique source keys; immutable originals; negative totals | Planned |
| SC-004–005 | check-in field/history tests and exhaustive role × scope × surface matrix       | Planned |
| SC-006     | full/partial refund cases, duplicate/concurrent processing                      | Planned |
| SC-007     | snapshot recomputation after retention/pseudonymization                         | Planned |
| SC-008–009 | payroll, compensation ownership, 3/6/9 strike and no-discipline checks          | Planned |
| SC-010     | per-FR acceptance suite with executed evidence                                  | Planned |

## Evidence rule

For each checked task, record: implementation commit SHA, test path and exact test name, command/tool version, and result. Do not tick a task on artifact review, mocks alone for an RLS claim, or tests that did not execute. This file has no test evidence yet.
