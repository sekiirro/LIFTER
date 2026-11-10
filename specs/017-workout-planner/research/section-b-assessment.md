# Section B assessment — GPT suggestions (NOT PO decisions)

**Status**: spec-only draft (S42). Section B of `runs/s42-po/f17-f18-po-decisions-source.md:83-96` is explicitly "GPT suggestions / verification tasks (NOT PO decisions)". This file records an independent accept / modify / reject for each item. No Section B item is encoded as a requirement, default or test expectation.

Legend: **ACCEPT** = the verification/design instruction is followed; **MODIFY** = followed but not in GPT's proposed shape; **REJECT (scope)** = belongs to another feature or is not F17; **REJECT (content)** = technically or contractually wrong.

| # | GPT item (short) | Verdict | Reasoning | Encoded as |
|---|---|---|---|---|
| B1 | Default-set initialization: F16 has no set counts; confirm how empty/unspecified set rows initialize; ask PO if material | **ACCEPT (as question)** | Confirmed live: F16 has exactly eight fields, and defaults are exactly Rest/RIR/Reps (`specs/016-exercise-food-catalogs/spec.md:116,154`); PO A1 forbids inventing set counts. Set-row initialization materially changes the product, so it is an MCQ, not a design choice. | F17-MCQ-1; FR-007; T004/T031 blocked |
| B2 | Template assignment semantics: minimal durable state for never / intentionally partial / own-templates-only; decide version changes, exclusions, retries | **MODIFY** | Accepted: one durable per-workspace flag plus run/item/copy ledgers, copy-only writes, per-workspace lock, replay/conflict. Rejected: deciding version-change and zero-copy behaviour ourselves — both are product choices. Own-templates-only is settled by the literal A2 words, not a new decision. | `data-model.md` §5; FR-011; F17-MCQ-3, F17-MCQ-4 |
| B3 | Template policies: verify old D17-3/D18-1 against A2, private refs, copy semantics, promotion; do not assume old global read rules | **ACCEPT** | Verified: D17-3 ownership survives; the global-read model does not. Promotion is a separate copy (A2). Workspace-private references cannot be carried into global scope (A2), but the exact handling is a PO choice. | FR-008, FR-012; `research/conflicts.md` C-10..C-16; F17-MCQ-5 |
| B4 | Nutrition selection arithmetic, source-vs-selected export, stale alternative IDs, TS/SQL parity | **REJECT (scope)** | This is F18 nutrition. F17 has no macros, quantities or nutrition alternatives. Assessing it here would duplicate another feature's decision surface. | Not encoded; F18 owns it |
| B5 | F16 snapshot compatibility: replace V1/variation with V2/effective workspace-private resolution; non-video frozen, Video live | **ACCEPT** | Verified live: F16 FR-020/026/027, SC-009/011, `ExerciseSnapshotV2`; legacy variations are deleted at cutover. | FR-003, SC-011; `research/conflicts.md` C-05..C-09 |
| B6 | Publish/delivery/expiry boundaries: latest F19 contract, F13/P4 restrictions, no first-delivery-only visibility, direct publish, no draft prerequisite | **ACCEPT** | Verified: F19 is a **pending PR**, so all lifecycle statements are cited as pending. Direct publish is PO A3. Publish is refused without a current subscription (S42-PO-4 MCQ-12 = C). Expiry/visibility belong to F19/P4; F17 adds no exemption. | FR-015, FR-025; SC-006; `research/conflicts.md` C-01..C-04, X-04..X-07 |
| B7 | Export design: complete PDF/Excel/AI-prompt content and links, version selection, secure handling, no formula injection, AR/EN + RTL; separate UI product choices from engineering detail | **ACCEPT** | Engineering detail encoded (published-revision-only, audit, injection guard, live video). Product-visible choices are not guessed: role, exact prompt text/language, AR/EN layout and name fallback. | FR-017..FR-019; F17-MCQ-6/7/8 |
| B8 | Revalidate hardcoded Worker CPU/storage/document-size assumptions; prefer evidence-backed constraints; keep reliability/authorization gates | **ACCEPT** | Confirmed the old numbers are unsourced in current evidence (historic SC-005). Held as provisional targets only; no new numbers invented; re-benchmark task defined. | FR-022, SC-014, T050 |
| B9 | Prior evidence reuse: assess debate rounds, tests, partial UI/TS and branches as references; specify what is retainable; no whole-branch cherry-picks | **ACCEPT (restricted)** | Branch tips verified (`sk-017` `86a763cb`, `017-workout-planner` `fd84fbaa`, `017-t037-templates` `7743aee3`). Wording and test intent may inform; evidence does not carry to this draft, and no code/test/migration is copied. | `plan.md` §10; `traceability.md` §4 |
| B10 | New MCQs in one batch with preference, tradeoffs, affected features | **ACCEPT** | Nine genuinely unresolved choices batched with options, implications, recommendation and blocked work. Where PO words already settle a point (own-templates-only; 0.5 secondary credit; current-subscription publish gate), no MCQ was raised. | `spec.md` §8.5 |

## Points where Section B is explicitly not followed

1. **B2's invitation to "decide" version changes / exclusions / retries.** Retry and concurrency mechanics are engineering and are specified; the *product-visible* outcomes (zero-copy marking, newer-version behaviour) are MCQs. Deciding them would violate the Absolute PO Decision Rule.
2. **B4's nutrition scope.** Out of F17; not assessed to avoid cross-feature speculation.
3. **B7's "separate UI behaviour requiring PO approval"** is honoured by leaving layout/labels unapproved rather than drafting candidate strings. No Arabic string is retyped anywhere in this draft.
4. **B8's "prefer evidence-backed constraints"** is honoured by *not* replacing the old numbers with different invented ones; the only correct action before a benchmark is to hold them provisional.

## Items reviewed and found already settled (no MCQ)

- Secondary-muscle 0.5 credit: PO A3 and D17-1=A (main register).
- Publish without prior Save as Draft: PO A3.
- Publish without current subscription: S42-PO-4 F19-MCQ-12 = C (pending F19).
- Own-templates-only workspace eligibility for All Workspaces: literal PO A2 wording.
- PO-only global template management and assignment: PO A2.
- Separate-copy promotion retaining the original: PO A2.
- Frozen non-video values and live Video: F16 FR-020/027, SC-009/011.
