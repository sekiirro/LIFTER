# Feature Specification: Client Portal Delivery

**Feature Branch**: `022-client-portal-delivery`
**Created**: 2026-11-13
**Status**: Draft — Clarify; PO questions open
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
4. **Given** the PO uses the separate F19 override path for an initial subscription, **When** override activation commits, **Then** it remains the F19 exception to normal delivery-triggered activation and awards no productivity point.

### User Story 2 — Review delivered plans and subscription (Priority: P1)

A client signs in and sees every delivered plan, the newest published revision for each plan, and the subscription status and end date.

**Why this priority**: The client needs an accurate view of all plan work already delivered and the current subscription state.

**Independent Test**: Deliver multiple workout and nutrition plans, publish a later revision to one plan, and verify one row per plan with the newest revision and correct subscription fields.

**Acceptance Scenarios**:

1. **Given** the client has multiple delivered plans and one plan has a newer published revision, **When** the client opens the dashboard with plan access, **Then** all delivered plans appear once and that plan shows its latest published revision.
2. **Given** the client has no delivered plans, **When** the dashboard loads, **Then** it shows the empty state using the copy proposal pending approval and still shows subscription status/end date when available.
3. **Given** F13 says plan entitlement is restricted by expiry, overdue status or another authoritative restriction, **When** the client opens a plan or requests an export, **Then** plan content and export are denied while the account/status surface follows F13's allowed account access.

### User Story 3 — Receive in-app plan notices (Priority: P2)

A client receives the approved in-app notification for first-plan delivery and activation. Existing F15 events remain in the same inbox with their existing authorized recipients.

**Why this priority**: A client should learn when a plan becomes available and when the first-plan set activates the subscription.

**Independent Test**: Trigger first-plan delivery and activation; verify the agreed inbox event count, recipient, copy and read behavior without creating a second inbox.

**Acceptance Scenarios**:

1. **Given** an eligible client's first plan is delivered, **When** the delivery transaction commits, **Then** the approved plan-delivery notice is written once to the client's in-app inbox.
2. **Given** the second first plan completes activation, **When** the activation transaction commits, **Then** the approved activation notice follows the event granularity selected in `S54-022-Q3`.
3. **Given** an existing F15 event is in the inbox, **When** an authorized recipient opens the inbox, **Then** that event remains available through the same F15 inbox surface and its established authorization and deduplication rules.

### User Story 4 — Export a published plan (Priority: P2)

A client with plan entitlement exports a published workout or nutrition plan in PDF or Excel.

**Why this priority**: Client PDF and Excel plan exports are explicitly in v1.

**Independent Test**: Export published workout and nutrition plans in each format; verify content fidelity, client-selected nutrition alternatives and totals, denied draft/foreign access and the selected revision rule from `S54-022-Q4`.

**Acceptance Scenarios**:

1. **Given** a client has plan entitlement and an authorized published plan, **When** they request PDF or Excel, **Then** the export contains only the revision allowed by `S54-022-Q4` and follows the F17/F18 export contracts.
2. **Given** a request targets a draft, another client's plan, or a restricted entitlement, **When** an export is requested, **Then** no plan content is returned.
3. **Given** nutrition alternatives were selected for the exported revision, **When** the nutrition plan is exported, **Then** client selections and recalculated totals follow F18's established revision-specific export behavior.

## Client Section Audit — BRD/PRD Only

This is a gap audit of the checked-out LIFTER source and committed specs; no YBS material is used (S54-PO-11). Only P4 gaps are specified here. Existing ownership is reused.

