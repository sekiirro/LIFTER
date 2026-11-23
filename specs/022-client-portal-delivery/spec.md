# Feature Specification: Client Portal Delivery

**Feature Branch**: `022-client-portal-delivery`
**Created**: 2026-11-13
**Status**: Draft - Plan/Tasks/Analyze
**Input**: S54 lane P4 scope; S54-PO-9, S54-PO-11, S54-PO-12 and earlier cited decisions

## User Scenarios & Testing

### User Story 1 — Deliver first plans and activate (Priority: P1)

A staff member publishes a client's first workout or nutrition plan when the subscription is eligible. Either plan may arrive first. The second successful first-plan delivery completes activation once.

**Why this priority**: A client must receive plans and the subscription must activate without requiring a paired publish.

**Independent Test**: Deliver workout and nutrition plans on separate days; verify both delivery records, one activation and the approved productivity result.

**Acceptance Scenarios**:

1. **Given** an eligible initial subscription with no delivered workout or nutrition plan, **When** the trainer uses F19 Ready & Publish for the workout plan, **Then** that plan is delivered and the subscription remains unactivated.
2. **Given** the workout plan was delivered earlier and the subscription remains eligible, **When** the trainer uses Ready & Publish for the first nutrition plan, **Then** both deliveries and activation commit exactly once in the shared F19 transaction.
3. **Given** the completing publish committed but its response was lost, **When** the same operation is retried or a concurrent duplicate publish occurs, **Then** the original result is returned and no second delivery, activation or productivity point is created.
4. **Given** the PO uses the separate F19 override path for an initial subscription, **When** override activation commits, **Then** it remains the F19 exception to normal delivery-triggered activation and, under F19-FR-007, awards the client's one new-client productivity unit only when the client is an eligible new client with no existing unit; a later delivery adds no unit (S57-PO-11).

### User Story 2 — Review delivered plans and subscription (Priority: P1)

A client signs in and sees every delivered plan and the subscription status and end date. For each delivered plan, the client can view any published revision and export the revision currently selected.

**Why this priority**: The client needs an accurate view of all plan work already delivered and the current subscription state.

**Independent Test**: Deliver multiple workout and nutrition plans, publish multiple revisions to one plan, and verify one row per plan, revision selection within the client's own delivered plan, and correct subscription fields.

**Acceptance Scenarios**:

1. **Given** the client has multiple delivered plans, **When** the client opens the dashboard with plan access, **Then** all delivered plans appear once and the latest published revision is selected by default.
2. **Given** a delivered plan has multiple published revisions, **When** the client selects another published revision, **Then** that revision is displayed and remains the revision used by its export actions.
3. **Given** the client has no delivered plans, **When** the dashboard loads, **Then** it shows the approved empty state and still shows subscription status/end date when available.
4. **Given** F13 denies plan entitlement, **When** the client opens the dashboard, **Then** the plan list is hidden and only subscription status, end date and the restricted state are shown.
5. **Given** F13 denies plan entitlement, **When** the client opens a plan or requests an export, **Then** plan content and export are denied while the account/status surface follows F13's allowed account access.

### User Story 3 — Receive in-app plan notices (Priority: P2)

A client receives the approved in-app notification for first-plan delivery and activation. Existing F15 events remain in the same inbox with their existing authorized recipients.

**Why this priority**: A client should learn when a plan becomes available and when the first-plan set activates the subscription.

**Independent Test**: Trigger first-plan delivery and activation; verify the agreed inbox event count, recipient, copy and read behavior without creating a second inbox.

**Acceptance Scenarios**:

1. **Given** an eligible client's first plan is delivered, **When** the delivery transaction commits, **Then** the approved plan-delivery notice is written once to the client's in-app inbox.
2. **Given** a first-plan delivery completes the workout/nutrition pair and activates the subscription, **When** that delivery transaction commits, **Then** its single notice says the plan is ready and the subscription is active; the first-plan pair produces exactly two notices.
3. **Given** an existing F15 event is in the inbox, **When** an authorized recipient opens the inbox, **Then** that event remains available through the same F15 inbox surface and its established authorization and deduplication rules.

### User Story 4 — Export a published plan (Priority: P2)

A client with plan entitlement exports a selected published revision of their own delivered workout or nutrition plan in PDF or Excel.

**Why this priority**: Client PDF and Excel plan exports are explicitly in v1.

