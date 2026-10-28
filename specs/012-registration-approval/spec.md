# Feature Specification: F12 — Registration approval and payment recording

**Feature Branch**: `012-registration-approval`

**Created**: 2026-10-28

**Status**: Draft; architect debate r1 decisions recorded, pending PO spec approval. ND-F12-1..7 and DG-F12-1..4 remain OPEN. Specification only; no plan, tasks, or implementation approval.

**Input**: F12 registration approval, rejection, initial subscription snapshot, installment obligations, and confirmed payment recording, based on F11 client accounts and F10 issued registration-link snapshots.

**Sources**: [Spec debate r1](research/spec-debate-r1.md) (architect v0, Sol Medium critique round 1, and architect response r1); [Constitution v1.1.0](../../.specify/memory/constitution.md); [BRD/PRD](../../LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md) BRD-03/04, PRD-02/07/14, DR-01/02; [decision register](../../docs/04-changes-and-questions.md) D-08..D-17; [F9 package spec](../009-packages/spec.md) and [data model](../009-packages/data-model.md); [F10 registration-link spec](../010-registration-links/spec.md) and [data model](../010-registration-links/data-model.md); [F11 client-account spec](../011-client-accounts/spec.md) and [data model](../011-client-accounts/data-model.md).

## User Scenarios & Testing

### User Story 1 — Review and approve a pending registration (Priority: P1)

A workspace PO or WO reviews a client who completed F11 signup, verifies the external payment under the PO-approved policy, and approves the registration. Approval binds the subscription to the immutable terms issued through F10 and records the required audit evidence. The client's authorization state becomes current without requiring a new sign-in.

**Why this priority**: Approval is the handoff that completes the signup journey (PRD-14 Journey A) and unlocks client status access. F11 deliberately leaves clients pending with no access until this F12 action.

**Independent Test**: With one pending-approval F11 client and an authorized approver, perform the approved verification and approval flow; confirm one terminal approval outcome, the issued snapshot binding, safe audit evidence, and the live client status behavior.

**Acceptance Scenarios**:

1. **Given** a pending-approval client with an intact F10-issued workspace/offer/version binding and the required externally confirmed payment, **When** an authorized PO or WO approves, **Then** the client becomes approved and one initial subscription is created from the issued snapshot; only payment events confirmed under the PO-approved initial-payment rule are recorded as collected.
2. **Given** a pending client whose offer was later disabled, link expired or consumed, or a newer version was published, **When** the authorized approver completes approval, **Then** the committed client-to-link-to-version binding is honored and the issued terms are not replaced or invalidated.
3. **Given** missing, inconsistent, or cross-workspace snapshot relations, **When** approval is attempted, **Then** no partial approval, subscription, obligation, collection, or success audit event is committed, and the response does not disclose foreign records.
4. **Given** approval commits while the client has an already-open pending page, **When** that page refreshes or polls, **Then** it reflects the approved state without requiring the client to sign in again.

### User Story 2 — Reject an ineligible pending registration (Priority: P1)

An authorized staff member rejects a pending registration when it should not proceed. The rejection is an auditable terminal outcome and does not create subscription or collection history.

**Why this priority**: The workflow needs a safe resolution for registrations that cannot be approved, while maintaining the F11 no-access boundary and preventing an ambiguous pending queue.

**Independent Test**: Reject a pending registration as a permitted actor and verify its state and audit outcome, then verify that no subscription or payment event exists and client access remains denied.

**Acceptance Scenarios**:

1. **Given** a pending client and a permitted rejector under the PO-approved rejection policy, **When** rejection is recorded, **Then** the client becomes rejected, the decision is audited without free-text PII, and no subscription, obligation, or payment event is created.
2. **Given** an already approved or rejected client, **When** another approve or reject action is attempted, **Then** the state is not changed and no duplicate transition audit is emitted.
3. **Given** a rejected client, **When** the client attempts to use protected client resources, **Then** access remains denied. Reconsideration, identity release, and recovery behavior follow only decisions explicitly resolved for F12 and its dependencies.

### User Story 3 — Record a later confirmed installment (Priority: P1)

An authorized staff member records a later external installment after confirming that the money was collected. The entry names its expected installment, captures the collection date separately from the recording time, and creates immutable financial history.

**Why this priority**: Installment payment confirmation drives earned commission and the collection month under D-13. An unpaid amount must not appear collected or earn commission.

**Independent Test**: On an approved subscription with a due/unpaid installment, record its externally confirmed amount for an explicit installment sequence and verify the event, derived paid state, snapshot currency, collection month, and audit evidence.

