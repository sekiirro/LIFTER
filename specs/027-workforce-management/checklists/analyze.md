# Specification Analysis Report: P7 Workforce Management

**Re-analyzed**: 2026-11-26 03:50 UTC, after merging origin/main and renaming the quality migration
**Inputs reviewed**: spec.md, plan.md, tasks.md, research.md, data-model.md, both contracts, quickstart.md, traceability.md, copy-table.md, requirements.md, po-mcqs.md, critique.md, S70-R95 and PO-18
**Method**: cross-artifact Spec Kit analysis. Tasks are plans; no implementation or test completion is claimed.

## Findings and status

| ID  | Category                              | Severity | Finding                                                                                                                                                                                                                                | Status / resolution                                                                                                                                   |
| --- | ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Constitution alignment - Principle IV | CRITICAL | Existing exclusion of automatic bonuses/deductions conflicts with PO-approved P7 plan/check-in penalties and acquisition point reversal. Post-launch Telegram timeliness rule also needs narrow permission when technically supported. | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |
| C2  | Constitution alignment - Principle VI | CRITICAL | Existing Nothing-is-automatic rule conflicts with the explicitly approved P7 KPI triggers.                                                                                                                                             | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |

No other CRITICAL or HIGH finding remains open. All 24 Sol findings are mapped to applied requirements/design/tasks in checklists/critique.md. The external Constitution amendment is a governance dependency, not a product ambiguity or blocker to this documentation update.

## PO decision register

| Decision  | State                              | Applied behavior                                                                                      |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P7-MCQ-01 | ANSWERED, S70-PO-18 #1             | Closed month never changes; correction/refund reversal goes to current open month linked to original. |
| P7-MCQ-02 | ANSWERED, S70-PO-18 #2             | One monthly person-level salary in market currency; platform PO owns; points remain per workspace.    |
| SOL-08    | ANSWERED, S70-PO-18 #3             | Initial period is Cairo trigger month by category.                                                    |
| SOL-09    | ANSWERED, S70-PO-18 #2 and S70-R95 | One employee salary entitlement, platform PO, not multiplied by workspace.                            |
| SOL-20    | ANSWERED, S70-PO-18 #4             | PO approves drafted AR/EN copy per screen batch before each UI slice.                                 |

PENDING-PO FRs: 0. Open product MCQs: 0.

## FR acceptance coverage

| FR     | Acceptance/task coverage | FR     | Acceptance/task coverage                   |
| ------ | ------------------------ | ------ | ------------------------------------------ |
| FR-001 | T007-T008, T020-T021     | FR-016 | T033                                       |
| FR-002 | T009                     | FR-017 | T002-T006, T013, T025, T032-T033           |
| FR-003 | T010-T011                | FR-018 | T030-T031                                  |
| FR-004 | T002-T006                | FR-019 | T001; post-launch documentation only       |
| FR-005 | T003-T006                | FR-020 | T002-T004, T007-T017, T022-T023, T026-T032 |
| FR-006 | T007-T013                | FR-021 | T028-T029                                  |
| FR-007 | T013, T017, T023, T027   | FR-022 | T007-T010, T020-T023, T028-T029            |
| FR-008 | T017-T019, T026-T027     | FR-023 | T014-T015                                  |
| FR-009 | T014-T016, T018-T019     | FR-024 | T002, T032                                 |
| FR-010 | T020-T023                | FR-025 | T002, T032                                 |
| FR-011 | T022-T023                | FR-026 | T009, T033                                 |
| FR-012 | T002, T024-T025, T032    | FR-027 | T010-T011                                  |
| FR-013 | T028-T029                | FR-028 | T017-T019, T026-T027                       |
| FR-014 | T028-T029                | FR-029 | T005, T012, T018, T024, T034               |
| FR-015 | T022-T023                |        |                                            |

Each mapped task includes acceptance evidence and remains unchecked until implementation tests execute and pass. Traceability was rebuilt for current task IDs; no test evidence is claimed in this docs lane.

## Cross-artifact checks

- Durable P7 non-PII earned facts, F10 source-unit map/backfill, immutable F19 sources, signed append-only adjustments and negative totals agree across spec/model/API/tasks.
- Any completed refund reverses Sales point once; only F13-classified full refund asks PO fault question once per acquisition.
- Trigger-month allocation uses Cairo occurrence time; closed-month corrections use current open month and do not alter closed snapshot/Sales projection.
- Person-level monthly salary and payroll approval are separate from workspace point reports; one approval binds reviewed snapshot version/amount/currency.
- Due evaluator and confirmation share occurrence key; attribution is assigned Trainer at trigger, confirmer distinct, PO reattribution append-only.
- Monthly quality revisions count latest effective contribution only; reminder uses outbox/dedup/scheduler gate.
- F26 purge allowlist and tied-dispute holds preserve staff accounting without client PII or client FK; audit_events is not KPI truth.
- Audit details, Realtime/counts/HEAD/notifications/export/cache/replay and narrow Check-ins authorization have explicit tests/tasks.
- Copy approval is per screen batch; no unapproved AR/EN strings are presented as final copy.
- Telegram timeliness remains post-launch documentation only; future penalty is narrowly reflected in the Constitution proposal.

## Metrics

- Functional requirements: 29; task/acceptance mapping: 29/29.
- Success criteria: retained and mapped to FR acceptance tasks; no unassigned criterion.
- Sol critique findings resolved in artifacts: 24/24.
- Constitution CRITICAL records: 2 (C1/C2, resolved by pending amendment PR). Other open CRITICAL: 0. Open HIGH: 0.
- PENDING-PO: 0. Open MCQs: 0.
- Implementation tasks checked: 0; implementation tests executed in this docs lane: 0.

## Analyze result

**Open CRITICAL: 0. Open HIGH: 0.** C1/C2 remain visible as CRITICAL governance records but are marked resolved by pending Constitution 1.20.0 amendment PR in lane s70-gemini-const120. No other CRITICAL/HIGH issue remains. This is a completed documentation Analyze, not implementation authorization; apply the separate Constitution amendment gate before implementation.
