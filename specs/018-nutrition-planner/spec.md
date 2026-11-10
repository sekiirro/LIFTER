# Feature Specification: F18 Nutrition Templates & Nutrition Planner

**Feature Branch**: `speckit-018-nutrition-planner-s42`
**Phase**: P3 (roadmap) — Specify → Clarify → Plan → Tasks → Analyze (spec-only draft)
**Status**: S42 spec-only draft rebuilt from `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`. No implementation, migration, UI, test or runtime change is authorized by this artifact. Open product questions are listed in `## Clarifications` and block only the work named there.
**Input**: PRD-05, PRD-06, PRD-12; F16 final food contracts; F13 entitlement; PO Section A (A2, A5 Q1–Q4, A6, A7); S42-PO-2..S42-PO-6; pending F19 Plan Core.

## Purpose and scope

F18 owns nutrition content and nutrition-only governance:

- the nutrition document schema (single-day or seven-day, day types, conditional meals, meals, foods, coach alternatives, notes, optional recipe/preparation link);
- one exact decimal macro/total algorithm with TypeScript/SQL parity;
- publish-time snapshot rebuild and server-side recomputation for nutrition revisions;
- global and workspace nutrition templates, PO-only manual Assign, and PO-only Make it Global;
- the client's coach-approved alternative selection (version-scoped, self-only) and the client-visible recalculation it produces;
- PDF, Excel and `Copy Prompt for AI` nutrition export content.

F18 does **not** own plan identity, drafts, revisions, delivery, activation, productivity units or the client projection. Those are the pending F19 Plan Core contract. F18 consumes them and supplies nutrition domain content, nutrition validation and nutrition export.

## Authority and source priority

Highest first. PO words are quoted byte-exact in `## Clarifications`; architect mappings are labelled as such and never merged into PO quotes.

1. `C:/Users/NEW LAP/.lifter/runs/s42-po/f17-f18-po-decisions-source.md` Section A — binding PO decisions (A5 Q1–Q4 F18-specific; A2 assignment model referenced by Q1; A6 shared F19 context; A7 environment). Section B is GPT suggestion, **not** a decision.
2. `C:/Users/NEW LAP/.lifter/runs/s42-po/s42-po-1.verbatim.txt` — S42-PO-2..S42-PO-6; pending F19 spec `C:/Users/NEW LAP/Desktop/LFTR-s42-f19/specs/019-plan-core/` (read-only, not merged; cited as pending; F19 lifecycle/delivery/activation rules are referenced, never duplicated).
3. `origin/main` d0c5d1ac — Constitution; `docs/04-changes-and-questions.md:93-95` (S20-17..S20-19); `specs/016-exercise-food-catalogs` (FR-005, FR-006, FR-012, FR-020, FR-033, plan.md:38, plan.md:89, data-model.md:40, data-model.md:47); `specs/013-freeze-renewal-refunds` (FR-005, FR-013, FR-033, SC-012); `docs/01-traceability.md:37,64`; `docs/03-roadmap.md:63-65`.
4. S27-PO-2, quoted from `git show origin/sk-018:specs/018-nutrition-planner/S27-decimal-evidence.md:3`. This refines D18-4=C but is **not** recorded in `docs/04` on main: register gap, not repaired here.
5. Historic reference only (reuse valid wording, never superseded assumptions, never copy code): `origin/sk-018` spec/plan/tasks/debate/traceability/analyze and T011/T012/T014/T021/S27 evidence; `origin/018-nutrition-planner`.

## User Scenarios & Testing

### US1 — Build and edit a client nutrition plan (P1)

A Trainer, Workspace Owner (WO) or Platform Owner (PO) builds one nutrition plan for a client in the plan's workspace: meals with foods in exact quantities (basis g/ml or a declared serving unit), per-meal notes, optional recipe/preparation link, computed meal and day calories/macros, and either a single repeating day or a seven-day structure with day types (carb cycling, training vs rest days, conditional pre-workout meal omitted on rest days).

**Independent test**: build a seven-day plan with high/low-carb day types and a `training_days_only` pre-workout meal; assert per-meal and per-day totals equal the golden-fixture values for the exact referenced food versions and quantities, that rest days omit the conditional meal, and that a unit the food version does not declare is rejected.

1. **Given** an approved client in workspace A and acting staff with current `coaching_work` in A, **When** staff add a food with a positive quantity and a declared unit, **Then** item values derive from the exact referenced food version's per-100 values and that unit's exact basis equivalent, using exact decimal arithmetic with no intermediate rounding, and meal/day totals are derived from exact item values (never by adding already-rounded item values).
2. **Given** a food version whose basis is `g` and which declares no `ml` serving, **When** staff enter `ml`, **Then** the entry is rejected with a field error and no cross-basis conversion is guessed.
3. **Given** a seven-day structure with day types, **When** a meal is `training_days_only`, **Then** it appears only on days whose resolved day type has `trainingDay = true`; a `training_days_only` meal with no reachable training day is a draft warning and is rejected at Ready and at publish.
4. **Given** day types with no calorie/macro targets, **When** the plan is saved or published, **Then** totals are still calculated (D18-2=A: targets optional, totals always calculated).
5. **Given** a food version with an optional recipe/preparation HTTPS YouTube or Google Drive link, **When** the plan is rendered or exported, **Then** the link/icon is shown; **When** the link is absent, **Then** the link and its icon are entirely hidden (D18-6).
6. **Given** reorder, duplicate meal/day or move food, **Then** quantities, alternatives and notes are preserved exactly; a duplicate remaps its own and all descendant ids and inherits no client selection.
7. **Given** a stale draft save, **Then** it is rejected as `stale_version` with no partial write (F19 contract).

### US2 — Coach-configured manual alternatives (P1)

For a food item, staff configure manual alternatives from existing food catalog entries, each with a validated portion quantity and calculated macros, presented as one unified list (no strict/functional split).

**Independent test**: configure two alternatives for one item; assert each alternative's macros derive from its own exact food version and portion, the published revision stores one unified list, and a fourth alternative is refused.

