# Feature Specification: F13 — Freeze, renewal, refunds and expiry

**Feature ID**: F13

**Feature Branch**: `013-freeze-renewal-refunds`

**Created**: 2026-10-29

**Status**: Draft (pending Spec Debate)

**Input**: Session 12, lane 3. Specify freeze apply/stop/remove, early-renewal stacking, expiry and PO-only full refunds. Consume F12's subscription, obligation, collection, correction and ledger model. Specification only; no implementation, migrations, database operations, Docker, plan/tasks or PR.

## Authority and scope traceability

Baseline: `origin/main` at `a8c7ae569e1ae1380740230b90817679b22d465b`. F12 dependency inspected read-only at `origin/012-registration-approval` = `89fe2a86e302df0ce585213071cdd26a39884077`; its artifacts are proposed contracts, not installed behavior. References below pin that revision so later remote changes cannot silently change this draft.

The [roadmap](../../docs/03-roadmap.md) P1 row is quoted verbatim:

```text
| **P1 Commercial core** | Workspaces, memberships, branding preview/publish, PO-only packages + versions (30-day months: 1/3/6/8/12, custom days), registration tokens (24h/+30m) with staff-configured installment schedule, global email/phone uniqueness + generic duplicate message, signup, approval, subscriptions + snapshots, ledger (confirmed payments, PO full refunds), per-payment commission, installment overdue restriction/resume, freeze (apply/stop/remove), early-renewal stacking, expiry, PO-only deletion/removal | A (to approval), D, G | 5–8 ew | — |
```

Sources and precedence:

