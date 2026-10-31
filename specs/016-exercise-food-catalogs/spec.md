# Feature Specification: F16 Exercise & Food Catalogs

**Feature Branch**: `016-exercise-food-catalogs`
**Status**: PO-approved specification; not implemented (review history in debate.md)
**Phase**: P3 Catalogs + planners (roadmap), first P3 feature
**Input**: PRD-04 (canonical global exercise library, workspace variations), PRD-05 (global food database, validation, duplicate detection, no moderation queue), PRD-01 (PO global shared exercise/food governance), Constitution V (catalog entries are immutable versions), architecture "Catalogs: foods/exercises are versioned; trainers add globally with duplicate detection; edit/merge rights per approved D16 decisions".

## Why this feature, why now

P4 activation requires delivery of both initial plans (BRD-01 inv. 6). Both planners (F17, F18) need stable exercise and food identities that plan versions can snapshot (Constitution V). F16 is therefore the shared foundation of P3 and the first link of the critical path P3 -> P4. F13 and F15 explicitly leave catalogs to P3.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Govern the canonical global exercise library (Priority: P1)

The Platform Owner (PO) creates and maintains canonical global exercises with bilingual names and searchable metadata. Each change creates a new immutable version; the exercise identity never changes.

**Independent Test**: As PO, create a global exercise, edit it, and verify two immutable versions under one stable identity, with audit events; as WO/Trainer/Sales verify global create/edit is denied by both walls.

**Acceptance Scenarios**:
1. **Given** a PO, **When** they create a global exercise with required AR and EN names, a primary muscle group and metadata from the approved taxonomy, **Then** a stable exercise identity and version 1 exist and an audit event is recorded without free-text content.
2. **Given** an existing global exercise, **When** the PO edits it, **Then** a new version is appended, the previous version stays readable and unchanged, and the identity is preserved.
3. **Given** a non-PO staff member, **When** they attempt to create, edit, retire or merge a global exercise, **Then** the request is denied by app authorization and by RLS.

### User Story 2 - Workspace exercise variations and workspace exercises (Priority: P1)

A Trainer, WO or PO adds a workspace-specific video reference or note to a global exercise without changing its canonical identity, and may add a workspace-only exercise.

**Independent Test**: In workspace A, attach a video variation to a global exercise; verify workspace B sees only the canonical entry, and the canonical identity referenced by both is identical.

**Acceptance Scenarios**:
1. **Given** a staff member with `coaching_work` in workspace A, **When** they add a variation (video reference and/or note) to a global exercise, **Then** it is stored as a workspace-A row bound to the canonical identity (PRD-04 acceptance check: identity not lost).
2. **Given** workspace-A variations and workspace-A exercises, **When** any actor in workspace B searches, **Then** none of them are returned, counted or inferable.
3. **Given** a workspace exercise, **When** it is edited, **Then** a new version is appended (immutability applies to workspace entries too).

### User Story 3 - Add foods directly to the global food database (Priority: P1)

Any staff member with `coaching_work` adds a food to the global database immediately (no moderation queue), with structured nutrition per reference quantity and serving units. Validation and duplicate detection prevent invalid or duplicate entries without bureaucracy.

**Independent Test**: Add a valid food (immediately searchable by all coaching staff of all workspaces); attempt an invalid food with negative values (rejected with field errors) and an exact duplicate (blocked, pointing to the existing food); attempt a near-duplicate (warned, explicit confirm allowed); submit a 4/4/9 kcal discrepancy beyond the approved tolerance and verify a warning appears while the food saves.

**Acceptance Scenarios**:
1. **Given** a Trainer, **When** they add a food with AR and/or EN name, canonical product identity, preparation identity and weighing state, per-100 g (or per-100 ml) calories, protein, carbohydrate and fat, and at least one serving unit with a gram (or ml) equivalent, **Then** the food is immediately available globally as version 1.
2. **Given** negative values or macro grams exceeding the reference quantity, **When** submitted, **Then** it is rejected with field-level bilingual errors and nothing is written. **Given** calories inconsistent with 4/4/9 beyond `max(20 kcal, 10% of stated kcal)`, **When** submitted, **Then** a field-level warning appears and the food saves if all other validation passes (PO S20 Message B section 1, D16-5).
3. **Given** a food whose normalized name, basis, product identity, preparation identity and weighing state match an existing active food, **When** submitted, **Then** creation is blocked and the existing food is offered; a different product/preparation identity or raw/cooked state remains distinct. **Given** a near match within the same identity dimensions (similar name and macros within tolerance), **Then** a warning lists candidates and creation proceeds only on explicit confirmation.
4. **Given** any global food, **When** viewed by non-PO staff, **Then** no creator identity or workspace of origin is disclosed (Invariant 1).

