# Feature Specification: F20 — Client Notes

**Feature Branch**: `speckit-020-client-notes`
**Status**: Spec-only. CN-MCQ-01..07 and CN-MCQ-09..12 are resolved by the PO (S37-PO-6, S37-PO-7; see Clarifications). CN-MCQ-08, CN-MCQ-13 and CN-MCQ-14 remain PENDING-PO. No implementation is authorized by this document.
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

PO source `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, sections S37-PO-6 and S37-PO-7 (verbatim PO lines and the context note listing the approved options; the unrelated PR #30 approval line is omitted):

```text
S37-PO-6 (2026-11-08, PO message verbatim):
approves Client Notes Q01–12 as proposed, except Q04: all Trainers can view notes for all clients in their workspace; Q11: Last Save Wins approved. approve Option D: rename migrations, leave Stack C untouched and excluded.
(Context: "as proposed" = the architect's recommendation table for CN-MCQ-01..12 in the S37 session: 01 newest first; 02 Unicode code points, blank/whitespace-only rejected; 03 original author + creation time + "edited" time, no history; 05 rights resume with restored membership; 06 note kept, "Unavailable author"; 07 audit who/action/when, never note text; 08 PO approves exact AR/EN strings later, "Add New Note" fixed; 09 tab alongside existing client profile tabs (DESIGN.md §6); 10 no icon, text label; 12 viewer's local time zone. Option D for #43 = rename; Stack C untouched, not used for the #43 branch; its history repaired later only under a PO-approved procedure if ever needed.)

S37-PO-7 (2026-11-08, PO message verbatim, confirms/replaces the architect Q04 create mapping):
All Trainers can view and create Client Notes for any client within their workspace, regardless of assigned Trainer. Editing remains author-or-PO only; deletion PO only. Sales and Clients remain denied. Enforce workspace isolation.
```

## User Scenarios & Testing

### Story 1 — View notes for an authorized client (P1)

An authorized Trainer, Workspace Owner, or Platform Owner views independent notes in the Client Details tab for a client within their authorized scope. Any Trainer in the workspace may view notes for any client in that workspace, regardless of assigned Trainer (S37-PO-6, S37-PO-7).

**Independent test**: Authenticate synthetic role fixtures and request notes for clients in workspace A and workspace B through both application and database boundaries.

**Acceptance scenarios**

1. **Given** a Trainer or Workspace Owner with active membership in workspace A, regardless of which Trainer is assigned to client A1, **When** they open the Client Notes tab for A1, **Then** only notes associated with A1 in A are returned, newest-created first (FR-001, FR-004, FR-008).
2. **Given** a Platform Owner requesting an authorized Client Details record, **When** they open Client Notes, **Then** its workspace-scoped notes are returned under the existing Platform Owner access model (FR-004).
3. **Given** a Sales identity, a Client identity, an anonymous caller, or a staff identity without current authorization, **When** they read notes directly or through the application, **Then** access is denied by both authorization boundaries (FR-004, FR-005).

### Story 2 — Create a plain-text note (P1)

An authorized Trainer, Workspace Owner, or Platform Owner creates a separate plain-text note from Client Details using Add New Note.

**Independent test**: Create synthetic notes under each permitted role, check exact saved content/author/server timestamp, reject blank, whitespace-only and over-limit payloads, and attempt direct unauthorized inserts.

**Acceptance scenarios**

1. **Given** a Trainer (for any client in their workspace), Workspace Owner, or Platform Owner in its authorized scope and a body of 1 to 5,000 Unicode code points that is not blank or whitespace-only, **When** they submit it through Add New Note, **Then** one independent note is created and attributed to the verified actor and a server-assigned creation timestamp (FR-001, FR-002, FR-004).
2. **Given** a caller submits more than 5,000 Unicode code points or a blank or whitespace-only body, **When** the request reaches the application or database write boundary, **Then** creation is refused and no note is persisted (FR-002).
3. **Given** a caller supplies a forged author, client, or workspace identity, **When** the write is attempted, **Then** those supplied identities cannot widen access or replace verified identity/scope (FR-004).

### Story 3 — Edit and permanently delete (P1)

The note author or Platform Owner edits a note. Only the Platform Owner permanently hard-deletes a note. Notes do not have version history.

**Independent test**: Use synthetic author, other Trainer, Workspace Owner, Platform Owner, Sales, Client, and anonymous fixtures to exercise edit and delete through both walls; verify deleted rows are absent.

**Acceptance scenarios**

1. **Given** a note whose author still holds current authorization in that workspace (an active membership and a role still authorized under FR-004; CN-MCQ-05), **When** the author submits a valid edit, **Then** the current body is replaced in place, the edited timestamp is set, the original author and creation timestamp are kept, and no version history is created (FR-003, FR-004). **Given** two saves to the same note, **When** both are valid, **Then** the last save is the note content (FR-009).
2. **Given** a Platform Owner and a note in a workspace within the PO's existing authorized scope, **When** the PO edits the note, **Then** the current content changes, the edited timestamp is set, and no version history is created (FR-003, FR-004).
3. **Given** any non-PO actor, including the note author, **When** they attempt a hard delete, **Then** the operation is denied. **Given** a Platform Owner with current scope, **When** they hard-delete, **Then** the note row is permanently removed (FR-003, FR-004).
4. **Given** a revoked membership, Sales, Client, anonymous, or foreign-workspace actor, **When** a direct database or application request attempts a read or write, **Then** it is denied (FR-004, FR-005). **Given** an author whose membership was revoked and later restored, **When** they edit their note, **Then** author edit rights have resumed (CN-MCQ-05).

## Functional Requirements

- **FR-001**: The product MUST expose a separate Client Notes tab within Client Details, placed as a horizontal tab alongside the existing client profile tabs (DESIGN.md §6). Notes MUST be independent of Exercise Library and Workout Planner records.
- **FR-002**: Each note MUST be an independent plain-text entry with a maximum length of 5,000 Unicode code points, an author, and a server-assigned creation timestamp. A body that is blank or consists only of whitespace MUST be rejected. No other normalization is defined here. Whether whitespace is removed before the 5,000-code-point count is CN-MCQ-14 (PENDING-PO); the trailing-whitespace case at the limit is not asserted until that decision is recorded. An authorized creation action MUST be labeled “Add New Note” in the PO-approved English wording. When a note's author is unavailable, the note MUST be kept and MUST show a neutral “Unavailable author” label (CN-MCQ-06); its Arabic string is pending CN-MCQ-08.
- **FR-003**: A note MUST have no version history. Only its author or a Platform Owner MAY edit it, and an author MAY edit only while holding current authorization in the note's workspace: an active membership and a role still authorized for Client Notes under FR-004 (CN-MCQ-05). A successful edit MUST replace the current body in place, set an “edited” timestamp, and keep the original author and creation timestamp (CN-MCQ-03). Only a Platform Owner MAY permanently hard-delete a note.
- **FR-004**: Authorized Trainers, Workspace Owners, and Platform Owners MAY view and create notes within their authorized workspace scope. A Trainer MAY view and create notes for any client in their workspace, regardless of assigned Trainer (S37-PO-6, S37-PO-7; CN-MCQ-04). Platform Owner scope MUST follow the existing PO rule. Application authorization MUST use the existing verified-actor and role/membership model. A Client or Sales actor MUST be denied. UI visibility MUST NOT act as a security boundary.
- **FR-005**: Notes MUST be workspace-scoped. Backend authorization and database RLS MUST enforce the same deny-by-default access policy for read, create, edit, and hard delete. Every note request MUST be bound to its client and workspace; a caller-supplied foreign workspace/client/author MUST NOT widen access. Cross-workspace and per-role denial coverage MUST be specified.
- **FR-006**: The behavior answered by the PO (CN-MCQ-01..07 and CN-MCQ-09..12) is encoded in FR-001..FR-010 and the scenarios above. Behavior governed by CN-MCQ-08 (copy), CN-MCQ-13 (audit retention) and CN-MCQ-14 (stored body form) MUST remain undecided until PO resolution and MUST NOT be implemented as a guess.
- **FR-007**: The tab MUST follow DESIGN.md and the existing Design System for EN LTR / AR RTL, typography, keyboard access, visible focus, accessible labels/roles, contrast, and loading/empty/error/success/disabled/pending/interaction states. The tab and its actions MUST be text-only with no icon (CN-MCQ-10). Mixed-direction user text MUST be displayed according to approved Bidi handling and MUST NOT be machine-translated. No new motion is required. Any detail DESIGN.md leaves open remains a PENDING-PO MCQ.
- **FR-008**: The note list MUST show notes newest-created first, ordered by server creation timestamp with a deterministic tie-break. An edit MUST NOT change a note's position in the list (CN-MCQ-01).
- **FR-009**: Concurrent edits to one note MUST resolve as last save wins (CN-MCQ-11): each save that satisfies FR-002 and FR-003 replaces the current body; no stale-write rejection, merge or conflict prompt is defined. Timestamps MUST be displayed in the viewer's local time zone (CN-MCQ-12); the display format is part of CN-MCQ-08.
- **FR-010**: Each successful note create, edit, and hard delete MUST emit exactly one audit event containing only the actor, workspace, client ID, note ID, action, and timestamp. An audit event MUST NEVER contain note text, and no generic row-snapshot capture may store note body content in audit (CN-MCQ-07). Audit retention is PENDING-PO (CN-MCQ-13).

## Success Criteria

- **SC-001**: 100% of authorized read/create/edit cases for Trainer (including Trainers not assigned to the client), Workspace Owner, and Platform Owner fixtures follow FR-004; 100% of Sales, Client, anonymous, unauthorized, revoked-membership, and foreign-workspace cases are denied through both application authorization and database RLS.
- **SC-002**: 100% of create attempts by authorized actors (FR-004) with 1 to 5,000 Unicode code points and non-blank content persist only plain text with the verified author and server creation timestamp; 100% of attempts over 5,000 code points or blank/whitespace-only are refused without a persisted row; 100% of create attempts by unauthorized actors are denied (SC-001).
- **SC-003**: 100% of valid edits by the author (with current active membership) or Platform Owner in scope succeed; 100% of edits by ineligible actors fail; concurrent saves resolve as last save wins; 100% of non-PO delete attempts fail; a PO hard delete leaves no note row; no version-history row is produced; each successful create, edit, and delete produces exactly one metadata-only audit event (FR-010).
- **SC-004**: The Client Details tab is documented in AR RTL and EN LTR using only approved Design System patterns; placement, icon and ordering are decided; unresolved copy (CN-MCQ-08) and CN-MCQ-13/14 are represented by MCQs, not guessed requirements.
- **SC-005**: Later UI acceptance covers keyboard-only navigation, visible focus, screen-reader names/roles, contrast in light/dark and workspace brand variants, required states, reduced-motion behavior, and AR RTL / EN LTR on 390px mobile and 1440px desktop (plus tablet if layout changes); design gaps remain blocked by their MCQ and no spec-only artifact claims rendered verification.
- **SC-006**: 100% of list reads return notes newest-created first with a deterministic tie-break; no edit changes a note's list position; 100% of displayed timestamps use the viewer's local time zone.

## Clarifications

### PO decision register

1. Final S36 PO wording is quoted byte-exact above from `s36-po-5.verbatim.txt`; S36-PO-4 item 2 is also quoted byte-exact above as earlier wording. S36-PO-5 is authoritative where wording differs.
2. Tenant isolation and deny-by-default design are required by this feature brief and the existing Constitution §I / F3 model. The existing role set is `platform_owner | workspace_owner | trainer | sales`; current workspace membership is required for non-PO workspace access. Revoked membership grants no access per the existing PO-approved S36-Q2 decision.
3. The existing client record is `public.clients(id, workspace_id, ...)`; no concrete migration version or SQL is part of this spec-only change.
4. **Resolved and pending.** CN-MCQ-01..07 and CN-MCQ-09..12 are RESOLVED by S37-PO-6 (approves Q01–12 as proposed, with Q04 as stated and Q11 Last Save Wins) and S37-PO-7 (Q04 create scope). CN-MCQ-08 (copy), CN-MCQ-13 (audit retention) and CN-MCQ-14 (stored body form) are PENDING-PO and block only the details they name. No other ambiguity is assumed resolved.
5. Where an earlier recommendation and a PO answer differ, the PO answer controls. The S37 PO answer supersedes the earlier recommendation for CN-MCQ-04 (all Trainers in the workspace) and CN-MCQ-11 (last save wins).

### CN-MCQ register

Each MCQ is a PO decision; options are mutually exclusive alternatives for the stated question. Resolved rows record the PO answer and where it is encoded.

| ID | Question | Resolution or pending options | Encoded in |
| --- | --- | --- | --- |
| CN-MCQ-01 | What is the note ordering in the tab? | RESOLVED: newest-created first, with a deterministic tie-break (S37-PO-6, approved as proposed). | FR-008, SC-006, T008 |
| CN-MCQ-02 | What counts toward “5,000 chars,” and are blank/whitespace-only notes valid? | RESOLVED: Unicode code points, maximum 5,000; blank/whitespace-only rejected (S37-PO-6, approved as proposed). | FR-002, SC-002, T009 |
| CN-MCQ-03 | What edit metadata is required? | RESOLVED: keep original author and creation timestamp; show an “edited” timestamp; no history (S37-PO-6, approved as proposed). | FR-003, data-model.md, T010 |
| CN-MCQ-04 | What is the “authorized” Trainer/client relation for Client Notes? | RESOLVED: all Trainers in the workspace may view and create notes for any client in their workspace, regardless of assigned Trainer (S37-PO-6 view; S37-PO-7 create). Editing stays author-or-PO only; deletion PO only. | FR-004, SC-001, T011 |
| CN-MCQ-05 | What access applies after an author's membership is revoked and later restored? | RESOLVED: after a restored active membership, normal author-edit rights resume when current authorization holds; revoked membership has zero access (S37-PO-6 approved as proposed). | FR-003, Story 3, T010 |
| CN-MCQ-06 | What should happen if an author identity is deactivated or becomes unavailable? | RESOLVED: note retained with its author reference and a neutral “Unavailable author” label (S37-PO-6 context). Arabic label pending CN-MCQ-08. | FR-002, data-model.md, T013 |
| CN-MCQ-07 | Should note create/edit/delete emit audit events, and what may they contain? | RESOLVED: one audit event per create/edit/delete containing only actor, workspace, client/note IDs, action and timestamp; never note text (S37-PO-6 context). Retention is CN-MCQ-13. | FR-010, T012 |
| CN-MCQ-08 | Which copy is approved for Arabic labels and empty/error/success states? | PENDING-PO (copy approval). PO approves the exact AR/EN strings later, including the tab label, state messages, “edited” and “Unavailable author” labels, and the timestamp format. “Add New Note” English wording is fixed. | FR-002, FR-007, T005, T013 |
| CN-MCQ-09 | Where does the new tab appear and what is its label/order across screen sizes? | RESOLVED: horizontal tab alongside the existing client profile tabs, per the DESIGN.md §6 pattern (S37-PO-6 context). Label text is part of CN-MCQ-08. | FR-001, T013 |
| CN-MCQ-10 | What icon, if any, identifies the tab/action? | RESOLVED: no icon; text label (S37-PO-6 context). | FR-007, T013 |
| CN-MCQ-11 | How should concurrent edits to one note resolve? | RESOLVED: last save wins (S37-PO-6, Q11 Last Save Wins approved). | FR-003, FR-009, SC-003, T010 |
| CN-MCQ-12 | What timestamp display timezone/format should the tab use? | RESOLVED: viewer's local time zone (S37-PO-6 context). Display format is part of CN-MCQ-08. | FR-009, SC-006, T013 |
| CN-MCQ-13 | How long are metadata-only audit events (CN-MCQ-07) retained? (NEW, PENDING-PO) | A: permanent retention, as for other permanent audit events in this product (for example the F14 branding publication audit); B: a fixed retention period set by the PO; C: audit events removed when their note is hard-deleted. Implications: accountability versus retention and privacy. Recommendation: A, subject to PO choice. | FR-010; blocks only the audit retention setting, not event writing. |
| CN-MCQ-14 | Is the stored body the exact submitted text, or is it trimmed before storing? (NEW, PENDING-PO) | A: store exactly as submitted; validation counts that same value; B: remove leading and trailing whitespace before storing and counting. Implications: what is stored and displayed versus what is validated. Recommendation: A, because no transformation is approved. | FR-002; blocks the stored-value form of T003 and T004, and the trailing-whitespace case at the 5,000-code-point limit in T009 (not asserted until decided). |

## Assumptions and exclusions

- Existing role/membership authorization, RLS, client access boundaries, and the approved Design System are reused; no new role or capability is invented.
- No audit retention, copy, or stored-body normalization beyond FR-002 is assumed (CN-MCQ-08, CN-MCQ-13, CN-MCQ-14). Post-deletion recovery, notification, and integrations are excluded.
- Client portal viewing/editing of staff notes, bulk operations, search, pinning, attachments, rich text, version history, soft delete/restore, export, notification, and integrations are not part of this spec unless separately approved.
- Hard deletion means the note record is physically removed; deleted content is not retained as a version-history record.
