# Feature Specification: Subscription expiry notices and scoped client list

**Feature Branch**: `s71-028-expiry`
**Created**: 2026-11-27
**Status**: Draft; all P8 PO questions are resolved. Proposed UI copy still requires per-screen PO approval.
**Authority**: S71-PO-1 approved P8 scope; S71-PO-6 and S71-R12 resolve the scope decisions recorded below.
**Input**: Add the approved P8 subscription expiry notifications and a scoped expiring/expired client list, reusing existing notification and client-directory surfaces.

## Constitution check

Principles I, III, IV, VII, VIII, and IX apply. The P8 scope is approved by S71-PO-1; no Constitution amendment is proposed.

## User Scenarios & Testing

### User Story 1 - Staff receive expiry notices (Priority: P1)

As Platform Owner, Workspace Owner, or an authorized Trainer, I receive one in-app notice for an eligible subscription at three days before its effective expiry and one at expiry, so I can see upcoming and completed expirations in my permitted scope.

**Why this priority**: This is the approved P8 highest-priority item in S71-PO-1.

**Independent Test**: With synthetic active subscriptions, advance a controllable clock across T-3 and expiry, run the scheduled evaluator repeatedly and concurrently, and verify the right staff recipients each see one notice per stage.

**Acceptance Scenarios**:

1. **Given** an active subscription with a known effective expiry, **When** its Cairo expiry instant minus 72 hours is reached, **Then** one T-3 in-app notice is stored for the PO, relevant WO, and every Trainer with current coaching access in the client workspace.
2. **Given** the same subscription reaches its effective expiry, **When** evaluation runs, **Then** one expiry notice is stored for each then-authorized recipient.
3. **Given** a scan retry, concurrent scan, lost worker response, or retry after completion, **When** the same stage is evaluated, **Then** no duplicate recipient-stage notice is created.
4. **Given** a Trainer's coaching access to the client workspace is granted or revoked between stages, **When** a stage is sent or a notice is read, **Then** all currently authorized workspace Trainers are included and revoked Trainers cannot read notice rows; already-delivered rows remain stored.

### User Story 2 - Clients receive approved expiry notices (Priority: P1)

As a client, I receive the existing PRD-approved expiry alerts at three days, one day, and expiry through the current client inbox, without a renewal request or CTA.

**Why this priority**: PRD-07 specifies all three client stages; adding staff notices must preserve this requirement.

**Independent Test**: Read the client inbox for an approved synthetic client before, at, and after each stage; verify self-only visibility, read state, and no renewal CTA.

**Acceptance Scenarios**:

1. **Given** a client with an active known expiry, **When** T-3, T-1, or expiry is reached, **Then** the matching single client notice appears in the existing client inbox.
2. **Given** a client subscription is renewed or extended before a stage fires, **When** the evaluator runs, **Then** the stale due stage is suppressed and evaluated against the current effective expiry.
3. **Given** an expiry notice is rendered, **When** the client opens it, **Then** it reports expiry/date only and provides no in-app renewal request or external renewal CTA.
4. **Given** a client first becomes eligible with an upcoming expiry under 72 hours away, **When** evaluation runs, **Then** one T-3 notice is sent immediately; T-1 is sent only at its own 24-hour due instant.

### User Story 3 - Staff review scoped expiring and expired clients (Priority: P1)

As a PO, WO, or authorized Trainer, I can review expiring and expired clients using the existing staff client directory and only within my permitted workspaces and client authorization.

**Why this priority**: The notice needs a safe operational follow-through surface; duplicating the directory would create a second authorization boundary.

**Independent Test**: Query the directory and UI with synthetic actors for PO, own-workspace WO, all Trainers with coaching access in the client workspace, Sales, client, revoked staff, and foreign workspace records; compare visible rows and counts.

**Acceptance Scenarios**:

1. **Given** PO, **When** the expiry view is opened, **Then** it can show platform-wide totals with workspace-scoped drill-down, without exposing P7 audit details.
2. **Given** WO, **When** the expiry view is opened for its workspace, **Then** only clients and counts for that workspace are returned.
3. **Given** a Trainer with coaching access in a client workspace, **When** the expiry view is opened, **Then** that client's matching row is returned; Trainers without current coaching access cannot see it, and changing IDs or workspace context does not widen access.
4. **Given** Sales or a Client, **When** a staff expiry list is requested, **Then** no staff client list or staff notice is returned; the Client receives only their own client inbox notices.
5. **Given** no matching expiring/expired clients or an unavailable directory read, **When** the list renders, **Then** it shows the existing empty/error states without leaking whether a foreign client exists.