**Acceptance Scenarios**:

1. **Given** an authorized actor with `record_payment` for the target workspace and an unpaid obligation, **When** the actor records the exact confirmed amount against its explicit installment sequence, **Then** one collection event is appended with the snapshot currency, Cairo collection date, separate recording timestamp, and stored commission amount; the obligation is treated as paid from that linked event.
2. **Given** a caller names an unknown, already-paid, wrong-sequence, wrong-workspace, or wrong-amount obligation, **When** collection is attempted, **Then** no financial event or paid-state change occurs.
3. **Given** a collection is replayed with the same operation key and the same canonical request, **When** the actor remains authorized, **Then** the identical prior receipt is returned and no second event or audit entry is created.
4. **Given** a previously used key is reused with different arguments, **When** the request is submitted, **Then** it fails without disclosing protected state or creating an event.

### User Story 4 — See approval take effect without re-login (Priority: P1)

A client who signed in while pending can learn that approval has taken effect through a narrow current-status view, while receiving no access to unrelated client or staff data.

**Why this priority**: BRD-04.4 requires current approval visibility without relying on stale sign-in claims; F11's pending client has no protected access.

**Independent Test**: Keep a pending client's session open, approve the account as an authorized staff member, then refresh the client status surface and verify the current status and unchanged data boundaries.

**Acceptance Scenarios**:

1. **Given** a pending client session, **When** status is checked, **Then** only that client's narrow approval status is returned and all other protected resources remain denied.
2. **Given** that same session after an authorized approval commits, **When** the status is refreshed or polled, **Then** approved status becomes visible without re-login.
3. **Given** a client from another workspace, a forged client identifier, or an unauthenticated caller, **When** status is requested, **Then** the request is denied without revealing another client's existence or status.

### User Story 5 — Preserve tenant isolation and deny unapproved roles (Priority: P1)

Staff may act only within their authorized scope and capability. Client status access is self-only. Unauthorized, foreign, revoked, or nonexistent targets do not reveal protected existence or financial details.

**Why this priority**: Strict workspace isolation and least privilege are constitutional requirements for all financial and client surfaces.

**Independent Test**: Exercise permitted and denied role/scope combinations for approval, rejection, payment recording, status projection, commission visibility, and audit visibility; verify the same denials at the application and database authorization boundaries.

**Acceptance Scenarios**:

1. **Given** a Sales actor attempting approval or rejection, **When** the operation is requested, **Then** it is denied under ND-F11-6a; Sales retains the separately approved `record_payment` capability for later installments.
2. **Given** a PO or WO with access to workspace A, **When** they target a client or obligation in workspace B or a revoked membership, **Then** the request is denied without data or existence disclosure.
3. **Given** a Sales user allowed to see payment totals, **When** payment data is presented, **Then** amounts due and collected may be shown but commission amounts and rates are not disclosed.
4. **Given** a Trainer, anonymous caller, or client attempting staff approval/payment operations, **When** the operation is requested, **Then** it is denied.
5. **Given** an authorized PO or WO, **When** commission or relevant audit information is requested, **Then** only data in the actor's approved platform/workspace scope is returned.

### User Story 6 — Keep concurrent actions and retries financially safe (Priority: P1)

Concurrent approval/rejection and collection/replay attempts produce one valid outcome per target, preserve immutable financial history, and do not leak state through retries.

**Why this priority**: Approval and collection change access and financial records. PRD-13 requires safe idempotency, and the constitution requires transaction-safe operations under concurrency.

**Independent Test**: Submit competing approve/reject requests and simultaneous collection requests for one obligation, including response-loss retries and mismatched-key reuse; verify at most one state transition and collection per obligation.

**Acceptance Scenarios**:

1. **Given** simultaneous approve and reject requests for one pending client, **When** both complete, **Then** exactly one terminal outcome commits; the loser receives a safe stale-state response and creates no duplicate audit or financial effect.
2. **Given** simultaneous collection requests for one obligation, **When** both complete, **Then** at most one collection is recorded for that obligation regardless of operation-key choice.
3. **Given** authorization is revoked while a request waits for the target's serialization point, **When** the request resumes, **Then** authorization is checked again and the revoked actor is denied.
4. **Given** audit recording fails, **When** an approval, rejection, or collection transaction completes, **Then** the business change rolls back with the audit failure.
5. **Given** an exact retry after a lost response, **When** it is re-authorized and replayed, **Then** it returns the identical receipt without a second financial or audit event.

