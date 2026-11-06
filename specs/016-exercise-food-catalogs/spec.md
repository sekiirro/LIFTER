# Feature Specification: F16 Exercise & Food Catalogs

**Feature Branch**: `016-exercise-food-catalogs`
**Status**: PO-approved specification; database and server implementation in PR #34; UI tasks T023/T029/T030/T033/T036 remain in the follow-on PR (review history in debate.md)
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
3. **Given** a non-PO staff member, **When** they attempt to create, edit, remove, restore or merge a global exercise, **Then** the request is denied by app authorization and by RLS.

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
3. **Given** a food whose language, normalized name, basis, product identity, preparation identity and weighing state match an existing active food, **When** submitted, **Then** creation is blocked and the existing food is offered. **Given** the same normalized name in another language or a different product/preparation identity or raw/cooked state, **When** submitted, **Then** it remains a distinct food. **Given** a near match within the same identity dimensions (similar name and macros within tolerance), **Then** a warning lists candidates and creation proceeds only on explicit confirmation.
4. **Given** any global food, **When** viewed by non-PO staff, **Then** no creator identity or workspace of origin is disclosed (Invariant 1).

### User Story 4 - Version, remove, restore and merge catalog entries safely (Priority: P2)

Corrections never rewrite history: an edit creates a new version, Remove hides an entry from new selection, Restore makes the same identity/current version selectable again, and a merge redirects a duplicate to a survivor. Existing plans keep their references and snapshots.

**Independent Test**: Remove a food and merge a duplicate into a survivor; verify search excludes the removed food for new selection, the survivor is suggested, existing version rows and client plans are unchanged, and frozen `ExerciseSnapshotV1`/`FoodSnapshotV1` fixtures still serialize exactly. (Rendering a stored plan snapshot is an F17/F18 acceptance criterion, not an F16 exit gate.)

**Acceptance Scenarios**:
1. **Given** an authorized actor per the approved edit/merge matrix, **When** they merge food X into food Y, **Then** X is marked superseded by Y (no delete), new selection of X is redirected to Y, and an audit event records both identities.
2. **Given** a removed or superseded entry, **When** a planner loads an existing draft containing it, **Then** the draft shows a non-blocking "removed/replaced" indicator and the stored values remain intact.
3. **Given** a PO restores a removed global entry or authorized workspace staff restore a removed workspace exercise, **When** Restore succeeds, **Then** the same identity and current immutable version become selectable with one lifecycle/audit record; prior plan references and snapshots remain unchanged. **Given** X was merged into Y and Y is merged into Z, **Then** X is atomically redirected to Z; a later request targeting X resolves to active terminal Z, with no chain and no plan-reference rewrite.

**Core removal rule**: Removing from the Catalog must never mean removing from clients' existing plans.

### User Story 5 - Bilingual, accessible catalog screens (Priority: P2)

Staff browse, search (Arabic and English, with Arabic normalization), filter and add catalog entries in the Design System, AR (RTL) and EN.

**Independent Test**: Playwright + axe on catalog list, search, add-food and add-exercise in AR/EN, light/dark, mobile/desktop; Arabic search finds entries regardless of alef/hamza/ta-marbuta/diacritic variants.

### User Story 6 - PO manually sends global exercises as independent workspace copies (Priority: P1)

Source: S35-PO-1 (verbatim in Clarifications, session 2026-11-06). The global library stays protected. The PO alone decides, per action, to send selected or all global exercises to workspaces; each send creates an independent, editable workspace copy. Nothing is distributed or synchronized automatically.

**Independent Test**: As PO, send one global exercise to a workspace; verify an independent workspace exercise exists there with its own identity and version 1, the global rows are unchanged, editing the copy never changes the global row, and editing the global exercise never changes the copy. Send again: the active copy is skipped. Remove the copy and send again: a fresh copy without the old edits is created while the removed copy and all plan references stay untouched. As WO/Trainer/Sales/Client/unknown the send is denied by app authorization and by SQL.