### User Story 4 - Version, retire and merge catalog entries safely (Priority: P2)

Corrections never rewrite history: an edit creates a new version, retirement hides an entry from new selection, and a merge redirects a duplicate to a survivor. Published plans keep their snapshots.

**Independent Test**: Retire a food and merge a duplicate into a survivor; verify search excludes both for new selection, the survivor is suggested, existing version rows are unchanged, and frozen `ExerciseSnapshotV1`/`FoodSnapshotV1` fixtures still serialize exactly. (Rendering a stored plan snapshot is an F17/F18 acceptance criterion, not an F16 exit gate.)

**Acceptance Scenarios**:
1. **Given** an authorized actor per the approved edit/merge matrix, **When** they merge food X into food Y, **Then** X is marked superseded by Y (no delete), new selection of X is redirected to Y, and an audit event records both identities.
2. **Given** a retired or superseded entry, **When** a planner loads an existing draft containing it, **Then** the draft shows a non-blocking "replaced/retired" indicator and the stored values remain intact.
3. **Given** a PO restores a retired global entry or authorized workspace staff restore a retired workspace exercise, **When** Restore succeeds, **Then** the same identity and current immutable version become selectable with one lifecycle/audit record; prior plan references and snapshots remain unchanged. **Given** X was merged into Y and Y is merged into Z, **Then** X is atomically redirected to Z; a later request targeting X resolves to active terminal Z, with no chain and no plan-reference rewrite.

### User Story 5 - Bilingual, accessible catalog screens (Priority: P2)

Staff browse, search (Arabic and English, with Arabic normalization), filter and add catalog entries in the Design System, AR (RTL) and EN.

**Independent Test**: Playwright + axe on catalog list, search, add-food and add-exercise in AR/EN, light/dark, mobile/desktop; Arabic search finds entries regardless of alef/hamza/ta-marbuta/diacritic variants.

### Edge Cases