### Edge Cases

- F10 link expiry/consumption, offer disablement, or a newer package version after signup must not replace a committed client-to-link-to-version snapshot.
- An absent or malformed snapshot relation, mixed workspace relation, or mismatched currency/amount aborts the operation without partial state or foreign-record disclosure.
- Approval and rejection races, retries after uncertain responses, duplicate keys with changed arguments, and revoked access while waiting must preserve authorization and one-outcome guarantees.
- Duplicate collection attempts against one obligation are rejected even when they use different operation keys; replay does not create another audit event.
- Integer minor-unit amounts beyond JavaScript's exact integer range, calculation overflow, and commission rounding ties must retain exactness; money is not transported or calculated through imprecise JavaScript `number` values.
- Cairo collection date is distinct from server recording time. A future collection date is invalid; the allowed historical window and correction policy remain open under ND-F12-6.
- A partial amount, payment method, reference text, zero-offset schedule, early later-installment collection, and first-installment-at-approval behavior are not inferred while their related ND-F12 decisions remain open.
- Rejection never grants client access or creates a subscription/payment event. Reconsideration, recovery, and identity/link release are not inferred.
- UI screens and components must cover loading, empty, error, and success states and satisfy the Frontend Design Gate and DESIGN.md in both Arabic RTL and English LTR.

## Requirements

### Functional Requirements

- **FR-001**: F12 MUST allow only the workspace PO and WO to approve or reject a pending-approval client, applying ND-F11-6a and current workspace authorization. The capability-matrix consequence for Sales is recorded as ND-F12-1 for PO confirmation; it is not a request to reopen ND-F11-6a.
- **FR-002**: Approval MUST use the client’s committed F10 registration-link and package-version binding. Link expiry/consumption, later offer disablement, or newer versions MUST NOT rewrite or invalidate that binding. Broken or cross-workspace relations MUST fail closed.
- **FR-003**: Approval MUST create the initial subscription snapshot and installment obligations from the issued terms, with one initial subscription per client under the initial-subscription scope. Renewal behavior remains F13. Subscription price, currency, duration, commission rate, and schedule remain immutable snapshots.
- **FR-004**: External payment confirmation MUST precede any record represented as collected. Only a confirmed collection may earn commission, at its purchase-time rate and attributed to its collection month in Africa/Cairo. Unpaid balances earn no commission. First-payment and installment timing semantics remain subject to ND-F12-2.
- **FR-005**: Installment obligations MUST be immutable. Payment history MUST be an append-only unified event ledger supporting collection events and future F13 reversal events that reference originals. Paid status is derived from its uniquely linked collection event; no mutable paid-event pointer is authoritative. Store commission per event so a future reversal can reverse the exact stored amount.
- **FR-006**: Every tenant-owned F12 record and relationship MUST be workspace-scoped, with same-workspace tenant relations. Approval, rejection, status, payment, commission, and audit surfaces MUST enforce both application authorization and independent database authorization, deny by default, and avoid foreign-record existence disclosure.
- **FR-007**: Client authorization MUST use a path separate from staff `authorize()`, exposing only a narrow self-status projection resolved by the authenticated user's client association. Current state MUST be checked per request; caches may last only for that request. An already-open pending client page MUST be able to refresh/poll status without requiring re-login. Detailed design is deferred to plan phase.
- **FR-008**: Data projections MUST follow least privilege. Commission amounts/rates are readable only by PO/WO. Sales may see amounts due/collected without commission. Staff authorization MUST be checked before replay receipts or protected state are disclosed. Default function execution is revoked; only intended public operations may be granted. All object references are schema-qualified.
- **FR-009**: Each collection request MUST name the expected installment sequence explicitly. It MUST match the obligation's exact amount and currency. At most one collection may exist per obligation, enforced independently of operation keys. Installment sequence and total integrity MUST be validated as one consistent snapshot, including at deferred transaction completion where required by the selected design.
- **FR-010**: Money MUST use integer minor units and exact decimal-string transport. Commission calculation MUST use integer basis points and numeric multiplication, bound the result before integer storage, and never use JavaScript `number` for money arithmetic. The rounding rule remains open under ND-F12-3 and MUST NOT be treated as approved until the PO decides it.
- **FR-011**: Money-changing operations MUST be idempotent through private operation receipts bound to operation, workspace, target, expected installment sequence, and canonical argument hash. Reusing a key with different arguments MUST fail. A replay MUST re-authorize, return the identical receipt, and emit no duplicate audit event. Payment uniqueness per obligation remains independent of keys.
- **FR-012**: The lock/serialization order for related state changes MUST be client, subscription, then obligations/ledger. Staff authorization MUST be rechecked after lock waits. Approval MUST not lock an F10 registration link unless an invariant requires it. F11 recovery receipts, Auth identity, and consumed markers remain untouched.
- **FR-013**: `recorded_at` MUST be immutable system recording time and separate from staff-attested `collected_on`, a Cairo calendar date. Future collection dates are rejected against fresh Cairo time; the collection month is derived from `collected_on`. Historical date allowance and correction rules remain open under ND-F12-6.
- **FR-014**: Approval/rejection transitions and financial events MUST be audited through the existing audit model. Extend the latest `audit_row_change()` body for client approval/rejection UPDATE transitions; audit failure MUST roll back the change. The event details MUST avoid PII/free text, and replay MUST NOT create duplicate audit events. Preserve PO/WO audit visibility.
- **FR-015**: Unauthorized, foreign, nonexistent, or revoked targets MUST receive a generic non-disclosing denial. Stale already-decided client states MUST not be changed. Authorization MUST precede any replay or state disclosure.
- **FR-016**: F12 MUST expose no bulk client action. All status and financial views MUST use role- and workspace-appropriate projections; Sales sees no commission amount/rate.
- **FR-017**: F12 user interfaces MUST follow the [Frontend Design Gate](../../docs/09-frontend-design-gate.md) (added by branch `docs-workflow-governance`, pending merge to main) and the repository [DESIGN.md](../../DESIGN.md): Arabic-first RTL and English LTR, dark/light modes, responsive and keyboard-accessible interaction, WCAG 2.2 AA contrast, and loading/empty/error/success states. The four unresolved UI design gaps are listed as DG-F12-1..4.
- **FR-018**: This specification MUST leave all ND-F12-1..7 and DG-F12-1..4 open pending explicit PO decisions. No conservative default in this document is an approved policy.

