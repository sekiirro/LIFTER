# Feature Specification: Subscription expiry notices and scoped client list

**Feature Branch**: `s71-028-expiry`
**Created**: 2026-11-27
**Status**: Draft; PENDING-PO decisions are listed in `checklists/po-mcqs.md`.
**Authority**: S71-PO-1 approved P8 scope. This supersedes the v1-scope.md P8 hardening deferral for this feature.
**Input**: Add the approved P8 subscription expiry notifications and a scoped expiring/expired client list, reusing existing notification and client-directory surfaces.

## Constitution check

No conflict identified. Principle I requires tenant and object isolation; III grants only explicitly authorized capabilities; VII limits client data; IX requires deterministic, idempotent scheduled work; VIII requires bilingual accessible states. The Constitution is not amended.

## User Scenarios & Testing

### User Story 1 - Staff receive expiry notices (Priority: P1)

As Platform Owner, Workspace Owner, or an authorized Trainer, I receive one in-app notice for an eligible subscription at three days before its effective expiry and one at expiry, so I can see upcoming and completed expirations in my permitted scope.

**Why this priority**: This is the approved P8 highest-priority item in S71-PO-1.

**Independent Test**: With synthetic active subscriptions, advance a controllable clock across T-3 and expiry, run the scheduled evaluator repeatedly and concurrently, and verify the right staff recipients each see one notice per stage.

**Acceptance Scenarios**:

1. **Given** an active subscription with a known effective expiry, **When** its Cairo expiry instant minus 72 hours is reached, **Then** one T-3 in-app notice is stored for each recipient authorized by the resolved PO decision.
2. **Given** the same subscription reaches its effective expiry, **When** evaluation runs, **Then** one expiry notice is stored for each then-authorized recipient.
3. **Given** a scan retry, concurrent scan, lost worker response, or retry after completion, **When** the same stage is evaluated, **Then** no duplicate recipient-stage notice is created.
4. **Given** a Trainer reassignment between stages, **When** the expiry stage fires, **Then** its recipient behavior follows the approved trainer-recipient MCQ; an already-delivered notice is not retroactively disclosed to a new assignee.

### User Story 2 - Clients receive approved expiry notices (Priority: P1)

As a client, I receive the existing PRD-approved expiry alerts at three days, one day, and expiry through the current client inbox, without a renewal request or CTA.

**Why this priority**: PRD-07 specifies all three client stages; adding staff notices must preserve this requirement.

**Independent Test**: Read the client inbox for an approved synthetic client before, at, and after each stage; verify self-only visibility, read state, and no renewal CTA.

**Acceptance Scenarios**:

1. **Given** a client with an active known expiry, **When** T-3, T-1, or expiry is reached, **Then** the matching single client notice appears in the existing client inbox.
2. **Given** a client subscription is renewed or extended before a stage fires, **When** the evaluator runs, **Then** the stale due stage is suppressed and evaluated against the current effective expiry.
3. **Given** an expiry notice is rendered, **When** the client opens it, **Then** it reports expiry/date only and provides no in-app renewal request or external renewal CTA.

### User Story 3 - Staff review scoped expiring and expired clients (Priority: P1)

As a PO, WO, or authorized Trainer, I can review expiring and expired clients using the existing staff client directory and only within my permitted workspaces and client authorization.

**Why this priority**: The notice needs a safe operational follow-through surface; duplicating the directory would create a second authorization boundary.

**Independent Test**: Query the directory and UI with synthetic actors for PO, own-workspace WO, assigned/delegated Trainer, Sales, client, revoked staff, and foreign workspace records; compare visible rows and counts.

**Acceptance Scenarios**:

1. **Given** PO, **When** the expiry view is opened, **Then** it can show platform-wide totals with workspace-scoped drill-down, without exposing P7 audit details.
2. **Given** WO, **When** the expiry view is opened for its workspace, **Then** only clients and counts for that workspace are returned.
3. **Given** Trainer, **When** the expiry view is opened, **Then** only clients allowed by the resolved Trainer authorization MCQ are returned; changing IDs or workspace context does not widen access.
4. **Given** Sales or a Client, **When** a staff expiry list is requested, **Then** no staff client list or staff notice is returned; the Client receives only their own client inbox notices.
5. **Given** no matching expiring/expired clients or an unavailable directory read, **When** the list renders, **Then** it shows the existing empty/error states without leaking whether a foreign client exists.

### Edge Cases

