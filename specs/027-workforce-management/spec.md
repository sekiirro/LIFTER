# Feature Specification: P7 Workforce Management

**Feature Branch**: `s70-027-workforce`
**Created**: 2026-11-25
**Status**: Draft (documentation-only); S70-PO-20 strike source recorded; strike correction/count-time MCQs remain open
**Authority**: S70-PO-16, S70-R95 architect rulings, S70-PO-18 answers, and S70-PO-1 item 3 retention.

## User Scenarios & Testing

### US1 — PO reviews workforce performance (P1)

The PO sees attributed Trainer/Sales KPI history, monthly projections, late check-ins, deductions, corrections and strikes; chooses any additional penalties explicitly. Staff actors cannot access PO detail.

**Independent Test**: Seed F19 acquisition events, F15 check-ins and PO adjustments, then verify computed totals, auditability, RLS and role projections.

**Acceptance Scenarios**

1. **Given** one eligible new client and later renewals/revisions, **When** the monthly ledger is calculated, **Then** the Trainer earns exactly one F19 productivity point and no repeat points.
2. **Given** a late initial plan or a check-in followed up after the threshold, **When** the source event is processed repeatedly or concurrently, **Then** exactly one corresponding penalty is recorded and the total may be negative.
3. **Given** a report that the PO finds inaccurate, **When** the PO disputes it or posts a correction, **Then** original F19 events remain unchanged and a separately attributed ledger entry records the change; if the month is closed, book it in the current open month linked to the original month.
4. **Given** a report that the PO finds inaccurate, **When** the PO "disputes" it, **Then** no separate dispute case is created; the existing append-only correction/reattribution path is used with closed-month routing unchanged.

### US2 — Trainer manages check-ins (P1)

An authorized Trainer sees the workspace check-in queue and completed weekly history, follows up through Telegram and confirms the follow-up in LIFTER. Late status remains visible after follow-up.

**Independent Test**: Exercise every form/follow-up state, timestamps, client fields, reassignment and cross-Trainer historical visibility within one workspace; reject foreign-workspace access.

**Acceptance Scenarios**

1. **Given** a successful client submission, **When** more than 24 hours pass before follow-up, **Then** status is Late and exactly one −0.5 ledger deduction is attributed; a later confirmation changes current follow-up status to Followed Up but preserves Late history.
2. **Given** an authorized Trainer and a client in their workspace, **When** they open weekly history created under another Trainer, **Then** all authorized historical forms and follow-up actors/times are visible.
3. **Given** two Trainers submit follow-up confirmations concurrently, **When** both requests complete, **Then** one logical follow-up is recorded and the final status/history is consistent.
4. **Given** a follow-up is Late or Followed Up, **When** the PO disputes its accuracy and/or its -0.5 event with a controlled reason code, **Then** its status becomes Disputed, Late/Followed Up history and the original -0.5 event remain immutable, and at most one active dispute exists.
5. **Given** a follow-up dispute is open, **When** the PO resolves it as `valid`, `falseFollowUp` or `additionalPenalty`, **Then** the status resolves from immutable history, the outcome maps to an explicit append-only ledger action (valid: +0.5 reversal of the follow-up penalty; falseFollowUp: the -0.5 penalty stands; additionalPenalty: the PO enters a positive amount per dispute with exactly 2 decimal places and a maximum of 99,999,999.99, and it is recorded as an append-only negative ledger entry), the original -0.5 stays posted, resolution is final, and the 30-day F26 purge clock restarts for tied client records.

### US3 — PO manages payroll and monthly quality (P2)

The PO sets Basic Salary during provisioning or later, records monthly transformations and feedback, sets per-Trainer feedback point values, and marks payroll approved only after external payment. No payment is initiated by LIFTER.

**Independent Test**: Exercise PO writes, own-compensation projections, immutable payroll snapshots and cross-month settings history.

**Acceptance Scenarios**

1. **Given** Trainer or Sales provisioning, **When** the PO completes provisioning, **Then** Basic Salary is set; WO cannot be given payroll compensation through this feature.
2. **Given** a month with no customized feedback weights, **When** the PO enters counts, **Then** positive/negative feedback defaults are +1/−1 per Trainer; changing one Trainer's values affects only that Trainer and preserves prior settings.
3. **Given** the PO approves payroll, **When** the approval is recorded, **Then** it represents payment already made externally and no payout or salary deduction occurs.
4. **Given** a Trainer or Sales employee requests compensation, **When** the projection is read, **Then** only that actor's own compensation is returned.

### US4 — PO reviews Sales monthly totals (P2)

The PO reviews the Sales funnel as a section inside the existing workforce report, with link-issued, registration, approval, confirmed first-payment, acquisition, refund-reversal, point-deduction and PO-adjustment categories. Each row identifies the Sales employee by the existing PO-authorized staff display-name projection (F21). Sales sees its own PO-configured Basic Salary and a not-yet-available state before Cairo month-end and PO finalization; after both, Sales sees only its own finalized monthly point total.

