# Feature Specification: F21 — Staff Display Names

**Feature Branch**: `021-staff-display-names`
**Status**: Spec-only. NAME-1..NAME-13 are resolved by PO S51-PO-4 and S51-PO-7 (see Clarifications). NAME-14..NAME-16 remain PO-DECISION-NEEDED. No implementation is authorized by this spec-only change.
**Scope**: Add a server-owned staff display-name source and authorized read path. The first implementation uses the name in the Client Notes author line only, including search or sort there only if those controls already exist. Other existing and future surfaces, including other displays, search, sorting, and exports, are out of scope and require separate proposals. This does not change roles, tenant boundaries, or account-closure behavior.

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

**Independent test**: Provision synthetic staff accounts under PO and WO fixtures and assert new accounts require a valid name, existing accounts can be backfilled by the designated owner without access being blocked, and unauthorized writes fail.

**Acceptance scenarios**

1. **Given** a Platform Owner or a Workspace Owner provisioning a staff account, **When** they submit a valid name and the Workspace Owner controls that staff member's workspace, **Then** the name is stored as the staff member's required server-owned display name (NAME-1; NAME-3; NAME-12; FR-001; FR-002).
2. **Given** a Workspace Owner provisioning a staff account outside their own workspace, **When** the request is made, **Then** the request is denied; a Platform Owner may provision it (NAME-12; FR-005).
3. **Given** a name consisting only of Unicode letters, combining marks, spaces, hyphens, apostrophes, and periods and containing 1-80 code points after the approved trim rule, **When** provisioning is attempted, **Then** the name is accepted; a disallowed character or a value outside the resolved length rule is refused (NAME-3; NAME-13; NAME-14; FR-002).
4. **Given** an existing staff account without a name, **When** its own Workspace Owner backfills it, or the Platform Owner backfills a platform/PO-owned account, **Then** the name is saved and the staff member retains access while backfill is pending (NAME-11; NAME-12; FR-001).
5. **Given** a client, Sales actor, Trainer, or anonymous caller, **When** they attempt to set or change a staff name, **Then** the request is denied by both application and database boundaries (NAME-1; FR-005; FR-010).
6. **Given** an existing surface other than the Client Notes author line, **When** the first implementation is delivered, **Then** that surface and its search/sort/export behavior remain unchanged and out of scope (NAME-10; FR-013).

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

**Independent test**: Create notes under synthetic authors, deactivate one author, and assert the Client Notes author line uses the stored name with the exact approved suffix marker; confirm no other surface is changed.

**Acceptance scenarios**

1. **Given** an authorized reader and a note whose author has an authorized server-owned name, **When** the note list is rendered, **Then** the Client Notes author line uses that name instead of `clientNotes.unavailableAuthor` (NAME-10; FR-006; FR-007).
2. **Given** an author whose account is deactivated or closed, **When** an authorized reader views their note, **Then** the retained name is followed by the approved marker strings "(deactivated)" in EN and "(متوقف)" in AR, and no client PII is exposed (NAME-7; NAME-9; FR-006; FR-007; FR-011).
3. **Given** no authorized name source is available for an author, **When** the note is rendered, **Then** the existing approved `clientNotes.unavailableAuthor` fallback remains in use (FR-006; FR-007).
4. **Given** a user-editable auth metadata value that resembles a name, **When** the Client Notes author line is rendered, **Then** that metadata value is never used (SC-010; FR-006).

### Story 4 — Audit and lifecycle (P2)

Name changes and lifecycle events are audited without exposing old or new name values. Retention follows the existing open decision.

**Independent test**: Change a synthetic staff name and assert one metadata-only audit event with actor and timestamp but no name values.

**Acceptance scenarios**

1. **Given** an authorized name change, **When** it succeeds, **Then** exactly one audit event records actor and timestamp and contains no old or new name value (NAME-6; FR-008; FR-011).
2. **Given** a staff deactivation or closure, **When** it completes, **Then** the name is retained and the closure follows the existing PII pseudonymization and retention rules (NAME-7; NAME-8; FR-009; FR-011).
3. **Given** an unauthorized name change or a change that fails, **When** it is attempted, **Then** no successful name-change audit event is emitted (FR-008; FR-011).

## Functional Requirements