1. **Given** an item, **When** staff add an alternative with a validated positive portion, **Then** its macros are calculated by the same algorithm; nothing auto-adjusts quantities and no alternative is AI-generated or invented.
2. **Given** three alternatives already on one item, **When** a fourth is added, **Then** the write is refused (at most three; retained from the PO-approved F18 spec and S20-13).
3. **Given** an alternative whose food was removed or merged in F16 after publication, **When** the published revision is read, **Then** the frozen alternative and its values are returned unchanged; the removal/merge never rewrites the plan. **When** a draft opens, **Then** an "unavailable" indicator is shown and stored draft values are not silently substituted.
4. **Given** a food merged in F16, **When** staff choose a food for a new item or alternative, **Then** the catalog resolves to the active terminal identity as F16 defines; no alias chain is stored in the plan document.

### US3 — Global and workspace nutrition templates with PO Assign (P1)

The PO manages canonical Global Nutrition Templates. Workspaces receive **independent, workspace-owned, workspace-branded copies** only through a PO-only manual Assign operation. Authorized workspace staff manage their workspace templates. The PO may Make it Global from an eligible workspace template as a separate copy.

**Independent test**: create two workspace-A nutrition templates and version one; workspace B lists and loads neither. Run Assign for one global template to workspace A; A receives one editable copy, B receives none. Re-run Assign to A; no duplicate and no overwrite. Create a third workspace C that has never received a nutrition assignment and run Assign → All Workspaces: C receives copies, A and B are skipped. PO runs Make it Global on an eligible A template: a new global identity/version exists and the A original is unchanged.

1. **Given** the PO creates or edits a Global Nutrition Template, **Then** an authorized workspace cannot read the global library, cannot list it, and cannot load it directly; only its assigned workspace copy is loadable (A5 Q1=A + A2 assigned-copy model).
2. **Given** the PO opens `Global Templates → Assign`, **Then** Step 1 offers All Templates, Specific Templates, or All Templates Exclude; Step 2 offers All Workspaces or Specific Workspaces.
3. **Given** All Workspaces is run, **Then** it is a one-time distribution to existing workspaces that have **never received a global nutrition-template assignment**: a workspace that previously received any nutrition templates — including an intentional partial subset — is skipped and is not topped up; a workspace created after the operation receives nothing automatically.
4. **Given** Specific Workspaces is run, **Then** templates the chosen workspace already holds **from the same source version** are skipped, no customization is overwritten, and missing selected templates are copied; intentional partial assignment is distinguishable from an uninitialized workspace. A copy from a different global version is F18-MCQ-6 (open).
5. **Given** an assigned template, **Then** the workspace copy is independent and workspace-branded; edits in the workspace never propagate to the global library or another workspace, and a later global change never changes the copy.
6. **Given** a workspace template with private data or workspace references, **When** the PO runs Make it Global, **Then** the action refuses and names the offending field codes; it never silently strips content; after the PO removes them, a **separate** global identity/version is created and the workspace original remains.
7. **Given** the PO has full management rights, **Then** the PO may view, edit and copy any workspace's nutrition templates, but a copy/promotion into the global collection never carries client data or workspace-private references.

### US4 — Ready, publish revisions, multiple plans, delivery (P1)

The nutrition plan lifecycle, delivery and activation are the F19 contract; F18 supplies the nutrition writer only. A client may hold any number of published, delivered nutrition plans, all visible newest first.

**Independent test**: publish nutrition plan N, edit, publish N+1 (same Plan ID, new immutable revision); unchanged re-publish returns the existing revision; deliver a second nutrition-only plan for the same client; both remain listed and exportable; activation/productivity counts are unchanged by the later plan and by the later revision.

1. **Given** a nutrition plan, **When** staff publish, **Then** the stable Plan ID is unchanged, exactly one immutable revision is appended, and delivery/activation/productivity follow F19 exactly (no F18 lifecycle table, no F18 activation rule).
2. **Given** two published and delivered nutrition plans for one client, **Then** both are visible and exportable; none is auto-archived (PRD-05; F18-FR-010).
3. **Given** the second independent first delivery completes the initial pair, **Then** the F19 transaction activates the subscription exactly once and writes one productivity unit; F18 writes no activation data.
4. **Given** a client with no current subscription, **When** Ready & Publish is attempted, **Then** F19 refuses it and no nutrition revision is published (S42-PO-4 F19-MCQ-12 = "C: Block publishing").
5. **Given** a published-but-undelivered state, **Then** it cannot exist; F18 never publishes outside the F19 delivery path.

### US5 — Client alternative selection and client-visible recalculation (P1)

A client may select one coach-approved alternative per food item in a published nutrition revision. The selection is client-owned, version-scoped state and never mutates the coach-authored revision. Client-visible calories and macros — item, meal and day totals — recalculate for the selected alternative and the coach-specified quantity of that alternative.

**Independent test**: as the client, select alternative 2 (different food, own quantity) of item X in revision N; assert the source revision bytes are unchanged, one selection row exists for revision N/item X, item/meal/day totals equal the golden values for alternative 2, an id not in that item's list is rejected generically, a foreign client or forged plan/revision/client combination is refused, and direct table DML is denied. Then publish revision N+1 with the same item and alternative ids and assert the selection is carried forward; publish N+2 without the item and assert no selection row exists and the coach default applies.

1. **Given** a published, delivered revision and an authorized client, **When** the client selects a listed alternative, **Then** the client-visible calories/macros for that item, its meal and its day recalculate from the alternative's exact food version and the coach-specified quantity; the coach-authored revision remains immutable (A5 Q2=A).
2. **Given** the same revision and a client with no authorization, an expired subscription, a foreign client id, or a stale revision, **Then** the request is refused generically and writes nothing.
3. **Given** an alternative id that is not in that item's approved list in that revision, **Then** the request is refused generically; no partial or inferred selection is stored.
4. **Given** a client selection and an export, **Then** the export distinguishes the coach original from the client's currently permitted selection and shows the recalculated totals; the staff editor keeps showing the coach-authored plan only (F18-FR-013). The export layout is F18-MCQ-1 (open).
5. **Given** the client clears the selection, **Then** the coach default applies again and the clear is audited.
6. **Given** a newer revision, **Then** a selection carries forward only while the client remains authorized and the same stable item id and approved alternative id both exist; otherwise no selection is written for the new revision and the coach default applies (D18-9=A).
7. **Given** any selection, **Then** it never creates a plan, never affects another client, and never changes the immutable revision (S20-19).

### US6 — Export: PDF, Excel and Copy Prompt for AI (P2)

