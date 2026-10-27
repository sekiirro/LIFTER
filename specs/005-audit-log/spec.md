# Feature Specification: Append-only Audit Log (P0-F5)

**Feature Branch**: `005-audit-log` (stacked on `003-tenancy-rls`)
**Created**: 2026-10-27
**Status**: Draft
**Input**: Roadmap P0 "audit log". Constitution VII (append-only, tamper-resistant audit; no PII in logs). BRD PRD-11 lines 235–236. Architecture v3 § Privacy. Follows up the deferred audit emission from F3.

## User Scenarios & Testing *(mandatory)*

Actors: **Platform Owner (PO)**, **Workspace Owner (WO)**, **Trainer**, **Sales**, **Reviewer**.

### User Story 1 - Governance changes are audited automatically (Priority: P1)

Every change to workspaces, staff roles and memberships produces an audit event that records:

- who did it (or "system" when there is no signed-in identity)
- what changed (an action name and the ids involved)
- when it happened
- which workspace it belongs to, when it belongs to one

No application code path can skip it.

**Why this priority**: Constitution III/VII and PRD-11: "Audit covers permission changes … account actions". F3 deferred this.

**Independent Test**: Perform each governance write as the PO, then read the audit log.

**Acceptance Scenarios**:

1. **Given** the PO creates a workspace, grants a membership, revokes it, changes a staff role, or renames a workspace, **When** the audit log is read, **Then** exactly one matching event exists per change, with the actor, action, target ids and workspace.
2. **Given** a write that the database rejects, **When** the audit log is read, **Then** no event exists for it.
3. **Given** an event, **When** its details are inspected, **Then** they contain identifiers and changed field names/values for non-personal fields only, never emails, phone numbers or names of people.

---

### User Story 2 - The audit log cannot be altered (Priority: P1)

Audit history is append-only for everyone, including privileged maintenance roles used by the application.

**Why this priority**: Constitution VII: "Audit history MUST be append-only and tamper-resistant."

**Independent Test**: Attempt UPDATE, DELETE and TRUNCATE on audit rows as each application role.

**Acceptance Scenarios**:

1. **Given** any application role (anonymous, signed-in staff including PO, service role), **When** it tries to update, delete or truncate audit events, **Then** the database rejects it and the rows are unchanged.
2. **Given** a signed-in user, **When** they try to insert an audit event directly, **Then** it is rejected. Events are created only by the database's own audit mechanism.

---

### User Story 3 - Scoped audit visibility (Priority: P1)

The PO reads all audit events. A WO reads only the events of workspaces they're an active member of. Trainers and Sales read none, since the source gives Coaches only contextual history in later features. Anonymous requests read nothing.

**Why this priority**: PRD-11 line 235 and Constitution I (no cross-workspace disclosure).

**Independent Test**: The isolation harness reads the audit log as each identity across two workspaces.

**Acceptance Scenarios**:

1. **Given** events in workspaces A and B and a platform-level event, **When** the PO reads, **Then** they see all of them.
2. **Given** the WO of A, **When** they read, **Then** they see only A's events, and neither B's events nor platform-level events.
3. **Given** a trainer, sales user or anonymous caller, **When** they read, **Then** they see nothing.

### Edge Cases

- Fixture or maintenance writes with no signed-in identity are still audited, with actor = system (null actor).
- Platform-level events (staff role changes, workspace creation before membership) have no workspace, so only the PO sees them. Workspace creation is attributed to that workspace.
- High-volume future tables reuse the same mechanism. Per-feature audit actions are added by later features.

## Requirements *(mandatory)*

- **FR-001**: An append-only audit event store MUST exist with: id, occurred_at, actor (nullable), action (namespaced, e.g. `workspace.created`), target type and id, workspace (nullable), and details (structured, non-PII).
- **FR-002**: The audit store MUST reject UPDATE, DELETE and TRUNCATE from every application role, including the service role. Direct INSERT by API roles MUST be rejected.
- **FR-003**: Audit events MUST be written by the database within the same transaction as the audited change, for: workspace created/updated, staff role assigned/changed, membership granted/revoked.
- **FR-004**: Details MUST contain only ids, role names, slugs and changed non-personal fields. Workspace `name` is business data, not personal data, and may be recorded.
- **FR-005**: Read access: PO all; WO only for workspaces with an active membership; everyone else none. Deny by default.
- **FR-006**: The feature MUST provide a reusable audit-attachment mechanism (a documented helper) for later tenant tables, plus a test pattern for it.
- **FR-007**: Negative tests: foreign-workspace read, a direct insert, and update/delete/truncate per role.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of governance writes in F3 produce exactly one audit event. 0 events for rejected writes.
- **SC-002**: 0 successful mutations of audit rows across all roles in tests.
- **SC-003**: Audit visibility matches FR-005 for all 6 fixture identities.
- **SC-004**: 0 personal fields (email, phone, person names) in any audit details produced by tests.

## Assumptions

- Hash-chaining or external WORM storage is not required by the sources. Database-enforced append-only satisfies "tamper-resistant within the authorization model" (PRD-11). An owner-level DBA can always alter data. Encrypted backups (F7) preserve history.
- Retention of audit events is indefinite until B4 (jurisdiction/retention) is decided. No purge exists.
- The client timeline is a separate curated projection (later features), not this store.
- Application-level logging and the log-scrub check apply when the first log sites appear. F5 adds no logger.
