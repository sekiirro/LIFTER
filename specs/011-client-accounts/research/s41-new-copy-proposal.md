# New copy proposal, round 4 (S41) — APPROVED (S41-PO-4, S41-PO-5)

Status: APPROVED byte-exact by S41-PO-4 (A-S41-1, PO free text) and S41-PO-5. The approved strings P1-P9 are encoded in `specs/011-client-accounts/spec.md` Round 5 and are the authority together with the PO verbatim file `C:/Users/NEW LAP/.lifter/runs/s41-po/s41-po-1.verbatim.txt`. This file is kept as history only; the pre-approval drafts below are NOT authoritative. P5b is DROPPED and is not in force. Encoding into `lib/i18n/messages/en.ts` and `ar.ts` is T056/T059 work, not part of this spec PR.

Key names in the table are proposed technical names; no i18n file is changed by this file.

## Approved rows (S41-PO-4; encoded in spec.md Round 5)

| # | Surface | EN | AR (Egyptian) | EN chars | AR chars |
|---|---|---|---|---|---|
| P1 | Workspaces navigation label (PO only); key `nav.workspaces` (proposed) | Workspaces | مساحات العمل | 10 | 12 |
| P2 | Workspaces page title (PO only); key `workspaces.title` (proposed) | Workspaces | مساحات العمل | 10 | 12 |
| P3 | Slug field label; key `workspaces.slugLabel` (proposed) | Workspace slug | اسم مساحة العمل في الرابط | 14 | 25 |
| P4 | Slug format hint; key `workspaces.slugHint` (proposed) | Use lowercase letters, numbers and hyphens only. Up to 50 characters, not starting or ending with a hyphen. | استخدم حروف إنجليزي صغيرة وأرقام وشرطة (-) بس. بحد أقصى 50 حرف، ومينفعش تبدأ أو تنهي بشرطة. | 107 | 91 |
| P5 | Workspace-create error; own key `workspaces.createError` (proposed); not `packages.unavailable` | Unable to complete the request. Please try again. | حصلت مشكلة ومقدرناش نكمّل طلبك. جرّب تاني. | 49 | 42 |
| P6 | Financial-resolution category 1; key `accountDeletion.categoryRefundedOutsideLifter` (proposed) | Refunded outside LIFTER | تم رد المبلغ خارج ليفتر | 23 | 23 |
| P7 | Financial-resolution category 2; key `accountDeletion.categoryForfeitedUnderContract` (proposed) | Forfeited under the contract | تم التنازل عن المبلغ حسب العقد | 28 | 30 |
| P8 | Financial-resolution category 3; key `accountDeletion.categoryOther` (proposed) | Other | سبب تاني | 5 | 8 |
| P9 | Financial-resolution acknowledgement; key `accountDeletion.financialAcknowledgement` (proposed) | I understand this only records the financial resolution. It does not process a refund, collect a payment, or cancel any subscription or debt. | أنا فاهم إن ده مجرد تسجيل للتسوية المالية، ومش معناه إن ليفتر رجّع أي فلوس، أو حصّل أي مبالغ، أو ألغى أي اشتراكات أو مستحقات. | 141 | 125 |

## S41-PO-5 — workspace-create error

All workspace-create errors (generic create failure, unknown result, slug clash and a same-key different-input retry) use P5 under their own message key, not `packages.unavailable`. `packages.unavailable` and every other existing use keep approved row 8 AR unchanged. The P5 AR differs from approved row 8 AR; S41-PO-5 settles that conflict.

## P5b — DROPPED

P5b (the slug-specific clash message) was option B of the round 4 proposal. S41-PO-4 supplies P5 for every workspace-create error and S41-PO-5 confirms it; P5b is dropped and must not be encoded. Choosing it would have reopened S41-PO-3 MCQ-19 and changed FR-021.

---

## History — the pre-approval proposal (NOT authoritative; kept for audit)

Banner: every "PENDING-PO", "PROPOSAL ONLY" and draft string in this section is historical. It was superseded by S41-PO-4/S41-PO-5 and must not be encoded. The approved table above and spec.md Round 5 are the authority.

# New copy proposal, round 4 (S41) — PENDING-PO

Status: PROPOSAL ONLY. PENDING-PO. Nothing in this file is approved or encoded. No string is encoded in `lib/i18n/messages/en.ts` or `ar.ts`, and no string is written into spec.md as a requirement. Byte-exact PO approval is required before any row is used (011 FR-021 and FR-025; tasks T051, T056, T059).

Scope: the strings that the S41-PO-1..3 answers need and that are not in approved rows 1-9. Approved rows 1-9 (S41-PO-3 MCQ-12 = A) are in spec.md, Round 4, and are not repeated here.

Authority: S41-PO-2 MCQ-17 = C (PO-only "Workspaces" page in navigation), S41-PO-3 MCQ-19 = A (name and editable slug), S41-PO-2 MCQ-18 = A (category and acknowledgement). Architect words, not PO words: the strings below are drafts for PO review. The Egyptian Arabic register follows `lib/i18n/messages/ar.ts`: "مساحات العمل" (plural of `packages.workspace`, `مساحة العمل`), "تم الحفظ." and "تعذّر إتمام الطلب. حاول مرة أخرى." (approved status and generic error patterns), and "العملاء" (`nav.clients`).

