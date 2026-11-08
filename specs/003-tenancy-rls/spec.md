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

This amendment extends the existing F3 tenancy and governance scope. It records only the two approved governance behaviors. The implementation mechanisms in `plan.md` are technical design choices for those behaviors. The membership-revocation path of User Story 6 is extended by S36-PO-2. The atomic demotion mechanism of S36-Q1 option (a) and S36-Q2 = C is superseded and removed by S37-PO-3 and S37-PO-4 (recorded in Clarifications). An ownership change is recorded as: authorize a replacement Platform Owner first, then safely delete the old account. Stale-session blocking is provided by the existing per-request database and app-layer authorization (S37-Q1 resolved). Open PO questions are S37-Q4 (the mechanism of the old-account deletion step) and S37-Q5 (the effect of a membership revocation on Platform Owner access).

#### User Story 5 — Workspace Owner member roster (Priority: P1)

A Workspace Owner can see active members for roster administration. The PO-approved source states: “Supports roster administration. Needs RLS change, tests and security review.”

**Independent Test**: At the database boundary, verify the current Workspace Owner can access only active membership fields (`user_id`, `workspace_id`, `granted_at`, `revoked_at`, and associated `staff_profiles.role`) for their own workspace, and that mutation tests deny revoked or foreign-workspace rows and profile/contact columns.

**Acceptance Scenarios**:

1. **Given** a user who currently holds the Workspace Owner role in workspace A and active membership rows in A, **When** they request the roster, **Then** the database permits only the specified membership fields and associated staff role for active members of A; active means `revoked_at IS NULL` (S30-PO-3 Q7; S30-R8).
2. **Given** a revoked membership row or a membership in another workspace, **When** the Workspace Owner requests the roster for A, **Then** the row is not visible. Profile/contact fields such as names, email, and phone are outside this roster scope (S30-R8).
3. **Given** a Workspace Owner requests the roster, **When** they use the approved roster interface, **Then** the database exposes only the explicit membership projection and denies direct access to profile/contact columns and unrestricted base-table columns (S30-R8).

#### User Story 6 — Protect the final Platform Owner (Priority: P1)

The database prevents removal or demotion of the final Platform Owner. The PO-approved source states: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.”

**Independent Test**: Exercise database mutations for final-PO demotion, membership revocation, staff-profile deletion, and add-first transfer with executed mutation tests after design review. Membership revocation is in scope per S36-PO-2.

**Acceptance Scenarios**:

1. **Given** exactly one valid Platform Owner, **When** a role change/demotion, membership revocation, or staff-profile deletion would leave zero Platform Owners, **Then** the database refuses the operation using the existing generic privileged-operation error convention (S30-R8; S34-PO-1 G2=A; S36-PO-2).
2. **Given** a new Platform Owner has first been added, **When** the previous Platform Owner's ownership is changed, **Then** it is recorded as: authorize the replacement Platform Owner first, then safely delete the old account (S37-PO-3; S37-PO-4), and the database permits the operation while at least one Platform Owner remains (S30-PO-3 Q8). No atomic role demotion is applied on membership revocation; the S36-Q1 option (a) and S36-Q2 = C demotion clauses are superseded. The deletion mechanism is open (S37-Q4), and the effect of a membership revocation on Platform Owner access is open (S37-Q5). Until S37-Q4 is answered, the retained `staff_profiles_no_delete` trigger rejects staff-profile deletion, and it stays inside the shared serialization scope (scenario 1; FR-014).
3. **Given** two transactions concurrently attempt to remove a valid Platform Owner from distinct Platform Owners, by role change or membership revocation, when exactly two exist, **When** both mutations are serialized by the guard, **Then** at most one removal succeeds and at least one Platform Owner remains (S30-R8; S36-PO-2).
4. **Given** a role demotion, a membership revocation, or a staff-profile deletion runs concurrently with another of these mutations against the same owner-count invariant, **When** both mutations are serialized by the guard, **Then** at least one valid Platform Owner remains (S30-R8; S34-PO-1 G2=A; S36-PO-2). Membership hard deletion is prohibited, and the currently restricted auth-user deletion cannot cascade; both are outside this guard.
5. **Given** an identity whose role or membership was changed or revoked, **When** that identity uses a session, token or actor state issued or loaded before the change, **Then** the database denies every capability the identity no longer holds, a revoked membership grants zero access, and no membership row is created automatically (FR-016). The database denial comes from the existing per-request re-read; no new mechanism is added (S37-Q1 resolved). The app-layer clause (that `authorize()` also denies such an actor) is open (S37-Q6).

