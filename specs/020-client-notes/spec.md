# Feature Specification: F20 — Client Notes

**Feature Branch**: `speckit-020-client-notes`
**Status**: Spec-only. CN-MCQ-01..14 are RESOLVED by the PO (S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16, S38-PO-2; see Clarifications). CN-MCQ-08 (exact AR/EN copy) is RESOLVED by S38-PO-2 (table in Clarifications). CN-MCQ-15 was removed by architect ruling S38-R9; the design-system reuse rule is recorded in FR-006 and FR-007. **No open ambiguities.** No implementation is authorized by this document.
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

PO source `C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`, sections S37-PO-6, S37-PO-7 and S37-PO-14 (verbatim PO lines and the context note listing the approved options; the unrelated PR #30 approval line is omitted):

```text
S37-PO-6 (2026-11-08, PO message verbatim):
approves Client Notes Q01–12 as proposed, except Q04: all Trainers can view notes for all clients in their workspace; Q11: Last Save Wins approved. approve Option D: rename migrations, leave Stack C untouched and excluded.
(Context: "as proposed" = the architect's recommendation table for CN-MCQ-01..12 in the S37 session: 01 newest first; 02 Unicode code points, blank/whitespace-only rejected; 03 original author + creation time + "edited" time, no history; 05 rights resume with restored membership; 06 note kept, "Unavailable author"; 07 audit who/action/when, never note text; 08 PO approves exact AR/EN strings later, "Add New Note" fixed; 09 tab alongside existing client profile tabs (DESIGN.md §6); 10 no icon, text label; 12 viewer's local time zone. Option D for #43 = rename; Stack C untouched, not used for the #43 branch; its history repaired later only under a PO-approved procedure if ever needed.)

S37-PO-7 (2026-11-08, PO message verbatim, confirms/replaces the architect Q04 create mapping):
All Trainers can view and create Client Notes for any client within their workspace, regardless of assigned Trainer. Editing remains author-or-PO only; deletion PO only. Sales and Clients remain denied. Enforce workspace isolation.

S37-PO-14 (2026-11-08, PO message verbatim): Approve
(Approves as presented: CN-MCQ-13 = keep Client Notes audit events as long as the app's existing audit events, no new retention setting; CN-MCQ-14 = trim leading and trailing spaces, then count against the 5,000 limit and store the trimmed text.)
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

**Independent test**: Create synthetic notes under each permitted role, check exact saved content (trimmed)/author/server timestamp, reject blank-after-trim and over-limit payloads, and attempt direct unauthorized inserts.

**Acceptance scenarios**

1. **Given** a Trainer (for any client in their workspace), Workspace Owner, or Platform Owner in its authorized scope and a body that has 1 to 5,000 Unicode code points after its leading and trailing whitespace is removed, **When** they submit it through Add New Note, **Then** one independent note is created with the trimmed text as its body, attributed to the verified actor and a server-assigned creation timestamp (FR-001, FR-002, FR-004; CN-MCQ-14).
2. **Given** a caller submits a body that has more than 5,000 Unicode code points after trimming, or a body that is blank after trimming, **When** the request reaches the application or database write boundary, **Then** creation is refused and no note is persisted (FR-002; CN-MCQ-02).
3. **Given** a caller submits a body of 5,000 Unicode code points followed or preceded by whitespace, **When** the request is accepted, **Then** the stored body is the 5,000 code points without that whitespace (FR-002; CN-MCQ-14; S37-PO-16).
4. **Given** a caller supplies a forged author, client, or workspace identity, **When** the write is attempted, **Then** those supplied identities cannot widen access or replace verified identity/scope (FR-004).

### Story 3 — Edit and permanently delete (P1)

The note author or Platform Owner edits a note. Only the Platform Owner permanently hard-deletes a note. Notes do not have version history.

**Independent test**: Use synthetic author, other Trainer, Workspace Owner, Platform Owner, Sales, Client, and anonymous fixtures to exercise edit and delete through both walls; verify deleted rows are absent.

**Acceptance scenarios**

1. **Given** a note whose author still holds current authorization in that workspace (an active membership and a role still authorized under FR-004; CN-MCQ-05), **When** the author submits a valid edit, **Then** the current body is replaced in place, the edited timestamp is set, the original author and creation timestamp are kept, and no version history is created (FR-003, FR-004). **Given** two saves to the same note, **When** both are valid, **Then** the last save is the note content (FR-009).
2. **Given** a Platform Owner and a note in a workspace within the PO's existing authorized scope, **When** the PO edits the note, **Then** the current content changes, the edited timestamp is set, and no version history is created (FR-003, FR-004).
3. **Given** any non-PO actor, including the note author, **When** they attempt a hard delete, **Then** the operation is denied. **Given** a Platform Owner with current scope, **When** they hard-delete, **Then** the note row is permanently removed (FR-003, FR-004).
4. **Given** a revoked membership, Sales, Client, anonymous, or foreign-workspace actor, **When** a direct database or application request attempts a read or write, **Then** it is denied (FR-004, FR-005). **Given** an author whose membership was revoked and later restored, **When** they edit their note, **Then** author edit rights have resumed (CN-MCQ-05).
5. **Given** two valid saves to one note by the author or the Platform Owner that overlap in time, **When** the database commits them, **Then** the later committed body is the note content, `created_at` and `author_user_id` are unchanged, no version row exists, and each successful save emits exactly one audit event (FR-003, FR-009, FR-010).
6. **Given** a direct UPDATE that changes `id`, `workspace_id`, `client_id`, `author_user_id` or `created_at` of an existing note, **When** it is attempted by the author (including an author authorized in two workspaces), a Trainer, a Workspace Owner or a Platform Owner, **Then** the database refuses it and the row is unchanged (FR-003, FR-005).

## Functional Requirements

- **FR-001**: The product MUST expose a separate Client Notes tab within Client Details, placed as a horizontal tab alongside the existing client profile tabs (DESIGN.md §6). Notes MUST be independent of Exercise Library and Workout Planner records.
- **FR-002**: Each note MUST be an independent plain-text entry with a maximum length of 5,000 Unicode code points, an author, and a server-assigned creation timestamp. Leading and trailing whitespace MUST be removed from the submitted body, then the result is counted in Unicode code points against the 5,000 limit and stored as the trimmed text (CN-MCQ-14; S37-PO-16). Whitespace means characters with the Unicode White_Space property. A body that is blank after trimming (in other words, whitespace-only) MUST be rejected and no row persisted (CN-MCQ-02). Interior formatting is preserved (S37-PO-16); no other normalization is defined. An authorized creation action MUST be labeled “Add New Note” (CN-MCQ-08 row 2). When a note's author is unavailable, the note MUST be kept and MUST show the neutral unavailable-author label “Unavailable author” / “صاحب الملاحظة غير متاح” (CN-MCQ-06; CN-MCQ-08 row 26). No user-visible copy is approved outside the CN-MCQ-08 table in Clarifications.
- **FR-003**: A note MUST have no version history. Only its author or a Platform Owner MAY edit it, and an author MAY edit only while holding current authorization in the note's workspace: an active membership and a role still authorized for Client Notes under FR-004 (CN-MCQ-05). A successful edit MUST replace the current body in place, set an “edited” timestamp, and keep the original author and creation timestamp (CN-MCQ-03). The database MUST refuse any UPDATE that changes `id`, `workspace_id`, `client_id`, `author_user_id` or `created_at`; an edit changes only `body` and `edited_at`. Only a Platform Owner MAY permanently hard-delete a note.
- **FR-004**: Authorized Trainers, Workspace Owners, and Platform Owners MAY view and create notes within their authorized workspace scope. A Trainer MAY view and create notes for any client in their workspace, regardless of assigned Trainer (S37-PO-6, S37-PO-7; CN-MCQ-04). Platform Owner scope MUST follow the existing PO rule. Application authorization MUST use the existing verified-actor and role/membership model. A Client or Sales actor MUST be denied. UI visibility MUST NOT act as a security boundary.
- **FR-005**: Notes MUST be workspace-scoped. Backend authorization and database RLS MUST enforce the same deny-by-default access policy for read, create, edit, and hard delete. Every note request MUST be bound to its client and workspace; a caller-supplied foreign workspace/client/author MUST NOT widen access. Cross-workspace and per-role denial coverage MUST be specified.
- **FR-006**: The behavior answered by the PO (CN-MCQ-01..14) is encoded in FR-001..FR-010 and the scenarios above. Copy governed by CN-MCQ-08 is encoded from the approved S38-PO-2 table, by row number. The Client Notes UI MUST reuse existing Design System components and their existing values (S38-R9): the DESIGN.md §6 tabs pattern, the existing textarea, button, dialog, toast and States components, and the existing tokens and breakpoints. It MUST NOT introduce a new breakpoint, touch-size, focus or token value. If implementation later needs a value that exists neither in DESIGN.md nor in an existing component, that becomes a PO question at that time under the frontend design gate and MUST NOT be implemented as a guess.
- **FR-007**: The tab MUST follow DESIGN.md and the existing Design System for EN LTR / AR RTL, typography, keyboard access, visible focus, accessible labels/roles, contrast, and loading/empty/error/success/disabled/pending/interaction states. The tab and its actions MUST be text-only with no icon (CN-MCQ-10). The tab label, state messages, action labels, “edited” and byline labels, and the “Unavailable author” and permission messages MUST use the exact CN-MCQ-08 table strings (rows 1–29). Mixed-direction user text MUST be wrapped in the existing `Bidi` component (README.md, mixed-direction data; `components/ui/Bidi`) and MUST NOT be machine-translated. No new motion is required. Breakpoints, touch sizes, focus styling and tokens MUST be the existing values of DESIGN.md and the reused components (S38-R9; FR-006).
- **FR-008**: The note list MUST show notes newest-created first, ordered by server creation timestamp with a deterministic tie-break. An edit MUST NOT change a note's position in the list (CN-MCQ-01).
- **FR-009**: Concurrent edits to one note MUST resolve as last save wins (CN-MCQ-11): each save that satisfies FR-002 and FR-003 replaces the current body, and the winner is the write the database commits last (client clocks are not used). No stale-write rejection, merge or conflict prompt is defined. Timestamps MUST be displayed in the viewer's local time zone (CN-MCQ-12) in the CN-MCQ-08 row 29 format: day, month name, year, then 12-hour time with AM/PM, with Western digits 0–9 (for example “8 Nov 2026, 10:15 PM” / “8 نوفمبر 2026، 10:15 م”).
- **FR-010**: Each successful note create, edit, and hard delete MUST emit exactly one audit event. Its note-specific content MUST be limited to the actor, workspace, client ID, note ID, action, and timestamp. In the existing `public.audit_events` table these map to `actor_user_id`, `workspace_id`, `details` (client ID), `target_id` (note ID), `action`, and `occurred_at`. The table's structural fields (its generated `id`, the required `target_table` naming the note relation, and the `details` object that carries the client ID) are not note content. An audit event MUST NEVER contain note text, and no generic row-snapshot capture may store note body content in audit (CN-MCQ-07). Client Notes audit events MUST follow the app's existing audit retention unchanged: no Client Notes retention setting, purge, or override is added (CN-MCQ-13). The existing policy is defined by the immutable `public.audit_events` table (`supabase/migrations/20261027150000_audit_log.sql`, update, delete and truncate blocked by triggers); its period is an open pre-production decision (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`), which Client Notes inherits and does not decide. The note mutation and its audit event MUST be written in the same database transaction: if the audit write fails, the mutation MUST roll back and no successful audit event remains. A rejected or denied operation MUST NOT produce a successful note-mutation event; this follows the existing audit rule in `specs/005-audit-log/spec.md` User Story 1, scenario 2 (a write the database rejects produces no event), and Client Notes adds no denial-audit event type.

