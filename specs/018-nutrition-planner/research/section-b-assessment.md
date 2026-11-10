# Section B assessment — GPT suggestions as they apply to F18

**Source**: `C:/Users/NEW LAP/.lifter/runs/s42-po/f17-f18-po-decisions-source.md:83-96`. Section B is explicitly **not binding**; each item is evaluated independently and never encoded as a requirement without a PO decision or a demonstrated technical necessity. Item 1 (planner default sets) is F17-only and is not assessed here. Item 10 (new MCQs) is answered by F18-MCQ-1..6.

## Item 2 — Template assignment semantics

**GPT proposal**: propose the minimal durable state distinguishing (a) never assigned, (b) intentionally assigned a partial subset, (c) workspace-created templates with no global assignment; decide how Specific Workspaces handles previously distributed templates, version changes, exclusions and retries without duplication or overwrite.

**Assessment**:

- The suggested third state (c) is already covered by (a) under the PO wording: A2 (`:40`) says a workspace starts with nothing distributed, and only an assignment delivers templates. A workspace that authored its own templates has still "never received a global-template assignment". Making (c) a separate state would create a fourth behaviour with no PO source.
- The minimal durable state is therefore two derived facts, not a stored enum: `has any successful assignment item for the nutrition collection` (initialized) and `has any retained copy originating from global template T` (skip on Specific, including a retired copy). Initialization is derivable from immutable batch items; copy identity is derived from the workspace template's origin metadata. A separate state table would have to be kept consistent with them and could contradict them after a failed batch.
- "Previously distributed individual templates" and "exclusions" are handled by the per-target outcome (`skipped_existing`, `assigned`, `skipped_ineligible`) and by the template set modes (`all`, `specific`, `all_except`).
- "Version changes" is the one genuine gap. A2/Q1=A say re-assignment never duplicates or overwrites, but not what to do with a newer global version. S43-PO-1 later resolves this: skip and report any held copy regardless of source version.
- "Retries without duplication" is solved by the shared operation-key ledger plus the unique `(workspace_id, origin_global_template_id)` constraint, independent of source version and status. Retired copies remain retained and count as already held.

**Verdict**: ACCEPT-WITH-CHANGES. Adopt (a)/(b) as derived state; reject (c) as a separate state; escalate the newer-version axis.

**Encoded**: F18-FR-008, `data-model.md` §5, `contracts/template-assignment.md`, F18-SC-007.

## Item 3 — Template policies (old D17-3/D18-1) vs the new assignment rules

**GPT proposal**: verify old governance against the new PO assignment rules, workspace-private reference constraints, copy semantics and PO promotion; do not assume old global-read rules.

**Assessment**:

- The old global-read rule is genuinely superseded: `origin/sk-018` T012 evidence says global templates are visible to readers, while A2 makes workspaces receive only independent copies. Any implementation or test built on the old rule must be discarded (conflicts F18-C-02).
- "Workspace-private references" has a narrower meaning for nutrition than for exercises: F16 has no workspace-private food identities, so the private content to exclude is **client data, client-specific values, workspace metadata and internal ids** in names, notes, labels, URLs and suspicious values. The Make it Global validator checks those fields (F18-FR-007).
- Copy semantics are unambiguous in A2: independent, branded, no live link, no edit propagation in either direction.
- PO promotion is explicitly a **separate copy** that retains the original; it is not a move or a re-parent.

**Verdict**: ACCEPT. The old read model is dropped, the copy model is encoded, and the private-content definition is narrowed to what F16 actually permits.

**Encoded**: F18-FR-007, F18-FR-009, F18-SC-009, conflicts F18-C-02/C-03.

## Item 4 — Nutrition selection arithmetic and stale/unauthorized ids

**GPT proposal**: define exact displayed totals by chosen alternative, source-vs-selected export representation, stale/unauthorized alternative protection, and verify F16 snapshot/equivalence plus TS/SQL parity.

**Assessment**:

