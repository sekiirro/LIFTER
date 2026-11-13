# Implementation Plan: F21 Staff Display Names

**Spec**: [spec.md](spec.md) | **Status**: Proposed. NAME-1..NAME-20 are resolved by S51-PO-4, S51-PO-7, S51-PO-8 and S52-PO-2. The write-API request and rejection shapes, the request-key record contents and the exact allowed-character rule are fixed by those decisions, and the post-purge retry behavior is fixed by architect ruling S52-R10. No implementation is authorized by this spec-only change.

## Summary

Add a server-owned staff display-name source with authorized reads, then consume it in the Client Notes author line only. Search or sort may use the name only if that behavior already exists within Client Notes. All other surfaces and their search, sorting, and exports are out of scope and require separate proposals. The first implementation should add a name column or equivalent server-owned source to `public.staff_profiles` or a closely related staff identity table, enforce the approved character set and 1-80 code-point limit, require a name for new provisioning, support owner-assigned backfill of existing accounts without blocking access, and expose it only through same-workspace/PO read paths. Name changes and lifecycle events are audited without old/new values.

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
- Write access follows NAME-1, NAME-11, and NAME-12, as two separate permissions: (a) provisioning — a Workspace Owner sets the name when provisioning staff in that owner's own workspace, and a Platform Owner sets the name when provisioning staff in any workspace (FR-001; Story 1 scenarios 1-2); (b) backfill of an existing unnamed account — the account's own Workspace Owner backfills it in that owner's own workspace, and the Platform Owner backfills platform/PO-owned accounts (NAME-11; Story 1 scenario 4). A Workspace Owner is never authorized to name staff outside their own workspace (NAME-12; FR-005). Existing unnamed staff retain access while backfill is pending.
- Validation follows NAME-3, NAME-13 and NAME-14: required, trimmed of Unicode White_Space, 1-80 Unicode code points, and only Unicode letters, combining marks, U+0020 SPACE, hyphens, apostrophes, and periods; names need not be unique. The trimmed value is normalized to Unicode NFC before validation and storage, so the character and length checks apply to the NFC form and the stored value is that form (NAME-14=B). The database CHECK and the application validation must agree on the trim, the NFC form, and the code-point count; the repository already normalizes with `normalize(..., NFC)` on both sides of the stack (`lib/catalog/normalize.ts:42`; `supabase/migrations/20261106103000_catalog_search_indexes.sql:7`), so the same primitive is used here. NAME-20=A fixes "space" to U+0020 SPACE only, so any other Unicode White_Space code point (tab, non-breaking space, line break, form feed) is refused at an interior position while the same code points are removed when they occur only at the ends (FR-002; SC-010).
- One field is used for both AR and EN (NAME-4; FR-012). No separate localized staff-name fields are defined.
- Client Notes consumes the name only when an authorized server-owned source exists; otherwise it retains `clientNotes.unavailableAuthor` (`specs/020-client-notes/spec.md:90`; the F20 byline rendering that reads that message key is on the F20 implementation branch `020-impl-s48` at `components/client-notes/ClientNotes.tsx:645`).
- For deactivated/closed authors, the retained name is followed by the exact approved EN/AR parenthetical marker strings recorded under NAME-9 (FR-007).

### Audit and lifecycle

- Name changes emit exactly one metadata-only audit event with actor and timestamp and no old/new name values (NAME-6; FR-008). While the request-key record exists, a retry of the same requested change under the same request key returns the original outcome and emits no second event (NAME-15=A; FR-014; SC-008).
- Failed or unauthorized changes emit no successful name-change event (`specs/005-audit-log/spec.md` US1 scenario 2; `specs/020-client-notes/spec.md:99`). A change rejected as stale emits no name-change event (NAME-16=B; FR-015; SC-009).
- Deactivation/closure retains the name and follows existing PII pseudonymization and retention rules (NAME-7; NAME-8; `.specify/memory/constitution.md:96-100`; `docs/13-production-readiness.md:40-41`).
- Retention inherits DP-02; no new retention or purge is added (`docs/13-production-readiness.md:41`; `supabase/migrations/20261027150000_audit_log.sql:29-41`).

### Write safety