### Key Entities

- **Client approval state**: F11 client identity and workspace binding with pending-approval, approved, or rejected state and audited transitions. Identity and issued snapshot columns remain immutable.
- **Subscription**: Initial workspace-scoped record for the approved client, bound to the F10 package-version snapshot and containing immutable price, currency, duration, commission-rate, and lifecycle snapshot values. Renewals are deferred to F13.
- **Installment obligation**: Immutable ordered obligation for one subscription, with explicit sequence and exact amount due in snapshot currency. Its paid status derives from a uniquely linked collection event.
- **Payment event**: Append-only workspace-scoped financial event for a confirmed collection, with obligation reference, exact amount/currency, stored commission, collection date, actor, and separate recording timestamp. F13 may add reversal events referencing originals.
- **Private operation receipt**: Protected idempotency evidence that binds a request key to its operation, scope, target, expected installment sequence, and canonical arguments; replay is authorized before receipt disclosure.
- **Audit event**: Append-only evidence of approval/rejection and collection operations, with non-PII details and PO/WO visibility.
- **Client status projection**: Narrow self-only current approval status used by an authenticated client to see approval without re-login; it grants no additional scope by itself.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Each eligible client has at most one initial subscription bound to the committed F10 snapshot; later catalog changes do not change that snapshot.
- **SC-002**: Each installment obligation has at most one collection event, with exact amount and currency; unpaid balances have no collection-earned commission.
- **SC-003**: Every collection event has separately identifiable collection date and recording timestamp, exact amount transport, and a stored commission amount computed under the PO-approved rounding rule.
- **SC-004**: After approval commits, an already-open client session can observe approved status on its next permitted refresh/poll without re-login, while foreign-client status remains inaccessible.
- **SC-005**: All role-by-scope combinations return only permitted data; zero foreign-workspace existence, payment, commission, or audit disclosure occurs.
- **SC-006**: Concurrent approval/rejection races produce one terminal client transition; concurrent or retried collections produce no more than one collection per obligation and no duplicate audit events.
- **SC-007**: Failed audit, invalid authorization, invalid snapshot, mismatched amount/currency, replay mismatch, or stale state yields no partial business or financial change.
- **SC-008**: Approval, rejection, and collection interfaces satisfy the Frontend Design Gate and DESIGN.md for Arabic RTL and English LTR, keyboard use, responsive states, and contrast/accessibility review.

## Assumptions

