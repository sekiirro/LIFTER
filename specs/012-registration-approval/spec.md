# Feature Specification: F12 — Registration approval and payment recording

**Feature Branch**: `012-registration-approval`

**Created**: 2026-10-28

**Status**: FINAL PO policy reconciled 2026-10-29 with the 2026-10-28 decisions. Plan/tasks are proposed artifacts; implementation approval remains separate. S40 round 3 (2026-11-09, S40-PO-13 and S40-R19): cross-references only (FR-022 distribution trigger, out-of-scope deletion boundary, deleted-client edge case); no F12 decision changed. S41 round 4 (2026-11-09, S41-PO-1..3, S41-R4): cross-reference only (FR-022 delayed-job no-op for a Platform Owner override); no F12 decision changed. S41 round 7 (2026-11-09/10, S41-PO-11): cross-reference only (the FR-022 delayed-job no-op excludes the trainer-deletion reassignment of 011 FR-028 (h)); no F12 decision changed.

**Input**: F12 registration approval, rejection, initial subscription snapshot, installment obligations, and confirmed payment recording, based on F11 client accounts and F10 issued registration-link snapshots.

**Sources**: [Spec debate r1](research/spec-debate-r1.md) (architect v0, Sol Medium critique round 1, and architect response r1); [Constitution v1.2.1](../../.specify/memory/constitution.md); [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) BRD-03/04, PRD-02/07/14, DR-01/02; [decision register](../../docs/04-changes-and-questions.md) D-08..D-17; [F9 package spec](../009-packages/spec.md) and [data model](../009-packages/data-model.md); [F10 registration-link spec](../010-registration-links/spec.md) and [data model](../010-registration-links/data-model.md); [F11 client-account spec](../011-client-accounts/spec.md) and [data model](../011-client-accounts/data-model.md).

## User Scenarios & Testing

### User Story 1 — Review and approve a pending registration (Priority: P1)

A workspace PO or WO reviews a client who completed F11 signup, collects the first full installment at approval and approves the registration. Approval binds the subscription to the immutable terms issued through F10 and records the required audit evidence. The client's authorization state becomes current without requiring a new sign-in.

**Why this priority**: Approval is the handoff that completes the signup journey (PRD-14 Journey A) and unlocks client status access. F11 deliberately leaves clients pending with no access until this F12 action.

**Independent Test**: With one pending-approval F11 client and an authorized approver, perform the approved verification and approval flow; confirm one terminal approval outcome, the issued snapshot binding, safe audit evidence, and the live client status behavior.

**Acceptance Scenarios**:

1. **Given** a pending-approval client with an intact F10-issued workspace/offer/version binding and the required externally confirmed payment, **When** an authorized PO or WO approves, **Then** the client becomes approved and one initial subscription is created from the issued snapshot; the first full installment is recorded as collected at approval, with amount, collection date, responsible staff, and audit metadata.
2. **Given** a pending client whose offer was later disabled, link expired or consumed, or a newer version was published, **When** the authorized approver completes approval, **Then** the committed client-to-link-to-version binding is honored and the issued terms are not replaced or invalidated.
3. **Given** missing, inconsistent, or cross-workspace snapshot relations, **When** approval is attempted, **Then** no partial approval, subscription, obligation, collection, or success audit event is committed, and the response does not disclose foreign records.
4. **Given** approval commits while the client has an already-open pending page, **When** that page refreshes or polls, **Then** it reflects the approved state without requiring the client to sign in again.

### User Story 2 — Reject an ineligible pending registration (Priority: P1)

An authorized staff member rejects a pending registration when it should not proceed. The rejection is an auditable decision with PO-only reconsideration and does not create subscription or collection history.

**Why this priority**: The workflow needs a safe resolution for registrations that cannot be approved, while maintaining the F11 no-access boundary and preventing an ambiguous pending queue.

**Independent Test**: Reject a pending registration as a permitted actor and verify its state and audit outcome, then verify that no subscription or payment event exists and client access remains denied.

**Acceptance Scenarios**:

1. **Given** a pending client and a PO or WO using the single rejection code `registration_rejected`, **When** rejection is recorded, **Then** the client becomes rejected, the decision is audited without free-text PII, and no subscription, obligation, or payment event is created.
2. **Given** an already approved or rejected client, **When** another approve or reject action is attempted, **Then** the state is not changed and no duplicate transition audit is emitted.
3. **Given** a rejected client, **When** the client attempts to use protected client resources, **Then** access remains denied. Only the PO may reconsider a rejected client by changing rejected to approved; this transition is fully audited. Identity release and recovery behavior remain outside F12.

### User Story 3 — Record a later confirmed installment (Priority: P1)

An authorized staff member records a later external installment after confirming that the money was collected. The entry names its expected installment, captures the collection date separately from the recording time, and creates immutable financial history.

**Why this priority**: Installment payment confirmation drives earned commission and the collection month under D-13. An unpaid amount must not appear collected or earn commission.

**Independent Test**: On an approved subscription with a due/unpaid installment, record its externally confirmed amount for an explicit installment sequence and verify the event, derived paid state, snapshot currency, collection month, and audit evidence.

**Acceptance Scenarios**:

1. **Given** an authorized actor with `record_payment` for the target workspace and an unpaid obligation, **When** the actor records the exact confirmed amount against its explicit installment sequence, **Then** one collection event is appended with the snapshot currency, Cairo collection date, separate recording timestamp, and stored commission amount; the obligation is treated as paid from that linked event.
2. **Given** a caller names an unknown, already-paid, wrong-sequence, wrong-workspace, or wrong-amount obligation, **When** collection is attempted, **Then** no financial event or paid-state change occurs.
3. **Given** a collection is replayed with the same operation key and the same canonical request, **When** the actor remains authorized, **Then** the identical prior receipt is returned and no second event or audit entry is created.
4. **Given** a previously used key is reused with different arguments, **When** the request is submitted, **Then** it fails without disclosing protected state or creating an event.

### User Story 4 — Correct a recorded collection (Priority: P1)

A PO corrects an erroneous collection by appending a reversal that references the original collection, reverses its exact stored amount and commission, and restores the obligation to unpaid. The original event remains unchanged.

**Why this priority**: Financial corrections must preserve an auditable immutable history and must be available before real financial use.

**Independent Test**: Reverse a collected installment as a PO, verify exact amount/commission reversal, unpaid obligation state, immutable original, audit record, and idempotent replay; verify Sales and WO are denied.

**Acceptance Scenarios**:

1. **Given** an active collection and an authorized PO, **When** the PO submits a correction reversal, **Then** one append-only reversal references the original, reverses its exact stored amount and commission, marks the obligation unpaid, and records audit evidence without updating or deleting the original.
2. **Given** the same reversal operation is retried with the same operation key and arguments, **When** it is re-authorized, **Then** the identical receipt is returned without a duplicate reversal or audit event.
3. **Given** a Sales or WO actor, **When** they attempt to reverse a collection, **Then** the request is denied and no financial or audit event is created. Partial reversal is unsupported.
4. **Given** a deleted client whose F12/F13 rows are preserved, **When** the PO submits a correction reversal on an unreversed collection recorded before deletion, **Then** one append-only reversal references the original, reverses its exact stored amount and commission, leaves the original unchanged, and creates no new collection, charge or obligation for that client (FR-014; S47-PO-12).

### User Story 5 — See approval take effect without re-login (Priority: P1)

A client who signed in while pending can learn that approval has taken effect through a narrow current-status view, while receiving no access to unrelated client or staff data.

**Why this priority**: BRD-04.4 requires current approval visibility without relying on stale sign-in claims; F11's pending client has no protected access.

**Independent Test**: Keep a pending client's session open, approve the account as an authorized staff member, then refresh the client status surface and verify the current status and unchanged data boundaries.

**Acceptance Scenarios**:

1. **Given** a pending client session, **When** status is checked, **Then** only that client's narrow approval status is returned and all other protected resources remain denied.
2. **Given** that same session after an authorized approval commits, **When** the status is refreshed or polled, **Then** approved status becomes visible without re-login.
3. **Given** a client from another workspace, a forged client identifier, or an unauthenticated caller, **When** status is requested, **Then** the request is denied without revealing another client's existence or status.
4. **Given** the standalone pending page is visible, **When** bounded automatic status requests detect approval, **Then** the Auth/self mapping is rechecked and navigation uses an actually existing authorized route, without implying activation or plan availability.
5. **Given** the page is hidden/offline, its automatic budget is exhausted, Auth expires or redirect fails, **When** the state is presented, **Then** automatic work stops/pauses safely and authenticated Manual Refresh/manual-navigation recovery remains available; no Realtime or unbounded retry is required.
6. **Given** a directly opened Approved or Rejected state, **When** rendered, **Then** its standalone state remains understandable, uses existing semantic tokens, and exposes no fabricated plan/intake route or staff-only data.

### User Story 6 — Preserve tenant isolation and deny unapproved roles (Priority: P1)

Staff may act only within their authorized scope and capability. Client status access is self-only. Unauthorized, foreign, revoked, or nonexistent targets do not reveal protected existence or financial details.

**Why this priority**: Strict workspace isolation and least privilege are constitutional requirements for all financial and client surfaces.

**Independent Test**: Exercise permitted and denied role/scope combinations for approval, rejection, payment recording, status projection, commission visibility, and audit visibility; verify the same denials at the application and database authorization boundaries.

**Acceptance Scenarios**:

1. **Given** a Sales actor attempting approval or rejection, **When** the operation is requested, **Then** it is denied under ND-F11-6a; Sales has no `approve_registration` capability and may record payments only.
2. **Given** a PO or WO with access to workspace A, **When** they target a client or obligation in workspace B or a revoked membership, **Then** the request is denied without data or existence disclosure.
3. **Given** a Sales user allowed to see payment totals, **When** payment data is presented, **Then** amounts due and collected may be shown but commission amounts and rates are not disclosed.
4. **Given** a Trainer, anonymous caller, or client attempting staff approval/payment operations, **When** the operation is requested, **Then** it is denied.
5. **Given** an authorized PO or WO, **When** commission or relevant audit information is requested, **Then** only data in the actor's approved platform/workspace scope is returned.

### User Story 7 — Keep concurrent actions and retries financially safe (Priority: P1)

