# Feature Specification: F13 — Freeze, renewal, refunds and expiry

**Feature ID**: F13

**Feature Branch**: `013-freeze-renewal-refunds`

**Created**: 2026-10-29

**Status**: Draft — Spec Debate complete (2026-10-29); pending PO decisions

**Input**: Session 12, lane 3. Specify freeze apply/stop/remove, early-renewal stacking, expiry and PO-only full refunds. Consume F12's subscription, obligation, collection, correction and ledger model. Specification/checklist and [debate record](debate.md) only; architect judgment is binding for this revision. No implementation, migrations, database operations, Docker, plan/tasks or PR.

## Authority and scope traceability

Baseline: `origin/main` at `a8c7ae569e1ae1380740230b90817679b22d465b`. F12 dependency reverified read-only at `origin/012-registration-approval` = `50cc77e8a0090f3baa716c3e4656b216db0983dd`; its model migration now exists on that branch. F14 judgment baseline is `334f50190bcc78e794832fa26c0ea9d482b116c6`; the current remote has advanced, so this revision pins the judgment baseline. Source inspection is not runtime/DB verification.

The [roadmap](../../docs/03-roadmap.md) P1 row is quoted verbatim:

```text
| **P1 Commercial core** | Workspaces, memberships, branding preview/publish, PO-only packages + versions (30-day months: 1/3/6/8/12, custom days), registration tokens (24h/+30m) with staff-configured installment schedule, global email/phone uniqueness + generic duplicate message, signup, approval, subscriptions + snapshots, ledger (confirmed payments, PO full refunds), per-payment commission, installment overdue restriction/resume, freeze (apply/stop/remove), early-renewal stacking, expiry, PO-only deletion/removal | A (to approval), D, G | 5–8 ew | — |
```

Sources and precedence:

