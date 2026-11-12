# Feature Specification: F13 — Freeze, renewal, refunds and expiry

**Feature ID**: F13

**Feature Branch**: `013-freeze-renewal-refunds`

**Created**: 2026-10-29

**Status**: Draft - PO-1 policy update and Custom Access Token issuance gate incorporated; F12 U4 is merged and verified; architecture and production gates remain open

**Input**: Sessions 12–13, lane 3. Specify freeze apply/stop/remove, early-renewal stacking, expiry and PO-only full/partial refunds. Consume F12's subscription, obligation, collection, correction and ledger model. This is a specification and architecture revision only; it is not implementation authorization.

## Authority and scope traceability

Baseline: `origin/main` at `a8c7ae569e1ae1380740230b90817679b22d465b`. F12 dependency reverified read-only at `origin/012-registration-approval` = `50cc77e8a0090f3baa716c3e4656b216db0983dd`; its model migration now exists on that branch. F14 judgment baseline is `334f50190bcc78e794832fa26c0ea9d482b116c6`; the current remote has advanced, so this revision pins the judgment baseline. Source inspection is not runtime/DB verification.

The [roadmap](../../docs/03-roadmap.md) P1 row is quoted verbatim:

```text
| **P1 Commercial core** | Workspaces, memberships, branding preview/publish, PO-only packages + versions (30-day months: 1/3/6/8/12, custom days), registration tokens (24h/+30m) with staff-configured installment schedule, global email/phone uniqueness + generic duplicate message, signup, approval, subscriptions + snapshots, ledger (confirmed payments, PO full refunds; F13 later PO decisions permit full/partial refunds), per-payment commission, installment overdue restriction/resume, freeze (apply/stop/remove), early-renewal stacking, expiry, PO-only deletion/removal | A (to approval), D, G | 5–8 ew | — |
```

Sources and precedence:

- [Architecture v3, APPROVED 2026-10-27](../../docs/02-architecture.md) is binding where not superseded by later D-rows/F12 finals. F12 supersedes its ledger naming, correction chain, initial activation gating and permissions; later D-rows also supersede older Auth/hosting assumptions. [Traceability](../../docs/01-traceability.md) AT IDs are coverage requirements explicitly labelled proposed acceptance-test IDs, not executed evidence; see SC mapping below.
- [Spec Debate judgment](debate.md) settles the technical/source issues below. Only the remaining named PO questions are NOT DECIDED.
- [Decision register](../../docs/04-changes-and-questions.md): D-04 preserves remaining days and starts new duration after the current term; D-05 pauses/extends entitlement, Stop keeps counted frozen days excluding Stop day, Remove reverses the effect subject to the no-revoke clamp, every change audited; D-09 is superseded for F13 freeze/renewal actions by F13-1/4/11; D-10 reserves refunds/deletion to PO; D-11 uses 30-day months and PO pricing; D-12/13/17 govern overdue access, collections and exact installment totals; Session 12 refund decisions supersede D-15; D-23 and final F12 decisions supersede earlier F12 proposals.
- [BRD/PRD master](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md): BRD-01 invariants; BRD-02 role/tenant boundaries; BRD-03 external payments and immutable finance; BRD-04.7–10 activation, expiry, renewal and closure; BRD-05 preserved genuine delivery credit after refund; BRD-06 meaningful timeline; PRD-01/06/07/10/11/12/13/14 (Journey D); DR-01/02/03. Session 12 refund decisions supersede D-15; D-11/12/17 and final F12-3/8 override fixed 50/50 assumptions. No YBS rule is imported.
- [Constitution 1.3.0](../../.specify/memory/constitution.md), all nine principles; [carried requirements](../../docs/12-carried-requirements.md) contains REQ-P2-01 for P2 only, which F13 must preserve; [production readiness](../../docs/13-production-readiness.md); [tracker F13 row](../../docs/10-feature-tracker.md) currently says Not started, depends on F12; this draft does not claim delivery or update shared tracking files.
- F12 pinned [spec](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/spec.md), [plan](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/plan.md), [model](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/data-model.md), [staff/client contract](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/contracts/registration-approval-surface.md), and [handoffs](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/specs/012-registration-approval/contracts/feature-handoffs.md). Consume these seams; do not copy their financial system into F13.
- F14 pinned [spec](https://github.com/sekiirro/LIFTER/blob/334f50190bcc78e794832fa26c0ea9d482b116c6/specs/014-workspace-branding/spec.md) and [plan](https://github.com/sekiirro/LIFTER/blob/334f50190bcc78e794832fa26c0ea9d482b116c6/specs/014-workspace-branding/plan.md): preserve `manage_branding` and integrated audit mappings; use current merged bodies at implementation time, not a stale pinned copy.

### Ownership conclusions

**P4 owns overdue/expiry enforcement and notices**: F13 supplies the entitlement projection plus independent overdue input (roadmap P4 row; F12 handoff line 21). F12's Out of Scope phrase assigning “overdue enforcement” broadly to F13 is an **F12 documentation fix**, not an open ownership decision. F12 owns obligation/collection truth and activation-relative due projection. No F12 file is edited here.

**Removal means PO-only pseudonymization**, freeing old email/phone while keeping ledger/audit (architecture line 61, D-10, Constitution VII). A separate closure feature after B4 owns delivery, outside F13. Freeze Remove only reverses that freeze's entitlement effect; F12 delivers neither closure nor identity release.

**Binding source resolutions**: Session 12–13 PO decisions supersede D-15 and D-09 for F13 scope. Freeze Apply day counts as frozen; Stop day does not. PO/WO/Trainer/Sales may apply, stop and remove freezes and confirm renewal installments; use existing `manage_freeze` and `record_payment` capabilities. Renewal uses the approved price snapshot and recording-date installment anchor. The earlier successor-lineage, future-term and renewal-point requirements are superseded by the S43-PO-5 decision encoding in FR-037..042; pre-activation renewal refusal is resolved by S45-PO-2 / S45-R3 in FR-005/012/039; implementation and ledger details remain subject to the revised tasks. Any positive refund immediately deactivates the client and preserves financial/audit history. The Custom Access Token hook blocks new sign-in and refresh issuance from committed deactivation; the Auth Admin worker applies a long-lived ban as defense in depth. Existing JWTs may remain valid until natural expiry. The refund transaction atomically records deactivation and a durable idempotent Auth-lockout outbox row. Refund amount is editable up to actual unrefunded collections; partials are goodwill exits and cumulative refund cannot exceed that balance. Payments/refunds are externally executed; LIFTER records them only. No expiry grace: plans/exports stop at expiry and login/settings remain except that PO-1 refund deactivation denies app/RPC data and new token issuance immediately. PO-only refund uses existing `record_refund` plus explicit `platform_owner` and refund-kind checks, separately from F12 correction. Receipts/results contain no commission for any role; PO/WO use the separate commission reader.

## PO-1 policy update (verbatim)

"Claude, PO-1 policy updated: Existing JWTs may remain valid until natural expiration after a refund. Immediate access-token revocation is no longer required. Deactivate the client on refund, block new sign-ins and token refresh, and prefer supported Supabase APIs over direct Auth table modifications. Have Luna High simplify the design, verify failure handling, update the spec/tests, and report only unresolved technical conflicts."

## User Scenarios & Testing

These are future acceptance requirements, not executed tests. Policy-dependent scenarios are explicitly conditional on the referenced NOT DECIDED question; no recommendation below is an approved default.

### User Story 1 — Record full or partial goodwill refund safely (Priority: P1)

As PO, I record an externally completed full or partial refund against an explicitly selected refundable package group, reverse collected revenue and its earned commission, deactivate the client and preserve financial/audit history.

**Why this priority**: a refund is a terminal client exit even when it is partial; the ledger must cap cash and commission reversals without changing historical collections.

**Independent Test**: Use an F12 fixture with multiple collected installments and one unpaid installment. Record partial refunds up to the collected balance; reconcile principal and commission, verify immediate deactivation and outbox; verify the hook blocks sign-in/refresh while the worker retries, then attempt later collection; deny refund to non-PO actors.

**Acceptance Scenarios**:

1. **Given** one selected refundable package group whose original purchase and upgrade charges have collections totaling 30,001 minor units, **When** PO refunds 7,000 then 23,001, **Then** both operations allocate across that group’s source purchases in deterministic FIFO order (collected_on, installment sequence, event UUID), cumulative principal reversals equal but never exceed 30,001, commissions follow stored per-collection proportional allocation, the second refund cannot reopen the client, and other purchases require manual resolution (FR-014..019, FR-035).
2. **Given** a lost success response or two PO sessions refunding against the same expected balance, **When** requests are retried/compete, **Then** one matching operation commits; exact authorized replay returns its identical receipt, and a distinct stale request is re-evaluated against the locked balance (FR-023..026).
3. **Given** a collection previously corrected and recollected, **When** a refund is evaluated, **Then** corrected collections are excluded, active recollections remain eligible, unpaid obligations are canceled without becoming payable, and originals remain unchanged (FR-017/020/021).
4. **Given** an audit, deactivation or outbox-write failure, **When** refund is attempted, **Then** the entire transaction rolls back, including ledger rows, client deactivation, outbox row and success receipt; an Auth Admin failure after commit leaves the refund committed and retries the same outbox operation while the hook continues to block new token issuance (FR-026, FR-035).

### User Story 2 — Pause and correctly resume entitlement (Priority: P1)

As PO, WO or Sales, I apply a configured freeze, stop it early while retaining elapsed frozen days, or remove its effect, with a readable history.

**Why this priority**: D-05 promises preserved paid days and distinguishes Stop from Remove.

**Independent Test**: On a synthetic activated term, apply a ten-day freeze, stop after three counted Cairo days, and separately remove a freeze. Verify expiry projections, role denials and immutable events under the PO-approved day policy.

**Acceptance Scenarios**:

1. **Given** an activated, including overdue, term, **When** PO/WO/Trainer/Sales applies a 1-30 calendar-day freeze, **Then** the application date counts as frozen, entitlement extends by its counted frozen days, plans/exports are restricted, login/settings remain, and overdue restrictions remain. An overlapping freeze is rejected; a sequential freeze is allowed (FR-006..010).
2. **Given** a freeze applied on Nov 1 with a planned ten-day duration, **When** Stop is recorded on Nov 3, **Then** Nov 1 and Nov 2 count but Nov 3 does not; only two days are credited. When Remove is recorded, that freeze contributes zero extension, preserving history and delivered access (FR-008/009).
3. **Given** no activation fact, **When** freeze or expiry is evaluated, **Then** no start/end date or elapsed service days are fabricated; freeze eligibility is decided for activated subscriptions, including overdue ones (FR-005).
4. **Given** concurrent freeze changes, renewal or refund, **When** competing expected-state operations run, **Then** each result corresponds to one serial history and no duration is counted twice (FR-024/025).

### User Story 3 — Record a renewal without losing paid days (Priority: P1)

As PO, WO or Sales, I confirm an externally paid renewal and retain the client's remaining entitlement using a new immutable purchase snapshot.

**Why this priority**: D-04 protects the paid remainder and D-13 protects collection-earned commission.

**Independent Test**: Seed an activated term with ten remaining days and an approved 30-day renewal offer. Record one renewal, verify uninterrupted 40-day coverage from the observation boundary under the approved calendar convention, unchanged original terms and exact collection/commission.

**Acceptance Scenarios**:

1. **Given** an active continuous subscription with an early renewal and confirmed external payment, **When** the renewal commits, **Then** the same subscription expiry extends by the full purchased duration, immutable renewal payment facts are recorded, and no successor subscription or activation row is created (FR-037/039).
2. **Given** package price/rate/duration changes after renewal purchase, **When** either term is read, **Then** each retains its own purchase snapshot; later settings change neither history (FR-003/012).
3. **Given** two sessions renewing or upgrading the same expected continuous-subscription revision, **When** they submit distinct keys, **Then** only the request with the current expected revision commits; the stale request is rejected with no partial writes (FR-025, FR-037).
4. **Given** an activated subscription with a renewal installment schedule, **When** its schedule is recorded, **Then** due dates derive from the renewal recording date and remain unchanged by freeze or automatic service-start shifts (FR-011, FR-022, PO-2).

### User Story 4 — Determine expiry without disabling the account (Priority: P1)

As authorized staff and, through P4, the client, I can distinguish awaiting activation, future renewal, frozen, active, expired and refunded entitlement without mistaking payment approval for activation.

**Why this priority**: BRD-04.8/PRD-07 restrict plans at expiry while preserving login and settings.

**Independent Test**: Evaluate fixtures immediately before/at/after effective end, through Cairo DST changes, with no activation and with a stacked renewal. Verify P4's expected access decision independently of job execution.

**Acceptance Scenarios**:

1. **Given** a known entitlement interval, **When** its end boundary is reached, **Then** its service coverage ends with no grace under the PO-decided Cairo date convention; a contiguous eligible renewal can continue coverage without a gap (FR-004/027).
2. **Given** no activation on an initial subscription, **When** time passes or an expiry task reruns, **Then** expiry remains undefined, not expired or indefinitely active, and later installments remain uncollectable (FR-005/022).
3. **Given** expired coverage, **When** P4 consumes the result, **Then** plan viewing/export are restricted while login/settings remain unless a refund has deactivated the client; the hook blocks new token issuance and clearing overdue cannot override expiry, refund deactivation or freeze access restriction (FR-028).

### User Story 5 — Work within role, workspace and safe history boundaries (Priority: P1)

As an authorized staff member, I see only my permitted workspace operations and financial projections; a client sees only the approved self projection.

**Why this priority**: Constitutional isolation and financial privacy apply to reads, retries, background work and writes alike.

**Independent Test**: Exercise every operation with PO, own/foreign/revoked WO and Sales, Trainer, client and anonymous callers at both authorization walls; inspect receipts/audit/logs and future UI evidence.

**Acceptance Scenarios**:

1. **Given** a WO/Sales/Trainer in workspace A, **When** they freeze or confirm renewal payments in A, **Then** those authorized actions succeed; refunds remain PO-only and any foreign target is denied (FR-001/002).
2. **Given** authorization revoked while a request waits, **When** it resumes or replays a receipt, **Then** current authorization is checked before any state/existence disclosure (FR-023/024).
3. **Given** a permitted lifecycle operation, **When** its audit and role-safe view are inspected, **Then** audit contains only allow-listed non-PII facts, Sales sees no commission, and no client sees staff/correction audit details (FR-029..031).

### Edge Cases

- The Custom Access Token hook reads the refund-committed deactivation fact before each new token issuance, so password sign-in and refresh are denied while the Auth-lockout worker is paused or failing. Existing access JWTs remain accepted until natural expiry under the PO update; app/RPC data access checks deny the deactivated client meanwhile.

- Cairo midnight and DST transitions in both directions; a calendar day is not always 24 elapsed hours. Browser/server timezone, Friday, month end and leap day cannot change entitlement-day arithmetic.
- Freeze at activation, expiry or a renewal boundary; overlapping/repeated freezes (overlaps are rejected; sequential freezes are allowed); Stop on Apply day credits only Apply day; Remove after Stop, auto-completion or expiry; removal moving an end into the past. REMOVE clamp preserves current/delivered access.
- Awaiting activation with a collected upfront installment: expiry and later due dates remain undefined. Upgrade is permitted before activation under FR-038; its duration begins at activation under S43-PO-6. Renewal/initial activation is no longer governed by the superseded successor-row rule.
- Corrected earlier installment with later installments still collected; correction then recollection; all collections corrected so net collected is zero; cross-month correction/refund; a refund racing correction, collection or P4 activation.
- Legacy renewal-lineage note (superseded by S43-PO-5): predecessor/successor and one-unstarted-renewal restrictions are not current product requirements. Current operations mutate the single continuous subscription under FR-037..039.
- Duplicate keys with different targets/amount expectations, distinct keys for the same intended purchase, two staff sessions, stale month/time observed before lock wait, uncertain network outcome, authorization revoked during wait.
- Values beyond floating-point exact range, proportional commission rounding remainder, mixed currency/cross-workspace references, changed package settings, zero refund, multiple purchase selection and partial refund races.
- An expiry materialization/notice job is delayed or duplicated: no access extension merely because a job did not run and no duplicate lifecycle/notice fact. P4 owns notification time, catch-up, deduplication and obsolete-notice suppression; P6 later consumes approved notification facts.
- Refund versus deletion: neither erases financial/audit history; closure never implies returned cash. Genuine previously delivered productivity remains credited (BRD-05).

## Requirements

### Functional Requirements

Binding requirements below derive from cited decisions, the explicit brief and the completed architect judgment. A reference to an ND question leaves only that policy branch conditional; recommendations are NOT DECIDED and must not become runtime defaults.

- **FR-001**: Apply two independent authorization walls to every read/mutation/replay. PO has global scope but MUST independently verify an existing workspace row: app_private.has_workspace_access() alone returns true for PO on any UUID. WO/Sales need current membership. Tenant rows/relations require workspace/composite-parent correspondence, forced default-deny RLS and no browser base-table grants. Foreign/nonexistent/revoked targets return generic not_permitted.
- **FR-002**: PO/WO/Trainer/Sales MAY Apply/Stop/Remove freezes via `manage_freeze` and confirm renewal installments via `record_payment`. Refund MUST check `record_refund`, explicit `platform_owner` and refund operation kind at both authorization walls; F12 correction separately checks its own kind. Client/anonymous cannot mutate these operations. TypeScript and SQL capability maps must match in both directions. Preserve F12 Sales approval removal and F14 `manage_branding`.
- **FR-003**: Reuse F12 subscription/obligation/collection/correction truth. Snapshot each new purchase's approved version, price, currency, duration, commission rate and schedule; never mutate prior snapshots or obligations. Money MUST use bounded integer minor units/currency and exact transport/calculation; no floating-point amounts. Reuse F12 Round Half Up collection commission; corrections reverse stored commission exactly, while refund commission uses deterministic cumulative proportional allocation.
- **FR-004**: Store entitlement/freeze boundaries as Cairo date values and durations as integer days. Boundary instant = the first existing instant of that Africa/Cairo date: nonexistent midnight resolves forward, ambiguous midnight to earliest instant, using the zone library. Calculate dates before conversion, never fixed offsets, elapsed-hour months or browser timezone. Month = 30 days; custom days stay exact. PO decisions fix day inclusion and Stop credit; DST resolution remains separate. Calendar fixtures below give expected instants.
- **FR-005**: An initial subscription without P4 activation MUST have no service start/end, expiry or later-installment due date and consume zero service/freeze days. Awaiting activation is neither active nor expired. Do not create a public/standalone activation writer. Freeze and renewal require activation. A renewal attempted while awaiting initial activation is refused with no writes and no queued duration. Full refund needs no activation and never generates delivery/productivity.
- **FR-006**: Freeze Apply MUST append a selected duration of 1–30 calendar days and Cairo effective dates, count the Apply day as frozen, pause entitlement and extend its effective end by counted frozen days. PO/WO/Trainer/Sales may freeze activated subscriptions including overdue subscriptions. Payment restrictions remain. Freezes on one client/subscription MUST NOT overlap; sequential freezes are allowed. Do not infer package-based limits.
- **FR-007**: Natural completion/resumption derives from approved interval and Stop/Remove facts without changing immutable purchase terms, installments, or collections. Completed freeze retains its counted extension; repeat evaluation creates no extra day/audit. Earlier future-successor renewal service rules are superseded by the S43-PO-5 continuous-subscription renewal rule; see FR-037..039 and the PO-decision register.
- **FR-008**: Stop MUST end an applicable freeze early and retain only elapsed counted Cairo days, excluding the Stop day and unused planned days. Same-day Apply/Stop credits the Apply day. Repeated/invalid Stop never extends again or deletes original facts.
- **FR-009**: Remove MUST append a linked reversal making that freeze's extension zero, retaining Apply/Stop/completion history; PO/WO/Trainer/Sales authority is fixed. Recompute entitlement without rewriting historical access or ending entitlement before the current date or any already delivered access. Because end dates are exclusive Cairo boundaries, clamp a reduced end to no earlier than the first existing instant of the next Cairo date after the Remove recording time, and no earlier than the latest already-delivered access boundary. Reject conflicts that would rewrite actual service-start facts.
- **FR-010**: Freeze MUST NOT change initial activation, issued installment amounts/offsets or installment due dates. Initial installment due = Cairo activation date + issued offset. Renewal installment due dates anchor to Cairo renewal recording date. Freeze and automatic service-start shifts never move either schedule; overdue remains independent.
- **FR-011**: Renewal MUST confirm an external payment/installment under F12 `record_payment` and atomically append immutable renewal lifecycle, payment/revenue, obligation, collection, stored commission, audit and receipt facts while mutating the existing continuous subscription under FR-037. It MUST NOT append a successor subscription or new activation row. Use the current approved immutable price/currency/duration/commission snapshots and the existing installment workflow, including upfront payment, configured installments, monthly dues, overdue restriction and confirmation; PO/WO/Trainer/Sales may confirm. No gateway or payment execution. Never reuse initial registration approval as a renewal writer.
- **FR-012 (superseded in part by S43-PO-5; pre-activation rule resolved by S45-PO-2 / S45-R3)**: The prior successor-row, predecessor-end, and one-unstarted-renewal constraints do not govern the continuous subscription decision. Renewal before initial activation is refused with no writes and no queued duration. After activation, FR-037 and FR-039 govern: active expiry extends by the full duration, expired renewal starts today, a frozen subscription must be unfrozen first, and renewal modifies the existing subscription. Preserve immutable payment facts and recording-date installment anchors where compatible.
- **FR-013 (superseded in part by S43-PO-5)**: The prior successor-row activation and renewal-point rule is retired for continuous renewal. Renewal never earns a productivity point. Current client access and plan eligibility continue to follow the owning P4/F19 contracts; this feature does not add a separate client-access grant.
- **FR-014**: Refund MUST be PO-only and target an explicitly selected paid refundable package group when more than one group is paid. The original package purchase and its upgrade charges belong to one group; each separately paid renewal is its own group. Default editable amount to the refundable collected balance; zero may be displayed during editing but confirmation MUST reject zero. Full or partial refund is permitted for active, frozen, expired and paid-unactivated purchases. Partial refund is a goodwill client exit, not discounted continued access. The first successful refund is terminal for client access; PO may record later partial refunds against the same selected group while its residual collected balance remains, solely to complete the external refund, without reactivating the client. Separate refundable package groups remain financially independent: no automatic refunds or shifts affect another group. PO-1 global client deactivation applies; any other-purchase resolution is manual.
- **FR-015**: Append immutable refund allocation events to the F12 ledger under an aggregate refund operation identity. A collection may have multiple partial refund allocations; do not use F12's unique `reverses_event_id` for refund allocations. Preserve that F12 relation/uniqueness for exact correction reversals. Each refund allocation identifies its source collection and exact negative principal/commission deltas; preserve original rows and currency.
- **FR-016**: Cancel unpaid obligations through separate one-per-obligation unique cancellation facts, not mutable issued rows or fabricated collection events. Refunded/canceled differs from unpaid and can never be collected/corrected/reopened. A deferred constraint MUST reject every successor after terminal refund/cancellation, independently of RPCs/keys and in direct integrity probes. Refund ends target/frozen entitlement; other refundable package groups remain financially independent and require manual resolution.
- **FR-017**: Refund principal MUST not exceed selected group's actual unrefunded collection balance across its component purchases, calculated from active collection tails after corrections/recollections. Sum committed refund allocations and the proposed allocations under the same group/subscription lock as F12 collections and corrections. Commission is reversed proportionally using each collection's stored commission and cumulative rounding remainder; total reversal for each source cannot exceed that stored amount.
- **FR-018**: Record explicit PO confirmation of an externally completed refund; no gateway/payment execution, settlement, method or free-text reference. Refund date is the Cairo recording date and determines the refund month. A refund allocation may span collection events from purchases within the explicitly selected group, including the original package and its upgrade charges, but MUST NOT cross refundable groups. A separately paid renewal requires its own explicit group selection.
- **FR-019**: For the first successful refund, allocations, commission reversal, unpaid-obligation cancellation, client deactivation, Active Clients removal, a durable idempotent Auth-lockout outbox row, receipt, audit and RET-1 start fact MUST commit together or all roll back. Later partial refunds against that same group atomically add capped allocations/commission reversals/audit/receipts and do not reactivate the client or duplicate its lockout row. A synchronous Custom Access Token Postgres hook MUST reject token issuance for a deactivated client, including password sign-in and refresh, based on the committed deactivation fact; the hook prevents the pre-worker issuance window. A server-side worker still applies the supported Auth Admin ban with bounded exponential retry and records completion. After the third failed attempt, or after five minutes if fewer than three attempts have failed, it records one durable, deduplicated, audited alert with a snapshot of current PO/WO recipients; delivery and rendering are deferred to the Notifications feature. App/RPC client-data helpers deny a deactivated client even when an existing JWT remains valid. Financial/audit records are preserved. A refund of a future renewal still deactivates the client. No refunded entitlement remains usable.
  The hook must pass claims through unchanged for staff and active clients. Supabase permits one `custom_access_token` hook per project; future claim customization must compose into this function. If the hook errors, token issuance fails closed. Hosted Supabase production requires enabling this hook in the dashboard, a production change requiring PO approval; first enable and verify it on a non-production hosted project.
- **FR-020**: An F12 correction fixes a mistaken collection record: one exact linked reversal, obligation unpaid again, subscription/approval unchanged, recollection possible while nonterminal. Its `effective_on` is the fresh Cairo correction-recording date/month (final F12-4, F12 spec FR-025); originals remain in their original collection month. F13 MUST preserve this behavior and not invoke correction alone as a refund.
- **FR-021**: Refund is a terminal access event for the client; book each principal/commission allocation in its refund month. Cancel remaining unpaid obligations for purchases in the selected group, without restoring them to payable. Collection, correction and recollection against the deactivated/refunded group are denied, while a new PO refund operation may consume residual collected balance within the selected group under FR-014/017. Authorized exact historic replay returns its original receipt without new writes or dates.
- **FR-022**: Preserve F12 initial installment n>=2 gating and activation-date-plus-issued-offset rule. Renewal installments reuse the existing workflow but their due-date anchor is renewal recording date. Freeze and automatic service-start shifts do not alter either due-date schedule.
- **FR-023**: Every Apply/Stop/Remove, renewal, refund, cancellation and expiry materialization MUST deduplicate with immutable operation evidence. Staff keys bind actor, operation kind, workspace, target, expected lifecycle/chain/ledger revisions and canonical inputs/confirmation. Authorize before lookup/disclosure; exact replay returns identical safe result and zero new effect/audit; changed binding returns key_conflict. Receipts/results contain NO commission for ANY role; PO/WO use subscription_commission separately. Uncertain outcomes keep identical request/key.
- **FR-024**: Every same-client writer MUST follow F12 locking: client row first, subscriptions in stable ascending ID order, obligations by sequence within subscription-ID order, then ledger tails. Never sort locks by derived service start. After waits, recheck/lock current actor/membership in F12 authorization order and hold through commit; sample fresh Cairo time. Internal P4 activation/expiry writers share this contract; refund serializes its cap with F12 collection/correction.
- **FR-025**: Enforce independently of keys: one freeze contribution per applicable interval, one continuous subscription per client, one correction reversal/original, one client deactivation, and any number of partial-refund operations only while the purchase cumulative cap permits. Distinct keys/two sessions cannot bypass constraints. Expected lifecycle and operation revisions cover freeze/renewal/refund/upgrade races; rejected stale requests make no partial writes.
- **FR-026**: Validation/snapshot mismatch, overflow, stale state, revoked permission, audit or deferred integrity failure MUST leave zero partial financial/entitlement/cancellation/receipt effects; acknowledge only commit. Authorized stale expected state returns stale_state; unauthorized/nonexistent target not_permitted; changed key binding key_conflict; rolled-back unexpected failure unavailable. Use only bounded result/error codes.
- **FR-027**: Derive expiry from service-start date + immutable duration + effective freeze contributions and valid successor coverage. At exclusive end service stops with NO grace; account-level coverage considers eligible intervals. PO decisions fix day inclusion. Never rewrite started successor facts; reject conflicting adjustment. Correct current entitlement cannot depend on an expiry materializer having run; repeat materialization creates no duplicate fact.
- **FR-028**: F13 supplies an internal tenant-scoped entitlement projection plus independent overdue input/reason, distinguishing awaiting activation, future, active, frozen, expired and refunded/canceled. P4 owns actual plan/export enforcement/resume and expiry/overdue notices (roadmap P4; handoff line 21); clearing one restriction never clears others. No expiry grace or login/settings disablement. Frozen access behavior is decided: plans/exports are restricted while login/settings remain. F12 Out of Scope drift is an F12 doc fix.
- **FR-029**: Audit freeze Apply/Stop/Remove, completion if materialized, renewal, refund, cancellation and expiry with one event owner per fact. Allow IDs, bounded reason/status/error codes, revisions, dates/day counts, minor-unit strings/currency and correlation IDs; omit commission, PII, secrets, raw IP, free text and argument dumps. App/worker/DB/host logs and jobs carry bounded error codes only, never raw SQL/messages/payloads. F11 audit_row_change() maps jobs.last_error verbatim: never put raw text there. No lifecycle receipt/ledger/audit purge pending retention approval. Audit failure aborts business changes.
- **FR-030**: PO sees global scope; WO own-workspace commission/audit; Sales permitted amounts/entitlement without commission/rate/general audit; Trainer no implied lifecycle/finance reader. Receipts/results omit commission even for PO/WO; only the separate commission reader supplies it. Clients receive no staff receipts/correction/audit/commission. F13 adds no client page; P4 owns narrow self-only date/status presentation. F12 self-status remains approval-only.
- **FR-031**: Flag all staff freeze/renewal/refund confirmations, expiry indicators and P4 client views for the [Frontend Design Gate](../../docs/09-frontend-design-gate.md). Use DESIGN.md and existing tokens/components/i18n: Arabic RTL/English LTR, light/dark, mobile/desktop, all required states, keyboard and WCAG 2.2 AA; future rendered matrix evidence is mandatory. Design gaps await PO choices, not invented screens/navigation. No UI is built by this draft.
- **FR-032**: Renewal/payment communication stays external. P4 shows expiry date/alerts at 3d/1d/expiry exactly once, no renewal/payment/closure request/redirect CTA; clock time, catch-up and stale-notice suppression belong to P4 consumer work, not F13 PO questions. P5 owns check-in freeze/resume; F13 supplies effective intervals and retains AT-FRZ-01 as integration coverage, no check-in engine. Audit is not client timeline.
- **FR-033**: Preserve genuine delivered productivity after refund (BRD-05; AT-KPI-03), no payroll reversal, fabricated unit or automatic discipline. Every new application function MUST be SECURITY DEFINER, use `search_path = ''` and qualified names, and be owned by `postgres`; revoke EXECUTE from PUBLIC/anon/authenticated/service_role, then grant narrowly. The `custom_access_token_hook` is exempt from SECURITY DEFINER and MUST retain its empty search path, revoked broad EXECUTE grants, and narrow `supabase_auth_admin` grant. Internal P4 activation/projection and expiry materializer never grant authenticated EXECUTE. Forward-amend `f12_guard_client_transition()` to authorize only the new refund deactivation transition through its matching immutable fact; do not bypass/disable it.
  <a id="fr-035"></a>
- **FR-035**: A successful refund MUST atomically deactivate the client, remove the client from Active Clients, and enqueue one durable idempotent Auth lockout; it starts the RET-1 30-day clock and preserves ledger/audit records. The Custom Access Token hook denies new token issuance from the committed deactivation fact on sign-in and refresh, including while the worker is unavailable. The server-side worker retains supported Auth Admin ban calls as defense in depth, retrying failures with backoff and raising a safe PO/WO operational alert after persistent failure. Existing JWTs may remain valid to natural expiry; app/RPC data paths deny deactivated clients. If deactivation, outbox write or audit fails, no refund or other transaction effect commits; an Auth Admin failure after commit leaves the refund committed and the outbox retryable.
  Hook deployment readiness: hosted Supabase requires dashboard enablement and verification on a non-production hosted project before any production enablement; production enablement requires PO approval.
- **FR-036**: Renewal installment confirmation and freeze Apply/Stop/Remove permit PO/WO/Trainer/Sales in TypeScript and SQL with two-way parity checks. Refund remains PO-only. Capability review must preserve unrelated F12/F14 grants.
- **FR-034**: Unresolved policy blocks only its own slice; unaffected slices may be planned separately. Implementation still requires approved spec/plan/tasks/analyze and applicable gates. Migrations sort after whatever F12/F14 migrations are merged at implementation time, including fixes; freeze order before execution. Rebuild audit_row_change() and TS/app_private.role_has_capability() from latest integrated bodies, preserving F12 Sales approval removal and F14 manage_branding. No timestamp is reserved or readiness gate closed.

### Key Entities

Logical concepts only; these are not new SQL definitions or permission grants.

- **Subscription purchase**: The existing F12 immutable terms, client/workspace identity and obligations. A renewal is another purchase linked to a predecessor, not an edit to the initial snapshot.
- **Activation fact and entitlement interval**: One initial activation fact for the continuous subscription; renewal and upgrade use distinct lifecycle/ledger events and write no new activation row under architect mapping (S43-R8). Effective coverage derives from approved calendar policy, selected duration, freezes and terminal events. Unknown initial activation means unknown boundaries.
- **Historical S22-PO-5 implementation seam (superseded where incompatible by S43-PO-5):** The prior `record_renewal` successor-row activation, renewal-of-renewal lineage, and one-unstarted-successor behavior describe the existing implementation baseline only. The current product requirement is one continuous subscription per client; active/expired renewal, freeze, and point behavior is specified by FR-037..041 and architect mapping (S43-R6). Do not treat the former successor lineage as current product scope.
- **Freeze history**: Apply fact with configured duration/effective dates, linked Stop and Remove facts, computed retained contribution and lifecycle revision. Originals remain immutable.
- **Renewal chain**: Ordered same-client/workspace purchases with predecessor/tail identity and serialized revision, separating purchase date from service coverage and activation.
- **Installment obligation and cancellation fact**: Existing immutable F12 scheduled amount/sequence/offset; a linked cancellation ends collectability without replacing that snapshot or creating payment.
- **Unified financial event**: Existing F12 collection/correction stream extended with refund allocation events; correction keeps exact one-reversal semantics, while refund source allocations support multiple capped partials and cumulative commission rounding. No second ledger or mutable paid truth.
- **Refund operation**: PO-confirmed full/partial aggregate linking allocations, unpaid cancellations, client deactivation, durable Auth-lockout outbox and receipt; no account deletion.
- **Operation receipt and audit fact**: Existing private idempotency concept extended for lifecycle operations and scheduled deduplication; actor/scope/expected-state binding, immutable safe result and PII-free evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: AT-FIN-09/10: at a 1,200-unit price with 600 collected, refund may be any positive amount up to 600; with 1,200 collected the cumulative refund cap is 1,200. Refund principal is recorded in its refund month. Per-collection commission deltas follow the stored snapshot and cumulative formula in ledger-architecture.md. Include correction/recollection and cross-month fixtures.
- **SC-002**: Cumulative refund principal never exceeds active collected residual; cumulative commission reversal never exceeds stored commission; no terminal stream/canceled obligation has a forbidden successor; no refunded target reopens; and originals remain byte-identical. Zero refund creates zero effects. Verify constraints and all status/commission/queue/eligibility readers, including direct integrity probes.
- **SC-003**: AT-FRZ-02 and AT-FRZ-03: selected Freeze duration is 1–30 calendar days; overlapping freezes are rejected and sequential freezes are allowed. Ten-day Apply Nov 1 then Stop Nov 3 retains exactly two days [Nov 1, Nov 3); same-day Stop retains one Apply day; Remove contributes zero, repeats add zero. Exact boundary instants are below.
- **SC-004**: AT-REN-01: predecessor end Nov 11 plus 30-day renewal yields successor [Nov 11, Dec 11), preserving ten remaining days on Nov 1. Activation occurs at recording, purchase snapshots stay immutable, and any started-successor adjustment conflict leaves zero partial effects.
- **SC-005**: All unactivated initial fixtures have no expiry/later due date, zero consumed service days and zero later collections. Full/partial refund works on eligible paid F12 fixtures without activation; no delivery/productivity is fabricated.
- **SC-006**: All before/at/after, DST gap/fold, leap-day/month-end fixtures return exact expected Cairo dates/instants below, independent of browser/server timezone or job delay. First-existing-instant resolution and PO day-credit rules are binding.
- **SC-007**: Every named race below yields only its specified winner/result, including constraints independent of RPC/key. Authorized exact replay returns identical receipt and zero new business/audit facts. Refund allocation orders sources by collected_on, installment sequence, then event UUID.
- **SC-008**: All disallowed role/scope/revoked/nonexistent-workspace combinations fail both walls with zero foreign existence/commission/receipt disclosure. PO paths require a real workspace; zero authenticated EXECUTE grants on internal seams and zero browser base-table grants on new tenant tables.
- **SC-009**: All injected validation/deferred-integrity/audit/overflow/authorization/deactivation/outbox/audit failures leave zero partial lifecycle/financial/receipt effects; post-commit Auth Admin failures preserve the refund and schedule an idempotent retry, with bounded error codes only in every capture point.
- **SC-010**: AT-FRZ-04: exactly one audit fact per committed freeze mutation, zero on replay. AT-KPI-03: genuine delivered productivity stays unchanged in every refund fixture. Receipts/results/common new audit omit commission for every role; the separate PO/WO reader exposes exact stored reversals.
- **SC-011**: All future rendered surfaces pass the eight-cell AR/EN × light/dark × mobile/desktop matrix/accessibility checks, exposing zero forbidden client CTA or staff financial details.
- **SC-012**: AT-EXP-01 and AT-EXP-02 integration: P4 emits exactly one notice at each 3d/1d/0d effective-expiry milestone, blocks plans/export at expiry with no grace and keeps login/settings unless PO-1 refund deactivation denies app/RPC data; the Custom Access Token hook blocks new sign-in/refresh issuance as soon as committed deactivation is visible, and the worker ban remains defense in depth. Clearing overdue alone never restores expired/refunded coverage or frozen access. F13 verifies projection inputs; no P4 consumer pass is claimed before integration.
- **SC-013**: AT-FRZ-01 integration: P5 emits zero new check-in prompts during effective freeze intervals, preserving outstanding forms under its approved resume policy. F13 verifies interval facts only; no P5 engine/consumer pass is claimed.
- **SC-014**: On Stack C, the supported Auth Admin ban returns HTTP 200 and subsequent sign-in/refresh return HTTP 400. With the worker failing, committed deactivation makes Custom Access Token hook sign-in and refresh return HTTP 403 with no token; rollback preserves sign-in; staff issuance remains allowed. Unit/integration tests prove rollback leaves no deactivation/outbox, post-commit Auth failure leaves refund committed and retryable, repeated refunds share one lockout, and the server-only worker does not expose service-role material to browser code. Existing JWT expiry is accepted.

### Cairo calendar and boundary fixtures

Boundary conversion and day-credit examples below are binding. Expected instants were checked with Node 24.19.0 / ICU 78.3 / timezone data 2026b. Pin/review zone-data changes in future verification; never hard-code these UTC offsets in implementation.

| Cairo boundary / case                             | Expected UTC instant or outcome                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-24 start, nonexistent 00:00               | 2026-04-23T22:00:00Z = first existing Apr 24 01:00 +03; one second earlier is Apr 23 23:59:59 +02.                                                                             |
| 2026-10-30 start after fall-back                  | 2026-10-29T22:00:00Z = Oct 30 00:00 +02; one second earlier is Oct 29 23:59:59 +02.                                                                                            |
| Repeated Oct 29 23:00                             | Earliest occurrence 2026-10-29T20:00:00Z (+03), later occurrence 21:00:00Z (+02); neither is Oct 30 boundary. Any ambiguous midnight resolves to earliest instant of its date. |
| 2026-11-01 start                                  | 2026-10-31T22:00:00Z.                                                                                                                                                          |
| 2026-11-04 start                                  | 2026-11-03T22:00:00Z.                                                                                                                                                          |
| Apply Nov 1, Stop Nov 3                           | Freeze [Nov 1, Nov 3), two credited days; same-day Apply/Stop Nov 1 credits Nov 1 only; Remove yields zero extension.                                                          |
| Activation Nov 1 at 23:30 Cairo, duration 30 days | Nov 1 is day 1 despite short first day; exclusive end Dec 1 = 2026-11-30T22:00:00Z.                                                                                            |
| Feb 28 2028 + two calendar days                   | Mar 1 2028: leap day included; Friday is an ordinary entitlement day, not an SLA exclusion.                                                                                    |

### Concurrency acceptance fixtures

Requests bind expected lifecycle/chain/tail revisions. All callers are permitted unless revocation is the subject; fresh intent after conflict requires deliberate confirmation. Freeze/renewal cases run under approved policy.

| Race / order                                                   | Allowed outcome and exact losing result                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same operation/key/canonical input, double submit              | Either request commits first; other returns the identical authorized committed receipt with status ok, zero extra effects/audit. Changed canonical input returns key_conflict; revoked replay returns not_permitted.                                                                                                                                                                               |
| Two partial refunds exceed the residual balance, distinct keys | Under the purchase lock, one PO session commits; if the other request exceeds the recalculated residual balance, it returns invalid_input with zero effects. PO may refresh the residual balance and deliberately submit a new partial refund while the client remains deactivated.                                                                                                                |
| Correction → refund, other active tails remain                 | Correction commits; old-preview refund returns stale_state, zero effects. Fresh refund excludes corrected original and includes all remaining active/recollected tails.                                                                                                                                                                                                                            |
| Correction → refund, no active tails remain                    | Correction commits; old-preview refund returns stale_state. Fresh zero-net monetary refund returns invalid_input with field code refund_amount, zero effects.                                                                                                                                                                                                                                      |
| Refund → correction                                            | Refund commits terminal reversals/cancellations; competing correction returns stale_state, zero effects. Exact replay of a previously committed correction returns its historic receipt only.                                                                                                                                                                                                      |
| Renewal tail competition, distinct keys                        | Either session commits one renewal at expected tail; other returns stale_state. Never auto-append a second future purchase.                                                                                                                                                                                                                                                                        |
| P4 activation → refund                                         | Activation may commit first; old-preview refund returns stale_state. Fresh eligible refund can end that purchase; real delivery/productivity remain credited.                                                                                                                                                                                                                                      |
| Refund → P4 activation                                         | Refund commits without activation; internal activation returns stale_state and rolls back activation/delivery/productivity together.                                                                                                                                                                                                                                                               |
| Revoke → receipt replay                                        | Revocation commits first; replay returns not_permitted and no receipt.                                                                                                                                                                                                                                                                                                                             |
| Replay authorization locks → revoke                            | Exact authorized replay returns identical receipt and zero new facts; revocation waits then commits; subsequent replay returns not_permitted.                                                                                                                                                                                                                                                      |
| Same actor/key, different permitted targets                    | Either binding commits; other returns key_conflict, rolls back all writes, reveals no prior receipt. Unauthorized targets return not_permitted before key/receipt lookup.                                                                                                                                                                                                                          |
| Freeze ↔ renewal, same expected entitlement revision           | Either commits first; other returns stale_state. Fresh permissible reflow adjusts only unstarted successor; historical-start conflict returns stale_state and rolls back whole adjustment.                                                                                                                                                                                                         |
| Freeze ↔ refund                                                | Either commits first; stale competitor returns stale_state. Fresh eligible refund uses current state; no freeze commits after terminal refund.                                                                                                                                                                                                                                                     |
| Collection ↔ refund                                            | Collection first makes old-preview refund stale_state; fresh refund includes new tail. Refund first makes collection stale_state; no post-cancellation collection.                                                                                                                                                                                                                                 |
| Expiry materializer ↔ freeze/renewal/refund                    | Lifecycle writer first: expected-revision materializer returns stale_state, no obsolete fact. Materializer first: it commits one fact for its observed revision; a lifecycle writer with unchanged expected revision may then commit, retaining that historical fact while deriving the new current state. No current entitlement is extended by job delay; scheduled dedup retry adds zero audit. |

## Assumptions and policy status

- F9–F11 supply approved package versions, issued agreements and isolated client identities. F12 U4 is merged and verified against `origin/main` at PR #18 / `e3a2534`; F13 reuses its integrated payment operations and does not add a parallel collection/correction writer.
- D-04/05/10/11/12/13/17 and final F12 decisions are binding, subject to later F13 PO overrides recorded above. ND-01 and ND-08 are closed by Final PO Approval; recommendations elsewhere have no runtime effect.
- P4 remains future work for the initial activation writer, plan access/export enforcement and portal notifications; F13 does not claim those deliveries. The prior renewal-activation/freeze seam is historical implementation evidence. S43-R8 supersedes its activation-row representation: renewal changes the continuous subscription and records no new activation row. Renewal service start and freeze eligibility follow their Cairo dates.
- This authorized decision-record unit updates the F13 spec, checklist and ledger architecture. Do not write `.specify/feature.json` or shared registers. Spec Debate is complete; architecture review remains pending.

## PO Decisions (2026-10-29)

**F13 — Freeze / Renewals**

- F13-1: PO/WO/Trainer/Sales can Freeze individual clients for a selected duration. No package-based limits. Record actor, duration and audit. Show STOP/REMOVE in Subscription UI.
- F13-2=A: Freeze activated subscriptions, including overdue; payment restrictions remain.
- F13-3=B: Cairo calendar-day counting; STOP day does not count as frozen.
- F13-4=A, expanded: PO/WO/Trainer/Sales can STOP/REMOVE. STOP preserves actual frozen-day extension; REMOVE reverses the freeze extension as though it never happened, without rewriting historical access. Audited.
- F13-5=A: Current approved price at renewal, purchase snapshot, no renewal before initial activation; late renewal starts on recording date.
- F13-6=A: Maximum ONE not-yet-started renewal at a time, NOT lifetime. Automatically shift future start when the current entitlement extends; reject conflicts.
- F13-7/8: External refunds are manually recorded at refund time. If multiple paid purchases exist, explicitly select the purchase being refunded.
- F13-9=A: Refund allowed for active, frozen, expired and paid-unactivated subscriptions.
- F13-10=A: During Freeze restrict plans/exports, retain login/settings.
- F13-11=CUSTOM: Renewals support the SAME existing installment workflow as initial purchases: upfront payment, installment configuration, monthly dues, overdue access restriction, payment confirmation. PO/WO/Trainer/Sales may confirm renewal installments. Do not invent a separate installment system.

**Refund decisions — supersede D-15**

- PO-only Full or Partial Refund; editable amount defaults to the refundable collected balance.
- Zero can appear while editing but MUST NOT be confirmed.
- Multiple legitimate partial refunds allowed; cumulative refunds cannot exceed actual unrefunded collections.
- Reverse commission proportionally using purchase-time snapshots, deterministic rounding, immutable append-only ledger, idempotency and concurrency safeguards.
- ANY successful refund, including partial or future-renewal refund, immediately deactivates the client and removes them from Active Clients, even if paid entitlement remains.
- Partial Refund is discretionary goodwill exit after service delivery, NOT discounted continuing access.
- Preserve necessary financial/audit history. Do not physically delete immutable ledger events.
- ALL payments, renewals, installment collections and refunds occur OUTSIDE LIFTER. LIFTER only records/attests them; NO payment gateway.

**Retention — FINAL**

- RET-1=B: 30-day clock starts when client relationship ends (Closure/Refund/Deactivation). Necessary data stays while Active. Future purge job operational requirement (not implemented in F13): (a) disable/ban the Auth user and confirm it, retaining the deactivation denial state until confirmed; (b) stop or complete pending refund lockout retries; (c) only then remove or anonymize `app_private.client_deactivation_state` and `app_private.refund_auth_lockouts` rows; (d) purge the Auth user. Their `auth_user_id` foreign keys intentionally restrict deletion in line with `client_accounts`.
- RET-2=A: Purge client-specific drafts, answers, correction content and attachments; retain reusable templates and legally required minimal audit evidence.
- RET-3=A: Maximum 30 days across ALL recoverable copies, including backups. Technical feasibility and legal exceptions require review BEFORE production. The future purge job must follow the RET-1 operational order above: confirm Auth-user disablement/ban while retaining denial state, stop or complete pending refund lockout retries, remove or anonymize the `client_deactivation_state` and `refund_auth_lockouts` rows, then purge the Auth user. This job is not implemented in F13.

### PO Decisions — Session 13 (2026-10-29)

- **PO-1=A (superseded by the 2026-10-30 policy update below):** Any Refund immediately blocks client login, revokes sessions, and preserves financial/audit records.
- **PO-2=A:** Renewal installments are anchored to recording date, unaffected by service delays or Freeze.

**Session 13 PO confirmations (binding)**

- **Freeze start day:** the day a Freeze is applied counts as frozen, not consumed service.

**F13 — Final PO APPROVAL (session 13, verbatim)**

- Freeze: 1–30 calendar days, no overlaps; sequential allowed. Start day counts, STOP day excluded.
- Purchases remain financially independent. No automatic refunds/shifts. PO-1 global deactivation applies; other purchases require manual resolution.
- Allow further partial refunds after deactivation, capped at remaining refundable balance, without reactivation.
- Refund allocation: FIFO (oldest paid installment first), deterministic tie-breaking.

**Architect notes (not PO decisions)**

- PO-1 was updated on 2026-10-30; the verbatim update appears above. Refund atomically records deactivation and Auth-lockout outbox. The token hook denies new sign-in/refresh issuance from committed deactivation; the worker applies a supported Auth ban as defense in depth. Existing JWTs may expire naturally. Financial/audit records are never deleted; RET-1 starts on refund.
- PO-2 resolves session-12 PO-CONFIRM 3d (both questions): renewal installment due dates anchor to the renewal recording date. Retain this payment fact only where compatible with S43-PO-5 continuous-subscription operations.

### Superseded by PO 2026-10-29

These are architect-flagged implementation consequences, not additional PO decisions. PO confirmation is required only where explicitly marked PO-CONFIRM.

- Superseded judgment items: D-09 freeze authority, no-new-capability, full-refund-only/terminal single reversal, and D-15.
- Capability matrix: F13-1/F13-4 give Trainer freeze/stop/remove (supersedes D-09 PO/WO/Sales); F13-11 gives Trainer renewal-installment confirmation (record_payment). Update TypeScript lib/auth/capabilities.ts and SQL app_private.role_has_capability parity after F12 (Sales approval removal) and F14 (manage_branding). F13's “no new capability” judgment is superseded.
- Refund ledger redesign: Multiple partial refunds with proportional commission reversal supersede one terminal refund_reversal per collection using F12 reverses_event_id uniqueness. The Luna High architecture pass in ledger-architecture.md defines: DB-under-lock cumulative cap (sum of refunds ≤ unrefunded collections); deterministic proportional commission rounding with cumulative remainder (total reversed commission never exceeds stored commission); F12 correction-chain interaction; idempotency; and race fixtures. Zero-amount confirmation is rejected.
- Refund deactivation: Any successful refund deactivates the client and removes them from Active Clients even with entitlement remaining. Add a lifecycle/deactivation fact and forward amendment of F12 f12_guard_client_transition; this starts RET-1's 30-day clock. **PO-1 updated 2026-10-30**: deactivation is recorded with an Auth-lockout outbox; the access-token hook blocks new issuance at commit and the worker applies a supported ban as defense in depth.
- Renewal installments reuse the existing installment workflow. **RESOLVED 2026-10-29 by PO-2** (recording-date anchor); preserve only where compatible with S43-PO-5 continuous renewal.
- F13-3=B (STOP day is not frozen) and F13-4 REMOVE reverses the extension “as though it never happened” without rewriting delivered access. If access was delivered during the freeze window, REMOVE can pull the end date below today; the spec revision must clamp so entitlement never ends before now or delivered access.
- F13-7/8: Refund date is the recording date (manual recording at refund time); explicitly select a refundable package group when multiple groups are paid; original-package and upgrade-charge purchases share one group, separate renewals remain separate. Refunding a future renewal also deactivates the client.
- Retention RET-1..3: 30 days across ALL recoverable copies, including backups. Hosted Supabase backup/PITR retention may exceed 30 days and backups may not be selectively purgeable. Technical and legal feasibility review is required BEFORE production (blocks production real data, not local/CI synthetic work). Reconcile with financial-ledger/audit retention (retain minimal legally required evidence; ledger is never physically deleted) and B4/ND-F5-1/DP-01/02.

## Open questions for PO

Only unresolved policy remains here. Former questions decided by the Session 12/13 PO records are closed and mapped below.

## Clarifications

### Session 2026-11-03 — compliance reconciliation

- **Decision register:** `docs/04-changes-and-questions.md` D-13, D-15, and D-20; S22-PO-5 is quoted in the binding source resolutions and decision traceability in this specification; final F13 decisions and retention constraints are recorded here.
- **Result:** No new ambiguity in the merged F13 product scope. ND-01 and ND-08 remain resolved as already recorded. T019's retention feasibility and B4 audit/client retention remain existing production-readiness blockers under D-20 and `docs/13-production-readiness.md`; no retention value is inferred and no new PO item is raised. T020 is not deferred: D-20 limits development/testing to local Docker and provides no hosted non-production project, so T020 remains open and is blocked by D-20; Go-Live gate F13-PB-03 (`docs/13-production-readiness.md`) remains open. No PO deferral exists for T020.
- **Evidence limit:** Static source/test inspection only. No hosted, production, or stack actions and no test suites were run in this lane.

- **ND-01 — DECIDED 2026-10-29 (Final PO APPROVAL):** Freeze duration is 1–30 calendar days; freezes do not overlap, while sequential freezes are allowed. The Apply day counts as frozen and the STOP day is excluded. This closes freeze duration and overlap policy.
- **ND-08 — DECIDED 2026-10-29 (Final PO APPROVAL):** Purchases remain financially independent. A refund never automatically refunds or shifts another purchase. PO-1 global client deactivation applies; any other-purchase resolution is manual. This closes cross-purchase refund policy.

### Decision traceability

| Decision                                           | Specification coverage                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F13-1, F13-4                                       | FR-002, FR-006, FR-008, FR-009, FR-036; selected duration, no package-based limit, roles, audit, Apply/Stop/Remove.                                                                                                                                                                   |
| F13-2, F13-3, Session 13 freeze-start confirmation | FR-006, FR-008, FR-010; overdue eligible, Apply day included, Stop day excluded, payment restrictions retained.                                                                                                                                                                       |
| F13-5, F13-6                                       | FR-003, FR-011..013 historical purchase rules are superseded where they require successor subscriptions, future service rows, one-unstarted-renewal lineage, or renewal points. Preserve price snapshots and installment recording-date facts only where compatible with FR-037..039. |
| F13-7, F13-8, F13-9                                | FR-014, FR-017, FR-018; external recording, refundable package-group selection, active/frozen/expired/paid-unactivated eligibility.                                                                                                                                                   |
| F13-10                                             | FR-028; freeze restricts plans/exports but preserves login/settings; overdue restrictions remain.                                                                                                                                                                                     |
| F13-11, PO-2                                       | FR-002, FR-010, FR-011, FR-022, FR-036; existing installment workflow and role grants; recording-date due anchor is unaffected by freeze/reflow.                                                                                                                                      |
| Refund decisions superseding D-15                  | FR-014..021, FR-023..026, FR-035; full/partial editable amount, zero denied, cumulative principal cap, proportional commission, external-only money, client exit.                                                                                                                     |
| PO-1                                               | FR-019, FR-035; atomic deactivation/outbox, Active Clients removal, supported Auth ban for sign-in/refresh, existing JWT natural expiry, RET-1 start, preserved financial/audit records.                                                                                              |
| Final PO APPROVAL (session 13)                     | FR-006, FR-008, FR-014, FR-016..019, FR-035; 1–30 day non-overlapping/sequential freezes, independent refundable package groups/manual resolution, later capped partial refunds without reactivation, FIFO allocation ordered by collected_on, installment sequence, then event UUID. |
| RET-1..3                                           | FR-019, FR-029; 30-day relationship-end clock and all-copy limit remain production blockers subject to legal/technical review.                                                                                                                                                        |

## Superseded

- D-15 full-refund-only restriction and the former single terminal reversal per collection are superseded by the Session 12 refund decisions: full or partial refunds, multiple partials up to actual unrefunded collections, and proportional cumulative commission reversal.
- D-09's PO/WO/Sales matrix is superseded for these F13 actions by F13-1/F13-4/F13-11: Trainer may freeze/stop/remove and confirm renewal installments. Existing manage_freeze and record_payment capabilities are reused; TypeScript and SQL parity is required. No capability is added.
- The former full-payment-only renewal scope is superseded by F13-11/PO-2; renewal installment dates anchor to recording date.
- The former freeze interpretation that omitted the application date is superseded by the Session 13 confirmation: Apply day is frozen, Stop day is not.
- The former assumption that refunds leave login/session state unchanged is superseded by PO-1: every successful refund immediately deactivates the client; the access-token hook blocks new sign-in/refresh issuance, the supported Auth Admin ban remains defense in depth, and existing JWTs may expire naturally.
- D-15's "no partial refunds" and traceability AT-FIN-12 are superseded; replace AT-FIN-12 with partial-cap and commission-rounding acceptance coverage.

## MVP delivery slices

1. **Full/partial refund**: F12 ledger extension, cumulative cap, deterministic commission allocation, terminal client deactivation/Auth-lockout outbox, safe readers, receipts/audit and race proof. Needs no activation; other-purchase handling remains manual.
2. **Internal Cairo entitlement projection**: date arithmetic/resolver and P4's initial activation/access contract with synthetic activation fixtures; no public initial-activation writer or real consumer claim. Renewal does not write a new activation row under architect mapping (S43-R8).
3. **Freeze Apply/Stop/Remove**: enforce decided roles/day counting/payment restrictions/access effects; decided 1–30-day duration and non-overlap/sequential policy; no P5 check-in engine.
4. **Renewal and installments**: active and expired renewal update the continuous subscription as required by FR-039; preserve the existing installment recording-date anchor only where compatible. Successor-lineage and unstarted-only reflow are superseded.
5. **Later integration/scope**: P4 initial activation writer, plan/export enforcement/resume and notices remain owned by P4/F19. F13 continuity requirements are FR-037..042; successor-row activation and lineage rules from S22-PO-5 are historical implementation behavior where incompatible with S43-PO-5. Closure is a separate feature after B4.

Initial-service access and client-facing plan/portal enforcement wait for P4 and relevant gates. Existing F13 renewal activation/freeze seams describe implementation history; current product behavior follows FR-037..042 and architect mapping (S43-R6/R7/R8).

## Dependencies and integration ordering

F12's model objects exist in its pinned branch migration; public operation/reader names below remain contract dependencies unless separately implemented there. Nothing here claims deployment or availability on main. Read/extend the landed contracts; never duplicate them.

| F12 dependency                                                                                                                          | F13 consumption / extension                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.clients`                                                                                                                        | Existing identity/workspace/approval state; preserve immutable identity and approval transitions. `f12_guard_client_transition()` blocks non-approval UPDATEs: any future F13 clients write needs a forward amendment, not guard bypass; no closure writer here.                                                                 |
| `public.subscriptions`                                                                                                                  | Immutable purchase snapshots and initial-only uniqueness; extend supported kind for linked renewals and add append-only lifecycle facts, without widening initial uniqueness or editing terms.                                                                                                                                   |
| `public.subscription_installments`                                                                                                      | Exact-total immutable amount/currency/sequence/issued offsets; separate one-per-obligation unique cancellation facts distinguish canceled from unpaid.                                                                                                                                                                           |
| `public.payment_events`                                                                                                                 | One unified ledger: add refund allocation events linked to refund aggregate and source collections; permit multiple capped refund allocations per collection without consuming F12 correction's unique `reverses_event_id`; extend value/correspondence/actor guards and readers; never interpret refund/cancellation as unpaid. |
| `public.subscription_activations`                                                                                                       | Preserve the immutable P4 initial activation writer. Historical behavior: `record_renewal` wrote a renewal activation fact under S22-PO-5. Superseded for new writes by architect mapping (S43-R8): retain only the initial activation row; renewal writes lifecycle/ledger events without a new activation row.                 |
| `app_private.registration_operations`                                                                                                   | Consume actor/key/canonical intent/receipt pattern; forward-amend kind/shape checks and financial correspondence for aggregate refunds/lifecycle operations. Preserve actor/key uniqueness across targets/operations and commission-free receipts; no independent store permitting replay collisions.                            |
| `app_private.registration_decisions`, `app_private.registration_approval_events`                                                        | Preserve approval truth and P2 REQ-P2-01 durable handoff; renewal/refund is not a second initial approval/form-assignment event.                                                                                                                                                                                                 |
| `installment_collect`, `collection_correct`                                                                                             | Extend terminal-state checks and shared serialization for refund/cancellation races; preserve sequential activation gating and correction-month behavior.                                                                                                                                                                        |
| `subscription_payment_status`, `subscription_commission`, `workspace_payment_queue`, all eligibility readers                            | Extend every refunded/canceled/future-term interpretation together; preserve PO/WO commission-reader boundary, Sales-safe amounts and commission-free receipts/results.                                                                                                                                                          |
| `registration_approve`, `registration_reject`, `registration_reconsider`, `registration_approval_queue`, `registration_approval_review` | Preserve initial-only behavior and PO/WO/PO boundaries; not alternative renewal writers.                                                                                                                                                                                                                                         |
| `client_self_status()`, internal `client_has_access()`                                                                                  | Keep pending/rejected exception approval-only and self-scoped; any lifecycle/plan entitlement extension needs separate reviewed projections and cannot treat approved as activated.                                                                                                                                              |
| Future `record_initial_subscription_activation(...)`                                                                                    | P4-only atomic plan-pair seam; add shared terminal/lifecycle serialization contract before P4 implementation. No public writer in F13.                                                                                                                                                                                           |
| `issue_flexible_registration_link`, F10 `issue_registration_link` and immutable issued version/schedule                                 | Preserve issued agreements and exact money; renewal writer snapshots current approved price/version/terms and reuses the existing installment workflow without forging registration links.                                                                                                                                       |

### Reverified F12 guards and required forward extension

Read-only inspection of [model migration at 50cc77e](https://github.com/sekiirro/LIFTER/blob/50cc77e8a0090f3baa716c3e4656b216db0983dd/supabase/migrations/20261101120000_registration_approval_model.sql) confirms the following, without applying SQL:

- Line 102's kind CHECK permits only `collection` and `correction_reversal`. Root/revision/predecessor constraints, `f12_payment_successor` and `f12_payment_reversal` constrain correction-chain branching and exact reversal of an original. Refund allocations must not consume the unique correction `reverses_event_id`; add an independent source-allocation relation and cumulative validator.
- `app_private.f12_validate_payment()` / `f12_check_payment()` enforce deferred chain alternation, exact correction amount/commission/currency/effective date and operation correspondence; `f12_guard_payment()` currently routes only correction reversals to PO-only `record_refund`. Merely adding a new kind would take the collection permission branch. The coordinated forward migration MUST explicitly recognize refund kind/actor/operation and terminal transitions, validate cumulative source/purchase-group caps, and reject every collection/correction successor after terminal refund independently of RPC/key.
- `app_private.registration_operations` currently allows approve/reject/reconsider/collect/correct, requires per-obligation event correspondence and ties `original_event_id` to correction. Its checks and receipt/result correspondence MUST be extended coherently for multi-obligation refunds and lifecycle facts, without breaking cross-target actor/key uniqueness or existing F12 receipts.
- `f12_guard_subscription()`, `f12_guard_installment()` and `f12_validate_subscription()` assume an initial issued-link purchase; subscription kind is initial-only and issued-link relations are mandatory. Renewal installment purchases need a coordinated forward extension of those guards/constraints, immutable current-offer binding, and reuse of F12 obligation/collection behavior with the PO-2 due-date anchor; do not forge registration links or copy the purchase model.
- `app_private.f12_guard_client_transition()` rejects any UPDATE except a matching in-transaction approval-state transition. F13 PO-1 requires an in-transaction deactivation path, so amend the guard and audit correspondence forward to accept only a matching refund-linked deactivation fact while retaining immutable identity/approval guarantees.
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

F13 production blockers are registered centrally as F13-PB-01 (operational refund reconciliation and restore proof), F13-PB-02 (P4 consumer and Design Gate evidence before client exposure), and F13-PB-03 (PO approval to enable the Custom Access Token hook on hosted production after non-production hosted verification; before enabling production refunds, record evidence that the production Auth hook is active and sign-in and token refresh are denied for a synthetic deactivated client). DP-06 separately tracks the RET-1/RET-3 Auth-state retention and purge dependency. All remain **Open** in **Pre-Production** except F13-PB-03, which gates **Go-Live**. The S22-PO-5 renewal activation-row representation is superseded for new writes by architect mapping (S43-R8); S43-PO-5/6 govern current continuity operations. P4 still owns initial activation and client/plan access enforcement; F13-PB-02 gates user-facing exposure until the real consumers and Design Gate are evidenced. Full refund does not require activation. No compliant go-live is implied by merging this draft.

### RET-1/RET-3 retention requirements

RET-1's 30-day relationship-end clock includes `client_deactivation_state.auth_user_id` and `refund_auth_lockouts.auth_user_id`, which intentionally use `ON DELETE RESTRICT`, consistent with `client_accounts`. The future purge job's operational order (not implemented in F13) is: (a) disable/ban the Auth user and confirm it, retaining the deactivation denial state until confirmed; (b) stop or complete pending refund lockout retries; (c) only then remove or anonymize these rows; (d) purge the Auth user. RET-3 requires technical and legal feasibility across recoverable copies, including backups, before production.

Spec Debate is complete; unresolved policy blocks only its affected slice. Unaffected slices may be planned separately; relevant PO decisions/approval and approved plan/tasks/analyze precede implementation. Future merges still require independent architect review, exact-head push and pull-request CI, current CodeRabbit approval/resolved threads and explicit PO merge approval under Constitution 1.3.0/docs/08. No PR/deployment is authorized here.

## Out of Scope

- P4 initial activation writer/atomic plan-pair delivery, productivity writer, actual client portal plan/export enforcement, overdue restriction/resume and real notification consumers. Ownership is decided; F13 supplies entitlement/overdue inputs without claiming P4 delivery.
- P5 weekly check-in freeze scheduling/resumption, outstanding-form handling, client timeline implementation, measurements and coaching changes; preserve PRD-03 without inventing P5 rules.
- P2 forms/intake/templates/assignment and REQ-P2-01 consumer; no new approval event for a renewal.
- Finance reporting, workspace share dashboards, payroll/settlement tracking, compensation/discipline automation; preserve immutable events for later reporting without building it.
- Payment-provider refunds, gateways, online checkout or payment execution: BRD-03 requires external payment and no integrated gateway. F13 records confirmation only.
- Partial installment collections, ad hoc discounts/fees, repricing old purchases, updating/deleting ledger/audit/snapshots, cross-workspace merge/transfer and YBS behavior/systems.
- PO-only closure/pseudonymization/identity release: separate feature after B4, preserving ledger/audit. No self-service renewal/payment/account-delete request, CTA, support button or helpdesk.
- Successor/future renewal subscription rows are outside the current product model; renewal installments reuse F12 only where the recording-date anchor remains compatible with the continuous subscription.
- Code, migrations, DB/Docker operations, plan.md/tasks.md, shared-file edits, PR creation and deployment in this session.

## Constitution Check

| Principle              | Draft treatment / remaining gate                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I — Isolation          | FR-001/002/023/024/030: tenant correspondence, two walls, PO global with real target, authorization before replay and after waits, foreign negative evidence.                                                             |
| II — Immutable finance | FR-003/014..022/025/026: one F12 ledger, exact integer money, append-only linked corrections/refund allocations/cancellations, cumulative caps and stored-commission allocation; policy gaps do not authorize exceptions. |
| III — PO governance    | D-10/15 plus F13 overrides: Trainer freeze/renewal rights; PO-only full/partial refunds/deletion; preserve F12 Sales approval removal and role-safe projections.                                                          |
| IV — Approved scope    | Architecture/traceability/later decisions reconciled; ND-01/ND-08 closed, no YBS defaults, fixed P4/P5/closure ownership and MVP boundaries.                                                                              |
| V - Versioning         | Preserve immutable paid price/duration snapshots while renewal and upgrade revise the continuous subscription; renewals award no productivity point under S43-PO-5.                                                       |
| VI — People decisions  | Genuine completed delivery credit preserved, no automatic discipline/payroll/settlement effects.                                                                                                                          |
| VII — Privacy          | PII-free append-only audit, safe receipt/read projections, B4/retention and hosted readiness remain blockers.                                                                                                             |
| VIII — UI              | Every proposed rendered surface explicitly gated by DESIGN.md/docs/09; no generated UI decisions or screenshots claimed.                                                                                                  |
| IX — Reliability       | All entitlement/money operations and scheduled facts deduplicate and serialize, including cross-feature races, uncertain outcomes, authoritative Cairo dates and audit rollback.                                          |
| Workflow/platform      | Spec/architecture review and slice-specific approval remain separate. Stack C was used for the supported Auth API probe and integration verification; full F13 migration work follows merged F12/F14.                     |

No constitutional exception is requested. Session 12/13 PO decisions are incorporated. ND-01 and ND-08 are closed; the Custom Access Token hook closes the new-issuance window on Stack C, and F12 U4 was merged and verified by T001. This remains a draft pending architecture review and slice-specific implementation approval; the production hook still requires the stated PO approval. Acceptance evidence is recorded in tasks.md and quickstart.md.

## S43-PO-5 decision encoding (2026-11-10)

PO source wording: all 11 S43-PO-5 lines are copied byte-exact, and S43-PO-6 lines are copied byte-exact in the Clarifications / PO-decision register below. Architect decisions remain separate and are labelled **architect mapping (S43-R6)**. S43-PO-5 is FINAL and supersedes S43-PO-3/4 where they overlap.

**architect mapping (S43-R6/R7/R8):** One continuous subscription per client; qualifying upgrades use fixed rank/duration; equal-price upgrade is free and lower-price selection is refused; active/expired renewal arithmetic, freeze gates, pre-activation upgrade, refund basis, renewal-then-upgrade credit/payment/duration, revenue, activation-row representation, points, plans, and manual dates follow FR-037..042 and SC-015..034. S43-PO-6 resolves S43-F13-MCQ-7..11; S43-PO-8 resolves the five Sol-debate product questions, recorded with byte-exact PO words and separate architect mappings below.

### Functional requirements

- **FR-037 - Continuous subscription:** Each client has exactly one continuous subscription. Upgrade and renewal mutate its existing subscription state and append immutable operation, payment/revenue, and audit facts; they never create overlapping subscriptions. Serialize concurrent requests by expected revision. Subscription state, operation receipt, payment/revenue, and audit facts commit atomically; a failed operation writes none of them. If a caller loses the response after commit, exact authorized replay returns the same receipt without extra effects; stale distinct requests fail without partial writes. Initial activation occurs once. Renewal and upgrade write their own lifecycle/ledger events and never write a new activation row. (S43-PO-5 item 1; architect mapping (S43-R8))
- **FR-038 - Upgrade eligibility, credit, term, and revenue:** Permit upgrade to a package with a higher immutable tier-offer rank at any duration, or the same rank with a longer duration. Upgrade only within the same currency; refuse a mixed-currency selection before writes and perform no conversion. Credit the full payment attributable to the package being replaced, never a prorated balance. If a renewal precedes an upgrade, including when an earlier upgrade has occurred, credit only the original package payment; exclude prior upgrade charges and separately paid renewal payments from the credit, and preserve the separately paid renewal duration and payment. Equal package price is a free upgrade; a lower package price is refused. Same-rank longer and higher-rank equal/longer upgrades start from the original subscription start, except after an expired renewal, when the renewal start date is the anchor; higher-rank shorter-duration upgrades start on the upgrade date. For any upgrade completed before activation, the upgraded term begins on activation, overriding those calendar anchors until activation occurs. An upgrade is allowed only when every existing installment is fully settled and no payment is pending or in flight. Refuse outstanding installments or pending/in-flight payments before any write. The full upgrade price difference must be collected upfront before the upgraded term activates; no upgrade installments or new installment schedule are created. Record the Platform Owner commission at the original subscription’s stored `commission_rate_bp` only on actual collection; trainers receive no commission. Preserve all existing financial history and the single continuous subscription. Reject upgrade while frozen until unfrozen and reject upgrade after expiry. (S43-PO-5 items 2, 9-10; S43-PO-6; S43-PO-8; S50-PO-3; S51-PO-1; architect mapping (S43-R10; S50-R16; S51-R7))
- **FR-039 - Renewal:** A renewal attempted before the subscription’s initial activation MUST be refused before any write and MUST NOT queue or retain the purchased duration. Once activated, for a non-frozen subscription, extend current expiry by the full purchased duration and record the full renewal price as revenue. An expired activated subscription renews from today, with expiry today plus the purchased duration. Renewal changes the existing subscription and writes a renewal lifecycle/ledger event; it writes no new activation row. Freezing extends expiry by counted frozen days. If a renewal is followed by upgrade, apply FR-038’s original-package-only credit rule and preserve the separately paid renewal duration and payment. When an upgrade follows a renewal or counted freeze extension, calculate from the effective pre-upgrade coverage boundary produced by the existing event stream, carry only the still-unconsumed renewal/freeze extension, and do not drop unused paid/credited coverage; elapsed days remain consumed. (S43-PO-5 items 1, 3-4, 8; S50-PO-3; architect mapping (S43-R8; S50-R16))
- **FR-040 - Manual edits and plans:** Only Platform Owner may manually adjust subscription dates, including after expiry; the latest adjusted dates become the effective dates for entitlement/expiry projection through the existing P4 projector; frozen or deactivated subscriptions are refused with stale_state and zero writes; each adjustment is audited and creates no revenue. Eligible new and existing clients may receive unlimited plan revisions/publications under normal permissions. Upgrade and renewal require no plan; plan publication creates no additional trainer point.
- **FR-041 - Productivity:** Award one production point per new client once. A returning client never counts as new. Upgrades, renewals, and plan publications award no additional points.
- **FR-042 - Refund basis after upgrade:** A full refund covers the full selected package payment, including upgrade charges; separate renewal payments are not automatically refunded. Partial refunds remain subject to existing collected-balance and allocation limits. (S43-PO-5 item 6; S43-PO-6)
- **FR-043 - Upgrade settlement, audit, and receipt:** S50-PO-6 replacement/repricing direction is superseded by S51-PO-1. Upgrade requires all existing installments fully settled and no pending/in-flight payment; any outstanding or pending payment causes a pre-write refusal. The full price difference is collected upfront before activation; upgrades create no installments or new schedule. Preserve all financial history and the single continuous subscription. Append one upgrade-linked audit fact with bounded non-PII identifiers, amount, and currency, representing an upgrade with no installment replacement. Commission belongs to the Platform Owner at the original subscription's stored rate and is calculated only on actual collection; trainers receive none. A successful receipt returns operation and upgrade IDs, package/version, full price difference, currency, and effective dates, and excludes commission rate and amount. A replay of a previously stored operation returns its stored receipt unchanged. The six compatibility fields resolved by S51-PO-5 are retained. Separate renewal-purchase refund selection remains open under S51-F13-MCQ-12. (S51-PO-1/S51-PO-2; architect mappings S51-R7/S51-R12)

### Given / When / Then acceptance scenarios

1. **Given** Basic 1 month was paid at EGP 750, **When** it is upgraded to Basic 3 months at EGP 1,400, **Then** the same subscription remains, the term is 3 months from original start, EGP 650 is charged and recorded as revenue, and the original EGP 750 is not recorded again. (FR-037/038; SC-015/017)
2. **Given** a higher-rank package has equal or longer duration than the current package, **When** the upgrade commits, **Then** its term begins at the original subscription start; **Given** a higher-rank package has a shorter duration, **When** the upgrade commits, **Then** its term begins on the upgrade date. (FR-038; SC-027)
3. **Given** a subscription has not activated and an eligible upgrade is purchased, **When** activation later succeeds, **Then** the upgraded duration begins on the activation date and no duration is consumed before activation. (FR-038; SC-028)
4. **Given** an eligible higher-rank package costs EGP 1,400 and the package being replaced was paid in full at EGP 750, **When** the upgrade commits, **Then** EGP 650 is the only new payment and new revenue; no remaining-day proration changes the credit. An equal-price upgrade records zero new payment/revenue, and a lower-price choice is refused with no writes. (FR-038; SC-017/020/030)
5. **Given** a selected upgraded package payment consists of the original EGP 750 and an EGP 650 upgrade charge, with a separately paid renewal, **When** the client requests a full-package refund, **Then** the refund basis covers EGP 1,400 including the upgrade charge and does not automatically refund the separate renewal payment. (FR-042; SC-031)
6. **Given** an original package payment of EGP 750 and a separately paid three-month renewal precede an upgrade to a package priced at EGP 1,400, **When** the upgrade is priced, **Then** credit is EGP 750 only, the EGP 650 additional payment is new revenue, and the renewal's paid duration and payment remain preserved. (FR-038/039; SC-024/030)
7. **Given** a subscription is renewed or upgraded after its one initial activation, **When** the lifecycle operation commits, **Then** it records its operation/ledger event without a second activation row. (FR-037/039; SC-032)
8. **Given** an active subscription has 10 days remaining, **When** a 3-month renewal is recorded, **Then** expiry extends by 3 months plus 10 remaining days and the full renewal price is recorded once. (FR-037/039; SC-016)
9. **Given** an expired subscription is renewed for 3 months, **When** the renewal commits today, **Then** service starts today and expiry is today plus 3 months; an expired upgrade request is refused. (FR-039; SC-021)
10. **Given** a subscription is frozen, **When** upgrade or renewal is attempted, **Then** each is refused without writes until unfrozen. **Given** a freeze contributes 10 counted days, **When** expiry is projected, **Then** expiry extends by 10 days. (FR-038/039; SC-022)
11. **Given** a Platform Owner adjusts dates after expiry, **When** the adjustment commits, **Then** the latest dates drive entitlement/expiry projection through the existing P4 projector, the edit is audited, and it records zero revenue; **Given** the subscription is frozen or deactivated, **When** a PO attempts an adjustment, **Then** it returns `stale_state` with zero writes; a non-PO attempt is refused. (FR-040; SC-018)
12. **Given** a client has received a new-client point and later returns after expiry, **When** they renew, upgrade, or receive another plan publication, **Then** they receive no new-client point; a genuinely new client receives exactly one point once, and eligible plans may be published without a product-imposed count limit. (FR-040/041; SC-019/026)
13. **Given** a subscription is awaiting initial activation, **When** renewal is attempted, **Then** renewal is refused before any subscription, lifecycle, payment, revenue, obligation, collection, audit, or receipt write and no duration is queued; **Given** initial activation later succeeds, **When** renewal is attempted, **Then** the active or expired rules in FR-039 apply. (FR-005/012/039; SC-033)
14. **Given** an original package was paid at EGP 750, an earlier upgrade added an EGP 650 charge, and a separate renewal was paid before another qualifying upgrade, **When** that post-renewal upgrade is priced, **Then** credit is EGP 750 only, excludes the earlier upgrade charge and renewal payment, and preserves the separate renewal duration and payment. (FR-038/039; SC-034)
15. **Given** a separately paid renewal precedes a qualifying upgrade, **When** the upgrade recalculates the term from the effective renewal state, **Then** the projected service end retains only the renewal coverage still unconsumed at upgrade time, while elapsed days stay consumed. (FR-038/039; SC-034; S50-PO-3)
16. **Given** a counted freeze extension is partially consumed before a qualifying upgrade, **When** the upgrade recalculates the term, **Then** the projected service end carries the remaining freeze extension and does not re-credit elapsed extension days. (FR-038/039; SC-034; S50-PO-3)
17. **Given** a subscription has any unsettled installment or a pending/in-flight payment, **When** an upgrade is attempted, **Then** it is refused before any subscription, upgrade, payment, commission, installment, audit, or receipt write. (FR-038, FR-043; SC-035)
18. **Given** all existing installments are fully settled and no payment is pending or in flight, **When** an eligible upgrade is confirmed, **Then** its full price difference is collected upfront before activation, no upgrade installment or new installment schedule is created, financial history and the single subscription remain intact, and one bounded upgrade audit fact is recorded; only the Platform Owner receives commission at the original stored rate when collection occurs, while trainers receive none. The successful receipt includes operation and upgrade IDs, package/version, full price difference, currency, effective dates, and compatibility fields `workspace_id`, `client_id`, `subscription_id`, `tier_rank`, `package_price_minor`, and `credit_minor`, and omits commission rate and amount. An idempotent replay of an operation stored before this receipt change returns its stored receipt unchanged. (FR-038, FR-043; SC-036; S51-PO-2/S51-PO-5)

### Supersession register

| Prior rule/location                                                                                               | Status and replacement                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Previous US3 and FR-011..013: successor renewal row, separate purchase lineage, future term, renewal productivity | Superseded by S43-PO-5 items 1, 3, 7, 8; architect mapping (S43-R6). Renewal mutates existing subscription; renewal grants no point; separately paid renewal duration remains after upgrade. |
| FR-012 and FR-025 one-unstarted-renewal-per-lineage constraints                                                   | Superseded by S43-PO-5 item 1; architect mapping (S43-R6). One continuous subscription replaces successor-lineage uniqueness.                                                                |
| S43-PO-4 upgrade and renewal formulas where they conflict                                                         | Superseded by S43-PO-5 items 2, 3, 8, 9, 10; architect mapping (S43-R6).                                                                                                                     |
| Refund limited to incremental upgrade difference                                                                  | Superseded by S43-PO-5 item 6; architect mapping (S43-R6). Full-package composition after renewal-then-upgrade is excluded unless separately selected for refund.                            |
| Returning-client point after lapse or plan-publication point                                                      | Superseded by S43-PO-5 item 7; architect mapping (S43-R6).                                                                                                                                   |

## Clarifications / PO-decision register

### S48-PO-18 / S48-R24 — upgrade commission snapshot (historical; superseded by S51-PO-1)

- PO decision source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-18.verbatim.txt`.
- PO words (byte-exact):

> Q: F13 T042 commission rate for upgrade additional payment -> A: "New package's rate (Recommended)" = Use the commission rate of the package version the client upgraded to, snapshotted on that payment.

- Historical architect mapping (S48-R24): upgrade additional payment uses the immutable commission rate on the selected upgraded-to package version; original payment snapshots and non-upgrade validation remain unchanged. This implementation mapping is superseded by S51-PO-1, which requires the original subscription's stored commission rate for upgrade collections.
- Historical status: RESOLVED at the time; superseded for current implementation by S51-PO-1. The PO quotation above remains preserved verbatim.

### S48-PO-21 / S48-R26 — F13-T042-D2 manual dates followed by upgrade (resolved)

- PO decision source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-21.verbatim.txt`.
- PO words (byte-exact):

> Q: F13 manual PO date adjustment followed by a later upgrade - which dates win? -> A: "Upgrade recalculates (Recommended)" = The upgrade computes new dates using the normal upgrade rules, starting from the manually adjusted dates as the current state. The PO can adjust again afterwards.

- Architect mapping (S48-R26): manually adjusted dates are the current effective state input; the upgrade applies normal FR-038 rules from that state and its result supersedes in projection (latest event wins); a later PO adjustment supersedes again. No refusal.
- Status: RESOLVED; T042 implementation is unblocked for this interaction. No shift range, backdating restriction, or other date policy is inferred.

### S45-PO-2 — S45-F13-MCQ-1 (resolved)

PO source: C:/Users/NEW LAP/.lifter/runs/s45-po/s45-po-2.verbatim.txt

"A: Deny until activated (Recommended)"

**architect mapping (S45-R3):** Renewal before initial activation is refused (no writes, no queued duration). After activation, FR-039 active/expired renewal rules apply. Encode in F13 FR-012/FR-039 + GWT/SC/tasks/tests; close the MCQ in the register with the PO words byte-exact.

Status: RESOLVED. FR-005/012/039, scenario 13, SC-033, and T041 encode this decision.

### S43-PO-5 item 1

S43-PO-5 (2026-11-10): 1. One continuous subscription per client.

**architect mapping (S43-R6):** One continuous subscription per client; upgrade and renewal mutate it.

### S43-PO-5 item 2

S43-PO-5 (2026-11-10): 2. Upgrade: higher tier (even shorter duration) or same tier with longer duration. Credit FULL previously paid amount, never prorate. Equal price = free; lower price = not an upgrade. Example: EGP 750 → 1,400; charge 650.

**architect mapping (S43-R6):** Higher tier qualifies at any duration, or same tier with longer duration; full paid credit, equality is free, lower price is refused; the worked example is a 650 charge.

### S43-PO-5 item 3

S43-PO-5 (2026-11-10): 3. Renewal: extend current expiry by full purchased duration; expired renewals start today. Record full renewal revenue.

**architect mapping (S43-R6):** Active renewal extends current expiry by full duration; expired renewal starts today; full renewal price is revenue.

### S43-PO-5 item 4

S43-PO-5 (2026-11-10): 4. Frozen subscriptions must be unfrozen before upgrade/renewal. Freezing extends expiry by frozen days.

**architect mapping (S43-R6):** Frozen subscriptions must be unfrozen before upgrade or renewal; counted freeze days extend expiry.

### S43-PO-5 item 5

S43-PO-5 (2026-11-10): 5. Pre-activation upgrades allowed.

**architect mapping (S43-R6):** Pre-activation upgrade is allowed.

### S43-PO-5 item 6

S43-PO-5 (2026-11-10): 6. Refund covers the full package, not just upgrade difference.

**architect mapping (S43-R6):** Refund basis is the full package, not only the upgrade difference.

### S43-PO-5 item 7

S43-PO-5 (2026-11-10): 7. Returning clients never count as new clients. Trainer points awarded once per new client, never per plan, upgrade, or renewal. Unlimited plan publishing.

**architect mapping (S43-R6):** Returning clients never count as new; award one point per new client once; no plan, upgrade, or renewal points; unlimited plan publishing.

### S43-PO-5 item 8

S43-PO-5 (2026-11-10): 8. Renewal then Upgrade: upgrade the original package while preserving separately paid renewal duration.

**architect mapping (S43-R6):** Upgrade replaces the original package and preserves separately paid renewal duration.

### S43-PO-5 item 9

S43-PO-5 (2026-11-10): 9. Higher-tier, shorter-duration upgrade starts on upgrade date, using full previously paid credit.

**architect mapping (S43-R6):** Higher-tier shorter-duration upgrade starts on upgrade date and uses full previously paid credit.

### S43-PO-5 item 10

S43-PO-5 (2026-11-10): 10. Expired subscriptions cannot upgrade; renew into the desired package instead.

**architect mapping (S43-R6):** Expired subscription upgrade is refused; renewal into the desired package is allowed.

### S43-PO-5 item 11

S43-PO-5 (2026-11-10): 11. Manual subscription edits: Platform Owner only, no revenue.

**architect mapping (S43-R6):** Only Platform Owner may edit subscription dates; manual edits create no revenue.

### S43-PO-6 resolved residuals (answers to S43-F13-MCQ-7..11)

#### Residual 1

S43-PO-6 (2026-11-10): Fixed tier hierarchy: Silver < Gold < Platinum. Workspaces can rename tiers, but their underlying rank never changes.

**architect mapping (S43-R7):** Every package has the fixed platform tier rank Silver < Gold < Platinum. Workspaces may edit display names by locale; the underlying rank cannot change.

**Given / When / Then:** Given packages have the fixed platform ranks Silver, Gold, and Platinum, when higher-tier eligibility is evaluated, then rank order controls independently of editable localized display names.

#### Residual 2

S43-PO-6 (2026-11-10): * Higher-tier upgrades with equal/longer duration count from the original subscription start. Shorter-duration upgrades start on the upgrade date.

**architect mapping (S43-R7):** Higher-tier upgrades with equal or longer duration start from the original subscription start; shorter duration starts on the upgrade date.

**Given / When / Then:** Given a higher-rank package has an equal or longer duration, when upgraded, then the replacement term uses the original subscription start; for shorter duration it uses the upgrade date.

#### Residual 3

S43-PO-6 (2026-11-10): * Pre-activation upgrades are allowed; duration starts upon activation.

**architect mapping (S43-R7):** An upgrade before activation is allowed and its duration starts when the subscription activates.

**Given / When / Then:** Given an upgrade completes before activation, when activation occurs, then the upgraded duration starts on that activation date.

#### Residual 4

S43-PO-6 (2026-11-10): * Refunds cover the full selected package payment, including upgrade charges, but don’t automatically refund separate renewals.

**architect mapping (S43-R7):** The full refund covers the selected package payment, including upgrade charges; separately paid renewals are excluded unless separately selected for refund.

**Given / When / Then:** Given a selected package payment includes an upgrade charge and a separate renewal payment exists, when a full-package refund is recorded, then it covers the selected package payment including its upgrade charge and does not automatically refund the renewal.

#### Residual 5

S43-PO-6 (2026-11-10): * After renewal then upgrade, credit only the original package’s full payment. Preserve separately purchased renewal duration and payments.

**architect mapping (S43-R7):** After renewal then upgrade, credit only the original package payment; preserve the separately paid renewal duration and payments.

**Given / When / Then:** Given an original package payment and a separately paid renewal precede an upgrade, when the upgrade is priced, then only the original package payment is credited and renewal duration/payment remain.

#### Residual 6

S43-PO-6 (2026-11-10): * Never prorate upgrade credit. Record only additional payments as new revenue.

**architect mapping (S43-R7):** Upgrade credit is never prorated and new revenue is limited to additional payments.

### S43-R9 product questions — resolved by S43-PO-8

S43-PO-6 resolves the prior S43-F13-MCQ-7..11. S43-PO-8 resolves all five Sol-debate product questions below; no open product ambiguity remains in these affected scopes and their affected tasks are unblocked. Independent technical/security gates remain separately listed.

- **S43-F9-MCQ-2 — tier structure / rank placement (replaces prior MCQ-2):** see specs/009-packages/spec.md:327-329, 340-341 and T077. What offer structure carries the fixed tiers? Options: (A) multiple ranked offers per category (Sol recommendation); (B) one fixed tier per category; (C) replace the four-category model. Implications: A allows several ranked offers in each existing market/type category; B retains one package/tier per category; C changes the four-category identity and package initialization. Recommendation before PO answer: A. Status: RESOLVED by S43-PO-8 source line 3; F9 offer/rank placement and F13 T042 rank-dependent upgrade work are unblocked.
- **S43-F9-MCQ-3 — tier-label authority:** see specs/009-packages/spec.md:328, 400 and T078. Who may edit tier labels? Options: (A) PO only; (B) WO only; (C) PO globally and WO within that WO's workspace (Sol recommendation). Implications: A centralizes edits; B permits only local workspace edits; C supports global and scoped local edits with corresponding audit/authorization rules. Recommendation before PO answer: C. Status: RESOLVED by S43-PO-8 source line 4; F9 label mutation permissions, audit actor policy, and role tests are unblocked.
- **S43-F18-MCQ-1 — historical nutrition exports:** see specs/018-nutrition-planner/contracts/nutrition-api.md:93 and specs/018-nutrition-planner/research/po-decision-matrix.md:49 (Sol-9 finding). When exporting a historical nutrition revision after its selection has been removed or invalidated, what should appear? Options: (A) that revision's last valid client selection (Sol recommendation); (B) coach original only; (C) require an explicit authorized export choice. Implications: A preserves delivered historical state and needs revision-scoped selection retention; B drops that state from the export; C adds a choice flow and authorization check. Recommendation before PO answer: A. Status: RESOLVED by S43-PO-8 source line 5; F18 historical nutrition export behavior and its acceptance/task coverage are specified in the paired F18 PR.
- **S43-F13-MCQ-12 — post-lapse upgrade anchor (historical question; resolved by S43-PO-8):** see specs/013-freeze-renewal-refunds/spec.md:461, 470, 652 and T042. After an expired renewal starts today, does a later equal/longer upgrade use (A) that restarted paid-period start (Sol recommendation) or (B) the lifetime first activation date? Implications: A anchors to the current restarted paid period; B counts time before it restarted. Recommendation before PO answer: A. Status: RESOLVED by S43-PO-8 source line 6; T042 is unblocked for the post-lapse upgrade anchor.
- **S43-F13-MCQ-13 — cross-currency upgrade (historical question; resolved by S43-PO-8):** see specs/009-packages/spec.md:312, 321, 328 and specs/013-freeze-renewal-refunds/spec.md:461, T042. May an upgrade credit one currency against a package priced in another? Options: (A) same-currency only (Sol recommendation); (B) permit cross-currency upgrades under a PO-approved conversion policy. Implications: A rejects a mixed-currency pair without writes; B requires an authoritative conversion source/date, rate, rounding, audit and revenue treatment. Recommendation before PO answer: A. Status: RESOLVED by S43-PO-8 source line 7; T042 is unblocked for same-currency eligibility and refusal before writes.

### Related-spec reconciliation

- **F9 tier inventory (read-only):** specs/009-packages defines immutable market/type and versioned price/duration, but no tier-rank field (`specs/009-packages/data-model.md:29,38-46,65-73`; `specs/009-packages/spec.md:308-312`). S43-PO-6 defines the fixed rank concept/order; S43-PO-8 resolves offer structure and rank placement on each tier offer within its category.
- **F12 initial subscription scope:** specs/012-registration-approval creates the initial subscription; F13 owns renewal and continuity reconciliation. No new F12 requirement is inferred.
- F13 old successor/one-unstarted-renewal and renewal-point clauses are marked superseded above; prior freeze-duration rules remain in force, with S43-PO-5 freeze extension and frozen-operation rules layered on top.

### Continuity success criteria

- **SC-015:** 100% of successful upgrades/renewals mutate one continuous subscription; exact authorized replay adds no writes, and stale concurrent intent fails without partial writes.
- **SC-016:** Active renewal with 10 days remaining plus 3-month term yields 3 months plus 10 days; full renewal revenue is recorded once.
- **SC-017:** EGP 750 to EGP 1,400 same-tier longer upgrade charges/records EGP 650 and sets 3 months from original start.
- **SC-018:** Only Platform Owner date edits succeed, including expired terms; the latest adjusted dates drive entitlement/expiry projection through the existing P4 projector; frozen or deactivated subscriptions return stale_state with zero writes; each edit is audited and creates zero revenue.
- **SC-019:** One point maximum per new client; returning clients and upgrade/renewal/publication add zero; plan publishing has no product-imposed limit.
- **SC-020:** Equal-price upgrade commits at zero charge/revenue; lower-price upgrade is refused with zero writes.
- **SC-021:** Expired renewal starts today; expired upgrade is refused.
- **SC-022:** Frozen upgrade/renewal are refused until unfrozen; expiry increases by counted freeze days.
- **SC-023:** Pre-activation upgrade is accepted; expired upgrade refusal requires renewal into the desired package.
- **SC-024:** Renewal-then-upgrade preserves separately paid renewal duration; credit is only the original package payment; renewal duration and payment remain preserved.
- **SC-025:** A full refund covers the full selected package payment including upgrade charges; separate renewal payments are not automatically refunded.
- **SC-026:** Returning client receives no second point after lapse; first new-client point is unique.

## Historical S43-PO-3 quote preserved

PO decisions:

Upgrade uses FULL previously paid credit, not prorated. Example: 1 month EGP 750 → 3 months EGP 1,400; charge only EGP 650. Total subscription becomes 3 months from original start; record only EGP 650 as new revenue.

Muse Spark 1.3 Contributor via OpenCode Go is approved for use, including the required training-data setting.

Show me both complete AI prompts (Workout + Nutrition), in EN/AR, for approval. Do not finalize them yet.

Update relevant specs and preserve governance gates.

**Superseded in part by S43-PO-5 item 2; architect mapping (S43-R6):** the full-prior-paid credit and upgrade price/term rules are governed by the final S43-PO-5 decisions. Non-overlapping S43-PO-3 statements are not modified by this note.

### Supersession coverage for earlier F13 prose

The supersession applies wherever older rules are repeated in this feature earlier sections; those statements are historical rationale, not current requirements. Affected text includes User Story 3 and scenarios; FR-011..013; FR-012/S22-PO-5 renewal-chain and one-unstarted-successor constraints; resolved scope decisions; Key Entities; SC-004; implementation boundaries; and concurrency fixtures referring to future renewals, renewal-of-renewal, successor coverage/start, lineage tails, or activation as a new subscription. They are superseded by S43-PO-5 items 1 through 11 and architect mapping (S43-R6). Preserve immutable payment events and recording-date installment facts only where compatible with one continuous subscription. Historical task evidence remains factual history, not current behavior.

FR-037 requires exactly one subscription per client across the product; an upgrade package must belong to that subscription workspace. This supersedes the older per-workspace interpretation under S43-PO-5 item 1 and architect mapping (S43-R6).

- **SC-027:** Same-rank longer and higher-rank equal/longer upgrades use the original start; after an expired renewal the renewal start is the anchor; higher-rank shorter duration uses the upgrade date.
- **SC-028:** Upgrade duration begins at activation for pre-activation upgrades; zero duration is consumed before activation.
- **SC-029:** Upgrade renewal-then-upgrade credit equals only the original package payment; renewal payments and duration remain unchanged.
- **SC-030:** New revenue equals additional same-currency upgrade payments only; no prorated credit or currency conversion is used, and a mixed-currency upgrade is refused before writes.
- **SC-031:** Full refund covers the selected package payment including upgrade charges; separate renewal payments are not automatically refunded.
- **SC-032:** Renewal and upgrade after initial activation create lifecycle/ledger events but zero additional activation rows.
- **SC-033:** In every awaiting-activation renewal attempt, refusal occurs with zero subscription/lifecycle/payment/revenue/obligation/collection/audit/receipt writes and zero queued duration; after activation the FR-039 active/expired rules apply.
- **SC-034:** For upgrade, renewal, then upgrade, the later upgrade credit is only the original package payment; earlier upgrade charges and separate renewal payments are excluded, renewal duration/payment remain unchanged, the projected service end preserves all unconsumed renewal/freeze extension, and additional-payment commission uses the original subscription’s stored `commission_rate_bp`.
- **SC-035:** With at least one unsettled installment or pending/in-flight payment, every upgrade attempt is refused before writes; assert zero changes to subscription, upgrade, payment, commission, installment, audit, and receipt facts. Under the existing subscription/obligation lock, revalidate payment state after lock acquisition and refuse a payment that is pending/in flight. If collected amounts exceed the remaining upgrade balance, refuse before writes. (FR-038, FR-043; S51-PO-1; architect mapping S51-R7)
- **SC-036:** When all existing installments are fully settled and no payment is pending/in flight, a successful upgrade collects the full price difference upfront before activation, creates zero new installments/schedule, preserves all prior financial rows and the single subscription, and records one upgrade-linked audit fact with bounded non-PII identifiers/amount/currency. The original subscription's stored commission rate is used only on actual collection; trainer commission is zero. The successful receipt contains operation and upgrade IDs, package/version, full price difference, currency, and effective dates, omits both commission fields, and retains `workspace_id`, `client_id`, `subscription_id`, `tier_rank`, `package_price_minor`, and `credit_minor` as compatibility fields. Retrying a pre-change stored operation returns the exact stored receipt unchanged. (FR-038, FR-043; S51-PO-1/S51-PO-2/S51-PO-5; architect mappings S51-R7/S51-R12/S51-R24)

This feature’s clarified continuity and renewal-credit questions are decided; no open product ambiguity remains in these scopes. Implementation and independent technical/security gates remain separate.

## S43 PO 5-7 exact source blocks - S43-R9 reference

These PO source blocks were copied programmatically. Older quotations above are retained; the controlling PO text appears here without edits. Architect mappings remain labelled separately.

### s43-po-5 - PO words copied byte-exact

```text
Final PO decisions — update F13/F17/F18/F19:

1. One continuous subscription per client.
2. Upgrade: higher tier (even shorter duration) or same tier with longer duration. Credit FULL previously paid amount, never prorate. Equal price = free; lower price = not an upgrade. Example: EGP 750 → 1,400; charge 650.
3. Renewal: extend current expiry by full purchased duration; expired renewals start today. Record full renewal revenue.
4. Frozen subscriptions must be unfrozen before upgrade/renewal. Freezing extends expiry by frozen days.
5. Pre-activation upgrades allowed.
6. Refund covers the full package, not just upgrade difference.
7. Returning clients never count as new clients. Trainer points awarded once per new client, never per plan, upgrade, or renewal. Unlimited plan publishing.
8. Renewal then Upgrade: upgrade the original package while preserving separately paid renewal duration.
9. Higher-tier, shorter-duration upgrade starts on upgrade date, using full previously paid credit.
10. Expired subscriptions cannot upgrade; renew into the desired package instead.
11. Manual subscription edits: Platform Owner only, no revenue.

Approve all four EN/AR AI prompt drafts, removing “certified coach” and using “كابتن” consistently in Arabic. Coach-original notes appear per item and in copied prompts, never totals.

F17: Week 1 = program days 1–7, including rest days; no calendar start required.

Reconcile conflicts without inventing rules; flag any remaining ambiguity. Complete the approved Sol Medium debate, then finalize, commit and push under existing governance gates.
```

### s43-po-6 - PO words copied byte-exact

```text
Fixed tier hierarchy: Silver < Gold < Platinum. Workspaces can rename tiers, but their underlying rank never changes.
* Higher-tier upgrades with equal/longer duration count from the original subscription start. Shorter-duration upgrades start on the upgrade date.
* Pre-activation upgrades are allowed; duration starts upon activation.
* Refunds cover the full selected package payment, including upgrade charges, but don’t automatically refund separate renewals.
* After renewal then upgrade, credit only the original package’s full payment. Preserve separately purchased renewal duration and payments.
* Never prorate upgrade credit. Record only additional payments as new revenue.
```

### s43-po-7 - PO words copied byte-exact

```text
Arabic tier names are سيلفر، جولد، بلاتينيوم.
```

## S43-PO-8 decision register — PO words and architect mapping are separate

### S43-F13-MCQ-12 — resolved

- Where: FR-038, SC-027, lifecycle contract, T042.
- Question: After an expired renewal restarts service, what anchors a later equal/longer upgrade?
- Options: A) that renewal's start date; B) lifetime first activation date.
- Implications: A anchors the term to the restarted paid period; B counts elapsed time before that period.
- Recommendation before PO answer: A.
- Status: RESOLVED by S43-PO-8 source line 6; T042 is unblocked for this case.
- PO words (byte-exact):

> 4. After expired renewal, upgrade calculations use the renewal start date.

- architect mapping (S43-R10): After an expired renewal starts today, its start date becomes the anchor for a later equal/longer upgrade.

### S43-F13-MCQ-13 — resolved

- Where: FR-038, SC-030, lifecycle contract, T042.
- Question: May an upgrade combine package payments in different currencies?
- Options: A) same currency only; B) use a conversion policy.
- Implications: A refuses a mixed-currency upgrade before writes and performs no conversion; B requires a separately approved conversion source, date, rate, rounding, audit, and revenue policy.
- Recommendation before PO answer: A.
- Status: RESOLVED by S43-PO-8 source line 7; T042 is unblocked for this case.
- PO words (byte-exact):

> 5. Upgrades require the same currency; no cross-currency conversion.

- architect mapping (S43-R10): Upgrade is permitted only when existing and selected package currencies are identical; no conversion is performed.

### S43-PO-8 acceptance scenarios

- **Given** a client has an expired subscription that is renewed today, **When** the client later makes a qualifying same-rank longer or higher-rank equal/longer upgrade, **Then** the renewal start date anchors the upgraded term. (FR-038; SC-027; architect mapping (S43-R10))
- **Given** the current and selected upgrade packages use different currencies, **When** the upgrade is requested, **Then** the system refuses before any write and performs no currency conversion. **Given** both packages use the same currency, **When** the other upgrade rules permit it, **Then** normal same-currency credit and revenue rules apply. (FR-038; SC-030; architect mapping (S43-R10))

### S48-PO-14 / S48-R22 - T043 manual date behavior (resolved)

- PO decision source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-14.verbatim.txt`.
- PO words (byte-exact):

> "No limits, dates take effect (Recommended)" = PO may set any valid dates; the new dates become the subscription's real dates (client access/expiry follow them); every edit audited. Frozen/deactivated subscriptions refused.

- Architect mapping (S48-R22): the adjusted dates are effective dates for entitlement/expiry projection and P4 consumers through the existing projector; frozen or deactivated subscriptions return `stale_state` with zero writes; audit and zero-revenue behavior remain unchanged.

### S48-PO-15 / S48-R22 - T044 point award event (resolved)

- PO decision source: `C:/Users/NEW LAP/.lifter/runs/s48-po/s48-po-15.verbatim.txt`.
- PO words (byte-exact):

> "Award 1 productivity point automatically to the assigned trainer upon the client's first normal plans delivery/activation. Manual Override Activation by PO awards ZERO points"

- Architect mapping (S48-R22): award in the existing first normal activation/plan-delivery write path, in the same transaction, to the client's assigned trainer; manual PO override, returning-client, upgrade, renewal, and publication paths award zero. If plans delivery and activation are distinct events in code, stop for a PO decision; do not guess.

No open product ambiguities remain for the T043 policy or T044 award event/role. T044 implementation still depends on locating the existing award path and assigned-trainer representation; any missing product rule remains escalated.

## S50-PO-3 decisions — 2026-11-12 (S50-R16 mapping)

Authority file: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-3.verbatim.txt`; SHA-256 `f28b988b20887af69f691ef9de205592be34f90fdd51554c19c850d5603d3354` (verified).

PO words copied byte-exact:

```text
PDN-S50-MIG-1 A
F13 MCQ-4 A
MCQ-1 c
```

- `F13 MCQ-4 A` resolves upgrade additional-payment commission to the original subscription's stored `commission_rate_bp`; do not use the selected package version's rate.
- `MCQ-1 c` resolves upgrade recalculation to preserve the effective pre-upgrade coverage boundary and carry only unconsumed renewal/freeze extension from the existing event stream; elapsed days remain consumed and unused paid/credited coverage is not dropped.
- `PDN-S50-MIG-1 A` resolves the migration timestamp policy: rename PR-added migrations at/below main's newest version to valid non-future timestamps after it, preserve order, and update references.

Architect mapping is S50-R16, not PO wording. **No open product ambiguities remain for these T041/T042 rules.** T044 remains deferred to P4 and unticked; FR-041 remains partial.

### S50-PO-6 / S50-R32 — upgrade installment replacement (historical; superseded by S51-PO-1)

PO source: `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-6.verbatim.txt`; SHA-256 `c62cd198a022efb057517b6d99d258dab7743bb7a9ea259de4e672e364689888`.

PO words (byte-exact):

> F13=C

S51 decision record: `C:/Users/NEW LAP/.lifter/runs/s51-arch/pdn-s50-f13-t042-01.txt`; SHA-256 `409DD26AE4D037E6F8E69366EE795DD60F061A633812E1853E11E2CDF662BCAA`; its option C identifies the already-recorded PO answer. Architect mapping S50-R32 is recorded separately in `C:/Users/NEW LAP/.lifter/runs/s50-arch/s50-architect-rulings.md`. PO decision: unpaid original-plan installments after upgrade are replaced/repriced. The PO decision does not resolve the details below.

This policy direction and its MCQ-1..8 dispositions are historical. S51-PO-1 supersedes the replace/reprice behavior. Do not use the old recommendations/options as current requirements.

#### PO-DECISION-NEEDED

**S51-F13-MCQ-1 — Which original-plan installments are eligible for replacement/repricing?**

- A. Every obligation with any outstanding balance, including partially paid and overdue obligations; fully settled obligations are excluded. _(Recommendation: A, because it applies the decision consistently to the unpaid balance while preserving settled facts.)_
- B. Only obligations with zero collected amount; partially paid obligations keep their original outstanding balance, and overdue status does not exclude an otherwise fully unpaid obligation.
- C. Only not-yet-due obligations with zero collected amount; overdue and partially paid obligations retain their original schedule.
- Implications: A changes all outstanding original-plan obligations; B can leave old and replacement schedules coexisting for one purchase; C leaves delinquent obligations under the original terms. This controls which rows T048 may replace.

**S51-F13-MCQ-2 — What is the repricing basis?**

- A. Reprice remaining eligible obligations to the replacement plan's full configured price less amounts already collected against the replaced plan. _(Recommendation: A, with collected amounts preserved and not charged again.)_
- B. Reprice only the value attributable to the unconsumed coverage period, using a PO-approved pro-rata calculation.
- C. Preserve the aggregate unpaid amount and redistribute it over the replacement schedule without changing the amount due.
- Implications: A can increase or decrease the remaining balance based on plan price; B introduces time-based credit arithmetic; C changes timing only. The selected method determines obligation principal and reconciliation.

**S51-F13-MCQ-3 — Which due-date schedule applies to replacement obligations?**

- A. Retain each eligible original installment's due date and replace only its amount.
- B. Set new dates from the upgrade recording date using the replacement plan's configured offsets.
- C. Use the replacement plan's configured schedule anchored to its ordinary purchase/activation date rule.
- Implications: A preserves existing delinquency timing; B restarts the schedule at upgrade; C may leave an activation-relative schedule anchor. This determines overdue status, reminders, and when collection is allowed.

**S51-F13-MCQ-4 — What should the operation receipt show?**

- A. Return the replacement installment schedule and identify which original obligations it supersedes. _(Recommendation: A, so the successful upgrade receipt describes its resulting obligations.)_
- B. Return only the upgrade payment receipt; expose the replacement schedule through the existing schedule reader.
- C. Return both old and replacement schedule references, with old obligations explicitly marked superseded.
- Implications: A makes the operation receipt a schedule snapshot; B keeps schedule details in a separate read; C exposes lineage in the receipt. Existing issued receipts must remain unchanged under every option.

**S51-F13-MCQ-5 — How do commissions relate to replaced installments?**

- A. Do not accrue commission on unpaid obligations; calculate commission from the stored rate when each replacement obligation is collected. _(Recommendation: A, consistent with collection-based earned commission.)_
- B. Snapshot a commission rate on each replacement obligation at upgrade time, then calculate commission when collected.
- C. Carry forward the original installment's commission snapshot onto its replacement obligation.
- Implications: A ties rate selection to the chosen replacement plan/upgrade rule; B freezes the rate at upgrade; C preserves original schedule economics. This determines future earnings without rewriting past commission facts.

**S51-F13-MCQ-6 — What audit facts should be recorded?**

- A. Append one upgrade-linked audit fact with superseded/replacement obligation IDs, old/new amounts, due dates, and currency. _(Recommendation: A, with bounded non-PII identifiers and amounts.)_
- B. Append one audit fact with the upgrade ID and counts of superseded/replacement obligations, without amounts or dates.
- C. Append a separate audit fact per superseded/replacement pair with old/new amounts and due dates.
- Implications: A is a compact aggregate audit; B minimizes financial detail but weakens reconstruction; C gives pair-level detail and increases audit row volume. This does not authorize PII or free text in audit.

**S51-F13-MCQ-7 — How should upgrade serialize with an in-flight installment payment?**

- A. Serialize both under the existing subscription/obligation lock; whichever commits first determines the state revalidated by the second operation. _(Recommendation: A, preserving atomicity and avoiding duplicate collection.)_
- B. Refuse the upgrade with stale_state while a payment is in flight; retry after its outcome is known.
- C. Refuse/void the in-flight payment when the upgrade commits, then replace its obligation.
- Implications: A requires post-lock validation and deterministic ordering; B can delay upgrades during a provider workflow; C requires external-payment cancellation semantics. The system records external payment outcomes only and does not itself execute payments.

**S51-F13-MCQ-8 — What happens if collected amounts exceed the repriced replacement balance?**

- A. Preserve the excess as an account credit applied to a later eligible obligation. _(Recommendation: A only if PO approves an account-credit ledger; this creates a new balance concept.)_
- B. Record the excess as refundable and require an explicit PO refund operation; do not create a credit.
- C. Reject the upgrade before writes unless collected amounts are no greater than the replacement balance.
- Implications: A requires credit balance ownership/expiry/use rules; B relies on existing refund authorization and external execution; C can prevent an otherwise eligible upgrade. This also determines receipt and ledger treatment for excess collections.

These MCQs and recommendations are retained as historical S51-PO-6 follow-up. S51-PO-1 below supersedes the policy; only its new receipt MCQ remains open.

### S51-PO-1 / S51-R7 — settled-only upgrades (resolved; supersedes S50-PO-6 F13=C)

PO source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-1.verbatim.txt`; SHA-256 `3800b4dac13b8b17e5b72f83ea46d21a0e9e652c513ab2dfd4ef70d9ca751e7a`.

PO words (byte-exact F13 clauses):

> F13: Upgrades require all existing installments fully settled AND the full upgrade difference paid upfront before activation. No upgrade installments. Reject upgrades with outstanding or pending payments. Supersede conflicting #88 specs/contracts/tests; preserve financial history and the single continuous subscription. Reassess remaining MCQs under this rule without inventing decisions.
>
> Commission: Platform Owner commission at the original subscription's STORED commission_rate_bp (never a fixed 10%), calculated only on actual collection; trainers receive no commission. F13 audit must represent an upgrade with no replacement of outstanding installments. F13 previously approved: upgrade only after all old installments are fully settled, full upgrade price difference paid upfront, no new installment schedule, and Platform Owner commission at the original subscription's STORED rate (not a fixed 10%), calculated only on actual collection; trainers receive no commission. F13 audit must represent an upgrade with no replacement of outstanding installments.

S51-PO-1 supersedes the S50-PO-6 answer `F13=C` (source `C:/Users/NEW LAP/.lifter/runs/s50-po/s50-po-6.verbatim.txt`, SHA-256 `c62cd198a022efb057517b6d99d258dab7743bb7a9ea259de4e672e364689888`). The older PO source remains unchanged. Architect mapping S51-R7 is separately recorded at `C:/Users/NEW LAP/.lifter/runs/s51-arch/s51-architect-rulings.md` and is not PO wording.

- MCQ-1..3 (eligible states, repricing formula, due-date schedule): **NOT APPLICABLE / superseded** because no installment can be replaced/repriced or newly scheduled; successful upgrades require all existing installments settled and create no installment schedule.
- MCQ-4 (receipt): **RESOLVED by S51-PO-2 as 9A/10B** below; the six existing compatibility fields outside the approved list are retained under S51-PO-5 / S51-F13-MCQ-11.
- MCQ-5 (commission): **RESOLVED by S51-PO-1**; Platform Owner only, original subscription stored `commission_rate_bp`, actual collections only, trainers receive none.
- MCQ-6=A (audit): **RESOLVED / adapted by S51-PO-1**; append one upgrade-linked audit fact with bounded non-PII IDs/amount/currency; no superseded/replacement IDs exist.
- MCQ-7=A (concurrency): **RESOLVED by S51-PO-1**; serialize with existing subscription/obligation lock, revalidate after lock, reject any pending/in-flight payment then found.
- MCQ-8=C (overpayment): **RESOLVED by S51-PO-1**; guard and reject before writes if collected amounts exceed remaining balance (expected unreachable).

**S51-F13-MCQ-9 — Which non-commission fields should the successful upgrade receipt expose? RESOLVED: 9A by S51-PO-2.**

- A. Return operation and upgrade IDs, package/version, full price difference, currency, and effective dates. _(Recommendation: A; it gives the caller the resulting purchase and coverage summary.)_
- B. Return operation and upgrade IDs, full price difference, and currency; obtain package/version and dates from existing authorized reads.
- C. Return only operation/upgrade IDs and status; obtain package, amount, currency, and dates from existing authorized reads.
- Implications: A returns a complete transaction summary; B requires a follow-up for package/coverage details; C keeps the receipt minimal and requires follow-up reads for all purchase details. S51-PO-2 selects A. The six existing compatibility fields outside this approved list are retained under S51-PO-5.

**S51-F13-MCQ-10 — Should the successful upgrade receipt include the Platform Owner commission rate and amount? RESOLVED: 10B by S51-PO-2.**

- A. Retain the current `commission_rate_bp` and `commission_minor` receipt fields. _(Recommendation: A; it preserves the current receipt behavior.)_
- B. Omit both commission fields from the successful upgrade receipt.
- Implications: A preserves the existing response shape and exposes the actual stored rate and collected commission amount; B reduces commission detail in the response but changes the existing receipt shape. S51-PO-2 selects B. Commission remains calculated and stored on the upgrade row as specified by S51-PO-1.

**S51-F13-MCQ-11 — What is the disposition of existing successful-receipt fields not covered by 9A? RESOLVED: B by S51-PO-5.** Retain `workspace_id`, `client_id`, `subscription_id`, `tier_rank`, `package_price_minor`, and `credit_minor` in successful upgrade receipts as compatibility fields. This specifies the six existing fields only; it does not authorize additional receipt fields.

**S51-PO-2 decision record (verbatim):** “Approve F13 receipt decisions: 9A 10B.” Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-2.verbatim.txt`; SHA-256 `cda1f389106feff2ca7a854efe102c1283e33208182b0f06dbd1e33838f61880`. 9A: a successful upgrade receipt returns operation and upgrade IDs, package/version, full price difference, currency, and effective dates. 10B: omit `commission_rate_bp` and `commission_minor` from the receipt; commission remains calculated/stored on the upgrade row per S51-PO-1.

**S51-PO-5 decision record (verbatim):**

```text
F13 11 b 
merge #91 at 700819c2e4b7c4f5f25fd780c4afbc0e2b4a020d
```

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-5.verbatim.txt`; SHA-256 `ccfe05c2e10d36f3a77ebcd6a69e9645721facc5ce176df79468c88c41575eee`. Decision: retain all six existing compatibility fields listed in MCQ-11.

**No open ambiguities:** the successful upgrade receipt fields, commission omission, compatibility fields, and exact replay of previously stored receipts are decided. Residual F13 refund selection question S51-F13-MCQ-12 is recorded below and blocks only separate renewal-purchase refund selection.

**S51-F13-MCQ-12 — May a refund request select a separately paid renewal by `renewal_id`? OPEN / PO-DECISION-NEEDED.** FR-042 states that separate renewal payments are not automatically refunded, but it does not say whether a platform owner may independently select those payments for refund. A. Add an explicit renewal-selection path; implications: separately paid renewals become independently selectable refund purchases. B. Keep F13 refund selection limited to the original package and upgrade charges; implications: renewals remain outside the selectable F13 refund basis. Recommendation: B pending an explicit PO rule because FR-042 does not authorize a new selection path. Blocked: implementation of independent renewal-purchase refund selection only.