Concurrent approval/rejection and collection/replay attempts produce one valid outcome per target, preserve immutable financial history, and do not leak state through retries.

**Why this priority**: Approval and collection change access and financial records. PRD-13 requires safe idempotency, and the constitution requires transaction-safe operations under concurrency.

**Independent Test**: Submit competing approve/reject requests and simultaneous collection requests for one obligation, including response-loss retries and mismatched-key reuse; verify at most one state transition and active collection per obligation.

**Acceptance Scenarios**:

1. **Given** simultaneous approve and reject requests for one pending client, **When** both complete, **Then** exactly one terminal outcome commits; the loser receives a safe stale-state response and creates no duplicate audit or financial effect.
2. **Given** simultaneous collection requests for one obligation, **When** both complete, **Then** at most one collection is recorded for that obligation regardless of operation-key choice.
3. **Given** authorization is revoked while a request waits for the target's serialization point, **When** the request resumes, **Then** authorization is checked again and the revoked actor is denied.
4. **Given** audit recording fails, **When** an approval, rejection, or collection transaction completes, **Then** the business change rolls back with the audit failure.
5. **Given** an exact retry after a lost response, **When** it is re-authorized and replayed, **Then** it returns the identical receipt without a second financial or audit event.

### User Story 8 - Configure flexible payment terms on link creation (Priority: P1)

Authorized PO/WO/Sales configure the upfront amount, total payment count, individual exact amounts and timing when issuing the F10 link. Terms become immutable at issuance and are honored at approval/activation.

**Why this priority**: Final CUSTOM F12-3 makes agreement configuration part of F12's financial contract; historic agreements must survive the extension.

**Independent Test**: With a synthetic priced offer, issue a default upfront/remainder agreement and a custom multi-payment agreement, then compare immutable issued rows and exact totals through approval and synthetic activation projection.

**Acceptance Scenarios**:

1. **Given** a chosen upfront below the price, **When** the default split is constructed and confirmed, **Then** upfront is collected at approval and the exact remainder is due 30 Cairo calendar days after activation, through day-end; the amounts total the price.
2. **Given** custom positive amounts and ordered offsets or an already-issued agreement, **When** the extension is applied or approval proceeds, **Then** every issued amount/offset stays unchanged; installment n>=2 uses Cairo activation date plus its own issued offset, including a non-30 second offset.
3. **Given** mismatched upfront/count/rows/total, a Trainer attempting to configure terms, or foreign scope, **When** issuance is requested, **Then** independent app/database checks reject it without a partial agreement or success audit; existing permitted full-payment issuance remains available.
4. **Given** activation and the earliest unpaid obligation, **When** its full collection is confirmed before its due date, **Then** early sequential collection succeeds; without activation or with an earlier unpaid obligation, later collection is denied.

### Edge Cases