Staff export one selected published nutrition revision as PDF or Excel, or copy an AI-ready prompt. Every export is authorized at both walls, audited, bilingual/RTL-correct and injection-safe.

**Independent test**: export the same revision as PDF, Excel and prompt with and without a client selection; assert golden AR/EN artifacts, formula-injection resistance, that the coach original and the permitted selection are distinguishable as F18-MCQ-1 decides, and that the prompt reproduces every meal, food, quantity/unit, macro value, alternative, note and recipe/preparation link without adding or changing content.

1. **Given** a published revision and authorized staff, **When** an export runs, **Then** both authorization walls are checked before any read and exactly one export audit event is written.
2. **Given** coach-authored text that begins with `=`, `+`, `-` or `@`, **When** Excel is written, **Then** the cell is written as text and the formula is not executed.
3. **Given** a client selection, **Then** the export distinguishes the coach original from the client's currently permitted selection and shows the recalculated totals; the layout is F18-MCQ-1 (open).
4. **Given** `Copy Prompt for AI`, **Then** the prompt contains the complete nutrition plan — meal/day organization, foods, quantities/units, calories and macro totals, authorized alternatives, notes, preparation/recipe information and links — and instructs the receiving AI to format faithfully without inventing meals, adjusting amounts, or replacing coach-selected alternatives (A5 Q3=A).
5. **Given** an unauthorized, foreign-workspace or expired actor, **Then** every export path denies before reading content and still writes one denial audit event.
6. **Given** AR-first RTL and EN-LTR, **Then** both artifacts render correctly, digits and separators follow the existing locale helpers, and no trainer-authored text is machine-translated.

## Edge cases

- A food version has no serving unit for the entered unit → reject; never convert (F16 FR-005, F18-FR-004).
- Two items use the same food version with different serving units → the published snapshot map must hold one entry per (food version, serving unit); one snapshot cannot serve both.
- Zero-calorie foods, very small portions and values below the 10 g display threshold → exact stored values; display per F18-FR-003 plus F18-MCQ-3.
- Seven-day plan where every day is a rest day → conditional meals never appear; not an error.
- Both day totals equal but target values differ → allowed; no consistency rule between day types.
- Duplicate food/meal allowed inside one plan (S20-11); the duplicate has new ids and no inherited client selection.
- A merged/removed food after publication → published revision unchanged; new selection resolves to the F16 terminal; the draft shows an unavailable indicator without substitution.
- Maximum document envelope (meals/items/alternatives/bytes) → provisional until re-benchmarked (F18-SC-006).
- Concurrent selection and publish on one plan → serialized by the F19 plan-root and subscription locks plus F18 row locks; one deterministic outcome, retry with a new operation key after a stale-version conflict.
- A client with several delivered nutrition plans, some with selections → each revision's selection is scoped to that revision; no cross-plan bleed.
- A workspace with its own nutrition templates but no global assignment is still "never received a global nutrition-template assignment" for All Workspaces.
- A retired global template → not offered by Assign and not loadable for new plans; existing plans/copies unchanged.
- A template assignment retried with the same operation key → the original batch result is returned; no duplicate copies.
- A PO Make it Global on content containing client identifiers → refuse with field codes; never strip.

## Functional Requirements