**Acceptance Scenarios**:
1. **Given** a PO and an active global exercise E with no copy in workspace W, **When** the PO sends E to W, **Then** a new workspace-scoped exercise C (own identity, version 1) is created in W with E's current version content at send time, C records its source `(E, version)`, E and its versions are unchanged, and exactly one audit event is recorded without free-text content.
2. **Given** a copy C of E in W, **When** a W staff member with `coaching_work` edits C, **Then** a new version of C is appended (FR-004), E is unchanged, and no other workspace's copy changes. **Given** the PO later edits E (new global version), **Then** C is unchanged and nothing is propagated.
3. **Given** a non-PO actor (WO, Trainer, Sales, Client, unknown), **When** they attempt to send, **Then** the request is denied by app authorization and by RLS/RPC authorization, and no workspace row is written.
4. **Given** the PO sends "selected" exercises or "all" exercises, **When** the send runs, **Then** each exercise is processed independently: created copies, skipped existing copies and failures are reported per exercise per workspace, and a skip or failure of one never rolls back or alters another's copy.
5. **Given** an active copy of E already exists in W, **When** the PO sends E to W again, **Then** E is skipped for W: no new identity, no new version, no audit event, and the existing copy and its edits are untouched.
6. **Given** the only copy of E in W was Removed, **When** the PO sends E to W, **Then** a fresh copy is created from E's current version at send time; none of the removed copy's edits, versions or lifecycle history carry over; the removed copy is not restored, not modified and not linked to the new copy; plan references to the removed copy keep pointing at it.
7. **Given** no PO send occurs, **When** a global exercise is created, versioned, restored or merged, or a workspace or membership is created, **Then** no copy exists or is created anywhere (no automatic distribution, no update syncing).
8. **Given** existing plan versions and snapshots that reference the global exercise or any copy by explicit `(identity, version)`, **When** any send, skip or resend happens, **Then** no plan reference, snapshot, log or stored export is created, rewritten, redirected or removed.
9. **Given** the same send request (same operation key and request) is replayed or two sends of the same exercise to the same workspace race, **Then** exactly one copy exists; the replay returns the original result and the losing race reports a skip.

Edge cases for this story: sending to a workspace the PO has not explicitly supplied or a non-existent workspace is rejected with the generic denial and writes nothing; a send never reveals workspace A's copies, counts or existence to workspace B (FR-030, SC-002); sources that are Removed or merged (superseded), copy-source matching rules, and batch limits are pending MCQ-F16-4 and MCQ-F16-7.

### Edge Cases