## Success Criteria

- **SC-001**: 100% of authorized read/create/edit cases for Trainer (including Trainers not assigned to the client), Workspace Owner, and Platform Owner fixtures follow FR-004; 100% of Sales, Client, anonymous, unauthorized, revoked-membership, and foreign-workspace cases are denied through both application authorization and database RLS.
- **SC-002**: 100% of create attempts by authorized actors (FR-004) whose body has 1 to 5,000 Unicode code points after leading and trailing whitespace is removed persist only that trimmed plain text with the verified author and server creation timestamp; 100% of attempts whose trimmed body exceeds 5,000 code points or is blank after trimming are refused without a persisted row; 100% of create attempts by unauthorized actors are denied (SC-001).
- **SC-003**: 100% of valid edits by the author (with current active membership) or Platform Owner in scope succeed; 100% of edits by ineligible actors fail; concurrent saves resolve as last save wins; 100% of non-PO delete attempts fail; a PO hard delete leaves no note row; no version-history row is produced; each successful create, edit, and delete produces exactly one metadata-only audit event (FR-010).
- **SC-004**: The Client Details tab is documented in AR RTL and EN LTR using only approved Design System patterns; placement, icon and ordering are decided; copy is the approved CN-MCQ-08 table (rows 1–29); the tab reuses existing Design System components and values and introduces no new breakpoint, touch-size, focus or token value (S38-R9).
- **SC-005**: Later UI acceptance covers keyboard-only navigation, visible focus, screen-reader names/roles, contrast in light/dark and workspace brand variants, required states, reduced-motion behavior, and AR RTL / EN LTR on 390px mobile and 1440px desktop (plus tablet if layout changes); the tab reuses existing components and values (S38-R9); no spec-only artifact claims rendered verification.
- **SC-006**: 100% of list reads return notes newest-created first with a deterministic tie-break; no edit changes a note's list position; 100% of displayed timestamps use the viewer's local time zone.