- [Decision register](../../docs/04-changes-and-questions.md): D-04 preserves remaining days and starts new duration after the current term; D-05 pauses/extends entitlement, Stop keeps elapsed frozen days, Remove reverses the effect, every change audited; D-09 grants PO/WO/Sales renewals, installment recording and freeze management; D-10 reserves refunds/deletion to PO; D-11 uses 30-day months and PO pricing; D-12/13/15/17 govern overdue access, collections, full refunds and exact installment totals; D-23 and final F12 decisions supersede earlier F12 proposals.
- [BRD/PRD master](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-01 invariants; BRD-02 role/tenant boundaries; BRD-03 external payments and immutable finance; BRD-04.7–10 activation, expiry, renewal and closure; BRD-05 preserved genuine delivery credit after refund; BRD-06 meaningful timeline; PRD-01/06/07/10/11/12/13/14 (Journey D); DR-01/02/03. D-15 overrides older full/partial-refund wording; D-11/12/17 and final F12-3/8 override fixed 50/50 assumptions. No YBS rule is imported.
- [Constitution 1.3.0](../../.specify/memory/constitution.md), all nine principles; [carried requirements](../../docs/12-carried-requirements.md) contains REQ-P2-01 for P2 only, which F13 must preserve; [production readiness](../../docs/13-production-readiness.md); [tracker F13 row](../../docs/10-feature-tracker.md) currently says Not started, depends on F12; this draft does not claim delivery or update shared tracking files.
- F12 pinned [spec](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/spec.md), [plan](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/plan.md), [model](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/data-model.md), [staff/client contract](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/contracts/registration-approval-surface.md), and [handoffs](https://github.com/sekiirro/LIFTER/blob/89fe2a86e302df0ce585213071cdd26a39884077/specs/012-registration-approval/contracts/feature-handoffs.md). Consume these seams; do not copy their financial system into F13.

### Ownership conclusions

**Installment overdue restriction/resume**: F12 does NOT deliver enforcement, notices or resume. Its spec Out of Scope names both F13 “overdue enforcement” and P4 “Installment overdue restriction/notices”; its handoff explicitly says P4 owns overdue restrictions, notices, expiry and reporting. F12 owns obligation/collection truth and activation-relative due projection (FR-004/027, final F12-2/8). This is an inconsistent F13/P4 handoff, not permission to implement overdue enforcement in this draft. ND-F13-10 asks PO to allocate it. D-12 remains binding regardless of owner.

**PO-only deletion/removal**: F12 spec Out of Scope excludes client closure/deletion; FR-026 excludes identity/link release. No inspected F12 contract delivers it. D-10 and BRD-04.10 establish PO authority and external closure request, but do not assign delivery to F13 or define the roadmap's “removal.” ND-F13-11 asks PO to assign scope. Freeze Remove is only reversal of a freeze's entitlement effect; it never deletes a client, subscription or ledger row.

**Expiry**: F13 owns the expiry definition/projection requested here. P4's handoff also lists expiry and owns real plan/export access and portal notifications. F13 must supply a consumable entitlement decision; P4 supplies enforcement/notification consumers. ND-F13-10 resolves the handoff before planning, without removing expiry from F13's requested specification.

## User Scenarios & Testing

These are future acceptance requirements, not executed tests. Policy-dependent scenarios are explicitly conditional on the referenced NOT DECIDED question; no recommendation below is an approved default.

### User Story 1 — Return all collected money safely (Priority: P1)

As PO, I record a full subscription refund after the externally performed refund is confirmed, reverse collected revenue and its earned commission, cancel unpaid obligations and end that subscription without erasing history.

**Why this priority**: D-15 makes a partially refunded or still-collectable canceled subscription financially incorrect.

**Independent Test**: Use an F12 fixture with immutable terms, two collected installments and one unpaid installment. Refund as PO, reconcile every linked event, retry and attempt later collection; deny the same operation as WO/Sales/Trainer.

**Acceptance Scenarios**:

1. **Given** an eligible subscription with collected amounts 10,001 and 20,000 minor units and stored commissions 1,000 and 2,000, **When** PO confirms a full refund, **Then** linked refund reversals total -30,001 revenue and -3,000 commission, unpaid obligations are canceled, entitlement ends, and audit/receipt commit atomically (FR-014..019).
2. **Given** a lost success response or two PO sessions refunding the same expected subscription state, **When** requests are retried/compete, **Then** one refund outcome commits; exact authorized replay returns its identical receipt and a distinct stale request creates nothing (FR-023..026).
3. **Given** a collection previously corrected and recollected, **When** a refund is evaluated under ND-F13-07's approved policy, **Then** no corrected original is reversed twice, no canceled obligation is restored to payable, and all original bytes remain unchanged (FR-017/020/021).
4. **Given** an audit/deferred-integrity failure, **When** refund is attempted, **Then** no reversal, cancellation, entitlement termination or success receipt remains (FR-026).

### User Story 2 — Pause and correctly resume entitlement (Priority: P1)

As PO, WO or Sales, I apply a configured freeze, stop it early while retaining elapsed frozen days, or remove its effect, with a readable history.

**Why this priority**: D-05 promises preserved paid days and distinguishes Stop from Remove.

**Independent Test**: On a synthetic activated term, apply a ten-day freeze, stop after three counted Cairo days, and separately remove a freeze. Verify expiry projections, role denials and immutable events under the PO-approved day policy.

**Acceptance Scenarios**:

1. **Given** an eligible activated term and approved freeze duration/boundary policy, **When** a freeze is applied, **Then** service entitlement is paused for its effective interval and the expiry extension equals its counted frozen days (FR-006..010).
2. **Given** ten planned frozen days and three elapsed frozen days under that policy, **When** Stop commits, **Then** only three days remain credited; **When** Remove instead commits, **Then** that freeze contributes zero extension, without erasing apply/stop history (FR-008/009).
3. **Given** no activation fact, **When** freeze or expiry is evaluated, **Then** no start/end date or elapsed service days are fabricated; freeze eligibility remains subject to ND-F13-02 (FR-005).
4. **Given** concurrent freeze changes, renewal or refund, **When** competing expected-state operations run, **Then** each result corresponds to one serial history and no duration is counted twice (FR-024/025).

### User Story 3 — Record a renewal without losing paid days (Priority: P1)

As PO, WO or Sales, I confirm an externally paid renewal and retain the client's remaining entitlement using a new immutable purchase snapshot.

**Why this priority**: D-04 protects the paid remainder and D-13 protects collection-earned commission.

**Independent Test**: Seed an activated term with ten remaining days and an approved 30-day renewal offer. Record one renewal, verify uninterrupted 40-day coverage from the observation boundary under the approved calendar convention, unchanged original terms and exact collection/commission.

**Acceptance Scenarios**:

1. **Given** an early renewal with confirmed external payment and approved terms, **When** it commits, **Then** a distinct linked renewal subscription starts its duration at the predecessor's effective end, preserves all remaining days and uses the reused F12 obligation/collection model (FR-011..013).
2. **Given** package price/rate/duration changes after renewal purchase, **When** either term is read, **Then** each retains its own purchase snapshot; later settings change neither history (FR-003/012).
3. **Given** two sessions renewing the same expected chain tail, **When** they submit different keys, **Then** at most one appends there; the other must refresh and deliberately confirm any additional purchase (FR-025).
4. **Given** renewal before initial activation or after expiry, **When** its start is evaluated, **Then** the relevant ND-F13-05/06 decision must be supplied; no first plan-pair activation is invented (FR-005/013).

### User Story 4 — Determine expiry without disabling the account (Priority: P1)

As authorized staff and, through P4, the client, I can distinguish awaiting activation, future renewal, frozen, active, expired and refunded entitlement without mistaking payment approval for activation.

**Why this priority**: BRD-04.8/PRD-07 restrict plans at expiry while preserving login and settings.

**Independent Test**: Evaluate fixtures immediately before/at/after effective end, through Cairo DST changes, with no activation and with a stacked renewal. Verify P4's expected access decision independently of job execution.

**Acceptance Scenarios**:

1. **Given** a known entitlement interval, **When** its end boundary is reached, **Then** its service coverage ends under the approved ND-F13-03/09 convention; a contiguous eligible renewal can continue coverage without a gap (FR-004/027).
2. **Given** no activation on an initial subscription, **When** time passes or an expiry task reruns, **Then** expiry remains undefined, not expired or indefinitely active, and later installments remain uncollectable (FR-005/022).
3. **Given** expired coverage, **When** P4 consumes the result, **Then** plan viewing/export are restricted while login/settings and existing allowed account access remain; overdue is an independent reason whose clearance alone cannot override expiry, refund or freeze (FR-028).

### User Story 5 — Work within role, workspace and safe history boundaries (Priority: P1)

As an authorized staff member, I see only my permitted workspace operations and financial projections; a client sees only the approved self projection.

**Why this priority**: Constitutional isolation and financial privacy apply to reads, retries, background work and writes alike.

**Independent Test**: Exercise every operation with PO, own/foreign/revoked WO and Sales, Trainer, client and anonymous callers at both authorization walls; inspect receipts/audit/logs and future UI evidence.

**Acceptance Scenarios**:

1. **Given** a WO/Sales in A, **When** they freeze/renew in A, **Then** permitted actions succeed, but refund and any B target are denied; Trainer receives no freeze/renewal/refund mutation right (FR-001/002).
2. **Given** authorization revoked while a request waits, **When** it resumes or replays a receipt, **Then** current authorization is checked before any state/existence disclosure (FR-023/024).
3. **Given** a permitted lifecycle operation, **When** its audit and role-safe view are inspected, **Then** audit contains only allow-listed non-PII facts, Sales sees no commission, and no client sees staff/correction audit details (FR-029..031).

### Edge Cases

- Cairo midnight and DST transitions in both directions; a calendar day is not always 24 elapsed hours. Browser/server timezone, Friday, month end and leap day cannot change entitlement-day arithmetic.
- Freeze at activation, expiry or a renewal boundary; overlapping/repeated freezes; Stop on apply day; Remove after Stop, auto-completion or expiry; removal moving an end into the past. ND-F13-01..04/06 govern unresolved policy.
- Awaiting activation with a collected upfront installment: no expiry or later due date; freeze/renewal eligibility remains open. Refund can never manufacture delivery or productivity credit.
- Corrected earlier installment with later installments still collected; correction then recollection; all collections corrected so net collected is zero; cross-month correction/refund; a refund racing correction, collection or P4 activation.
- Multiple prepaid future renewals; predecessor freeze extends/removes days after successor purchase; refund of the middle of a renewal chain. Do not silently compress, shift or refund other purchases (ND-F13-06/08).
- Duplicate keys with different targets/amount expectations, distinct keys for the same intended purchase, two staff sessions, stale month/time observed before lock wait, uncertain network outcome, authorization revoked during wait.
- Values beyond floating-point exact range, full commission rounding ties, mixed currency/cross-workspace references, changed package settings, zero net collected and partial payment/refund attempts.
- An expiry materialization/notice job is delayed or duplicated: no extension of access merely because a job did not run; no duplicate lifecycle event/notice fact. P4/P6 delivery and obsolete-notice suppression require approved ND-F13-15 handoff.
- Refund versus deletion: neither erases financial/audit history; closure never implies returned cash. Genuine previously delivered productivity remains credited (BRD-05).

## Requirements

### Functional Requirements

Binding requirements below derive from cited decisions or the explicit brief. A requirement referencing ND-F13 is incomplete only for that policy branch; its recommendation is NOT DECIDED and must not be implemented as a default.

- **FR-001**: Apply two independent authorization walls to every lifecycle/financial read, mutation and replay. PO has global scope but must target an existing workspace; WO/Sales require current membership there. Every tenant record carries workspace identity with same-workspace parent correspondence; direct access, exports, jobs, notifications and receipts MUST deny foreign/nonexistent/revoked targets without existence disclosure.
- **FR-002**: PO/WO/Sales MAY record renewals and apply/stop/remove freezes under D-09; only PO MAY refund under D-10/15. Trainer, client and anonymous callers MUST be denied these mutations. Reuse `manage_freeze`, `record_payment` for confirmed renewal collections and `record_refund` with explicit PO checks; renewal orchestration capability mapping requires review at both walls. Preserve F12's superseding PO/WO-only registration approval rule, not older Sales approval.
- **FR-003**: Reuse F12 subscription/obligation/collection/correction truth. Snapshot each new purchase's approved version, price, currency, duration, commission rate and schedule; never mutate prior snapshots or obligations. Money MUST use bounded integer minor units/currency and exact transport/calculation; no floating-point amounts. Reuse F12 Round Half Up collection commission, but reverse stored commission exactly without re-rounding.
- **FR-004**: Derive all entitlement/freeze/renewal/expiry boundaries with `Africa/Cairo` calendar dates and actual timezone transitions. One month means 30 calendar days under D-11; custom duration stays exact. Never use a fixed UTC offset, 720 elapsed hours, browser timezone or working-day exclusions. Store recording instants separately from effective dates. Exact activation-day inclusion and freeze day rounding await ND-F13-03; no silent convention is permitted.
- **FR-005**: An initial subscription without P4's activation fact MUST have no service start/end or expiry date. It MUST NOT expire from approval/payment age, consume service/freeze days or permit later installments. Awaiting-activation is distinct from active/frozen/expired. Do not add a standalone activation writer. Unactivated freeze/renewal branches await ND-F13-02/05; a PO refund must end the target without generating activation, subject to ND-F13-07 eligibility.
- **FR-006**: Freeze Apply MUST record a positive configured calendar-day duration and immutable target/effective interval, pause service entitlement and extend its effective end for counted frozen days. Approved eligibility, maximum duration/count, scheduling/backdating and overlap policies MUST come from ND-F13-01..03, never inferred unlimited allowances.
- **FR-007**: Freeze completion/resumption MUST derive from its approved effective interval and recorded Stop/Remove facts, without changing original purchase duration, price, commission or collections. Natural completion keeps the full counted frozen interval; repeated completion evaluation has no additional extension or audit effect.
- **FR-008**: Freeze Stop MUST end an applicable freeze early and retain only elapsed frozen calendar days under the approved day convention; planned unused days MUST NOT remain credited. Stop never reverses money or deletes the original freeze. Repeated/invalid Stop cannot extend days again.
- **FR-009**: Freeze Remove MUST append a linked reversal of that freeze's entitlement effect: its net extension becomes zero. Apply/Stop/completion history remains visible. Applicability after completion/expiry and retroactive access consequences await ND-F13-04; removal is not physical deletion or a refund.
- **FR-010**: Freeze changes MUST NOT silently rewrite F12 installment amounts, issued offsets, activation fact or effective collection dates. Whether freeze shifts installment due projections and whether overdue blocks freeze are ND-F13-02. Existing F12 activation-relative due rules remain unchanged absent explicit PO amendment.
- **FR-011**: Recording renewal MUST require explicit external collection confirmation and approved purchase terms. Append a distinct renewal subscription linked to its predecessor/client/workspace and an exact-total obligation schedule, collection, stored commission, audit and receipt as one atomic result. Do not update the old subscription or reuse initial-registration approval to create the renewal.
- **FR-012**: An early renewal MUST preserve the complete remaining term and start its service duration when the predecessor's effective entitlement ends (D-04). New price/version selection awaits ND-F13-05; once purchased, its snapshot is immutable. A renewed subscription MUST NOT create productivity credit merely from payment; only genuinely new delivered plans can earn the P4/P7 credit.
- **FR-013**: Distinguish renewal purchase recording time, its approved renewal activation fact and its service start/end. PRD-07's immediate renewal activation MUST NOT consume stacked days before D-04's start. Renewal activation/late-renewal start and installment anchor need ND-F13-05; predecessor changes/future-chain reflow need ND-F13-06. Do not forge a first plan-pair activation to bypass F12 later-installment gates.
- **FR-014**: A refund MUST be one PO-only full-subscription operation: 100% of actually collected refundable revenue, exact reversal of associated earned commission, cancellation of all unpaid obligations and termination of target entitlement. No caller-chosen partial amount, proration for use/freeze, fee deduction or partial reversal is allowed. No unpaid amount earns refundable commission.
- **FR-015**: Append refund reversals linked to each eligible original collection in F12's unified ledger, with a single refund aggregate/operation identity. Each reverses the exact stored revenue and commission in original currency; total refund equals the sum of those amounts. Preserve original collection, earlier correction and purchase bytes. A collection can have at most one effective financial reversal across correction/refund kinds, regardless of request key.
- **FR-016**: Cancel unpaid obligations by new cancellation facts, not changing/deleting issued obligations or fabricating collected payments. Refunded/canceled obligations MUST NOT be collectible or restored by correction/replay. Refund ends the target's remaining/frozen entitlement and prevents subsequent freeze/renewal-from-that-target/activation writes inconsistent with terminal state; linked other purchases are governed by ND-F13-08.
- **FR-017**: Refund eligibility/amount calculation MUST account for the complete F12 chain: previously corrected collections contribute no active revenue/commission and MUST NOT be reversed again; valid recollections are distinct originals. Net-of-corrections policy and zero-net handling require ND-F13-07. Never refund gross historical positives while ignoring linked corrections.
- **FR-018**: LIFTER MUST record only an externally confirmed refund, without a payment-provider integration or commission settlement entry. External confirmation evidence shape and whether a separate cash-refund date is needed await ND-F13-12; do not add payment method/free-text reference against F12's existing restrictions without a decision.
- **FR-019**: Refund amount, commission reversals, unpaid cancellations, terminal entitlement event, receipt and successful audit MUST commit together or all roll back. Other subscriptions and account identity/login state MUST remain unchanged except for any separately approved ND-F13-08 chain policy.
- **FR-020**: An F12 correction fixes a mistaken collection record: one exact linked reversal, obligation unpaid again, subscription/approval unchanged, recollection possible. Its `effective_on` is the fresh Cairo correction-recording date/month (final F12-4, FR-025); originals remain in their original collection month. F13 MUST preserve this behavior and not invoke correction alone as a refund.
- **FR-021**: A refund is a distinct terminal cash-return event that cancels rather than restores unpaid obligations. Its posting-month/date policy awaits ND-F13-12; do not assume F12 correction-month approval automatically decides refund accounting. Before/after-refund corrections need ND-F13-07, but no decision may allow double reversal, history mutation, partial refund or recollection of a refunded target. Cross-month replay retains the original recorded/effective dates.
- **FR-022**: Preserve final F12-2/8: installment n≥2 only after activation, sequentially with all earlier obligations currently paid; early payment is allowed then. Due date equals Cairo activation date plus the issued offset, payable through that day's end (exclusive following Cairo midnight); default remainder offset 30 never replaces custom terms. F13 changes no initial activation date or issued agreement to resolve an overdue/freeze ambiguity.
- **FR-023**: Every apply/stop/remove, renewal, refund, cancellation and expiry materialization MUST have deterministic deduplication and immutable operation evidence. Bind staff request key to actor, operation, workspace, explicit target, expected lifecycle/chain/ledger revisions and canonical inputs/confirmation. Reauthorize before lookup/disclosure; exact replay returns identical committed role-safe receipt with no new effect/audit; changed key binding fails. Uncertain outcomes retain the same request/key for safe retry.
- **FR-024**: Serialize entitlement and money operations with F12's client → subscription → obligations/ledger order; extend to renewal chains in one deterministic order. P4 activation and expiry consumers MUST share the same serialization contract. Recheck current actor/membership after waits, hold authorization through commit and sample authoritative Cairo time after waits. A stale precheck/JWT/browser clock cannot authorize a changed state.
- **FR-025**: Guard invariants independently of idempotency keys: one effective freeze contribution per fact, no overlapping contribution counted twice, one successor per expected renewal tail, one reversal per collected event, one refund terminal result, no collection after cancellation. Competing distinct keys/two sessions MUST produce a valid serial result or safe stale-state rejection. Freeze vs renewal recomputes/checks the same expected end; refund vs freeze/renewal/activation/collection/correction cannot leave terminal entitlement with later collected debt. Exact committed replay is evidence, never a new current-state transition.
- **FR-026**: Validation, snapshot mismatch, overflow, stale expected state, revoked permission, audit failure or any deferred integrity failure MUST leave zero partial lifecycle, financial, cancellation or receipt effects. Report success only after commit. No client/financial deletion, mutable paid marker or success audit for rolled-back work is permitted.
- **FR-027**: Derive expiry from approved service start, immutable duration, effective freeze contributions and successor coverage. At the approved exclusive end the individual term no longer grants service; account-level coverage is the union of eligible purchased intervals, not merely the old term's expired flag. Boundary conversion/grace await ND-F13-03/09. Scheduled materialization may record one deduplicated transition but MUST NOT be required to obtain the correct current entitlement decision.
- **FR-028**: Provide P4 a tenant-scoped entitlement decision distinguishing awaiting activation, future coverage, active coverage, freeze, expiry and refund, with separate overdue input/reason. Clearance of one restriction MUST NOT clear other applicable restrictions. P4 must enforce expired/refunded/frozen service restrictions on plan reads/exports without disabling login/settings or adding a support/renewal CTA. Exact freeze access surface awaits ND-F13-14; overdue owner awaits ND-F13-10.
- **FR-029**: Audit freeze applied/stopped/removed, natural completion if materialized, renewal recorded, refund recorded, obligation canceled and expiry materialized with linked operation/target identities. Define one event owner per fact, no duplicate manual/trigger audit. Allowed details: internal IDs, bounded reason/status codes, old/new lifecycle revision, effective dates/day counts, exact minor-unit strings/currency and correlation IDs. Exclude names, email, phone, health data, tokens, raw IP, secrets, free text and argument dumps; common audit/receipts MUST omit commission. Audit failure rolls back its business change; preserve existing PO/WO audit scope.
- **FR-030**: Staff views MUST be capability/scope limited: PO global, WO own-workspace commission/finance and audit, Sales permitted payment/entitlement values without commission/rate or general audit access. Trainer receives no new financial/lifecycle reader right by implication. Clients receive no staff receipt, correction detail, commission or audit; any new self-only projection awaits ND-F13-14, and F12 self-status remains approval-only.
- **FR-031**: Flag all staff freeze/renewal/refund confirmations, expiry indicators and any new client view for the [Frontend Design Gate](../../docs/09-frontend-design-gate.md). Use DESIGN.md and existing tokens/components/i18n: Arabic RTL/English LTR, light/dark, mobile/desktop, all required states, keyboard and WCAG 2.2 AA; future rendered matrix evidence is mandatory. Design gaps await PO choices, not invented screens/navigation. No UI is built by this draft.
- **FR-032**: Client renewal/payment communication remains external. P4 displays expiry date/alerts only, with no in-app renewal request, redirect CTA, checkout or account-delete request. Preserve PRD-07's 3-day/1-day/on-expiry notice requirement for the owning consumer; delivery time/dedup after entitlement changes awaits ND-F13-15. Audit is not the client timeline; P5 may curate meaningful renewal events.
- **FR-033**: Preserve genuine completed delivery productivity after refund (BRD-05); do not reverse payroll, fabricate a new delivery unit or perform automatic compensation/discipline. Full refund and future deletion are distinct operations and never cascade-delete required records.
- **FR-034**: No affected policy branch may proceed to implementation until its ND-F13 answer is recorded, Spec Debate and PO approval complete, and plan/tasks/analyze plus applicable isolation/money/design gates exist. Future migrations MUST sort after all F12 `20261101…` migrations AND the final F14 set; reconcile latest shared audit/capability bodies before extending. No migration timestamp or readiness closure is asserted here.

### Key Entities

Logical concepts only; these are not new SQL definitions or permission grants.

- **Subscription purchase**: The existing F12 immutable terms, client/workspace identity and obligations. A renewal is another purchase linked to a predecessor, not an edit to the initial snapshot.
- **Activation fact and entitlement interval**: Existing F12 activation seam plus separately identified renewal activation semantics after PO decision; effective coverage derived from approved calendar policy, duration, freezes, terminal events and chain position. Unknown initial activation means unknown boundaries.
- **Freeze history**: Apply fact with configured duration/effective dates, linked Stop and Remove facts, computed retained contribution and lifecycle revision. Originals remain immutable.
- **Renewal chain**: Ordered same-client/workspace purchases with predecessor/tail identity and serialized revision, separating purchase date from service coverage and activation.
- **Installment obligation and cancellation fact**: Existing immutable F12 scheduled amount/sequence/offset; a linked cancellation ends collectability without replacing that snapshot or creating payment.
- **Unified financial event**: Existing F12 collection/correction stream extended by reviewed full-refund reversal semantics, original reference, exact amount/commission, dates and one-reversal invariant. No second ledger or mutable paid truth.
- **Full refund operation**: PO-confirmed terminal aggregate linking all included reversals, unpaid cancellations, entitlement end and receipt; never a partial amount or account deletion.
- **Operation receipt and audit fact**: Existing private idempotency concept extended for lifecycle operations and scheduled deduplication; actor/scope/expected-state binding, immutable safe result and PII-free evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In every eligible refund fixture, refunded revenue equals 100% of actually refundable collected revenue and reversed commission equals 100% of its stored commission; unpaid collectable balance and target future entitlement both become zero.
- **SC-002**: Across correction/recollection/refund fixtures, no original event receives more than one effective reversal; every original snapshot/event remains byte-identical and a refunded target is never recollectable.
- **SC-003**: A ten-day freeze stopped after three approved counted days contributes exactly three extension days; removing it contributes zero; repeat evaluation produces zero additional days.
- **SC-004**: A 30-day early renewal with ten remaining days preserves all 40 days of coverage under the approved boundary convention, with zero overlap loss or gap at successor start.
- **SC-005**: Every unactivated initial fixture has no expiry or later installment due date and admits zero later installment collections, including after freeze/expiry task replay.
- **SC-006**: Before/at/after-boundary cases covering both Cairo DST transitions, leap day and month end produce 100% of the PO-approved calendar results regardless of browser/server timezone or delayed background work.
- **SC-007**: For each mutation, same-key retries and at least two simultaneous distinct-key staff requests produce at most one effect per expected state/original; every tested freeze/renewal/refund/collection/correction/activation race matches a valid serial history.
- **SC-008**: All disallowed role/scope combinations at both authorization walls produce zero foreign data/existence, commission or receipt disclosure; permitted combinations complete only within their scope.
- **SC-009**: Every injected validation, integrity, audit or authorization failure leaves zero partial financial/entitlement effects; successful replay adds zero business/audit events and returns the identical receipt.
- **SC-010**: Every new audit/log/receipt capture point passes the no-PII/secret allow-list review; genuine delivery productivity counts remain unchanged in 100% of refund fixtures.
- **SC-011**: All affected future UI surfaces pass the eight-cell AR/EN × light/dark × mobile/desktop rendered evidence matrix and accessibility checks; client surfaces contain zero renewal/payment/closure request CTAs or staff-only financial details.

## Assumptions and policy status

- F9–F11 supply approved package versions, issued agreements and isolated client identities; F12 must land its reviewed finance contracts before F13 implementation. Inspected designs are dependencies, not proof of existing functions/tables.
- D-04/05/09/10/15 and final F12 decisions are binding; recommendations in the next section have no runtime effect. Missing original freeze allowances are NEEDS SOURCE CONFIRMATION under PRD-07/DR-02.
- P4 is future work: initial activation writer, plan access/export enforcement and portal notifications cannot be claimed delivered by F13 alone. F13 must define and verify the seam with synthetic facts later, without adding a public activation action.
- Explicit user scope limits artifacts to this spec/checklist. Do not write `.specify/feature.json`, shared registers, code, plan or tasks in this unit. Spec Kit's ordinary metadata/default/clarification behavior does not override this instruction to list all gaps and await debate.

## Open questions for PO

Every item is **NOT DECIDED**. Options and recommendations are proposals, not approvals or fallback behavior. Resolve affected branches before planning/implementation; verify original discovery evidence before selecting numeric allowances.

- **ND-F13-01 — NOT DECIDED:** What are the maximum freeze duration/count, configuration owner, overlap and scheduling/backdating rules? Options: A) PO-configured per-package limits snapshotted at purchase, non-overlapping current/future intervals; B) PO-configured workspace limits snapshotted at purchase, same interval rule; C) per-request PO approval including exceptional overlaps/backdating. Recommendation: A, with exact values recovered from discovery; no invented numeric cap or unlimited default.
- **ND-F13-02 — NOT DECIDED:** May unactivated/overdue subscriptions freeze, and does freezing shift installment due dates? Options: A) activated and non-overdue only, keep F12 due dates; B) activated including overdue, keep due dates and independent overdue restriction; C) allow preactivation scheduling and pause installment clocks under an explicitly amended F12 rule. Recommendation: A initially; preserve every issued schedule and do not consume service days before activation.
- **ND-F13-03 — NOT DECIDED:** Which Cairo day convention governs activation expiry and freeze Apply/Stop, and are fractional days credited? Options: A) activation local date counts as day one, expiry at midnight after the last covered date, freeze dates use half-open intervals and Stop takes effect next Cairo midnight; B) same activation convention but Stop takes effect at today's midnight with no credit for today; C) activation starts next Cairo midnight and all freeze changes occur at midnight. Recommendation: A, calendar-day credit only; confirm original intent for same-day Stop and short first service day.
- **ND-F13-04 — NOT DECIDED:** When may a freeze be removed, especially after Stop/completion/expiry or when removal moves expiry into the past? Options: A) PO/WO/Sales may remove any retained freeze, recompute current/future entitlement without retroactively revoking past delivered access; B) removal only before natural completion, PO handles later exceptional reversal; C) PO-only removal after Stop/completion, with explicit historical reconciliation. Recommendation: A to preserve D-09/D-05; past facts stay immutable and no monetary adjustment follows removal.
- **ND-F13-05 — NOT DECIDED:** Which renewal price/version and start/activation/installment anchor apply, including late renewal and renewal before initial activation? Options: A) currently approved offer snapshot, reject preactivation renewal, renewal activation at confirmation, service starts at max(current effective end, confirmation-day boundary), later installment offsets anchor to service start through an explicit F12 renewal extension; B) original offer snapshot with the same eligibility/start/anchor; C) current offer, defer renewal activation and later installment eligibility to service start. Recommendation: A, subject to PO confirmation of Cairo boundary and F12 extension; D-04 stacking remains mandatory and first activation stays P4-owned.
- **ND-F13-06 — NOT DECIDED:** How do multiple prepaid renewals and predecessor freeze Stop/Remove/extension affect future purchased terms? Options: A) append multiple renewals and derive contiguous future starts from predecessor effective ends, recording each schedule adjustment; B) permit only one future renewal and reflow it; C) keep purchased future dates fixed and require PO resolution of conflict. Recommendation: A with immutable purchase terms and serialized, auditable entitlement adjustments; no rewriting original financial/activation facts.
- **ND-F13-07 — NOT DECIDED:** May PO refund a subscription with F12 corrections, including zero net collected, and correct records after refund? Options: A) refund active unreversed collections only, preserve all corrections, reject zero-net monetary refund and forbid further corrections on the refunded target; B) block refund until PO reconciles corrected history, then apply the same one-reversal/full-net rules; C) allow zero-net terminal cancellation as a separately named non-monetary operation, otherwise A. Recommendation: C; distinguish cancellation from cash refund and never refund a corrected original twice.
- **ND-F13-08 — NOT DECIDED:** What happens to other prepaid renewals when one subscription is fully refunded? Options: A) refund only the selected purchase and retain other purchases with explicit chain reflow; B) block refund while dependent future purchases exist until PO resolves them individually; C) PO explicitly confirms separate full refunds for every affected purchase. Recommendation: B until the chain policy is approved; never silently cancel or return money for another purchase.
- **ND-F13-09 — NOT DECIDED:** Is there any expiry grace or renewal backdating? Options: A) no grace, late renewals begin from the approved confirmation boundary; B) a PO-configured snapshotted grace period with specified plan access; C) manually approved PO exceptions with immutable adjustment facts. Recommendation: A; no unapproved service days or default grace values.
- **ND-F13-10 — NOT DECIDED:** Who owns overdue restriction/resume and the F13/P4 expiry handoff? Options: A) F13 defines expiry/entitlement and due-state inputs, P4 implements plan/export restriction, overdue resume and notifications; B) move all overdue policy/projection into F13 while P4 implements consumers; C) expand F13 to deliver the enforcement UI/read paths after P4 dependencies exist. Recommendation: A, matching F12's explicit P4 handoff; reconcile its conflicting F13 exclusion wording before planning.
- **ND-F13-11 — NOT DECIDED:** What does P1's PO-only deletion/removal mean and which feature delivers it? Options: A) separate PO-only client closure/pseudonymization feature after B4 retention decisions; B) add that closure workflow to F13 after retention is decided; C) define removal as registration release only and assign broader closure separately. Recommendation: A; freeze Remove and refund never delete accounts or financial/audit evidence.
- **ND-F13-12 — NOT DECIDED:** How are external full refunds confirmed and dated/accounted for? Options: A) explicit PO confirmation, effective date/month from fresh Cairo recording time, no backdating or free text; B) PO-attested nonfuture external refund date distinct from recording time, financial effect in that refund month; C) record the external date but book reversal in recording month. Recommendation: C with exact structured confirmation and no payment method/reference; F12 correction-month policy remains unchanged and receipt replay never re-dates an event.
- **ND-F13-13 — NOT DECIDED:** Can expired subscriptions be refunded and can a refunded subscription ever reopen? Options: A) permit full refunds of active/frozen/expired/unactivated paid targets, never reopen; B) refund only unexpired paid targets, never reopen; C) permit all paid targets with separately audited PO reopening policy. Recommendation: A; refund remains 100% of net actually collected, without time-used or freeze proration.
- **ND-F13-14 — NOT DECIDED:** What exact freeze access and client lifecycle visibility should ship before/with P4? Options: A) F13 staff workflows and a narrow future P4 self-only date/status contract; freeze blocks plan/export service and P4 renders the approved status; B) F13 also extends the authenticated client status page with date/freeze/refund status; C) freeze pauses time only and retains plan reads, with client presentation deferred to P4. Recommendation: A; preserve account access and require Frontend Design Gate review for all rendered changes, with no commission/correction/audit details or renewal CTA.
- **ND-F13-15 — NOT DECIDED:** Who schedules expiry notices at 3 days, 1 day and expiry, at what Cairo clock time, and how do changed dates suppress stale notices? Options: A) P4 in-app consumer with PO-chosen clock time and dedup by entitlement revision/milestone; P6 later reuses those facts; B) F13 emits durable due-notice facts for P4/P6 consumption at that chosen time; C) P4 calculates notices on demand and later adds scheduling under a separate approved slice. Recommendation: A; confirm exact time, catch-up and superseded-date suppression, with no unhandled worker before a consumer exists.

