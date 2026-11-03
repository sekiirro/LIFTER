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

An app-layer `authorize(actor, capability, workspace)` and the database capability check implement the same approved matrix (D-09, D-10). Anything not granted is denied, including unlisted Sales rights and Sales coaching work (unconfirmed).

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
- **FR-006**: The capability matrix MUST be exactly the approved D-09/D-10 table in Architecture v3, plus a `coaching_work` capability for PO, WO and Trainer. Sales is denied `coaching_work`, which is unconfirmed (NEEDS SOURCE CONFIRMATION).
- **FR-007**: An app-layer `authorize(actor, capability, workspaceId)` MUST implement the same matrix, deny by default, and be a pure function with no I/O.
- **FR-008**: An automated parity test MUST prove that the app and database matrices agree for every role × capability.
- **FR-009**: An isolation test harness MUST create fixtures through the documented local database tooling only, and MUST include foreign-workspace negative tests for every table and helper in this feature.
- **FR-010**: CI MUST run the integration suite against a fresh local database on every PR, with no secrets beyond the local stack's built-in development keys, and no deployment.
- **FR-011**: Migrations MUST be forward-only and non-destructive.
- **FR-012**: No PII may appear in migrations, seeds or test output beyond synthetic test emails.

### Governance amendment — S30-PO-3 Q7 and Q8

This amendment extends the existing F3 tenancy and governance scope. It records only the two approved governance behaviors and leaves the identified implementation details open for PO clarification.

#### User Story 5 — Workspace Owner member roster (Priority: P1)

A Workspace Owner can see active members for roster administration. The PO-approved source states: “Supports roster administration. Needs RLS change, tests and security review.”

**Independent Test**: At the database boundary, verify that the approved active-member roster visibility is scoped as decided by the PO and that the RLS mutation tests deny visibility outside that scope. Exact fields and roster boundary require clarification before implementation.

**Acceptance Scenarios**:

1. **Given** a Workspace Owner and active members, **When** the Owner requests the member roster, **Then** the database permits the approved active-member roster visibility (S30-PO-3 Q7: “WO sees active members”).
2. **Given** revoked membership rows or a membership outside the permitted roster scope, **When** the Owner requests the roster, **Then** visibility follows the PO-clarified active-state and workspace-boundary rules; those details are blocked pending clarification.

#### User Story 6 — Protect the final Platform Owner (Priority: P1)

The database prevents removal or demotion of the final Platform Owner. The PO-approved source states: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.”

**Independent Test**: Exercise database mutations for final-PO demotion/removal and add-first transfer with executed mutation tests after design review.

**Acceptance Scenarios**:

1. **Given** exactly one Platform Owner, **When** an operation would remove or demote that final Platform Owner, **Then** the database refuses the operation.
2. **Given** a new Platform Owner has first been added, **When** the previous Platform Owner is demoted, **Then** the database permits the transfer without leaving zero Platform Owners.

#### Clarifications

- S30-PO-3 Q6 resolves the existing `coaching_work` matrix source: PO/WO/Trainer are allowed and Sales is denied. No code changes are part of this documentation cycle.
- S30-PO-3 Q7 approves Workspace Owner visibility of active members for roster administration. Roster boundary and visible member fields remain open PO questions.
- S30-PO-3 Q8 approves a database guard against removing or demoting the final Platform Owner, with transfer by adding a new PO first. Concurrency and mutation failure details remain open PO questions.
- No further product behavior is inferred by this amendment. Open questions and blockers are listed in the SK-A PO decision register.

### Key Entities

- **Workspace**: id, name, slug (unique), created_at, created_by.
- **Staff profile**: user identity, role (one of 4), created_at. One per staff identity.
- **Workspace membership**: id, workspace_id, user identity, granted_at, granted_by, revoked_at, revoked_by.
- **Capability**: a named permission from the approved matrix.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of tenancy tables have RLS enabled and forced, verified by a catalog query in the test suite.
- **SC-002**: The isolation suite passes, with ≥ 1 foreign-workspace negative test per table and per governance write, for each of the 4 non-PO identities (WO, trainer, sales, anonymous).
- **SC-003**: App/database matrix parity holds for 100% of role × capability pairs.
- **SC-004**: CI runs the integration suite on every PR and stays at $0 with no secrets.

## Assumptions

- Login, sessions, password reset and client accounts are F4 and later. Tests mint sessions through the local auth stack's admin API.
- Audit events for governance writes come with F5 (audit log). F3 records `granted_by`/`revoked_by` columns now, and F5 adds audit emission.
- Docker is not available on the reviewer's machine, so integration tests are verified in Linux CI. Unit tests run locally.
- The "Sales coaching rights" open item (Decision Register, Open) stays deny until the PO decides.
- WO visibility of other members' memberships in their own workspace isn't specified in the sources. F3 allows only PO + self, and it is listed as NEEDS DECISION.

### Governance amendment requirements and success criteria (S30-PO-3)

- **FR-013**: The database MUST permit a Workspace Owner to see active members for roster administration, as approved by S30-PO-3 Q7: “WO sees active members” and “Supports roster administration. Needs RLS change, tests and security review.” The exact roster boundary and member fields are subject to the recorded PO clarifications.
- **FR-014**: The database MUST refuse to remove or demote the final Platform Owner. Transfer MUST work by adding a new Platform Owner first, as approved by S30-PO-3 Q8: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.”

- **SC-005**: In executed database mutation tests, 100% of attempts that would remove or demote the final Platform Owner are rejected, and an add-new-PO-first transfer leaves at least one Platform Owner.
- **SC-006**: After the PO clarifies the roster boundary and visible fields, 100% of executed RLS mutation cases enforce that approved active-member visibility for Workspace Owners and deny out-of-scope visibility.