## Clarifications

### PO decision register

1. Final S36 PO wording is quoted byte-exact above from `s36-po-5.verbatim.txt`; S36-PO-4 item 2 is also quoted byte-exact above as earlier wording. S36-PO-5 is authoritative where wording differs.
2. Tenant isolation and deny-by-default design are required by this feature brief and the existing Constitution §I / F3 model. The existing role set is `platform_owner | workspace_owner | trainer | sales`; current workspace membership is required for non-PO workspace access. Revoked membership grants no access per the existing PO-approved S36-Q2 decision.
3. The existing client record is `public.clients(id, workspace_id, ...)`; no concrete migration version or SQL is part of this spec-only change.
4. **Resolution status (round 5).** CN-MCQ-01..14 are RESOLVED: CN-MCQ-01..07 and CN-MCQ-09..12 by S37-PO-6 (approves Q01–12 as proposed, with Q04 as stated and Q11 Last Save Wins) and S37-PO-7 (Q04 create scope); CN-MCQ-13 and CN-MCQ-14 by S37-PO-14, with CN-MCQ-14's whitespace scope superseded by S37-PO-16; CN-MCQ-08 by S38-PO-2. CN-MCQ-15 was removed by S38-R9 (item 8). **No open ambiguities.** Analyze (`checklists/analyze.md`, dated after the round-5 edits) reports zero open ambiguities and zero open CRITICAL/HIGH findings.
5. Where an earlier recommendation and a PO answer differ, the PO answer controls. The S37 PO answer supersedes the earlier recommendation for CN-MCQ-04 (all Trainers in the workspace) and CN-MCQ-11 (last save wins).
6. **Whitespace (closed).** S37-PO-16 (quoted below) supersedes the S37-PO-14 wording “trim leading and trailing spaces” and the architect ruling S37-R6. The PO's “all leading/trailing whitespace” is encoded as the Unicode White_Space property (FR-002), which is the reading the word “all” requires. Interior formatting is preserved by the same PO line. Trimming is applied before the 5,000-code-point count, and blank bodies are rejected.
7. **Denied-operation audit (closed by existing policy).** Critique MEDIUM 6 asked whether a denial-audit rule is needed. The existing approved audit policy (`specs/005-audit-log/spec.md` User Story 1, scenario 2) produces no event for a write the database rejects. FR-010 and T012 apply that rule. No new Client Notes denial event is added, and no PO decision is needed for this item.
8. **Architect rulings, round 5 (not PO decisions).** S38-R8 (CodeRabbit thread `PRRT_kwDOVYgYQ861E1-8`, tasks.md dependency order): a test task is ticked only after its tests execute and pass (constitution §3); red runs are recorded as evidence with the box unticked. The finding that asked to tick T014 while its tests are red is not adopted. S38-R9 (CN-MCQ-15, a design-system question that is not a PO question under S38-PO-3): CN-MCQ-15 is removed and its ID is not reused. The Client Notes UI reuses existing Design System components and their existing values (the DESIGN.md §6 tabs pattern; the existing textarea, button, dialog, toast and States components; existing tokens and breakpoints) and introduces no new breakpoint, touch-size, focus or token value (FR-006, FR-007, SC-004, SC-005, T005, T013). A value that exists neither in DESIGN.md nor in an existing component becomes a PO question only when implementation needs it, under the frontend design gate.