- No effective expiry exists before activation: do not calculate or send a notice.
- Subscription has less than 72 hours remaining when first eligible: behavior is PENDING-PO in MCQ 028-02.
- Freeze, early renewal, extension, date correction, cancellation/refund, deactivation, or dispute hold changes eligibility before a stage: recompute against the current F13 entitlement projection; already delivered notices remain immutable.
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
| expired                                  | No new T-3/T-1 except catch-up behavior in MCQ 028-02   | Yes, once                                              | Renewal may change state/end before enqueue; recheck under the lifecycle lock. |
| refunded, deactivated, closed, or purged | No                                                      | No                                                     | Suppress all unsent notices; retain prior rows only under F26 rules.           |

F13's known exclusive end is converted with its FR-004 first-existing-instant rule (see `specs/013-freeze-renewal-refunds/spec.md:145,215-227`). Example: end date 2026-04-24 maps to 2026-04-23T22:00:00Z; T-3 is 2026-04-20T22:00:00Z. Tests must include the Cairo spring gap and autumn fold fixtures from F13.

## Clarifications

The PO-approved scope statement is recorded from S71-PO-1; no settled decision is reopened. Four genuine product questions remain in `checklists/po-mcqs.md`: Trainer recipient meaning/reassignment; missed T-3 catch-up for subscriptions first seen with under 72 hours remaining; whether a changed expiry may create a new stage after an earlier stage was delivered; and the expiring-list horizon. Affected FRs are marked PENDING-PO. Technical choices below are settled by reuse and least privilege. No other open ambiguities are assumed.

## Requirements

### Functional Requirements

- **FR-001**: Preserve client expiry notices at T-3, T-1, and effective expiry from PRD-07 using the existing client notification inbox; do not add renewal request or CTA.
- **FR-002**: Notify PO, the relevant WO, and authorized Trainers in-app at T-3 and effective expiry as approved by S71-PO-1.
- **FR-003**: Resolve recipient authorization on each stage at send time. PO is platform-scoped; WO is a current owner of the subscription workspace; Trainer recipients follow MCQ 028-01 (**PENDING-PO**). Never send to Sales.
- **FR-004**: Derive the exclusive Cairo end date from the existing F13 entitlement projection; convert it to the expiry instant using F13 FR-004's first-existing-instant rule (nonexistent midnight resolves forward; ambiguous midnight uses the earliest instant). T-3 is exactly 72 elapsed hours before that instant. Render/display in Africa/Cairo.
- **FR-005**: Serialize stage evaluation/enqueue with F13 lifecycle changes using the existing per-subscription lock order; after any lock wait, resample time, recompute current F13 state/end, and re-resolve current recipient authorization before insert. Re-evaluate pending stages after renewal, extension, freeze, date correction, refund, cancellation, deactivation, and purge eligibility changes; suppress obsolete stages and schedule against the current effective expiry.
- **FR-006**: Guarantee exactly one delivery per recipient, subscription, and approved stage identity across retries, concurrency, restarts, and worker timeouts. Short-lead catch-up and stage identity after a changed expiry are **PENDING-PO** (MCQs 028-02/03).
- **FR-007**: Store recipient-specific read/unread and dismiss state, extending existing client/staff notice tables and RPCs. A dismiss action affects only the acting recipient and does not delete another recipient's notice.
- **FR-008**: Extend the existing staff client directory/reporting surface for expiring/expired filters; do not add a second page, list, inbox, notification table, or scheduled job. The expiring-window length and inclusive/exclusive edges are **PENDING-PO** (MCQ 028-04); expired means F13 currently reports `expired` at the sampled instant.
- **FR-009**: Enforce current authorization and row scoping server-side and at RLS/RPC boundary: PO platform; WO own workspace; Trainer authorized clients per MCQ 028-01; Sales no access; Client self-only notices and no staff list.
- **FR-010**: The list uses bounded pagination and filtered counts; no unbounded client enumeration, cross-workspace count/existence oracle, or full audit payload.
- **FR-011**: Reuse F26 retention and its existing purge allowlist/orchestration. Notices remain while the client account is active; after account closure/deletion, linked notice rows follow the approved 30-day relationship-end clock, tied refund/dispute holds, and restart after resolution. Notice audit events follow their independent 30-day-from-creation clock. Do not imply purge activation; existing activation gates and authority remain required.
- **FR-012**: Audit only the required allow-listed notification and read/dismiss action; do not expose P7 audit rows or P7-only notification data to WO/Trainer/Sales.
- **FR-013**: Use existing in-app surfaces with fetch-on-open and refresh-after-action; no new Realtime publication is introduced. Keep loading, empty, error, EN/LTR, AR/RTL, mobile, keyboard and accessible states.

### Key Entities