**Independent Test**: Export selected published revisions of the client's delivered workout and nutrition plans in each format; verify content fidelity, client-selected nutrition alternatives and totals, and denied draft/foreign-client access.

**Acceptance Scenarios**:

1. **Given** a client has plan entitlement and is viewing a published revision of their own delivered plan, **When** they request PDF or Excel, **Then** the export contains the revision currently selected/viewed and follows the F17/F18 export contracts.
2. **Given** a request targets a draft, another client's plan, or a restricted entitlement, **When** an export is requested, **Then** no plan content is returned.
3. **Given** nutrition alternatives were selected for the exported revision, **When** the nutrition plan is exported, **Then** client selections and recalculated totals follow F18's established revision-specific export behavior.

### User Story 5 — Find clients and outstanding work (Priority: P1)

Workspace staff use the client directory to find authorized clients and spot new check-ins, pending food replacements, and plans waiting for delivery.

**Why this priority**: Staff need one workspace-authorized starting point for client work and the actionable indicators named in BRD-06.

**Independent Test**: Seed clients and matching check-in, food-replacement and plan-delivery states in two workspaces; verify the authorized directory shows the three indicators only for accessible clients and cannot reveal the other workspace.

**Acceptance Scenarios**:

1. **Given** a staff member has access to a workspace with clients, **When** they open its directory, **Then** they can search by client name, email, phone or client code and filter by existing account/approval status, subscription status or responsible-trainer assignment state, while seeing indicators for new check-ins, pending food replacements and plans waiting for delivery.
2. **Given** a staff member searches or filters by the approved fields and facets, **When** results are returned, **Then** only clients in their authorized workspace(s) are included and F11/F13 existing authorization and statuses are used.
3. **Given** a client has a new check-in, pending food replacement, or plan waiting for delivery, **When** the authorized directory row is shown, **Then** the corresponding indicator links into the existing F15/F18/F19 work surface without duplicating its behavior.

## Client Section Audit — BRD/PRD Only

This is a gap audit of the checked-out LIFTER source and committed specs; no YBS material is used (S54-PO-11). Only P4 gaps are specified here. Existing ownership is reused.