### Edge Cases

- No effective expiry exists before activation: do not calculate or send a notice.
- Subscription has less than 72 hours remaining when first eligible: send the T-3 notice immediately once, then send the expiry notice at its current due instant.
- Freeze, early renewal, extension, date correction, cancellation/refund, deactivation, or dispute hold changes eligibility before a stage: recompute against the current F13 entitlement projection, suppress obsolete due instants, and retain delivered rows unchanged.
- F13 supplies an exclusive Cairo service-end date, not an expiry timestamp. Convert that date to the first existing Africa/Cairo instant using the existing F13 boundary rule, then define T-3 as 72 elapsed hours before that instant. Keep all eligibility comparisons on instants and display in Africa/Cairo.
- Stage evaluation is late: enqueue at most once when due, unless a changed effective expiry makes that stage no longer due.
- Recipient is revoked between evaluation and read: suppress delivery or deny current read; do not reveal existence.
- Client account remains active after subscription expiry: retain its notices under the active-account rule. After account closure/deletion, use F26's 30-day relationship-end clock and tied refund/dispute hold; audit events retain their separate 30-day-from-creation clock.

### Notice eligibility by F13 state

| Current state                            | Upcoming T-3 / T-1 stage                                | Expiry stage                                           | Rule                                                                           |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| awaiting_activation                      | No                                                      | No                                                     | F13 has no effective end yet.                                                  |
| future                                   | Yes, if its projected end makes the stage due           | Only when F13 reports expired at the end boundary      | Use the projected end; no new date arithmetic.                                 |
| active                                   | Yes, when due                                           | Only when F13 reports expired at the end boundary      | Current eligible state.                                                        |
| frozen                                   | Yes, when due against the freeze-adjusted projected end | Only when F13 reports expired at the adjusted boundary | Do not use the pre-freeze end.                                                 |
| expired                                  | No new T-3/T-1 stage                                    | Yes, once per effective-expiry revision                | Renewal may change state/end before enqueue; recheck under the lifecycle lock. |
| refunded, deactivated, closed, or purged | No                                                      | No                                                     | Suppress all unsent notices; retain prior rows only under F26 rules.           |

F13's known exclusive end is converted with its FR-004 first-existing-instant rule (see `specs/013-freeze-renewal-refunds/spec.md:145,215-227`). Example: end date 2026-04-24 maps to 2026-04-23T22:00:00Z; T-3 is 2026-04-20T22:00:00Z; T-1 is 2026-04-22T22:00:00Z. Tests must include the Cairo spring gap and autumn fold fixtures from F13.

## Clarifications

The PO-approved scope is recorded from S71-PO-1. S71-PO-6 resolves Trainer recipient scope and revision-based notice pairs; S71-R12 records two architect technical defaults. All four decisions and their applied behavior are in `checklists/po-mcqs.md`. No open PO ambiguities remain. Proposed copy remains subject to per-screen approval.

## Requirements

### Functional Requirements