Counts: UTF-16 code units and Unicode code points are equal for every string below (no surrogate pairs). Counted with Node on the exact strings, spaces and punctuation included (`C:/Users/NEW LAP/.lifter/runs/s41-haiku-f11-r5/copy-counts.json`).

## Rows PENDING-PO

| # | Surface | EN | AR (Egyptian) | EN chars | AR chars | Status |
|---|---|---|---|---|---|---|
| P1 | Workspaces navigation label (PO only) | Workspaces | مساحات العمل | 10 | 12 | NEW, PENDING-PO |
| P2 | Workspaces page title (PO only) | Workspaces | مساحات العمل | 10 | 12 | NEW, PENDING-PO (same strings as P1 proposed; PO may approve them separately) |
| P3 | Slug field label (MCQ-19 = A; editable slug) | Workspace slug | معرّف مساحة العمل في الرابط | 14 | 27 | NEW, PENDING-PO |
| P4 | Slug format hint (lowercase a-z, 0-9, hyphen; at most 50 characters; no leading or trailing hyphen, the rule of `workspaces.slug` at `supabase/migrations/20261027120000_tenancy.sql:13`) | Use lowercase letters, numbers and hyphens only. Up to 50 characters, not starting or ending with a hyphen. | استخدم حروف إنجليزية صغيرة وأرقام وشرطة (-) بس. ٥٠ حرف كحد أقصى، ومينفعش تبدأ أو تنتهي بشرطة. | 107 | 93 | NEW, PENDING-PO |
| P5 | Slug-clash error, option A: reuse of approved row 8 | Unable to complete the request. Please try again. | تعذّر إتمام الطلب. حاول مرة أخرى. | 49 | 33 | REUSE of approved row 8, no new string (see note 1) |
| P5b | Slug-clash error, option B: new slug-specific text | This slug is already used. Choose another. | المعرّف ده مستخدم قبل كده. اختار معرّف تاني. | 42 | 44 | NEW, PENDING-PO. Choosing it reopens S41-PO-3 MCQ-19 (generic clash error) and changes FR-021 |
| P6 | Financial-resolution category 1 | Refunded outside LIFTER | اتردّ برّه LIFTER | 23 | 17 | NEW, PENDING-PO |
| P7 | Financial-resolution category 2 | Forfeited under the contract | اتحجز حسب العقد | 28 | 15 | NEW, PENDING-PO |
| P8 | Financial-resolution category 3 | Other | حاجة تانية | 5 | 10 | NEW, PENDING-PO |
| P9 | Financial-resolution acknowledgement text | I understand this records the resolution only. LIFTER does not refund, collect or cancel anything. | فاهم إن ده تسجيل للقرار بس. LIFTER مش هتعمل أي استرداد أو تحصيل أو إلغاء. | 98 | 73 | NEW, PENDING-PO |

## Notes

1. Slug-clash error (MCQ-19 = A says "a clash returns a generic error"). Option A reuses approved row 8 (`packages.unavailable`, `lib/i18n/messages/en.ts`, `ar.ts:111`). It fits the generic-error wording of MCQ-19 and needs no new string. Caveat for the PO: row 8 says "Please try again", which will not succeed until the slug is changed. The PO decides whether that is acceptable. Option B is a new slug-specific message (P5b); choosing it reopens MCQ-19's generic-error decision and changes FR-021, so it is a PO decision and not a reading of MCQ-19. The same choice (row 8 or a new message) applies to a slug rejected for format or length; P4 is the hint shown before submission.
2. Category labels (P6 to P8) are the three examples of S40-F11-MCQ-18 option A: "refunded outside LIFTER", "forfeited under the contract", "other". The PO may change the set and the labels. The label "Refunded outside LIFTER" records a fact the PO enters; it is not a refund record. It creates no refund, ledger, collection, correction or cancellation row (011 FR-025; spec 013 FR-014 and FR-018 are not used).
3. The acknowledgement text (P9) is the explicit acknowledgement required by MCQ-18 = A. It is stored only in the append-only audit event with account reference, actor and time.
4. Row P2 (page title) repeats P1 by design. If the PO wants a different page title, that is a new PENDING-PO string.
5. No copy is proposed for the slug format error beyond P4 (the hint) and P5 or P5b (the clash). No duplicate-name message is proposed (no duplicate rule for workspace names is in any approved record; `workspaces.slug` is unique at `supabase/migrations/20261027120000_tenancy.sql:13`).
6. Blocked until approval: the navigation and page-title assertions and the slug label and hint in T051 and T056; the category and acknowledgement UI and record in T059. Approved rows 1-9 are not blocked.

## Options for PO (S41 copy batch)

- A) Approve P1 to P4, P5 (reuse of row 8), P6 to P9 byte-exact as drafted. Recommended.
- B) Approve as A but choose P5b for the slug clash instead of P5. Choosing P5b reopens S41-PO-3 MCQ-19 (the clash returns a generic error) and changes FR-021; it is the PO's decision.
- C) PO supplies other exact EN and AR strings for any row; the rows not supplied stay PENDING-PO.

Implications: A allows T051, T056 and T059 to encode these strings once they are approved byte-exact. B adds a clash-specific message. C delays the rows the PO changes. In every option, nothing is encoded until the PO approves byte-exact.
