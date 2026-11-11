# S40 pending PO questions (F11/F12 account lifecycle, round 3)

Status: MCQ-12 to -20 DECIDED by S41-PO-1..3 (each entry carries its DECIDED line; encoded in spec.md Round 4, plan.md, tasks.md and traceability.md). The copy strings that those decisions needed are APPROVED by S41-PO-4 (P1-P9) and S41-PO-5 (workspace-create error) and are encoded in spec.md Round 5; the drafts in `research/s41-new-copy-proposal.md` are history only and P5b is dropped. S41-GAP-MCQ-1 and -2 (below) are DECIDED by S41-PO-4 and encoded; S41-GAP-MCQ-3 (end of file) is DECIDED by S41-PO-11 and encoded in spec.md Round 6. No copy or gap question remains open. MCQ-1 to -11 keep their earlier status. The S40 implementation gate (tasks.md, S40 section) stays closed only for the architect design gates and task dependencies named per task.

Numbering: S40-F11-MCQ-n. Authority for decided items: S40-PO-13 (MCQ-1 = B, MCQ-2 = A, MCQ-11 = defaults), quoted in spec.md Round 3. Architect rulings (labelled, not PO words): S40-R19 MCQ-4, MCQ-8, MCQ-10; MCQ-12 is a proposal (research/s40-new-workspace-copy-proposal.md).

---

## S40-F11-MCQ-12 — EN/AR copy of the "New workspace" action (carried)

**DECIDED — S41-PO-3, MCQ-12 = A** ("A: Approve rows 1-9 (Rec.)"). Rows 1-9 are encoded byte-exact in spec.md Round 4 (row 1 role = Workspaces page action label, per MCQ-17 = C). Strings outside rows 1-9 are approved as P1-P9 by S41-PO-4/S41-PO-5 and encoded in spec.md Round 5 (P5b dropped). Blocked: none.

Question: approve the copy in `research/s40-new-workspace-copy-proposal.md` byte-exact, or supply other strings?

- A) Approve the proposal rows 1 to 9 byte-exact (row 9 only if MCQ-19 keeps a client-side name rule). **Recommended.**
- B) The PO supplies the exact EN and AR strings for rows 1 to 5, 7 and 9; rows 6 and 8 stay as reused approved strings.

Implications: A lets T056 encode once MCQ-17 and MCQ-19 are also answered. B delays T056 until the strings arrive. No guessed string is encoded in either case.

Historical blocker: before S41-PO-3/S41-PO-4/5, copy assertions in T051 and string encoding in T056 awaited the PO. The decisions and approved strings cited above cleared it; it is not an active gate.

---

## S40-F11-MCQ-13 — deleting the last active Workspace Owner

**DECIDED — S41-PO-1, MCQ-13 = A** ("A: Allowed"). Encoded in FR-018 and User Story 5 scenario 7; T047. Blocked: none.

Question: may a Workspace Owner account be deleted when it is the last active Workspace Owner of its workspace? (The PO text covers all roles but says nothing about this consequence.)

- A) Allowed. The workspace then has no Workspace Owner; approvals fall to the PO only (011/012 FR-001).
- B) Refused while it is the last active Workspace Owner, with the existing `not_permitted` / SQLSTATE 42501 convention (spec 003 FR-014 style).
- C) Allowed only after a replacement active Workspace Owner exists (add-first, as S30-PO-3 Q8 does for the Platform Owner). **Recommended.**

Implications: A leaves pending clients waiting for the PO. B blocks the deletion until a human is changed by other means. C keeps the approver boundary intact and matches the rule already applied to the Platform Owner.

Historical blocker: before S41-PO-1, the last-Workspace-Owner case of T047 awaited the PO. S41-PO-1 MCQ-13 = A cleared it; it is not an active gate.

---

## S40-F11-MCQ-14 — personal fields on the terminal client row after release