- [Architecture v3, APPROVED 2026-10-27](../../docs/02-architecture.md) is binding where not superseded by later D-rows/F12 finals. F12 supersedes its ledger naming, correction chain, initial activation gating and permissions; later D-rows also supersede older Auth/hosting assumptions. [Traceability](../../docs/01-traceability.md) AT IDs are coverage requirements explicitly labelled proposed acceptance-test IDs, not executed evidence; see SC mapping below.
- [Spec Debate judgment](debate.md) settles the technical/source issues below. Only the remaining named PO questions are NOT DECIDED.
- [Decision register](../../docs/04-changes-and-questions.md): D-04 preserves remaining days and starts new duration after the current term; D-05 pauses/extends entitlement, Stop keeps elapsed frozen days, Remove reverses the effect, every change audited; D-09 grants PO/WO/Sales renewals, installment recording and freeze management; D-10 reserves refunds/deletion to PO; D-11 uses 30-day months and PO pricing; D-12/13/15/17 govern overdue access, collections, full refunds and exact installment totals; D-23 and final F12 decisions supersede earlier F12 proposals.
- [BRD/PRD master](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-01 invariants; BRD-02 role/tenant boundaries; BRD-03 external payments and immutable finance; BRD-04.7–10 activation, expiry, renewal and closure; BRD-05 preserved genuine delivery credit after refund; BRD-06 meaningful timeline; PRD-01/06/07/10/11/12/13/14 (Journey D); DR-01/02/03. D-15 overrides older full/partial-refund wording; D-11/12/17 and final F12-3/8 override fixed 50/50 assumptions. No YBS rule is imported.
- [Constitution 1.3.0](../../.specify/memory/constitution.md), all nine principles; [carried requirements](../../docs/12-carried-requirements.md) contains REQ-P2-01 for P2 only, which F13 must preserve; [production readiness](../../docs/13-production-readiness.md); [tracker F13 row](../../docs/10-feature-tracker.md) currently says Not started, depends on F12; this draft does not claim delivery or update shared tracking files.
- F12 pinned [spec](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/spec.md), [plan](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/plan.md), [model](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/data-model.md), [staff/client contract](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/contracts/registration-approval-surface.md), and [handoffs](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/contracts/feature-handoffs.md). Consume these seams; do not copy their financial system into F13.
- F14 pinned [spec](https://github.com/sekiirro/LIFTER/blob/334f50190bcc78e794832fa26c0ea9d482b116c6/specs/014-workspace-branding/spec.md) and [plan](https://github.com/sekiirro/LIFTER/blob/334f50190bcc78e794832fa26c0ea9d482b116c6/specs/014-workspace-branding/plan.md): preserve `manage_branding` and integrated audit mappings; use current merged bodies at implementation time, not a stale pinned copy.

### Ownership conclusions

**P4 owns overdue/expiry enforcement and notices**: F13 supplies the entitlement projection plus independent overdue input (roadmap P4 row; F12 handoff line 21). F12's Out of Scope phrase assigning “overdue enforcement” broadly to F13 is an **F12 documentation fix**, not an open ownership decision. F12 owns obligation/collection truth and activation-relative due projection. No F12 file is edited here.

**Removal means PO-only pseudonymization**, freeing old email/phone while keeping ledger/audit (architecture line 61, D-10, Constitution VII). A separate closure feature after B4 owns delivery, outside F13. Freeze Remove only reverses that freeze's entitlement effect; F12 delivers neither closure nor identity release.

**Binding source resolutions**: Renewal activation is immediate at confirmed recording (PRD-07 line 199; architecture line 66), early service start equals predecessor effective end (D-04); no preactivation service consumption. Freeze never changes initial activation or installment due dates (F12-8; handoff line 19). Refund all unreversed active collection tails including recollections, reverse exact stored commission and book reversals in the refund month (D-15; handoff line 25; architecture line 77; AT-FIN-10). Zero-net monetary refunds are rejected and refunds never reopen. No expiry grace: plans/export stop at expiry, login/settings remain (PRD-07 line 200; BRD-04.8). Freeze authority is PO/WO/Sales for Apply/Stop/Remove (D-09; architecture line 44). Renewals use `record_payment`; refunds use `record_refund` with explicit `platform_owner` and operation-kind checks, since F12 correction shares that capability. No new capability. Receipts/results contain no commission for any role; PO/WO use the separate commission reader (F12 plan Authorization and projections).

## User Scenarios & Testing

These are future acceptance requirements, not executed tests. Policy-dependent scenarios are explicitly conditional on the referenced NOT DECIDED question; no recommendation below is an approved default.

### User Story 1 — Return all collected money safely (Priority: P1)

As PO, I record a full subscription refund after the externally performed refund is confirmed, reverse collected revenue and its earned commission, cancel unpaid obligations and end that subscription without erasing history.

**Why this priority**: D-15 makes a partially refunded or still-collectable canceled subscription financially incorrect.

**Independent Test**: Use an F12 fixture with immutable terms, two collected installments and one unpaid installment. Refund as PO, reconcile every linked event, retry and attempt later collection; deny the same operation as WO/Sales/Trainer.

**Acceptance Scenarios**:

1. **Given** an eligible subscription with collected amounts 10,001 and 20,000 minor units and stored commissions 1,000 and 2,000, **When** PO confirms a full refund, **Then** linked refund reversals total -30,001 revenue and -3,000 commission, unpaid obligations are canceled, entitlement ends, and audit/receipt commit atomically (FR-014..019).
2. **Given** a lost success response or two PO sessions refunding the same expected subscription state, **When** requests are retried/compete, **Then** one refund outcome commits; exact authorized replay returns its identical receipt and a distinct stale request creates nothing (FR-023..026).
3. **Given** a collection previously corrected and recollected, **When** a refund is evaluated, **Then** no corrected original is reversed twice, no canceled obligation is restored to payable, and all original bytes remain unchanged (FR-017/020/021).
4. **Given** an audit/deferred-integrity failure, **When** refund is attempted, **Then** no reversal, cancellation, entitlement termination or success receipt remains (FR-026).

### User Story 2 — Pause and correctly resume entitlement (Priority: P1)

As PO, WO or Sales, I apply a configured freeze, stop it early while retaining elapsed frozen days, or remove its effect, with a readable history.

**Why this priority**: D-05 promises preserved paid days and distinguishes Stop from Remove.

**Independent Test**: On a synthetic activated term, apply a ten-day freeze, stop after three counted Cairo days, and separately remove a freeze. Verify expiry projections, role denials and immutable events under the PO-approved day policy.

**Acceptance Scenarios**:

1. **Given** an eligible activated term and approved freeze duration/boundary policy, **When** a freeze is applied, **Then** service entitlement is paused for its effective interval and the expiry extension equals its counted frozen days (FR-006..010).
2. **Given** ten planned frozen days and three elapsed frozen days under that policy, **When** Stop commits, **Then** only three days remain credited; **When** Remove instead commits, **Then** that freeze contributes zero extension, without erasing apply/stop history (FR-008/009).
3. **Given** no activation fact, **When** freeze or expiry is evaluated, **Then** no start/end date or elapsed service days are fabricated; freeze eligibility remains subject to ND-02 (FR-005).
4. **Given** concurrent freeze changes, renewal or refund, **When** competing expected-state operations run, **Then** each result corresponds to one serial history and no duration is counted twice (FR-024/025).

### User Story 3 — Record a renewal without losing paid days (Priority: P1)

As PO, WO or Sales, I confirm an externally paid renewal and retain the client's remaining entitlement using a new immutable purchase snapshot.

**Why this priority**: D-04 protects the paid remainder and D-13 protects collection-earned commission.

**Independent Test**: Seed an activated term with ten remaining days and an approved 30-day renewal offer. Record one renewal, verify uninterrupted 40-day coverage from the observation boundary under the approved calendar convention, unchanged original terms and exact collection/commission.

**Acceptance Scenarios**:

1. **Given** an early renewal with confirmed external payment and approved terms, **When** it commits, **Then** a distinct linked renewal subscription starts its duration at the predecessor's effective end, preserves all remaining days and uses the reused F12 obligation/collection model (FR-011..013).
2. **Given** package price/rate/duration changes after renewal purchase, **When** either term is read, **Then** each retains its own purchase snapshot; later settings change neither history (FR-003/012).
3. **Given** two sessions renewing the same expected chain tail, **When** they submit different keys, **Then** at most one appends there; the loser receives `stale_state` and refreshes; no second future purchase is added in MVP (FR-025).
4. **Given** renewal before initial activation or after expiry, **When** its start is evaluated, **Then** ND-05 must be resolved for that branch; no first plan-pair activation is invented and renewal activation remains immediate at recording (FR-005/013).

### User Story 4 — Determine expiry without disabling the account (Priority: P1)

As authorized staff and, through P4, the client, I can distinguish awaiting activation, future renewal, frozen, active, expired and refunded entitlement without mistaking payment approval for activation.

**Why this priority**: BRD-04.8/PRD-07 restrict plans at expiry while preserving login and settings.

**Independent Test**: Evaluate fixtures immediately before/at/after effective end, through Cairo DST changes, with no activation and with a stacked renewal. Verify P4's expected access decision independently of job execution.

**Acceptance Scenarios**:

1. **Given** a known entitlement interval, **When** its end boundary is reached, **Then** its service coverage ends with no grace under the approved ND-03 convention; a contiguous eligible renewal can continue coverage without a gap (FR-004/027).
2. **Given** no activation on an initial subscription, **When** time passes or an expiry task reruns, **Then** expiry remains undefined, not expired or indefinitely active, and later installments remain uncollectable (FR-005/022).
3. **Given** expired coverage, **When** P4 consumes the result, **Then** plan viewing/export are restricted while login/settings and existing allowed account access remain; clearing overdue cannot override expiry/refund or any approved ND-14 freeze access restriction (FR-028).

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
- Freeze at activation, expiry or a renewal boundary; overlapping/repeated freezes; Stop on apply day; Remove after Stop, auto-completion or expiry; removal moving an end into the past. ND-01..04/06 govern unresolved policy.
- Awaiting activation with a collected upfront installment: no expiry or later due date; freeze/renewal eligibility remains open. Refund can never manufacture delivery or productivity credit.
- Corrected earlier installment with later installments still collected; correction then recollection; all collections corrected so net collected is zero; cross-month correction/refund; a refund racing correction, collection or P4 activation.
- MVP rejects a second future renewal; multiple-future chains are later scope. Predecessor freeze changes after a successor starts cannot rewrite its actual start or delivered access; conflicting adjustments roll back atomically. Dependent-purchase refunds await ND-08.
- Duplicate keys with different targets/amount expectations, distinct keys for the same intended purchase, two staff sessions, stale month/time observed before lock wait, uncertain network outcome, authorization revoked during wait.
- Values beyond floating-point exact range, full commission rounding ties, mixed currency/cross-workspace references, changed package settings, zero net collected and partial payment/refund attempts.
- An expiry materialization/notice job is delayed or duplicated: no access extension merely because a job did not run and no duplicate lifecycle/notice fact. P4 owns notification time, catch-up, deduplication and obsolete-notice suppression; P6 later consumes approved notification facts.
- Refund versus deletion: neither erases financial/audit history; closure never implies returned cash. Genuine previously delivered productivity remains credited (BRD-05).

## Requirements

### Functional Requirements

Binding requirements below derive from cited decisions, the explicit brief and the completed architect judgment. A reference to an ND question leaves only that policy branch conditional; recommendations are NOT DECIDED and must not become runtime defaults.

- **FR-001**: Apply two independent authorization walls to every read/mutation/replay. PO has global scope but MUST independently verify an existing workspace row: app_private.has_workspace_access() alone returns true for PO on any UUID. WO/Sales need current membership. Tenant rows/relations require workspace/composite-parent correspondence, forced default-deny RLS and no browser base-table grants. Foreign/nonexistent/revoked targets return generic not_permitted.
- **FR-002**: PO/WO/Sales MAY Apply/Stop/Remove freezes via manage_freeze and record renewals via record_payment. Refund MUST check record_refund, explicit platform_owner and refund operation kind at both walls; F12 correction separately checks its own kind. Trainer/client/anonymous cannot mutate these operations. No new capability. Preserve F12 Sales approval removal and F14 manage_branding in lib/auth/capabilities.ts and app_private.role_has_capability().
- **FR-003**: Reuse F12 subscription/obligation/collection/correction truth. Snapshot each new purchase's approved version, price, currency, duration, commission rate and schedule; never mutate prior snapshots or obligations. Money MUST use bounded integer minor units/currency and exact transport/calculation; no floating-point amounts. Reuse F12 Round Half Up collection commission, but reverse stored commission exactly without re-rounding.
- **FR-004**: Store entitlement/freeze boundaries as Cairo date values and durations as integer days. Boundary instant = the first existing instant of that Africa/Cairo date: nonexistent midnight resolves forward, ambiguous midnight to earliest instant, using the zone library. Calculate dates before conversion, never fixed offsets, elapsed-hour months or browser timezone. Month = 30 days; custom days stay exact. ND-03 decides day inclusion/Stop credit, not DST resolution. Calendar fixtures below give expected instants.
- **FR-005**: An initial subscription without P4 activation MUST have no service start/end, expiry or later-installment due date and consume zero service/freeze days. Awaiting activation is neither active nor expired. Do not create a public/standalone activation writer. Preactivation freeze/renewal eligibility awaits ND-02/05; full refund needs no activation and never generates delivery/productivity.
- **FR-006**: Freeze Apply MUST append positive configured duration and Cairo effective dates, pause entitlement and extend its effective end for counted frozen days. Limits/configuration/current-date rules await ND-01; activated/overdue eligibility awaits ND-02. Do not infer numeric caps, unlimited allowances, overlap or backdating permission.
- **FR-007**: Natural completion/resumption derives from approved interval and Stop/Remove facts without changing purchase duration/price, activation, installments or collections. Completed freeze retains full counted extension; repeat evaluation creates no extra day/audit. A future renewal's immediate activation does not consume service/freeze days before its service start; freeze contribution belongs to the target's service interval, not merely its purchase/activation age.
- **FR-008**: Stop MUST end an applicable freeze early and retain only elapsed counted Cairo days, excluding unused planned days. ND-03 decides same-day/Stop-day credit. Repeated/invalid Stop never extends again or deletes original facts.
- **FR-009**: Remove MUST append a linked reversal making that freeze's extension zero, retaining Apply/Stop/completion history; PO/WO/Sales authority is fixed. Post-completion/expiry applicability awaits ND-04. Recompute only permissible current/future entitlement, never revoke delivered access or rewrite actual service-start facts; conflicting adjustments reject atomically.
- **FR-010**: Freeze MUST NOT change initial activation, issued installment amounts/offsets or any installment due date (F12-8; handoff line 19). Due = Cairo activation date + issued offset; overdue remains independent even if freezing is permitted. No freeze-driven clock pause or replacement installment anchor.
- **FR-011**: Renewal MUST confirm external payment and append a distinct linked subscription, immutable approved offer snapshot, obligations, collection, stored commission, audit and receipt atomically. Planned MVP is full payment: one full-price obligation collected at recording, subject to ND-16. Installment renewals are later scope, needing a new agreement source/anchor; do not borrow registration-link schedules or bypass initial activation gates. Never reuse initial registration approval as a renewal writer.
- **FR-012**: Early renewal MUST preserve all remaining days and start service at predecessor effective end (D-04; architecture line 66); recording activates renewal immediately (PRD-07 line 199). Offer/preactivation/late-start policy awaits ND-05. Automatic successor reflow affects only unstarted terms, never actual service-start facts or delivered access; conflicting changes reject atomically. MVP permits at most one future renewal; ND-06 confirms product exposure within this architect envelope. Multiple future renewals are later scope.
- **FR-013**: Distinguish immediate renewal activation/recording instant from Cairo service start/end; no stacked service days are consumed before start and no initial plan-pair activation is forged. A renewal productivity unit requires genuinely new delivered plans, never payment alone. Activation implies no new client/plan access before P4 integration.
- **FR-014**: Refund MUST be PO-only, full subscription: all unreversed active collected revenue, exact associated stored commission reversal, all unpaid obligations canceled and target entitlement ended. No partial amount, use/freeze proration, fee deduction or unpaid commission. Reject zero-net monetary refunds. Eligible paid lifecycle states await ND-13; a refund is terminal and never reopens.
- **FR-015**: Append refund_reversal as a new terminal public.payment_events kind in the single F12 per-obligation chain. Reference the active original with reverses_event_id, negate exact stored revenue/commission and retain its currency under one refund aggregate/operation identity. Reuse unique (workspace_id,reverses_event_id): correction and refund of one collection are mutually exclusive by constraint, independently of RPC/key. Preserve original bytes.
- **FR-016**: Cancel unpaid obligations through separate one-per-obligation unique cancellation facts, not mutable issued rows or fabricated collection events. Refunded/canceled differs from unpaid and can never be collected/corrected/reopened. A deferred constraint MUST reject every successor after terminal refund/cancellation, independently of RPCs/keys and in direct integrity probes. Refund ends target/frozen entitlement; dependent purchases await ND-08.
- **FR-017**: Cash refund amount MUST equal the sum of revenue amounts on all unreversed active collection tails, including valid recollections; reverse their exact stored commission separately, without adding commission to the cash refund. Exclude every already corrected original. This calculation is decided (D-15; handoff line 25). Correction-before-refund changes eligible tails; refund-before-correction rejects a new correction. Reject zero-net monetary refund; no separate non-monetary cancellation workflow is added.
- **FR-018**: Record explicit PO confirmation of an externally completed full refund; no gateway/payment execution, settlement, method or free-text reference. Authoritative refund date when recorded late awaits ND-12. Proposed MVP uses fresh Cairo recording date and stores no external refund date; this is NOT DECIDED. The chosen authoritative date determines the refund month, not the original collection month.
- **FR-019**: Refund amount, commission reversals, unpaid cancellations, terminal entitlement event, receipt and successful audit MUST commit together or all roll back. Other subscriptions and account identity/login state MUST remain unchanged except for any separately approved ND-08 chain policy.
- **FR-020**: An F12 correction fixes a mistaken collection record: one exact linked reversal, obligation unpaid again, subscription/approval unchanged, recollection possible while nonterminal. Its `effective_on` is the fresh Cairo correction-recording date/month (final F12-4, F12 spec FR-025); originals remain in their original collection month. F13 MUST preserve this behavior and not invoke correction alone as a refund.
- **FR-021**: Refund is a terminal cash-return event; book revenue/commission reversals in the refund month (architecture line 77; AT-FIN-10), cancel rather than restore unpaid obligations. ND-12 decides authoritative refund date when recorded late, not whether refund-month posting applies. No new correction/recollection follows refund. Authorized exact historic replay remains evidence, never a new write or changed effective date.
- **FR-022**: Preserve F12-2/8 for initial installment n>=2: activation and all earlier obligations currently paid, then early collection allowed. Due = Cairo activation date + exact issued offset, payable through day-end (next Cairo date's first existing instant). Default 30 never overrides custom offsets; freeze never shifts dates. Renewal installments require later ND-16 contract, not silent reuse of initial activation gating.
- **FR-023**: Every Apply/Stop/Remove, renewal, refund, cancellation and expiry materialization MUST deduplicate with immutable operation evidence. Staff keys bind actor, operation kind, workspace, target, expected lifecycle/chain/ledger revisions and canonical inputs/confirmation. Authorize before lookup/disclosure; exact replay returns identical safe result and zero new effect/audit; changed binding returns key_conflict. Receipts/results contain NO commission for ANY role; PO/WO use subscription_commission separately. Uncertain outcomes keep identical request/key.
- **FR-024**: Every same-client writer MUST lock client row first, subscriptions in stable ascending ID order, obligations by sequence within subscription-ID order, then ledger tails. Never sort locks by derived service start. After waits, recheck/lock current actor/membership in F12 authorization order and hold through commit; sample fresh Cairo time. Internal P4 activation/expiry writers share this contract; no new lock object.
- **FR-025**: Enforce independently of keys: one freeze contribution, one successor per expected renewal tail, at most one future renewal, one reversal/original and one terminal refund. Distinct keys/two sessions cannot bypass constraints. Expected lifecycle/chain/tail revisions cover freeze/renewal/refund/activation races. Race fixtures below name permitted orders and exact results; historical reflow conflicts reject atomically.
- **FR-026**: Validation/snapshot mismatch, overflow, stale state, revoked permission, audit or deferred integrity failure MUST leave zero partial financial/entitlement/cancellation/receipt effects; acknowledge only commit. Authorized stale expected state returns stale_state; unauthorized/nonexistent target not_permitted; changed key binding key_conflict; rolled-back unexpected failure unavailable. Use only bounded result/error codes.
- **FR-027**: Derive expiry from service-start date + immutable duration + effective freeze contributions and valid successor coverage. At exclusive end service stops with NO grace; account-level coverage considers eligible intervals. ND-03 governs day inclusion only. Never rewrite started successor facts; reject conflicting adjustment. Correct current entitlement cannot depend on an expiry materializer having run; repeat materialization creates no duplicate fact.
- **FR-028**: F13 supplies an internal tenant-scoped entitlement projection plus independent overdue input/reason, distinguishing awaiting activation, future, active, frozen, expired and refunded/canceled. P4 owns actual plan/export enforcement/resume and expiry/overdue notices (roadmap P4; handoff line 21); clearing one restriction never clears others. No expiry grace or login/settings disablement. Only frozen access interpretation awaits ND-14. F12 Out of Scope drift is an F12 doc fix.
- **FR-029**: Audit freeze Apply/Stop/Remove, completion if materialized, renewal, refund, cancellation and expiry with one event owner per fact. Allow IDs, bounded reason/status/error codes, revisions, dates/day counts, minor-unit strings/currency and correlation IDs; omit commission, PII, secrets, raw IP, free text and argument dumps. App/worker/DB/host logs and jobs carry bounded error codes only, never raw SQL/messages/payloads. F11 audit_row_change() maps jobs.last_error verbatim: never put raw text there. No lifecycle receipt/ledger/audit purge pending retention approval. Audit failure aborts business changes.
- **FR-030**: PO sees global scope; WO own-workspace commission/audit; Sales permitted amounts/entitlement without commission/rate/general audit; Trainer no implied lifecycle/finance reader. Receipts/results omit commission even for PO/WO; only the separate commission reader supplies it. Clients receive no staff receipts/correction/audit/commission. F13 adds no client page; P4 owns narrow self-only date/status presentation. F12 self-status remains approval-only.
- **FR-031**: Flag all staff freeze/renewal/refund confirmations, expiry indicators and P4 client views for the [Frontend Design Gate](../../docs/09-frontend-design-gate.md). Use DESIGN.md and existing tokens/components/i18n: Arabic RTL/English LTR, light/dark, mobile/desktop, all required states, keyboard and WCAG 2.2 AA; future rendered matrix evidence is mandatory. Design gaps await PO choices, not invented screens/navigation. No UI is built by this draft.
- **FR-032**: Renewal/payment communication stays external. P4 shows expiry date/alerts at 3d/1d/expiry exactly once, no renewal/payment/closure request/redirect CTA; clock time, catch-up and stale-notice suppression belong to P4 consumer work, not F13 PO questions. P5 owns check-in freeze/resume; F13 supplies effective intervals and retains AT-FRZ-01 as integration coverage, no check-in engine. Audit is not client timeline.
- **FR-033**: Preserve genuine delivered productivity after refund (BRD-05; AT-KPI-03), no payroll reversal, fabricated unit or automatic discipline. Every new function MUST be SECURITY DEFINER, search_path='', qualified names, owner postgres; revoke EXECUTE from PUBLIC/anon/authenticated/service_role then grant narrowly. Internal P4 activation/projection and expiry materializer never grant authenticated EXECUTE. F12 f12_guard_client_transition() blocks all non-approval clients UPDATEs: any future F13 clients write requires a forward amendment, never bypass/disabling the guard; prefer separate lifecycle facts.
- **FR-034**: Unresolved policy blocks only its own slice; unaffected slices may be planned separately. Implementation still requires approved spec/plan/tasks/analyze and applicable gates. Migrations sort after whatever F12/F14 migrations are merged at implementation time, including fixes; freeze order before execution. Rebuild audit_row_change() and TS/app_private.role_has_capability() from latest integrated bodies, preserving F12 Sales approval removal and F14 manage_branding. No timestamp is reserved or readiness gate closed.

### Key Entities

Logical concepts only; these are not new SQL definitions or permission grants.

- **Subscription purchase**: The existing F12 immutable terms, client/workspace identity and obligations. A renewal is another purchase linked to a predecessor, not an edit to the initial snapshot.
- **Activation fact and entitlement interval**: Existing F12 initial activation seam plus distinct immediate renewal activation; effective coverage derived from approved calendar policy, duration, freezes, terminal events and chain position. Unknown initial activation means unknown boundaries.
- **Freeze history**: Apply fact with configured duration/effective dates, linked Stop and Remove facts, computed retained contribution and lifecycle revision. Originals remain immutable.
- **Renewal chain**: Ordered same-client/workspace purchases with predecessor/tail identity and serialized revision, separating purchase date from service coverage and activation.
- **Installment obligation and cancellation fact**: Existing immutable F12 scheduled amount/sequence/offset; a linked cancellation ends collectability without replacing that snapshot or creating payment.
- **Unified financial event**: Existing F12 collection/correction stream extended by terminal refund_reversal semantics, original reference, exact amount/commission, dates and one-reversal invariant. No second ledger or mutable paid truth.
- **Full refund operation**: PO-confirmed terminal aggregate linking all included reversals, unpaid cancellations, entitlement end and receipt; never a partial amount or account deletion.
- **Operation receipt and audit fact**: Existing private idempotency concept extended for lifecycle operations and scheduled deduplication; actor/scope/expected-state binding, immutable safe result and PII-free evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: AT-FIN-09: at a 1,200-unit price, refund exactly 600 if only 600 collected or 1,200 if fully collected, converted to integer minor units/currency. AT-FIN-10: 100% of eligible collected revenue and exact stored commission reverse in the refund month; unpaid collectable balance/target entitlement become zero. Include correction/recollection and cross-month fixtures.
- **SC-002**: No original receives two reversals, no terminal stream/canceled obligation has any successor, no refunded target reopens, and all original bytes remain identical. Zero-net monetary refund creates zero effects. Verify kind CHECK, alternation, correspondence and all status/commission/queue/eligibility readers, including direct integrity probes.
- **SC-003**: AT-FRZ-02 and AT-FRZ-03: conditional on ND-03 A, ten-day Apply Nov 1 then Stop Nov 3 retains exactly three days [Nov 1, Nov 4); same-day Stop retains one; Remove contributes zero, repeats add zero. Exact boundary instants are below.
- **SC-004**: AT-REN-01: predecessor end Nov 11 plus 30-day renewal yields successor [Nov 11, Dec 11), preserving ten remaining days on Nov 1. Activation occurs at recording, purchase snapshots stay immutable, and any started-successor adjustment conflict leaves zero partial effects.
- **SC-005**: All unactivated initial fixtures have no expiry/later due date, zero consumed service days and zero later collections. Full refund works on eligible paid F12 fixtures without activation; no delivery/productivity is fabricated.
- **SC-006**: All before/at/after, DST gap/fold, leap-day/month-end fixtures return exact expected Cairo dates/instants below, independent of browser/server timezone or job delay. ND-03 credit tests remain conditional; first-existing-instant resolution is binding.
- **SC-007**: Every named race below yields only its specified winner/result, including constraints independent of RPC/key. Authorized exact replay returns identical receipt and zero new business/audit facts.
- **SC-008**: All disallowed role/scope/revoked/nonexistent-workspace combinations fail both walls with zero foreign existence/commission/receipt disclosure. PO paths require a real workspace; zero authenticated EXECUTE grants on internal seams and zero browser base-table grants on new tenant tables.
- **SC-009**: All injected validation/deferred-integrity/audit/overflow/authorization failures leave zero partial lifecycle/financial/receipt effects, with bounded error codes only in every capture point.
- **SC-010**: AT-FRZ-04: exactly one audit fact per committed freeze mutation, zero on replay. AT-KPI-03: genuine delivered productivity stays unchanged in every refund fixture. Receipts/results/common new audit omit commission for every role; the separate PO/WO reader exposes exact stored reversals.
- **SC-011**: All future rendered surfaces pass the eight-cell AR/EN × light/dark × mobile/desktop matrix/accessibility checks, exposing zero forbidden client CTA or staff financial details.
- **SC-012**: AT-EXP-01 and AT-EXP-02 integration: P4 emits exactly one notice at each 3d/1d/0d effective-expiry milestone, blocks plans/export at expiry with no grace and keeps login/settings. Clearing overdue alone never restores expired/refunded coverage or any approved ND-14 frozen-access restriction. F13 verifies projection inputs; no P4 consumer pass is claimed before integration.
- **SC-013**: AT-FRZ-01 integration: P5 emits zero new check-in prompts during effective freeze intervals, preserving outstanding forms under its approved resume policy. F13 verifies interval facts only; no P5 engine/consumer pass is claimed.

### Cairo calendar and boundary fixtures

Boundary conversion examples below are binding; day-credit examples remain conditional on ND-03. Expected instants were checked with Node 24.19.0 / ICU 78.3 / timezone data 2026b. Pin/review zone-data changes in future verification; never hard-code these UTC offsets in implementation.

| Cairo boundary / case | Expected UTC instant or outcome |
| --- | --- |
| 2026-04-24 start, nonexistent 00:00 | 2026-04-23T22:00:00Z = first existing Apr 24 01:00 +03; one second earlier is Apr 23 23:59:59 +02. |
| 2026-10-30 start after fall-back | 2026-10-29T22:00:00Z = Oct 30 00:00 +02; one second earlier is Oct 29 23:59:59 +02. |
| Repeated Oct 29 23:00 | Earliest occurrence 2026-10-29T20:00:00Z (+03), later occurrence 21:00:00Z (+02); neither is Oct 30 boundary. Any ambiguous midnight resolves to earliest instant of its date. |
| 2026-11-01 start | 2026-10-31T22:00:00Z. |
| 2026-11-04 start | 2026-11-03T22:00:00Z. |
| Conditional ND-03 A: Apply Nov 1, Stop Nov 3 | Freeze [Nov 1, Nov 4), three credited days; same-day Apply/Stop Nov 1 yields [Nov 1, Nov 2), one credited day; Remove yields zero extension. |
| Conditional ND-03 A: activation Nov 1 at 23:30 Cairo, duration 30 days | Nov 1 is day 1 despite short first day; exclusive end Dec 1 = 2026-11-30T22:00:00Z. |
| Feb 28 2028 + two calendar days | Mar 1 2028: leap day included; Friday is an ordinary entitlement day, not an SLA exclusion. |

### Concurrency acceptance fixtures

Requests bind expected lifecycle/chain/tail revisions. All callers are permitted unless revocation is the subject; fresh intent after conflict requires deliberate confirmation. Freeze/renewal cases run under approved policy.

| Race / order | Allowed outcome and exact losing result |
| --- | --- |
| Same operation/key/canonical input, double submit | Either request commits first; other returns the identical authorized committed receipt with status ok, zero extra effects/audit. Changed canonical input returns key_conflict; revoked replay returns not_permitted. |
| Two refunds, same expected target revision, distinct keys | Either PO session commits one terminal refund; other returns stale_state with zero reversal/cancellation/audit. No different-key second refund. |
| Correction → refund, other active tails remain | Correction commits; old-preview refund returns stale_state, zero effects. Fresh refund excludes corrected original and includes all remaining active/recollected tails. |
| Correction → refund, no active tails remain | Correction commits; old-preview refund returns stale_state. Fresh zero-net monetary refund returns invalid_input with field code refund_amount, zero effects. |
| Refund → correction | Refund commits terminal reversals/cancellations; competing correction returns stale_state, zero effects. Exact replay of a previously committed correction returns its historic receipt only. |
| Renewal tail competition, distinct keys | Either session commits one renewal at expected tail; other returns stale_state. Never auto-append a second future purchase. |
| P4 activation → refund | Activation may commit first; old-preview refund returns stale_state. Fresh eligible refund can end that purchase; real delivery/productivity remain credited. |
| Refund → P4 activation | Refund commits without activation; internal activation returns stale_state and rolls back activation/delivery/productivity together. |
| Revoke → receipt replay | Revocation commits first; replay returns not_permitted and no receipt. |
| Replay authorization locks → revoke | Exact authorized replay returns identical receipt and zero new facts; revocation waits then commits; subsequent replay returns not_permitted. |
| Same actor/key, different permitted targets | Either binding commits; other returns key_conflict, rolls back all writes, reveals no prior receipt. Unauthorized targets return not_permitted before key/receipt lookup. |
| Freeze ↔ renewal, same expected entitlement revision | Either commits first; other returns stale_state. Fresh permissible reflow adjusts only unstarted successor; historical-start conflict returns stale_state and rolls back whole adjustment. |
| Freeze ↔ refund | Either commits first; stale competitor returns stale_state. Fresh eligible refund uses current state; no freeze commits after terminal refund. |
| Collection ↔ refund | Collection first makes old-preview refund stale_state; fresh refund includes new tail. Refund first makes collection stale_state; no post-cancellation collection. |
| Expiry materializer ↔ freeze/renewal/refund | Lifecycle writer first: expected-revision materializer returns stale_state, no obsolete fact. Materializer first: it commits one fact for its observed revision; a lifecycle writer with unchanged expected revision may then commit, retaining that historical fact while deriving the new current state. No current entitlement is extended by job delay; scheduled dedup retry adds zero audit. |

## Assumptions and policy status

- F9–F11 supply approved package versions, issued agreements and isolated client identities; F12 must land its reviewed finance contracts before F13 implementation. The F12 model migration is present on the pinned branch; no DB/runtime/hosted execution is proven here.
- D-04/05/09/10/15 and final F12 decisions are binding; recommendations in the next section have no runtime effect. Missing original freeze allowances are NEEDS SOURCE CONFIRMATION under PRD-07/DR-02; architect decisions are recorded in debate.md.
- P4 is future work: initial activation writer, plan access/export enforcement and portal notifications cannot be claimed delivered by F13 alone. F13 must define and verify the seam with synthetic facts later, without adding a public activation action.
- Explicit user scope limits artifacts to this spec/checklist/debate record. Do not write `.specify/feature.json`, shared registers, code, plan or tasks in this unit. Spec Kit's ordinary metadata/default/clarification behavior does not override this instruction to retain remaining policy gaps; Spec Debate is complete, PO decisions remain pending.

## Open questions for PO

Every item is **NOT DECIDED**. IDs below are intentionally stable/gapped after removing source-settled questions; they replace the former ND-F13 identifiers. Recommendations are not runtime defaults. Each unanswered policy blocks only its affected slice, not unrelated planning.

- **ND-01 — NOT DECIDED:** What are the freeze allowances, configuration owner and effective-date rules? Options: A) PO-configured per-package maximum snapshotted at purchase, one freeze at a time, effective today, no backdating; B) PO-configured workspace maximum snapshotted at purchase with the same timing limits; C) per-request PO-approved exceptions with explicit allowance/date rules. Recommendation: A; recover exact duration/count values from discovery (PRD-07 line 202), never invent numeric caps or an unlimited default.
- **ND-02 — NOT DECIDED:** Which subscriptions are eligible to freeze? Options: A) activated only, overdue allowed with independent overdue restriction; B) activated and non-overdue only; C) permit preactivation scheduling but consume no service/freeze days before activation. Recommendation: A; freeze never changes initial activation or installment due dates.
- **ND-03 — NOT DECIDED:** Which Cairo date inclusion convention applies to activation and Stop-day credit? Options: A) activation date is day 1, Stop effective next Cairo date and Stop day credited; B) activation date is day 1, Stop effective today's boundary and today not credited; C) service begins next Cairo date and Stop effective next date. Recommendation: A; Nov 1 Apply + Nov 3 Stop retains three days [Nov 1, Nov 4), same-day Nov 1 Stop retains one, and Nov 1 23:30 activation still counts Nov 1 as day 1.
- **ND-04 — NOT DECIDED:** May a freeze be removed after completion or expiry? Options: A) PO/WO/Sales may remove, recompute current/future entitlement only, never revoke delivered access or rewrite started service facts; B) removal only before completion, reject later removal; C) completed removal allowed only while target remains unexpired, otherwise reject. Recommendation: A; D-09 already fixes staff authority and historical-start conflicts reject atomically.
- **ND-05 — NOT DECIDED:** Which renewal offer, preactivation eligibility and late-renewal start apply? Options: A) current approved offer snapshot, reject preactivation renewal, late service starts on Cairo recording date; B) original offer snapshot with the same eligibility/late-start rule; C) current approved offer, permit preactivation purchase with service deferred until a separately approved start. Recommendation: A; renewal activation is immediate at recording and early service starts at predecessor effective end under binding sources.
- **ND-06 — NOT DECIDED:** What future-renewal limit and adjustment policy should MVP expose? Options: A) one future renewal, automatic reflow only while unstarted, reject conflicts with actual start/delivered access; B) defer prepaid future-renewal exposure to a later release, retaining D-04 stacking when enabled; C) one future renewal with each unstarted adjustment explicitly confirmed by staff. Recommendation: A; the architect MVP envelope permits at most one, never multiple future purchases or rewriting actual service-start facts.
- **ND-08 — NOT DECIDED:** May a subscription with a dependent future paid purchase be refunded? Options: A) block until PO resolves dependent purchases individually; B) refund selected purchase and explicitly reflow only unstarted dependent coverage; C) PO separately confirms a full refund for each affected purchase before predecessor refund. Recommendation: A; never silently cancel, shorten or refund another purchase.
- **ND-12 — NOT DECIDED:** Which date is authoritative for an externally completed refund recorded late? Options: A) fresh Cairo recording date, no external date stored for MVP; B) PO-attested nonfuture external refund date, stored separately and authoritative; C) store external date informationally with recording date authoritative. Recommendation: A; reversals always belong to the authoritative refund month, originals remain unchanged and cross-month replay never re-dates events.
- **ND-13 — NOT DECIDED:** Which paid lifecycle states are eligible for full refund? Options: A) active, frozen, expired and unactivated paid targets; B) only unexpired activated paid targets; C) active/frozen/unactivated paid targets, excluding expired. Recommendation: A; amount is all unreversed active collection tails including recollections, zero-net monetary refund is rejected and every refund is terminal, never reopened.
- **ND-14 — NOT DECIDED:** Does freeze pause client plan/export access as well as entitlement time? Options: A) restrict plans/export while frozen, preserve login/settings; B) retain read-only plans but restrict export; C) retain plans/export while only time is paused. Recommendation: A as confirmation of the D-05 “pauses entitlement” reading; P4 implements approved access/presentation behavior, not F13.
- **ND-16 — NOT DECIDED:** Which renewal payment terms should MVP support? Options: A) full payment only, one full-price obligation collected at recording; B) defer renewal exposure until a separate installment-renewal agreement/anchor decision exists; C) full payment first, then separately approve a new renewal schedule source and due-date anchor. Recommendation: A; installment renewals are later scope and cannot silently reuse registration-link or initial-activation rules.