- Every name write carries a stable request key that identifies the requested change, and, while the key record exists, a retry under the same key returns the original outcome (NAME-15=A; FR-014). The key is not identity, scope, or permission proof (FR-005; FR-010). The repository already owns a feature-neutral operation-key ledger with an immutable stored result, a one-time result write and an existing retention purge (`app_private.operation_keys`; `supabase/migrations/20261106100000_catalog_operation_keys.sql:2-49,81-90`) plus the shared consumer contract for mutating RPCs (`specs/016-exercise-food-catalogs/contracts/catalog-api.md:61,65,67`); the staff-name write is designed against that existing contract rather than a new mechanism. NAME-17=A fixes the origin: the client generates the key for each intended change and re-sends it unchanged on every retry of that change, matching the approved key-per-intended-change pattern for F20 (`specs/020-client-notes/spec.md:99`; `specs/020-client-notes/data-model.md:27`).
- The request-key record is content-free with respect to the name (NAME-19=A; FR-011; FR-016; SC-011): it stores only the scope, the request key, a request fingerprint and the outcome status, holds no staff-name value, follows the existing operation-key retention and purge with no new retention rule, and the retry returns that outcome status only, so the caller reads the current name through the authorized read path. A duplicate that races an attempt whose status is not yet stored is covered by the same contract's consumer transaction rule — one effect only: the duplicate waits on the key row and then returns the identical saved outcome, or an action/fingerprint conflict when the same key is reused for a different request (`specs/016-exercise-food-catalogs/contracts/catalog-api.md:67`) — so there is no undefined in-flight state and no second audit event.
- The retry guarantee is therefore bounded by the existing operation-key purge, and the post-purge path is fixed by architect ruling S52-R10 (derived from NAME-16=B, NAME-18=B and NAME-19=A; not a PO decision): once the record is gone the server holds no key record, so a late retry is processed as a new attempt under the FR-015 expected-version check. If the original write was applied the version has changed and the retry is rejected as stale with no name value (NAME-18=B), so no second write and no second audit event; if the original write was never applied the retry applies the change once and emits exactly one name-change audit event, unless another change advanced the version in the meantime, in which case the ordinary stale rejection applies (FR-014; FR-015; FR-016; SC-013). The design adds no separate expired-key error state and keeps no second record of keys, because either would add the retention or state that NAME-19=A excludes.
- Every name write presents the expected current version of that staff member's name, and a stale version is rejected without changing the stored name; the caller reloads the current name before retrying (NAME-16=B; FR-015; SC-009). The version is a versioned-row precondition of the kind the catalog operations already use (`supabase/migrations/20261106110000_catalog_exercise_operations.sql:11`; `specs/016-exercise-food-catalogs/contracts/catalog-api.md:121`). NAME-18=B fixes the rejection shape: the rejection carries only a conflict indication with no name value, and the caller re-reads the current name through the authorized read path (FR-003; FR-004), so a rejected write is never a second place where a staff name is disclosed.

### UI

- The Client Notes author line is the only in-scope consumer (the F20 byline rendering that reads `clientNotes.unavailableAuthor` is on the F20 implementation branch `020-impl-s48` at `components/client-notes/ClientNotes.tsx:644`; the F20 note query is on that branch at `lib/client-notes/service.ts:72`). Other existing and future surfaces, including other display, search, sort, and export surfaces, are out of scope (NAME-10; FR-013).
- No staff-name display surface exists today except Client Notes byline (search performed). Other potential surfaces are role-based and do not render staff names (`components/shell/ShellNavigation.tsx:39`; `components/registration-approval/PaymentHistory.tsx:59,234`; `components/registration-approval/ApprovalReview.tsx:75`; `components/catalog/FoodEditor.tsx:28`; `components/catalog/FoodCreateFlow.tsx:24`).
- NAME-10 resolves first implementation scope to the Client Notes author line only, including its search/sort only if those controls already exist there. No other surface is in scope.
- The deactivated marker uses the exact PO-approved EN/AR strings recorded in spec.md; no other new UI copy is proposed.
- No staff-name write surface exists in this repository today, so the retry and stale-rejection behavior of FR-014 and FR-015 introduces no new visible string at this point. Any future write surface needs its own PO-approved copy.
- Reuse existing Design System components and values; do not invent breakpoints, focus values, tokens, or colors (`specs/020-client-notes/spec.md:94`; `specs/020-client-notes/plan.md:40`).

### RLS read path

- Read path: same-workspace active staff or Platform Owner (NAME-2; FR-003; FR-004).
- Use `app_private.has_workspace_access()` or an equivalent SECURITY DEFINER helper with `set search_path = ''`, owner postgres, and grants/revokes consistent with F3 (`supabase/migrations/20261027120000_tenancy.sql:33-84`; `supabase/migrations/20261027140000_access_capability_for_po.sql:1-18`).
- No client or Sales read path.
- No workspace roster RPC is currently implemented; if cross-staff reads require a new RPC, it must be designed separately and tested (`specs/003-tenancy-rls/tasks.md:54`).