- **F18-FR-001 — Lifecycle delegation.** Nutrition plans MUST use the F19 stable-identity, private-draft, immutable-revision, Ready & Publish, delivery and activation contract. A nutrition plan root carries `workspace_id` and `client_id` and **no subscription reference**; any subscription association is created only by a F19 `plan_deliveries` row. F18 owns nutrition content only and MUST NOT create a second lifecycle, delivery, activation or productivity path. (Pending F19-FR-001/002/004; S20-20; S42-PO-2 architecture; S42-PO-4 MCQ-12.)
- **F18-FR-002 — Nutrition document schema v1.** The document MUST define: `single_day` = exactly one implicit day, no `days` array, and an always-required `implicitDayTypeId` resolving to a day type; `seven_day` = `dayIndex` 0–6 each exactly once with every `dayTypeId` resolving; day types with AR/EN name, `trainingDay` flag and optional calorie/macro targets; document/day-type/meal/item/alternative ids unique within the document; every meal reachable by at least one day; `conditional` in `always` \| `training_days_only`; ordered items each referencing one exact food identity + version and a positive quantity `{value: decimal string, unit}`; per-item coach alternatives (food identity + version, positive quantity, unit); per-meal note; optional recipe/preparation HTTPS link; exact per-item/per-meal/per-day computed-totals shapes. A `training_days_only` meal with no reachable training day is a draft warning and is rejected at Ready and publish. App and RPC validators MUST accept/reject the same frozen fixtures. Plan quantities live in the document; `FoodSnapshotV1` carries only per-100 nutrient values and the referenced serving equivalents — the two are distinct. (D18-2=A; D18-6; retained F18 FR-002.)
- **F18-FR-003 — Canonical macro and total algorithm.** There MUST be one canonical algorithm with exact decimal arithmetic and no intermediate rounding: item value = per-100 snapshot value × basis quantity ÷ 100, using only the referenced food version's declared serving equivalences. Quantities, targets, totals and all transport values MUST be decimal strings, never JavaScript numbers. Inputs use the live F16 fixed scales: per-100 `kcal numeric(7,1)` and protein/carbohydrate/fat/fiber `numeric(7,2)`; serving `basis_qty numeric(12,3)`; plan quantity ≤ 3 decimals. Stored computed values are the exact result rounded **once** to 4 decimals (`numeric(12,4)`, half-even) and serialized as fixed-scale strings; values outside that range are rejected. Aggregates MUST be derived from exact item values, not from already-rounded item values. Display: calories as integers; protein/carbohydrate/fat grams below 10 g with one decimal and at or above 10 g as integers (D18-4=C refined by S27-PO-2); display rounding never changes stored values. The exact display rounding mode at the threshold/ties is F18-MCQ-3 (open). TypeScript (UI, export, prompt) and SQL (publish, projection) MUST pass one identical golden fixture set. (F16 plan.md:38; F16 migration `20261106093000` lines 2–33; retained F18 FR-003.)
- **F18-FR-004 — Unit conversion.** Only serving units declared by the referenced food version and the food's own basis are valid. An undeclared unit, a cross-basis request (g↔ml without a same-basis declaration) or a non-positive quantity MUST be rejected with a field error and no write. No implicit conversion, density guess or heuristic is permitted. (PRD-05 acceptance; retained F18 FR-004.)
- **F18-FR-005 — Publish rebuilds snapshots and totals.** The publish path MUST ignore caller-supplied snapshots, per-item values and totals; load every referenced exact F16 food version (items and alternatives), rebuild `FoodSnapshotV1` from those immutable versions, recompute every value and total in the database by the canonical algorithm and store only the database result in the immutable revision. The snapshot map MUST contain one entry per referenced (food version, serving unit) pair, because one `FoodSnapshotV1` freezes exactly one serving equivalent (`lib/catalog/snapshot.ts:15-37,164-242`). A missing referenced version fails the publish with no revision. Version rows MUST reject UPDATE/DELETE/TRUNCATE. (F16 FR-005/FR-020; retained F18 FR-005.)
- **F18-FR-006 — Coach alternatives.** Alternatives MUST be staff-configured existing food catalog entries, at most **three per item**, each with a validated positive portion and calculated macros, shown as one unified list. No AI-generated alternative, auto-invented food, auto-adjustment of quantities, or delta-versus-original display is permitted. A removed/merged target keeps its frozen published values and is never silently substituted. (PRD-05; retained F18 FR-006; S20-11/S20-13; PRD-12 exclusions.)
- **F18-FR-007 — Global and workspace nutrition templates.** Global Nutrition Templates are **PO-managed only** and are not readable or loadable by workspaces. Authorized staff (WO/Trainer with current `coaching_work`) create, version, edit and retire workspace-owned nutrition templates in their own workspace. The PO may view, edit and copy any workspace's nutrition templates. The PO may Make it Global on an eligible workspace template: the action validates that no client data, client-specific values, workspace-private references or internal ids remain, refuses with field codes if they do, and on success copies eligible content into a **separate** global identity/version while the workspace original is unchanged. Creator/origin metadata is masked from non-PO actors. Nutrition and workout templates remain separate collections/types. (S20-17/D18-1 amendment; A2; A5 Q1=A.)
- **F18-FR-008 — PO-only manual Assign of nutrition templates.** Only the PO may distribute global nutrition templates, through `Global Templates → Assign` with Step 1 = All Templates \| Specific Templates \| All Templates Exclude and Step 2 = All Workspaces \| Specific Workspaces. All Workspaces is a one-time distribution to existing workspaces that have **never received a global nutrition-template assignment**, affects only workspaces at the time of the operation, skips any previously assigned workspace entirely (no top-up), and never targets future workspaces. Specific Workspaces may revisit a previously assigned workspace and MUST NOT create a second copy of a template version that workspace already holds and MUST NOT overwrite customizations. Assigned templates become independent, workspace-owned, workspace-branded copies. There is no automatic distribution at workspace creation or when a global template is added, no live link, no implicit top-up, no silent reassignment and no overwrite. The operation is a single idempotent batch with one batch audit event; retries return the original result. When a workspace's existing copy came from a **different (older or newer) global version**, the outcome is F18-MCQ-6 (open) and is not asserted. (A5 Q1=A; A2 — quoted in `## Clarifications`.)
- **F18-FR-009 — Template load and version semantics.** Template loading is a **creation-time** copy: staff select a template version while creating a nutrition plan (explicit Create New Plan) or while the draft is empty. Loading copies the exact selected immutable template version's content into the private draft and creates independent destination content with new ids; later template edits or retirement never change the plan, and plan edits never change the template. Replacing or merging a template into a draft that already contains content is **not approved scope** and MUST be refused (no destructive load). Loading never copies ownership, authorship, audit history, client association, delivery or activation facts. Every template keeps its immutable version history; retirement is non-destructive: a retired template is not loadable for new plans, remains visible as history, and existing plans/copies are unaffected. Template lists are paginated at ≤ 50 rows. (Retained F18 FR-007/FR-009; F19-FR-001 and its scenario 2 "may start from a template"; S20-17.)
- **F18-FR-010 — Multiple published nutrition plans.** A client MUST be able to hold any number of published, delivered nutrition plans simultaneously. Every one is visible through the F19 client projection with its dates, newest first, and remains exportable; none is auto-archived or deleted. Later plans and later revisions never activate or credit again. (PRD-05; A6; F19-FR-003.)
- **F18-FR-011 — Client alternative selection.** A client may select at most one coach-approved alternative per item in a **published, delivered** revision. The selection is version-scoped client-owned state keyed by `(workspace_id, plan_version_id, item_id)`, derives client identity from authentication, and is written only through the authorized selection RPC. It MUST NOT modify the coach-authored revision. Identity comes from `auth.uid()`; caller-supplied client/workspace is never authority. The alternative id MUST be in that item's approved list in that revision; otherwise, on any stale revision, foreign client, expired subscription or unauthorized actor, the failure is generic and writes nothing. Clearing is allowed and restores the coach default. One selection change = one audit event. Direct table DML is denied. (A5 Q2=A; S20-19; retained F18 FR-009.)
- **F18-FR-012 — Selection recalculation and carry-forward.** For a selected alternative, client-visible item, meal and day calories/macros MUST recalculate from that alternative's exact referenced food version and the coach-specified portion of that alternative, using the canonical algorithm and the same rounding/storage rules; no stored selection total may drift from the exact derivation. On publish of a newer revision, a selection carries forward only when the client remains authorized and the same stable item id **and** approved alternative id both exist; otherwise no selection row is written for that revision and the coach default applies. Selections never create plans and never affect another client. (A5 Q2=A; D18-9=A; F18-FR-003.)
- **F18-FR-013 — Staff and client surfaces.** The staff editor shows the coach-authored plan and its totals; it is not silently recalculated to a client's selection. The client surface (P4) shows the selected alternative and its recalculated totals. Exports distinguish coach original from the client's current permitted selection (F18-MCQ-1 open). No viewer is shown a mixture that cannot be attributed to either. (A5 Q2=A; PRD-05 "must reflect current permitted selection without silently overwriting coach-authored source".)
- **F18-FR-014 — PDF and Excel export.** Staff export one selected published revision. The export MUST check `has_workspace_access(plan.workspace_id, 'coaching_work')` in the application and pass RLS before any read, include meals, items, quantities/units, day types, alternatives, per-meal and per-day totals, and the selection representation of F18-FR-013. Coach-authored cells are written as text (formula-injection tests for `=`, `+`, `-`, `@`). AR-first RTL and EN-LTR output must both be correct. Every export and every export denial appends one audit event. (PRD-05; D18-6; retained F18 FR-010; S20-16 D17-8=A export-security pattern.)
- **F18-FR-015 — Copy Prompt for AI.** Alongside PDF and Excel, staff MUST be able to copy an AI-ready prompt containing the complete nutrition plan: meal/day organization, foods, quantities/units, calories and macro totals, authorized alternatives, notes, preparation/recipe information and links where present. The prompt instructs the receiving AI to format faithfully and MUST NOT ask it to invent meals, adjust amounts, replace coach-selected alternatives, or generate new alternatives. Privacy, authorization and audit requirements are the same as PDF/Excel. Whether the prompt carries the client's current permitted selection, who may invoke it, and the exact prompt text/language are F18-MCQ-2/4/5 (open). (A5 Q3=A.)
- **F18-FR-016 — Audit and log hygiene.** Every successful nutrition mutation (draft save, ready/unready, publish, template create/version/retire/load, Assign, Make it Global, selection set/clear) and every export, export denial and selection denial appends exactly one audit event with an allowlist: action, workspace, actor, resource/revision/template/item/alternative ids, assignment batch ids and counts, changed-field codes. For Assign, the batch is one auditable operation: one batch event carries the batch id, target workspace ids, created copy ids and per-outcome counts, so the created copies are covered without N duplicate events. Audit MUST NEVER contain food names, quantities, macros, notes, recipe text, URLs, client display data, document JSON, free text or raw operation keys. Log-scrub tests prove zero health-content occurrences. (Constitution VII; retained F18 FR-010a; PRD-05.)
- **F18-FR-017 — Authorization and tenant isolation.** Every read and write MUST be authorized server-side at both walls: an application-layer check and database RLS keyed to the signed identity. Only the PO manages global templates and Assign; only PO/WO/Trainer with current `coaching_work` in the plan's workspace manage workspace templates and plans; the PO may act without membership only where the merged F3 platform-wide rule already allows it; Sales has no plan/template/export right; clients only self-read through F19 and self-select through the selection RPC. Cross-workspace reads, counts, existence and errors MUST be indistinguishable from missing. Direct table DML is denied for every nutrition table except the authorized RPCs. (Constitution I/III; F16 FR-012/FR-033 pattern.)
- **F18-FR-018 — Contributor attribution.** Each published nutrition revision MUST expose an immutable contributor set (workspace id, staff ids, action code, timestamp only) for all staff who contributed since the previous revision, with workspace-scoped composite keys and RLS. If F19 lands contributor attribution for both plan kinds, F18 consumes it and supplies the nutrition action codes instead of creating a second mechanism; this is a technical reconciliation item, not a PO decision. (PRD-06 `LIFTER_BRD_PRD_Claude_Master.md:188` "other trainer contributions are recorded independently"; retained F18 FR-010b; F19 spec currently omits it — see conflicts F18-C-11.)
- **F18-FR-019 — Idempotency and concurrency.** Every mutating operation MUST carry a client-generated UUIDv4 operation key bound to the action: same key + same canonical request returns the original result, same key + different request is a `key_conflict`, and keys expire after 30 days. Plan-root operations follow the F19 lock/idempotency order (authorize → target locks → draft/revision row locks → idempotency lookup → revision recheck → authorization recheck → write → audit). Template-root operations lock the template identity (or a deterministic creation key) before the idempotency lookup and version recheck. Selections serialize with publish on the same stable plan root; a stale revision writes nothing and the caller retries with a new key. No path may create a duplicate revision, copy, selection, audit event or assignment batch. (Constitution IX; F16 FR-016; F19-FR-010; retained F18 FR-001b.)
- **F18-FR-020 — Schema and algorithm versioning.** Every document schema version keeps a frozen validator, renderer, export path and macro-algorithm version; a new version never reinterprets old documents or totals. Support is added only by forward migration; published revisions, template versions and their computed values are never rewritten. (Constitution V; retained F18 FR-013.)
- **F18-FR-021 — UI, accessibility and localization.** Any nutrition UI MUST follow DESIGN.md and pass the Frontend Design Gate: AR-first RTL and EN-LTR, light/dark, mobile/desktop, keyboard alternatives to drag, accessible live total announcements, and loading/empty/error/conflict/unavailable states. Food search uses F16's indexed `catalog_search` (no global-food scans). Trainer-authored content is displayed as authored, never machine-translated. No new user-visible string is approved by this draft; any new string requires PO approval before implementation (Constitution VIII). (Retained F18 FR-012.)
- **F18-FR-022 — Excluded scope.** Excluded: meal check-offs, consumption/calorie logging, calorie diary, AI-generated alternatives or meals, offline client queues, client food-replacement requests (P5), Telegram (P6), workout planning (F17), catalogs (F16), shared lifecycle/delivery/activation and client portal (F19/P4). Telegram AI, when built elsewhere, may only select coach-approved existing alternatives. (PRD-12; S20-21; retained F18 FR-011.)