| BRD/PRD client-section requirement                                                                                                      | Existing LIFTER surface or contract                                                                                                                                                                                                                                                                 | Gap / disposition in this spec                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client accounts and authorized client identity (PRD-02; BRD-02)                                                                         | F11 `specs/011-client-accounts/spec.md`, account authorization and `app/(client)/account/status`                                                                                                                                                                                                    | Reuse. P4 adds no registration, identity or credential rules.                                                                                                                          |
| Client plan dashboard and subscription state (PRD-01, PRD-06, PRD-07; roadmap P4)                                                       | F19 client projection contract defines delivered plan identity, latest revision and self-read boundary; F13 defines entitlement projection. Current client pages include welcome, assigned forms and account status, but no plans dashboard.                                                        | Gap: dashboard view and subscription status/end-date presentation (FR-004–006).                                                                                                        |
| PDF and Excel exports of plans (PRD-04, PRD-05; S54-PO-12)                                                                              | F17 export FR-017/018 and T037–T041; F18 export FR-006/014 and T023.                                                                                                                                                                                                                                | Gap: client-authorized export entry point and enforcement using these outputs, without a second renderer (FR-008).                                                                     |
| In-app notifications (PRD-10)                                                                                                           | F15 `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; committed inbox rows currently address staff alert recipients. PR #58 is open for F15 UI work.                                                                                                   | Gap: first-plan/activation client events and client inbox access. Extend the F15 inbox/event surface; preserve existing F15 event recipients and do not create another inbox (FR-009). |
| Staff client directory: search, filters, accountability indicators and actionable indicators (BRD-06; PRD-01 Trainer workspace; PRD-11) | F11 specifies client accounts, approval, assignment and unassigned-client behavior. F20 specifies staff Client Details/Notes; PR #90 is open. No staff client-directory page was found in this checkout.                                                                                            | Gap found; whether this directory gap belongs in P4 v1 is open in `S54-022-Q1`. No duplicate account, assignment, or notes behavior is specified.                                      |
| Client forms, measurements, progress, food alternatives, settings and history (PRD-01, PRD-03, PRD-05, PRD-09)                          | Assigned client forms exist at `app/(client)/forms/[assignmentId]`; F15 owns form assignment and submission. F18 owns nutrition selection/export rules. F20 owns staff notes, not client history. No client settings, measurements/progress or client plan-history page was found in this checkout. | Reuse F15/F18 behavior. Settings, progress/measurements and broader history are gaps outside this P4 plan-delivery spec; do not duplicate F15/F18/F20 or imply they are implemented.   |
| Comprehensive client-data exports                                                                                                       | BRD-06 and PRD-11 reserve comprehensive export to Platform Owner.                                                                                                                                                                                                                                   | Out of scope. P4 adds per-plan client PDF/Excel only; no client dataset export.                                                                                                        |
| Migration or synchronization from YBS                                                                                                   | BRD-06; roadmap says no migration.                                                                                                                                                                                                                                                                  | Out of scope; no import or synchronization (S54-PO-11).                                                                                                                                |

## Scope and Deferrals

- Finance reporting is deferred past v1 by S54-PO-9 P4-Q7=A. This is a deferral note only; no finance functional requirement is defined here.
- Comprehensive client-data export remains Platform Owner-only. P4 includes per-plan client PDF/Excel export only.
- YBS import/synchronization, P5 progress/check-in features, and new lifecycle rules are outside this spec.

## Requirements

### Functional Requirements

- **FR-001 — Independent first-plan delivery**: For an eligible subscription, F19 Ready & Publish MUST deliver a workout plan or nutrition plan independently, including on different days. A successful delivery MUST use the existing F19 `plan_deliveries` record and idempotency contract. P4 MUST NOT add a separate Deliver action, delivery table or paired-publish workflow. (S54-PO-9 P4-Q1=A; S42-PO-2 F19 decision; `specs/019-plan-core/spec.md` F19-FR-002/007; PRD-06.)
- **FR-002 — Exactly-once activation**: In the normal first-delivery flow, the initial subscription MUST activate exactly once, atomically with the successful delivery that completes the first workout/nutrition pair. A single delivery MUST NOT activate it; later revisions MUST NOT repeat activation. The existing F19 PO override remains its separate exception. P4 MUST reuse the F19 activation transaction and subscription continuity behavior. (S54-PO-9 P4-Q1 written delivery rule; S42-PO-2; F19-FR-002/007/011; PRD-06.)
- **FR-003 — Productivity point transaction and recipient**: On normal first-pair activation, P4 MUST write the single approved productivity point within the F19 first-delivery/activation transaction, using F13's T044 storage/rules. The recipient MUST be the trainer assigned at activation time; if none is assigned, use the trainer who completed the publish under the existing F19 rule. PO override activation MUST award zero points. Later publications, revisions, renewal or replay MUST NOT add a point. (S48-PO-15; S48-PO-19; S54-PO-9 P4-Q2=A and P4-Q3=A; F19-FR-011; F13 T044; PRD-06/08.)
- **FR-004 — Delivered-plan dashboard**: The client dashboard MUST list all plans delivered to the authenticated client for which plan entitlement currently permits access, with one entry per stable F19 plan identity and the latest published revision for that plan. It MUST include every delivered plan regardless of plan kind or whether it was the first plan; it MUST omit drafts and other clients' plans. (S54-PO-9 P4-Q5 written decision; F19 `plan_deliveries` and `plan-core-client.md`/`plan-core-delivery-projection.md`; PRD-01/04/05/06.)
- **FR-005 — Subscription summary**: The client dashboard MUST show the subscription status and end date from F13's authoritative subscription projection. It MUST NOT compute lifecycle status, expiry, overdue state, or dates independently. (S54-PO-9 P4-Q5 written decision; F13 FR-028/030; PRD-01/07.)
- **FR-006 — Entitlement enforcement**: Every plan read and export MUST consume F13's authoritative plan entitlement and independently applicable overdue restriction. Expiry and overdue MUST restrict plan content and exports while preserving account/settings/support access as allowed by F13. P4 MUST NOT create a second subscription lifecycle, entitlement state machine, expiry clock, or overdue calculation. (S54-PO-9 P4 scope; F13 FR-028/030/032 and `contracts/lifecycle-and-entitlement.md`; BRD-04.8; PRD-07.)
- **FR-007 — F13 lifecycle changes**: When F13 entitlement changes because of expiry, overdue, freeze, refund or another existing F13 rule, P4 MUST reflect the current entitlement on each new plan read/export authorization decision; cached UI state MUST NOT grant access after the authoritative decision denies it. F13 remains the lifecycle owner. (S54-PO-9 scope (e); F13 FR-028/033/035; BRD-04.8; PRD-07.)
- **FR-008 — Client plan exports**: Clients MUST be able to export published workout and nutrition plans as PDF and Excel when F13 permits plan access. Exports MUST reuse and align with F17 export content/security rules in FR-017/018 and T037–T041, and F18 export rules in FR-006/014 and T023, including client selections, revision-specific nutrition totals and spreadsheet formula-injection protection. P4 MUST NOT create duplicate plan payloads or export engines. Drafts, foreign-client content and restricted plans MUST be denied. (S54-PO-12; PRD-04/05; F17/F18 requirements and tasks cited above.)
- **FR-009 — In-app notifications**: P4 MUST deliver first-plan delivery/activation events to the client through the F15 in-app inbox surface. Existing F15 events MUST remain in that same inbox under their existing authorized-recipient, idempotency/deduplication, read-state and safe-payload rules. P4 MUST extend the existing inbox for the client recipient where needed; it MUST NOT create a separate notification inbox or duplicate F15 event generation. Exact delivery-versus-activation notice cardinality remains subject to `S54-022-Q3`. (S54-PO-9 P4-Q4=A; S54-PO-11; F15 FR-018/024; `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; PR #58.)
- **FR-010 — Client identity and privacy**: Client-facing reads and exports MUST derive the client from the authenticated client identity, enforce current workspace and entitlement authorization at the server boundary, exclude drafts and staff-only attribution/audit fields, and return no other client's information. (F19 `plan-core-client.md` Authorization and projection contract; F11 FR-008; F13 FR-030/033; PRD-02/13.)
- **FR-011 — Client-directory boundary**: This spec records the missing staff-directory surface found by the BRD/PRD audit but MUST NOT duplicate F11 account/assignment rules or F20 notes. Inclusion of directory search, filters, indicators and related actions in this v1 feature is unresolved in `S54-022-Q1`; no requirements for that surface are asserted until answered. (S54-PO-9 P4-Q6 written audit direction; S54-PO-11; BRD-06; PRD-01/11; F11/F20; PR #90.)
- **FR-012 — Comprehensive export boundary**: Per-plan client export MUST NOT expose comprehensive client datasets; those remain Platform Owner-only under BRD-06/PRD-11. (BRD-06; PRD-11.)
- **FR-013 — No YBS access or sync**: P4 MUST rely on LIFTER's BRD/PRD and existing LIFTER code/specs only. It MUST add no YBS access, migration, synchronization or YBS-derived behavior. (S54-PO-11; BRD-06; roadmap.)

### Key Entities

- **Plan delivery**: Existing F19 record binding a client, stable plan, subscription, kind and immutable published revision. P4 creates no new delivery entity.
- **Delivered plan projection**: Client-safe view of each delivered plan's latest published revision, restricted by F13 entitlement.
- **Subscription summary**: Client-safe status and end date from F13's existing authoritative state.
- **Inbox event**: Existing F15 event/delivery/inbox item, with P4 first-plan delivery/activation event types and client recipient support.
- **Productivity point**: Existing F13-owned unit, written in the F19 transaction under S48-PO-15/19.

### Success Criteria

- **SC-001**: In all acceptance cases, each first workout/nutrition publish succeeds independently and creates exactly one F19 delivery record.
- **SC-002**: Across retries and concurrent completion attempts, 100% of eligible first plan pairs produce exactly one activation; no single plan or later revision produces another activation.
- **SC-003**: 100% of successful normal first-pair activations write exactly one point to the approved recipient in the same transaction; 100% of PO overrides and later publications write zero points.
- **SC-004**: For an entitled client, the dashboard returns 100% of that client's delivered plan identities exactly once, each at its latest published revision, and returns zero drafts or foreign-client plans.
- **SC-005**: 100% of client plan reads and PDF/Excel export attempts denied by F13 entitlement return no plan content; authorized attempts return only allowed published plan content.
- **SC-006**: Every first-plan/activation inbox event follows the approved event cardinality and appears at most once for its recipient; no P4 duplicate inbox exists.
- **SC-007**: 100% of client exports match the applicable F17/F18 field and safety contracts, including nutrition selection and total rules and formula-injection neutralization.
- **SC-008**: The client-section audit accounts for each BRD/PRD requirement listed in the audit table and adds no duplicate F11/F15/F18/F20 ownership.

### Assumptions

- F19 and F13 remain the authorities for delivery, activation, plan projection, subscription status and entitlement.
- The F15 in-app inbox is the only in-app inbox surface; P4 extends its client reach rather than introducing another inbox.
- F17/F18 own plan export content and format fidelity; P4 owns client access and entitlement enforcement at the portal boundary.
- The v1 scope for remaining staff client-directory gaps is pending `S54-022-Q1`.
- All strings in `copy-proposal.md` are proposed and pending PO approval; they are not approved for implementation.

### Edge Cases

- One first plan is delivered and the second plan is not yet published: the first plan remains delivered, but normal activation waits for the second successful delivery.
- Two publishers complete the last missing first-plan delivery concurrently or a request is retried after a lost response: F19 idempotency and transaction rules produce one activation and one productivity result.
- A PO uses F19 override before either plan is delivered: the existing override behavior remains authoritative, and the override earns zero points.
- A client has no delivered plans: render the proposed empty state while retaining available subscription status/end date.
- F13 denies entitlement after the dashboard was loaded: a fresh plan read/export is denied even if the UI still shows stale data.
- Client export targets a draft, another client, or an entitlement-restricted plan: return no plan content.

## Clarifications

### Session 2026-11-13 — Decisions recorded

- First workout and nutrition delivery can happen independently; F19 Ready & Publish on an eligible subscription is the delivery action. Reuse `plan_deliveries` and F19's activation transaction. Source: S54-PO-9 (P4-Q1=A), S42-PO-2, `specs/019-plan-core/spec.md` F19-FR-002/007.
- Activation occurs exactly once only after both first plans are successfully delivered. Source: S54-PO-9 (P4-Q1), PRD-06, F19-FR-007/011.
- A normal first complete plan set awards one productivity point; PO override awards zero. Wire F13 T044 inside the first-delivery transaction. Source: S48-PO-15, S48-PO-19, S54-PO-9 (P4-Q2=A).
- Productivity recipient is the activation-time assigned trainer, or the completing publisher when no trainer is assigned, under F19. Source: S54-PO-9 (P4-Q3=A), F19-FR-011 and client-delivery transaction contract.
- In-app notifications cover first-plan delivery/activation plus existing F15 events, reusing the F15 inbox. Source: S54-PO-9 (P4-Q4=A), S54-PO-11; F15 FR-018/024.
- Dashboard includes all delivered plans, latest published revision per plan, subscription status and end date. Source: S54-PO-9 (written P4-Q5).
- Client-section audit uses LIFTER's BRD/PRD only, audits existing code/specs, and specifies gaps while reusing existing ownership; no YBS access. Source: S54-PO-9 (written P4-Q6), S54-PO-11, BRD-06.
- Finance reporting is deferred after v1. Source: S54-PO-9 (P4-Q7=A).
- Client PDF and Excel exports are in v1; align with and reuse F17/F18 export work. Source: S54-PO-11 (S54-EXPORTS-V1), S54-PO-12, PRD-04/05.
- Expiry and overdue restrictions consume F13 entitlement and preserve allowed account access; no duplicated lifecycle logic. Source: F13 FR-028/030/032, BRD-04.8, PRD-07, S54 scope item (e).
- Exact user-visible copy is proposed, not approved, and Arabic must be natural Egyptian colloquial. Source: S54-PO-11; S48-PO-4.
- Reuse F11 client identity/account rules, F15 forms/inbox, F18 nutrition selection/export logic, F20 notes and existing F19 plan contracts. Source: S54-PO-9/11; `specs/011-client-accounts/spec.md`, `specs/015-forms-intake/spec.md`, `specs/018-nutrition-planner/spec.md`, `specs/019-plan-core/spec.md`, `specs/020-client-notes/spec.md`.

## Dependencies

1. **F19 Plan Core** — `plan_deliveries`, Ready & Publish, initial activation transaction, idempotency and client projection; `specs/019-plan-core/spec.md` F19-FR-002/007/011 and `contracts/plan-core-client.md`, `contracts/plan-core-delivery-projection.md`. Reuse; do not redefine.
2. **F13 Lifecycle and entitlement** — FR-028/030/032/033 and `contracts/lifecycle-and-entitlement.md`; PR #88 contains current implementation work and T044 remains P4 wiring. P4 consumes status/entitlement and supplies the approved productivity recipient within F19's transaction.
3. **F15 Forms and inbox** — FR-018/024, `app_private.form_alert_inbox`, `public.read_form_alert_inbox`, `public.mark_form_alert_read`; open PR #58. P4 adds client event reach to the existing inbox surface.
4. **F17 Workout Planner** — FR-017/018, export work T037–T041. P4 reuses its published-plan PDF/Excel output and safety contract.
5. **F18 Nutrition Planner** — FR-006/014, T023. P4 reuses client-selection, revision-specific export and totals behavior.
6. **F11 Client Accounts** — existing identity, account and assignment rules in `specs/011-client-accounts/spec.md`.
7. **F20 Client Notes** — `specs/020-client-notes/spec.md`; staff Client Details/Notes PR #90. P4 adds no duplicate notes or account detail behavior.
8. **BRD/PRD** — `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md` §§ BRD-04.8, BRD-06, PRD-01/04/05/06/07/10/11/13/14.

## Open questions for the PO

### S54-022-Q1 — Staff client-directory gap scope

**Question:** Should the remaining staff client-directory requirements found in the BRD/PRD audit be included in P4 v1?

**Why it matters:** The checkout has F11 account/assignment contracts and F20 Client Details work, but no directory page; adding search, filters and actionable indicators expands this portal delivery feature.

**Recommended:** Option A. Keep P4 focused on client plan delivery/dashboard/notifications/exports and record directory gaps for a later feature, consistent with the prior P4-Q6=A scope recommendation.

| Option | Description                                                                          | Implication                                                                         |
| ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| A      | Defer remaining directory gaps; this spec records them only.                         | Keeps the current v1 client portal boundary; no directory delivery claim.           |
| B      | Include BRD/PRD directory search, filters and actionable indicators in this P4 spec. | Expands v1 requirements and requires directory scenarios/copy.                      |
| C      | Include only a plan-waiting indicator.                                               | Adds a narrow staff directory surface and requires defining its data and placement. |

**Blocks:** Final v1 P4 boundary and whether directory requirements are added before planning.

### S54-022-Q2 — Client export revision choice

**Question:** Which published revision should a client be able to export for a delivered plan?

**Why it matters:** The dashboard shows the latest published revision, while F17/F18 also define revision-specific export behavior.

**Recommended:** Option A. It matches the dashboard rule and avoids adding a client history selector before history is in scope.

| Option | Description                                                          | Implication                                                                         |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A      | Export only the latest published revision for each delivered plan.   | Aligns export with the dashboard's latest-revision projection.                      |
| B      | Let the client select any published revision of that delivered plan. | Requires revision history navigation and client authorization for historic exports. |
| C      | Show all revisions but export only the latest.                       | Adds history visibility without historic export.                                    |

**Blocks:** Export selection UI, export authorization and historical nutrition-selection acceptance criteria.

### S54-022-Q3 — Delivery and activation notification granularity

**Question:** How many client notices should the first workout/nutrition delivery pair produce?

**Why it matters:** A separate activation notice can create two notices when the completing plan is published, while one combined notice changes the event/copy contract.

**Recommended:** Option A. It gives each independently delivered plan a notice and makes the resulting activation explicit once.

| Option | Description                                                                                         | Implication                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A      | One notice for each first-plan delivery, plus one separate notice when the pair activates.          | Three notices across a normal first pair; each event has its own proposed copy. |
| B      | One notice for each first-plan delivery; the second notice also states that activation is complete. | Two notices, with activation embedded in the completing delivery.               |
| C      | One notice only after both first plans have been delivered and activation completes.                | No notice for the first independently delivered plan.                           |

**Blocks:** Event count, inbox deduplication keys and final notification copy.

### S54-022-Q4 — Copy proposal approval

**Question:** Do you approve the proposed English and Egyptian Arabic client-portal strings in `copy-proposal.md` as written?

**Why it matters:** The implementation must use exact PO-approved copy, and the Arabic strings must remain natural Egyptian colloquial.

**Recommended:** Option A, after your review of the proposal table.

| Option | Description                                         | Implication                                                                      |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| A      | Approve every proposed string as written.           | The listed strings become the approved source for this feature.                  |
| B      | Return replacements for any rows that need changes. | Changed rows remain blocked until exact EN and Egyptian Arabic text is supplied. |

**Blocks:** Final user-visible copy and implementation readiness for the proposed keys.

### S54-022-Q5 — Dashboard empty/entitlement-restricted state

**Question:** When a client has no plan entitlement, should the dashboard show delivered-plan names without content or hide the plan list entirely?

**Why it matters:** F13 restricts plan access on expiry/overdue, and the F19 client projection denies plan content for expired/deactivated clients; the client-facing empty/restricted presentation is not fixed by those contracts.

**Recommended:** Option A. It is consistent with F19's no-plan-content denial and reveals no restricted plan details.

| Option | Description                                                                                     | Implication                                                      |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A      | Hide the plan list and show only subscription status/end date and an approved restricted state. | No plan metadata is exposed after entitlement is denied.         |
| B      | Keep plan names/dates visible but remove plan content and export actions.                       | Requires a metadata-only projection while entitlement is denied. |
| C      | Show an explicit per-plan locked entry without plan details.                                    | Requires a lock-state list projection and separate copy.         |

**Blocks:** Restricted dashboard projection and entitlement-denied user experience.