### Session S38 (2026-11-08) — binding PO words, verbatim

S38-PO-2 item 2 (PO message, verbatim; only item 2 is quoted):

```text
2. CN-MCQ-08: Approve all copy except “كاتب غير متاح” → “صاحب الملاحظة غير متاح”. Western digits.
```

S37-PO-16 Client Notes line (PO message, verbatim; the other S37-PO-16 lines are omitted as unrelated):

```text
- Client Notes: Trim all leading/trailing whitespace before 5,000-character validation/storage; preserve internal formatting; reject empty notes.
```

### Approved copy (CN-MCQ-08, S38-PO-2)

Rows 1–29 are approved byte-exact as amended by the PO (row 26 Arabic: “صاحب الملاحظة غير متاح”; Western digits 0–9). Source: `C:/Users/NEW LAP/.lifter/runs/s38-po/cn-mcq-08-proposed-copy.md`. Rows marked * reuse existing `lib/i18n/messages/{en,ar}.ts` strings. Row 2 “Add New Note” is fixed by S37-PO-6. Rows are referenced by number from FR-002, FR-007, FR-009, the contracts and tasks T005/T013.

| # | Where | English | Arabic |
|---|---|---|---|
| 1 | Tab label | Client Notes | ملاحظات العميل |
| 2 | Create action (EN fixed S37-PO-6) | Add New Note | إضافة ملاحظة جديدة |
| 3 | Note field label | Note | الملاحظة |
| 4 | Character counter | {count} / 5,000 | {count} / 5,000 |
| 5 | Save new note | Save note | حفظ الملاحظة |
| 6 | Cancel* | Cancel | إلغاء |
| 7 | Saving (pending) | Saving… | جارٍ الحفظ… |
| 8 | Edit action | Edit | تعديل |
| 9 | Save edit | Save changes | حفظ التغييرات |
| 10 | Delete action (PO only)* | Delete | حذف |
| 11 | Delete dialog title | Delete this note? | حذف هذه الملاحظة؟ |
| 12 | Delete dialog body | This note will be permanently deleted. This can't be undone. | سيتم حذف هذه الملاحظة نهائيًا، ولا يمكن التراجع عن ذلك. |
| 13 | Delete dialog confirm | Delete note | حذف الملاحظة |
| 14 | Loading | Loading notes… | جارٍ تحميل الملاحظات… |
| 15 | Empty state | No notes for this client yet. | لا توجد ملاحظات لهذا العميل بعد. |
| 16 | Load error | Unable to load notes. | تعذّر تحميل الملاحظات. |
| 17 | Retry* | Retry | إعادة المحاولة |
| 18 | Save error | Unable to save the note. Please try again. | تعذّر حفظ الملاحظة. يرجى المحاولة مرة أخرى. |
| 19 | Delete error | Unable to delete the note. Please try again. | تعذّر حذف الملاحظة. يرجى المحاولة مرة أخرى. |
| 20 | Blank note error | Enter a note before saving. | أدخل ملاحظة قبل الحفظ. |
| 21 | Too long error | Notes can be up to 5,000 characters. | يمكن أن تصل الملاحظة إلى 5,000 حرف كحد أقصى. |
| 22 | Created toast | Note added. | تمت إضافة الملاحظة. |
| 23 | Edited toast* | Changes saved | تم حفظ التغييرات |
| 24 | Deleted toast | Note deleted. | تم حذف الملاحظة. |
| 25 | Edited marker | Edited {time} | عُدّلت {time} |
| 26 | Unavailable author | Unavailable author | صاحب الملاحظة غير متاح |
| 27 | Permission refused | You don't have permission to do this. | ليست لديك صلاحية للقيام بذلك. |
| 28 | Byline | {author} · {time} | {author} · {time} |
| 29 | Timestamp | 8 Nov 2026, 10:15 PM | 8 نوفمبر 2026، 10:15 م |