## MVP delivery slices

1. **Full refund**: single F12 ledger extension, terminal cancellation, exact stored commission, safe readers, receipts/audit and race proof. Needs no activation; independently verifiable on paid F12 fixtures. Date/eligibility questions block only affected branches.
2. **Internal Cairo entitlement projection**: date arithmetic/resolver and narrow P4 contract with synthetic activation fixtures; no public activation writer or real consumer claim.
3. **Freeze Apply/Stop/Remove**: depends on approved allowance/eligibility/day/removal policy and projection; no P5 check-in engine.
4. **Full-payment renewal stacking**: immediate activation, separate service start, at most one future purchase, unstarted-only reflow; relevant offer/eligibility/late-start/payment-term answers gate behavior.
5. **Later integration/scope**: P4 real activation writer, plan/export enforcement/resume and notices; separately approved installment renewals and multiple future renewals. Closure is a separate feature after B4.

Real user exposure of freeze/renewal waits for the **P4 activation writer** and relevant approved policies/gates. Synthetic fixture success is not real activation/portal/enforcement evidence.

## Dependencies and integration ordering

F12's model objects exist in its pinned branch migration; public operation/reader names below remain contract dependencies unless separately implemented there. Nothing here claims deployment or availability on main. Read/extend the landed contracts; never duplicate them.