- Same-language food with matching name and identity dimensions is an exact duplicate; the same normalized name in another language remains distinct. Test same-language blocking and cross-language distinction.
- Food measured in ml (liquids) vs g: no implicit g<->ml conversion unless the food defines a serving equivalence.
- Concurrent edit of the same entry by two actors: the second write against a stale version is rejected (optimistic concurrency), never silently overwritten.
- Merge chains: requests targeting a superseded entry resolve to its active terminal entry; when an active entry with inbound aliases is merged, all aliases are atomically repointed to the same terminal so chains never remain. Cycles are rejected.
- Restore of a removed entry: the same identity becomes selectable again using its existing current immutable content version; no version or plan reference is rewritten.
- Video reference with a disallowed host, non-https URL, or embedded credentials: rejected.
- Workspace membership revoked mid-session: next request is denied (current-membership check per request).
- Very large catalog search on the Free tier: bounded page size, indexed search, no unbounded scans.
- A staff member with roles in several workspaces adds a workspace exercise: it belongs to exactly one chosen, authorized workspace.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001** Global exercises MUST have stable identities and append-only immutable versions. Taxonomy is exactly 18 muscles (Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps, Triceps, Forearms, Abs, Spinal Erectors, Quads, Hamstrings, Glutes, Adductors, Abductors, Calves) and 10 equipment values (Barbell, Dumbbell, Cable, Machine, Smith Machine, Bodyweight, Kettlebell, Resistance Band, Suspension Trainer, Other). Arabic/English names, primary muscle and required equipment are required; secondary muscles are optional. (PO S20 Message B section 1; supersedes v3 FR-001)
- **FR-002** PO exclusively creates and manages global exercises; authorized staff manage workspace exercises. Only PO removes or merges global entries. Remove hides an entry from catalog search and prevents new selection; it does not change any existing client plan. (PO S20 Message B section 1; amended by PO S21-PO-4)
- **FR-003** Workspace exercise variations MUST be workspace-scoped rows bound to one canonical exercise identity, holding that workspace's video URL and/or note; they never alter the canonical entry. Only HTTPS YouTube and Google Drive URLs are accepted. (PO S20 Message B section 1; supersedes v3 FR-003)
- **FR-004** Staff with `coaching_work` in a workspace MUST be able to create workspace-only exercises in that workspace, versioned like global ones; they are invisible to other workspaces.
- **FR-005** Global foods MUST have a stable identity and immutable versions holding: AR/EN names (at least one), basis (`g` or `ml`), canonical product identity, preparation identity, weighing state (`raw`, `cooked`, or `not_applicable`), per-100-basis energy (kcal) and protein/carbohydrate/fat grams, optional fiber, and one or more serving units each with an exact basis equivalent. Product identity, preparation identity and weighing state are non-null; use `not_applicable` when preparation/weighing distinction does not apply. These dimensions distinguish genuinely different products and raw/cooked forms; the PO-approved dataset audit supplies/approves catalog values before import.
- **FR-006** Any staff member with `coaching_work` in at least one workspace MUST be able to add a global food that is immediately usable (PRD-05: no moderation queue). A non-PO creator MUST explicitly select one current workspace where they have `coaching_work`; the selected workspace is stored as immutable origin provenance on the food identity and its creation record/first version. A PO may create directly without workspace context (origin is NULL) or select an authorized workspace. Origin is provenance only and never changes global catalog ownership. (PO S20 Message B section 1; D16-9)
- **FR-007** Negative nutritional values and non-positive serving equivalents are rejected. When the kcal discrepancy exceeds `max(20 kcal, 10% of stated kcal)`, the system warns; it MUST NOT block saving solely for this discrepancy. (PO S20 Message B section 1; supersedes v3 FR-007)
- **FR-008** Exact-duplicate identity MUST include language, normalized name, basis, canonical product identity, preparation identity and weighing state. Near-duplicate comparisons use normalized textual similarity of at least 90%, with no automatic synonym matching, and kcal proximity at most `max(10%, 10 kcal)`, standardized per 100 g or 100 ml; compare only within the same basis and product/preparation identity and weighing state, so raw/cooked states and genuinely different products remain distinct. Block genuine catalog duplicates, while repeated foods/meals inside client plans remain allowed through Duplicate Food/Meal actions. (PO S20 Message B section 1; supersedes v3 FR-008)
- **FR-009** The creator recorded on the stable food identity or PO may publish food edits without moderation; being the author of a later version alone grants no edit right. Only PO removes or merges global entries. (PO S20 Message B section 1; amended by PO S21-PO-4)
- **FR-010** Only PO may merge global entries. Merge MUST use an active source (never removed or superseded) and mark it superseded (no delete); resolve a requested target through its `superseded_by` chain to the active terminal before merging. Atomically repoint every direct inbound alias of a merged source to that terminal, so all chains are flattened and cycles cannot form. New selection of any alias resolves to the terminal; existing plan references and published snapshots remain unchanged.
- **FR-011** Catalog content versions and audit events are immutable and never updated or deleted. Add creates an identity and its first version; Edit appends a content version; the single staff-facing lifecycle action, Remove, appends a non-destructive inactive marker without deleting content; Restore appends an active marker for the same identity and current content version, without creating or changing a content version. Removing a food or exercise hides it from catalog search and prevents new selections. Remove never cascades to a client plan and never changes, republishes, or removes an existing plan reference, snapshot, log, media availability, or historical data; only an explicit plan-editing action may remove an item from an existing plan. Global Remove and Restore are PO-only; workspace exercise Remove and Restore require `coaching_work` in that workspace. (PO S20 Message B section 1; amended by PO S21-01; Restore retained)
- **FR-012** Global catalog reads MUST be allowed to the PO directly (with or without workspace membership, BRD-02) or to authenticated staff holding `coaching_work` in at least one current workspace; the read function and RLS policy enforce the same rule; Sales, clients and unaffiliated staff are denied. Clients never read catalogs directly; they see plan-version snapshots (F17/F18/P4).
- **FR-013** Global entries MUST NOT expose creator identity or workspace of origin to non-PO actors in lists, details, duplicate candidates, pagination/counts, RPC results, errors, or exports; the immutable creator and origin provenance is visible to PO governance only (D16-9). Global-catalog audit events set `workspace_id` NULL; workspace-catalog events use that workspace. Audit details are an allowlist (action, target/version ids, related id, changed-field codes such as `name_ar`, `kcal`, `video` - codes only, never values; the immutable version rows hold the content for PO review) with no names, notes, nutrition, URLs, origin workspace, raw operation key or free text. Operation keys MUST be client-generated UUIDv4, format-validated and bound to the RPC action name before use, stored only in the idempotency table, which keeps rows for 30 days and is purged by the existing cron (counted in D16-10 storage budgets).
- **FR-014** Exercise video URLs MUST use HTTPS and only YouTube or Google Drive. A single shared global exercise identity may have independent video URLs per workspace. PO manages all mappings; authorized staff manage only their workspace mappings. Resolve the selected workspace URL dynamically under authorization; never expose another workspace's links and never require plan republishing. (PO S20 Message B section 1; supersedes v3 FR-014)
- **FR-015** Search MUST support AR and EN through a versioned, collation-independent `normalize_ar_en_v1` (Unicode NFC, explicit Arabic/Latin fold table: alef/hamza forms, ta marbuta/ha, alef maqsura/ya, diacritics and tatweel removal, locale-independent case mapping), filters (muscle group, equipment, basis), bounded pagination (max 50) and stable ordering. Algorithm changes require new columns/indexes via forward migration.
- **FR-016** Every mutating RPC MUST: authorize first; then lock all affected identity roots in deterministic UUID order (or acquire deterministic creation/key locks when a root does not yet exist); then look up `(actor_user_id, operation_key)` (same key + same request hash returns the original result; same key + different hash = conflict); re-read `current_version` and lifecycle state (stale expected version = conflict); recheck membership/capability and resource-specific ownership after lock waits and before disclosing an idempotent replay result; write exactly one audit event. Global food versioning additionally requires the actor to be the food's creator or PO, checked against the locked food identity before any write. Merge is PO-only: resolve a superseded target to its active terminal, atomically flatten direct inbound aliases to that terminal, and recheck all locked identities to prevent cycles or chains. Search is not audited per request.
- **FR-016a** Taxonomy (muscle groups, equipment) MUST be versioned: stable code, kind, AR/EN labels and lifecycle per term version; exercise versions reference term versions; PO taxonomy changes use audited RPCs and never rewrite existing exercise versions.
- **FR-017** Sales MUST have no catalog rights (deny by default; Sales coaching rights unconfirmed).
- **FR-018** UI MUST use the Design System, AR-first RTL + EN, loading/empty/error states, keyboard access, and pass the Frontend Design Gate.
- **FR-019** No YBS import and no seeded catalog content unless the PO supplies an approved starter list (BRD-06).
- **FR-020** Snapshots MUST use explicit immutable exercise/food versions. Exercise plan snapshots preserve canonical exercise identity only; the selected authorized workspace video is resolved dynamically and is not snapshotted. Food snapshots preserve the exact referenced food version and validated per-100 values. (PO S20 Message B section 1; supersedes v3 FR-020)
- **FR-021** Every role authorized by FR-006 (PO, Workspace Owner, or Trainer) is subject to at most 10 accepted new food identities per creator per rolling 24 hours, plus a platform-wide cap of 100 accepted new food identities per rolling 24 hours across all those roles; no more than 10,000 foods may be active. Exact idempotent replay consumes no additional quota. Remove/Merge decrease the active count; Restore must satisfy the active ceiling and does not consume an Add allowance. Enforce counters transactionally under concurrency-safe locks. Benchmark the catalog before production. (PO S20 Message B section 1; D16-10)
- **FR-022** The global exercise library MUST stay protected: no actor other than the PO can create, edit, remove, restore or merge a global exercise (retains FR-001, FR-002, FR-011), and no distribution action creates, versions, removes, restores or merges any global row. Workspace staff edit only their own workspace copies. (S35-PO-1: "Global library stays protected.")
- **FR-023** Only the PO MAY send global exercises to workspaces, and only by an explicit manual action that selects either chosen exercises or all exercises. Each send creates independent, editable workspace copies. WO, Trainer, Sales, Client and unknown actors are denied by app authorization and SQL (deny-by-default per FR-017; delegation is not decided, see MCQ-F16-5). Authorization action `catalog.exercise.send` (PO only, `govern_global_catalog` capability). Target workspace selection (one, several, all) is pending MCQ-F16-1. (S35-PO-1: "PO manually sends selected/all exercises as independent editable workspace copies.")
- **FR-024** A workspace copy MUST be a new workspace-scoped exercise identity (FR-004 storage) whose version 1 holds the content of the source global exercise's current immutable version at send time, with the source `(exercise_id, version)` recorded immutably on the copy. After creation the copy is independent: copy edits append copy versions only and never alter the global rows or any other workspace; later global versions, Remove, Restore or merge never alter the copy. Whether workspace variations, video mappings or default alternatives are carried is pending MCQ-F16-2; none are carried until the PO decides. (S35-PO-1: "independent editable workspace copies".)
- **FR-025** The system MUST NOT distribute or synchronize automatically: no trigger, cron, job, hook, workspace/membership-creation seed, or global-edit propagation may create, update or version a workspace copy. Copies come into existence only through the FR-023 action. No update from the global library is ever pushed to an existing copy. (S35-PO-1: "No automatic distribution or update syncing.")
- **FR-026** When an active (not Removed) copy of a source exercise already exists in the target workspace, the send MUST skip it: no new identity, no new version, no audit event, no change to the copy or its edits; the outcome is reported as skipped. A skip is not an error and does not affect other exercises or workspaces in the same request. Eligibility of a Removed or merged source and the meaning of "exists" for any other inactive state are pending MCQ-F16-4. (S35-PO-1: "Skip existing copies".)
- **FR-027** When every copy of a source exercise in the target workspace is Removed, the send MUST create a fresh copy per FR-024 from the source's current version at send time, with no content, version, lifecycle or provenance carried over from the removed copy. The removed copy and its versions and lifecycle markers stay unchanged (never Restored, never merged, never aliased to the new copy); workspace Restore remains unauthorized. (S35-PO-1: "resend deleted exercises as fresh copies without old edits".) Architect note (not PO words): "deleted" is read as the existing Remove lifecycle state (FR-011 has no hard delete).
- **FR-028** Historical plan integrity MUST be preserved: sending, skipping or resending never creates, rewrites, redirects, republishes or removes any plan reference, `ExerciseSnapshotV1`, log or stored export. Existing references to a global exercise or to any removed or active copy continue to resolve to that explicit `(identity, version)`. (S35-PO-1: "Preserve historical plan integrity."; consistent with FR-011, FR-020.)
- **FR-029** The send RPC MUST follow the FR-016 mutation order and conventions: authorize action and explicit workspace scope first; deterministic locks (source identity root and a deterministic creation lock for `(workspace_id, source_exercise_id)`, UUID order); action-bound UUIDv4 operation key with same-key/same-request replay returning the original result and same-key/different-request conflict; re-read source lifecycle and the target's copy state after locks; recheck membership/capability after lock waits; write exactly one audit event per created copy in the same transaction (global-source/workspace-target audit `workspace_id` = target workspace; allowlisted details only: identity ids, versions, related id, no names, content, URLs or free text). Audit event name and batch granularity are pending MCQ-F16-3. A forward-only migration is required at implementation time; none is created by this specification.
- **FR-030** Tenant isolation MUST hold: a copy is visible, searchable and countable only in its own workspace (FR-004, SC-002); a send discloses nothing about other workspaces' copies, existence or counts to any actor but the PO; non-PO actors never see global creator or origin provenance (FR-013).