## Key entities

- **Nutrition document v1** (content of one F19 draft/revision): day types, days, meals, items, alternatives, notes, optional recipe/preparation link, computed-value shapes.
- **Nutrition revision content** (F18-owned, keyed to the F19 revision): schema version, algorithm version, document, snapshot map, computed totals.
- **Food snapshot entry** (`FoodSnapshotV1`, F16 contract): exact food id + version + per-100 fixed-scale values + one serving identity/basis quantity; one entry per (food version, serving unit) referenced.
- **NutritionGlobalTemplate** + immutable **NutritionGlobalTemplateVersion** (PO-only; no workspace scope).
- **NutritionWorkspaceTemplate** + immutable **NutritionWorkspaceTemplateVersion** (workspace-scoped, branded, independent copy).
- **NutritionTemplateAssignmentBatch** + **NutritionTemplateAssignmentItem** (PO-only manual distribution; selection/scope modes, per-target outcome, created copy id).
- **ClientNutritionAlternativeSelection** (version-scoped active selection; no coach content).
- Shared: F19 plan root/draft/revision/delivery/activation/productivity; the operation-key ledger; `audit_events`.

## Success Criteria

- **F18-SC-001** 500 fixed golden macro/total cases (units, precision boundaries, repeating fractions, alternatives, selected-alternative totals) pass **identically** in TypeScript and SQL on the same fixtures, including the assertion that aggregates are not derived from already-rounded item values.
- **F18-SC-002** A complete inventory of every F18 endpoint, RPC, direct-table path and export passes foreign-workspace, foreign-client, PO-without-membership coverage (allow only where the merged F3 rule permits, deny elsewhere), WO, Trainer, Sales, client, unaffiliated-staff and revoked-membership negatives, plus direct-DML denial, UPDATE/DELETE/TRUNCATE denial, creator/origin masking, forged selection keys, operation-key replay/conflict, concurrent draft/publish/selection, malformed references, old-schema export and forged publish payloads (ignored).
- **F18-SC-003** Two or more simultaneously published, delivered nutrition plans stay visible and exportable; later plans/revisions change neither activation nor productivity counts.
- **F18-SC-004** 100% of invalid unit swaps (undeclared unit, cross-basis, non-positive quantity) are rejected with no write and no value change.
- **F18-SC-005** PDF, Excel and prompt exports equal canonical AR/EN golden artifacts: every meal/food/quantity/total/alternative/note/link present, formula prefixes neutralized, coach-original vs client-selection distinction present per F18-MCQ-1, and no invented or altered content in the prompt. Playwright + axe cover AR/EN × light/dark × mobile/desktop.
- **F18-SC-006** A benchmark envelope is defined and recorded **before** implementation: maximum document bytes, meals, items, alternatives, precision and a fixed request mix. Historic p95 numbers (Worker CPU ≤ 5 ms, DB/API ≤ 300 ms) are **provisional only** and MUST be re-benchmarked on the merged stack and replaced by evidence-backed thresholds; bytes per revision/template are recorded against the F16/F19 storage budget.
- **F18-SC-007** Assignment behavior is proven by fixtures: All Workspaces copies only to never-assigned existing workspaces and skips intentionally partial ones; Specific Workspaces fills exactly the selected templates a workspace does not already hold at that source version; re-running Assign creates zero duplicates and overwrites zero customizations; a retry returns the same batch; a workspace created after the batch receives nothing. The different-source-version row is excluded from this criterion until F18-MCQ-6 is decided.
- **F18-SC-008** Selection behavior is proven by fixtures: selected-alternative item/meal/day totals equal golden values; the revision bytes are unchanged; unauthorized/stale/foreign/forged selections write nothing; carry-forward happens only for the same stable item+alternative ids; a missing id yields the coach default; clearing restores the default; no selection affects another client or plan.
- **F18-SC-009** Template isolation is proven: workspace B cannot list, load, count or infer workspace A's templates; non-PO cannot read the global library; Make it Global creates a separate global identity/version and leaves the workspace original unchanged; a later global edit never changes an assigned copy.
- **F18-SC-010** Log-scrub proves zero occurrences of food names, quantities, macros, notes, recipe text, URLs, document JSON and raw operation keys in audit events for every F18 action.
- **F18-SC-011** Display fixtures show calories as integers and macro grams with the approved threshold behavior (one decimal below 10 g, integer at or above 10 g) while stored values remain the exact four-decimal results; the display-rounding tie rule is asserted only after F18-MCQ-3 is decided.