| F12 dependency | F13 consumption / extension |
| --- | --- |
| `public.clients` | Existing identity/workspace/approval state; preserve immutable identity and approval transitions. `f12_guard_client_transition()` blocks non-approval UPDATEs: any future F13 clients write needs a forward amendment, not guard bypass; no closure writer here. |
| `public.subscriptions` | Immutable purchase snapshots and initial-only uniqueness; extend supported kind for linked renewals and add append-only lifecycle facts, without widening initial uniqueness or editing terms. |
| `public.subscription_installments` | Exact-total immutable amount/currency/sequence/issued offsets; separate one-per-obligation unique cancellation facts distinguish canceled from unpaid. |
| `public.payment_events` | One unified ledger: add terminal `refund_reversal`, reuse `reverses_event_id` uniqueness, extend all chain/value/correspondence/actor guards and readers; never interpret refund/cancellation as unpaid. |
| `public.subscription_activations` | Read immutable first activation; P4 supplies the atomic writer; agree a separate renewal seam rather than impersonating first delivery. |
| `app_private.registration_operations` | Consume actor/key/canonical intent/receipt pattern; forward-amend kind/shape checks and financial correspondence for aggregate refunds/lifecycle operations. Preserve actor/key uniqueness across targets/operations and commission-free receipts; no independent store permitting replay collisions. |
| `app_private.registration_decisions`, `app_private.registration_approval_events` | Preserve approval truth and P2 REQ-P2-01 durable handoff; renewal/refund is not a second initial approval/form-assignment event. |
| `installment_collect`, `collection_correct` | Extend terminal-state checks and shared serialization for refund/cancellation races; preserve sequential activation gating and correction-month behavior. |
| `subscription_payment_status`, `subscription_commission`, `workspace_payment_queue`, all eligibility readers | Extend every refunded/canceled/future-term interpretation together; preserve PO/WO commission-reader boundary, Sales-safe amounts and commission-free receipts/results. |
| `registration_approve`, `registration_reject`, `registration_reconsider`, `registration_approval_queue`, `registration_approval_review` | Preserve initial-only behavior and PO/WO/PO boundaries; not alternative renewal writers. |
| `client_self_status()`, internal `client_has_access()` | Keep pending/rejected exception approval-only and self-scoped; any lifecycle/plan entitlement extension needs separate reviewed projections and cannot treat approved as activated. |
| Future `record_initial_subscription_activation(...)` | P4-only atomic plan-pair seam; add shared terminal/lifecycle serialization contract before P4 implementation. No public writer in F13. |
| `issue_flexible_registration_link`, F10 `issue_registration_link` and immutable issued version/schedule | Preserve issued agreements and exact money; renewal source/version/terms writer awaits ND-05, not copied registration-link machinery. |