- **FR-001**: The system MUST require a server-owned staff display name when a new staff account is provisioned by a Workspace Owner for staff in that owner's own workspace or by a Platform Owner (NAME-1; NAME-3; NAME-12). Existing staff accounts without a name MUST be backfilled by their own Workspace Owner, or by the Platform Owner for platform/PO-owned accounts, without blocking the staff member's access while backfill is pending (NAME-11).
- **FR-002**: A staff display name MUST allow only Unicode letters, combining marks, spaces, hyphens, apostrophes, and periods; MUST be trimmed; and MUST contain 1-80 Unicode code points after trimming. Names need not be unique (NAME-3; NAME-13). The exact trim set and Unicode normalization behavior remain PO-DECISION-NEEDED (NAME-14); no implementation may assume either. A value failing the resolved rule MUST be refused and no name persisted.
- **FR-003**: A staff display name MUST be readable only by staff with active membership in the same workspace and by the Platform Owner; clients, Sales actors, anonymous callers, revoked staff, and foreign-workspace staff MUST be denied (NAME-2; FR-005; FR-010).
- **FR-004**: Platform Owner read access MUST follow the existing merged F3 platform-wide `app_private.has_workspace_access` rule, including its Platform Owner branch without a membership row, and no constitution change is made (FR-003; `specs/020-client-notes/spec.md:92`; `specs/020-client-notes/plan.md:22`).
- **FR-005**: Application authorization and database RLS MUST enforce the same deny-by-default policy for name read and write; UI visibility MUST NOT act as a security boundary (`specs/020-client-notes/spec.md:93`).
- **FR-006**: Where an authorized server-owned staff name exists within current schema and authorization boundaries, the Client Notes author line MUST render that name instead of `clientNotes.unavailableAuthor`; otherwise it MUST retain the approved unavailable-author fallback (NAME-10; F20 FR-002; `specs/020-client-notes/spec.md:90`; `components/client-notes/ClientNotes.tsx:645`).
- **FR-007**: For a deactivated or closed staff author, the Client Notes author line MUST retain and display the server-owned name followed by the approved EN marker "(deactivated)" or AR marker "(متوقف)", according to the interface language (NAME-7; NAME-9).
- **FR-008**: A successful staff display-name change MUST emit exactly one audit event containing actor and timestamp, and MUST NOT contain old or new name values (NAME-6).
- **FR-009**: On staff deactivation or closure, the display name MUST be retained, and closure MUST continue to deactivate access and pseudonymize PII while keeping legally required ledger and audit records (NAME-7; NAME-8; `.specify/memory/constitution.md:96-100`).
- **FR-010**: No user-editable `user_metadata`/`raw_user_meta_data` value may be rendered as a staff name or used to set one (F20 SC-010; `specs/020-client-notes/spec.md:113`).
- **FR-011**: Audit and lifecycle behavior for staff names MUST follow the existing `public.audit_events` retention and append-only policy; no new retention setting or purge is added (NAME-8; DP-02; `docs/13-production-readiness.md:41`; `supabase/migrations/20261027150000_audit_log.sql:29-41`).
- **FR-012**: The staff display name MUST use one field for both AR and EN; no separate localized name fields are defined (NAME-4).
- **FR-013**: The first implementation MUST use the staff display name in the Client Notes author line only. Search or sort may use the name only if that behavior already exists within the Client Notes surface. All other existing or future surfaces and their search, sorting, and exports are out of scope for this implementation and require separate proposals (NAME-5; NAME-10).

## Success Criteria

- **SC-001**: 100% of valid new-account provisioning attempts by an authorized Workspace Owner for their own workspace or Platform Owner persist one server-owned name; 100% of invalid, unauthorized, or out-of-scope attempts are refused with no persisted name. 100% of existing unnamed staff accounts remain usable while backfill is pending and can be backfilled only by their own Workspace Owner or Platform Owner for platform/PO-owned accounts.
- **SC-002**: 100% of authorized same-workspace staff and Platform Owner reads return the name; 100% of client, Sales, anonymous, revoked, and foreign-workspace reads are denied through application authorization and RLS.
- **SC-003**: 100% of Client Notes author lines for authors with an authorized server-owned name use that name; 100% without such a source retain `clientNotes.unavailableAuthor`; 100% never render a UUID or auth metadata value. No other surface is changed.
- **SC-004**: 100% of successful name changes produce exactly one metadata-only audit event with actor and timestamp and no old/new name values; 100% of failed or unauthorized changes produce no successful name-change event.
- **SC-005**: 100% of deactivated or closed authors with a retained name render that name followed by the exact approved EN "(deactivated)" or AR "(متوقف)" marker in the Client Notes author line.
- **SC-006**: No new retention, purge, or closure behavior is added; staff-name retention inherits DP-02 and constitution VII (`docs/13-production-readiness.md:40-41`; `.specify/memory/constitution.md:90-100`).