## Assumptions

- F16 food versions are immutable, provide per-100 fixed-scale values and same-basis serving equivalences, and `FoodSnapshotV1` is the transport for exactly one serving equivalent per entry (verified: `specs/016.../plan.md:38,89`; `lib/catalog/snapshot.ts:15-37,164-242`; migration `20261106093000`).
- F19 lands the shared plan/draft/revision/delivery/activation contract before F18 implementation; F18 integrates rather than re-implements it.
- F13/P4 own subscription entitlement, expiry enforcement and the client portal surface; F18 exposes data + the self-only selection RPC.
- The platform-wide `has_workspace_access` rule (merged F3) remains the single membership authority; F18 adds no capability and no new role.
- No F18 planner/template/export user-visible copy is approved on `main`; only the generic navigation label and F16 catalog strings exist. This draft adds none.

## Out of scope

Workout planning (F17); catalogs and food authoring (F16); plan lifecycle, delivery, activation, productivity and client projection (F19); client portal/selection UI (P4); check-ins, food-replacement requests, client Notes (P5); Telegram (P6); offline sync; meal logging; AI-generated content; analytics beyond audit.

## Clarifications

**Session**: 2026-11-10 (S42). **Inputs**: PO Section A, S42-PO-2..S42-PO-6, `origin/main`, historic F18 artifacts. **Skips**: none; every PO question raised here is numbered.

### Binding PO decisions (Section A, quoted byte-exact)

**A5 Q1–Q4** (`f17-f18-po-decisions-source.md:57-62`):

> - **Q1=A — Nutrition Template Assign:** Global Nutrition Templates follow the **same PO-only manual Assign and independent workspace-copy model** described in A2, including All / Specific / All Except template selection; All / Specific Workspace targeting; skip previously assigned workspaces on All; no automatic top-up, overwrite or sync. The nutrition and workout catalogs/templates remain distinct collections/types, even if UI/control patterns are shared.
> - **Q2=A — Client-selected alternatives:** When a client chooses a coach-approved food alternative, **client-visible calories and macros recalculate for that selected alternative and its specified quantity**, including relevant meal/day totals. **The coach-authored published version remains immutable**; any export/projection must clearly distinguish the coach original from the client's currently permitted selection.
> - **Q3=A — Nutrition Copy Prompt for AI:** Alongside PDF and Excel, provide `Copy Prompt for AI` with **complete nutrition plan**: meal/day organization, foods, quantities/units, calories and macro totals, authorized alternatives, notes, preparation/recipe information and links/video where present. Ask AI to format faithfully, **without inventing meals, adjusting amounts, or replacing coach-selected alternatives**. Keep export privacy and authorization requirements.
> - **Q4=A — Macro display:** Retain existing display rules: **calories as integers; protein/carbs/fat grams below 10 g with one decimal; at or above 10 g as integers**. Preserve exact decimal calculations, approved fixed-scale storage and one final half-even rounding step; allow technical verification of consistency without silently changing the PO-approved display convention.