### Reverified F12 guards and required forward extension

Read-only inspection of [model migration at 50cc77e](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/supabase/migrations/20261101120000_registration_approval_model.sql) confirms the following, without applying SQL:

- Line 102's kind CHECK permits only `collection` and `correction_reversal`. Root/revision/predecessor constraints, `f12_payment_successor` and `f12_payment_reversal` uniquely constrain stream branching and reversal of an original. Refund must extend the existing kind/value CHECKs, not create a second ledger or remove those uniqueness guarantees.
- `app_private.f12_validate_payment()` / `f12_check_payment()` enforce deferred chain alternation, exact reversal amount/commission/currency/effective date and operation correspondence; `f12_guard_payment()` currently routes only correction reversals to PO-only `record_refund`. Merely adding a new kind would take the collection permission branch. The coordinated forward migration MUST explicitly recognize refund kind/actor/operation and terminal transitions; keep correction and refund mutually exclusive and reject every successor after terminal state by deferred constraint independent of RPC/key.
- `app_private.registration_operations` currently allows approve/reject/reconsider/collect/correct, requires per-obligation event correspondence and ties `original_event_id` to correction. Its checks and receipt/result correspondence MUST be extended coherently for multi-obligation refunds and lifecycle facts, without breaking cross-target actor/key uniqueness or existing F12 receipts.
- `f12_guard_subscription()`, `f12_guard_installment()` and `f12_validate_subscription()` assume an initial issued-link purchase; subscription kind is initial-only and issued-link relations are mandatory. Full-payment renewal needs a coordinated forward extension of those guards/constraints, immutable offer binding and one full-price obligation, not forged registration links or a copied purchase model. Installment renewals remain later scope.
- `app_private.f12_guard_client_transition()` rejects any UPDATE except a matching in-transaction approval-state transition; F13 uses separate lifecycle facts. If a later approved design writes clients, amend that guard and audit correspondence forward while retaining immutable identity/approval guarantees.
- Audit currently maps only collection/correction inserts. The same coordinated change MUST extend audit mapping, kind/chain/alternation guards, operation/parent correspondence, terminal/cancellation integrity and **every** status/commission/queue/eligibility reader. The one-per-obligation cancellation fact is separate from the payment chain; no fabricated zero-payment row. Test deferred terminal rejection through direct integrity probes as well as RPC races.

