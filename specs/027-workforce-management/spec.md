# Feature Specification: P7 Workforce Management

**Feature Branch**: `s70-027-workforce`
**Created**: 2026-11-25
**Status**: Draft — documentation-only; PO decision MCQ P7-MCQ-01 remains open
**Authority**: S70-PO-16 (all P7 requirements); S70-PO-1 and prior decisions remain in force except where superseded by S70-PO-16.

## User Scenarios & Testing

### US1 — PO reviews workforce performance (P1)

The PO sees attributed Trainer/Sales KPI history, monthly projections, late check-ins, deductions, corrections and strikes; chooses any additional penalties explicitly. Staff actors cannot access PO detail.

**Independent Test**: Seed F19 acquisition events, F15 check-ins and PO adjustments, then verify computed totals, auditability, RLS and role projections.

**Acceptance Scenarios**

1. **Given** one eligible new client and later renewals/revisions, **When** the monthly ledger is calculated, **Then** the Trainer earns exactly one F19 productivity point and no repeat points.
2. **Given** a late initial plan or a check-in followed up after the threshold, **When** the source event is processed repeatedly or concurrently, **Then** exactly one corresponding penalty is recorded and the total may be negative.
3. **Given** a report that the PO finds inaccurate, **When** the PO disputes it or posts a correction, **Then** original F19 events remain unchanged and a separately attributed ledger entry records the change.

### US2 — Trainer manages check-ins (P1)

An authorized Trainer sees the workspace check-in queue and completed weekly history, follows up through Telegram and confirms the follow-up in LIFTER. Late status remains visible after follow-up.

**Independent Test**: Exercise every form/follow-up state, timestamps, client fields, reassignment and cross-Trainer historical visibility within one workspace; reject foreign-workspace access.

**Acceptance Scenarios**

1. **Given** a successful client submission, **When** more than 24 hours pass before follow-up, **Then** status is Late and exactly one −0.5 ledger deduction is attributed; a later confirmation changes current follow-up status to Followed Up but preserves Late history.
2. **Given** an authorized Trainer and a client in their workspace, **When** they open weekly history created under another Trainer, **Then** all authorized historical forms and follow-up actors/times are visible.
3. **Given** two Trainers submit follow-up confirmations concurrently, **When** both requests complete, **Then** one logical follow-up is recorded and the final status/history is consistent.

### US3 — PO manages payroll and monthly quality (P2)

The PO sets Basic Salary during provisioning or later, records monthly transformations and feedback, sets per-Trainer feedback point values, and marks payroll approved only after external payment. No payment is initiated by LIFTER.

**Independent Test**: Exercise PO writes, own-compensation projections, immutable payroll snapshots and cross-month settings history.

**Acceptance Scenarios**

1. **Given** Trainer or Sales provisioning, **When** the PO completes provisioning, **Then** Basic Salary is set; WO cannot be given payroll compensation through this feature.
2. **Given** a month with no customized feedback weights, **When** the PO enters counts, **Then** positive/negative feedback defaults are +1/−1 per Trainer; changing one Trainer's values affects only that Trainer and preserves prior settings.
3. **Given** the PO approves payroll, **When** the approval is recorded, **Then** it represents payment already made externally and no payout or salary deduction occurs.
4. **Given** a Trainer or Sales employee requests compensation, **When** the projection is read, **Then** only that actor's own compensation is returned.

### US4 — PO reviews Sales monthly totals (P2)

The PO inspects link-issued, registration, approval, confirmed first-payment, acquisition, refund-reversal, deduction and adjustment details. Sales sees only its finalized monthly point total after month-end.

**Independent Test**: Attempt direct reads/exports through every UI, API, RPC and database path as Sales before close, after close, and for another employee.

**Acceptance Scenarios**

1. **Given** an eligible F10 link attribution, approved client and confirmed first payment, **When** acquisition is calculated, **Then** the link-issuing Sales employee earns one point, regardless of installments.
2. **Given** a full refund, **When** refund processing is repeated, **Then** exactly one acquisition reversal is appended; the PO is asked whether staff faulted, and only a PO answer of yes allows selected staff-specific deductions. Partial refunds produce no questionnaire.
3. **Given** an open month or a past month that the PO has not finalized, **When** Sales queries UI/API/RPC/RLS/export, **Then** no KPI total, formula, detail, reason, attribution, deduction, adjustment or live value is disclosed.
4. **Given** month-end has passed and the PO finalized the period, **When** Sales reads its KPI projection, **Then** it receives only its own finalized monthly total, with no other employee's total or calculation detail.