- **Expiry notice**: Existing per-recipient client or staff inbox row, with notice kind, subscription source key, created/read/dismiss timestamps, and existing authorization rules.
- **Effective expiry**: Current F13 projection boundary after approved lifecycle changes; not a new subscription date source.
- **Scoped expiry list row**: Existing directory projection for a client, workspace, effective expiry/status, and allowed operational indicators.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** an eligible client and known F13 end, **When** the T-3/T-1/expiry instant occurs, **Then** exactly the matching client notice appears in `read_client_notices` and contains no renewal CTA.                                                                |
| FR-002 | **Given** PO, current relevant WO and MCQ-authorized Trainer recipients, **When** T-3/expiry becomes due, **Then** each receives one in-app notice; Sales receives none.                                                                                             |
| FR-003 | **Given** a recipient's membership/assignment changes, **When** the stage is enqueued/read, **Then** current send-time and read-time authorization per MCQ 028-01 is enforced (PENDING-PO).                                                                          |
| FR-004 | **Given** F13 `effective_end_exclusive` 2026-04-24, **When** expiry timing is resolved, **Then** expiry is 2026-04-23T22:00:00Z and T-3 is 2026-04-20T22:00:00Z; the F13 spring-gap and fall-fold fixtures also pass.                                                |
| FR-005 | **Given** a lifecycle update races evaluator, **When** whichever writer obtains the existing subscription lock first commits, **Then** evaluator rechecks after waits and inserts only for the current state/end/recipient.                                          |
| FR-006 | **Given** repeated, concurrent or retried scans, **When** a recipient-stage identity is due, **Then** exactly one row exists; short-lead and post-delivery extension behavior follows MCQs 028-02/03 (PENDING-PO).                                                   |
| FR-007 | **Given** two recipients of the same subscription, **When** one marks read/dismissed, **Then** only that recipient's state changes and the other recipient remains unchanged.                                                                                        |
| FR-008 | **Given** an existing authorized directory reader and an MCQ-approved window, **When** it filters expiring/expired clients, **Then** only matching authorized rows/counts appear (horizon PENDING-PO under MCQ 028-04).                                              |
| FR-009 | **Given** PO, own/foreign WO, Trainer, Sales, Client, revoked, anonymous and foreign IDs, **When** direct RPC/RLS reads run, **Then** each matches the role matrix with no bypass or existence signal.                                                               |
| FR-010 | **Given** a maximum-size page and cursor, **When** the same authorized filter is requested, **Then** returned rows never exceed the cap and counts use the identical predicate.                                                                                      |
| FR-011 | **Given** an active account or a closed account with an open tied dispute, **When** F26 purge is evaluated, **Then** notices remain active or held; after closure/deletion plus approved 30 days from resolution, rows are purged only under the existing gated job. |
| FR-012 | **Given** notices and P7 audit facts exist, **When** staff read/dismiss/list operations execute, **Then** allow-listed notification audit is written and no P7 event detail is disclosed to WO/Trainer/Sales.                                                        |
| FR-013 | **Given** loading, empty, error and populated states, **When** existing surfaces render, **Then** EN/LTR, AR/RTL, mobile, keyboard, accessible states and refresh-after-action pass without a new Realtime channel.                                                  |

## Success Criteria

- **SC-001**: Across 1,000 repeated and concurrent scans, exactly one notice per eligible recipient and approved subscription-stage identity is present.
- **SC-002**: At the evaluated target time, no PO, WO, Trainer, Sales, Client, revoked member, or foreign-workspace fixture can read another principal's notice or out-of-scope list row/count.
- **SC-003**: All renewal/freeze/extension/refund/date-correction and lifecycle-race fixtures suppress stale notices and use the current F13 effective expiry after the shared lifecycle lock; the state table above covers every F13 state.
- **SC-004**: Client notices match all three PRD-07 stages and contain no renewal CTA.
- **SC-005**: List pagination returns no more than the requested bounded page and all results and counts match the same authorized predicate; expiring-window edges follow MCQ 028-04.
- **SC-006**: Active-account notice rows are retained; after closure/deletion, linked notice rows follow F26's 30-day clock and dispute holds, while notice audit rows follow their independent 30-day creation clock. Purge remains unactivated unless existing gates are met.

## Assumptions

- F13's effective expiry projection is the source of truth; no duplicate expiry calculation is added.
- F22 client inbox and F23 staff inbox are current reusable surfaces; this specification extends their types/read/mutation seams.
- Existing directory and reporting routes are extended rather than replicated.
- Sales has no unlisted notice or directory rights under Constitution III and the explicit P7 non-disclosure boundaries.