- Same food name in Arabic and English matching different existing foods (duplicate check per language and combined).
- Food measured in ml (liquids) vs g: no implicit g<->ml conversion unless the food defines a serving equivalence.
- Concurrent edit of the same entry by two actors: the second write against a stale version is rejected (optimistic concurrency), never silently overwritten.
- Merge chains: requests targeting a superseded entry resolve to its active terminal entry; when an active entry with inbound aliases is merged, all aliases are atomically repointed to the same terminal so chains never remain. Cycles are rejected.
- Restore of an archived/removed entry: the same identity becomes selectable again using its existing current immutable content version; no version or plan reference is rewritten.
- Video reference with a disallowed host, non-https URL, or embedded credentials: rejected.
- Workspace membership revoked mid-session: next request is denied (current-membership check per request).
- Very large catalog search on the Free tier: bounded page size, indexed search, no unbounded scans.
- A staff member with roles in several workspaces adds a workspace exercise: it belongs to exactly one chosen, authorized workspace.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001** Global exercises MUST have stable identities and append-only immutable versions. Taxonomy is exactly 18 muscles (Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps, Triceps, Forearms, Abs, Spinal Erectors, Quads, Hamstrings, Glutes, Adductors, Abductors, Calves) and 10 equipment values (Barbell, Dumbbell, Cable, Machine, Smith Machine, Bodyweight, Kettlebell, Resistance Band, Suspension Trainer, Other). Arabic/English names, primary muscle and required equipment are required; secondary muscles are optional. (PO S20 Message B section 1; supersedes v3 FR-001)
- **FR-002** PO exclusively creates and manages global exercises; authorized staff manage workspace exercises. Only PO retires or merges global entries. (PO S20 Message B section 1; supersedes v3 FR-002)
- **FR-003** Workspace exercise variations MUST be workspace-scoped rows bound to one canonical exercise identity, holding that workspace's video URL and/or note; they never alter the canonical entry. Only HTTPS YouTube and Google Drive URLs are accepted. (PO S20 Message B section 1; supersedes v3 FR-003)
- **FR-004** Staff with `coaching_work` in a workspace MUST be able to create workspace-only exercises in that workspace, versioned like global ones; they are invisible to other workspaces.
- **FR-005** Global foods MUST have a stable identity and immutable versions holding: AR/EN names (at least one), basis (`g` or `ml`), canonical product identity, preparation identity, weighing state (`raw`, `cooked`, or `not_applicable`), per-100-basis energy (kcal) and protein/carbohydrate/fat grams, optional fiber, and one or more serving units each with an exact basis equivalent. Product identity, preparation identity and weighing state are non-null; use `not_applicable` when preparation/weighing distinction does not apply. These dimensions distinguish genuinely different products and raw/cooked forms; the PO-approved dataset audit supplies/approves catalog values before import.
- **FR-006** Any staff member with `coaching_work` in at least one workspace MUST be able to add a global food that is immediately usable (PRD-05: no moderation queue).
- **FR-007** Negative nutritional values and non-positive serving equivalents are rejected. When the kcal discrepancy exceeds `max(20 kcal, 10% of stated kcal)`, the system warns; it MUST NOT block saving solely for this discrepancy. (PO S20 Message B section 1; supersedes v3 FR-007)
- **FR-008** Exact-duplicate identity MUST include language, normalized name, basis, canonical product identity, preparation identity and weighing state. Near-duplicate comparisons use normalized textual similarity of at least 90%, with no automatic synonym matching, and kcal proximity at most `max(10%, 10 kcal)`, standardized per 100 g or 100 ml; compare only within the same basis and product/preparation identity and weighing state, so raw/cooked states and genuinely different products remain distinct. Block genuine catalog duplicates, while repeated foods/meals inside client plans remain allowed through Duplicate Food/Meal actions. (PO S20 Message B section 1; supersedes v3 FR-008)
- **FR-009** The creator recorded on the stable food identity or PO may publish food edits without moderation; being the author of a later version alone grants no edit right. Only PO retires or merges global entries. (PO S20 Message B section 1; supersedes v3 FR-009)
- **FR-010** Only PO may merge global entries. Merge MUST use an active source (never retired or superseded) and mark it superseded (no delete); resolve a requested target through its `superseded_by` chain to the active terminal before merging. Atomically repoint every direct inbound alias of a merged source to that terminal, so all chains are flattened and cycles cannot form. New selection of any alias resolves to the terminal; existing plan references and published snapshots remain unchanged.
- **FR-011** Catalog content versions and audit events are immutable and never updated or deleted. Add creates an identity and its first version; Edit appends a content version; Archive and Remove append an inactive lifecycle marker without deleting content; Restore appends an active marker for the same identity and current content version, without creating or changing a content version. Every action MUST preserve existing plan references and published snapshots. Global restore is PO-only; workspace exercise restore requires `coaching_work` in that workspace. (PO S20 Message B section 1; supersedes v3 FR-011)
- **FR-012** Global catalog reads MUST be allowed to the PO directly (with or without workspace membership, BRD-02) or to authenticated staff holding `coaching_work` in at least one current workspace; the read function and RLS policy enforce the same rule; Sales, clients and unaffiliated staff are denied. Clients never read catalogs directly; they see plan-version snapshots (F17/F18/P4).
- **FR-013** Global entries MUST NOT expose creator identity or workspace of origin to non-PO actors in lists, details, RPC results or errors; creator identity is stored for PO governance only (D16-9). Global-catalog audit events set `workspace_id` NULL; workspace-catalog events use that workspace. Audit details are an allowlist (action, target/version ids, related id, changed-field codes such as `name_ar`, `kcal`, `video` - codes only, never values; the immutable version rows hold the content for PO review) with no names, notes, nutrition, URLs, origin workspace, raw operation key or free text. Operation keys MUST be client-generated UUIDv4, format-validated and bound to the RPC action name before use, stored only in the idempotency table, which keeps rows for 30 days and is purged by the existing cron (counted in D16-10 storage budgets).
- **FR-014** Exercise video URLs MUST use HTTPS and only YouTube or Google Drive. A single shared global exercise identity may have independent video URLs per workspace. PO manages all mappings; authorized staff manage only their workspace mappings. Resolve the selected workspace URL dynamically under authorization; never expose another workspace's links and never require plan republishing. (PO S20 Message B section 1; supersedes v3 FR-014)
- **FR-015** Search MUST support AR and EN through a versioned, collation-independent `normalize_ar_en_v1` (Unicode NFC, explicit Arabic/Latin fold table: alef/hamza forms, ta marbuta/ha, alef maqsura/ya, diacritics and tatweel removal, locale-independent case mapping), filters (muscle group, equipment, basis), bounded pagination (max 50) and stable ordering. Algorithm changes require new columns/indexes via forward migration.
- **FR-016** Every mutating RPC MUST: authorize first; then lock all affected identity roots in deterministic UUID order (or acquire deterministic creation/key locks when a root does not yet exist); then look up `(actor_user_id, operation_key)` (same key + same request hash returns the original result; same key + different hash = conflict); re-read `current_version` and lifecycle state (stale expected version = conflict); recheck membership/capability and resource-specific ownership after lock waits and before disclosing an idempotent replay result; write exactly one audit event. Global food versioning additionally requires the actor to be the food's creator or PO, checked against the locked food identity before any write. Merge is PO-only: resolve a superseded target to its active terminal, atomically flatten direct inbound aliases to that terminal, and recheck all locked identities to prevent cycles or chains. Search is not audited per request.
- **FR-016a** Taxonomy (muscle groups, equipment) MUST be versioned: stable code, kind, AR/EN labels and lifecycle per term version; exercise versions reference term versions; PO taxonomy changes use audited RPCs and never rewrite existing exercise versions.
- **FR-017** Sales MUST have no catalog rights (deny by default; Sales coaching rights unconfirmed).
- **FR-018** UI MUST use the Design System, AR-first RTL + EN, loading/empty/error states, keyboard access, and pass the Frontend Design Gate.
- **FR-019** No YBS import and no seeded catalog content unless the PO supplies an approved starter list (BRD-06).
- **FR-020** Snapshots MUST use explicit immutable exercise/food versions. Exercise plan snapshots preserve canonical exercise identity only; the selected authorized workspace video is resolved dynamically and is not snapshotted. Food snapshots preserve the exact referenced food version and validated per-100 values. (PO S20 Message B section 1; supersedes v3 FR-020)
- **FR-021** Rate limits are 10 trainer additions per 24 hours, 100 platform additions per 24 hours, and at most 10,000 active foods. Benchmark the catalog before production. (PO S20 Message B section 1; supersedes v3 FR-021)

