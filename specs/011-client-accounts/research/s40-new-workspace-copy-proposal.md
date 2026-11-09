# New workspace copy proposal (S40-F11-MCQ-12) — APPROVED (S41-PO-3)

Status: rows 1-9 APPROVED byte-exact by S41-PO-3 (S40-F11-MCQ-12 = A), recorded in `specs/011-client-accounts/spec.md` Round 4 (row 1 role = Workspaces page action label, S41-PO-2 MCQ-17 = C). Not encoded in `lib/i18n/messages/en.ts` or `ar.ts` by this file (encoding is T056). Strings outside rows 1-9 (navigation label and page title, slug label, slug hint, workspace-create error, category labels, acknowledgement) are APPROVED as P1-P9 by S41-PO-4/S41-PO-5 and encoded in spec.md Round 5 (P5b dropped).

Authority: S40-R19 MCQ-12 (architect ruling, NOT PO words; `C:/Users/NEW LAP/.lifter/runs/s40-po/s40-architect-rulings.md`): "MCQ-12 = lane drafts EN + Egyptian Arabic copy for the New workspace action as a proposal file for PO byte-exact approval (not encoded until approved)." Entry point authority: S40-PO-10 item 7 (PO words): "Keep the previously proposed workspace-creation action."

Register: Arabic follows the approved Egyptian/MSA mix in `lib/i18n/messages/ar.ts` (approved Egyptian example: S40-PO-3 / CN-MCQ-19 `clientNotes.exitWarning.bodyInFlight` = "ملاحظتك بتتحفظ. لو خرجت دلوقتي، الحفظ مش هيتلغي."; approved status and error pattern: "تم الحفظ." / "تعذّر إتمام الطلب. حاول مرة أخرى."). Existing approved strings are REUSED where they fit (rows marked REUSE), so only the new rows need approval.

Counts: characters = UTF-16 code units = Unicode code points (no surrogate pairs in these strings), counted with Node on the exact strings below, spaces included.

## Strings

| # | Role | EN | AR (Egyptian) | EN chars | AR chars | Status |
|---|---|---|---|---|---|---|
| 1 | Workspaces page action label (PO only) | New workspace | مساحة عمل جديدة | 13 | 15 | APPROVED (S41-PO-3; role per MCQ-17 = C) |
| 2 | Dialog title | Create a new workspace | اعمل مساحة عمل جديدة | 22 | 20 | APPROVED (S41-PO-3) |
| 3 | Dialog body (no auto-provisioning, FR-021) | The new workspace starts empty. No members, clients, packages or branding are added automatically. | مساحة العمل الجديدة هتبدأ فاضية. مفيش أعضاء ولا عملاء ولا باقات ولا علامة تتضاف لوحدها. | 98 | 87 | APPROVED (S41-PO-3) |
| 4 | Name field label | Workspace name | اسم مساحة العمل | 14 | 15 | APPROVED (S41-PO-3); field set per MCQ-19 = A |
| 5 | Confirm button | Create workspace | اعمل مساحة العمل | 16 | 16 | APPROVED (S41-PO-3) |
| 6 | Cancel button | Cancel | إلغاء | 6 | 5 | REUSE `dialog.cancel` (en.ts:217, ar.ts:209) |
| 7 | Success feedback | Workspace created. | تم إنشاء مساحة العمل. | 18 | 21 | APPROVED (S41-PO-3) |
| 8 | Generic error (create failed, unknown result) | Unable to complete the request. Please try again. | تعذّر إتمام الطلب. حاول مرة أخرى. | 49 | 33 | REUSE approved `packages.unavailable` text (en.ts:117, ar.ts:111); no new string |
| 9 | Name validation (applies because MCQ-19 = A has a client-entered name; schema is 1–120 characters, `supabase/migrations/20261027120000_tenancy.sql:12`) | Enter a workspace name of up to 120 characters. | اكتب اسم مساحة العمل، 120 حرف كحد أقصى. | 47 | 39 | APPROVED (S41-PO-3); applies per MCQ-19 = A |

Notes:
- Row 6 and row 8 introduce no new text; they reuse approved strings verbatim. The reused key names differ (`dialog.cancel`, `packages.unavailable`); a PO-approved reuse does not need a new key. Row 8's text is still the approved `packages.unavailable` string for existing uses, but workspace creation uses P5 under its own key instead (S41-PO-4, S41-PO-5; spec.md Round 5).
- No duplicate-name message is proposed: no duplicate rule for workspace names is in any approved record. `workspaces.slug` is unique (`supabase/migrations/20261027120000_tenancy.sql:13`); the slug rules are MCQ-19 = A and P3-P5 (S41-PO-4).
- No "no permission" copy is proposed: the action is shown only to a Platform Owner (FR-021); other roles do not see it.
- No "unknown result" copy beyond row 8 is proposed. Workspace creation uses P5 for an unknown result and for every other workspace-create error (S41-PO-5; spec.md Round 5).

## Decision (S40-F11-MCQ-12)

Decided A by S41-PO-3 ("A: Approve rows 1-9 (Rec.)"). Rows 1-9 are approved byte-exact. The options below are history only.

- A) Approve rows 1–9 byte-exact, with row 9 only if MCQ-19 keeps a client-side name rule. Recommended.
- B) PO supplies the exact EN and AR strings for rows 1–5, 7 and 9; rows 6 and 8 stay reused.

Implications: A allows T056 to encode rows 1-9 once MCQ-17 and MCQ-19 are answered (both answered by S41-PO-2 and S41-PO-3, S41 round 4). Approval of rows 1-9 did NOT by itself supply every string T056 needs: MCQ-19 = A adds an editable slug field whose EN/AR label (P3), format hint (P4) and workspace-create error (P5) are not in rows 1-9. Those strings are now APPROVED by S41-PO-4/S41-PO-5 and encoded in spec.md Round 5, so T056 has all copy. B delays T056 until the PO supplies copy. No string is guessed in either case.

MCQ-12, MCQ-17 and MCQ-19 no longer block T051 or T056. The S40 global gate and frontend design gate still apply; T056 also follows T051 RED.