**DECIDED — S41-PO-1, MCQ-14 = B** ("B: Clear profile (Rec.)"). Encoded in FR-020 and plan P-S40-1 step D; T047, T048. Option C is restored to its 765a6ae8 wording (F4, S41-R4); A and C are not chosen. Blocked: none.

Question: after the guarded release (plan P-S40-1 step D), which personal fields of the client row are kept?

- A) Keep name and all other profile fields; only the email and phone identifiers are cleared.
- B) Clear name and all profile fields at release; keep identifiers-free terminal state, IDs, status and timestamps. **Recommended.**
- C) Keep every field and only mark the row terminal.

Implications: A keeps personal data of a departed client with no stated need (Constitution VII). B satisfies FR-020's no-copy rule and keeps the history rows referencing the client. C is the simplest but keeps the most personal data.

Historical blocker: before S41-PO-1, the field-clearing step of T048 and personal-field scan in T047 awaited the PO. S41-PO-1 MCQ-14 = B cleared it; it is not an active gate.

---

## S40-F11-MCQ-15 — capability for Workspace Owner, Trainer and Sales deletion

**DECIDED — S41-PO-1, MCQ-15 = A** ("A: manage_staff_access (Rec.)"). Encoded in FR-018, plan P-S40-1 actor and the 003 FR-015 S40 amendment; T047, T048. Blocked: none.

Question: which existing capability authorises deletion of Workspace Owner, Trainer and Sales accounts? (S40-R19 MCQ-10 covers the Platform Owner accounts and the PO-only assignment write only.)

- A) `manage_staff_access` (PO-only, no matrix change; the same capability as S40-R19 MCQ-10). **Recommended.**
- B) `delete_client` (a client capability; it would extend its meaning to staff).
- C) A new PO-only capability (a matrix change; needs explicit approval).

Implications: A reuses the staff-management capability, keeps the matrix, and matches MCQ-10. B mixes client and staff authority. C adds a matrix change (FR-008, FR-023).

Historical blocker: before S41-PO-1, the staff cases of T047 and T048 awaited the PO. S41-PO-1 MCQ-15 = A cleared it; it is not an active gate.

---

## S40-F11-MCQ-16 — tie-break for trainers with no prior assignment, and the "active client" reading

**DECIDED — S41-PO-2, MCQ-16 part 1 = A** ("A: First (Rec.)") and **part 2 = A** ("A: Approved + assigned (Rec.)"). Encoded in spec.md FR-028 (c), (d), SC-021, plan P-S40-5, tasks T058. Blocked: none.

Question (part 1): in the default tie-break "oldest last assignment", where does a trainer with no prior assignment sort?

- A) First (never assigned = oldest). **Recommended.**
- B) Last.
- C) Equal rank; ordered only by ascending `user_id`.

Question (part 2): the default balance is "active clients per trainer". Which clients count as active?

- A) Approved client accounts with a current assignment row (`ended_at` null). **Recommended.**
- B) Any non-deleted client account with a current assignment row.

Implications: part 1 changes which trainer is picked in the first round of a new workspace. Part 2 changes whether a deletion-pending client counts. Under plan P-S40-1 step 0 the client enters the deletion lifecycle while its assignment row stays current until step B, and an Auth failure can extend that interval. Option B would count such a client while option A does not, which can change trainer selection. Pending clients never hold an assignment under the approval trigger (F5, S41-R4). Correction (S41 round 6): the guarded release keeps `approval_state` unchanged, so FR-028 (c) now excludes an account in the F11 deletion lifecycle explicitly; the earlier reading that the client is no longer approved no longer applies.

Historical blocker: before S41-PO-2, the never-assigned and "active client" sub-cases of T058 and T062 awaited the PO. MCQ-16 = A/A cleared them; the remaining defaults (trigger = approval; balance; oldest-last tie-break; none eligible = unassigned list; PO override kept) were accepted by S40-PO-13. They are not active gates.

---

## S40-F11-MCQ-17 — placement of the "New workspace" action

