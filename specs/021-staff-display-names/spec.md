# Feature Specification: F21 — Staff Display Names

**Feature Branch**: `021-staff-display-names`
**Status**: Spec-only. NAME-1..NAME-8 are RESOLVED by PO S51-PO-4 (see Clarifications). NAME-9..NAME-13 are PO-DECISION-NEEDED and are not encoded as requirements. No implementation is authorized by this spec-only change.
**Scope**: Add a server-owned staff display-name source and authorized read path, then use it in Client Notes bylines and any other existing surface that the PO selects. This does not change roles, tenant boundaries, or account-closure behavior.

## Binding source quotations

PO source `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-4.verbatim.txt` (sha256 `4be9e250bb55be1e0d70bc1c01d69c78942a0fab118891990491eee377fc5e35`), answering architect MCQs NAME-1..NAME-8. Verbatim:

```text
NAME-1=A: Workspace Owner or Platform Owner sets the name when provisioning the staff account; required.
NAME-2=A: readable by staff in the same workspace and by the Platform Owner; never by clients.
NAME-3=A: required, 1-80 characters after trim, any letters, not unique.
NAME-4=A: one name field used for both AR and EN.
NAME-5=B: used for display AND search, sorting and exports.
NAME-6=A: name change is audited with actor + timestamp, without old/new name values.
NAME-7=A: on deactivation/closure the name is kept; past notes show it marked "(deactivated)".
NAME-8=A: retention follows the existing open retention decision DP-02; no new retention decision now.
```

Architect MCQ source for NAME-1..NAME-8: S51 chat after S51-PO-3 (`#90 question 30: A`). Evidence source: `C:/Users/NEW LAP/.lifter/runs/s51-beam-names/evidence.md`.

## User Scenarios & Testing

### Story 1 — Provision a staff display name (P1)

A Workspace Owner or Platform Owner sets a required display name when provisioning a staff account. The name becomes the authorized server-owned identity label for that staff member.

**Independent test**: Provision synthetic staff accounts under PO and WO fixtures and assert the name is required, trimmed, 1-80 characters, stored once, and not client-visible.

**Acceptance scenarios**

1. **Given** a Platform Owner or a Workspace Owner provisioning a staff account in a workspace they control, **When** they submit a valid trimmed name of 1-80 characters, **Then** the name is stored as the staff member's server-owned display name (NAME-1; NAME-3; FR-001; FR-002).
2. **Given** a Workspace Owner provisioning a staff account outside their own workspace, **When** the request is made, **Then** the request is denied unless a Platform Owner performs it (NAME-1; NAME-9; FR-001; FR-005).
3. **Given** a name that is blank after trimming or longer than 80 characters, **When** provisioning is attempted, **Then** no staff account or name is persisted and the request is refused (NAME-3; FR-002).
4. **Given** a client, Sales actor, Trainer, or anonymous caller, **When** they attempt to set or change a staff name, **Then** the request is denied by both application and database boundaries (NAME-1; FR-005; FR-010).

### Story 2 — Read a staff name where authorized (P1)

Staff in the same workspace and the Platform Owner read a staff display name for authorized surfaces. Clients never read it.

**Independent test**: Authenticate synthetic role fixtures in workspace A and B and assert same-workspace visibility, PO visibility, and client denial through both walls.

**Acceptance scenarios**

1. **Given** an active Trainer or Workspace Owner in workspace A, **When** they read an authorized surface for another active staff member in workspace A, **Then** the display name is returned (NAME-2; FR-003; FR-004).
2. **Given** a Platform Owner, **When** they read an authorized surface in any workspace, **Then** the display name is returned under the existing platform-wide PO rule (NAME-2; FR-003; FR-004).
3. **Given** a client, Sales actor, anonymous caller, revoked-membership staff member, or foreign-workspace staff member, **When** they read a staff name directly or through the application, **Then** access is denied (NAME-2; FR-004; FR-005; FR-010).
4. **Given** a deactivated staff member's retained name, **When** an authorized reader reads an existing note by that author, **Then** the retained name is shown with the approved deactivated marker (NAME-7; FR-006; FR-007).

