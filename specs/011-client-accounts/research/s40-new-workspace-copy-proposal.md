# New workspace copy proposal (S40-F11-MCQ-12) — PENDING-PO

Status: rows 1-9 APPROVED byte-exact by S41-PO-3 (S40-F11-MCQ-12 = A), recorded in `specs/011-client-accounts/spec.md` Round 4 (row 1 role = Workspaces page action label, S41-PO-2 MCQ-17 = C). Not encoded in `lib/i18n/messages/en.ts` or `ar.ts` by this file (encoding is T056). Strings outside rows 1-9 (navigation label and page title, slug label, slug hint, slug-clash error, category labels, acknowledgement) are PENDING-PO in `research/s41-new-copy-proposal.md`. Byte-exact PO approval is required before any further string is encoded (011 FR-021 and FR-025, tasks T051/T056/T059).

Authority: S40-R19 MCQ-12 (architect ruling, NOT PO words; `C:/Users/NEW LAP/.lifter/runs/s40-po/s40-architect-rulings.md`): "MCQ-12 = lane drafts EN + Egyptian Arabic copy for the New workspace action as a proposal file for PO byte-exact approval (not encoded until approved)." Entry point authority: S40-PO-10 item 7 (PO words): "Keep the previously proposed workspace-creation action."

Register: Arabic follows the approved Egyptian/MSA mix in `lib/i18n/messages/ar.ts` (approved Egyptian example: S40-PO-3 / CN-MCQ-19 `clientNotes.exitWarning.bodyInFlight` = "ملاحظتك بتتحفظ. لو خرجت دلوقتي، الحفظ مش هيتلغي."; approved status and error pattern: "تم الحفظ." / "تعذّر إتمام الطلب. حاول مرة أخرى."). Existing approved strings are REUSED where they fit (rows marked REUSE), so only the new rows need approval.

Counts: characters = UTF-16 code units = Unicode code points (no surrogate pairs in these strings), counted with Node on the exact strings below, spaces included.

## Strings

| # | Role | EN | AR (Egyptian) | EN chars | AR chars | Status |
|---|---|---|---|---|---|---|
| 1 | Switcher / menu action label (PO only) | New workspace | مساحة عمل جديدة | 13 | 15 | NEW, PENDING-PO |
| 2 | Dialog title | Create a new workspace | اعمل مساحة عمل جديدة | 22 | 20 | NEW, PENDING-PO |
| 3 | Dialog body (no auto-provisioning, FR-021) | The new workspace starts empty. No members, clients, packages or branding are added automatically. | مساحة العمل الجديدة هتبدأ فاضية. مفيش أعضاء ولا عملاء ولا باقات ولا علامة تتضاف لوحدها. | 98 | 87 | NEW, PENDING-PO |
| 4 | Name field label | Workspace name | اسم مساحة العمل | 14 | 15 | NEW, PENDING-PO (field set depends on S40-F11-MCQ-19) |
| 5 | Confirm button | Create workspace | اعمل مساحة العمل | 16 | 16 | NEW, PENDING-PO |
| 6 | Cancel button | Cancel | إلغاء | 6 | 5 | REUSE `dialog.cancel` (en.ts:217, ar.ts:209) |
| 7 | Success feedback | Workspace created. | تم إنشاء مساحة العمل. | 18 | 21 | NEW, PENDING-PO |
| 8 | Generic error (create failed, unknown result) | Unable to complete the request. Please try again. | تعذّر إتمام الطلب. حاول مرة أخرى. | 49 | 33 | REUSE approved `packages.unavailable` text (en.ts:117, ar.ts:111); no new string |
| 9 | Name validation (only if MCQ-19 keeps a client-side name rule; schema is 1–120 characters, `supabase/migrations/20261027120000_tenancy.sql:12`) | Enter a workspace name of up to 120 characters. | اكتب اسم مساحة العمل، 120 حرف كحد أقصى. | 47 | 39 | NEW, PENDING-PO and conditional on MCQ-19 |

Notes:
- Row 6 and row 8 introduce no new text; they reuse approved strings verbatim. The reused key names differ (`dialog.cancel`, `packages.unavailable`); a PO-approved reuse does not need a new key.
- No duplicate-name message is proposed: no duplicate rule for workspace names is in any approved record. `workspaces.slug` is unique (`supabase/migrations/20261027120000_tenancy.sql:13`); how a slug is produced or what happens on a slug clash is S40-F11-MCQ-19 and is NOT copied here.
- No "no permission" copy is proposed: the action is shown only to a Platform Owner (FR-021); other roles do not see it.
- No "unknown result" copy beyond row 8 is proposed. Lost-response handling for workspace creation (a retry must not create a second workspace) has no approved rule; it is part of S40-F11-MCQ-19, and no copy is proposed for it.

## Options for PO (S40-F11-MCQ-12)

- A) Approve rows 1–9 byte-exact, with row 9 only if MCQ-19 keeps a client-side name rule. Recommended.
- B) PO supplies the exact EN and AR strings for rows 1–5, 7 and 9; rows 6 and 8 stay reused.

Implications: A allows T056 to encode rows 1-9 once MCQ-17 and MCQ-19 are answered (both answered by S41-PO-2 and S41-PO-3, S41 round 4). Approval of rows 1-9 does NOT supply every string T056 needs: MCQ-19 = A adds an editable slug field whose EN/AR label (row P3), format hint (P4) and slug-clash error (P5 reuse of row 8, or P5b) are not in rows 1-9. Those strings are PENDING-PO in `research/s41-new-copy-proposal.md`, so T056 stays blocked for them until the PO supplies or approves them byte-exact. B delays T056 until the PO supplies copy. No string is guessed in either case.

Blocked by MCQ-12 (copy only): T051 copy assertions and T056 string encoding. Placement (MCQ-17) and fields (MCQ-19) are separate blockers for the same tasks.