**A2 assignment model** (`f17-f18-po-decisions-source.md:33-42`), referenced by A5 Q1:

> - **Only Platform Owner (PO)** can create/manage the canonical **Global Workout Templates**.
> - **Every new workspace starts with no global templates distributed to it.** This replaces the earlier proposed opt-in seeding during workspace creation. There is **no automatic sync/distribution** when a workspace is created or a global template is added.
> - The PO later uses `Global Templates → Assign`. Step 1 offers **All Templates**, **Specific Templates**, or **All Templates Exclude** (select all except chosen ones). Step 2 offers **All Workspaces** or **Specific Workspaces**.
> - **All Workspaces is a one-time distribution to workspaces that have *never received a global-template assignment/library*.** If workspace Kendo previously received 3 templates intentionally and Alpha received 10, running All Workspaces **skips both**. It does **not** fill Kendo's remaining missing templates. It affects existing workspaces at the time of the manual operation; not future workspaces.
> - **Specific Workspaces** permits intentionally returning to previously assigned workspaces and assigning selected templates, without duplicating existing ones or overwriting customizations. The implementation must distinguish intentional partial assignment from an uninitialized workspace.
> - Assigned global templates become **independent, workspace-owned, workspace-branded copies** (e.g., `Kendo Templates`). Authorized workspace owners/trainers can modify their copies and create entirely new templates/splits; no edit propagates back to the global library or other workspaces.
> - PO retains **full visibility and management rights across workspaces**: view, edit and copy any workspace's templates; copy/promote an eligible workspace template into PO's global collection as a **separate copy**, retaining the original. Avoid moving private client data or workspace-private references into global copies.
> - No silent reassignment overwrite, no implicit top-up and no live-linked workspace copies.

**A6 shared context** (`f17-f18-po-decisions-source.md:64-74`) — used only as dependency context; F19 rules are not duplicated here. Load-bearing lines quoted:

> - A client can have **unlimited separate plans**; all **published and delivered** plans authorized for that client must be visible, not just one first workout/first nutrition plan. Additional deliveries do not reactivate or earn more first-activation productivity credit.
> - First **workout and nutrition deliveries** are independent. **Initial-subscription automatic activation** occurs when the two first kinds have been successfully delivered; publishing for the intended client with a current subscription counts as delivery under the latest PO Q1=A interpretation.
> - **Deletion of a trainer must not destroy plans, revisions or retained audit history**; reconcile authorship/account retention with F11/F12. **Client content access is blocked on subscription expiry**, leaving the approved renewal messaging/allowed account surface to the responsible P4/F13 feature.
> - F19's current proposed technical direction includes a single delivery table, attribution/activation sources and a transactional path; **verify what has actually been formally accepted and written in the newest F19 spec before adopting a schema assumption**. Do not duplicate F19 logic inside F17/F18.

**A7 environment** (`f17-f18-po-decisions-source.md:76-79`):

> - LIFTER is **not live or production-deployed**; local Docker/Supabase is used, with **no real clients or production user data**. Do not design elaborate legacy data migrations solely to preserve disposable mock/seed data. Nevertheless respect current `main` migrations, database constraints, Constitution and safe forward migration practices.
> - Historic task `OWNER=Luna` / `OWNER=MiniMax` labels are **not authoritative** for current delegation. Use current specialty-based model routing, current authorized lane/concurrency caps, and the live Constitution. Do not invent available agents or unapproved Sol runs.

**S42-PO-2 (F19 architecture, referenced)** (`s42-po-1.verbatim.txt:6-9`), PO words:

> PO decisions F19: Approve single `plan_deliveries` table, activation sources (`plan_deliveries`, `po_override`, `renewal`), atomic delivery/activation/productivity transaction (no outbox), and existing renewal activation behavior.
>
> Q1–Q8: **A, A, A, A, A, B, A, A**.

**S42-PO-3 / S42-PO-4** (`s42-po-1.verbatim.txt:20,35,36`), PO words relevant to F18:

> Q9=No: No Override for cancelled/refunded subscriptions or deactivated clients.

> F19-MCQ-13: A: Keep ID reference (Rec.)

> F19-MCQ-14: C: Credit the publisher

The pending F19 spec is the authority for their meaning (architect mappings are kept there); F18 only consumes the resulting access, lifecycle and author-reference facts.

**S27-PO-2** (quoted from `origin/sk-018:specs/018-nutrition-planner/S27-decimal-evidence.md:3`; not on `main`):

> S27-PO-2 decision: "F18: Approved one-decimal display below 10 g, retaining full calculation precision."

### Retained approved decisions on `main` (docs/04)

Summaries of the register rows below; the register text is the authority and the PO quotes above are byte-exact where wording matters.

- **S20-17 / D18-1 amendment** (`docs/04-changes-and-questions.md:93`): global nutrition templates PO-only; workspace templates by authorized staff; PO may Make it Global after excluding private data/references. **D18-2=A**: targets optional; always calculate totals.
- **S20-18 / D18-4=C** (`:94`): calories/macros display rule with exact decimal calculations/storage. The register text says "integers"; S27-PO-2 refines the macro-gram part to one decimal below 10 g. **Register gap recorded, docs/04 not edited.**
- **S20-19 / D18-6 and D18-9=A** (`:95`): optional recipe/preparation video link/icon for YouTube or Google Drive, hidden when absent; selections persist after edits while authorized and valid, otherwise coach default; selections never create plans or affect other clients; multiple active plans supported; daily logging deferred to mobile.
- **S20-20** (`:96`): Plan Core lifecycle baseline — same Plan ID after publish, private autosave draft, one Ready & Publish, only explicit Create New Plan creates a plan, first deliveries may differ by day, activate once after both, no paired-publish transaction, later edits never restart activation.

### Architect mappings (NOT PO words)

- Q1=A applies the A2 workout assignment mechanics to the **nutrition** collection, with separate tables/types.
- Q2=A means selection state is client-owned and version-scoped; the coach revision is immutable; recalculation is exact.
- Q3=A means the prompt is a faithful projection, not a generator; authorization/audit match exports.
- Q4=A means display changes never mutate stored values; storage rounding is single half-even to four decimals.
- "Includes alternatives" in exports means the coach-authored alternatives; the client's selection representation is F18-MCQ-1.
- Assignment "uninitialized" is computed per collection type: a workspace that received only workout templates is still uninitialized for nutrition.