## Implementation phases (future, after the remaining MCQ decisions)

1. Revalidate Analyze before implementation; NAME-17..NAME-20 are resolved by S52-PO-2, so the write-API request shape, the request-key record and the allowed-character rule are fixed, and S52-R10 fixes the post-purge retry path.
2. Design the forward-only staff-name source and provisioning flow.
3. Implement migration, constraints, RLS, read/write paths, and audit.
4. Integrate Client Notes byline with fallback and deactivated marker.
5. Do not integrate any surface beyond the Client Notes author line; other surfaces require separate proposals.
6. Add negative tests for tenant, role, length, normalization, metadata non-use, audit payload, retry, concurrency, and closure behavior.
7. Run feature gates.

## Risks and mitigations

- **PII exposure**: staff names are personal data and must follow least-privilege reads, no logs, and closure pseudonymization (`.specify/memory/constitution.md:90-100`).
- **Tenant isolation**: composite workspace/staff integrity and deny-by-default RLS are required (`specs/020-client-notes/plan.md:58`).
- **Auth metadata misuse**: no `user_metadata`/`raw_user_meta_data` value may be rendered or used to set a name (FR-010; no `lib/` or `app/` references to `user_metadata`, `raw_user_meta_data` or `raw_app_meta_data` at this head; search performed).
- **Unicode parity**: NAME-14=B fixes the trim set to Unicode White_Space and the normalization to NFC before validation and storage, so the application validator and the database CHECK must apply the identical sequence and count code points on the NFC form. Canonically equivalent submissions therefore store identically (SC-007). NAME-20=A fixes the interior rule to U+0020 SPACE only, so the same validator and CHECK must refuse every other White_Space code point at an interior position and accept those code points only at the ends (SC-010).
- **Unknown result**: NAME-15=A requires a stable request key per intended change, so a retry after a lost response returns the original outcome and never produces a second audit event (SC-008). NAME-17=A makes that key client-generated and re-sent unchanged, and NAME-19=A keeps the key record content-free with a status-only retry, so a replay discloses no name value (SC-011). The declared exposure is the retention window: a retry that arrives after the operation-key purge cannot return a stored outcome, and S52-R10 fixes it to the FR-015 expected-version path — a stale rejection with no name value when the original write applied, or exactly one applied write when it did not (or the ordinary stale rejection if another change advanced the version first) (FR-014; FR-015; FR-016; SC-013).
- **Concurrent edits**: NAME-16=B requires an expected version, so a stale change is rejected instead of silently overwriting a newer name, and the rejected write emits no audit event (SC-009). NAME-18=B keeps the rejection free of name values, so the caller re-reads the current name through the authorized read path (SC-012).
- **Scope control**: only the Client Notes author line is in scope; other surfaces require separate proposals (NAME-10; FR-013).
- **Backfill**: the account's own Workspace Owner handles staff in that owner's own workspace and the Platform Owner handles platform/PO-owned accounts; no access block while backfill is pending (NAME-11; Story 1 scenario 4). This is the backfill permission only and does not narrow the Platform Owner's separate provisioning permission in any workspace (NAME-1; FR-001; Story 1 scenario 2).

## Complexity tracking

| Item                                             | Deviation                                                                                                                                                                                         | Status                                                         | Blocks                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| Constitution Principle I versus existing PO rule | Platform Owner access follows the existing merged F3 `app_private.has_workspace_access` rule, including its no-membership-check branch, as recorded for F20 (`specs/020-client-notes/plan.md:71`) | Inherited OPEN status from F20; no constitution change is made | Implementation approval for PO cases |
| Audit retention                                  | Staff-name audit events inherit existing `public.audit_events` retention (DP-02)                                                                                                                  | Open pre-production decision remains open                      | Production approval                  |

## PO decisions

- Resolved: NAME-1..NAME-16 by S51-PO-4, S51-PO-7 and S51-PO-8; NAME-17..NAME-20 by S52-PO-2 (see spec.md Clarifications).
- Architect ruling (not a PO decision): S52-R10 fixes the post-purge retry path (FR-014, FR-015, FR-016, SC-013, Story 4 scenario 7, T012), derived from NAME-16=B, NAME-18=B and NAME-19=A.
- PO-DECISION-NEEDED: none.
- No implementation is authorized by this spec-only change.