- Totals are fully defined by D4 plus F16 scales: exact intermediates, half-up final canonicalization with full internal precision, aggregates from exact values. The selected alternative uses the same function with its own exact version and the coach-specified portion (F18-FR-012).
- S43-PO-1 later resolves the layout: selection primary with a labelled coach-original per-item side note; S43-PO-2 resolves S43-MCQ-B: the prompt includes the per-item coach-original note and totals rows contain client-selection totals only. The projection returns both sides separately so no renderer can silently choose (matrix R7).
- Stale/unauthorized ids: an alternative id that is not in that item's list in that immutable revision is decidably invalid without a catalog lookup. Foreign client, wrong plan/version, expired subscription and forged tuples all fail generically (F18-FR-011, contract §4).
- The more subtle stale case is a selection racing a publish. The plan-root lock plus current-revision recheck gives one deterministic outcome; the client retries with a new key on `stale_version`.
- F16 verification uncovered two real constraints the suggestion did not anticipate: one `FoodSnapshotV1` freezes one serving (so the map is keyed per serving unit), and the live TS type is `number` (so exact transport needs fixed-scale parsing/serialization). Both are technical, not PO.

**Verdict**: ACCEPT-WITH-CHANGES. Encode the arithmetic, protection and parity; escalate the export layout; add the per-serving snapshot and fixed-scale transport findings.

**Encoded**: F18-FR-003/005/012/013, F18-SC-001/005/008, conflicts F18-C-04..C-07, data-model §2.

## Item 5 — F16 snapshot compatibility

**GPT proposal**: replace obsolete `ExerciseSnapshotV1`/`variation` assumptions with the approved F16 V2/effective-workspace resolution; frozen non-video content, live video; food snapshots, serving conversions and version-scoped selectors must match F16 final contracts.

**Assessment**:

- For food, the V1 name is correct and in use (`lib/catalog/snapshot.ts`), so "replace V1" would be wrong for F18; `ExerciseSnapshotV2` is an F17 concern. F18 assumes no `variation` table.
- Food snapshots freeze the **exact** referenced immutable version and per-100 values (F16 FR-020). Remove/merge does not rewrite a published plan; new selection resolves to the F16 terminal (F16 FR-010/FR-011).
- Serving conversions are same-basis only, positive, with `numeric(12,3)` on main. No cross-basis conversion exists, so an `ml` request against a `g` version is a hard rejection.
- Version-scoped selectors: the plan document stores `(foodId, version)` and a unit key; there is no "latest" reference. A draft may legitimately reference an older version; publish freezes that exact version.
- Live video is F16 exercise-only; nutrition recipe links are D18-6 and are not resolved through F16's video resolver.

**Verdict**: ACCEPT-WITH-CHANGES. Keep `FoodSnapshotV1`, add the per-serving keying and exact-version rules, reject any V2/variation import.

**Encoded**: F18-FR-005, data-model §2, conflicts F18-C-05/C-13.

## Item 6 — Publish, delivery and expiry boundaries

**GPT proposal**: verify F19's latest published contract and F13/P4 restrictions (first vs later plans, no first-delivery visibility bottleneck, draft security, direct publish without Save as Draft, accurate attribution).

**Assessment**:

- The pending F19 spec already answers these; F18 must not restate or fork them. Verified against the pending text: stable private draft, direct Ready & Publish, every delivered plan visible, no published-without-delivery (S42-PO-4 MCQ-12 C), activation once after both first kinds, later plans/revisions never reactivate, returning clients never count as new, and renewals add no unit under S43-PO-5 item 7 (architect mapping (S43-R8)), expiry blocks content.
- The one F18-specific risk is a stale historic sentence: old F18 FR-001 delegated to "PC-FR-001..007" and old tasks implied an independent nutrition publish path. Both are dropped.
- Draft security and direct publish are pure F19 concerns; F18 only validates nutrition content on save and requires the F19 precondition before building snapshots.
- Attribution: F18 keeps contributor attribution (PRD-06) but does not own assignment, activation recipient or productivity. The F19 recipient rules are consumed, not reimplemented.

**Verdict**: ACCEPT. Confirmed by reference; no F18 rule added beyond "never publish outside the F19 path".

**Encoded**: F18-FR-001, F18-FR-010, US4, conflicts F18-C-01/C-09/C-11.

## Item 7 — Export design

**GPT proposal**: verify complete PDF/Excel/AI-prompt content and links, version selection and client-selected alternatives, secure/private handling, no formula injection, proper AR/EN and RTL; separate PO-approval UX from engineering detail.