### Migration and shared-file coordination (future work only)

- F12's `20261101120000_registration_approval_model.sql` exists at the pinned revision; its planned `20261101115000_flexible_registration_link_terms.sql`, `20261101121000_registration_approval_operations.sql`, `20261101122000_payment_operations.sql` and `20261101123000_registration_approval_reads.sql` remain coordination inputs. F13 migrations MUST sort after whatever F12/F14 migrations are **merged at implementation time**, including all review fixes; re-enumerate actual merged filenames and freeze order before execution. No timestamp is reserved and no universal wait for every unmerged F14 deliverable is imposed.
- F14 pinned to `334f50190bcc78e794832fa26c0ea9d482b116c6`; plan AD-F14-1 orders its changes after final F11 and requires rebuilding audit from the final body. Coordinate shared edits sequentially and use final integrated sources at implementation time; do not copy an older F11/F12/F14 body over newer changes.
- Shared capability authority: `lib/auth/capabilities.ts`, `app_private.role_has_capability()` and `app_private.has_workspace_access()`. Rebuild from latest integrated bodies, preserving F12 Sales `approve_registration` removal and F14 `manage_branding` addition. Existing `record_payment`, `manage_freeze` and PO-only `record_refund` suffice; operation-kind checks separate refund from correction. PO additionally requires an actual workspace row.
- Shared audit authority: latest complete `app_private.audit_row_change()` body. The pinned F12 model migration extends the main F11 body in `20261031122000_client_accounts_signup.sql`; F14 also extends it. Rebuild from latest integrated body, retaining workspace/staff/membership/recovery/package/link/signup/job/approval/payment/branding branches, no-op handling and unmapped-event failure. F11 jobs audit copies `last_error` verbatim; F13 error paths store bounded codes only.
- Shared UI ownership: `lib/i18n/messages/{ar,en}.ts`, existing authorized staff dashboard `app/(app)/page.tsx` and role dashboard surfaces, F12 `/payments` readers/components/actions, client status route if approved, and shared Design System/shell components. Coordinate sequential edits; no navigation redesign, new role tabs or incidental branding changes.
- Future verification includes F12 collection/correction regressions, direct-write immutability and terminal-chain probes, cross-tenant negatives at both walls, exact race/replay/audit rollback cases and P4/P5 consumer contracts. No DB, stack provisioning, migration or application test execution is authorized by this spec unit; document validation and a read-only timezone fixture check are permitted.