### Approved catalog defaults and import protocol

- Exercise defaults are stored per exercise: editable warm-up/working sets, fixed or ranged reps, rest, RIR and exercise alternatives. Adding an exercise to a plan populates these defaults; coaches may override them.
- Each food may have curated default alternatives. A plan may contain at most THREE food alternatives per food; portion quantities are validated and may be overridden per plan.
- The PO supplies the food dataset later. Audit nutritional values, calories, names, duplicates, irrelevant foods and raw/cooked variants; produce the smallest useful Egyptian/Arab-oriented catalog and report corrections, exclusions, sources and alternative groups. PO approval is required before import. Never invent nutritional values or exercise content. (PO S20 Message B section 1; D16-4)

### Key Entities

- **Exercise** (global identity) / **ExerciseVersion** (immutable content).
- **WorkspaceExercise** (workspace-scoped identity) / **WorkspaceExerciseVersion**.
- **ExerciseVariation** (workspace-scoped overlay on a global exercise: video reference, note; versioned).
- **Food** (global identity with immutable `created_by`, immutable `origin_workspace_id` provenance, lifecycle state and `superseded_by`) / **FoodVersion** (immutable nutrition, normalized product/preparation identity, weighing state and serving units; the first version/creation receipt binds the identity's immutable creator and origin provenance).
- **Taxonomy**: muscle groups, equipment (PO-governed reference lists; bilingual labels).
- **CatalogAuditEvent**: via existing append-only audit log.

## Success Criteria _(mandatory)_

- **SC-001** 100% of catalog edits produce a new version; zero in-place content updates (trigger + mutation test).
- **SC-002** Zero cross-workspace visibility of workspace exercises/variations in foreign-workspace negative tests (API, RPC, RLS, search counts).
- **SC-003** A trainer can add a valid food and find it in search in under 60 seconds of interaction; exact duplicates are blocked 100% in tests.
- **SC-004** Arabic normalization test table passes for all listed variant classes.
- **SC-005** At a defined 10k-food fixture (fixed active/removed ratio, AR/EN name-length distribution, query classes and request concurrency; page size <= 50): Worker CPU p95 <= 5 ms per request (headroom under the 10 ms free-tier hard limit, cold start measured separately); DB/API p95 <= 300 ms (engineering-owned target); EXPLAIN shows the intended indexes with no unbounded scan; exact/near-duplicate checks measured against a separate budget; database and index size recorded and reported against the architecture's 70% exit trigger.
- **SC-006** Zero workspace copies exist after any non-send operation (global create/version/Remove/Restore/merge, workspace creation, membership change): automatic-distribution negative tests and a schema/source assertion that no trigger, cron or function other than the send RPC creates a copy (FR-025).
- **SC-007** 100% of non-PO send attempts across WO, Trainer, Sales, Client and unknown are denied by both the app wall and SQL, with zero rows written (FR-022, FR-023).
- **SC-008** For every (exercise, workspace) pair: an active copy yields a skip with zero writes and zero audit events; a Removed-only history yields exactly one fresh copy; concurrent and replayed sends yield exactly one copy (FR-026, FR-027, FR-029).
- **SC-009** After any send/skip/resend, global rows and versions, existing copy versions, and frozen `ExerciseSnapshotV1` fixtures are byte-identical; a mutation test that rewrites a plan reference or edits a removed copy fails (FR-024, FR-028).
- **SC-010** Each created copy produces exactly one allowlisted audit event with `workspace_id` = target workspace and no content values (FR-029).

## Approved PO decisions

D16-1a/b/c and D16-2 through D16-10 are approved and recorded in docs/04-changes-and-questions.md, S20-03 through S20-13. No D16 item remains open. The PO dataset is a future input; audit it and obtain import approval when supplied. Do not invent food values or exercise content.

## Assumptions

- `coaching_work` (PO, WO, Trainer) is the right capability for food addition and workspace exercises; PO-only `govern_global_catalog` covers global exercise and food Remove/Restore/Merge governance. Food editing additionally enforces creator-or-PO ownership on the locked identity.
- Nutrition values are per 100 g or 100 ml; micronutrients are out of scope.
- Exercise video references are links, displayed by the planner/portal; no embedding decisions are made here.

## Out of Scope

Workout/nutrition templates and planners (F17/F18), plan versions and exports, client-facing views (P4), food replacement requests (P5), Telegram, YBS import, AI-generated alternatives (PRD-12), moderation/approval queues (PRD-12), image/video uploads.

## Constitution Check

I isolation (workspace rows + composite FKs; global rows readable only by coaching staff; no origin disclosure) - II n/a (no money) - III PO governs global exercises and merges - IV traces to PRD-04/05; open items marked - V immutable versions; snapshots consumed by F17/F18 - VII no PII in catalog audit - VIII bilingual Design System + gate - IX idempotent, optimistic-concurrency RPCs.
## Clarifications

### Session 2026-11-06 — S35-PO-1 (F16 exercise distribution)

PO source: S35-PO-1, recorded verbatim in `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/s35-po-1.verbatim.txt`. F16 part, verbatim:

> F16: Global library stays protected. PO manually sends selected/all exercises as independent editable workspace copies. No automatic distribution or update syncing. Skip existing copies; resend deleted exercises as fresh copies without old edits. Preserve historical plan integrity. Supersedes previous auto-copy decisions.

Architect note (not PO words): this decision requires a Spec Kit update of specs/016 (Specify/Clarify/Plan/Tasks/Analyze) before implementation (architect notes `C:/Users/NEW LAP/.lifter/runs/s35-haiku-ledger2/notes.txt`). Architect note (not PO words): "deleted" is read as the existing Remove lifecycle state, because FR-011 allows no hard delete; a Removed copy does not count as existing.

**Supersession ledger.** History is kept; nothing is deleted.

| Item (ID and location) | Status |
|---|---|
| Earlier auto-copy / automatic distribution / update-sync decisions | **Superseded by S35-PO-1.** No FR, SC, task or contract row in specs/016 on `origin/main` (30da4f0f) or `origin/016-catalog-ui` (e3e322f6) carries such a requirement (term search recorded in the run report); if the verbatim ledger holds decisions with IDs, they are superseded by this session. Gap for the architect, non-blocking: supply those IDs so they can be cross-marked. |
| data-model.md:18 and research.md:21 ("One shared identity for every workspace"), FR-012 (coaching staff read global exercises) | Retained, not superseded. A shared global identity is not distribution. Whether planners may still select global rows directly alongside copies is MCQ-F16-6. |
| FR-003, FR-014, T020, T023 (workspace variations/video overlay on a global identity) | Retained. Interplay with copies is MCQ-F16-2. |
| FR-019, T006 (no seeded catalog content) | Retained and reinforced by FR-025. |
| FR-001, FR-002, FR-011, FR-020 (global library PO-governed, Remove non-destructive, snapshots by explicit version) | Retained; S35-PO-1 builds on them (FR-022, FR-028). |

**Resolved by S35-PO-1** (see User Story 6, FR-022 to FR-030, SC-006 to SC-010): PO-only manual send of selected or all exercises; independent editable copies; global library protected; no automatic distribution or update syncing; skip existing copies; Removed copies are resent as fresh copies without old edits; historical plan integrity.

**PO-DECISION-NEEDED (not settled by the PO words; not encoded as requirements):**

- **MCQ-F16-1** Target workspace selection: one, several or all workspaces per send.
- **MCQ-F16-2** Whether video variations, workspace mappings or default alternatives are carried onto a copy.
- **MCQ-F16-3** Audit event name and batch granularity (one event per created copy vs one per batch).
- **MCQ-F16-4** Meaning of "exists" for inactive states, and sending Removed or merged global sources.
- **MCQ-F16-5** Whether WO or Trainer may also send (delegation).
- **MCQ-F16-6** Whether planners may still select global exercises directly (FR-012) or only workspace copies.
- **MCQ-F16-7** Batch size limit and where the send surface lives (UI placement and bilingual copy).

Options, implications and recommendations: `C:/Users/NEW LAP/.lifter/runs/s35-sonnet-f16-dist/report.md`. Open ambiguities remain: the seven items above. The backend of FR-022, FR-026 to FR-028, FR-030 and SC-006 to SC-009 does not depend on them. Send-RPC input shape, audit naming and UI tasks are blocked as tagged in tasks.md.

### Session 2026-11-04 — S33-PO-4

PO source: S33-PO-4, “Fix stack drift, flaky tests, billing-related CI blockers, and PR/issue backlog organization.” The S33 F16 change only makes the existing taxonomy/search integration lookup page through synthetic catalog rows with a fixed bound, or narrows it to a unique filter while preserving the same expected result. It does not change search semantics, visibility, limits, or catalog data. No open ambiguities remain within this test-only S33 scope.
