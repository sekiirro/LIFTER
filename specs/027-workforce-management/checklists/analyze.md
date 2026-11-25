# Specification Analysis Report: P7 Workforce Management

**Analyzed**: 2026-11-25 (final rerun after all artifact edits)
**After latest changes to**: spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/, quickstart.md, copy-table.md, traceability.md, checklists/requirements.md, checklists/po-mcqs.md
**Method**: Speckit analyze workflow; read-only cross-artifact review using repository skill and Constitution. Tasks are plans, not verified implementations.

## Findings

| ID  | Category               | Severity | Location(s)                                                                               | Summary                                                                                                                                                                       | Recommendation                                                                                                                                                                     |
| --- | ---------------------- | -------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Constitution alignment | CRITICAL | Constitution IV; plan.md Constitution Check / Proposed amendment; spec FR-002/003/010/015 | Constitution IV currently excludes “automatic bonuses/deductions”, while S70-PO-16 explicitly approves limited automatic plan/check-in penalties and a refund point reversal. | Keep only the narrow proposed amendment in plan.md. Complete the separate approved Constitution amendment workflow before implementation; do not edit the Constitution in this PR. |
| C2  | Constitution alignment | CRITICAL | Constitution VI; plan.md Constitution Check / Proposed amendment; spec FR-002/003/010/015 | Constitution VI says deductions must be explicit PO decisions and “Nothing is automatic.” That conflicts with the exact automatic triggers approved by S70-PO-16.             | Keep manual edits, compensation changes and discipline PO-controlled; amend Constitution through its separate required approval path before implementation.                        |

## Product decisions (not Analyze defects)

| ID        | Affected requirements       | State      | Containment                                                                                                                        |
| --------- | --------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P7-MCQ-01 | FR-014, FR-021              | PENDING-PO | No post-finalization correction display/accounting behavior is assumed. Other slices continue.                                     |
| P7-MCQ-02 | FR-008 salary unit/currency | PENDING-PO | Salary value semantics are withheld; PO ownership, WO exclusion, external-paid approval and own-compensation access are specified. |

## Coverage summary

| Requirement key | Has task? | Task IDs               | Notes                                            |
| --------------- | --------- | ---------------------- | ------------------------------------------------ |
| FR-001          | Yes       | T006, T009             | F19 award once / no repeat sources               |
| FR-002          | Yes       | T007, T009             | F15 D-03 deadline; PO attribution                |
| FR-003          | Yes       | T008, T009             | Successful submission + 24-hour follow-up        |
| FR-004          | Yes       | T003–T005              | Check-in fields, states and Trainer history      |
| FR-005          | Yes       | T004, T008             | Follow-up and retained Late history              |
| FR-006          | Yes       | T006–T011              | Formula, ledger, negative totals                 |
| FR-007          | Yes       | T010, T011, T015, T016 | PO-only manual/fault decisions                   |
| FR-008          | Yes       | T012, T013             | Amount semantics held by MCQ-02                  |
| FR-009          | Yes       | T014                   | Monthly transformations/feedback                 |
| FR-010          | Yes       | T015, T016             | Sales acquisition +1                             |
| FR-011          | Yes       | T015, T016             | Full-refund PO question and selected deductions  |
| FR-012          | Yes       | T017                   | Sales confidentiality all surfaces               |
| FR-013          | Yes       | T018, T019             | Snapshots and finalization                       |
| FR-014          | Yes       | T018, T019             | Pending MCQ-01                                   |
| FR-015          | Yes       | T015, T016             | F13 policy and idempotency                       |
| FR-016          | Yes       | T020                   | 90-day 3/6/9, no automatic discipline, departure |
| FR-017          | Yes       | T002–T021              | Workspace and role authorization                 |
| FR-018          | Yes       | T021                   | F26 retention/KPI attribution                    |
| FR-019          | Yes       | T022                   | Post-launch documentation only                   |
| FR-020          | Yes       | T002–T021              | Idempotency, audit, concurrency                  |
| FR-021          | Yes       | T018, T019             | Pending MCQ-01                                   |

| Success criterion | Has task? | Task IDs             |
| ----------------- | --------- | -------------------- |
| SC-001            | Yes       | T006, T009           |
| SC-002            | Yes       | T007–T009            |
| SC-003            | Yes       | T006–T009, T014–T019 |
| SC-004            | Yes       | T003–T005            |
| SC-005            | Yes       | T002, T017           |
| SC-006            | Yes       | T015, T016           |
| SC-007            | Yes       | T021                 |
| SC-008            | Yes       | T012–T014            |
| SC-009            | Yes       | T020                 |
| SC-010            | Yes       | T023                 |

## Cross-artifact checks

- Constitution conflicts are surfaced rather than silently overridden; plan.md contains proposed wording only.
- Net Points formula is consistent between spec and data model; ledger uses signed exact decimal points and permits negative totals.
- F19 facts stay immutable; refunds, deductions and corrections use separate append-only records.
- Sales's sole post-close projection is consistent across spec, role matrix, API contract, data model and tests.
- Check-in form/follow-up statuses and Late history are consistent across spec, data model and API contract.
- PENDING-PO status is consistent across spec, MCQ register, task dependencies and traceability.
- Tasks are ordered into independently testable slices, near 400 changed lines each. No task is checked or represented as tested.
- F26 retention is distinguished from `audit_events`; no new retention period is invented.
- Telegram notes cover only post-launch feasibility and do not create an implementation requirement.

## Metrics

- Functional requirements: 21; all 21 map to tasks (100%).
- Success criteria: 10; all 10 map to tasks (100%).
- Planned tasks: 23; all tasks have FR tags. No execution evidence is claimed.
- CRITICAL findings: 2 (Constitution IV and VI conflicts).
- HIGH findings: 0.
- PENDING-PO decisions: 2 (FR-008 partial; FR-014/FR-021).
- Coverage/ambiguity/duplication: no untracked requirements; no duplicate requirement found; two product choices remain explicitly isolated.

## Constitution alignment issues

Implementation acceptance is blocked until the separate Constitution amendment required to reconcile C1/C2 is approved and completed under its governance gates. This specification lane follows the instruction to draft a proposed amendment in plan.md and does not modify `.specify/memory/constitution.md`.

## Analyze result

**CRITICAL: 2. HIGH: 0.** Final rerun after the requirement, task ordering, technical arithmetic and Telegram research edits found no additional cross-artifact findings. The PO decisions are not reopened. P7-MCQ-01/02 remain open only for their affected behavior. This is a completed documentation Analyze; it is not an implementation authorization or a clean-to-implement gate.