### US5 — PO handles staffing changes and strikes (P3)

The PO reviews rolling 90-day strikes at thresholds 3/6/9, handles departure, immediately revokes access and reassigns clients while preserving workforce history.

**Independent Test**: Exercise 89/90/91-day boundary events, departure/reassignment and post-revocation historical projections.

**Acceptance Scenarios**

1. **Given** strike events, **When** the PO reviews a rolling 90-day window, **Then** counts and 3/6/9 thresholds are shown for human review and cause no automatic discipline.
2. **Given** a departed Trainer, **When** access is revoked and clients reassigned, **Then** former attribution and history remain intact while the former Trainer cannot sign in or access workspace data.

## Edge Cases

- Exact 24-hour follow-up boundary; failed submission versus successful submission; deadline and action timestamps spanning Cairo midnight/month close.
- Duplicate F19 delivery, retries, duplicate refund events, replayed idempotency key with changed arguments, and concurrent PO edits.
- Plan delay and follow-up penalties coexist; ledger sum crosses below zero; reversal occurs in a later month.
- Late, disputed and followed-up states must not erase earlier timestamps or the fact that a late deduction was posted.
- Month-close races a source event or PO correction; two PO edits target the same month; finalized Sales projection is requested from a different workspace.
- Closed client reaches F26 purge eligibility: retain staff KPI attribution through the KPI ledger/snapshots; do not rely on `audit_events` for KPI facts or retain client PII beyond F26 retention.
- Staff departure during an in-flight write; authorization must be rechecked at commit/serialization boundary.

## Requirements

### Functional Requirements