## Production blockers and delivery gates

Inherited [readiness register](../../docs/13-production-readiness.md) remains authoritative; this spec closes none of its rows:

- **Finance**: FN-01 correction reversal operational before real money; FN-02 issued agreement/activation-relative timing proof; FN-03 encrypted restore/reconciliation; FN-04 cross-feature real-finance enablement.
- **Identity/privacy**: AI-01/02 hosted Auth/Vault, AI-03/04 recovery policy/timers and hosted proof; DP-01/02 B4 closure/audit retention, DP-03..05 token/content/issuance/privacy gates; OP-01..03 purge authorization, approved origin and scrubbed app/worker/DB/host logs.
- **Platform/release**: PI-02 specific deployment approval, PI-03..05 volumes/measurement/test-account approvals; CS-01 credentialed pull evidence as applicable, CS-02 exact-head CI/security, CS-03 provenance/secrets; BR-01..03 encrypted backups/first restore/drill. PI-01 and PI-06 being Done does not close these gates.
- **F14**: SB-01..04 hosted Storage/proxy/validator, capacity/upload limits, banner decision and Storage proof; BR-04 Storage restore/audit integrity remain applicable to the eventual integrated release. F13 does not independently close or reimplement them.

F13 adds proposed evidence obligations **F13-PB-01** (finance owner/PO: operational full-refund reconciliation with corrections, exact commission, cancellations, terminal-state races, immutable history and restore proof) and **F13-PB-02** (F13/P4 owners/PO: relevant ND answers, calendar/entitlement contract proof, real activation/enforcement/notification consumers and Design Gate evidence before exposing freeze/renewal). Status: **Open**, phase: **Pre-Production**. These are local draft labels, not allocated central register IDs. Within this three-file-only brief, shared docs/13 is not edited; carry both obligations into that register in the next authorized integration change before release. Real freeze/renewal exposure waits for P4; full refund does not require activation. No compliant go-live is implied by merging this draft.