- F11 creates pending-approval clients and denies all client-scoped access until approval; ND-F11-6a sets the approver boundary to workspace PO/WO.
- F10 supplies immutable issued package/version terms and optional immutable installment schedule. Existing terms remain bound even after expiry/consumption or catalog changes.
- External payment remains outside LIFTER; F12 records only staff-confirmed collections and does not add a payment gateway.
- Technical decisions recorded from architect r1 are pending PO spec approval, not implementation authorization.
- Unknown business policy remains a PO decision or source-verification item; this specification does not invent it.

## Out of Scope

- **F13**: Subscription freeze, renewal, full refunds/reversal execution, expiry policy, overdue enforcement, notifications, and related workflows. The event model preserves room for F13 reversals but does not authorize F13 behavior.
- **P2**: Intake, health-data collection, onboarding form, trainer assignment, plan creation/delivery, or plan-pair activation.
- **P4**: Installment overdue restriction/notices, expiry enforcement/notifications, finance reporting, and activation on delivery of the plan pair. An F12 subscription is not represented as plan-activated.
- Payment gateway, online checkout, in-app payment processing, or LIFTER commission settlement; bulk actions; client closure/deletion; changing F11 recovery, Auth identity, or consumed-link behavior.
- Free-text rejection reasons, payment references, or unspecified payment method fields while ND-F12-4/5 are open.

## Architect Decisions (pending PO spec approval)

These ten technical outcomes are adopted from architect response r1 and supersede conflicting v0 wording. They are not PO policy approval, implementation approval, or permission to resolve the open ND-F12 items by assumption.

1. ND-F11-6a remains binding: only PO/WO approve or reject, and a real target workspace is required. Sales approval capability removal is separately submitted under ND-F12-1; Sales retains later `record_payment`.
2. Client self-status uses a path separate from staff authorization, a narrow projection by authenticated client identity, a dedicated database helper that avoids recursive client RLS, per-request-only caching, and refresh/poll for open pending pages. Detailed design waits for plan phase.
3. Use column-level/role-appropriate projections. Commission values are PO/WO only; Sales can see amounts due/collected. Revoke default function execution, grant only intended public operations, schema-qualify object references, and authorize before replay/state disclosure.
4. Private operation receipts bind operation, workspace, target, expected installment sequence, and canonical argument hash. Mismatched key reuse fails; authorized replay returns the identical receipt without another audit. Obligation uniqueness is independent of keys; requests name an explicit installment sequence.
5. Tenant rows carry workspace identity with same-workspace composite relations; one collection per obligation; exact amount/currency validation; deferred sequence/total validation; initial-subscription uniqueness is scoped so F13 renewals remain possible.
6. Approval honors committed client-to-link-to-version binding after expiry/consumption, offer disablement, or newer versions. Do not lock the link unless needed for an invariant. Use one client → subscription → obligations/ledger lock order; recheck staff revocation after waits. Leave F11 recovery receipts, Auth identity, and consumed markers untouched.
7. Technical money representation uses integer basis points, numeric multiplication, exact decimal-string transport, and a bounded result before integer storage; no JavaScript `number` money math. Rounding policy remains ND-F12-3. Future verification should include 0%/100%, half-minor ties, and bigint extremes.
8. Remove signup date as a lower bound for `collected_on`. Keep immutable `recorded_at` distinct from staff-attested Cairo `collected_on`; reject future dates against fresh Cairo time and derive collection month from `collected_on`. Historical entry/correction policy remains ND-F12-6.
9. Use immutable installment obligations and a unified append-only ledger for collection and future F13 reversal events referencing originals. Derive paid status from uniquely linked collection events; store commission per event for exact future reversal; serialize collection and refund per subscription in F13.
10. Widen client approval state to pending-approval/approved/rejected with a narrow transition guard replacing `signup_no_update`, preserving identity/snapshot immutability. Extend the latest clients audit branch in `audit_row_change()` for UPDATE transitions; audit failure rolls back. Replays do not audit again; PO/WO audit visibility remains.

## PO Decision Register — OPEN

Every ND-F12 entry below is OPEN (PO). Any conservative default is a proposal to help decision-making and is explicitly NOT approved. The architect's accepted technical choices above do not close these business decisions.