## Clarifications

### PO decision register (NAME-1..NAME-13)

NAME-1..NAME-8 are resolved by PO S51-PO-4. NAME-9..NAME-13 are resolved by PO S51-PO-7: NAME-9=A (parenthetical suffix and the approved marker strings quoted above); NAME-10=A (Client Notes author line only, including search/sort only if present there); NAME-11=B (Workspace Owner backfills their workspace; Platform Owner backfills platform/PO-owned accounts; no access block); NAME-12=A (Workspace Owner writes only within their own workspace); NAME-13=E (Unicode letters, combining marks, space, hyphen, apostrophe, period; trimmed; 1-80 code points).

Verbatim S51-PO-4 decision source, copied byte-for-byte from `C:/Users/NEW LAP/.lifter/runs/s51-arch/pdn-s51-names.txt` (SHA-256 `72c0fd7a194beecf94bfa975187ecbaa9ee3eef4756a124f0e2f43e24e2cc2a6`):

```text
Source: PO S51-PO-4 (C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-4.verbatim.txt, sha256 4be9e250bb55be1e0d70bc1c01d69c78942a0fab118891990491eee377fc5e35) answering architect MCQs NAME-1..8 (asked in S51 chat after S51-PO-3 "#90 question 30: A"). Option meanings as asked:
NAME-1=A: Workspace Owner or Platform Owner sets the name when provisioning the staff account; required.
NAME-2=A: readable by staff in the same workspace and by the Platform Owner; never by clients.
NAME-3=A: required, 1-80 characters after trim, any letters, not unique.
NAME-4=A: one name field used for both AR and EN.
NAME-5=B: used for display AND search, sorting and exports.
NAME-6=A: name change is audited with actor + timestamp, without old/new name values.
NAME-7=A: on deactivation/closure the name is kept; past notes show it marked "(deactivated)".
NAME-8=A: retention follows the existing open retention decision DP-02; no new retention decision now.
Open (not decided by PO): exact copy of the "(deactivated)" marker in EN/AR; which exports/search/sort surfaces exist today (5=B covers them only where those surfaces exist); whether existing staff without a name need a backfill and who supplies it; Workspace Owner may only name staff in their own workspace (derived from least-privilege, confirm).
```

Verbatim S51-PO-7 decision source, copied byte-for-byte from `C:/Users/NEW LAP/.lifter/runs/s51-arch/pdn-s51-names-2.txt` (SHA-256 `24d61a7ab75ffdf067eace524b2178289c5128a1101e4a99ab026c499fb76bbc`):

```text
Source: PO S51-PO-7 (C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-7.verbatim.txt, sha256 1c00821505ac69fd1baca276ee16d4cd6373ff5dc66ab0d9ac70a2937ccdc801) "N9A N10A N11B N12A N13E", answering architect-presented options (S51 chat) for spec MCQs NAME-9..13 in specs/021-staff-display-names/spec.md.
NAME-9=A: deactivated author shown as the name followed by a parenthetical marker. Approved marker strings (as presented to PO): EN "(deactivated)"; AR "(متوقف)". Example presented: "Sara Ali (deactivated)" / "سارة علي (متوقف)".
NAME-10=A: first implementation uses the name in the Client Notes author line only (incl. its search/sort if that surface has them); other surfaces are separate scoped proposals later.
NAME-11=B: Workspace Owner backfills names for staff in their own workspace; Platform Owner backfills the rest (platform/PO-owned accounts); no access block meanwhile.
NAME-12=A: Workspace Owner may set names only for staff in their own workspace.
NAME-13=E: allowed characters = Unicode letters, combining marks (accents/Arabic vowel marks), space, hyphen, apostrophe, period; trimmed; 1-80 code points.
```

### PO decision register (NAME-1..NAME-8)