#### Clarifications

- S30-PO-3 Q6 resolves the existing `coaching_work` matrix source: PO/WO/Trainer are allowed and Sales is denied. No code changes are part of this documentation cycle.
- S30-PO-3 Q7 (source: `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md`) approves “WO sees active members” and “Supports roster administration. Needs RLS change, tests and security review.” S30-R8 clarifies the approved scope: the requesting user must currently hold the Workspace Owner role in that workspace; visibility is limited to that workspace and existing membership-row columns (`user_id`, `workspace_id`, `granted_at`, `revoked_at`) plus the associated `staff_profiles.role`. Active is `revoked_at IS NULL` in `supabase/migrations/20261027120000_tenancy.sql`. Profile/contact fields (including names, email, and phone) are explicitly out of scope.
- S30-PO-3 Q8 (source: `C:/Users/NEW LAP/.lifter/briefs/s28-po-decisions-verbatim.md`) approves: “The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first.” S30-R8 clarifies that the invariant must hold under concurrency; serialize Platform-Owner role changes and protect every operation that could leave zero valid Platform Owners. S34-PO-1 G2=A narrowed that set to role change/demotion and staff-profile deletion; S36-PO-2 extends it to membership revocation (see Clarifications). Membership hard deletion is prohibited, and auth-user deletion currently uses `ON DELETE RESTRICT`; neither is an auth-user cascade path. Reuse the existing generic `not_permitted` / SQLSTATE `42501` privileged-operation convention evidenced in `supabase/migrations/20261028120000_auth_recovery_links.sql:144-151`; do not add user-facing copy.
- S30-R8 is an architect clarification of the already-approved S30-PO-3 Q7/Q8 behavior, not a new product decision. No open ambiguity remains within the approved F3 roster scope. The S34 last-PO-count scope is amended by S36-PO-2; the atomic demotion mechanism attached to it by S36-Q1 option (a) and S36-Q2 = C is superseded and removed by S37-PO-3 and S37-PO-4. S35-PO-1 G1=A resolves the trainer-departure model to deactivate + revoke (no deletion); PO-ESCALATION G1 is closed. Other requirements in the existing F3 specification are unchanged.

#### User Story 7 — Departed trainer departure (deactivate + revoke; no deletion)

A departed trainer's access is removed by deactivating the trainer and revoking all of their workspace memberships/access. The auth user and the `staff_profiles` row are NOT deleted, and audit attribution is preserved. No deletion, cascade, detach, anonymization, or reassignment of the auth user or `staff_profiles` row is authorized. The current schema has no dedicated deactivation capability; T020 tracks adding it (tagged FR-015).

**Independent Test**: For a departed trainer fixture, prove that deactivation revokes all workspace memberships/access, the auth user and `staff_profiles` row remain, audit attribution (`granted_by`/`revoked_by` and any audit rows) is preserved, and 100% of protected client, plan, log, subscription, financial, and audit rows remain intact.

**Acceptance Scenarios**:

1. **Given** a departed trainer with active memberships, **When** the departure workflow runs, **Then** all of their workspace memberships are revoked (active to revoked, with `revoked_at`/`revoked_by` set) and staff access is removed, while the auth user and `staff_profiles` row remain.
2. **Given** the departure workflow, **When** it completes, **Then** audit attribution is preserved: `granted_by`/`revoked_by` and any audit rows remain intact and are not reassigned or anonymized.
3. **Given** the departure workflow, **When** it completes, **Then** 100% of protected client, plan, log, subscription, financial, and audit rows remain intact and zero protected rows are deleted or damaged.
4. **Given** the current schema, **When** deletion of the auth user or `staff_profiles` row is attempted, **Then** it remains blocked by the existing `ON DELETE RESTRICT` foreign key and `staff_profiles_no_delete` trigger; no deletion path is introduced by this decision (G1=A).

### Key Entities

- **Workspace**: id, name, slug (unique), created_at, created_by.
- **Staff profile**: user identity, role (one of 4), created_at. One per staff identity.
- **Workspace membership**: id, workspace_id, user identity, granted_at, granted_by, revoked_at, revoked_by.
- **Capability**: a named permission from the approved matrix.

## Clarifications

