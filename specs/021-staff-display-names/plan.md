# Implementation Plan: F21 Staff Display Names

**Spec**: [spec.md](spec.md) | **Status**: Proposed. NAME-1..NAME-8 resolved by S51-PO-4. NAME-9..NAME-13 are PO-DECISION-NEEDED and block the corresponding implementation parts. No implementation is authorized by this spec-only change.

## Summary

Add a server-owned staff display-name source with authorized reads, then consume it in Client Notes bylines and any PO-selected existing surfaces. The first implementation should add a name column or equivalent server-owned source to `public.staff_profiles` or a closely related staff identity table, enforce 1-80 trimmed characters, require the name at provisioning, and expose it only through same-workspace/PO read paths. Name changes and lifecycle events are audited without old/new values.

## Technical context

- Next.js App Router, server-verified identity, existing `authorize()` and role/membership model.
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership are authoritative.
- Reuse F3 `public.staff_profiles`, `public.workspaces`, `public.workspace_memberships`, `app_private.has_workspace_access()`, approved `coaching_work` capability, and F20 `public.client_notes`.
- Follow current hardened database access patterns. Do not introduce a new role or weaken RLS.
- Migration versions are not named here. Any future migration requires a fresh scan of all origin refs immediately before selecting a unique forward-only version, again before commit, and again before push (`specs/020-client-notes/plan.md:15`).
- High-risk database work (migration, RLS, SECURITY DEFINER, grants/revokes, CHECK constraints) is Luna-only implementation work and requires independent architect review plus mutation tests.

## Design

### Authorization and data

- Reuse `public.staff_profiles` as the staff identity anchor (`supabase/migrations/20261027120000_tenancy.sql:4-8`). A display name belongs to staff identity, not to `public.clients` or `auth.users` metadata.
- Read access follows NAME-2 and FR-003/FR-004: active same-workspace staff or Platform Owner; never clients.
- Write access follows NAME-1 and NAME-12: Workspace Owner or Platform Owner sets the name when provisioning; a Workspace Owner is limited to their own workspace unless the PO decides otherwise (NAME-12).
- Validation follows NAME-3 and NAME-13: required, trimmed, 1-80 characters, any letters, not unique. Database CHECK and application validation must agree.
- One field is used for both AR and EN (NAME-4; FR-012). No separate localized staff-name fields are defined.
- Client Notes consumes the name only when an authorized server-owned source exists; otherwise it retains `clientNotes.unavailableAuthor` (`specs/020-client-notes/spec.md:90`; `components/client-notes/ClientNotes.tsx:645`).
- For deactivated/closed authors, the retained name is shown with the approved deactivated marker (NAME-7; FR-007). Marker copy is PO-DECISION-NEEDED (NAME-9).

### Audit and lifecycle

- Name changes emit exactly one metadata-only audit event with actor and timestamp and no old/new name values (NAME-6; FR-008).
- Failed or unauthorized changes emit no successful name-change event (`specs/005-audit-log/spec.md` US1 scenario 2; `specs/020-client-notes/spec.md:99`).
- Deactivation/closure retains the name and follows existing PII pseudonymization and retention rules (NAME-7; NAME-8; `.specify/memory/constitution.md:96-100`; `docs/13-production-readiness.md:40-41`).
- Retention inherits DP-02; no new retention or purge is added (`docs/13-production-readiness.md:41`; `supabase/migrations/20261027150000_audit_log.sql:29-41`).

### UI

- Client Notes byline is the first approved consumer (`components/client-notes/ClientNotes.tsx:645`; `lib/client-notes/service.ts:74`).
- No staff-name display surface exists today except Client Notes byline (search performed). Other potential surfaces are role-based and do not render staff names (`components/shell/ShellNavigation.tsx:39`; `components/registration-approval/PaymentHistory.tsx:59,234`; `components/registration-approval/ApprovalReview.tsx:75`; `components/catalog/FoodEditor.tsx:28`; `components/catalog/FoodCreateFlow.tsx:24`).
- Which surfaces consume name search/sort/export is PO-DECISION-NEEDED (NAME-10), because NAME-5=B covers only surfaces that exist.
- No copy is implemented without PO-approved strings. The deactivated marker copy is PO-DECISION-NEEDED (NAME-9).
- Reuse existing Design System components and values; do not invent breakpoints, focus values, tokens, or colors (`specs/020-client-notes/spec.md:94`; `specs/020-client-notes/plan.md:40`).

### RLS read path

- Read path: same-workspace active staff or Platform Owner (NAME-2; FR-003; FR-004).
- Use `app_private.has_workspace_access()` or an equivalent SECURITY DEFINER helper with `set search_path = ''`, owner postgres, and grants/revokes consistent with F3 (`supabase/migrations/20261027120000_tenancy.sql:33-84`; `supabase/migrations/20261027140000_access_capability_for_po.sql:1-18`).
- No client or Sales read path.
- No workspace roster RPC is currently implemented; if cross-staff reads require a new RPC, it must be designed separately and tested (`specs/003-tenancy-rls/tasks.md:54`).

## Implementation phases (future, after MCQ decisions)

1. Revalidate Analyze and resolve NAME-9..NAME-13 before implementation.
2. Design the forward-only staff-name source and provisioning flow.
3. Implement migration, constraints, RLS, read/write paths, and audit.
4. Integrate Client Notes byline with fallback and deactivated marker.
5. Integrate only PO-selected existing surfaces.
6. Add negative tests for tenant, role, length, metadata non-use, audit payload, and closure behavior.
7. Run feature gates.

## Risks and mitigations

- **PII exposure**: staff names are personal data and must follow least-privilege reads, no logs, and closure pseudonymization (`.specify/memory/constitution.md:90-100`).
- **Tenant isolation**: composite workspace/staff integrity and deny-by-default RLS are required (`specs/020-client-notes/plan.md:58`).
- **Auth metadata misuse**: no `user_metadata`/`raw_user_meta_data` value may be rendered or used to set a name (`specs/020-client-notes/spec.md:113`).
- **Unapproved copy**: no marker or UI string is implemented before PO approval (NAME-9).
- **Scope creep**: NAME-5=B covers only surfaces that exist; new surfaces require separate scope (NAME-10).
- **Required-field migration**: existing staff accounts may need backfill before enforcement (NAME-11).

## Complexity tracking

| Item | Deviation | Status | Blocks |
| --- | --- | --- | --- |
| Constitution Principle I versus existing PO rule | Platform Owner access follows the existing merged F3 `app_private.has_workspace_access` rule, including its no-membership-check branch, as recorded for F20 (`specs/020-client-notes/plan.md:71`) | Inherited OPEN status from F20; no constitution change is made | Implementation approval for PO cases |
| Audit retention | Staff-name audit events inherit existing `public.audit_events` retention (DP-02) | Open pre-production decision remains open | Production approval |

## PO decisions

- Resolved: NAME-1..NAME-8 by S51-PO-4 (see spec.md Clarifications).
- PO-DECISION-NEEDED: NAME-9, NAME-10, NAME-11, NAME-12, NAME-13.
- No implementation is authorized by this spec-only change.