**DECIDED — S41-PO-2, MCQ-17 = C** ("C: Workspaces page"). Encoded in FR-021 and plan P-S40-3; the frontend design gate applies before UI work. Options A and B are not chosen. Blocked: none; the navigation label and page title (P1, P2) are approved by S41-PO-4 and encoded in Round 5.

Facts: no workspace switcher component exists on origin/main. The only workspace selector found is the branding page selector (`tests/e2e/branding-production-ui.spec.ts:265`, `#branding-workspace`). S40-PO-10 item 7 keeps "the previously proposed workspace-creation action", which was a switcher action.

- A) Build a workspace switcher in the app shell with the PO-only action (new UI; needs the design gate). **Recommended**, because it is the proposed action.
- B) Place the PO-only action on the existing branding workspace selector surface.
- C) A PO-only "Workspaces" page in navigation (round 1 option B).

Implications: A adds shell UI and a design-gate pass. B is the smallest change but puts workspace creation on a branding screen. C adds a navigation entry.

Historical blocker: before S41-PO-2 MCQ-17 = C, placement in T051 and T056 awaited the PO. The Workspaces page placement is decided and is not an active gate.

---

## S40-F11-MCQ-18 — content of the financial-resolution confirmation (FR-025)

**DECIDED — S41-PO-2, MCQ-18 = A** ("A: Category + ack (Rec.)"). Encoded in FR-025 and plan P-S40-1a; T059. Blocked: none; the category labels (P6-P8) and acknowledgement (P9) are approved by S41-PO-4 and encoded in Round 5.

Question: S40-PO-10 item 3 asks for an "appropriate refund/financial-resolution confirmation" and says it is never an actual refund. What does the confirmation record?

- A) A required resolution category chosen by the PO (for example: refunded outside LIFTER, forfeited under the contract, other) plus an explicit acknowledgement; stored only in the append-only audit event with the account reference, actor and time. **Recommended.**
- B) An explicit acknowledgement only, with no category.
- C) A required short reason, no personal data, stored in the audit event.

Implications: in every option the confirmation creates no refund, ledger, collection, correction or cancellation row (FR-025), and must not use the spec 013 refund path. The "refunded outside LIFTER" category must not be read as a refund record. A gives the most evidence; B is the simplest; C risks free text.

Historical blocker: before S41-PO-2 MCQ-18 = A, the confirmation UI and record of T059 awaited the PO. The decision and approved strings cleared it; refusal without confirmation remains in force.

---

## S40-F11-MCQ-19 — fields of the workspace creation form

**DECIDED — S41-PO-3, MCQ-19 = A** ("A: Name + editable slug (Rec.)"). Encoded in FR-021 and plan P-S40-3; T051, T056. Blocked: none; the slug field label (P3), slug format hint (P4) and workspace-create error (P5) are approved by S41-PO-4/S41-PO-5 and encoded in Round 5; the retry edge case is decided by S41-GAP-MCQ-1 = A.

Facts: `workspaces.name` is required (1–120 characters) and `workspaces.slug` is required and unique (`supabase/migrations/20261027120000_tenancy.sql:12–13`). Nothing approved says how the slug is produced, what happens on a slug clash, or what a retry after a lost response does.

- A) PO enters the name; the slug is generated from the name (lowercase a–z, 0–9, hyphen), shown and editable; a clash returns a generic error; a retry with the same client key returns the same workspace and never creates a second one. **Recommended.**
- B) PO enters name and slug explicitly; a clash returns a generic error; the same retry rule as A.
- C) PO enters the name only; the slug is generated server-side with a random suffix (no clash case); the same retry rule as A.

Implications: A and B need the clash and retry copy (the proposal has no copy for these). C avoids the clash case but gives slugs the PO cannot choose.

Historical blocker: before S41-PO-3 MCQ-19 = A, the creation form in T051 and T056 awaited the PO. The decision and approved strings cleared it; it is not an active gate.