| BRD/PRD client-section requirement                                                                                                      | Existing LIFTER surface or contract                                                                                                                                                                                                                                                                 | Gap / disposition in this spec                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client accounts and authorized client identity (PRD-02; BRD-02)                                                                         | F11 `specs/011-client-accounts/spec.md`, account authorization and `app/(client)/account/status`                                                                                                                                                                                                    | Reuse. P4 adds no registration, identity or credential rules.                                                                                                                                                                                                                                                                                                                                                                         |
| Client plan dashboard and subscription state (PRD-01, PRD-06, PRD-07; roadmap P4)                                                       | F19 client projection contract defines delivered plan identity, latest revision and self-read boundary; F13 defines entitlement projection. Current client pages include welcome, assigned forms and account status, but no plans dashboard.                                                        | Gap: dashboard view and subscription status/end-date presentation (FR-004–006).                                                                                                                                                                                                                                                                                                                                                       |
| PDF and Excel exports of plans (PRD-04, PRD-05; S54-PO-12)                                                                              | F17 export FR-017/018 and T037–T041; F18 export FR-006/014 and T023.                                                                                                                                                                                                                                | Gap: client-authorized export entry point and enforcement using these outputs, without a second renderer (FR-008).                                                                                                                                                                                                                                                                                                                    |
| In-app notifications (PRD-10)                                                                                                           | F15 `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; committed inbox rows currently address staff alert recipients. PR #58 is open for F15 UI work.                                                                                                   | Gap: first-plan/activation client events and client inbox access. Extend the F15 inbox/event surface; preserve existing F15 event recipients and do not create another inbox (FR-009).                                                                                                                                                                                                                                                |
| Staff client directory: search, filters, accountability indicators and actionable indicators (BRD-06; PRD-01 Trainer workspace; PRD-11) | F11 specifies client accounts, approval, assignment and unassigned-client behavior. F20 specifies staff Client Details/Notes (PR #90 merged). No staff client-directory page was found in this checkout.                                                                                            | P4 v1 adds the directory, search, filters and the BRD indicators for new check-ins, pending food replacements, and plans waiting for delivery. Search the existing name, email, phone and client-code fields; filter by existing account/approval status, subscription status and responsible-trainer assignment state. Reuse F11/F13/F20 data and authorization; add no statuses or duplicate account, assignment or notes behavior. |
| Client forms, measurements, progress, food alternatives, settings and history (PRD-01, PRD-03, PRD-05, PRD-09)                          | Assigned client forms exist at `app/(client)/forms/[assignmentId]`; F15 owns form assignment and submission. F18 owns nutrition selection/export rules. F20 owns staff notes, not client history. No client settings, measurements/progress or client plan-history page was found in this checkout. | Reuse F15/F18 behavior. Settings, progress/measurements and broader history are gaps outside this P4 plan-delivery spec; do not duplicate F15/F18/F20 or imply they are implemented.                                                                                                                                                                                                                                                  |
| Comprehensive client-data exports                                                                                                       | BRD-06 and PRD-11 reserve comprehensive export to Platform Owner.                                                                                                                                                                                                                                   | Out of scope. P4 adds per-plan client PDF/Excel only; no client dataset export.                                                                                                                                                                                                                                                                                                                                                       |
| Migration or synchronization from YBS                                                                                                   | BRD-06; roadmap says no migration.                                                                                                                                                                                                                                                                  | Out of scope; no import or synchronization (S54-PO-11).                                                                                                                                                                                                                                                                                                                                                                               |

## Scope and Deferrals

- Finance reporting is deferred past v1 by S54-PO-9 P4-Q7=A. This is a deferral note only; no finance functional requirement is defined here.
- Comprehensive client-data export remains Platform Owner-only. P4 includes per-plan client PDF/Excel export only.
- YBS import/synchronization, P5 progress/check-in features, and new lifecycle rules are outside this spec.

## Requirements

### Functional Requirements

- **FR-001 — Independent first-plan delivery**: For an eligible subscription, F19 Ready & Publish MUST deliver a workout plan or nutrition plan independently, including on different days. A successful delivery MUST use the existing F19 `plan_deliveries` record and idempotency contract. P4 MUST NOT add a separate Deliver action, delivery table or paired-publish workflow. (S54-PO-9 P4-Q1=A; S42-PO-2 F19 decision; `specs/019-plan-core/spec.md` F19-FR-002/007; PRD-06.)
- **FR-002 — Exactly-once activation**: In the normal first-delivery flow, the initial subscription MUST activate exactly once, atomically with the successful delivery that completes the first workout/nutrition pair. A single delivery MUST NOT activate it; later revisions MUST NOT repeat activation. The existing F19 PO override remains its separate exception. P4 MUST reuse the F19 activation transaction and subscription continuity behavior. (S54-PO-9 P4-Q1 written delivery rule; S42-PO-2; F19-FR-002/007/011; PRD-06.)
- **FR-003 — Productivity point transaction and recipient**: Each new client earns one productivity unit, once, on first activation, written atomically by F19 inside its activation transaction (F19-FR-007, T021/T022). On normal first-pair activation the recipient MUST be the trainer assigned at activation time; if none is assigned, the Trainer who completed the publish under the existing F19 rule. PO override activation MUST award the client's one new-client unit when the client is an eligible new client with no existing unit, to the F19-selected recipient; a later delivery MUST NOT add another. Later publications, revisions, renewal or replay MUST NOT add a unit. P4 consumes this F19 behavior and adds no unit writer. (S48-PO-15; S54-PO-9 P4-Q2=A and P4-Q3=A; S57-PO-11, which supersedes the S48-PO-19 zero-point override rule for this spec; F19-FR-007; F13 T044; PRD-06/08.)
- **FR-004 — Delivered-plan dashboard and revision selection**: When F13 permits plan access, the client dashboard MUST list all plans delivered to the authenticated client, with one entry per stable F19 plan identity and the latest published revision selected by default. The client MUST be able to select and view any published revision of each of their own delivered plans; the plan body is rendered by the F17 (workout) and F18 (nutrition) shared read-only plan views, which their print/export also reuse, and P4 MUST NOT build a plan renderer (S57-PO-9). The dashboard MUST omit drafts and other clients' plans. When F13 denies plan entitlement, it MUST hide the plan list and show only subscription status, end date and the restricted state. (S54-PO-9 written P4-Q5; S55-PO-3 Q2 and Q5, PO wording; F19 `plan_deliveries` and `plan-core-client.md`/`plan-core-delivery-projection.md`; F13 FR-028/030/032; PRD-01/04/05/06/07.)
- **FR-005 — Subscription summary**: The client dashboard MUST show the subscription status and end date from F13's authoritative subscription projection. It MUST NOT compute lifecycle status, expiry, overdue state, or dates independently. The end date is displayed as the last covered day: F13's exclusive end boundary minus one Cairo calendar day, a display-only shift that leaves F13 data unchanged (S57-PO-5). The status uses the approved S57-PO-12 labels. "Refunded" is shown only when the subscription was fully refunded, meaning every collected F13 obligation of the continuous subscription has F13 refund state `refunded` (refunded principal at least the collected amount, as F13 `subscription_payment_status` reports it). F13 projects any refund, full or partial, as the terminal `refunded` state and has no other state for a partial refund, so a partially refunded subscription shows no status label. The staff directory uses separate staff wording for the same states (S57-PO-13), and its Refunded filter matches full refunds only. (S54-PO-9 P4-Q5 written decision; S57-PO-5; S57-PO-12; F13 FR-014/015/019/028/030; PRD-01/07.)
- **FR-006 — Entitlement enforcement**: Every plan read and export MUST consume F13's authoritative plan entitlement and independently applicable overdue restriction. Expiry and overdue MUST restrict plan content and exports while preserving account/settings/support access as allowed by F13. P4 MUST NOT create a second subscription lifecycle, entitlement state machine, expiry clock, or overdue calculation. (S54-PO-9 P4 scope; F13 FR-028/030/032 and `contracts/lifecycle-and-entitlement.md`; BRD-04.8; PRD-07.)
- **FR-007 — F13 lifecycle changes**: When F13 entitlement changes because of expiry, overdue, freeze, refund or another existing F13 rule, P4 MUST reflect the current entitlement on each new plan read/export authorization decision; cached UI state MUST NOT grant access after the authoritative decision denies it. F13 remains the lifecycle owner. (S54-PO-9 scope (e); F13 FR-028/033/035; BRD-04.8; PRD-07.)
- **FR-008 — Client plan exports**: Clients MUST be able to export published workout and nutrition revisions of their own delivered plans as PDF and Excel when F13 permits plan access. Each export MUST contain the revision currently selected/viewed by that client. Exports MUST reuse and align with F17 export content/security rules in FR-017/018 and T037–T041, and F18 export rules in FR-006/014 and T023, including client selections, revision-specific nutrition totals and spreadsheet formula-injection protection. P4 MUST NOT create duplicate plan payloads or export engines. Drafts, foreign-client content and restricted plans MUST be denied. (S54-PO-12; S55-PO-3 Q2, PO wording; PRD-04/05; F17/F18 requirements and tasks cited above.)
- **FR-009 — In-app notifications**: P4 MUST deliver first-plan delivery notices through the F15 in-app inbox surface, one notice per first-plan delivery. The notice for the delivery that completes the workout/nutrition pair MUST also state that activation is complete; a normal first-plan pair produces exactly two notices total. Existing F15 events MUST remain in that same inbox under their existing authorized-recipient, idempotency/deduplication, read-state and safe-payload rules. P4 MUST extend the existing inbox for the client recipient where needed; it MUST NOT create a separate notification inbox or duplicate F15 event generation. Under S57-PO-10, F19 adds the delivery/activation hook as its own task and calls the P4 client-recipient extension; P4 extends the F15 inbox to client recipients with a client-owned notice record beside the unchanged F15 staff inbox rows (same IDs-only payload, producer-keyed deduplication and read-state rules), a client-only read/mark-read surface and one server-side enqueue seam. Spec 023 check-in reminders reuse the same seam. P4 MUST NOT emit delivery or activation notices without the F19 hook. The client notice read and mark-read surfaces deliberately do not apply F13 entitlement: a restricted client may still read notice kind and timestamps (IDs-only rows, approved text by kind), which carry no plan content; plan content stays gated by FR-004/FR-006. (S54-PO-9 P4-Q4=A; S54-PO-11; S55-PO-3 Q3, PO wording; S57-PO-10; F15 FR-018/024; `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; PR #58.)
- **FR-010 — Client identity and privacy**: Client-facing reads and exports MUST derive the client from the authenticated client identity, enforce current workspace and entitlement authorization at the server boundary, exclude drafts and staff-only attribution/audit fields, and return no other client's information. (F19 `plan-core-client.md` Authorization and projection contract; F11 FR-008; F13 FR-030/033; PRD-02/13.)
- **FR-011 — Staff client directory**: P4 v1 MUST provide authorized workspace staff a searchable and filterable client directory with actionable indicators for new check-ins, pending food replacements, and plans waiting for delivery, as named in BRD-06. It MUST reuse F11's client identity, workspace, account and assignment rules and F20's client details/notes surface; it MUST NOT duplicate these contracts or permit bulk client actions. Search by existing name, email, phone and client code; filter by existing account/approval status, subscription status and responsible-trainer assignment state. Client-code search/output and assignment-state filter/output are PO/WO-only: available only to Platform Owners and Workspace Owners in that workspace. Trainers MUST receive no client-code or assignment-state visibility, and client-code searches by Trainers MUST return no clients. Reuse F11/F13/F20 data and authorization; add no new statuses. (S55-PO-3 Q1 and S55-PO-7 S55-022-Q6, PO wording; S70-PO-1 item 1; BRD-06; PRD-01/11; `specs/011-client-accounts/spec.md`; `specs/020-client-notes/spec.md`; PR #90 (merged).)
- **FR-012 — Comprehensive export boundary**: Per-plan client export MUST NOT expose comprehensive client datasets; those remain Platform Owner-only under BRD-06/PRD-11. (BRD-06; PRD-11.)
- **FR-013 — No YBS access or sync**: P4 MUST rely on LIFTER's BRD/PRD and existing LIFTER code/specs only. It MUST add no YBS access, migration, synchronization or YBS-derived behavior. (S54-PO-11; BRD-06; roadmap.)

### Key Entities

- **Plan delivery**: Existing F19 record binding a client, stable plan, subscription, kind and immutable published revision. P4 creates no new delivery entity.
- **Delivered plan projection**: Client-safe view of each delivered plan's latest published revision, restricted by F13 entitlement.
- **Subscription summary**: Client-safe status, last covered day and, for a refunded subscription only, the F13 full/partial refund scope, all from F13's existing authoritative state.
- **Inbox event**: Existing F15 event/delivery/inbox item for staff recipients; for client recipients, a P4 client notice record in the same inbox surface with first-plan delivery/activation and spec 023 reminder kinds (S57-PO-10).
- **Productivity point**: The one new-client unit written by F19 in its activation transaction, normal or PO override (S48-PO-15; S57-PO-11).

### Success Criteria

- **SC-001**: In all acceptance cases, each first workout/nutrition publish succeeds independently and creates exactly one F19 delivery record.
- **SC-002**: Across retries and concurrent completion attempts, 100% of eligible first plan pairs produce exactly one activation; no single plan or later revision produces another activation.
- **SC-003**: 100% of successful first activations of an eligible new client, normal first-pair or PO override, write exactly one unit to the approved recipient in the same transaction; 100% of later publications, revisions, renewals, replays and returning or already-credited clients write zero units (S57-PO-11).
- **SC-004**: For an entitled client, the dashboard returns 100% of that client's delivered plan identities exactly once, selects the latest published revision by default, and returns zero drafts or foreign-client plans.
- **SC-005**: For each own delivered plan with multiple published revisions, the client can view each published revision and every PDF/Excel export contains the revision currently selected/viewed.
- **SC-006**: 100% of client plan reads and PDF/Excel export attempts denied by F13 entitlement return no plan content; the restricted dashboard shows only subscription status, end date and restricted state.
- **SC-007**: Every first-plan pair creates exactly two client notices, one for each first-plan delivery; the completing delivery's notice also states activation is complete, and no notice is duplicated.
- **SC-008**: Authorized directory results are limited to the staff member's workspace(s) and expose the three BRD-06 actionable indicators; the directory adds no duplicate F11/F20 ownership or bulk client actions.
- **SC-009**: 100% of client exports match the applicable F17/F18 field and safety contracts, including nutrition selection and total rules and formula-injection neutralization.
- **SC-010**: The client-section audit accounts for each BRD/PRD requirement listed in the audit table and adds no duplicate F11/F15/F18/F20 ownership.

### Assumptions

- F19 and F13 remain the authorities for delivery, activation, plan projection, subscription status and entitlement.
- The F15 in-app inbox is the only in-app inbox surface; P4 extends its client reach rather than introducing another inbox.
- F17/F18 own plan export content and format fidelity; P4 owns client access and entitlement enforcement at the portal boundary.
- The staff directory is in P4 v1 and uses only existing F11/F13/F20 data and authorization for its search and filters.
- Every row in `copy-proposal.md` is approved copy (S55-PO-10, S55-PO-11, S57-PO-12, S57-PO-13); no proposed or pending rows remain.

### Edge Cases

- One first plan is delivered and the second plan is not yet published: the first plan remains delivered, but normal activation waits for the second successful delivery.
- Two publishers complete the last missing first-plan delivery concurrently or a request is retried after a lost response: F19 idempotency and transaction rules produce one activation and one productivity result.
- A PO uses F19 override before either plan is delivered: the existing override behavior remains authoritative; the override earns the client's one new-client unit when the client is eligible, and later deliveries earn none (S57-PO-11).
- A client has no delivered plans: render the approved empty state while retaining available subscription status/end date.
- F13 denies entitlement after the dashboard was loaded: a fresh plan read/export is denied even if the UI still shows stale data.
- Client export targets a draft, another client, or an entitlement-restricted plan: return no plan content.
- A client changes the selected published revision: the displayed revision and subsequent export target stay aligned; another client's revision is never selectable.
- Staff search or filtering spans workspaces: server authorization returns only clients in the staff member's authorized workspace(s).

## Clarifications

- **2026-11-23 — S70-PO-1 item 1:** F22 is open for completion. Assignment-filter and client-code visibility are limited to Platform Owners and the Workspace Owner of the same workspace. Trainers receive neither assignment state nor client-code visibility, and their client-code search returns no clients. The PO approved the proposed AR/EN copy; the exact assignment-filter and client-code label rows were not present in `copy-proposal.md` at review time, so those UI strings remain blocked until the approved artifact/source is identified. No copy is inferred.

### Session 2026-11-13 — Decisions recorded

- **2026-11-13 - S55-PO-7, S55-022-Q6 (PO wording):** "Search name, email, phone and client code. Filter by account/approval status, subscription status and responsible-trainer assignment. Uses existing data only; no new statuses." Encoded in FR-011, User Story 5, its scenarios, the client-section audit and the directory copy proposal. Reuse F11/F13/F20 data and authorization.
- **2026-11-13 - S55-PO-4 (PO wording):** "Arabic polish applies to spec 022 copy only." Applied only to this spec copy proposal; matched strings are now approved copy (S55-PO-10), unmatched strings remain pending PO approval.

- First workout and nutrition delivery can happen independently; F19 Ready & Publish on an eligible subscription is the delivery action. Reuse `plan_deliveries` and F19's activation transaction. Source: S54-PO-9 (P4-Q1=A), S42-PO-2, `specs/019-plan-core/spec.md` F19-FR-002/007.
- Activation occurs exactly once only after both first plans are successfully delivered. Source: S54-PO-9 (P4-Q1), PRD-06, F19-FR-007/011.
- A normal first complete plan set awards one productivity point; PO override awards zero. Wire F13 T044 inside the first-delivery transaction. Source: S48-PO-15, S48-PO-19, S54-PO-9 (P4-Q2=A). Superseded for the override case by S57-PO-11 (2026-11-14): the override gives the one new-client unit under F19.
- Productivity recipient is the activation-time assigned trainer, or the completing publisher when no trainer is assigned, under F19. Source: S54-PO-9 (P4-Q3=A), F19-FR-011 and client-delivery transaction contract.
- In-app notifications cover first-plan delivery/activation plus existing F15 events, reusing the F15 inbox. Source: S54-PO-9 (P4-Q4=A), S54-PO-11; F15 FR-018/024.
- Dashboard includes all delivered plans, defaults to the latest published revision per plan while allowing the client to view any published revision of their own delivered plan, and shows subscription status and end date. Source: S54-PO-9 (written P4-Q5); S55-PO-3 Q2.
- Client-section audit uses LIFTER's BRD/PRD only, audits existing code/specs, and specifies gaps while reusing existing ownership; no YBS access. Source: S54-PO-9 (written P4-Q6), S54-PO-11, BRD-06.
- Finance reporting is deferred after v1. Source: S54-PO-9 (P4-Q7=A).
- Client PDF and Excel exports are in v1; align with and reuse F17/F18 export work. Source: S54-PO-11 (S54-EXPORTS-V1), S54-PO-12, PRD-04/05.
- Expiry and overdue restrictions consume F13 entitlement and preserve allowed account access; no duplicated lifecycle logic. Source: F13 FR-028/030/032, BRD-04.8, PRD-07, S54 scope item (e).
- User-visible copy is approved in `copy-proposal.md` (S55-PO-10, S55-PO-11, S57-PO-12, S57-PO-13), and Arabic is natural Egyptian colloquial. Source: S54-PO-11; S48-PO-4.
- Reuse F11 client identity/account rules, F15 forms/inbox, F18 nutrition selection/export logic, F20 notes and existing F19 plan contracts. Source: S54-PO-9/11; `specs/011-client-accounts/spec.md`, `specs/015-forms-intake/spec.md`, `specs/018-nutrition-planner/spec.md`, `specs/019-plan-core/spec.md`, `specs/020-client-notes/spec.md`.
- **2026-11-13 — S55-PO-3, Q1 (PO wording):** “include BRD/PRD staff client-directory search, filters and actionable indicators in P4 v1; reuse F11/F20 contracts, no duplication.” Encoded in FR-011 and User Story 5. The search fields and filter facets follow the resolved S55-PO-7 decision.
- **2026-11-13 — S55-PO-3, Q2 (PO wording):** “export the revision currently selected/viewed”: the client may view any published revision of their own delivered plan and exports the one being viewed; authorization is limited to the client's own delivered plans; align with F17 T037-T041 / F18 T023. Encoded in FR-004/008, SC-004/005 and User Story 2/4.
- **2026-11-13 — S55-PO-3, Q3 (PO wording):** “one notice per first-plan delivery; the completing delivery's notice also states activation is complete (two notices total).” Encoded in FR-009, SC-007 and User Story 3.
- **2026-11-13 — S55-PO-3, Q4 (PO wording):** “polish ALL Arabic UI copy into natural Egyptian colloquial, matching my writing style; keep English professional”. Applied to every Arabic entry in `copy-proposal.md`; matched rows are now approved copy (S55-PO-10), unmatched rows remain pending PO approval.
- **2026-11-13 — S55-PO-3, Q5 (PO wording):** “on entitlement denial hide the plan list; show only subscription status/end date + restricted state.” Encoded in FR-004/006, SC-006, User Story 2 and its scenarios.

## Dependencies

1. **F19 Plan Core** — `plan_deliveries`, Ready & Publish, initial activation transaction, idempotency and client projection; `specs/019-plan-core/spec.md` F19-FR-002/007/011 and `contracts/plan-core-client.md`, `contracts/plan-core-delivery-projection.md`. Reuse; do not redefine.
2. **F13 Lifecycle and entitlement** — FR-028/030/032/033 and `contracts/lifecycle-and-entitlement.md`; PR #88 merged; T044 remains P4 wiring. P4 consumes status/entitlement and supplies the approved productivity recipient within F19's transaction.
3. **F15 Forms and inbox** — FR-018/024, `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; open PR #58. P4 adds client event reach to the existing inbox surface.
4. **F17 Workout Planner** — FR-017/018, export work T037–T041. P4 reuses its published-plan PDF/Excel output and safety contract.
5. **F18 Nutrition Planner** — FR-006/014, T023. P4 reuses client-selection, revision-specific export and totals behavior.
6. **F11 Client Accounts** — existing identity, account and assignment rules in `specs/011-client-accounts/spec.md`.
7. **F20 Client Notes** — `specs/020-client-notes/spec.md`; staff Client Details/Notes (PR #90, merged). P4 adds no duplicate notes or account detail behavior.
8. **BRD/PRD** — `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md` §§ BRD-04.8, BRD-06, PRD-01/04/05/06/07/10/11/13/14.

### Reuse and overlap boundaries

- **F13 Lifecycle and entitlement** (`specs/013-freeze-renewal-refunds/spec.md`): consume its authoritative subscription and plan-access decisions; add no lifecycle or entitlement state machine.
- **F15 Forms and inbox** (`specs/015-forms-intake/spec.md`): reuse check-in and inbox contracts; add no second inbox or check-in behavior.
- **F17 Workout Planner** (`specs/017-workout-planner/spec.md`) and **F18 Nutrition Planner** (`specs/018-nutrition-planner/spec.md`): reuse revision-specific plan export rules and existing workout/nutrition behavior; add no renderers or alternate-selection logic.
- **F19 Plan Core** (`specs/019-plan-core/spec.md`): reuse delivery, revision, activation and client projection contracts; add no delivery entity or publish path.
- **F20 Client Notes** (`specs/020-client-notes/spec.md`): reuse Client Details/Notes; add no duplicate notes or account detail surface.
- **F21 Staff Display Names** (`specs/021-staff-display-names/spec.md`): its authorized staff-name feature remains scoped to the Client Notes author line; do not extend it to directory search/display as part of P4. Directory search is limited to existing F11 identity fields: name, email, phone and client code; no F21 display-name behavior is added.
- **Client navigation**: P4 adds no leaderboard entry to the client main navigation; the spec 024 Top 5 belongs inside Progress (S57-PO-12).
- **Specs 023/024**: no `specs/023-*` or `specs/024-*` feature spec exists in this checkout. P4 claims no ownership of their future scope; when specified, they must reuse the authorities above and must not duplicate this portal's delivery, directory, or export behavior.

## Open questions for the PO

None.

### S56-PO-4 - 2026-11-14

PO S56-PO-4 (2026-11-14): "LIFTER isn't live yet. Cancel Feature Flag Spec 025, remove its blockers from other specs, and continue development normally. Reconsider flags before production. Keep tests and regression safeguards."

### S57-PO-5 - 2026-11-14

PO S57-PO-5 (2026-11-14), subscription end display; the PO selected "Last covered day": "Display-only shift: show the last day the client actually has access. F13 data is unchanged." Encoded in FR-005.

### S57-PO-9 - 2026-11-14

PO S57-PO-9 (2026-11-14), plan viewer; the PO selected "F17/F18 shared view": "F17 and F18 each build one read-only plan view that their print/export and the client portal both reuse." Encoded in FR-004; the plan body stays blocked until those views merge.

### S57-PO-10 - 2026-11-14

PO S57-PO-10 (2026-11-14), client notices; the PO selected "F19 hook + F22 inbox": "F19 adds a delivery/activation hook as its own task. F22 extends the F15 inbox to client recipients and sends the approved notices. 023 reminders then reuse that client inbox." Encoded in FR-009 and the Inbox event entity.

### S57-PO-11 - 2026-11-14

PO S57-PO-11 (2026-11-14), FR-003 / US1 #4 / SC-003; the PO selected "F19 is right": "Override still gives the one new-client unit. Fix F22's FR-003, US1 #4 and SC-003 to match." Encoded in FR-003, User Story 1 scenario 4, SC-003, the edge cases and the Productivity point entity. It supersedes the S48-PO-19 zero-point override rule in this spec.

### S57-PO-12 - 2026-11-15

PO S57-PO-12 (2026-11-15), copy and placement: "Continue F22/F23/F24 independent tasks in parallel. Do not wait for F17/F18/F19 completion. Pause only blocked integrations. Do not modify F17/F18/F19-owned code or duplicate their functionality. Focus on UI, approved copy, full ranking, measurements, tests, and security. Keep PRs updated, clearly report blockers, and coordinate shared files. No merge without my authorization. [...] Top 5 belongs inside Progress, not Main Navigation. Every eligible client sees their private full rank; only the public Top 5 is visible to others. Preserve all other approved copy. Update specs, UI strings, and affected tests."

Approved F22 subscription status copy (AR approved; EN is the label word as given): Active / اشتراكك شغّال; Frozen / اشتراكك متوقف مؤقتًا; Expired / اشتراكك انتهى; Awaiting Activation / اشتراكك لسه ما اتفعّلش; Future / اشتراكك لسه ما بدأش; Refunded / فلوس الاشتراك اترجعت. "Refunded" is shown "only if fully refunded". Encoded in FR-005, copy-proposal.md and the Client navigation reuse boundary.

### S57-PO-13 - 2026-11-15

PO S57-PO-13 (2026-11-15): "Approve the reviewed EN/Arabic UI copy for F22/F23/F24, with these changes: ... Use separate staff subscription status labels: شغّال، متوقف مؤقتًا، منتهي، مستني التفعيل، لسه ما بدأش، تم رد المبلغ. ... Finish all independent tasks and tests in #108–#110. Don't implement blocked dependencies or change F17/F18/F19-owned code."

Encoded in FR-005, the staff directory contract, T035 and copy-proposal.md. The staff directory (filter and rows) uses `staff.clientDirectory.subscriptionStatus.*` for active, frozen, expired, awaiting activation, future and refunded (full refund only). The client portal keeps the approved S57-PO-12 labels. The English staff labels reuse the label words already approved for the portal. All remaining proposed F22 copy is approved as proposed; no F22 copy is pending.