Timestamp: viewer's local time zone (CN-MCQ-12), day month-name year + 12-hour time; Western digits 0-9 (S38-PO-2).

### CN-MCQ register

Each MCQ is a PO decision; options are mutually exclusive alternatives for the stated question. Resolved rows record the PO answer and where it is encoded.

| ID | Question | Resolution or pending options | Encoded in |
| --- | --- | --- | --- |
| CN-MCQ-01 | What is the note ordering in the tab? | RESOLVED: newest-created first, with a deterministic tie-break (S37-PO-6, approved as proposed). | FR-008, SC-006, T008 |
| CN-MCQ-02 | What counts toward “5,000 chars,” and are blank/whitespace-only notes valid? | RESOLVED: Unicode code points, maximum 5,000; blank/whitespace-only rejected (S37-PO-6, approved as proposed). | FR-002, SC-002, T009 |
| CN-MCQ-03 | What edit metadata is required? | RESOLVED: keep original author and creation timestamp; show an “edited” timestamp; no history (S37-PO-6, approved as proposed). | FR-003, data-model.md, T010 |
| CN-MCQ-04 | What is the “authorized” Trainer/client relation for Client Notes? | RESOLVED: all Trainers in the workspace may view and create notes for any client in their workspace, regardless of assigned Trainer (S37-PO-6 view; S37-PO-7 create). Editing stays author-or-PO only; deletion PO only. | FR-004, SC-001, T011 |
| CN-MCQ-05 | What access applies after an author's membership is revoked and later restored? | RESOLVED: after a restored active membership, normal author-edit rights resume when current authorization holds; revoked membership has zero access (S37-PO-6 approved as proposed). | FR-003, Story 3, T010 |
| CN-MCQ-06 | What should happen if an author identity is deactivated or becomes unavailable? | RESOLVED: note retained with its author reference and a neutral unavailable-author label (S37-PO-6 context). Exact wording: CN-MCQ-08 row 26 (S38-PO-2). | FR-002, data-model.md, T013 |
| CN-MCQ-07 | Should note create/edit/delete emit audit events, and what may they contain? | RESOLVED: one audit event per create/edit/delete containing only actor, workspace, client/note IDs, action and timestamp; never note text (S37-PO-6 context). Retention is CN-MCQ-13. | FR-010, T012 |
| CN-MCQ-08 | Which copy is approved for Arabic labels and empty/error/success states? | RESOLVED: all copy in the approved table (rows 1–29, S38-PO-2), including the tab label, state messages, “edited” and “Unavailable author” labels, permission message, timestamp format and Western digits. Row 26 Arabic amended by the PO. “Add New Note” English wording was fixed by S37-PO-6. | FR-002, FR-007, FR-009, contracts, T005, T013 |
| CN-MCQ-09 | Where does the new tab appear and what is its label/order across screen sizes? | RESOLVED: horizontal tab alongside the existing client profile tabs, per the DESIGN.md §6 pattern (S37-PO-6 context). Label text: CN-MCQ-08 row 1. Layout values: reused Design System components and values (S38-R9). | FR-001, T013 |
| CN-MCQ-10 | What icon, if any, identifies the tab/action? | RESOLVED: no icon; text label (S37-PO-6 context). | FR-007, T013 |
| CN-MCQ-11 | How should concurrent edits to one note resolve? | RESOLVED: last save wins (S37-PO-6, Q11 Last Save Wins approved). | FR-003, FR-009, SC-003, T010 |
| CN-MCQ-12 | What timestamp display timezone/format should the tab use? | RESOLVED: viewer's local time zone (S37-PO-6 context). Display format: CN-MCQ-08 row 29 (S38-PO-2). | FR-009, SC-006, T013 |
| CN-MCQ-13 | How long are metadata-only audit events (CN-MCQ-07) retained? | RESOLVED: they follow the app's existing audit retention unchanged; no new retention setting (S37-PO-14). The existing policy is defined by the immutable `public.audit_events` table (`supabase/migrations/20261027150000_audit_log.sql`, triggers at lines 29-41 block update, delete and truncate). Its period is an open pre-production decision (DP-02 / ND-F5-1 / B4, `docs/13-production-readiness.md`); Client Notes inherits that position and does not decide it. | FR-010, T012 |
| CN-MCQ-14 | Is the stored body the exact submitted text, or is it trimmed before storing? | RESOLVED: all leading and trailing whitespace is removed, the result is counted against 5,000 Unicode code points, and the trimmed text is stored; interior formatting is preserved; a body blank after trimming is rejected (S37-PO-16, which supersedes the S37-PO-14 wording “spaces”; CN-MCQ-02). | FR-002, SC-002, Story 2 scenarios 1-3, T003, T004, T009, T014 |

## Assumptions and exclusions

- Existing role/membership authorization, RLS, client access boundaries, and the approved Design System are reused; no new role or capability is invented.
- Copy is only the approved CN-MCQ-08 table (rows 1–29). Audit retention is inherited unchanged (CN-MCQ-13). Stored-body normalization is limited to the leading and trailing whitespace trim with preserved interior formatting in FR-002 (CN-MCQ-14; S37-PO-16). UI values come only from DESIGN.md and the reused Design System components (S38-R9); no new value is introduced. Post-deletion recovery, notification, and integrations are excluded.
- Client portal viewing/editing of staff notes, bulk operations, search, pinning, attachments, rich text, version history, soft delete/restore, export, notification, and integrations are not part of this spec unless separately approved.
- Hard deletion means the note record is physically removed; deleted content is not retained as a version-history record.