### Story 3 — Use a staff name in Client Notes bylines (P1)

Client Notes no longer uses the approved unavailable-author fallback when a trustworthy authorized staff name exists. It uses the server-owned name and marks deactivated authors.

**Independent test**: Create notes under synthetic authors, deactivate one author, and assert the byline uses the name plus the approved marker.

**Acceptance scenarios**

1. **Given** an authorized reader and a note whose author has an authorized server-owned name, **When** the note list is rendered, **Then** the byline uses that name instead of `clientNotes.unavailableAuthor` (FR-006; FR-007).
2. **Given** an author whose account is deactivated or closed, **When** an authorized reader views their note, **Then** the retained name is shown with the approved deactivated marker and no client PII is exposed (NAME-7; FR-006; FR-007; FR-011).
3. **Given** no authorized name source is available for an author, **When** the note is rendered, **Then** the existing approved `clientNotes.unavailableAuthor` fallback remains in use (FR-006; FR-007).
4. **Given** a user-editable auth metadata value that resembles a name, **When** any surface renders an author label, **Then** that metadata value is never used (SC-010; FR-006).

### Story 4 — Audit and lifecycle (P2)

Name changes and lifecycle events are audited without exposing old or new name values. Retention follows the existing open decision.

**Independent test**: Change a synthetic staff name and assert one metadata-only audit event with actor and timestamp but no name values.

**Acceptance scenarios**

1. **Given** an authorized name change, **When** it succeeds, **Then** exactly one audit event records actor and timestamp and contains no old or new name value (NAME-6; FR-008; FR-011).
2. **Given** a staff deactivation or closure, **When** it completes, **Then** the name is retained and the closure follows the existing PII pseudonymization and retention rules (NAME-7; NAME-8; FR-009; FR-011).
3. **Given** an unauthorized name change or a change that fails, **When** it is attempted, **Then** no successful name-change audit event is emitted (FR-008; FR-011).

## Functional Requirements

- **FR-001**: The system MUST provide a server-owned staff display name that is set by a Workspace Owner or Platform Owner when provisioning a staff account, and the name MUST be required (NAME-1; NAME-3).
- **FR-002**: A staff display name MUST be trimmed before validation and storage, MUST be 1-80 characters after trimming, and MUST allow any letters without uniqueness (NAME-3). A blank-after-trim or over-limit value MUST be refused with no persisted account or name.
- **FR-003**: A staff display name MUST be readable only by staff with active membership in the same workspace and by the Platform Owner; clients, Sales actors, anonymous callers, revoked staff, and foreign-workspace staff MUST be denied (NAME-2; FR-005; FR-010).
- **FR-004**: Platform Owner read access MUST follow the existing merged F3 platform-wide `app_private.has_workspace_access` rule, including its Platform Owner branch without a membership row, and no constitution change is made (FR-003; `specs/020-client-notes/spec.md:92`; `specs/020-client-notes/plan.md:22`).
- **FR-005**: Application authorization and database RLS MUST enforce the same deny-by-default policy for name read and write; UI visibility MUST NOT act as a security boundary (`specs/020-client-notes/spec.md:93`).
- **FR-006**: Where an authorized server-owned staff name exists within current schema and authorization boundaries, Client Notes MUST render that name instead of `clientNotes.unavailableAuthor`; otherwise it MUST retain the approved unavailable-author fallback (F20 FR-002; `specs/020-client-notes/spec.md:90`; `components/client-notes/ClientNotes.tsx:645`).
- **FR-007**: For a deactivated or closed staff author, Client Notes MUST retain and display the server-owned name with the approved deactivated marker (NAME-7). The exact EN/AR marker copy and placement are PO-DECISION-NEEDED (NAME-9) and are not specified here.
- **FR-008**: A successful staff display-name change MUST emit exactly one audit event containing actor and timestamp, and MUST NOT contain old or new name values (NAME-6).
- **FR-009**: On staff deactivation or closure, the display name MUST be retained, and closure MUST continue to deactivate access and pseudonymize PII while keeping legally required ledger and audit records (NAME-7; NAME-8; `.specify/memory/constitution.md:96-100`).
- **FR-010**: No user-editable `user_metadata`/`raw_user_meta_data` value may be rendered as a staff name or used to set one (F20 SC-010; `specs/020-client-notes/spec.md:113`).
- **FR-011**: Audit and lifecycle behavior for staff names MUST follow the existing `public.audit_events` retention and append-only policy; no new retention setting or purge is added (NAME-8; DP-02; `docs/13-production-readiness.md:41`; `supabase/migrations/20261027150000_audit_log.sql:29-41`).
- **FR-012**: The staff display name MUST use one field for both AR and EN; no separate localized name fields are defined (NAME-4).