- S30-PO-3 Q6 resolves the `coaching_work` role matrix. The PO answer is `PO/WO/Trainer, deny Sales (Recommended)`; the option text is `PO/WO/Trainer, deny Sales`.
- S30-PO-3 Q7 and Q8 are resolved for the approved scope by S30-R8 and recorded in FR-013, FR-014, SC-005, and SC-006. Their implementation acceptance is tracked by T014-T016 in this forward-only governance cycle and remains pending; this documentation cycle does not claim implementation completion.
- **S35-PO-1 G1=A (verbatim):** "G1=A (deactivate/revoke; preserve audit)" (source: C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/s35-po-1.verbatim.txt). Architect note (not PO words): option A of the #50 lane = keep departed-trainer deletion blocked (staff_profiles RESTRICT FK and no-delete guards stay), deactivate/revoke access instead, preserve audit attribution; options B/C/D not chosen. Resolution: departure = deactivate + revoke memberships/access; no deletion of the auth user or staff_profiles row; audit attribution preserved. FR-015/SC-007 and T017-T019 are no longer BLOCKED.
- **G2=A:** Last-PO guard applies only to operations affecting valid PO count.
- **S36-PO-2 (verbatim, Governance):** "Former PO demotion AND membership revocation must remove PO access." (source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-2.verbatim.txt`, Governance line). Architect mapping of S35R2-PO-1 (not PO words): option (c), both paths stated explicitly. Resolution: (1) demotion and membership revocation of a Platform Owner each remove that identity's PO access; (2) the final-PO guard covers membership revocation as well as role change/demotion; (3) staff-profile deletion stays excluded by the retained `staff_profiles_no_delete` trigger and remains a protected operation under S34-PO-1 G2=A; (4) membership hard deletion stays prohibited and auth-user deletion stays restricted. This supersedes only the membership-revocation exclusion in S34-PO-1 G2=A (FR-014, SC-005, Story 6 scenario 4). Open: the current data model derives PO access from the role (`app_private.is_platform_owner`) and uses memberships only for workspace access, so the mechanism by which membership revocation removes PO access is not defined. This was PO-DECISION-NEEDED S36-Q1; it was answered by the S36-Q1 entry below (option (a)), which S37-PO-3 and S37-PO-4 later supersede. Whether a membership revocation removes PO access is open (S37-Q5).
- **S36-Q1 answered (verbatim, PO product decisions section 2, #50 bullet). SUPERSEDED in part by S37-PO-3 and S37-PO-4: the atomic demotion described below is removed; the verbatim record is kept for audit.** "Atomic PO membership revocation + role demotion, protected by last-PO guard." (source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-3.verbatim.txt`, section 2). Selected option: (a) (S36 round-4 brief): revoking a Platform Owner's membership also moves that identity's staff role away from `platform_owner` in the same transaction, under the same serialization lock and last-PO guard. PO access stays role-based (`app_private.is_platform_owner`). Both writes are atomic. RED tests T021 (demotion path) and T022 (revocation path) cover last-PO refusal and atomic rollback on failure. The PO bullet names no target role; that is S36-Q2.
- **S36-Q2 = C (verbatim, PO product decisions, #50 bullet "S36-Q2 = C"):** "PO membership revocation atomically demotes to `workspace_owner`, enforcing last-PO guard. Revoked membership grants ZERO access; no automatic membership creation. PO will have their own workspace. Block stale-session authorization bypass." (source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-5.verbatim.txt`). Recorded as decided: (1) SUPERSEDED by S37-PO-3 and S37-PO-4: the atomic demotion of a Platform Owner to `workspace_owner` on membership revocation is removed (FR-014; T023 retired); (2) a revoked membership grants zero access (FR-016a; T025); (3) no automatic membership creation (FR-016b; T026); (4) stale-session authorization bypass is blocked (FR-016c; T027).
- **S37-PO-3 (verbatim, PO message 2026-11-08, binding):** "PO clarification: Stop overengineering rare PO demotion/revocation scenarios. No elaborate demotion workflow is needed. If ownership changes, create/authorize a replacement PO first, then safely delete the old account. Preserve essential DB/RLS authorization and last-PO protection; audit existing safeguards before adding mechanisms. PO creates their own workspace manually through the normal user flow—no special auto-provisioning. Simplify Q1–Q3 accordingly; flag only genuine conflicts with prior approved decisions." (source: `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, S37-PO-3)
- **S37-PO-4 (verbatim, PO message 2026-11-08, binding):** "A approved. S37-PO-3 supersedes prior atomic demotion requirements. Use replacement-PO-then-safe-deletion. Preserve last-PO guard, zero-access revocation, and tenant isolation. Update #67 and spec 003; avoid unnecessary complexity. Follow all existing review/CI gates." (source: `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, S37-PO-4). Option A as presented to the PO (architect wording, not PO words): "S37-PO-3 replaces the demotion workflow. #67 removes atomic demotion and records the change of owner as 'authorize a replacement PO, then delete the old account'. It keeps the last-PO guard, the rule that a revoked membership grants zero access, and no automatic membership. A later spec PR removes the demotion requirement from the merged spec 003 text too." The PO's instruction "Update #67 and spec 003" overrides the "later spec PR" wording, so spec 003 is updated within #67.
- **S37-Q1 — RESOLVED: existing DB/RLS per-request authorization; no new mechanism.** The audit (`research.md`, "S37 safeguard audit") shows that the helper functions (`supabase/migrations/20261027120000_tenancy.sql:38-77`) and the app-layer `getActor()` (`lib/auth/actor.ts:23-51`) re-read the role and active memberships on every request, and no session claim carries them. No gap was found in that path, so no mechanism is added. The last-PO guard is not yet implemented (audit finding F-A1, pending task T015); that is a separate pending requirement, not a stale-session gap.
- **S37-Q2 — REMOVED (moot).** It asked about the other-membership effect of the atomic demotion. S37-PO-3 and S37-PO-4 remove that demotion, so no other-membership effect is specified. T023 and T025 are updated accordingly.
- **S37-Q3 — RESOLVED by S37-PO-3.** A Platform Owner creates their own workspace manually through the existing PO-only write (`workspaces_insert_po`, `supabase/migrations/20261027120000_tenancy.sql:132-133`) through the normal user flow. There is no auto-provisioning and no automatic membership. The audit found no automatic provisioning path (`research.md`).
- **S37-Q4 (PENDING-PO; MCQ; not encoded as a default):** how the "safely delete the old account" step of S37-PO-3 and S37-PO-4 is performed. Conflict with prior approved decisions: `staff_profiles.user_id` references `auth.users` with `ON DELETE RESTRICT` (`tenancy.sql:5`); `staff_profiles_no_delete` blocks direct deletes (`supabase/migrations/20261027150100_audited_tables_no_delete.sql:17`); S35-PO-1 G1=A and FR-015 authorize no deletion of an auth user or `staff_profiles` row; audit attribution references `staff_profiles` (`tenancy.sql:15`, `:23`, `:25`). No existing path deletes a staff account. Options: (a) retain the old account. After the replacement PO is authorized, the old PO's access is removed through the existing governance writes, and the account is kept for audit, as in G1=A departure. (b) allow deletion of the old PO's auth user and `staff_profiles` row after the replacement PO exists, by changing the no-delete trigger and the RESTRICT foreign key, and by handling audit attribution explicitly. (c) defer the deletion mechanism to a later spec PR and record only the procedure now. Implications: (a) matches G1=A and needs no schema change, but "delete" becomes "retire" and the PO must accept that; (b) follows the PO's literal words, but adds a deletion path that the approved guards forbid, needs a new migration, tasks and architect review, and changes audit references; (c) leaves the step undefined in F3. Recommendation: (a). Blocked: only the deletion step. The replacement-PO step (S37-PO-3) and the last-PO guard are not blocked.
- **S37-Q5 (PENDING-PO; MCQ; not encoded as a default):** does revoking a Platform Owner's membership remove that identity's Platform Owner access? Conflict with prior approved decisions: S36-PO-2 says "Former PO demotion AND membership revocation must remove PO access", but PO access is role-based (`tenancy.sql:67-68`), and the approved edge case says a Platform Owner with a role but no memberships still has access by role. S37-PO-4 removes the atomic demotion that answered S36-PO-2 and keeps "zero-access revocation". Options: (a) no: PO access stays role-based, a revoked Platform Owner membership grants nothing new but does not remove the role's access, and FR-016(a) is read for non-PO roles; the membership-revocation clause of S36-PO-2 is withdrawn. (b) yes, by a new check: `has_workspace_access` requires an active membership for a Platform Owner too, so revoking the membership removes access to that workspace only; this changes the PO design and the no-membership edge case. Option (b) also needs a rule that a Platform Owner cannot re-grant their own membership, because `workspace_memberships_insert_po` lets any Platform Owner insert a membership with `granted_by = auth.uid()` (`supabase/migrations/20261027120000_tenancy.sql:141-142`); that rule is a further new mechanism. (c) yes, by changing the role: the atomic demotion of S36-Q1 and S36-Q2 = C, which S37-PO-3 and S37-PO-4 remove. Implications: (a) matches "avoid unnecessary complexity" and keeps the existing design; (b) adds a new mechanism to the PO model; (c) is excluded by S37-PO-4. Recommendation: (a). Blocked: the Platform Owner case of FR-016(a), the membership-revocation case of T022 and the Platform Owner case of T025. Not blocked: zero access for non-PO roles, the last-PO guard and the replacement-PO step.
- **S37-Q6 (PENDING-PO; MCQ; not encoded as a default):** must `authorize()` itself reject an actor object loaded before a revocation or role change (FR-016(c), app-layer clause)? Conflict with prior approved decisions: FR-016(c) and S36-Q2 = C ("Block stale-session authorization bypass") require the app-layer denial, but FR-007 requires `authorize()` to be a pure function with no I/O, and a pure function cannot detect that its input is stale. Options: (a) freshness contract: `authorize()` stays pure; every request obtains the actor through `getActor()`, which re-reads `staff_profiles` and `workspace_memberships` (`lib/auth/actor.ts:42-51`), and no actor is reused across requests; the app-layer clause is met by that contract. (b) freshness marker: the actor carries a load time or version and `authorize()` rejects actors older than a window; this is a new mechanism and needs a window value the PO has not chosen. (c) make `authorize()` async and re-read the rows on each call; this conflicts with FR-007 and requires FR-007 to change. Implications: (a) keeps FR-007 and needs no schema change, but relies on callers following the contract; (b) adds state and a time value nobody has chosen; (c) breaks the pure, no-I/O matrix and the parity-test design. Recommendation: (a). Blocked: only the app-layer denial assertion (T027(d)). Not blocked: the database denial (T027(a), (c)).

S35-PO-1 source: `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/s35-po-1.verbatim.txt` (architect notes: `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/notes.txt`). G1 is resolved to deactivate/revoke (no deletion); G2's guard scope is settled. PO-ESCALATION G1 is closed by this decision. The current schema has no deactivation capability; T020 tracks adding it (tagged FR-015).

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
- S35-PO-1 G1=A resolves the departed-trainer departure model: deactivate + revoke memberships/access; no deletion of the auth user or staff_profiles row; audit attribution preserved. The existing RESTRICT FK and no-delete guards remain. FR-015/SC-007 and T017-T019 are rewritten to this model and are no longer BLOCKED. No deactivation capability exists in the current schema; T020 tracks adding it (tagged FR-015).
- S34-PO-1 G2 limits the final-Platform-Owner guard to operations affecting valid Platform Owner count. S36-PO-2 extends that guard to membership revocation. The atomic demotion of S36-Q1 option (a) and S36-Q2 = C is superseded by S37-PO-3 and S37-PO-4. The stale-session question (S37-Q1) is resolved by existing per-request authorization. The membership-revocation effect on Platform Owner access (S37-Q5) and the old-account deletion mechanism (S37-Q4) are open.

### Governance amendment requirements and success criteria (S30-PO-3)

- **FR-013**: For a requesting user who currently holds the Workspace Owner role in workspace W, the database MUST permit visibility of active membership rows in W only, limited to the existing membership-row columns `user_id`, `workspace_id`, `granted_at`, and `revoked_at`, plus the associated `staff_profiles.role`; “active” MUST mean `revoked_at IS NULL` in the existing model. Profile/contact fields (including names, email, and phone) are out of scope. This records S30-PO-3 Q7 ("WO sees active members"; "Supports roster administration. Needs RLS change, tests and security review.") as clarified by S30-R8.
- **FR-014**: The database MUST preserve at least one valid Platform Owner under concurrent mutations that affect valid Platform Owner count. It MUST serialize every such mutation and refuse any operation that would leave zero valid Platform Owners, including role change/demotion, membership revocation, and staff-profile deletion (S36-PO-2). A role change away from `platform_owner` removes that identity's Platform Owner access, because that access is derived from the role (`is_platform_owner`), and it runs under the same serialization lock and last-PO guard. The effect of a membership revocation of a Platform Owner on Platform Owner access is open (S37-Q5). No atomic role demotion on membership revocation is required: S37-PO-3 and S37-PO-4 supersede S36-Q1 option (a) and S36-Q2 = C. An ownership change is recorded as: authorize a replacement Platform Owner first, then safely delete the old account (S37-PO-3; S37-PO-4); the deletion mechanism is open (S37-Q4). Membership hard deletion is prohibited, and the currently restricted auth-user deletion is outside this guard because it uses `ON DELETE RESTRICT` rather than a cascade and cannot remove a valid Platform Owner. Any future mutation that can affect valid Platform Owner count must be re-analyzed under this FR before implementation. It MUST permit transfer after another Platform Owner is added first, as approved by S30-PO-3 Q8: "The database refuses to remove or demote the final Platform Owner. Simple and prevents lockout. Transfer works by adding a new PO first." Refused privileged operations MUST use the existing generic `not_permitted` / SQLSTATE `42501` convention, with no new user-facing copy (S30-R8; S34-PO-1 G2=A; S36-PO-2).

### S35 departed-trainer departure requirement (G1=A; resolved)

- **FR-015 — resolved by S35-PO-1 G1=A (deactivate/revoke; preserve audit)**: Departure of a trainer MUST be performed by deactivating the trainer's access — revoking all of their workspace memberships and removing staff access — without deleting the auth user or the `staff_profiles` row. Audit attribution (`granted_by`/`revoked_by` and any audit records) MUST be preserved; no reassignment or anonymization. No deletion, cascade, FK/trigger change, detach, anonymization, or reassignment of the auth user or `staff_profiles` row is authorized; the existing `ON DELETE RESTRICT` foreign key and `staff_profiles_no_delete` trigger remain. The current schema has no dedicated deactivation capability; T020 tracks adding it (tagged FR-015). (Architect note (not PO words): option A of the #50 lane.)

- **FR-016 — revocation and ownership-change semantics (S36-Q2 = C clauses 2–4, PO-approved #50; clause 1 superseded by S37-PO-3 and S37-PO-4)**: (a) A revoked workspace membership MUST grant zero access to that workspace, for every role; the Platform Owner case is open (S37-Q5). (b) A membership revocation or an ownership change MUST NOT create a workspace membership automatically; any membership grant remains an explicit Platform Owner governance write under FR-005. (c) A session, token, or actor state issued or loaded before a revocation or role change MUST NOT authorize any capability the identity no longer holds in the database (stale-session authorization bypass blocked). The database MUST deny it on every database-backed operation, which the existing per-request re-read provides (S37-Q1 resolved; no new mechanism). The app-layer requirement that `authorize()` MUST also deny such an actor is OPEN (S37-Q6): `authorize()` is a pure function (FR-007) and cannot detect a stale actor object by itself. (d) A Platform Owner creates their own workspace manually through the normal PO-only write (FR-005), with no auto-provisioning and no automatic membership (S37-PO-3; S37-Q3 resolved).

- **SC-005**: Executed database mutation tests reject 100% of role changes/demotions, membership revocations, and staff-profile deletions that would leave zero valid Platform Owners; two concurrent role changes or staff-profile deletions when exactly two Platform Owners exist leave at least one valid Platform Owner; the add-new-PO-first transfer succeeds without leaving zero valid Platform Owners; and the membership-revocation case is asserted only after S37-Q5 is answered. Membership hard deletion is prohibited, and the currently restricted auth-user deletion is excluded (S34-PO-1 G2=A; S36-PO-2).
- **SC-006**: Executed database mutation tests permit a current Workspace Owner to read 100% of active membership rows and only the specified membership fields and associated staff role in their own workspace, and return zero rows for revoked memberships or other workspaces; profile/contact fields remain inaccessible through this roster scope.
- **SC-007 — resolved by S35-PO-1 G1=A**: Executed tests for the trainer-departure workflow MUST demonstrate that deactivation revokes all of the departed trainer's workspace memberships/access, that the auth user and `staff_profiles` row remain, that audit attribution (`granted_by`/`revoked_by` and any audit rows) is preserved, and that 100% of protected client, plan, log, subscription, financial, and audit rows remain intact with zero protected rows deleted or damaged. No disposable-record removal is in scope; no auth-user or `staff_profiles` deletion occurs.
- **SC-008 — S37-PO-3 and S37-PO-4**: Executed tests (T025–T027) prove that a revoked non-Platform-Owner membership grants zero access, that no membership row is created automatically by a membership revocation or an ownership change, and that a stale session cannot authorize a capability the identity no longer holds at the database boundary; the app-layer clause waits for S37-Q6. The Platform Owner case of T025 is asserted only after S37-Q5 is answered.