- F10 link expiry/consumption, offer disablement, or a newer package version after signup must not replace a committed client-to-link-to-version snapshot.
- An absent or malformed snapshot relation, mixed workspace relation, or mismatched currency/amount aborts the operation without partial state or foreign-record disclosure.
- Approval and rejection races, retries after uncertain responses, duplicate keys with changed arguments, and revoked access while waiting must preserve authorization and one-outcome guarantees.
- Duplicate collection attempts against one obligation are rejected even when they use different operation keys; replay does not create another audit event.
- Integer minor-unit amounts beyond JavaScript's exact integer range, calculation overflow, and commission rounding ties must retain exactness; money is not transported or calculated through imprecise JavaScript `number` values.
- Cairo collection date is distinct from server recording time. Any historical date is allowed; future dates are prohibited. Corrections use the PO-only append-only reversal defined in F12; this capability must be operational before real financial use.
- A partial amount is rejected; payment method and free-text reference fields do not exist. F10 due-date offsets for installments 2+ begin only at activation; due dates do not exist before activation.
- Rejection never grants client access or creates a subscription/payment event. Only PO may reconsider rejected to approved; recovery and identity/link release remain outside F12.
- UI screens and components must cover loading, empty, error, and success states and satisfy the Frontend Design Gate and DESIGN.md in both Arabic RTL and English LTR.
- A client in deletion-pending or deleted state (011 FR-018, S40-PO-13) is not pending-approval: a new approve, reject or registration_reconsider request is refused with the stale-state response of FR-017 (the surface contract's `stale_state` shape, whose expected client state includes the F11 deletion lifecycle), and no subscription, obligation or payment is created for it. The check MUST read the F11 deletion state explicitly (forward-only, 011 FR-018) under the client lock used by the operation, for all three operations (approve, reject and registration_reconsider), after an authorised receipt replay is checked. Because the guarded release keeps `approval_state` unchanged, a deleted rejected client still carries `approval_state = 'rejected'`; it MUST NOT be reconsidered into a subscription or payment. An exact authorised replay of an approve, reject or registration_reconsider that already has a receipt returns that identical receipt under FR-011 and changes nothing; the replay is re-authorised before any receipt is disclosed (S41 CodeRabbit findings on this line; tests in tasks.md T055). The 011 forward-only operation changes that enforce this check are owned by 011 T048. The 011 deletion release requires both 012 T042 (remaining U9 integrated coverage) and 012 T055 (deletion-state replay and reconsideration coverage outside U9) to pass on the current head before it ships (S41 round 7 CodeRabbit finding 3). After deletion completes, that client's preserved F12/F13 rows remain correctable: the PO may record the append-only correction or reversal of FR-014 on them, and no new collection, charge or obligation may be created for the client (S47-PO-12: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-12.verbatim.txt`, sha256 `dfe79286a9ac79a1c33632ef414692a37d2e91100dd11955b5de41827ef19449` — "Corrections only (Rec.)"; GOV1F-MCQ-2 = A; tests in tasks.md T055).

## Requirements

### Functional Requirements

- **FR-001**: F12 MUST allow only the workspace PO and WO to approve or reject a pending-approval client, applying ND-F11-6a and current workspace authorization. The capability matrix removes `approve_registration` from Sales; Sales may record payments but cannot approve or reject.
- **FR-002**: Approval MUST use the client’s committed F10 registration-link and package-version binding. Link expiry/consumption, later offer disablement, or newer versions MUST NOT rewrite or invalidate that binding. Broken or cross-workspace relations MUST fail closed.
- **FR-003**: Approval MUST create the initial subscription snapshot and installment obligations from the issued terms, with one initial subscription per client under the initial-subscription scope. Renewal behavior remains F13. Subscription price, currency, duration, commission rate, and schedule remain immutable snapshots.
- **FR-004**: External payment confirmation MUST precede any record represented as collected. Only a confirmed collection may earn commission, at its purchase-time rate and attributed to its collection month in Africa/Cairo. Unpaid balances earn no commission. The first full installment is collected at approval; partial payments are prohibited. The default remainder is due 30 Cairo calendar days after activation; all issued custom offsets are preserved. Later installments are payable only after activation, sequentially, with early payment allowed. Activation occurs after both initial workout and nutrition plans are delivered, via independent delivery records that may land on different days (P4). F10 day offsets for installments 2 and later are anchored to activation and have no due date until activation exists.
- **FR-005**: Installment obligations MUST be immutable. Payment history MUST be an append-only unified event ledger supporting collection and reversal events that reference originals. A PO-only correction reversal in F12 MUST reverse the original event exact stored amount and commission, restore the obligation to unpaid, and leave the original unchanged. Paid status is derived from unreversed collection events; no mutable paid-event pointer is authoritative.
- **FR-006**: Every tenant-owned F12 record and relationship MUST be workspace-scoped, with same-workspace tenant relations. Approval, rejection, status, payment, commission, and audit surfaces MUST enforce both application authorization and independent database authorization, deny by default, and avoid foreign-record existence disclosure.
- **FR-007**: Client authorization MUST use a path separate from staff `authorize()`, exposing only a narrow self-status projection resolved by the authenticated user's client association. Current state MUST be checked per request; caches may last only for that request. An already-open pending client page MUST be able to refresh/poll status without requiring re-login. Detailed design is deferred to plan phase.
- **FR-008**: Data projections MUST follow least privilege. Commission amounts/rates are readable only by PO/WO. Sales may see amounts due/collected without commission. Staff authorization MUST be checked before replay receipts or protected state are disclosed. Default function execution is revoked; only intended public operations may be granted. All object references are schema-qualified.
- **FR-009**: Each collection request MUST name the expected installment sequence explicitly. It MUST match the obligation's exact amount and currency. At most one active, unreversed collection may exist per obligation, enforced independently of operation keys; a fully reversed obligation may be collected again. Installment sequence and total integrity MUST be validated as one consistent snapshot, including at deferred transaction completion where required by the selected design.
- **FR-010**: Money MUST use integer minor units and exact decimal-string transport. Commission calculation MUST use integer basis points and numeric multiplication, bound the result before integer storage, and never use JavaScript `number` for money arithmetic. Commission MUST use Round Half Up with exact integer arithmetic.
- **FR-011**: Money-changing operations MUST be idempotent through private operation receipts bound to operation, workspace, target, expected installment sequence, and canonical argument hash. Reusing a key with different arguments MUST fail. A replay MUST re-authorize, return the identical receipt, and emit no duplicate audit event. Active collection uniqueness per obligation remains independent of keys. Collections must equal the full installment amount; partial payments are prohibited. Reversal operations MUST use operation receipts and be idempotent.
- **FR-012**: The lock/serialization order for related state changes MUST be client, subscription, then obligations/ledger. Staff authorization MUST be rechecked after lock waits. Approval MUST not lock an F10 registration link unless an invariant requires it. F11 recovery receipts, Auth identity, and consumed markers remain untouched.
- **FR-013**: `recorded_at` MUST be immutable system recording time and separate from staff-attested `collected_on`, a Cairo calendar date. Future collection dates are rejected against fresh Cairo time; the collection month is derived from `collected_on`. Any historical date is allowed, future dates are prohibited, and corrections use the PO-only append-only reversal in F12, operational before real financial use.
- **FR-014**: Only a PO may correct a collection by appending a full reversal event that references the original collection and reverses its exact stored amount and commission. The original event MUST NOT be updated or deleted. Partial reversals are prohibited; the linked obligation returns to unpaid. Sales and WO MUST be denied. The reversal MUST be fully audited and operational before real financial use. The correction authority also covers the preserved rows of a client in the F11 deletion lifecycle: the PO may reverse an unreversed collection recorded before deletion, and the correction creates no new collection, charge or obligation for that client (S47-PO-12; SC-012).
- **FR-015**: Correction reversal MUST be idempotent through private operation receipts; an authorized exact replay returns the identical receipt and emits no duplicate reversal or audit event. A reused key with different arguments MUST fail.

- **FR-016**: Approval/rejection transitions and financial events MUST be audited through the existing audit model. Extend the latest `audit_row_change()` body for client approval/rejection UPDATE transitions; audit failure MUST roll back the change. The event details MUST avoid PII/free text, and replay MUST NOT create duplicate audit events. Preserve PO/WO audit visibility.
- **FR-017**: Unauthorized, foreign, nonexistent, or revoked targets MUST receive a generic non-disclosing denial. Stale already-decided client states MUST not be changed. Authorization MUST precede any replay or state disclosure.
- **FR-018**: F12 MUST expose no bulk client action. All status and financial views MUST use role- and workspace-appropriate projections; Sales sees no commission amount/rate.
- **FR-019**: F12 user interfaces MUST follow the [Frontend Design Gate](../../docs/09-frontend-design-gate.md) and the repository [DESIGN.md](../../DESIGN.md): Arabic-first RTL and English LTR, dark/light modes, responsive and keyboard-accessible interaction, WCAG 2.2 AA contrast, and loading/empty/error/success states. The approved UI decisions are recorded as DG-F12-1..4.
- **FR-020**: F12 MUST implement the decisions recorded in ND-F12-1..7 and DG-F12-1..4 below; the final 2026-10-29 record also applies; no former conservative default remains in force.
- **FR-021**: Approval MUST use a dedicated full-page client review; the payment amount MUST be automatic and read-only with explicit confirmation; status badges MUST use soft semantic Design System tokens.
- **FR-022**: F12 MUST emit an approved-registration event for P2 to consume, including the approved client and workspace identity. The approval commit is also the trigger for the 011 automatic responsible-Trainer distribution (011 FR-028; S40-PO-13 MCQ-11 defaults). That distribution is a separate system write consumed from a durable job written in the approval transaction (011 FR-028 (g): 011 owns the consumer, F12 owns the emit; retries and backlog are specified there). A delayed job that finds an active Platform Owner manual assignment completes as a recorded no-op and never auto-reassigns (011 FR-028 (g); S41-R4 F2). If that manual assignment ended because its Trainer's account was deleted, the 011 FR-028 (h) trainer-deletion reassignment applies instead (S41-PO-11, which supersedes S41-R4 F2 for this case only); a manual assignment that ended because of a membership revocation or a role change still completes as a recorded no-op. It grants no access, creates no payment or subscription effect and does not change approval semantics. F12 MUST NOT include form selection, assignment, templates, or intake UI; post-approval automatic form assignment and intake presentation on client login are delivered by P2 per REQ-P2-01. P2 must preserve mandatory Basic/Workout/Nutrition intake and workspace authorization. The capability that authorizes Trainer form selection remains open for the P2 spec.

- **FR-023**: F12 MUST extend F10 link creation with explicit Upfront amount, installment count, individual amounts and due timing. Existing schedule storage and exact-total enforcement are reused. Default timing is upfront at approval and remainder at offset 30 from Cairo activation date; no default upfront amount/percentage is invented. Every issued link/agreement, amount and custom offset remains immutable. See the [F10 reconciliation addendum](../010-registration-links/addendum-f12-flexible-installments.md).
- **FR-024**: F12 MUST provide an authenticated standalone Pending/Approved/Rejected page with lightweight automatic approval detection and safe redirect, Manual Refresh and manual-navigation fallback. Only existing authorized routes may be used; approval MUST NOT imply activation or plan availability. The safe self-status reader is the only pending/rejected data exception.
- **FR-025**: A correction reversal MUST have effective_on equal to the Africa/Cairo date of its correction recording, so its financial effect belongs to the correction month. The original collection date, amount, commission and event remain unchanged.
- **FR-026**: Rejection MUST use only `registration_rejected`, without free text. Only PO may reconsider; no identity/link release or recovery policy is added.
- **FR-027**: Later installment collection (including recollection after reversal) MUST require an activation fact and all earlier obligations currently paid. It MAY occur before its due date after activation. A correction restores its obligation to unpaid without changing later paid events; subsequent collections must again respect sequence.
- **FR-028**: Approvals and Payments links MUST be added to existing authorized staff dashboards according to their capabilities. No navigation redesign or new role tabs are introduced.
- **FR-029**: On uncertain payment outcome, the UI MUST retain the same canonical request and idempotency key, show a warning and permit safe retry; it MUST NOT generate a new payment intent or falsely assert success/failure.

### Key Entities

- **Client approval state**: F11 client identity and workspace binding with pending-approval, approved, or rejected state and audited transitions. Identity and issued snapshot columns remain immutable.
- **Subscription**: Initial workspace-scoped record for the approved client, bound to the F10 package-version snapshot and containing immutable price, currency, duration, commission-rate, and lifecycle snapshot values. Renewals are deferred to F13.
- **Installment obligation**: Immutable ordered obligation for one subscription, with explicit sequence and exact amount due in snapshot currency. Its paid status derives from an active, unreversed collection event.
- **Payment event**: Append-only workspace-scoped financial event for a confirmed collection, with obligation reference, exact amount/currency, stored commission, collection date, responsible staff, audit metadata, and separate recording timestamp; payment method and free-text reference are not recorded. A PO-only correction reversal is an append-only event referencing the original collection and reversing its exact stored amount and commission; it restores the obligation to unpaid without updating or deleting the original. F13 remains responsible for full refunds (D-15), freeze, and renewal.
- **Private operation receipt**: Protected idempotency evidence that binds a request key to its operation, scope, target, expected installment sequence, and canonical arguments; replay is authorized before receipt disclosure.
- **Audit event**: Append-only evidence of approval/rejection and collection operations, with non-PII details and PO/WO visibility.
- **Client status projection**: Narrow self-only current approval status used by an authenticated client to see approval without re-login; it grants no additional scope by itself.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Each eligible client has at most one initial subscription bound to the committed F10 snapshot; later catalog changes do not change that snapshot.
- **SC-002**: Each installment obligation has at most one active, unreversed collection at a time, with exact amount and currency; fully reversed obligations return to unpaid and may be collected again. Unpaid balances have no collection-earned commission.
- **SC-003**: Every collection event has separately identifiable collection date and recording timestamp, exact amount transport, and a stored commission amount computed under the PO-approved rounding rule.
- **SC-004**: After approval commits, an already-open client session can observe approved status on its next permitted refresh/poll without re-login, while foreign-client status remains inaccessible.
- **SC-005**: All role-by-scope combinations return only permitted data; zero foreign-workspace existence, payment, commission, or audit disclosure occurs.
- **SC-006**: Concurrent approval/rejection races produce one valid client transition; concurrent or retried collection/reversal operations produce no duplicate financial or audit events, and each obligation has no more than one active collection.
- **SC-007**: Failed audit, invalid authorization, invalid snapshot, mismatched amount/currency, replay mismatch, or stale state yields no partial business or financial change.
- **SC-008**: Approval, rejection, collection, and correction-reversal interfaces satisfy the Frontend Design Gate and DESIGN.md for Arabic RTL and English LTR, keyboard use, responsive states, and contrast/accessibility review.

- **SC-009**: Flexible link issuance captures the chosen upfront/count/individual amounts/timing, rejects an inexact total and preserves all pre-existing agreement fingerprints unchanged.
- **SC-010**: Pending approval detection stays within its documented bounded request budget, redirects only to an existing authorized route, and always retains Manual Refresh/navigation recovery without implying activation.
- **SC-011**: Correction across a Cairo month boundary books the exact reversal in the correction month and leaves original event bytes and original collection month unchanged.
- **SC-012 (S47-PO-12)**: In 100% of deleted-client fixtures with a preserved unreversed collection, a PO correction reversal appends one reversal, reverses the exact stored amount and commission, and leaves the original event unchanged; 100% of new `installment_collect` attempts for a client in the F11 deletion lifecycle are refused with the FR-017 stale-state response and create zero collection, charge, obligation, subscription, financial or audit rows.

## Assumptions

- F11 creates pending-approval clients and denies all client-scoped access until approval; ND-F11-6a sets the approver boundary to workspace PO/WO.
- F10 supplies immutable issued package/version terms and optional immutable installment schedule. Existing terms remain bound even after expiry/consumption or catalog changes.
- External payment remains outside LIFTER; F12 records only staff-confirmed collections and does not add a payment gateway.
- Technical decisions recorded from architect r1 remain implementation constraints, not implementation authorization.
- Unknown business policy remains a PO decision or source-verification item; this specification does not invent it.

## Out of Scope

- **F13**: Subscription freeze, renewal, full refunds (D-15), expiry policy, overdue enforcement, notifications, and related workflows. F12 includes only the minimum PO-only correction reversal of a collection event; F13 full refunds remain separate.
- **P2**: Building the intake form engine/templates, form-selection and assignment UI, and intake presentation on client login. F12 emits the approval event P2 hooks; REQ-P2-01 carries the approved post-approval assignment requirement. No partial form engine or form UI is in F12.
- **P4**: Installment overdue restriction/notices, expiry enforcement/notifications, and finance reporting. Activation occurs after both initial workout and nutrition plans are delivered (independent delivery records); later installment due dates do not exist until activation.
- Payment gateway, online checkout, in-app payment processing, or LIFTER commission settlement; bulk actions; client closure/deletion (account deletion is specified in 011 FR-018–FR-026 by S40-PO-13; F12 adds no deletion behavior); changing F11 recovery, Auth identity, or consumed-link behavior.
- Payment methods, free-text payment references, and partial installment collections.

## Architect Decisions (technical decisions)

These ten technical outcomes are adopted from architect response r1 and supersede conflicting v0 wording. They are not implementation approval; PO policy decisions are recorded in the register above.

1. ND-F11-6a remains binding: only PO/WO approve or reject, and a real target workspace is required. Sales has no `approve_registration` capability and may record payments only.
2. Client self-status uses a path separate from staff authorization, a narrow projection by authenticated client identity, a dedicated database helper that avoids recursive client RLS, per-request-only caching, and refresh/poll for open pending pages. Detailed design waits for plan phase.
3. Use column-level/role-appropriate projections. Commission values are PO/WO only; Sales can see amounts due/collected. Revoke default function execution, grant only intended public operations, schema-qualify object references, and authorize before replay/state disclosure.
4. Private operation receipts bind operation, workspace, target, expected installment sequence, and canonical argument hash. Mismatched key reuse fails; authorized replay returns the identical receipt without another audit. Obligation uniqueness is independent of keys; requests name an explicit installment sequence.
5. Tenant rows carry workspace identity with same-workspace composite relations; one active, unreversed collection per obligation; exact amount/currency validation; deferred sequence/total validation; initial-subscription uniqueness is scoped so F13 renewals remain possible.
6. Approval honors committed client-to-link-to-version binding after expiry/consumption, offer disablement, or newer versions. Do not lock the link unless needed for an invariant. Use one client → subscription → obligations/ledger lock order; recheck staff revocation after waits. Leave F11 recovery receipts, Auth identity, and consumed markers untouched.
7. Technical money representation uses integer basis points, numeric multiplication, exact decimal-string transport, and a bounded result before integer storage; no JavaScript `number` money math. The approved Round Half Up rule applies. Future verification should include 0%/100%, half-minor ties, and bigint extremes.
8. Remove signup date as a lower bound for `collected_on`. Keep immutable `recorded_at` distinct from staff-attested Cairo `collected_on`; reject future dates against fresh Cairo time and derive collection month from `collected_on`. All historical dates are allowed, future dates are prohibited, and corrections use the PO-only append-only reversal within F12; it is a production blocker until operational before real financial use.
9. Use immutable installment obligations and a unified append-only ledger for collection and F12 correction-reversal events referencing originals. Derive paid status from active unreversed collections; reversal restores the obligation to unpaid and reverses exact stored amount and commission. F13 full refunds, freeze, and renewal remain separate.
10. Widen client approval state to pending-approval/approved/rejected with a narrow transition guard replacing `signup_no_update`, preserving identity/snapshot immutability. Extend the latest clients audit branch in `audit_row_change()` for UPDATE transitions; audit failure rolls back. Replays do not audit again; PO/WO audit visibility remains.

## PO Decision Register — Decided (PO, 2026-10-28)

| ID           | Status                                           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ND-F12-1** | **Decided (PO, 2026-10-28)**                     | Only PO/WO may approve or reject registrations. Sales may record payments but may not approve; remove `approve_registration` from Sales in the capability matrix.                                                                                                                                                                                                                                                                                                 |
| **ND-F12-2** | **Decided (PO, 2026-10-28; refined 2026-10-29)** | Installment 1 is upfront at approval. For installment n>=2, due = Cairo activation date + its issued offset days, payable through Cairo day-end. Default remainder offset is 30; all custom issued agreements/offsets remain unchanged. Later installments require activation and sequential collection; early payment is allowed.                                                                                                                                |
| **ND-F12-3** | **Decided (PO, 2026-10-28)**                     | Commission uses Round Half Up with exact integer arithmetic.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **ND-F12-4** | **Decided (PO, 2026-10-28)**                     | Record amount, collection date, responsible staff, and audit metadata. Do not record payment method or free-text reference.                                                                                                                                                                                                                                                                                                                                       |
| **ND-F12-5** | **Decided (PO, 2026-10-28)**                     | PO/WO may reject using the single code `registration_rejected`. Only PO may reconsider (rejected → approved). All decisions and reconsiderations are fully audited.                                                                                                                                                                                                                                                                                               |
| **ND-F12-6** | **Decided (PO, 2026-10-28)**                     | Any historical collection date is allowed; future dates are prohibited. Correction is by a minimum safe PO-only, fully audited, append-only reversal within F12; it references the original collection, reverses its exact stored amount and commission, restores the obligation to unpaid, is idempotent through operation receipts, does not update or delete the original, and must be operational before real financial use. Partial reversal is unsupported. |
| **ND-F12-7** | **Decided (PO, 2026-10-28)**                     | Full installments only; no partial payments.                                                                                                                                                                                                                                                                                                                                                                                                                      |

### S47 decision (2026-11-11) — S47-PO-12

Source: `C:/Users/NEW LAP/.lifter/runs/s47-po/s47-po-12.verbatim.txt`, sha256 `dfe79286a9ac79a1c33632ef414692a37d2e91100dd11955b5de41827ef19449`, verbatim `Corrections only (Rec.)` (answers GOV1F-MCQ-2 = option A). Decided: after a client account is deleted, the Platform Owner may record F12/F13 corrections and reversals on that client's preserved rows; no new collection, charge or obligation may be created for the deleted client. This refines the scope of FR-014 and the deleted-client edge case above. It changes no capability, copy or F13 refund authority.

## Design Decisions — Decided (PO, 2026-10-28)

- **DG-F12-1 - Decided (PO, 2026-10-28); delivered by P2 per REQ-P2-01**: PO, WO, or an authorized Trainer selects the intake form; it is automatically assigned after approval and presented to the client on login. Preserve mandatory Basic/Workout/Nutrition intake and workspace authorization. F12 emits the approval event P2 hooks and contains no form UI or partial form engine. P2 form engine/templates are a dependency. **OPEN P2 capability question:** which existing capability (for example, `coaching_work`) authorizes Trainer form selection, or whether the matrix must change.
- **DG-F12-2 — Decided (PO, 2026-10-28)**: Use a dedicated full-page client approval review.
- **DG-F12-3 — Decided (PO, 2026-10-28)**: Payment amount is automatic and read-only, with explicit confirmation.
- **DG-F12-4 — Decided (PO, 2026-10-28)**: Use soft semantic status badges with approved Design System tokens.

## Constitution Check

- **I — Strict Workspace Isolation**: Addressed by tenant-scoped records and relations, two independent authorization walls, self-only status, generic denial, and workspace-scoped commission/audit visibility (FR-006..009, FR-015).
- **II — Immutable Financial Truth**: Addressed by immutable subscription/obligation snapshots, exact minor units, append-only collection/reversal-ready ledger, one active collection per obligation, commission only on confirmed collections and exact reversal, and idempotency (FR-003..005, FR-009..011).
- **III — Platform Owner Governance & Least Privilege**: PO/WO approval follows ND-F11-6a; Sales has no approval capability and may record payments. Commission visibility is PO/WO only; no unlisted capability is inferred.
- **IV — Approved Scope Only**: F13, P2, and P4 exclusions are explicit. REQ-P2-01 is a carried P2 requirement; only Trainer capability mapping remains open in P2. F12 correction reversal is decided within F12.
- **V — Versioned, Non-Retroactive Content**: Approval uses the committed F10 version and financial snapshot; later catalog changes cannot rewrite issued terms.
- **VI — Human-Governed People Decisions**: No automated discipline, incentives, or trainer compensation decision is added.
- **VII — Privacy & Health-Data Protection**: No P2 health/intake data is added; audit details avoid PII/free text; role-based projections protect commission and client state.
- **VIII — Bilingual, Accessible, Design-System UI**: FR-019 requires the Frontend Design Gate and DESIGN.md; DG-F12-1..4 record the approved UI direction.
- **IX — Reliable, Idempotent Operations**: Explicit installment identity, serialized state changes, re-authorization after waits, operation receipts, independent obligation uniqueness, and audit rollback behavior are specified.

**Workflow status**: PO decisions are recorded 2026-10-28. F12 includes the minimum PO-only correction reversal. DG-F12-1 is handed off to P2 per REQ-P2-01; only Trainer capability mapping remains open in the P2 specification. Plan/tasks artifacts exist and require independent approval before implementation. Acceptance criteria are future verification requirements and are not claims of implementation or test completion.

## Final PO decision record (2026-10-29)

Source: FINAL PO DECISIONS, session 10, dated 2026-10-29. The complete F12 block below is recorded verbatim. These final decisions supersede conflicting earlier proposals and refine the 2026-10-28 register; they do not authorize implementation.

F12 (registration approval & payments)

- F12-1: One generic rejection code: `registration_rejected`.
- F12-2: Later installments only after activation, sequentially; early payment allowed.
- F12-3 (CUSTOM): Flexible Installments configured when creating an F10 Registration Link. Support Upfront amount, installment count, individual amounts and due timing. Default: Upfront at approval, remainder 30 Cairo calendar days after activation. Preserve all issued agreements and custom offsets; installments must total the exact price. Reconcile F10/F12 specifications.
- F12-4: Payment corrections recorded in the correction month; original records remain immutable, with linked append-only reversals.
- F12-5: Status Badges using existing Design System semantic tokens.
- F12-6 (CUSTOM): Standalone Pending/Approved/Rejected page, lightweight automatic approval detection and redirect, plus Manual Refresh and manual-navigation fallback. Respect Auth and actual available routes; approval ≠ activation.
- F12-7: Approvals/Payments links from existing authorized staff dashboards; no navigation redesign.
- F12-8: Default due date = Cairo activation date + 30 calendar days, payable through day-end. Preserve custom installment schedules.
- F12-9: On uncertain payment outcome, retain the same request/idempotency key, show warning and permit safe retry without duplicate payment.

The previous fixed second-offset-30 interpretation is superseded: 30 is the default remainder offset, never a normalization of custom issued terms. P2 still owns form assignment/intake; F12 now explicitly owns the standalone status page and its safe automatic/manual navigation. All PA-F12-1..9 policy entries are Decided; remaining technical refinements are Architect items in [plan.md](plan.md#architect-items).

## Clarifications

### Session 2026-11-03 - compliance reconciliation

- **Decision register:** `docs/04-changes-and-questions.md` D-23 records and links to the merged F12 policy specification; this specification records F12-1..9, including flexible installments, correction-month reversals, self-status, navigation, Cairo due dates, and safe retries.
- **Result:** Zero open ambiguities for the merged F12 scope reviewed here. The Trainer capability question explicitly belongs to P2 per FR-022 and D-23; it does not authorize a decision in F12.
- **Evidence limit:** This is a static documentation reconciliation. No tests were executed in this lane; task execution checkboxes remain governed by their existing evidence and are not changed here.