## Success Criteria

- **SC-001**: 100% of valid provisioning attempts by an authorized Workspace Owner or Platform Owner with a trimmed 1-80 character name persist one server-owned name; 100% of invalid, unauthorized, or out-of-scope attempts are refused with no persisted name.
- **SC-002**: 100% of authorized same-workspace staff and Platform Owner reads return the name; 100% of client, Sales, anonymous, revoked, and foreign-workspace reads are denied through application authorization and RLS.
- **SC-003**: 100% of Client Notes bylines for authors with an authorized server-owned name use that name; 100% of bylines without such a source retain `clientNotes.unavailableAuthor`; 100% of bylines never render a UUID or auth metadata value.
- **SC-004**: 100% of successful name changes produce exactly one metadata-only audit event with actor and timestamp and no old/new name values; 100% of failed or unauthorized changes produce no successful name-change event.
- **SC-005**: 100% of deactivated or closed authors with a retained name render that name with the approved deactivated marker in Client Notes; the marker copy is not implemented until NAME-9 is resolved.
- **SC-006**: No new retention, purge, or closure behavior is added; staff-name retention inherits DP-02 and constitution VII (`docs/13-production-readiness.md:40-41`; `.specify/memory/constitution.md:90-100`).

## Clarifications

### PO decision register (NAME-1..NAME-8)

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-4.verbatim.txt`, sha256 `4be9e250bb55be1e0d70bc1c01d69c78942a0fab118891990491eee377fc5e35`; architect MCQs asked in S51 after S51-PO-3. Verbatim register entries are quoted in the Binding source quotations section above. NAME-1=A, NAME-2=A, NAME-3=A, NAME-4=A, NAME-5=B, NAME-6=A, NAME-7=A, NAME-8=A.

### PO-DECISION-NEEDED (NAME-9..NAME-13)

- **NAME-9** (feature 021; location: `specs/021-staff-display-names/spec.md` FR-007 and Story 3): exact EN/AR copy and placement of the deactivated-author marker.
  - A: Parenthetical suffix after the name in the byline, e.g. approved strings supplied later (recommended for minimal UI change).
  - B: Separate muted metadata segment after the byline.
  - C: Replace the name with a neutral unavailable-author label plus retained UUID-free marker.
  - D: No marker until a future copy decision; retain the current unavailable-author behavior.
  - Implications: A/B affect copy and accessibility; C changes author attribution semantics; D blocks Client Notes byline improvement.
  - Recommendation: A, pending PO-approved strings.
  - Blocks: FR-007, SC-005, implementation of deactivated-author rendering.

- **NAME-10** (feature 021; location: `specs/021-staff-display-names/spec.md` FR-003/FR-006 and NAME-5=B): which existing surfaces consume the name for search, sorting, and exports.
  - A: Client Notes byline only.
  - B: Client Notes byline plus registration-approval/payment/audit surfaces where a staff actor is already referenced.
  - C: All existing surfaces that reference a staff UUID, including future export APIs.
  - D: Display only; defer search/sort/export integration.
  - Evidence: no staff-name display surface exists today except Client Notes byline (`components/client-notes/ClientNotes.tsx:645`); no audit-event UI/API in `app/` or `lib/` (search performed); other role-based surfaces do not render staff names (`components/shell/ShellNavigation.tsx:39`; `components/registration-approval/PaymentHistory.tsx:59,234`; `components/registration-approval/ApprovalReview.tsx:75`; `components/catalog/FoodEditor.tsx:28`; `components/catalog/FoodCreateFlow.tsx:24`).
  - Implications: A is smallest; B/C require RLS/read-path review per surface; D conflicts with NAME-5=B.
  - Recommendation: A for first implementation, with B/C as separate scoped proposals.
  - Blocks: search/sort/export integration tasks and any surface outside Client Notes.

- **NAME-11** (feature 021; location: `specs/021-staff-display-names/spec.md` FR-001 and Story 1): whether existing staff accounts without a name require backfill and who supplies it.
  - A: Platform Owner backfills all existing accounts before enforcement.
  - B: Workspace Owner backfills accounts in their own workspace.
  - C: Require name at next authenticated session; block staff access until set.
  - D: Leave existing accounts nullable until a later migration.
  - Implications: A/B add provisioning work; C affects access and recovery; D conflicts with NAME-3 required unless migration is deferred.
  - Recommendation: B for WO-owned accounts, A for PO-owned/platform accounts, with no access block.
  - Blocks: migration constraints, provisioning UI/API, and enforcement of required name.

- **NAME-12** (feature 021; location: `specs/021-staff-display-names/spec.md` FR-001 and FR-005): whether a Workspace Owner may set names only for staff in their own workspace.
  - A: Yes, WO may set names only in their own workspace (recommended least-privilege).
  - B: Yes, but Platform Owner approval is required for each name.
  - C: No, only Platform Owner sets names.
  - D: WO may set names in any workspace where they have a role.
  - Implications: A matches NAME-1 and tenant isolation; B adds approval workflow; C centralizes provisioning; D widens write scope.
  - Recommendation: A.
  - Blocks: authorization matrix and RLS write policies.

- **NAME-13** (feature 021; location: `specs/021-staff-display-names/spec.md` FR-002): exact validation of "any letters" (Unicode categories, combining marks, length counting, trim rules).
  - A: Unicode `L` categories only, trim Unicode White_Space, count Unicode code points.
  - B: Unicode `L` plus selected combining marks, trim Unicode White_Space, count code points.
  - C: Locale-specific validation for AR and EN only.
  - D: Any non-empty trimmed string up to 80 code points.
  - Implications: A/B affect data quality and i18n; C conflicts with NAME-4 one field; D weakens validation.
  - Recommendation: A, aligned with F20 code-point counting (`specs/020-client-notes/spec.md:90`).
  - Blocks: database CHECK constraints and application validation.

### Resolved decisions

- NAME-1..NAME-8 are resolved by S51-PO-4 and are encoded in FR-001..FR-012 above.
- F20's unavailable-author fallback remains valid until an authorized name source exists (`specs/020-client-notes/spec.md:90`; `specs/020-client-notes/spec.md:113`).
- No product decision is made for NAME-9..NAME-13.

### Constraints and evidence notes

- Staff profiles currently have no display-name column (`supabase/migrations/20261027120000_tenancy.sql:4-8`).
- `public.clients` has `name`, but that is client profile data, not staff (`supabase/migrations/20261031121000_client_accounts_model.sql:62-78`, name at `:70`).
- Client metadata clearing claim in the earlier evidence pack (`specs/011-client-accounts/plan.md:201`) was checked and is not supported by that line; treat it as UNVERIFIED unless a future evidence pass finds the real line. This spec does not rely on it.
- Auth metadata is not used for staff names (`specs/020-client-notes/spec.md:113`; no `lib/` or `app/` references to `raw_user_meta_data`, `raw_app_meta_data`, or `user_metadata`; search performed).

### No open behavioural ambiguities outside NAME-9..NAME-13

No other behavioural ambiguity is encoded as a requirement. Implementation remains blocked on NAME-9..NAME-13 where noted.