- **FR-001**: Preserve client expiry notices at T-3, T-1, and effective expiry from PRD-07 using the existing client notification inbox. T-3 is 72 elapsed hours and T-1 is 24 elapsed hours before the F13 expiry instant. For a client first eligible with upcoming expiry under 72 hours away, send T-3 immediately once; T-1 remains tied to its own due instant. Do not add renewal request or CTA.
- **FR-002**: Notify PO, the relevant WO, and authorized Trainers in-app at T-3 and effective expiry as approved by S71-PO-1.
- **FR-003**: Resolve recipient authorization on each stage at send time. PO is platform-scoped; WO is a current owner of the subscription workspace; every Trainer with current coaching access in the client workspace is a recipient and may see that workspace's authorized expiry rows. Never send to Sales.
- **FR-004**: Derive the exclusive Cairo end date from the existing F13 entitlement projection; convert it to the expiry instant using F13 FR-004's first-existing-instant rule (nonexistent midnight resolves forward; ambiguous midnight uses the earliest instant). Staff/client T-3 is exactly 72 elapsed hours and client T-1 exactly 24 elapsed hours before that instant. Render/display in Africa/Cairo.
- **FR-005**: Serialize stage evaluation/enqueue with F13 lifecycle changes using the existing per-subscription lock order; after any lock wait, resample time, recompute current F13 state/end, and re-resolve current recipient authorization before insert. Re-evaluate stages after renewal, extension, freeze, date correction, refund, cancellation, deactivation, and purge eligibility changes; suppress obsolete due instants and schedule against the current effective expiry.
- **FR-006**: Guarantee exactly one delivery per recipient, subscription, effective-expiry revision, and stage across retries, concurrency, restarts, and worker timeouts. If a subscription first becomes eligible while expiry is upcoming and less than 72 hours away, send T-3 immediately once to each applicable client/staff recipient; only T-3 is caught up, while client T-1 stays tied to its exact 24-hour due instant. Keep delivered rows; a changed expiry creates a new T-3/expiry pair for its revision.
- **FR-007**: Store recipient-specific read/unread and dismiss state, extending existing client/staff notice tables and RPCs. A dismiss action affects only the acting recipient and does not delete another recipient's notice.
- **FR-008**: Extend the existing staff client directory/reporting surface for expiring/expired filters; do not add a second page, list, inbox, notification table, or scheduled job. `expiring` is effective expiry `>= now` and `< now + 72 elapsed hours`, using one sampled instant; `expired` means F13 currently reports `expired` at that instant.
- **FR-009**: Enforce current authorization and row scoping server-side and at RLS/RPC boundary: PO platform; WO own workspace; all Trainers with current coaching access in the client workspace; Sales no access; Client self-only notices and no staff list.
- **FR-010**: The list uses the existing directory page-size bound of 100 rows and filtered counts; no unbounded client enumeration, cross-workspace count/existence oracle, or full audit payload.
- **FR-011**: Reuse F26 retention and its existing purge allowlist/orchestration. Notices remain while the client account is active; after account closure/deletion, linked notice rows follow the approved 30-day relationship-end clock, tied refund/dispute holds, and restart after resolution. Notice audit events follow their independent 30-day-from-creation clock. Do not imply purge activation; existing activation gates and authority remain required.
- **FR-012**: Audit only the required allow-listed notification and read/dismiss action; do not expose P7 audit rows or P7-only notification data to WO/Trainer/Sales.
- **FR-013**: Provide ONE shared notifications surface in the staff app shell that lists F15 form alerts through `read_form_alert_inbox` / `mark_form_alert_read` and `app/api/forms/alerts/route.ts`, F23 `staff_inbox_notices` through `read_staff_notices` / `mark_staff_notice_read`, and the new expiry kinds. Reuse those readers and mutations; add no inbox, table, job, or Realtime publication. Copy is PROPOSED and requires per-screen approval. Keep loading, empty, error, EN/LTR, AR/RTL, light/dark, mobile/desktop, keyboard and accessible states.

### Key Entities