**Independent Test**: Attempt direct reads/exports through every UI, API, RPC and database path as Sales before close, after close, and for another employee.

**Acceptance Scenarios**

1. **Given** an eligible F10 link attribution, approved client and confirmed first payment, **When** acquisition is calculated, **Then** the link-issuing Sales employee earns one point, regardless of installments.
2. **Given** any completed refund of an acquisition, **When** refund processing is repeated, **Then** exactly one Sales acquisition reversal is appended; only a full refund asks the PO about staff fault, and only a PO answer of yes allows selected staff-specific deductions. Partial refunds produce no questionnaire.
3. **Given** Cairo month-end has not passed or the PO has not finalized the period, **When** Sales opens its projection, **Then** it sees the PO-configured Basic Salary using `workforce.compensation.own.basicSalary` and the `workforce.salesProjection.notAvailable` heading with the approved `workforce.salesProjection.notAvailableUntilNextMonth` message only after S74-COPY-01 is approved verbatim; the legacy `workforce.salesProjection.notAvailableHint` is not shown in this state. The salary comes from `public.p7_get_own_compensation(p_employee_id, p_effective_month)` for the caller's own id, whose existing authorization derives identity from `auth.uid()` and denies a different target id.
4. **Given** a finalized period with no own total row, **When** Sales reads its projection, **Then** the `empty` status maps to `workforce.salesProjection.empty`.
5. **Given** month-end has passed and the PO finalized the period, **When** Sales reads its KPI projection, **Then** it receives only its own finalized monthly total, with no other employee's total or calculation detail.
6. **Given** the PO selects a Cairo event month, **When** the PO opens the Sales section inside the existing workforce report, **Then** `get_sales_funnel` supplies all eight categories (links issued, registrations, approvals, confirmed first payments, acquisition points, refund reversals, point deductions and PO adjustments), each row shows the employee's name through the existing PO-only F21 projection `public.p7_workforce_report`, the section heading uses `workforce.report.section.sales`, and the table uses the approved `workforce.salesFunnel.aria.table` label. `workforce.salesFunnel.title` is approved but is not rendered as a separate screen or section heading.

### US5 — PO handles staffing changes and strikes (P3)

The PO reviews rolling 90-day strikes at thresholds 3/6/9, handles departure, immediately revokes access and reassigns clients while preserving workforce history.

**Independent Test**: Exercise 89/90/91-day boundary events, departure/reassignment and post-revocation historical projections.

**Acceptance Scenarios**

1. **Given** strike events, **When** the PO reviews a rolling 90-day window, **Then** counts and 3/6/9 thresholds are shown for human review and cause no automatic discipline.
2. **Given** a departed Trainer, **When** access is revoked and clients reassigned, **Then** former attribution and history remain intact while the former Trainer cannot sign in or access workspace data.
3. **Given** the persisted F15 D-03 deadline for an initial subscription and no successful initial workout/nutrition pair at that instant, **When** the deadline passes, **Then** exactly one strike is recorded with `breach_at` equal to that deadline and Trainer attribution resolved at that instant, whether or not a later delivery occurs. A pair successfully delivered on or before the deadline adds no strike; a later delivery does not move or duplicate it.
4. **Given** the PO reads a Trainer's strikes, **When** the rolling 90-day window is evaluated, **Then** only the PO sees the count and the 3/6/9 review threshold; no disciplinary action is triggered.
5. **Given** a P7 point penalty is reversed or reattributed, **When** the PO reviews strikes, **Then** strike history and counts are unchanged; a strike correction is a separate append-only PO action with opaque audit evidence.

## Edge Cases

- Exact 24-hour follow-up boundary; failed submission versus successful submission; deadline and action timestamps spanning Cairo midnight/month close.
- Initial plan pair delivered exactly at versus just after the persisted F15 D-03 deadline; no later delivery; pair delivery retries/concurrency, later revisions, renewal pairs, reassignment around the breach, and F26 purge after strike creation.
- Duplicate F19 delivery, retries, duplicate refund events, replayed idempotency key with changed arguments, and concurrent PO edits.
- Plan delay and follow-up penalties coexist; ledger sum crosses below zero; reversal occurs in a later month.
- Late, disputed and followed-up states must not erase earlier timestamps or the fact that a late deduction was posted.
- Month-close races a source event or PO correction; two PO edits target the same month; finalized Sales projection is requested from a different workspace.
- Closed client reaches F26 purge eligibility: retain staff KPI attribution through the KPI ledger/snapshots; do not rely on `audit_events` for KPI facts or retain client PII beyond F26 retention.
- Staff departure during an in-flight write; authorization must be rechecked at commit/serialization boundary.

## Requirements

### Functional Requirements

