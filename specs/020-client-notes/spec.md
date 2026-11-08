# Feature Specification: F20 — Client Notes

**Feature Branch**: `speckit-020-client-notes`
**Status**: Spec-only proposal; CN-MCQ-01..12 PENDING-PO. No implementation is authorized by this document.
**Scope**: A workspace-scoped Client Notes capability reachable from Client Details. It is independent of Exercise Library and Workout Planner.

## Binding source quotations

PO source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-5.verbatim.txt`, final Client Notes block (verbatim):

```text
- Separate Client Details tab, unrelated to Exercise Library/Planner.
- Independent plain-text entries (max 5,000 chars), each with author/timestamp; Add New Note.
- Authorized Trainers/WO/PO can view/create. Edit: author or PO ONLY. Permanent hard-delete: PO ONLY. No version history. Sales/Clients denied. Enforce via backend/RLS.
```

PO source `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-4.verbatim.txt`, item 2 (verbatim):

```text
2. **Client Notes:** Completely separate from the Exercise Library and Workout Planner. Standalone Notes tab in Client Details, with New Note. Trainers, Workspace Owners, and Platform Owner can view/create/edit within authorized scope. DELETE is Platform Owner ONLY, enforced server-side/RLS.
```

The final S36-PO-5 Client Notes block supersedes conflicting earlier S36 wording. Architect mapping (not PO words): `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-architect-rulings-5.md`, Client Notes / CN-1..4 only.

## User Scenarios & Testing

### Story 1 — View notes for an authorized client (P1)

An authorized Trainer, Workspace Owner, or Platform Owner views independent notes in the Client Details tab for a client within their authorized scope.

**Independent test**: Authenticate synthetic role fixtures and request notes for clients in workspace A and workspace B through both application and database boundaries.

**Acceptance scenarios**

1. **Given** an authorized Trainer or Workspace Owner with active membership in workspace A and authorization to view client A1, **When** they open the Client Notes tab, **Then** only notes associated with A1 in A are returned (FR-001, FR-004).
2. **Given** a Platform Owner requesting an authorized Client Details record, **When** they open Client Notes, **Then** its workspace-scoped notes are returned under the existing Platform Owner access model (FR-004).
3. **Given** a Sales identity, a Client identity, an anonymous caller, or a staff identity without current authorization, **When** they read notes directly or through the application, **Then** access is denied by both authorization boundaries (FR-004, FR-005).

### Story 2 — Create a plain-text note (P1)

An authorized Trainer, Workspace Owner, or Platform Owner creates a separate plain-text note from Client Details using Add New Note.

**Independent test**: Create synthetic notes under each permitted role, check exact saved content/author/server timestamp, reject payloads over 5,000 characters, and attempt direct unauthorized inserts.

**Acceptance scenarios**

1. **Given** an authorized Trainer, Workspace Owner, or Platform Owner in the authorized client scope and an input valid under the selected CN-MCQ-02 policy and no longer than 5,000 characters, **When** they submit a plain-text entry through Add New Note, **Then** one independent note is created and attributed to the verified actor and a server-assigned timestamp (FR-001, FR-002, FR-004).
2. **Given** a caller submits more than 5,000 characters, **When** the request reaches the application or database write boundary, **Then** creation is refused and no note is persisted (FR-002).
3. **Given** a caller supplies a forged author, client, or workspace identity, **When** the write is attempted, **Then** those supplied identities cannot widen access or replace verified identity/scope (FR-004).

### Story 3 — Edit and permanently delete (P1)

The note author or Platform Owner edits a note. Only the Platform Owner permanently hard-deletes a note. Notes do not have version history.

**Independent test**: Use synthetic author, other Trainer, Workspace Owner, Platform Owner, Sales, Client, and anonymous fixtures to exercise edit and delete through both walls; verify deleted rows are absent.

**Acceptance scenarios**

1. **Given** a note and its author is eligible under CN-MCQ-05 and has current authorization in that workspace, **When** the author submits a valid edit, **Then** the current plain-text content is updated; any edit metadata follows CN-MCQ-03 and no version history is created (FR-003, FR-004).
2. **Given** a Platform Owner and a note in a workspace within the PO's existing authorized scope, **When** the PO edits the note, **Then** the current content changes without creating a version history (FR-003, FR-004).
3. **Given** any non-PO actor, including the note author, **When** they attempt a hard delete, **Then** the operation is denied. **Given** a Platform Owner with current scope, **When** they hard-delete, **Then** the note row is permanently removed (FR-003, FR-004).
4. **Given** a revoked membership, Sales, Client, anonymous, or foreign-workspace actor, **When** a direct database or application request attempts a read or write, **Then** it is denied (FR-004, FR-005).

## Functional Requirements

- **FR-001**: The product MUST expose a separate Client Notes tab within Client Details. Notes MUST be independent of Exercise Library and Workout Planner records.
- **FR-002**: Each note MUST be an independent plain-text entry with a maximum length of 5,000 characters, an author, and a timestamp. An authorized creation action MUST be labeled “Add New Note” in the PO-approved English wording.
- **FR-003**: A note MUST have no version history. Only its author or a Platform Owner MAY edit it. Only a Platform Owner MAY permanently hard-delete it.
- **FR-004**: Authorized Trainers, Workspace Owners, and Platform Owners MAY view and create notes only within their existing authorized client/workspace scope. Application authorization MUST use the existing verified-actor and role/membership model; Platform Owner scope MUST follow the existing PO rule. A Client or Sales actor MUST be denied. UI visibility MUST NOT act as a security boundary.
- **FR-005**: Notes MUST be workspace-scoped. Backend authorization and database RLS MUST enforce the same deny-by-default access policy for read, create, edit, and hard delete. Every note request MUST be bound to its client and workspace; a caller-supplied foreign workspace/client/author MUST NOT widen access. Cross-workspace and per-role denial coverage MUST be specified.
- **FR-006**: No behavior beyond the binding PO statements and existing tenancy model is settled here. Each unresolved behavior is recorded as a PENDING-PO CN-MCQ below and MUST remain undecided until PO resolution.
- **FR-007**: The tab MUST follow DESIGN.md and the existing Design System for EN LTR / AR RTL, typography, keyboard access, visible focus, accessible labels/roles, contrast, and loading/empty/error/success/disabled/pending/interaction states. Mixed-direction user text MUST be displayed according to approved Bidi handling and MUST NOT be machine-translated. No new motion is required. Any detail DESIGN.md leaves open remains a PENDING-PO MCQ.

## Success Criteria

- **SC-001**: 100% of authorized read/create/edit cases for Trainer, Workspace Owner, and Platform Owner fixtures follow FR-004; 100% of Sales, Client, anonymous, unauthorized, and foreign-workspace cases are denied through both application authorization and database RLS.
- **SC-002**: 100% of create attempts at or below the confirmed character-count boundary can persist only plain text with the verified author and server timestamp; 100% of attempts over 5,000 characters are refused without a persisted row.
- **SC-003**: 100% of valid edits (within 5,000 characters and, for authors, eligible under CN-MCQ-05) by the author or Platform Owner in scope succeed; 100% of edits by ineligible actors fail; 100% of non-PO delete attempts fail; a PO hard delete leaves no note row; no version-history row is produced.
- **SC-004**: The Client Details tab is documented in AR RTL and EN LTR using only approved Design System patterns; unresolved UI copy, ordering, icon, tab placement and breakpoint details are represented by MCQs, not guessed requirements.
- **SC-005**: Later UI acceptance covers keyboard-only navigation, visible focus, screen-reader names/roles, contrast in light/dark and workspace brand variants, required states, reduced-motion behavior, and AR RTL / EN LTR on 390px mobile and 1440px desktop (plus tablet if layout changes); design gaps remain blocked by their MCQ and no spec-only artifact claims rendered verification.

## Clarifications

### PO decision register

1. Final S36 PO wording is quoted byte-exact above from `s36-po-5.verbatim.txt`; S36-PO-4 item 2 is also quoted byte-exact above as earlier wording. S36-PO-5 is authoritative where wording differs.
2. Tenant isolation and deny-by-default design are required by this feature brief and the existing Constitution §I / F3 model. The existing role set is `platform_owner | workspace_owner | trainer | sales`; current workspace membership is required for non-PO workspace access. Revoked membership grants no access per the existing PO-approved S36-Q2 decision.
3. The existing client record is `public.clients(id, workspace_id, ...)`; no concrete migration version or SQL is part of this spec-only change.
4. **No open ambiguities are assumed resolved.** The following CN-MCQs are PENDING-PO and block decisions on their named detail. Recommendations are proposals only, not requirements.

### PENDING-PO — CN-MCQs

Each MCQ is a PO decision; options are mutually exclusive alternatives for the stated question. Recommendations do not authorize implementation.

| ID | Question | Options and implications | Recommendation | Blocked |
| --- | --- | --- | --- | --- |
| CN-MCQ-01 | What is the note ordering in the tab? | A: newest-created first (stable tie-break needed); B: oldest-created first; C: most-recently-edited first (requires edit-time semantics). | A, if chronological order is desired. | List ordering and stable pagination. |
| CN-MCQ-02 | What counts toward “5,000 chars,” and are blank/whitespace-only notes valid? | A: Unicode code points and non-empty after trim; B: grapheme clusters and non-empty after trim; C: UTF-16 code units and non-empty after trim; D: define max counting unit separately and allow empty/whitespace. Implications: international text boundary behavior and whether empty records exist. | A with empty/whitespace rejected, subject to PO choice. | Exact validation boundary and empty-note behavior. |
| CN-MCQ-03 | What edit metadata is required? | A: preserve and display original author and creation timestamp only; B: also display latest editor and edited timestamp without history; C: preserve the original author but display only the latest edit timestamp. Implications: attribution model and visible metadata. | B while preserving original author/created timestamp. | Whether an edited timestamp/editor exists and which metadata is shown. |
| CN-MCQ-04 | What is the “authorized” Trainer/client relation for Client Notes? | A: use the existing client-view scope for Trainers who are already authorized in that workspace; B: require a client assignment in addition to existing authorization; C: require a new per-client note grant. Implications: B/C narrow access and change the current authorization model, requiring an explicit approved scope change. | A, preserving the PO-approved authorized-Trainer baseline and existing scope. | Any proposed narrower Trainer rule or missing definition in the current client-view policy. |
| CN-MCQ-05 | What access applies after an author's membership is revoked and later restored? | A: after a new active membership, normal author-edit rights resume when client scope also authorizes; B: a restored membership permits read/create but author edit stays disabled; C: author edit resumes only after explicit PO reauthorization. Implications: whether prior authorship survives the revoked period; revoked membership itself always has zero access under the binding PO decision. | A, applying the current authorization model after regrant without an exception during revocation. | Behavior after a later authorized regrant. |
| CN-MCQ-06 | What should happen if an author identity is deactivated or becomes unavailable? | A: retain immutable author ID and show a neutral unavailable-author label; B: retain ID and show last-known display name; C: block deactivation while notes reference the author. Implications: attribution, privacy, foreign-key/lifecycle constraints. | A; preserve attribution without exposing stale profile data. | Author display and referential behavior for identity lifecycle changes. |
| CN-MCQ-07 | Should note create/edit/delete emit audit events, and what may they contain? | A: no additional audit events; B: audit metadata only (actor, workspace, client/note IDs, action, timestamp); C: audit metadata plus a content snapshot. Implications: accountability, retention, sensitive-content duplication. | B; do not duplicate note body in audit. | Audit event scope, payload, and retention. |
| CN-MCQ-08 | Which copy is approved for Arabic labels and empty/error/success states? | A: PO approves all AR/EN strings; B: use existing generic Design System state patterns and PO approves feature labels; C: another approved source supplies exact copy. Implications: localization and accessibility review readiness. | A for feature-specific wording; exact “Add New Note” English label remains fixed. | All feature-specific strings except the quoted English action label. |
| CN-MCQ-09 | Where does the new tab appear and what is its label/order across screen sizes? | A: horizontal Client Details tab alongside existing profile tabs; B: a nested tab within a Client Details section; C: another approved pattern. Implications: information architecture, responsive behavior, navigation discoverability. | A aligns with DESIGN.md §6 staff client profile pattern, pending tab placement/order. | Exact tab label/order and small-screen placement. |
| CN-MCQ-10 | What icon, if any, identifies the tab/action? | A: use an existing approved line icon; B: text-only; C: PO selects an icon from the current icon set. Implications: implementation choice and accessible naming; DESIGN.md §11 leaves library unresolved. | B unless an existing approved icon is selected. | Icon selection; icon-only affordance must not be inferred. |
| CN-MCQ-11 | How should concurrent edits to one note resolve? | A: last-write-wins; B: reject stale writes with a conflict/reload path; C: serialize edits and ask the user to retry. Implications: content loss versus conflict handling/UI. | B to avoid silent content loss. | Concurrency semantics and conflict copy. |
| CN-MCQ-12 | What timestamp display timezone/format should the tab use? | A: workspace timezone; B: viewer's local timezone; C: absolute timestamp in a fixed timezone. Implications: interpretation across locations and Arabic/English formatting. | B with an unambiguous accessible representation. | User-visible timestamp formatting and timezone. |

## Assumptions and exclusions

- Existing role/membership authorization, RLS, client access boundaries, and the approved Design System are reused; no new role or capability is invented.
- No audit policy, note ordering, edit conflict policy, post-deletion recovery, retention, or copy is assumed.
- Client portal viewing/editing of staff notes, bulk operations, search, pinning, attachments, rich text, version history, soft delete/restore, export, notification, and integrations are not part of this spec unless separately approved.
- Hard deletion means the note record is physically removed; deleted content is not retained as a version-history record.
