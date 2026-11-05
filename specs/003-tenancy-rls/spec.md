# Feature Specification: Workspace Tenancy, Permission Matrix & RLS (P0-F3)

**Feature Branch**: `003-tenancy-rls`
**Created**: 2026-10-27
**Status**: Draft
**Input**: Roadmap P0 "Supabase RLS scaffolding, authorize() + permission matrix, isolation test harness". Constitution I and III. Architecture v3 § Multi-tenancy. BRD-02 (roles, multi-workspace staff, consistent role). D-09, D-10, D-16.

## User Scenarios & Testing *(mandatory)*

Actors: **Platform Owner (PO)**, **Workspace Owner (WO)**, **Trainer**, **Sales**, **Reviewer**. No login UI exists yet. Identities are database auth users created by tests or seed scripts. Login flows come in F4.

### User Story 1 - Workspaces and memberships isolated at the database (Priority: P1)

A staff member can read only the workspaces they are an active member of, and the PO can read all workspaces. Any request for another workspace's rows returns nothing. Requests with no identity get nothing at all.

**Why this priority**: Constitution I (non-negotiable). Every later tenant table relies on this pattern.

**Independent Test**: Run the isolation suite against a local database with two workspaces (A, B) and users in each role.

**Acceptance Scenarios**:

1. **Given** a trainer who is a member of A only, **When** they query workspaces and memberships, **Then** they see A and their own A membership only, never B (AT-ISO-01, AT-ISO-06).
2. **Given** the PO, **When** they query workspaces, **Then** they see A and B (BRD §roles).
3. **Given** an anonymous request, **When** any tenancy table is queried, **Then** 0 rows are returned and writes are rejected.
4. **Given** a member whose membership was revoked, **When** they query A, **Then** they get nothing, and the revoked membership row still exists for history (Constitution VI).
5. **Given** the app-layer check is bypassed (direct database access with the user's identity), **When** a foreign-workspace row is requested, **Then** the database still denies it (AT-ISO-06).

---

### User Story 2 - Platform Owner governance (Priority: P1)

Only the PO can create or change workspaces, grant or revoke memberships, and assign staff roles. A staff member has one role across all their workspaces.

**Why this priority**: Constitution III and AT-GOV-01.

**Independent Test**: For WO, trainer, sales and anonymous identities, attempt each governance write. All must fail. The PO's identical writes succeed.

**Acceptance Scenarios**:

1. **Given** a WO, trainer or sales user, **When** they try to create a workspace, add or revoke a membership, or change any role, **Then** the database rejects it (AT-GOV-01).
2. **Given** a staff member in A and B, **When** their role is read in either workspace, **Then** it is the same role, because the role is stored once per staff identity (AT-ISO-07).
3. **Given** a user, **When** they try to change their own role, **Then** it is rejected.

---

### User Story 3 - Shared permission matrix with deny-by-default (Priority: P1)

An app-layer `authorize(actor, capability, workspace)` and the database capability check implement the same approved matrix (D-09, D-10). Anything not granted is denied, including unlisted Sales rights and Sales coaching work; S30-PO-3 Q6 resolves the `coaching_work` role matrix: PO/WO/Trainer allowed, Sales denied.

**Why this priority**: The two-wall model in Architecture v3. The walls must not drift apart.

**Independent Test**: Unit-test the app-layer matrix. An integration parity test compares every role × capability pair against the database check.

**Acceptance Scenarios**:

1. **Given** every role × capability pair, **When** checked by the app layer and the database, **Then** both give the same answer, and that answer matches the approved matrix.
2. **Given** a capability name that is not in the matrix, **When** checked, **Then** it is denied.
3. **Given** an actor with the right role but no membership in the workspace (and not PO), **When** checked, **Then** it is denied.

---

### User Story 4 - Isolation harness in CI (Priority: P1)

A reusable test harness provisions isolated fixtures (two workspaces, users per role, signed sessions). Later features add their foreign-workspace negative tests through it. CI runs it against a real local database on every PR.

**Why this priority**: Constitution I requires a negative test with every new tenant table. Roadmap: integration tests join the CI gate from F3.

**Independent Test**: CI shows the integration job running the isolation suite and failing when a policy is weakened.

**Acceptance Scenarios**:

1. **Given** a PR, **When** CI runs, **Then** the local database starts, migrations apply from scratch, and the integration suite runs. The job fails on any isolation failure.
2. **Given** a policy deliberately weakened in a local experiment, **When** the suite runs, **Then** at least one negative test fails (verified during review, not committed).

### Edge Cases

- A staff user with no profile row (an auth user only) has no access to anything.
- A user who is a member of a workspace but has no staff role: no access.
- Client identities (future) must never gain staff access through these tables. Client accounts are separate (D-16) and are not part of this feature.
- The PO has a role but no memberships, and still has access by role (BRD line 40).
- Duplicate active membership for the same (workspace, user) is impossible. Re-granting access after a revocation creates a new active row and keeps the old one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Tenancy tables MUST exist: workspaces, staff profiles (one role per staff identity: platform_owner | workspace_owner | trainer | sales), and workspace memberships (active or revoked, with timestamps; never hard-deleted by the application).
- **FR-002**: Every tenant-owned table MUST carry `workspace_id` and expose a composite `(workspace_id, id)` key for composite foreign keys (Constitution I). Memberships MUST reference workspaces this way.
- **FR-003**: Row-level security MUST be enabled and forced on every table in this feature, with deny-by-default policies keyed to the signed identity.
- **FR-004**: A single database access helper MUST decide workspace access: PO → every workspace; otherwise an active membership plus a role that has the requested capability. It MUST be safe against search-path manipulation and MUST NOT be callable to widen another user's access.
- **FR-005**: Governance writes (workspaces, memberships, roles) MUST be allowed only for the PO, at the database level.
- **FR-006**: The capability matrix MUST be exactly the approved D-09/D-10 table in Architecture v3, plus a `coaching_work` capability for PO, WO and Trainer. Sales is denied `coaching_work`. S30-PO-3 Q6 records the approved role matrix: PO/WO/Trainer allowed; Sales denied.
- **FR-007**: An app-layer `authorize(actor, capability, workspaceId)` MUST implement the same matrix, deny by default, and be a pure function with no I/O.
- **FR-008**: An automated parity test MUST prove that the app and database matrices agree for every role × capability.
- **FR-009**: An isolation test harness MUST create fixtures through the documented local database tooling only, and MUST include foreign-workspace negative tests for every table and helper in this feature.
- **FR-010**: CI MUST run the integration suite against a fresh local database on every PR, with no secrets beyond the local stack's built-in development keys, and no deployment.
- **FR-011**: Migrations MUST be forward-only and non-destructive.
- **FR-012**: No PII may appear in migrations, seeds or test output beyond synthetic test emails.

### Governance amendment — S30-PO-3 Q7 and Q8

This amendment extends the existing F3 tenancy and governance scope. It records only the two approved governance behaviors. The implementation mechanisms in `plan.md` are technical design choices for those behaviors; no product ambiguity remains within this scope.

#### User Story 5 — Workspace Owner member roster (Priority: P1)

A Workspace Owner can see active members for roster administration. The PO-approved source states: “Supports roster administration. Needs RLS change, tests and security review.”

**Independent Test**: At the database boundary, verify the current Workspace Owner can access only active membership fields (`user_id`, `workspace_id`, `granted_at`, `revoked_at`, and associated `staff_profiles.role`) for their own workspace, and that mutation tests deny revoked or foreign-workspace rows and profile/contact columns.

**Acceptance Scenarios**:

1. **Given** a user who currently holds the Workspace Owner role in workspace A and active membership rows in A, **When** they request the roster, **Then** the database permits only the specified membership fields and associated staff role for active members of A; active means `revoked_at IS NULL` (S30-PO-3 Q7; S30-R8).
2. **Given** a revoked membership row or a membership in another workspace, **When** the Workspace Owner requests the roster for A, **Then** the row is not visible. Profile/contact fields such as names, email, and phone are outside this roster scope (S30-R8).
3. **Given** a Workspace Owner requests the roster, **When** they use the approved roster interface, **Then** the database exposes only the explicit membership projection and denies direct access to profile/contact columns and unrestricted base-table columns (S30-R8).

#### User Story 6 — Protect the final Platform Owner (Priority: P1)

The database prevents removal or demotion of the final Platform Owner. The PO-approved source states: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.”

**Independent Test**: Exercise database mutations for final-PO demotion/removal and add-first transfer with executed mutation tests after design review.

**Acceptance Scenarios**:

1. **Given** exactly one valid Platform Owner, **When** a role change/demotion or staff-profile deletion would leave zero Platform Owners, **Then** the database refuses the operation using the existing generic privileged-operation error convention (S30-R8; S34-PO-1 G2=A).
2. **Given** a new Platform Owner has first been added, **When** the previous Platform Owner is demoted or removed, **Then** the database permits the operation while at least one Platform Owner remains (S30-PO-3 Q8).
3. **Given** two transactions concurrently attempt to demote distinct Platform Owners when exactly two exist, **When** both mutations are serialized by the guard, **Then** at most one demotion succeeds and at least one Platform Owner remains (S30-R8).
4. **Given** a role demotion and a staff-profile deletion run concurrently against the same owner-count invariant, **When** both mutations are serialized by the guard, **Then** at least one valid Platform Owner remains (S30-R8; S34-PO-1 G2=A). Membership revocation/hard deletion and the currently restricted auth-user deletion cannot currently affect valid Platform Owner count and are outside this guard.

#### Clarifications

- S30-PO-3 Q6 resolves the existing `coaching_work` matrix source: PO/WO/Trainer are allowed and Sales is denied. No code changes are part of this documentation cycle.
- S30-PO-3 Q7 (source: `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md`) approves “WO sees active members” and “Supports roster administration. Needs RLS change, tests and security review.” S30-R8 clarifies the approved scope: the requesting user must currently hold the Workspace Owner role in that workspace; visibility is limited to that workspace and existing membership-row columns (`user_id`, `workspace_id`, `granted_at`, `revoked_at`) plus the associated `staff_profiles.role`. Active is `revoked_at IS NULL` in `supabase/migrations/20261027120000_tenancy.sql`. Profile/contact fields (including names, email, and phone) are explicitly out of scope.
- S30-PO-3 Q8 (source: `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md`) approves: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.” S30-R8 clarifies that the invariant must hold under concurrency; serialize Platform-Owner role changes and protect every operation that could leave zero valid Platform Owners. S34-PO-1 G2=A narrows that set to role change/demotion and staff-profile deletion. Membership revocation changes membership state only, membership hard deletion is prohibited, and auth-user deletion currently uses `ON DELETE RESTRICT`; none is an auth-user cascade path. Reuse the existing generic `not_permitted` / SQLSTATE `42501` privileged-operation convention evidenced in `supabase/migrations/20261028120000_auth_recovery_links.sql:144-151`; do not add user-facing copy.
- S30-R8 is an architect clarification of the already-approved S30-PO-3 Q7/Q8 behavior, not a new product decision. No open ambiguity remains within the approved F3 roster scope or the S34 last-PO-count scope. The S34 trainer-deletion implementation mechanism is explicitly open and blocked under PO-ESCALATION G1; it is not treated as decided. Other requirements in the existing F3 specification are unchanged.

#### User Story 7 — Departed trainer deletion (BLOCKED pending PO-ESCALATION G1)

A departed trainer's auth user and disposable trainer-only records are eligible for deletion only under the conditional G1 decision. This documentation round verifies why the current schema blocks that outcome; it does not select or implement a deletion mechanism.

**Independent Test**: On the PO-approved trainer-departure workflow, use synthetic trainer fixtures to prove that the auth user and only the explicitly enumerated disposable trainer-only records are removed, while every protected client, plan, log, subscription, financial, and audit row remains intact. The current schema's blocked-deletion behavior is the verified baseline until the escalation is resolved.

**Acceptance Scenarios**:

1. **Given** the current schema on this feature's HEAD and `origin/main`, **When** deletion of a departed trainer's auth user is attempted while the trainer has a `staff_profiles` row, **Then** the operation is blocked by the `staff_profiles.user_id` foreign key (`ON DELETE RESTRICT`) and the `staff_profiles_no_delete` trigger. This is a verified current-behavior fact, not the desired G1 outcome.
2. **Given** a PO-approved departure workflow and its enumerated disposable trainer-only record set, **When** the workflow executes for a departed trainer, **Then** the auth user and exactly those disposable records may be removed while every protected client account, plan, log, subscription, financial, and audit row remains intact. The workflow and record set are BLOCKED pending PO-ESCALATION G1.
3. **Given** any candidate departure workflow, **When** its deletion behavior is reviewed for acceptance, **Then** no implementation is accepted unless executed tests prove zero protected rows are deleted or damaged. No candidate mechanism is selected by this specification.

### Key Entities

- **Workspace**: id, name, slug (unique), created_at, created_by.
- **Staff profile**: user identity, role (one of 4), created_at. One per staff identity.
- **Workspace membership**: id, workspace_id, user identity, granted_at, granted_by, revoked_at, revoked_by.
- **Capability**: a named permission from the approved matrix.

## Clarifications

- S30-PO-3 Q6 resolves the `coaching_work` role matrix. The PO answer is `PO/WO/Trainer, deny Sales (Recommended)`; the option text is `PO/WO/Trainer, deny Sales`.
- S30-PO-3 Q7 and Q8 are resolved for the approved scope by S30-R8 and recorded in FR-013, FR-014, SC-005, and SC-006. Their implementation acceptance is tracked by T014-T016 in this forward-only governance cycle and remains pending; this documentation cycle does not claim implementation completion.
- **G1=A (conditional):** Allow departed trainer deletion and disposable trainer-only records. NEVER delete or damage client accounts, plans, logs, subscriptions, or required financial/audit history. Verify foreign keys and tests first; escalate if safe deletion is impossible.
- **G2=A:** Last-PO guard applies only to operations affecting valid PO count.

S34-PO-1 source: `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md`. G1's conditional intent and G2's guard scope are settled. The mechanism and exact disposable-record set needed to satisfy G1 are not settled: PO-ESCALATION G1 is open, FR-015 and SC-007 are BLOCKED, and no ambiguity is assumed or encoded.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of tenancy tables have RLS enabled and forced, verified by a catalog query in the test suite.
- **SC-002**: The isolation suite passes, with ≥ 1 foreign-workspace negative test per table and per governance write, for each of the 4 non-PO identities (WO, trainer, sales, anonymous).
- **SC-003**: App/database matrix parity holds for 100% of role × capability pairs.
- **SC-004**: CI runs the integration suite on every PR and stays at $0 with no secrets.

## Assumptions

- Login, sessions, password reset and client accounts are F4 and later. Tests mint sessions through the local auth stack's admin API.
- Audit events for governance writes come with F5 (audit log). F3 records `granted_by`/`revoked_by` columns now, and F5 adds audit emission.
- Docker is not available on the reviewer's machine, so integration tests are verified in Linux CI. Unit tests run locally.
- S30-PO-3 Q6 resolves the `coaching_work` matrix: "PO/WO/Trainer, deny Sales (Recommended)"; Sales remains denied.
- S30-PO-3 Q7, as clarified by S30-R8, permits Workspace Owners to see active membership rows in their own workspace for roster administration; profile/contact fields are out of scope.
- S30-PO-3 Q7 and Q8 governance behaviors are specified in this amendment but are not implemented by the F3 baseline; T014-T016 track implementation, executed mutation tests, and architect security review.
- S34-PO-1 G1 is conditional: departed-trainer deletion and disposable trainer-only records may proceed only when protected client, plan, log, subscription, financial, and audit history remains intact. The current schema blocks departed-trainer auth-user deletion; FR-015/SC-007 and T017-T019 remain BLOCKED pending PO-ESCALATION G1.
- S34-PO-1 G2 limits the final-Platform-Owner guard to operations affecting valid Platform Owner count.

### Governance amendment requirements and success criteria (S30-PO-3)

- **FR-013**: For a requesting user who currently holds the Workspace Owner role in workspace W, the database MUST permit visibility of active membership rows in W only, limited to the existing membership-row columns `user_id`, `workspace_id`, `granted_at`, and `revoked_at`, plus the associated `staff_profiles.role`; “active” MUST mean `revoked_at IS NULL` in the existing model. Profile/contact fields (including names, email, and phone) are out of scope. This records S30-PO-3 Q7 ("WO sees active members"; "Supports roster administration. Needs RLS change, tests and security review.") as clarified by S30-R8.
- **FR-014**: The database MUST preserve at least one valid Platform Owner under concurrent mutations that affect valid Platform Owner count. It MUST serialize every such mutation and refuse any operation that would leave zero valid Platform Owners, including role change/demotion and staff-profile deletion. Membership revocation/hard deletion and the currently restricted auth-user deletion are outside this guard because they cannot currently affect valid Platform Owner count: membership hard deletion is prohibited, revocation changes membership state only, and auth-user deletion uses `ON DELETE RESTRICT` rather than a cascade. Any future mutation that can affect valid Platform Owner count must be re-analyzed under this FR before implementation. It MUST permit transfer after another Platform Owner is added first, as approved by S30-PO-3 Q8: "The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first." Refused privileged operations MUST use the existing generic `not_permitted` / SQLSTATE `42501` convention, with no new user-facing copy (S30-R8; S34-PO-1 G2=A).

### S34 conditional trainer-deletion requirement (G1; BLOCKED)

- **FR-015 — BLOCKED pending PO-ESCALATION G1**: Following G1=A, deletion of a departed trainer's auth user and disposable trainer-only records may proceed only if every client account, plan, log, subscription, and required financial/audit row remains intact and no required history is deleted or damaged. The verified current behavior on this feature's HEAD and `origin/main` is deletion blocked: `public.staff_profiles.user_id` references `auth.users(id)` with `ON DELETE RESTRICT`, and `staff_profiles_no_delete` rejects staff-profile deletion even for privileged callers. This requirement is not implementation-ready: no cascade, FK change, trigger change, detach, anonymization, reassignment, or other mechanism is authorized by this document. Implementation may start only after PO resolves PO-ESCALATION G1, the exact disposable-record set and attribution contract are selected, and a fresh Analyze passes.

- **SC-005**: Executed database mutation tests reject 100% of role changes/demotions and staff-profile deletions that would leave zero valid Platform Owners; two concurrent demotions when exactly two Platform Owners exist and the concurrent demotion/staff-profile-deletion race leave at least one valid Platform Owner; and add-new-PO-first transfer succeeds without leaving zero valid Platform Owners. Membership revocation/hard deletion and the currently restricted auth-user deletion are excluded because they cannot currently affect valid Platform Owner count (S34-PO-1 G2=A).
- **SC-006**: Executed database mutation tests permit a current Workspace Owner to read 100% of active membership rows and only the specified membership fields and associated staff role in their own workspace, and return zero rows for revoked memberships or other workspaces; profile/contact fields remain inaccessible through this roster scope.
- **SC-007 — BLOCKED pending PO-ESCALATION G1**: Executed tests for the PO-approved trainer-departure workflow MUST demonstrate that 100% of protected client, plan, log, subscription, financial, and audit rows remain intact, that zero protected rows are deleted or damaged, and that exactly the PO-enumerated disposable trainer-only records are removed. The current baseline fact is zero successful departed-trainer auth-user deletions because the `ON DELETE RESTRICT` FK and `staff_profiles_no_delete` trigger block them; no success evidence exists until the escalation is resolved.