## Dependencies and integration ordering

F12 objects below are **proposed names at the pinned head**, not a claim they exist on main. Read or extend the landed contracts; never duplicate them.

| F12 dependency | F13 consumption / extension |
| --- | --- |
| `public.clients` | Existing identity, workspace and approved state; preserve F11 immutable identity and F12 approval/rejection transitions; no closure writer here. |
| `public.subscriptions` | Immutable purchase snapshots and initial-only uniqueness; extend supported kind for linked renewals and add append-only lifecycle facts, without widening initial uniqueness or editing terms. |
| `public.subscription_installments` | Exact-total immutable amount/currency/sequence/issued offsets; derive unpaid/canceled state with linked cancellation facts. |
| `public.payment_events` | The one unified append-only ledger; collection/correction chain, revision/predecessor, `reverses_event_id`, exact stored commission, collected/effective/recording dates. Extend kinds/constraints for terminal refunds, preserving one successor/reversal and distinguishing canceled from unpaid. |
| `public.subscription_activations` | Read immutable first activation; P4 supplies the atomic writer; agree a separate renewal seam rather than impersonating first delivery. |
| `app_private.registration_operations` | Consume private actor/key/canonical intent/receipt pattern; extend or share namespace deliberately at plan review; no independent idempotency store that permits cross-operation replay collisions. |
| `app_private.registration_decisions`, `app_private.registration_approval_events` | Preserve approval truth and P2 REQ-P2-01 durable handoff; renewal/refund is not a second initial approval/form-assignment event. |
| `installment_collect`, `collection_correct` | Extend terminal-state checks and shared serialization for refund/cancellation races; preserve sequential activation gating and correction-month behavior. |
| `subscription_payment_status`, `subscription_commission`, `workspace_payment_queue` | Extend projections for refunded/canceled/future terms as reviewed; preserve PO/WO commission boundary and Sales-safe amounts. |
| `registration_approve`, `registration_reject`, `registration_reconsider`, `registration_approval_queue`, `registration_approval_review` | Preserve initial-only behavior and PO/WO/PO boundaries; not alternative renewal writers. |
| `client_self_status()`, internal `client_has_access()` | Keep pending/rejected exception approval-only and self-scoped; any lifecycle/plan entitlement extension needs separate reviewed projections and cannot treat approved as activated. |
| Future `record_initial_subscription_activation(...)` | P4-only atomic plan-pair seam; add shared terminal/lifecycle serialization contract before P4 implementation. No public writer in F13. |
| `issue_flexible_registration_link`, F10 `issue_registration_link` and immutable issued version/schedule | Preserve issued agreements and exact money; renewal source/version/terms writer awaits ND-F13-05, not copied registration-link machinery. |

