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
| P4 | Slug format hint (lowercase a-z, 0-9, hyphen) | Use lowercase letters, numbers and hyphens only. | استخدم حروف إنجليزية صغيرة وأرقام وشرطة (-) بس. | 48 | 47 | NEW, PENDING-PO |
| P5 | Slug-clash error, option A: reuse of approved row 8 | Unable to complete the request. Please try again. | تعذّر إتمام الطلب. حاول مرة أخرى. | 49 | 33 | REUSE of approved row 8, no new string (see note 1) |
| P5b | Slug-clash error, option B: new slug-specific text | This slug is already used. Choose another. | المعرّف ده مستخدم قبل كده. اختار معرّف تاني. | 42 | 44 | NEW, PENDING-PO, only if the PO chooses B |
| P6 | Financial-resolution category 1 | Refunded outside LIFTER | اتردّ برّه LIFTER | 23 | 17 | NEW, PENDING-PO |
| P7 | Financial-resolution category 2 | Forfeited under the contract | اتحجز حسب العقد | 28 | 15 | NEW, PENDING-PO |
| P8 | Financial-resolution category 3 | Other | حاجة تانية | 5 | 10 | NEW, PENDING-PO |
| P9 | Financial-resolution acknowledgement text | I understand this records the resolution only. LIFTER does not refund, collect or cancel anything. | فاهم إن ده تسجيل للقرار بس. LIFTER مش هتعمل أي استرداد أو تحصيل أو إلغاء. | 98 | 73 | NEW, PENDING-PO |

## Notes

1. Slug-clash error (MCQ-19 = A says "a clash returns a generic error"). Option A reuses approved row 8 (`packages.unavailable`, `lib/i18n/messages/en.ts`, `ar.ts:111`). It fits the generic-error wording of MCQ-19 and needs no new string. Caveat for the PO: row 8 says "Please try again", which will not succeed until the slug is changed. The PO decides whether that is acceptable. Option B is a new slug-specific message (P5b), needed only if the PO wants the clash named.
2. Category labels (P6 to P8) are the three examples of S40-F11-MCQ-18 option A: "refunded outside LIFTER", "forfeited under the contract", "other". The PO may change the set and the labels. The label "Refunded outside LIFTER" records a fact the PO enters; it is not a refund record. It creates no refund, ledger, collection, correction or cancellation row (011 FR-025; spec 013 FR-014 and FR-018 are not used).
3. The acknowledgement text (P9) is the explicit acknowledgement required by MCQ-18 = A. It is stored only in the append-only audit event with account reference, actor and time.
4. Row P2 (page title) repeats P1 by design. If the PO wants a different page title, that is a new PENDING-PO string.
5. No copy is proposed for the slug format error beyond P4 (the hint) and P5 or P5b (the clash). No duplicate-name message is proposed (no duplicate rule for workspace names is in any approved record; `workspaces.slug` is unique at `supabase/migrations/20261027120000_tenancy.sql:13`).
6. Blocked until approval: the navigation and page-title assertions and the slug label and hint in T051 and T056; the category and acknowledgement UI and record in T059. Approved rows 1-9 are not blocked.

## Options for PO (S41 copy batch)

- A) Approve P1 to P4, P5 (reuse of row 8), P6 to P9 byte-exact as drafted. Recommended.
- B) Approve as A but choose P5b for the slug clash instead of P5.
- C) PO supplies other exact EN and AR strings for any row; the rows not supplied stay PENDING-PO.

Implications: A allows T051, T056 and T059 to encode these strings once they are approved byte-exact. B adds a clash-specific message. C delays the rows the PO changes. In every option, nothing is encoded until the PO approves byte-exact.