- **FR-001**: P7 MUST derive Trainer productivity from immutable F19 events: +1 per eligible new client exactly once; no points for renewal, upgrade or revision. Only an eligible new-client event participates.
- **FR-002**: P7 MUST record plan delay as −1 for each client whose initial workout/nutrition plan set is delivered after the existing F15 D-03 deadline (five working days after intake, Friday excluded, Africa/Cairo 18:00 cutoff); on-time delivery adds zero. The PO determines the responsible Trainer in the workspace report; no assignment-based assumption replaces that decision. A PO can dispute or correct attribution without modifying the source event. The corresponding existing late-plan case remains part of the human-reviewed 3/6/9 rolling strike progression; the new check-in delay rule alone does not create a strike.
- **FR-003**: P7 MUST record check-in delay as −0.5 only when follow-up exceeds 24 hours after successful client submission. Client lateness alone never penalizes a Trainer. The threshold deduction is idempotent and does not erase Late history after follow-up.
- **FR-004**: Check-in form statuses MUST be Scheduled, Awaiting Client, Client Overdue, Submitted. Follow-up statuses MUST be Pending, Followed Up, Late, Disputed. The check-ins page MUST show client name, phone, platform and Telegram usernames, form schedule, submission/deadline/follow-up timestamps and responsible Trainer. Authorized Trainers MUST view every historical Weekly Check-in for clients in their workspace, including another Trainer's follow-up. Reuse F15/F23 form, answer, snapshot, actor and timestamp history; do not create another Forms engine.
- **FR-005**: Follow-up confirmation represents a Trainer-reviewed form, Telegram follow-up and explicit `Followed Up` action; it earns no points. Preserve state transitions and immutable history; preserve `Late` as a recorded state after follow-up.
- **FR-006**: P7 MUST keep immutable F19 events unchanged and place plan/check-in penalties, refund reversals, PO deductions, adjustments and corrections in separate append-only, attributed ledger entries. Net Points MUST equal `Earned + Transformation/Feedback − Penalties + PO Adjustments`. Negative totals are valid. No point changes salary.
- **FR-007**: PO MUST be the only role able to manually add, deduct, correct or reattribute points, set compensation/incentives/financial deductions, approve payroll, decide full-refund staff fault, and select any staff and individual deductions. Automated penalties/reversals are limited to the explicit S70-PO-16 triggers; no automatic discipline.
- **FR-008 PENDING-PO — P7-MCQ-02 (salary unit/cycle only)**: PO MUST set Basic Salary for each Trainer and Sales employee, including during provisioning; WO is excluded. Payroll approval means already paid externally. No payouts or automatic salary deductions are in scope. Staff may read only their own compensation. The monetary amount's currency and represented pay period await PO decision; do not infer either.
- **FR-009**: Monthly transformations MUST notify the PO to enter each Trainer's count and points per transformation. The PO MUST enter monthly positive/negative feedback counts; point defaults are +1/−1 individually customizable per Trainer, with monthly settings, history and corrections preserved.
- **FR-010**: Sales KPI MUST count generated links, registrations and approved new clients; award +1 once to the link-issuing Sales employee after approval and confirmed first payment; installment clients count equally. A refund MUST reverse the acquisition point once, with history preserved.
- **FR-011**: On a full refund only, the system MUST ask the PO whether staff caused it. A yes answer allows selecting relevant workspace Trainers/Sales and individual deductions. No questionnaire is shown for partial refunds. Refund eligibility/amount follows F13; P7 does not change F13 refund rules.
- **FR-012**: Sales MUST receive only its own finalized monthly total after month-end. Sales MUST NOT read live totals, formula, client-level scoring, reason, deduction, attribution, adjustment or another employee's data. Enforce server-side in UI queries, API, RPC, RLS and exports; PO alone sees full KPI details. Preserve F10 authorized link visibility; indirect inference via otherwise authorized F10 views cannot be fully prevented.
- **FR-013**: P7 MUST produce monthly immutable snapshots and finalization records for workforce totals, with full PO detail and role-safe projections. Snapshot calculations MUST include events assigned to that period once and capture formula version, source references and actor/time. Technical close operations MUST serialize concurrent events, PO edits and close attempts.
- **FR-014 PENDING-PO — P7-MCQ-01**: Define how a correction discovered after a monthly snapshot is finalized affects that closed period, its Sales total and the currently displayed total. Until answered, no implementation or acceptance assertion may choose a restatement policy; unaffected FRs remain actionable.
- **FR-015**: Full and partial refund processing MUST follow F13. Full-refund acquisition reversal and associated ledger writes MUST be atomic/idempotent; retries or concurrent refund processing MUST NOT duplicate questionnaire, reversal or deduction.
- **FR-016**: P7 MUST preserve rolling 90-day Strike thresholds 3/6/9 with human PO review and no automatic discipline. Departure MUST revoke access immediately, allow PO client reassignment, and preserve historical records/attribution.
- **FR-017**: P7 MUST honor workspace isolation, deny-by-default authorization and the two authorization walls in the Constitution. All tenant records/projections are workspace-scoped; every unauthorized/foreign-workspace access is denied without existence disclosure.
- **FR-018**: At F26 closure/deletion, client PII follows the approved 30-day post-closure retention and audit events follow 30 days after creation. Workforce KPI attribution needed for historical staff totals MUST survive in the separate KPI ledger/snapshots, using the minimum non-PII attribution; `audit_events` is not the KPI source of truth.
- **FR-019**: Telegram Response Speed is post-launch documentation only: document configurable Trainer shifts and future monitoring; response >1 hour during the responsible shift incurs −0.5 Timeliness point only when technically supported. Validate Telegram Business/bot capability. No implementation task or current runtime behavior is authorized.
- **FR-020**: All writes affecting points, salary, payroll, monthly quality or attribution MUST be auditable, append-only where historical facts change, idempotent under duplicate requests, and transaction-safe under concurrency. Authorization is rechecked after waits; mismatched replay parameters fail without mutation.
- **FR-021 PENDING-PO — P7-MCQ-01**: Sales's post-close monthly total MUST be a stable displayed value, but the value after a later correction to that month is pending PO policy under FR-014.

### Key Entities