### Register gaps (recorded, not repaired)

1. **S27-PO-2** is not in `docs/04` on `main`; only the branch evidence file records it. F18 cites it as level 4 authority and does not edit `docs/04`.
2. **S24-PO-3** ("Keep unless food changes (Recommended)"), relied on by the historic plan for stable-id semantics, is not in `docs/04` and has no verbatim source in this task's authority set. F18 therefore treats stable-id preservation as **INFERRED** from D18-9=A plus the retained approved F18 artifacts (see `research/po-decision-matrix.md`), not as a direct PO record.
3. The historic F18 migration range `20261108000000-20261108235959` (`docs/03-roadmap.md:63-65`) reserves nothing; F19 already records it as obsolete. F18 reserves no version.

### Remaining product ambiguities (explicit)

**"No open ambiguities" is NOT claimed.** Six product questions remain open. Each blocks only the work named; the rest of the draft is specified.

- **F18-MCQ-1 — Export representation of coach original vs client selection.** Where F18-FR-013/014 say "distinguish", the exact artifact layout is not decided. Options: (A) per-item and per-total **two labelled columns/sections** (coach original and client's current permitted selection) in both PDF and Excel (recommended); (B) selected values inline as the primary content with the coach original shown as a per-item note; (C) two separate export sections (coach plan, then client selections). Implications: A is unambiguous and audit-friendly but wider tables; B is compact but can be read as if the coach wrote the selected values; C is clearest visually but duplicates the plan. Recommendation: A. **Blocked**: export contracts, goldens, PDF/Excel layout, F18-SC-005.
- **F18-MCQ-2 — Does the client's selection change the `Copy Prompt for AI` content?** Q2=A settles PDF/Excel/projections ("any export/projection must clearly distinguish"), but Q3=A describes the prompt as the complete plan and does not mention the client's selection. Options: (A) prompt carries the coach-authored plan **plus** a clearly labelled section of the client's current permitted selections and recalculated totals (recommended; consistent with Q2=A); (B) prompt carries the coach-authored plan only, with no selection data. Implications: A risks the AI treating the selection as coach intent unless labelled; B is faithful to the coach source but inconsistent with the other exports. Recommendation: A with explicit labels. **Blocked**: prompt content contract, prompt goldens, F18-FR-015, F18-SC-005.
- **F18-MCQ-3 — Display rounding mode at the threshold/ties.** A5 Q4 says "one final half-even rounding step"; S27 evidence says the shipped display formatter "rounds half-up at display time only". This covers calories, macro grams and displayed totals at any tie. Options: (A) storage canonicalization is half-even and display is **half-up** (the shipped S27 behavior; recommended); (B) both storage and display are **half-even** (changes displayed values such as `0.05 → 0.0` instead of `0.1`); (C) storage half-even, display half-even except calories (no evidence for a split). Implications: A preserves the current approved display convention and treats "one final half-even step" as the stored-total step; B changes already-shipped displayed values; C has no source. Recommendation: A, with the PO confirming that "one final half-even rounding step" refers to stored totals. **Blocked**: display fixtures, F18-SC-011, F18-FR-003 final test expectations.
- **F18-MCQ-4 — Who may use `Copy Prompt for AI`?** Options: (A) the same authorized staff who may export the plan (recommended; "keep export privacy and authorization requirements"); (B) authorized staff **and** the client for their own delivered plan; (C) PO only. Implications: A is the narrowest consistent reading; B adds a client surface not specified elsewhere and needs P4; C contradicts "alongside PDF and Excel". Recommendation: A. **Blocked**: prompt authorization, audit action, UI entry point.
- **F18-MCQ-5 — Exact prompt text and language.** No prompt string is approved. Options: (A) PO supplies/approves one exact prompt template per locale (EN and AR) and the language selection rule (recommended); (B) the architect drafts EN/AR templates for PO approval later in the normal copy gate; (C) one bilingual prompt containing both languages. Implications: A is required before implementation by Constitution VIII; B delays approval but allows progress; C doubles length and mixes directionality. Recommendation: A; if not yet available, B is the only non-guessing path. **Blocked**: prompt copy, F18-FR-015 final text, prompt goldens.
- **F18-MCQ-6 — Re-assignment when a global template has a newer version.** A2/Q1=A decide that re-assignment never duplicates or overwrites, but not what happens to a newer global version. Options: (A) Assign never re-delivers a template an existing workspace copy came from; the PO updates a workspace copy only through the PO's existing edit right, creating a new workspace template version (recommended); (B) Assign offers the newer version as a **second, separate** workspace copy; (C) Assign offers an explicit "update copy" that creates a new workspace template version only when the workspace copy has no local edits since assignment, otherwise skips. Implications: A keeps copies strictly independent and avoids overwrite risk, but there is no bulk version refresh; B contradicts "without duplicating existing ones" unless the copy is treated as a distinct template; C needs a local-edit watermark and risks silent bulk change. Recommendation: A. **Blocked**: assignment contract edge case, F18-FR-008 final wording, assignment fixtures.

## Constitution check

- **I. Strict workspace isolation** — every tenant-owned nutrition table carries `workspace_id` with composite keys; two walls; cross-workspace negatives (F18-FR-017, F18-SC-002). Global template tables are platform-scope, PO-only, with no workspace read policy.
- **II. Immutable financial truth** — n/a (no money); productivity units are F19's.
- **III. PO governance** — PO-only global templates, Assign and Make it Global; existing capability checks only; Sales denied.
- **IV. Approved scope** — PRD-05/06/12, D18-1/2/4/6/9, A5 Q1–Q4, A6. No invented behavior; unknown values are MCQs; docs/04 untouched.
- **V. Versioned content** — immutable revisions, template versions, exact-version food snapshots, one rounded stored result, forward-only schema/algorithm versioning.
- **VI. Human-governed people decisions** — n/a; no automatic people action.
- **VII. Privacy** — nutrition treated as health-adjacent; audit allowlist and log-scrub; exports authorized and audited; prompt privacy per F18-MCQ-4/5.
- **VIII. Bilingual accessible UI** — AR-first RTL and EN-LTR, design gate, no machine translation; no unapproved copy is introduced.
- **IX. Reliable idempotent operations** — operation keys, CAS, plan-root serialization, no duplicated revisions/copies/selections.