**Assessment**:

- Content completeness is directly required by A5 Q2/Q3 and F18-FR-014/015; version selection is "one selected published revision".
- Client-selected alternatives: Q2=A decides that exports/projections distinguish coach original vs selection; S43-PO-1 decides per-item layout and S42-PO-8 decides prompt selection/totals; S43-PO-2 resolves the remaining format reach: the copied prompt includes the per-item coach-original note; totals rows are client-selection totals only.
- Privacy: both walls before any read, one audit event per success and denial, no content in audit. Prompt text is copied outside the platform, which is why the actor is decided as export-authorized staff; prompt body is approved byte-exact in the feature-local contract (S43-PO-5).
- Formula injection is engineering: write coach cells as text and test `=`, `+`, `-`, `@`.
- AR/EN and RTL are design-gate obligations with rendered evidence, not copy approval.
- The split is clean: layout/prompt wording/actor are PO; renderer, escaping, RTL and authorization are engineering.

**Verdict**: ACCEPT-WITH-CHANGES. Encode the engineering guarantees; hold the product-facing pieces as MCQs.

**Encoded**: F18-FR-014/015, F18-SC-005, contracts `nutrition-api.md` §6, tasks T023/T024.

## Item 8 — Old performance and structure constraints

**GPT proposal**: revalidate hardcoded Worker CPU/storage/document-size assumptions and old overengineering; prefer evidence-backed constraints; keep reliability and authorization gates.

**Assessment**:

- The old SC-006 numbers were unstable even inside the historic debate (p95 ≤ 8 ms changed to ≤ 5 ms; the R10 note admits the change). Adopting them would encode an unmeasured target.
- The correct requirement is process, not a number: define the envelope (bytes, meals, items, alternatives, request mix), measure it on the merged stack, record bytes per revision/template, and replace provisional numbers with evidence (F18-SC-006).
- Structural overengineering to drop: the old paired-publish transaction and the outbox/retry branch are gone with F19's approved atomic design; old "PC-FR" numbering is gone; old migration reservation is gone.
- Authorization/reliability gates are unaffected and remain hard requirements.

**Verdict**: ACCEPT. Provisional numbers are explicitly labelled and not acceptance criteria.

**Encoded**: F18-SC-006, plan.md §10, tasks T021.

## Item 9 — Prior evidence reuse

**GPT proposal**: assess historic debate rounds, tests, partial UI/TS implementation and branches as reference only; specify what can be retained or adapted and where new tests are needed; avoid branch cherry-picks.

**Assessment**:

- **Safely reusable as reference**: the macro/display split (calculation vs presentation), the display formatter behavior and its test intent, the document invariants, the alternatives UI accessibility patterns (keyboard move, live totals, AR/EN RTL, unavailable/retired states), the template manager role/pagination patterns, and the negative-test taxonomy.
- **Not reusable**: any table/column design (old plan roots, `subscription_id`, old version tables), any lifecycle/publish/outbox code, any test asserting global-template reads by non-PO, any test expecting integer-only macros, any task tick or "complete" status, the old migration range, and any code copy from `018-nutrition-planner`/`sk-018`.
- **New tests required**: per-serving snapshot build, publish caller-data ignore against the F19 transaction, selection/carry-forward races, assignment all/specific/exclude state machine, Make it Global refusal with field codes, cross-feature negatives (nutrition vs workout initialization), prompt fidelity, export selection distinction, and the re-benchmark.
- No whole-branch cherry-pick is proposed; this draft contains no code.

**Verdict**: ACCEPT. Reuse the reasoning and test taxonomy, rebuild everything that touches lifecycle, schema or copy.

**Encoded**: `research/po-decision-matrix.md` E, conflicts F18-C-14/C-16, tasks T001–T027 (all new IDs, no inherited completion).

## S43 decision updates

S43-PO-1 resolves the former F18-MCQ-1/3/6 conflicts: selection is primary with a coach-original per-item side note, rounding is half-up with full internal precision, and any held template copy is skipped/reported. S42-PO-8 resolves prompt selection/totals and actor rights. S43-PO-5 approves the prompt body; S43-PO-2 resolves S43-MCQ-B: per-item note in prompt, client-selection totals only.