- **FR-001**: Append a durable, non-PII earned-point fact when an eligible immutable F19 activation qualifies: +1 per eligible new client exactly once; no points for renewal, upgrade or revision. The fact MUST retain workspace, staff, exact amount, Cairo effective month, rule version and opaque unique source key without a client FK. Historical totals and snapshots MUST use this P7 fact, never recompute from purgeable F19 rows.
- **FR-002**: Record plan delay as -1 when the initial workout/nutrition plan pair is first successfully delivered after the authoritative persisted F15 D-03 deadline; do not recompute that deadline. Trigger/effective month is when the deadline passes in Africa/Cairo. Attribute the automatic event to the Trainer assigned at that instant; record assignment history and confirming actors separately. The PO may append a reattribution. On-time delivery adds zero. The existing late-plan case remains subject to existing human-reviewed 3/6/9 strike rules; check-in penalties do not create strikes.
- **FR-003**: Append one -0.5 check-in delay event when follow-up is later than successful submission+24h or remains absent after that deadline. A follow-up timestamp exactly at the 24h deadline is on time and creates no penalty. The evaluator uses the deadline as effective trigger time, including catch-up; confirmation and evaluator converge on the same event key. Attribute to the Trainer assigned at breach; record confirmer separately; the PO may append a reattribution. Client lateness alone never penalizes a Trainer. Preserve Late history after follow-up.
- **FR-004**: Form statuses are Scheduled, Awaiting Client, Client Overdue, Submitted. Follow-up statuses are Pending, Followed Up, Late, Disputed. A follow-up may be moved to `Disputed` only by the PO (Trainer, Sales and WO are read-only) when the PO disputes that follow-up's accuracy and/or its -0.5 event; scope is limited to that follow-up's accuracy and its -0.5 event only (no other point, report, payroll, salary or money effect). Allowed transitions: `Late` or `Followed Up` -> `Disputed` -> resolved; the resolved display derives from immutable history and no new terminal status is added. The original -0.5 event remains posted and immutable; any financial change is a separate PO append-only correction. Resolution outcomes are `valid`, `falseFollowUp` and `additionalPenalty`, each mapped to an explicit ledger action: `valid` appends +0.5; `falseFollowUp` makes no ledger change; for `additionalPenalty`, the PO enters a positive amount per dispute with exactly 2 decimal places and a maximum of 99,999,999.99, recorded as an append-only negative ledger entry. A PO report "dispute" is not a separate case; it uses the existing append-only correction/reattribution path (no separate dispute case). Opening a follow-up dispute requires a controlled reason code from the approved code list (`follow_up_not_recorded`, `recorded_time_incorrect`, `client_unreachable`, `wrong_trainer_attributed`, `system_or_technical_issue`) with EN/AR labels approved under S73-PO-8; see `specs/027-workforce-management/copy-approved-cb02-cb04-cb05.md` section "S73-PO-8 — follow-up dispute reason codes". At most one active dispute per follow-up; resolution is final; resolution restarts the 30-day F26 purge clock for tied client records. Check-ins page includes client name, phone, platform and Telegram usernames, schedule, submission/deadline/follow-up timestamps and responsible Trainer. Authorized Trainers see every historical Weekly Check-in for clients in their workspace, including other Trainers' follow-up. Reuse F15/F23 history; no second Forms engine. Check-in projection is narrow and does not widen general directory/assignment visibility or client-code access (S70-PO-1 item 1).
- **FR-005**: Follow-up confirmation represents Trainer review, Telegram follow-up and explicit Followed Up action; it earns no points. Preserve all status transitions, Late occurrence, and earlier follow-up timestamps in history.
- **FR-006**: Keep F19 source events immutable. Durable earned facts and all plan/check-in penalties, refund reversals, PO deductions, adjustments and corrections use a separate append-only attributed KPI ledger. Net Points = Earned + Transformation/Feedback - Penalties + PO Adjustments. Ledger rows are signed and summed once; negative totals are valid. Use exact numeric scale 2 arithmetic and canonical decimal strings over APIs, never JavaScript floating point; transformation/feedback weights have at most two decimal places. No point changes salary. Follow-up dispute resolution outcomes (`valid`, `falseFollowUp`, `additionalPenalty`) map to explicit ledger actions through this append-only correction path; the original -0.5 check-in event stays posted and immutable; `valid` appends +0.5, `falseFollowUp` makes no ledger change, and `additionalPenalty` records the PO-entered positive amount (exactly 2 decimal places, maximum 99,999,999.99) as an append-only negative ledger entry.
- **FR-007**: Only PO may add, deduct, correct or reattribute points, set compensation/incentives/financial deductions, approve payroll, decide full-refund staff fault, and select individual deductions. Automatic events are limited to explicitly approved triggers. No automatic discipline.
- **FR-008**: PO sets one monthly Basic Salary per Trainer/Sales employee, including provisioning; WO excluded. Salary is person-level across workspaces and owned by the platform PO; point reports remain per workspace. PO chooses a currency allowed for that market (Egypt: EGP; International: EGP/USD/SAR). Payroll approval means already paid externally. No payout or automatic salary deduction. Staff read only their own compensation.
- **FR-009**: Monthly transformation entry uses Trainer/month counts and per-transformation points. Feedback counts use per-Trainer defaults +1/-1 with customization and history. Notify PO through existing notification/outbox, deduped by workspace+month and behind existing scheduler activation gates. Preserve immutable revisions; exactly one latest effective revision per Trainer/month/category contributes; superseded revisions remain history but are not additive. Draft and PO-approve AR/EN copy per screen batch before each UI slice.
- **FR-010**: Sales funnel reports distinct links issued, registrations and approvals plus confirmed first-payment counts and acquisition-point, refund-reversal, point-deduction and PO-adjustment counts/sums from existing authoritative P7 facts, separate from net points. Report the Cairo event month, workspace-scoped and PO-only, without client PII; use the existing PO-authorized F21 `public.p7_workforce_report` projection for staff display names. Reuse F10 sales_productivity_units and issuance-time Sales-role snapshot; one unique source-unit-to-P7-earned-fact mapping; idempotently backfill existing units. Award +1 once after approval and confirmed first payment; installments count equally. Any completed refund of the acquisition purchase reverses that acquisition point once. Retain no client FK or PII in the point fact.
- **FR-011**: Full refund means F13 refund amount equals all refundable collected funds of that acquisition purchase scope at that time; deactivation is not the signal. Ask PO about staff fault once per acquisition only on full refund. A yes answer permits PO selection of relevant workspace Trainers/Sales and individual deductions. Any completed partial refund reverses the Sales acquisition point once but shows no staff-fault questionnaire. F13 eligibility and amount rules remain unchanged.
- **FR-012**: Before Cairo month-end and PO finalization, Sales may see its own PO-configured Basic Salary via the existing own-compensation read and sees no KPI total; the heading is approved `workforce.salesProjection.notAvailable`, the message key `workforce.salesProjection.notAvailableUntilNextMonth` is approved as S74-COPY-01 by S74-PO-3, and the old `workforce.salesProjection.notAvailableHint` is not shown on this state. After both gates, Sales receives only its own finalized monthly point total. No live total, formula, client scoring, reason, deduction, attribution, adjustment, other employee's data or event detail is disclosed. Enforce at UI, server/API, RPC, RLS, exports, Realtime, counts, notifications, cache and replay paths. Preserve authorized F10 visibility and S70-PO-1 item 1 boundaries.
- **FR-013**: Create immutable monthly snapshots/finalization with formula version, source watermark, PO detail and role-safe projections. Every point producer and month close takes the same workspace+month advisory fence after existing source locks in a documented fixed order. Closed months never change. Recheck authorization after lock waits. Closed-month late corrections go to current open month linked to original month.
- **FR-014**: A correction/refund reversal belonging to a finalized month is booked in the current open month, linked to the original month; never restate/reopen the closed month or change its Sales total (S70-PO-18 answer #1).
- **FR-015**: F13 owns all refund rules. Any completed refund reverses the acquisition point once. Full refund question, answer, and selected deductions use F13's existing transaction/lock boundary; deduplication is per acquisition, with questionnaire identity independent from the once-only point reversal. Repeated/concurrent refund processing cannot duplicate either effect.
- **FR-016**: A strike is one immutable event per client and initial subscription when the persisted F15 D-03 deadline passes without the first successful workout/nutrition plan pair (S70-PO-20; S70-R109; S70-R110). Reuse the stored F15 deadline; never recompute it. The breach instant is when the deadline passes without the pair, even if it is never delivered; later delivery does not move the instant or create another strike. Attribute to the Trainer responsible at breach. Count `breach_at > now() - interval '90 days' AND breach_at <= now()` in `timestamptz`; Cairo is display only. Expose 3/6/9 thresholds to the PO for review only; strikes never trigger automatic discipline. Preserve source events without client FK or PII, using an opaque source key. Departure immediately revokes access, permits PO reassignment, and preserves historical attribution.
- **FR-017**: Enforce workspace isolation, deny-by-default and both authorization walls. Every tenant record/projection is workspace-scoped; unauthorized/foreign workspace accesses fail without existence disclosure. Check-in history uses a narrow projection only; general assignment and directory policies remain unchanged.
- **FR-018**: Client PII follows the approved 30 days post-closure; audit events are pseudonymized 30 days after creation. Retained P7 ledger has no FK to client-scoped rows and no client PII. Add client-linked follow-up/questionnaire records to F26's purge allowlist with a narrow tested path; never purge staff amounts/attribution. An open P7 follow-up dispute or full-refund staff-fault review pauses purge of tied client records like an open refund/dispute; resolution restarts the 30-day clock. At most one active dispute per follow-up; resolution is final and restarts the 30-day clock. Historical KPI attribution remains in P7 ledger/snapshots, never audit_events.
- **FR-019**: Telegram Response Speed is post-launch only. Document configurable Trainer shifts and future monitoring; once implemented and technically supported, response >1 hour during the responsible shift incurs -0.5 Timeliness point. Current research finds inbound and bot-authored timestamps observable, but human Trainer reply time/identity unverified and ordinary bots cannot observe human-to-human messages. No current runtime behavior or implementation task.
- **FR-020**: All point, salary, payroll, quality and attribution writes are auditable and transaction-safe; immutable history and idempotency apply to duplicate requests. Authorization is rechecked after waits; changed arguments on replay fail without mutation. P7 financial/KPI audit_events.details contain no amounts, reasons, employee/salary or KPI details, only an opaque reference; full evidence stays in PO-only P7 records. Preserve unrelated WO audit access. Entering or resolving a follow-up dispute is PO-only and follows the same auditable, transaction-safe, idempotent and authorization-recheck rules; opening requires a controlled reason code.
- **FR-021**: Sales own finalized total stays stable after close. Late correction/reversal appears only in the current open month and links to the original month; closed month and previously displayed Sales total never change (S70-PO-18 answer #1).
- **FR-022**: Initial point period is the Africa/Cairo month its trigger happens: Trainer +1 at client activation; Sales +1 when approval and first confirmed payment qualify; check-in penalty when 24-hour deadline passes; plan penalty when F15 deadline passes. Transformation/feedback use PO-selected month. A closed-month correction follows FR-014.
- **FR-023**: Preserve all immutable monthly-quality revisions, but count only latest effective revision per Trainer/month/category. Revised count, weight, or zero value replaces effective contribution in the projection; never sum superseded full values.
- **FR-024**: Inventory existing audit readers and protect P7 financial/KPI evidence. WO's existing unrelated audit rights remain; P7 sensitive event detail is not accessible via audit_events.
- **FR-025**: Deny raw P7 events through Realtime/publications, broadcasts/subscriptions, HEAD/count/existence/search, notification payloads, exports and cache. No staff notification reveals event details or pre-finalization Sales activity. Test each channel with real roles.
- **FR-026**: Strike events and corrections are separate from the P7 point ledger. Point penalty reversal or reattribution never inserts, updates, or removes a strike. Only the PO may append a strike correction through the separate strike correction path: `void`, `reinstate` (reverses latest void), or `reattribute` to a Trainer in the same workspace who held access at breach. Latest correction determines effective state; each requires a reason and has an opaque audit reference without client PII. Cite S70-PO-20, S70-R109 and S70-R110.
- **FR-027**: Provide a workspace-scoped idempotent check-in due evaluator and operator-run path. Use one stable occurrence key per check-in; evaluator, catch-up and confirmation converge on one -0.5 entry. Scheduler remains behind existing activation gates.
- **FR-028**: PO-only manual monetary incentive/deduction/correction inputs use exact minor units and currency, immutable lineage, never automatic and never derived from points. One payroll approval per employee+month is unique and bound to reviewed immutable snapshot version and exact amount/currency. Reject stale versions; distinct idempotency keys cannot approve twice.
- **FR-029**: Before each UI slice, draft AR/EN strings for that screen batch and obtain PO approval. Backend work may proceed independently; no unapproved string ships. The CB-05 follow-up dispute resolution keys are PO-approved (S70-PO-23); the follow-up dispute reason-code code list and its EN/AR labels are approved under S73-PO-8 (see `specs/027-workforce-management/copy-approved-cb02-cb04-cb05.md` section "S73-PO-8 — follow-up dispute reason codes").

### Key Entities

- **P7 earned-point fact**: durable non-PII staff/workspace/amount/trigger-month/rule-version record with opaque source key; no client FK.
- **Sales source-unit map**: unique mapping from existing F10 sales_productivity_unit and issuance-time role snapshot to a P7 earned fact, including idempotent backfill.
- **F19 productivity event**: immutable source event for one eligible new client and responsible Trainer.
- **KPI ledger entry**: append-only signed points with workspace, staff, category, source/dedup key, effective month, actor, reason, timestamps and reversal/correction reference.
- **Monthly KPI snapshot/finalization**: period and formula version; calculated detail for PO; least-privilege role projections; finalization actor/time.
- **Check-in / follow-up history**: existing F15/F23 form and answer snapshot plus status transitions, responsible Trainer, actor and event timestamps.
- **Compensation/payroll record**: PO-controlled Basic Salary, incentive/adjustment inputs, period snapshot, externally-paid approval and immutable history.
- **Monthly quality record**: Trainer transformation counts/points and feedback counts/weights with month, author, revision history.
- **Sales link attribution/acquisition**: F10 link issuer, approval and first-payment qualification, one-point ledger event and refund reversal.
- **Strike event**: immutable, one per client and initial subscription when persisted F15 D-03 passes without the initial workout/nutrition plan pair; stores workspace, Trainer-at-breach, `breach_at`, and an opaque source key only (no client FK or PII). PO corrections append separately; 90-day counts and 3/6/9 review flags are PO-only.
- **Follow-up dispute record**: PO-only record tying one active dispute to one follow-up (its accuracy and/or its -0.5 event); stores PO actor, entry timestamp, controlled reason code (code list/labels approved under S73-PO-8; see copy-approved-cb02-cb04-cb05.md section "S73-PO-8 — follow-up dispute reason codes"), resolution outcome (`valid`/`falseFollowUp`/`additionalPenalty`), resolution timestamp and opaque audit reference; no client PII. At most one active dispute per follow-up; resolution is final and restarts the 30-day F26 purge clock. Resolution outcomes map to explicit append-only ledger actions (valid: +0.5 reversal of the follow-up penalty; falseFollowUp: the -0.5 penalty stands; additionalPenalty: an extra deduction whose amount the PO enters manually per dispute; S74-PO-1); the original -0.5 remains immutable.

## Success Criteria

- **SC-001**: Each eligible F19 new client produces exactly one +1 Trainer event; 100% of renewals/upgrades/revisions produce zero productivity events.
- **SC-002**: All valid late plan/check-in triggers produce exactly one −1/−0.5 penalty respectively; invalid/client-caused lateness produces zero; negative monthly totals are representable.
- **SC-003**: Across duplicate and concurrent submissions, each penalty/reversal/adjustment source key has at most one effective ledger entry and immutable originals remain unchanged.
- **SC-004**: Every check-in page field/state is available to authorized same-workspace Trainers; all workspace Weekly Check-in histories are visible; foreign-workspace records are not.
- **SC-005**: Role/capability matrix passes at app/API/RPC/RLS/export boundaries; Sales gets zero KPI detail or live totals and only its own finalized monthly total after month-end.
- **SC-006**: Repeated any-refund handling creates one acquisition reversal; only full refunds create one questionnaire/decision; partial refunds create no questionnaire; F13 amount/eligibility remains unchanged.
- **SC-007**: Every monthly snapshot can be recomputed from retained ledger entries with equal totals, formula version and attribution after client PII purge.
- **SC-008**: Salary, points and payroll actions preserve append-only history; only PO writes privileged values; payroll approval represents external payment; no payout occurs.
- **SC-009**: Strike counts at 3/6/9 over rolling 90 days trigger review visibility only and no discipline action.
- **SC-010**: All Given/When/Then scenarios are covered by named acceptance tests in implementation slices; this spec-only lane does not claim execution.

## Assumptions and decisions

- Africa/Cairo is the existing system timezone for dates and month boundaries (F10/F12/F13 conventions); this is a technical consistency choice, not new policy.
- Reuse existing workspace membership, F10 link attribution, F12 approval/payment events, F13 refund lifecycle, F15/F23 forms/history and F19 immutable productivity facts. The source audit must verify exact integration points in implementation planning.
- S70-PO-16 resolves the legacy P7 deferral and conflicting KPI decisions. Refer to each binding requirement as “S70-PO-16 §N”.
- S70-PO-18 answers P7-MCQ-01/02 and SOL-08/09/20: closed-month corrections carry to the current month; salary is one monthly person-level entitlement owned by the platform PO; initial point month is trigger month in Cairo; copy approval is per screen batch. S70-PO-20/S70-R109 set the strike source; S70-R110 resolves P7-MCQ-04/05 with the breach instant, exact rolling-window bounds, correction operations/composition and same-workspace breach-time reattribution.

## Out of scope

- Telegram response-time monitoring implementation; automated payouts or salary deductions; automatic discipline, firing or strike consequences; changing existing F13 refund eligibility; duplicate Forms engine; modifications to F19 source history; implementation, migration or stack work in this documentation lane.

## Clarifications

### Clarification session 2026-11-25 - S70-PO-16, S70-R95, S70-PO-18, S70-PO-20, S70-R109, S70-R110

- P7 included in scope; the v1-scope P7 deferral and conflicting legacy KPI math are superseded. Reuse F15's existing D-03 five-working-day plan delivery clock and its Africa/Cairo/Friday/18:00 rules for determining plan lateness; this does not restore any conflicting legacy KPI calculation.
- Net formula, penalty values/triggers, role boundaries, point rules, check-in statuses/visibility, refund handling, Basic Salary/payroll meaning, feedback defaults, strike thresholds, departure and Telegram post-launch boundary are answered by S70-PO-16 §1–6.
- S70-PO-18 #1 carries closed-month corrections into current open month with an original-month link; #2 sets one monthly person-level salary in market currency with platform-PO ownership; #3 uses the Cairo trigger month; #4 requires per-screen-batch copy approval.
- S70-R95 resolves SOL-01..24, including durable non-PII earned facts, any-refund reversal, protected audit details, latest-effective quality revisions, due evaluator, breach-time attribution, F10 unit reuse/backfill, monetary payroll inputs, snapshot approval, F26 purge/hold integration, shared period fence, funnel counts, decimal wire format, narrow check-in projection, channel inventory and strike separation.
- S70-PO-20 selects late initial workout/nutrition plan-pair delivery after the persisted F15 D-03 deadline as the strike source; one strike per client, attributed to the Trainer responsible at the deadline. S70-R109 confirms this is a requirement change to FR-016, FR-026 and T033. Rolling 90-day counts and 3/6/9 thresholds are visible only to the PO for review; no automatic discipline. PO strike corrections are separate, append-only, and audited with an opaque reference.
- S70-R110 resolves P7-MCQ-04/05: breach instant at persisted F15 deadline passage; rolling 90 x 24 hours with exclusive lower and inclusive upper bounds; PO-only append-only `void`, `reinstate`, and same-workspace breach-time `reattribute` corrections, latest correction effective, reason required, opaque audit reference. No open product MCQs remain. C1/C2 are resolved by the pending separate Constitution 1.20.0 amendment PR in lane `s70-gemini-const120`; this spec change does not edit the Constitution.

### Clarification session 2026-11-28 - S73-PO-6 (PO verbatim "all recommended")

PO source: `C:/Users/NEW LAP/.lifter/runs/s73-po/s73-po-6.verbatim.txt` ("all recommended"); decisions PDN-01..PDN-08 in `C:/Users/NEW LAP/.lifter/runs/s73-hungerg-dispute/report.md` lines 115-169, Recommended option taken verbatim for each.

- PDN-01 (who may enter/resolve follow-up `Disputed`): **Recommended — PO-only review marker:** PO enters and resolves; Trainers/Sales remain read-only. Consequence: aligns with the current matrix; no staff appeal; requires PO-only RPC/UI and approved copy.
- PDN-02 (dispute scope): **Recommended — follow-up accuracy and its -0.5 event only:** narrowest object already named by FR-004/FR-018. Consequence: minimal schema and retention linkage; report/payroll corrections stay on existing paths.
- PDN-03 (transition graph): **Recommended — `Late`/`Followed Up` -> `Disputed` -> resolved; resolved display derives from immutable history.** Consequence: preserves existing statuses/timestamps and avoids a new terminal status; needs explicit resolution metadata.
- PDN-04 (the -0.5 while/after dispute): **Recommended — keep the original -0.5 posted and immutable; any financial change is a separate PO append-only correction.** Consequence: aligns with FR-003/FR-006 and the "do not erase posting" rule; totals change only through attributed corrections.
- PDN-05 (resolution outcomes): **Recommended — PO chooses `valid`, `falseFollowUp`, or `additionalPenalty`, each mapped to an explicit ledger action.** Resolved under S74-PO-1 (Option A): `valid` -> +0.5 reversal of the follow-up penalty; `falseFollowUp` -> the -0.5 penalty stands; `additionalPenalty` -> an extra deduction whose amount the PO enters manually per dispute (no fixed amount). All as append-only ledger entries.
- PDN-06 (PO report dispute as separate case): **Recommended — no separate case; "dispute" uses the existing append-only correction/reattribution path.** Consequence: avoids duplicate workflow and matches defined closed-month behavior.
- PDN-07 (reason/evidence): **Recommended — required controlled reason code; no client PII in retained dispute data.** Consequence: consistent audit/filtering; the code list and EN/AR labels are approved under S73-PO-8 (`follow_up_not_recorded`, `recorded_time_incorrect`, `client_unreachable`, `wrong_trainer_attributed`, `system_or_technical_issue`; see `specs/027-workforce-management/copy-approved-cb02-cb04-cb05.md` section "S73-PO-8 — follow-up dispute reason codes").
- PDN-08 (cardinality/reopen/purge clock): **Recommended — one active dispute per follow-up; resolution is final; resolution restarts the 30-day clock.** Consequence: deterministic hold and idempotency; later issues require a new follow-up/correction path.

Applied to: FR-004, FR-006, FR-018, FR-020, FR-029; new follow-up dispute record entity; T036-T038. PDN-07 reason-code code list and EN/AR labels approved under S73-PO-8; PDN-09 outcome ledger mapping resolved under S74-PO-1.

### Clarification session 2026-11-28 - S73-PO-8 (PDN-07 reason-code copy approval)

PO source: `C:/Users/NEW LAP/.lifter/runs/s73-po/s73-po-8.verbatim.txt` ("Approve all five PDN-07 codes and English labels, with the following Arabic edits"); approved code list and EN/AR labels recorded in `specs/027-workforce-management/copy-approved-cb02-cb04-cb05.md` section "S73-PO-8 — follow-up dispute reason codes".

- PDN-07 (reason/evidence) code list and EN/AR labels: APPROVED under S73-PO-8 — five controlled reason codes: `follow_up_not_recorded`, `recorded_time_incorrect`, `client_unreachable`, `wrong_trainer_attributed`, `system_or_technical_issue`. Arabic labels per PO edits (rows 1, 3, 4) with rows 2 and 5 unchanged. No client PII in retained dispute data. Consequence: T038 reason-code copy batch is satisfied by S73-PO-8; reason-code validation/UI may proceed.

Applied to: FR-004, FR-020, FR-029; T038 (reason-code copy batch); CB-05 dispute keys plus S73-PO-8 reason-code copy.

### Clarification session 2026-11-28 - S74-PO-1 (PDN-09 resolution outcome ledger mapping)

PO source: `C:/Users/NEW LAP/.lifter/runs/s74-po/s74-po-1.verbatim.txt` ("* PDN-09: A — additional penalty amount manually entered by PO per dispute"; cited as S74-PO-1, never rewritten).

- PDN-09 (dispute resolution outcome ledger mapping): Option A approved by S74-PO-1:
  - `valid`: +0.5 reversal of the follow-up penalty, as an append-only ledger entry.
  - `falseFollowUp`: the -0.5 penalty stands (no additional ledger adjustment).
  - `additionalPenalty`: an extra deduction whose amount the PO enters manually per dispute (no fixed amount), as an append-only ledger entry.
    All as append-only ledger entries.
    Bounds and validation rules for the PO-entered amount were resolved by S74-PO-4 (PDN-10), recorded below.

Applied to: FR-004, FR-006, FR-018, FR-020; follow-up dispute record entity; T036-T037.

### Clarification session 2026-11-28 - S74-PO-4 (PDN-10 additional penalty amount)

PO source: `C:/Users/NEW LAP/.lifter/runs/s74-po/s74-po-4.verbatim.txt` ("PDN-10 A"; architect mapping S74-R55).

- PDN-10 (additionalPenalty amount): Option A approved by S74-PO-4. For each dispute, the PO enters a positive amount with exactly 2 decimal places, maximum 99,999,999.99, using the same validation as T013 manual deductions in `supabase/migrations/20261227030000_p7_manual_point_adjustments.sql`; store it as an append-only negative ledger entry.

Applied to: FR-004, FR-006, FR-018, FR-020 and T036.

### S74 clarification — Sales projection and funnel (2026-11-28; S74-PO-2, verbatim at `C:/Users/NEW LAP/.lifter/runs/s74-po/s74-po-2.verbatim.txt`; architect mapping S74-R12)

Verbatim PO answer from `C:/Users/NEW LAP/.lifter/runs/s74-po/s74-po-2.verbatim.txt`:

> Decisions: **1A 2A 3A (modified) 4B 5B 6B 7A.**
>
> For 3A, display the PO-configured Basic Salary and a message explaining that the KPI points total is not available yet and will become available at the beginning of the following month, once finalized.
>
> Update the specs accordingly and proceed.

The following is architect mapping (S74-R12), not PO wording:

- MCQ1=A approves Sales own-total copy batch rows 1–11: ten CB-04 reuses and new `workforce.salesProjection.aria.total`.
- MCQ2=A approves PO funnel copy batch rows 12–27, including the five conditional columns activated by MCQ4=B. MCQ6=B mounts the funnel inside the existing PO workforce report. `workforce.salesFunnel.title` and `workforce.salesFunnel.aria.table` are approved; the section heading actually rendered is existing `workforce.report.section.sales`, and the table's accessible label uses `workforce.salesFunnel.aria.table`.
- MCQ3=A modified: before Cairo month-end/PO finalization, show Basic Salary under existing approved `workforce.compensation.own.basicSalary`, read only for the Sales caller's own row through `public.p7_get_own_compensation`; then show the `workforce.salesProjection.notAvailable` heading and proposed `workforce.salesProjection.notAvailableUntilNextMonth` message. Do not show `workforce.salesProjection.notAvailableHint` on this state. The English/Arabic message is S74-COPY-01, approved verbatim by S74-PO-3 and recorded in the copy approval table.
- MCQ4=B approves eight funnel categories: links issued, registrations, approvals, confirmed first payments, acquisition points, refund reversals, point deductions, and PO adjustments. New T039 extends the current PO-only `public.get_sales_funnel` read (which currently returns only link, registration and approval counts) using existing P7 ledger/refund-reversal/adjustment facts, Cairo event month, workspace scope and non-PII output. T025 depends on T039.
- MCQ5=B: each row shows the employee's name through the existing PO-only F21 projection `public.p7_workforce_report`; this introduces no staff-name surface beyond the PO.
- MCQ7=A: `empty` maps to `workforce.salesProjection.empty`; `not_available` maps to the MCQ3 state above.
- Sales' own compensation access is already defined by `p7_get_own_compensation`: Trainer/Sales may request only their `auth.uid()` id. No access widening is introduced.
- No open behavior MCQs remain. S74-COPY-01 is approved by S74-PO-3; T025 must use the approved string in the copy approval table.