- **Expiry notice**: Existing per-recipient client or staff inbox row, with notice kind, subscription source key, created/read/dismiss timestamps, and existing authorization rules.
- **Effective expiry**: Current F13 projection boundary after approved lifecycle changes; not a new subscription date source.
- **Scoped expiry list row**: Existing directory projection for a client, workspace, effective expiry/status, and allowed operational indicators.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** an eligible client and known F13 end, **When** T-3, T-1, or expiry occurs, **Then** exactly the matching client notice appears in `read_client_notices`; if first eligible with under 72 hours left, T-3 is sent once immediately; no renewal CTA appears.                                                         |
| FR-002 | **Given** PO, current relevant WO and all Trainers with coaching access in the client workspace, **When** T-3/expiry becomes due, **Then** each receives one in-app notice; Sales receives none.                                                                                                                             |
| FR-003 | **Given** workspace coaching access changes, **When** the stage is enqueued/read, **Then** only currently authorized Trainers receive or read notices and delivered rows remain stored after access changes.                                                                                                                 |
| FR-004 | **Given** F13 `effective_end_exclusive` 2026-04-24, **When** expiry timing is resolved, **Then** expiry is 2026-04-23T22:00:00Z, T-3 is 2026-04-20T22:00:00Z, and T-1 is 2026-04-22T22:00:00Z; the F13 spring-gap and fall-fold fixtures also pass.                                                                          |
| FR-005 | **Given** a lifecycle update races evaluator, **When** whichever writer obtains the existing subscription lock first commits, **Then** evaluator rechecks after waits, suppresses obsolete due instants, and inserts only for the current state/end/recipient.                                                               |
| FR-006 | **Given** repeated, concurrent or retried scans, **When** a revision-stage identity is due, **Then** exactly one row exists; first eligibility under 72 hours sends T-3 once to each applicable recipient, client T-1 remains tied to its due instant, and changed expiry creates a new pair while retaining delivered rows. |
| FR-007 | **Given** two recipients of the same subscription, **When** one marks read/dismissed, **Then** only that recipient's state changes and the other recipient remains unchanged.                                                                                                                                                |
| FR-008 | **Given** an authorized directory reader and one sampled instant, **When** it filters expiring (`expiry >= now` and `< now + 72h`) or expired clients, **Then** only matching authorized rows/counts appear.                                                                                                                 |
| FR-009 | **Given** PO, own/foreign WO, Trainers with/without coaching access, Sales, Client, revoked, anonymous and foreign IDs, **When** direct RPC/RLS reads run, **Then** each matches the role matrix with no bypass or existence signal.                                                                                         |
| FR-010 | **Given** a page request and cursor, **When** the same authorized filter is requested, **Then** no more than 100 rows return and counts use the identical predicate.                                                                                                                                                         |
| FR-011 | **Given** an active account or a closed account with an open tied dispute, **When** F26 purge is evaluated, **Then** notices remain active or held; after closure/deletion plus approved 30 days from resolution, rows are purged only under the existing gated job.                                                         |
| FR-012 | **Given** notices and P7 audit facts exist, **When** staff read/dismiss/list operations execute, **Then** allow-listed notification audit is written and no P7 event detail is disclosed to WO/Trainer/Sales.                                                                                                                |
| FR-013 | **Given** loading, empty, error and populated states, **When** the shared staff notifications surface in the app shell renders, **Then** F15 alerts, F23 notices, and expiry kinds use existing read/mark APIs with accessible localized states and no new inbox/table/job/Realtime publication; copy remains PROPOSED.      |

## Success Criteria

- **SC-001**: Across 1,000 repeated and concurrent scans, exactly one notice per eligible recipient and approved subscription-stage identity is present.
- **SC-002**: At the evaluated target time, no PO, WO, Trainer, Sales, Client, revoked member, or foreign-workspace fixture can read another principal's notice or out-of-scope list row/count.
- **SC-003**: All renewal/freeze/extension/refund/date-correction and lifecycle-race fixtures suppress stale notices and use the current F13 effective expiry after the shared lifecycle lock; the state table above covers every F13 state.
- **SC-004**: Client notices match all three PRD-07 stages and contain no renewal CTA.
- **SC-005**: List pagination returns no more than the requested bounded page; rows/counts use the same authorization and `now <= expiry < now + 72 elapsed hours` predicate for `expiring`.
- **SC-006**: Active-account notice rows are retained; after closure/deletion, linked notice rows follow F26's 30-day clock and dispute holds, while notice audit rows follow their independent 30-day creation clock. Purge remains unactivated unless existing gates are met.
- **SC-007**: One shared staff notifications surface in the staff app shell lists F15 form alerts, F23 staff notices, and expiry kinds through existing read/mark APIs, without a new inbox, table, job, or Realtime publication.

## Assumptions

- F13's effective expiry projection is the source of truth; no duplicate expiry calculation is added.
- F22 client inbox is reused. Staff notification presentation is one shared surface in the staff app shell, joining F15 form alerts (`read_form_alert_inbox`, `mark_form_alert_read`, `app/api/forms/alerts/route.ts`), F23 staff notices (`read_staff_notices`, `mark_staff_notice_read`), and expiry kinds. It uses existing tables and APIs and introduces no inbox, table, job, or Realtime publication. Copy is PROPOSED.
- Existing directory and reporting routes are extended rather than replicated.
- Sales has no unlisted notice or directory rights under Constitution III and the explicit P7 non-disclosure boundaries.