Source: `C:/Users/NEW LAP/.lifter/runs/s51-po/s51-po-4.verbatim.txt`, sha256 `4be9e250bb55be1e0d70bc1c01d69c78942a0fab118891990491eee377fc5e35`; architect MCQs asked in S51 after S51-PO-3. Verbatim register entries are quoted in the Binding source quotations section above. NAME-1=A, NAME-2=A, NAME-3=A, NAME-4=A, NAME-5=B, NAME-6=A, NAME-7=A, NAME-8=A.

### PO-DECISION-NEEDED (NAME-14..NAME-16)

- **NAME-14** (feature 021; location: FR-002): what exact trim set and Unicode normalization behavior apply before validating and storing a name? NAME-13=E specifies the allowed characters and code-point length but does not define these details.
  - A: Trim Unicode White_Space at both ends and preserve the remaining code-point sequence without normalization.
  - B: Trim Unicode White_Space at both ends, then normalize to NFC before validation and storage.
  - C: Trim ASCII space (U+0020) only and preserve the remaining code-point sequence.
  - D: Reject any leading/trailing whitespace; do not trim.
  - Implications: A/C preserve submitted character sequences but differ in accepted boundary whitespace; B treats canonically equivalent input alike; D requires callers to pre-trim. These choices affect database/application parity and future exact matching.
  - Recommendation: A, if consistent with the existing F20 trim contract; that source must be checked before finalizing implementation.
  - Blocks: exact validation and database CHECK/application parity.

- **NAME-15** (feature 021; location: FR-008 / T006): after a name write succeeds but the caller receives an unknown result, what should a retry of the same requested change do?
  - A: Require a stable request/idempotency key; a retry with the same key returns the original outcome and does not emit a second audit event.
  - B: Treat each accepted retry as a new mutation and emit one audit event per successful attempt.
  - C: Reject retries whose outcome is unknown until an authorized reader checks the stored name and audit record.
  - Implications: A requires request identity and replay storage; B can create duplicate audit events for one intended action; C requires recovery/read UX and can leave an operation unresolved.
  - Recommendation: A, to make retry behavior deterministic while preserving one audit event per logical change.
  - Blocks: mutation API contract, audit deduplication, and retry tests.

- **NAME-16** (feature 021; location: FR-008 / T006): when two authorized name changes race for the same staff member, how should the system resolve them?
  - A: Serialize writes and accept both in commit order; the last committed name is current, with one audit event for each successful change.
  - B: Require an expected version; reject the stale update and require the caller to reload before retrying.
  - C: First committed write wins; reject every later write until a separate edit begins.
  - Implications: A is simple but may overwrite an unseen edit; B avoids silent lost updates but needs version state and conflict handling; C prevents overwrite but requires explicit retry flow.
  - Recommendation: B, to avoid silently replacing a concurrent edit.
  - Blocks: write API contract, persistence strategy, and concurrency tests.

### Resolved decisions

- NAME-1..NAME-13 are resolved by S51-PO-4 and S51-PO-7 and are encoded in FR-001..FR-013 above.
- F20's unavailable-author fallback remains valid until an authorized name source exists (`specs/020-client-notes/spec.md:90`; `specs/020-client-notes/spec.md:113`).
- No product decision is made for NAME-14..NAME-16.

### Constraints and evidence notes

- Staff profiles currently have no display-name column (`supabase/migrations/20261027120000_tenancy.sql:4-8`).
- `public.clients` has `name`, but that is client profile data, not staff (`supabase/migrations/20261031121000_client_accounts_model.sql:62-78`, name at `:70`).
- Client metadata clearing claim in the earlier evidence pack (`specs/011-client-accounts/plan.md:201`) was checked and is not supported by that line; treat it as UNVERIFIED unless a future evidence pass finds the real line. This spec does not rely on it.
- Auth metadata is not used for staff names (`specs/020-client-notes/spec.md:113`; no `lib/` or `app/` references to `raw_user_meta_data`, `raw_app_meta_data`, or `user_metadata`; search performed).

### No open behavioural ambiguities outside NAME-14..NAME-16

The addendum C sweep identified NAME-14 (trim/normalization), NAME-15 (retry after unknown outcome), and NAME-16 (concurrent edits) as open product decisions. No outcome is assumed. No UI deletion behavior is added; staff closure/retention follows FR-009 and the existing DP-02 decision. Implementation of validation and mutation behavior remains blocked on these decisions.