- **F19 productivity event**: immutable source event for one eligible new client and responsible Trainer.
- **KPI ledger entry**: append-only signed points with workspace, staff, category, source/dedup key, effective month, actor, reason, timestamps and reversal/correction reference.
- **Monthly KPI snapshot/finalization**: period and formula version; calculated detail for PO; least-privilege role projections; finalization actor/time.
- **Check-in / follow-up history**: existing F15/F23 form and answer snapshot plus status transitions, responsible Trainer, actor and event timestamps.
- **Compensation/payroll record**: PO-controlled Basic Salary, incentive/adjustment inputs, period snapshot, externally-paid approval and immutable history.
- **Monthly quality record**: Trainer transformation counts/points and feedback counts/weights with month, author, revision history.
- **Sales link attribution/acquisition**: F10 link issuer, approval and first-payment qualification, one-point ledger event and refund reversal.
- **Strike event**: attributed event counted within the rolling 90-day review window.

## Success Criteria

- **SC-001**: Each eligible F19 new client produces exactly one +1 Trainer event; 100% of renewals/upgrades/revisions produce zero productivity events.
- **SC-002**: All valid late plan/check-in triggers produce exactly one −1/−0.5 penalty respectively; invalid/client-caused lateness produces zero; negative monthly totals are representable.
- **SC-003**: Across duplicate and concurrent submissions, each penalty/reversal/adjustment source key has at most one effective ledger entry and immutable originals remain unchanged.
- **SC-004**: Every check-in page field/state is available to authorized same-workspace Trainers; all workspace Weekly Check-in histories are visible; foreign-workspace records are not.
- **SC-005**: Role/capability matrix passes at app/API/RPC/RLS/export boundaries; Sales gets zero KPI detail or live totals and only its own finalized monthly total after month-end.
- **SC-006**: Repeated full-refund handling creates one questionnaire/decision and one acquisition reversal; partial refund produces none; F13 amount/eligibility remains unchanged.
- **SC-007**: Every monthly snapshot can be recomputed from retained ledger entries with equal totals, formula version and attribution after client PII purge.
- **SC-008**: Salary, points and payroll actions preserve append-only history; only PO writes privileged values; payroll approval represents external payment; no payout occurs.
- **SC-009**: Strike counts at 3/6/9 over rolling 90 days trigger review visibility only and no discipline action.
- **SC-010**: All Given/When/Then scenarios are covered by named acceptance tests in implementation slices; this spec-only lane does not claim execution.

## Assumptions and decisions

- Africa/Cairo is the existing system timezone for dates and month boundaries (F10/F12/F13 conventions); this is a technical consistency choice, not new policy.
- Reuse existing workspace membership, F10 link attribution, F12 approval/payment events, F13 refund lifecycle, F15/F23 forms/history and F19 immutable productivity facts. The source audit must verify exact integration points in implementation planning.
- S70-PO-16 resolves the legacy P7 deferral and conflicting KPI decisions. Refer to each binding requirement as “S70-PO-16 §N”.
- Two PO questions are captured in `checklists/po-mcqs.md`; FR-008 (unit/cycle only), FR-014 and FR-021 are pending. Clarifications are otherwise complete, with no ambiguity silently resolved.

## Out of scope

- Telegram response-time monitoring implementation; automated payouts or salary deductions; automatic discipline, firing or strike consequences; changing existing F13 refund eligibility; duplicate Forms engine; modifications to F19 source history; implementation, migration or stack work in this documentation lane.

## Clarifications

### Session 2026-11-25 — S70-PO-16

- P7 included in scope; the v1-scope P7 deferral and conflicting legacy KPI math are superseded. Reuse F15's existing D-03 five-working-day plan delivery clock and its Africa/Cairo/Friday/18:00 rules for determining plan lateness; this does not restore any conflicting legacy KPI calculation.
- Net formula, penalty values/triggers, role boundaries, point rules, check-in statuses/visibility, refund handling, Basic Salary/payroll meaning, feedback defaults, strike thresholds, departure and Telegram post-launch boundary are answered by S70-PO-16 §1–6.
- **No open ambiguity is assumed away.** P7-MCQ-01 resolves post-close correction policy (FR-014/021). P7-MCQ-02 resolves Basic Salary currency/period (part of FR-008). Both are PENDING-PO; unaffected requirements continue.