---

## S40-F11-MCQ-20 — Platform Owner deleting their own account

**DECIDED — S41-PO-1, MCQ-20 = A** ("A: Allowed"). Encoded in FR-018, plan P-S40-1 actor, T047 and T060. The last-PO guard (FR-026) is unchanged. Blocked: none.

Question: may a Platform Owner delete their own account while other valid Platform Owners exist? (The last-PO guard, FR-026, applies in every option.)

- A) Allowed when another valid Platform Owner exists.
- B) Refused for self-deletion; another Platform Owner must perform it. **Recommended.**
- C) Allowed only with the approval of a second Platform Owner.

Implications: A allows a self-service exit with no second check. B avoids a self-initiated lockout and a single actor both starting and completing a release. C adds a new approval step not in any approved record.

Historical blocker: before S41-PO-1 MCQ-20 = A, the self-deletion case of T047 awaited the PO. The decision cleared it; it is not an active gate.

---

## S41-GAP-MCQ-1 — a retry of workspace creation with the same client key but different input (raised by the S41 gap sweep)

**DECIDED — S41-PO-4, S41-GAP-MCQ-1 = A** ("A: Refuse, generic error (Rec.)"). Encoded in FR-021, plan P-S40-3, T049 and T056. Same key + same name and slug returns the existing workspace; same key + a different name or slug is refused with the P5 workspace-create error and creates no second workspace. A retry while the first request is in flight is serialized on the client key (architect technical reading of the no-second-workspace rule; not a PO decision). Blocked: none. Option C would have reopened S41-PO-3 MCQ-19; it is not chosen.

Facts: S41-PO-3 MCQ-19 = A decided that a retry with the same client key returns the same workspace and never creates a second one. It did not say what happens when the retry carries a different name or a different slug (the slug is editable), or when the first request is still in flight. S41-GAP-MCQ-1 = A now decides the different-input case; the in-flight case is handled by the client-key serialization (technical reading, not a PO decision).

Question: what does a retry with the same client key return when its name or its slug differs from the first request?

- A) The same key with the same name and slug returns the existing workspace. The same key with a different name or slug is refused with the generic error (approved copy row 8). **Recommended.**
- B) The same key always returns the existing workspace; a different name or slug is ignored without a message.
- C) The same key is refused with the generic error in every case, even for an identical request. This reopens S41-PO-3 MCQ-19 (a retry returns the same workspace) and changes FR-021; choosing it is a PO decision to reopen MCQ-19.

Implications: A keeps the no-second-workspace rule and never changes a name or a slug silently. B hides an input change from the PO. C makes a workspace that was created look failed after a lost response.

Blocked: none. The different-input retry tests of T049 and the retry flow of T056 are unblocked by S41-GAP-MCQ-1 = A. The identical lost-response retry is decided by S41-PO-3 MCQ-19 and is tested under T049 (S41 CodeRabbit finding on tasks.md:284). Copy: P5 is approved (S41-PO-4, S41-PO-5); no new string is needed.

## S41-GAP-MCQ-2 — appointing a new Workspace Owner after MCQ-13 = A (raised by the S41 gap sweep)

**DECIDED — S41-PO-4, S41-GAP-MCQ-2 = A** ("A: Yes, existing grant (Rec.)"). Encoded in FR-018, plan P-S40-1 post-deletion state and T047. After the last active Workspace Owner is deleted, the Platform Owner may appoint a new Workspace Owner through the existing PO-only staff grant path of spec 003 FR-005; no new capability and no matrix change. Option B is not chosen and is moot: the existing PO membership-grant policy does not depend on an active Workspace Owner, so adopting B would have required a new enforcement restriction and tests, which the PO did not choose. Blocked: none.

Facts: S41-PO-1 MCQ-13 = A allows deleting the last active Workspace Owner, which leaves the workspace with no Workspace Owner. S41-GAP-MCQ-2 = A decides that the Platform Owner may appoint a new Workspace Owner afterwards through the existing PO-only staff grant path of spec 003 FR-005.

