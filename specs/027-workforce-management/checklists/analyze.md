# Specification Analysis Report: P7 Workforce Management

**Re-analyzed**: 2026-11-25 13:56 UTC, after S70-PO-20/S70-R109 requirement changes, plan correction, and independent critique
**Inputs reviewed**: spec.md, plan.md, tasks.md, research.md, data-model.md, both contracts, quickstart.md, traceability.md, copy-table.md, requirements.md, po-mcqs.md, critique.md, S70-R95, S70-PO-18, S70-PO-20 and S70-R109
**Method**: cross-artifact Spec Kit analysis. Tasks are plans; no implementation or test completion is claimed.

## Findings and status

| ID  | Category                              | Severity | Finding                                                                                                                                                                                                                                | Status / resolution                                                                                                                                   |
| --- | ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Constitution alignment - Principle IV | CRITICAL | Existing exclusion of automatic bonuses/deductions conflicts with PO-approved P7 plan/check-in penalties and acquisition point reversal. Post-launch Telegram timeliness rule also needs narrow permission when technically supported. | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |
| C2  | Constitution alignment - Principle VI | CRITICAL | Existing Nothing-is-automatic rule conflicts with the explicitly approved P7 KPI triggers.                                                                                                                                             | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |

All 24 Sol findings are mapped to applied requirements/design/tasks in checklists/critique.md. The external Constitution amendment is a governance dependency. Independent critique surfaced two new HIGH product-contract findings that block T033 implementation:

| ID  | Category                   | Severity | Finding                                                                                             | Status / resolution                                          |
| --- | -------------------------- | -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| C3  | Strike correction contract | HIGH     | PO-20 permits separate PO corrections but does not define operations, count effect, or composition. | Open P7-MCQ-04; no correction implementation until answered. |
| C4  | Rolling-window clock       | HIGH     | PO-20 does not specify which timestamp is counted or whether the exact 90-day cutoff is inclusive.  | Open P7-MCQ-05; no count implementation until answered.      |

## PO decision register

| Decision  | State                              | Applied behavior                                                                                      |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P7-MCQ-01 | ANSWERED, S70-PO-18 #1             | Closed month never changes; correction/refund reversal goes to current open month linked to original. |
| P7-MCQ-02 | ANSWERED, S70-PO-18 #2             | One monthly person-level salary in market currency; platform PO owns; points remain per workspace.    |
| SOL-08    | ANSWERED, S70-PO-18 #3             | Initial period is Cairo trigger month by category.                                                    |
| SOL-09    | ANSWERED, S70-PO-18 #2 and S70-R95 | One employee salary entitlement, platform PO, not multiplied by workspace.                            |
| SOL-20    | ANSWERED, S70-PO-18 #4             | PO approves drafted AR/EN copy per screen batch before each UI slice.                                 |

PENDING-PO FRs: strike correction/count details in FR-026/FR-016. Open product MCQs: 2 (P7-MCQ-04/05).

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
- PENDING-PO: 2. Open MCQs: P7-MCQ-04/05.
- Implementation tasks checked: 0; implementation tests executed in this docs lane: 0.

## Analyze result

**Superseded baseline**: the prior 03:29 analysis predates S70-PO-20/S70-R109 and is retained above as historical context. Its open-finding counts are not current; use the re-analysis below.

## S70-PO-20 / S70-R109 re-analysis

**Re-analyzed**: 2026-11-25 13:53 UTC after changes to `spec.md`, `data-model.md`, `contracts/workforce-rpc-api.md`, `contracts/authorization-and-projections.md`, `tasks.md`, and `checklists/po-mcqs.md`.
**Requirement authority**: S70-PO-20 and S70-R109. The strike-source MCQ is recorded as P7-MCQ-03. Independent critique found unresolved product choices recorded as P7-MCQ-04 (correction semantics) and P7-MCQ-05 (count clock/cutoff).

### Scope checks

- FR-016 and FR-026 now define one immutable strike per client from the first successful initial workout/nutrition pair delivered after the persisted F15 D-03 deadline; attribution is the Trainer responsible at the deadline. The deadline is reused, never recomputed.
- Acceptance scenarios cover late versus on-time delivery, one-per-client idempotency, rolling-90-day 3/6/9 review, PO-only visibility, point-correction independence, append-only PO strike correction, departure, revocation and preserved history. Count-time and correction effect assertions cannot be finalized until P7-MCQ-04/05 are answered.
- The logical strike event and correction entities retain no client FK/PII and use an opaque source key. F26 purge preserves workforce strike history.
- RPC and projection contracts explicitly deny strike reads/corrections to Trainer, WO and Sales; raw tables have no staff access. The only accepted reader/writer is PO-only.
- T033 is tagged FR-016/FR-026/FR-020 and requires RED-first delivery/idempotency and PO-authorization kill tests. Its source dependencies are F15 persisted SLA, F19 initial-pair delivery, F11 assignment history and F26 purge. No P7 point-ledger tables are required or referenced for strike independence.
- S70-PO-20 resolves the strike source and S70-R109 confirms the text change. No other product-policy decision is introduced.

### Findings and result

- No new open CRITICAL findings. C1/C2 remain external Constitution-governance dependencies tracked in their owning lane.
- Two open HIGH product decisions: C3/P7-MCQ-04 and C4/P7-MCQ-05.
- Two open PO decisions: correction operation/effect and rolling-window timestamp/cutoff. T033 implementation is blocked on these details; no behavior was assumed.
- RLS catalog coverage, explicit SECURITY DEFINER checks, append-only enforcement, idempotency/concurrency, purge behavior, and kill tests remain implementation acceptance gates in T033; no implementation or test completion is claimed by this Analyze.

**Independent critique**: `/root/p7_strike_critique`, GPT-6.1 Sol Medium (GPT-6.2 Sol Medium requested by S70-PO-16 §7 was unavailable in this runtime). No CRITICAL findings; HIGH findings were the two open contract choices recorded as P7-MCQ-04/05. Architect disposition of the model substitution remains pending.

**Analyze result**: PASS for documenting the answered source/attribution/discipline requirements; implementation entry gate FAILS until C3/C4 are answered and architect disposition is recorded for the critique-model substitution.
