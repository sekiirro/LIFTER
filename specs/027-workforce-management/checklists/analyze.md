# Specification Analysis Report: P7 Workforce Management

**Re-analyzed**: 2026-11-25 14:07 UTC, after S70-R110 requirement clarification across spec, plan, model, contracts, task, and decision register
**Re-analyzed**: 2026-11-25 03:29 UTC, after final edits to all specification, planning, contract, task and checklist artifacts
**Re-analyzed after docs union**: 2026-11-26 UTC, after merging origin/main into the PR #339 docs branch (architect-approved S70-R121). tasks.md checkbox states and traceability.md evidence rows were revalidated as a union; no requirement text, scope or product decision changed. Open CRITICAL: 0. Open HIGH: 0.
**Re-analyzed after docs union**: 2026-11-26 UTC, after merging origin/main into the PR #340 docs branch (architect-approved S70-R121). tasks.md checkbox states and traceability.md evidence rows were revalidated as a union; no requirement text, scope or product decision changed. Open CRITICAL: 0. Open HIGH: 0.
**Inputs reviewed**: spec.md, plan.md, tasks.md, research.md, data-model.md, both contracts, quickstart.md, traceability.md, copy-table.md, requirements.md, po-mcqs.md, critique.md, S70-R95, S70-PO-18, S70-PO-20 and S70-R109
**Method**: cross-artifact Spec Kit analysis. Tasks are plans; no implementation or test completion is claimed.

## Findings and status

| ID  | Category                              | Severity | Finding                                                                                                                                                                                                                                | Status / resolution                                                                                                                                   |
| --- | ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Constitution alignment - Principle IV | CRITICAL | Existing exclusion of automatic bonuses/deductions conflicts with PO-approved P7 plan/check-in penalties and acquisition point reversal. Post-launch Telegram timeliness rule also needs narrow permission when technically supported. | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |
| C2  | Constitution alignment - Principle VI | CRITICAL | Existing Nothing-is-automatic rule conflicts with the explicitly approved P7 KPI triggers.                                                                                                                                             | Resolved by pending separate Constitution 1.20.0 amendment PR, lane s70-gemini-const120. Updated proposal in plan.md. Constitution is unchanged here. |

All 24 Sol findings are mapped to applied requirements/design/tasks in checklists/critique.md. The external Constitution amendment is a governance dependency. Independent critique surfaced two new HIGH product-contract findings that block T033 implementation:

| ID  | Category                   | Severity | Finding                                                                                            | Status / resolution                                                                                 |
| --- | -------------------------- | -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| C3  | Strike correction contract | HIGH     | PO-20 permits separate PO corrections but did not define operations, count effect, or composition. | Resolved by technical ruling S70-R110; exact correction semantics recorded in FR-026 and contracts. |
| C4  | Rolling-window clock       | HIGH     | PO-20 did not specify the strike instant or exact 90-day cutoff.                                   | Resolved by technical ruling S70-R110; exact bounds recorded in FR-016 and contracts.               |

## PO decision register

| Decision  | State                              | Applied behavior                                                                                      |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P7-MCQ-01 | ANSWERED, S70-PO-18 #1             | Closed month never changes; correction/refund reversal goes to current open month linked to original. |
| P7-MCQ-02 | ANSWERED, S70-PO-18 #2             | One monthly person-level salary in market currency; platform PO owns; points remain per workspace.    |
| SOL-08    | ANSWERED, S70-PO-18 #3             | Initial period is Cairo trigger month by category.                                                    |
| SOL-09    | ANSWERED, S70-PO-18 #2 and S70-R95 | One employee salary entitlement, platform PO, not multiplied by workspace.                            |
| SOL-20    | ANSWERED, S70-PO-18 #4             | PO approves drafted AR/EN copy per screen batch before each UI slice.                                 |

PENDING-PO FRs: 0. Open product MCQs: 0; P7-MCQ-04/05 are resolved by S70-R110.

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

**Superseded baseline**: the prior 03:29 analysis predates S70-PO-20/S70-R109 and is retained above as historical context. Its open-finding counts are not current; use the re-analysis below.

## S70-PO-20 / S70-R109 / S70-R110 re-analysis

**Re-analyzed**: 2026-11-25 14:07 UTC after S70-R110 resolved correction and count-window details across specification, data model, contracts, task, and decision register.
**Requirement authority**: S70-PO-20, S70-R109, and S70-R110. P7-MCQ-03/04/05 are answered; no PO decisions remain open.

### Scope checks

- FR-016 and FR-026 now define one immutable strike per client+initial subscription when persisted F15 D-03 passes without the successful initial pair, whether or not a later delivery occurs; attribute at breach with `breach_at` fixed to the persisted deadline. The deadline is reused, never recomputed.
- Count predicate is precisely `breach_at > now() - interval '90 days' AND breach_at <= now()` with `timestamptz`; the lower bound is exclusive and the upper inclusive. Cairo is display only.
- PO corrections are append-only `void`, `reinstate` latest void, and same-workspace breach-time `reattribute`; latest correction determines effective state, reason is required, audit is opaque. PO-only 3/6/9 review flags never discipline.
- Acceptance scenarios cover deadline/no-later-delivery, exact rolling-window bounds, one-per-client+initial-subscription idempotency, PO-only access, correction composition, point independence, departure/revocation and preserved history.
- The logical strike event and correction entities retain no client FK/PII and use an opaque source key. F26 purge preserves workforce strike history.
- RPC and projection contracts explicitly deny strike reads/corrections to Trainer, WO and Sales; raw tables have no staff access. The only accepted reader/writer is PO-only.
- T033 is tagged FR-016/FR-026/FR-020 and requires RED-first breach/idempotency and PO-authorization kill tests. Its source dependencies are F15 persisted SLA, F19 initial-pair/delivery state, F11 assignment history and F26 purge. No P7 point-ledger tables are required or referenced for strike independence.
- S70-PO-20/R109 set the source; S70-R110 resolves P7-MCQ-04/05 technically. The ruling expressly says the GPT-6.2 critique is not required for this sub-slice.

### Findings and result

- No new open CRITICAL findings. C1/C2 remain external Constitution-governance dependencies tracked in their owning lane.
- No open strike-specific HIGH findings or PO decisions. C3/C4 are resolved by S70-R110.
- RLS catalog coverage, explicit SECURITY DEFINER checks, append-only enforcement, idempotency/concurrency, purge behavior, and kill tests remain implementation acceptance gates in T033; no implementation or test completion is claimed by this Analyze.

**Analyze result**: PASS for updated strike requirements. No new open CRITICAL/HIGH findings; strike implementation may proceed under T033 and S70-R110.