| ID | Status | Decision required | Conservative default for discussion — NOT approved |
|---|---|---|---|
| **ND-F12-1** | **OPEN (PO)** | Confirm the capability-matrix change required by ND-F11-6a: remove `approve_registration` from Sales. This is confirmation of the matrix consequence, not a re-ask of the binding PO/WO-only approver decision. Sales keeps later `record_payment`. | Remove Sales approval capability; preserve Sales later-installment recording. **Not approved until PO confirms.** |
| **ND-F12-2** | **OPEN (PO)** | Define installment anchor relative to activation/approval, whether installment 1 is always collected at approval, whether later installments may be paid early, and how offset-zero versus nonzero schedules work. | Treat the F10 schedule as authoritative, require initial payment at approval, and do not accept early later installments. **Not approved; may conflict with BRD activation language.** |
| **ND-F12-3** | **OPEN (PO)** | Select commission rounding on minor units; DR-02 does not settle it. | Round half-up per collected payment. **Not approved.** |
| **ND-F12-4** | **OPEN (PO)** | Decide whether payment method is required, allowed values, and whether a reference field is allowed given PII risk. | Require a small controlled method value and omit free-text reference. **Not approved.** |
| **ND-F12-5** | **OPEN (PO)** | Decide who may reject (proposed default same PO/WO approvers), allowed reason codes, whether rejected clients may be reconsidered/re-approved, and whether password recovery is available to rejected clients. Identity/link release remains deferred under ND-F5-1/ND-F11-9. | Same PO/WO roles; terminal rejection with a small non-PII reason-code set; no re-approval or recovery-specific exception. **Not approved.** |
| **ND-F12-6** | **OPEN (PO)** | Set the historical backdating window for `collected_on` and correction policy before F13 (including reversal-only and PO-only possibilities). | Permit historically accurate dates with no signup-date lower bound; require a future reversal/correction event and PO authorization. **Not approved.** |
| **ND-F12-7** | **OPEN (PO)** | Decide whether partial payment of an installment is forbidden or allowed. | Require exact full obligation amount; no partial installment payment. **Not approved.** |

## Design Gaps — OPEN (PO design decision)

All four items require explicit design direction before their UI is treated as settled. Every resulting UI follows the [Frontend Design Gate](../../docs/09-frontend-design-gate.md) and [DESIGN.md](../../DESIGN.md).

- **DG-F12-1 — OPEN (PO design decision)**: Approved-client landing before intake exists: decide the content and next action while P2 is absent.
- **DG-F12-2 — OPEN (PO design decision)**: Approval queue and approval/rejection dialog layout, including information hierarchy and confirmation interaction.
- **DG-F12-3 — OPEN (PO design decision)**: Shared money display/entry component for exact amount, currency, collection date, and any fields settled by ND-F12-4/6/7.
- **DG-F12-4 — OPEN (PO design decision)**: Client state badges and their meaning/presentation for pending, approved, and rejected across staff and client surfaces.

## Constitution Check

- **I — Strict Workspace Isolation**: Addressed by tenant-scoped records and relations, two independent authorization walls, self-only status, generic denial, and workspace-scoped commission/audit visibility (FR-006..009, FR-015).
- **II — Immutable Financial Truth**: Addressed by immutable subscription/obligation snapshots, exact minor units, append-only collection/reversal-ready ledger, one collection per obligation, commission only on confirmed collections, and idempotency (FR-003..005, FR-009..011).
- **III — Platform Owner Governance & Least Privilege**: PO/WO approval follows ND-F11-6a; capability-matrix impact is explicitly open under ND-F12-1. Commission visibility is PO/WO only; no unlisted capability is inferred.
- **IV — Approved Scope Only**: F13, P2, and P4 exclusions are explicit. Unknown values and all PO decisions remain open; no source-unsupported payment or rejection policy is presented as approved.
- **V — Versioned, Non-Retroactive Content**: Approval uses the committed F10 version and financial snapshot; later catalog changes cannot rewrite issued terms.
- **VI — Human-Governed People Decisions**: No automated discipline, incentives, or trainer compensation decision is added.
- **VII — Privacy & Health-Data Protection**: No P2 health/intake data is added; audit details avoid PII/free text; role-based projections protect commission and client state.
- **VIII — Bilingual, Accessible, Design-System UI**: FR-017 requires the Frontend Design Gate and DESIGN.md; DG-F12-1..4 remain open design choices.
- **IX — Reliable, Idempotent Operations**: Explicit installment identity, serialized state changes, re-authorization after waits, operation receipts, independent obligation uniqueness, and audit rollback behavior are specified.

**Workflow status**: This is specification-only. All ND-F12 and DG-F12 entries remain open; PO spec approval is required before plan/tasks. No plan.md or tasks.md is created. Acceptance criteria are future verification requirements and are not claims of implementation or test completion.