### Migration and shared-file coordination (future work only)

- F12 proposes `20261101115000_flexible_registration_link_terms.sql`, `20261101120000_registration_approval_model.sql`, `20261101121000_registration_approval_operations.sql`, `20261101122000_payment_operations.sql`, `20261101123000_registration_approval_reads.sql`. F13 migrations MUST sort after **all** final F12 `20261101…` files, including review fixes, AND after the **final F14 migration set**. Reinspect merged filenames before assigning any F13 timestamp. No timestamp is reserved here.
- F14 inspected read-only at `origin/014-workspace-branding` = `30efad9fa4dc2be19033b9ca9a38b0a5c6bddd75`; its plan AD-F14-1 orders after final F11 and requires rebuilding the audit extension from the final body. No F14 new migration set exists at this observed remote tree; do not interpret that as permission to order F13 before it. Architect coordinates integration sequentially.
- Shared capability authority: `lib/auth/capabilities.ts` and SQL capability parity, concretely `app_private.role_has_capability()` / `app_private.has_workspace_access()` (the repository's implementation of the requested SQL `has_capability` parity). Preserve F12 Sales approval removal and D-09 freeze/renewal rights while retaining PO-only refunds. Review any renewal-specific capability mapping in both places.
- Shared audit authority: latest complete `app_private.audit_row_change()` body; on inspected main its file is `supabase/migrations/20261031122000_client_accounts_signup.sql`. F12 and F14 both extend it. Build from the latest integrated F12/F14 body, never an older copy; retain every workspace/staff/membership/recovery/package/link/signup/job/approval/payment/branding branch, no-op handling and unmapped-event failure.
- Shared UI ownership: `lib/i18n/messages/{ar,en}.ts`, existing authorized staff dashboard `app/(app)/page.tsx` and role dashboard surfaces, F12 `/payments` readers/components/actions, client status route if approved, and shared Design System/shell components. Coordinate sequential edits; no navigation redesign, new role tabs or incidental branding changes.
- Future verification must include existing F12 collection/correction regressions, direct-write immutability, cross-tenant negatives at both walls, race/replay/audit rollback cases and P4 consumer contract cases. No DB, stack provisioning, migration or test execution is authorized by this spec unit.

## Production blockers and delivery gates

Inherited [readiness register](../../docs/13-production-readiness.md) remains authoritative; this spec closes none of its rows:

- **Finance**: FN-01 correction reversal operational before real money; FN-02 issued agreement/activation-relative timing proof; FN-03 encrypted restore/reconciliation; FN-04 cross-feature real-finance enablement.
- **Identity/privacy**: AI-01/02 hosted Auth/Vault, AI-03/04 recovery policy/timers and hosted proof; DP-01/02 B4 closure/audit retention, DP-03..05 token/content/issuance/privacy gates; OP-01..03 purge authorization, approved origin and scrubbed app/worker/DB/host logs.
- **Platform/release**: PI-02 specific deployment approval, PI-03..05 volumes/measurement/test-account approvals; CS-01 credentialed pull evidence as applicable, CS-02 exact-head CI/security, CS-03 provenance/secrets; BR-01..03 encrypted backups/first restore/drill. PI-01 and PI-06 being Done does not close these gates.
- **F14**: SB-01..04 hosted Storage/proxy/validator, capacity/upload limits, banner decision and Storage proof; BR-04 Storage restore/audit integrity remain applicable to the eventual integrated release. F13 does not independently close or reimplement them.

F13 adds proposed evidence obligations **F13-PB-01** (finance owner/PO: operational full-refund reconciliation with corrections, exact commission, cancellations, terminal-state races, immutable history and restore proof) and **F13-PB-02** (F13/P4 owners/PO: approved ND-F13 policies, calendar/entitlement contract proof, real activation/enforcement/notification consumers and Design Gate evidence before exposing real lifecycle behavior). Status: **Open**, phase: **Pre-Production**. These are local draft labels, not allocated central register IDs. Within this two-file-only brief, shared docs/13 is not edited; carry both obligations into that register with stable IDs in the next authorized integration change before release. Do not claim a compliant go-live merely from merging this draft.

Spec Debate, PO decisions and approval, then plan/tasks/analyze precede implementation. Future feature merges still require independent architect review, exact-head push and pull-request CI, current CodeRabbit approval/resolved threads and explicit PO merge approval under Constitution 1.3.0/docs/08. No PR or deployment is authorized here.

## Out of Scope

- P4 initial activation writer/atomic plan-pair delivery, productivity writer, actual client portal plan/export enforcement, overdue restriction/resume implementation pending ND-F13-10, and real notification consumers. F13 defines expiry/entitlement seams; it does not claim these P4 features work.
- P5 weekly check-in freeze scheduling/resumption, outstanding-form handling, client timeline implementation, measurements and coaching changes; preserve PRD-03 without inventing P5 rules.
- P2 forms/intake/templates/assignment and REQ-P2-01 consumer; no new approval event for a renewal.
- Finance reporting, workspace share dashboards, payroll/settlement tracking, compensation/discipline automation; preserve immutable events for later reporting without building it.
- Payment-provider refunds, gateways, online checkout or payment execution: BRD-03 requires external payment and no integrated gateway. F13 records confirmation only.
- Partial refunds, partial installment collections, ad hoc discounts/fees, repricing old purchases, updating/deleting ledger/audit/snapshots, cross-workspace merge/transfer and YBS behavior/systems.
- Client closure/deletion/registration release implementation pending ND-F13-11; no self-service renewal/payment/account-delete request, CTA, support button or helpdesk.
- Code, migrations, DB/Docker operations, plan.md/tasks.md, shared-file edits, PR creation and deployment in this session.

## Constitution Check

| Principle | Draft treatment / remaining gate |
| --- | --- |
| I — Isolation | FR-001/002/023/024/030: tenant correspondence, two walls, PO global with real target, authorization before replay and after waits, foreign negative evidence. |
| II — Immutable finance | FR-003/014..022/025/026: one F12 ledger, exact integer money, append-only linked reversals/cancellations, full collected-only refunds and stored commission reversal; policy gaps do not authorize exceptions. |
| III — PO governance | D-09 freeze/renewal roles, D-10/15 PO-only refunds/deletion; preserve F12 superseding Sales approval removal and role-safe finance projections. |
| IV — Approved scope | All sources traced; ND-F13 options NOT DECIDED, no YBS defaults, P4/P5/closure boundaries and missing ownership explicit. |
| V — Versioning | New renewal purchase snapshot, immutable prior terms, initial activation only at P4 delivery; renewal productivity only for genuinely new delivered plans. |
| VI — People decisions | Genuine completed delivery credit preserved, no automatic discipline/payroll/settlement effects. |
| VII — Privacy | PII-free append-only audit, safe receipt/read projections, B4/retention and hosted readiness remain blockers. |
| VIII — UI | Every proposed rendered surface explicitly gated by DESIGN.md/docs/09; no generated UI decisions or screenshots claimed. |
| IX — Reliability | All entitlement/money operations and scheduled facts deduplicate and serialize, including cross-feature races, uncertain outcomes, authoritative Cairo dates and audit rollback. |
| Workflow/platform | Spec/checklist only; pending Spec Debate and PO decisions, no implementation approval, no stack use; forward migration ordering after F12 and F14 is explicit. |

No constitutional exception is requested. This draft is reviewable, not ready for implementation; checklist incompleteness records the unresolved policy and requested technical integration detail honestly.