Question: after the last active Workspace Owner is deleted, may the Platform Owner appoint a new Workspace Owner in that workspace?

- A) Yes, through the existing PO-only staff grant path of spec 003 (no new capability and no matrix change). **Recommended.**
- B) No appointment path for that workspace; it stays without a Workspace Owner until a separate decision is made.
- C) Reopens MCQ-13: a replacement Workspace Owner must exist before the last one can be deleted (add-first, the pattern of S30-PO-3 Q8 for the Platform Owner).

Implications: A restores approvals and client oversight at the workspace level with no new mechanism. B leaves the workspace permanently without a Workspace Owner. C changes the S41-PO-1 answer and needs the PO to confirm it.

Blocked: none. The post-deletion state assertion of T047 for the last-active Workspace Owner case is unblocked by S41-GAP-MCQ-2 = A. Every other T047 case is unaffected.

## S41-GAP-MCQ-3 — trainer assignment before approval and reassignment after a Trainer deletion (raised by the S41 gap sweep)

**DECIDED — S41-PO-11, C + A** ("C + A. No trainer assignment before client approval. After approval, auto-assign or allow manual override. If the assigned trainer is deleted, auto-reassign to an active trainer using balanced distribution. Preserve audit history."). The PO record is quoted byte-exact, up to its "(Architect mapping" line, in spec.md Round 6 and `C:/Users/NEW LAP/.lifter/runs/s41-po/s41-po-1.verbatim.txt`. Encoded in FR-022, FR-027, FR-028 (a), (g), (h), SC-021, plan P-S40-1 step (B), P-S40-2 and P-S40-5, tasks T047, T050, T058 and T062, and traceability; 012 FR-022 and 012 T042 carry the cross-reference. S41-PO-11 supersedes S41-R4 F2 and the FR-027 "no automatic reassignment" wording for the trainer-deletion case only. Blocked: none.

Facts: after S41-R4 F2 and S40-PO-13 MCQ-11, a manual PO assignment could exist before approval and, once ended, made the approval job a recorded no-op, leaving the client unassigned; every Trainer departure was also a no-op with no reassignment. The PO has decided the timing and the Trainer-deletion behaviour.

Question (as raised): when a PO manually assigned a Trainer before approval and that Trainer departs before approval, should the approval still distribute the client automatically?

- A) Yes: only a manual assignment made at or after approval blocks auto-distribution; a lapsed pre-approval choice does not. **Recommended at the time.**
- B) No: any manual assignment, including an ended pre-approval one, keeps the no-op and the client stays unassigned until the PO assigns again.
- C) Refuse manual assignment for a pending-approval client at write time, so the case cannot arise (changes FR-022 and the P-S40-2 eligibility).

Implications: the PO answered C + A. C removes the pre-approval case and changes FR-022 and the P-S40-2 manual-write eligibility; A lets the PO override after approval. The answer also adds the Trainer-deletion rule: on deletion of an assigned Trainer's account, each of that Trainer's clients outside the F11 deletion lifecycle is automatically reassigned to an active, non-revoked trainer of the workspace by the same balanced distribution, or listed as unassigned when none is eligible; a client already in `deletion_pending`, `release_pending` or released is excluded from both reassignment and the unassigned list, and the deletion-lifecycle no-op is recorded without retry. Every assignment, override, end and reassignment keeps its ended row (start, end, actor or system) in audit history. This replaces the earlier "never auto-reassigns" reading for the Trainer-deletion case only; a delayed job that finds an active manual assignment, or a manual assignment ended by a membership revocation or role change, still completes as a recorded no-op.

Blocked: none. The pre-approval refusal and post-approval override cases of T050, the reassignment cases of T047/T058/T062 and the T048 012 operation dependency are unblocked by S41-PO-11.