Spec Debate is complete; unresolved policy blocks only its affected slice. Unaffected slices may be planned separately; relevant PO decisions/approval and approved plan/tasks/analyze precede implementation. Future merges still require independent architect review, exact-head push and pull-request CI, current CodeRabbit approval/resolved threads and explicit PO merge approval under Constitution 1.3.0/docs/08. No PR/deployment is authorized here.

## Out of Scope

- P4 initial activation writer/atomic plan-pair delivery, productivity writer, actual client portal plan/export enforcement, overdue restriction/resume and real notification consumers. Ownership is decided; F13 supplies entitlement/overdue inputs without claiming P4 delivery.
- P5 weekly check-in freeze scheduling/resumption, outstanding-form handling, client timeline implementation, measurements and coaching changes; preserve PRD-03 without inventing P5 rules.
- P2 forms/intake/templates/assignment and REQ-P2-01 consumer; no new approval event for a renewal.
- Finance reporting, workspace share dashboards, payroll/settlement tracking, compensation/discipline automation; preserve immutable events for later reporting without building it.
- Payment-provider refunds, gateways, online checkout or payment execution: BRD-03 requires external payment and no integrated gateway. F13 records confirmation only.
- Partial refunds, partial installment collections, ad hoc discounts/fees, repricing old purchases, updating/deleting ledger/audit/snapshots, cross-workspace merge/transfer and YBS behavior/systems.
- PO-only closure/pseudonymization/identity release: separate feature after B4, preserving ledger/audit. No self-service renewal/payment/account-delete request, CTA, support button or helpdesk.
- Installment renewals and multiple future renewals are outside MVP; later decisions/contracts cannot silently reuse initial registration schedules or rewrite started terms.
- Code, migrations, DB/Docker operations, plan.md/tasks.md, shared-file edits, PR creation and deployment in this session.

## Constitution Check

| Principle | Draft treatment / remaining gate |
| --- | --- |
| I — Isolation | FR-001/002/023/024/030: tenant correspondence, two walls, PO global with real target, authorization before replay and after waits, foreign negative evidence. |
| II — Immutable finance | FR-003/014..022/025/026: one F12 ledger, exact integer money, append-only linked reversals/cancellations, full collected-only refunds and stored commission reversal; policy gaps do not authorize exceptions. |
| III — PO governance | D-09 freeze/renewal roles, D-10/15 PO-only refunds/deletion; preserve F12 superseding Sales approval removal and role-safe finance projections. |
| IV — Approved scope | Architecture/traceability/later decisions reconciled; remaining ND options NOT DECIDED, no YBS defaults, fixed P4/P5/closure ownership and MVP boundaries. |
| V — Versioning | New renewal purchase snapshot, immutable prior terms, initial activation only at P4 delivery; renewal productivity only for genuinely new delivered plans. |
| VI — People decisions | Genuine completed delivery credit preserved, no automatic discipline/payroll/settlement effects. |
| VII — Privacy | PII-free append-only audit, safe receipt/read projections, B4/retention and hosted readiness remain blockers. |
| VIII — UI | Every proposed rendered surface explicitly gated by DESIGN.md/docs/09; no generated UI decisions or screenshots claimed. |
| IX — Reliability | All entitlement/money operations and scheduled facts deduplicate and serialize, including cross-feature races, uncertain outcomes, authoritative Cairo dates and audit rollback. |
| Workflow/platform | Spec/checklist/debate only; Spec Debate complete, pending relevant PO decisions, unaffected slices may be planned separately; no implementation approval/stack use. Migration order follows merged F12/F14 at implementation time. |

No constitutional exception is requested. Spec Debate is complete; this remains a draft pending PO decisions and slice-specific implementation approval. Checklist incompleteness records unresolved policy and required technical detail; it does not block unrelated planning.