### Approved catalog defaults and import protocol

- Exercise defaults are stored per exercise: editable warm-up/working sets, fixed or ranged reps, rest, RIR and exercise alternatives. Adding an exercise to a plan populates these defaults; coaches may override them.
- Each food may have curated default alternatives. A plan may contain at most THREE food alternatives per food; portion quantities are validated and may be overridden per plan.
- The PO supplies the food dataset later. Audit nutritional values, calories, names, duplicates, irrelevant foods and raw/cooked variants; produce the smallest useful Egyptian/Arab-oriented catalog and report corrections, exclusions, sources and alternative groups. PO approval is required before import. Never invent nutritional values or exercise content. (PO S20 Message B section 1; D16-4)

### Key Entities

- **Exercise** (global identity) / **ExerciseVersion** (immutable content).
- **WorkspaceExercise** (workspace-scoped identity) / **WorkspaceExerciseVersion**.
- **ExerciseVariation** (workspace-scoped overlay on a global exercise: video reference, note; versioned).
- **Food** (global identity with immutable `created_by`, lifecycle state and `superseded_by`) / **FoodVersion** (immutable nutrition, normalized product/preparation identity, weighing state and serving units).
- **Taxonomy**: muscle groups, equipment (PO-governed reference lists; bilingual labels).
- **CatalogAuditEvent**: via existing append-only audit log.

## Success Criteria _(mandatory)_

- **SC-001** 100% of catalog edits produce a new version; zero in-place content updates (trigger + mutation test).
- **SC-002** Zero cross-workspace visibility of workspace exercises/variations in foreign-workspace negative tests (API, RPC, RLS, search counts).
- **SC-003** A trainer can add a valid food and find it in search in under 60 seconds of interaction; exact duplicates are blocked 100% in tests.
- **SC-004** Arabic normalization test table passes for all listed variant classes.
- **SC-005** At a defined 10k-food fixture (fixed active/retired ratio, AR/EN name-length distribution, query classes and request concurrency; page size <= 50): Worker CPU p95 <= 5 ms per request (headroom under the 10 ms free-tier hard limit, cold start measured separately); DB/API p95 <= 300 ms (engineering-owned target); EXPLAIN shows the intended indexes with no unbounded scan; exact/near-duplicate checks measured against a separate budget; database and index size recorded and reported against the architecture's 70% exit trigger.

## Approved PO decisions

D16-1a/b/c and D16-2 through D16-10 are approved and recorded in docs/04-changes-and-questions.md, S20-03 through S20-13. No D16 item remains open. The PO dataset is a future input; audit it and obtain import approval when supplied. Do not invent food values or exercise content.

## Assumptions

- `coaching_work` (PO, WO, Trainer) is the right capability for food addition and workspace exercises; a new PO-only capability `govern_global_catalog` is added for global exercise governance and merges.
- Nutrition values are per 100 g or 100 ml; micronutrients are out of scope.
- Exercise video references are links, displayed by the planner/portal; no embedding decisions are made here.

## Out of Scope

Workout/nutrition templates and planners (F17/F18), plan versions and exports, client-facing views (P4), food replacement requests (P5), Telegram, YBS import, AI-generated alternatives (PRD-12), moderation/approval queues (PRD-12), image/video uploads.

## Constitution Check

I isolation (workspace rows + composite FKs; global rows readable only by coaching staff; no origin disclosure) - II n/a (no money) - III PO governs global exercises and merges - IV traces to PRD-04/05; open items marked - V immutable versions; snapshots consumed by F17/F18 - VII no PII in catalog audit - VIII bilingual Design System + gate - IX idempotent, optimistic-concurrency RPCs.
