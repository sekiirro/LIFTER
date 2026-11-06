# Feature Specification: F16 Exercise & Food Catalogs

**Feature Branch**: `016-exercise-food-catalogs`
**Status**: S36 spec-only redesign; existing implementation and prior PO decisions remain historical inputs. No implementation, migration or SQL is part of this change.
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

### User Story 2 - One global exercise catalog with workspace overrides (Priority: P1)

Coaching staff see one shared global exercise catalog in every authorized workspace. Each workspace has an independent override for the allowlisted fields name, description, instructions, video and alternatives. A workspace-private exercise created by a Trainer remains private to its workspace. This is one catalog with overlays, not duplicated global libraries.

**Independent Test**: Create one canonical global exercise and overrides in two synthetic workspaces. Verify both workspaces resolve the same canonical identity, each sees its own allowed override values, and neither workspace can read or infer the other's override or private exercise. Verify an edit made by the PO while operating in a personal workspace changes that workspace's override only.

**Acceptance Scenarios**:
1. **Given** a global exercise visible in workspace A and workspace B, **When** authorized staff open the workspace library, **Then** each sees the shared global entry together with only that workspace's override state.
2. **Given** a Trainer or WO with current `coaching_work` in workspace A, **When** they create or edit an override, **Then** only name, description, instructions, video and alternatives can be changed, and the canonical global identity and content remain unchanged.
3. **Given** the PO edits an exercise while scoped to the PO's personal workspace, **When** the change is saved, **Then** it writes to that workspace's override only and leaves canonical global content unchanged.
4. **Given** a Trainer creates a new exercise in workspace A, **When** the creation succeeds, **Then** it is a workspace-private exercise visible only in workspace A and does not become a global catalog entry.
5. **Given** a workspace is newly created, **When** it becomes available, **Then** it has its own automatically established video mapping without staff manually creating it; representation, timing and initial value remain PO-DECISION-NEEDED F16-MCQ-1/-2.
6. **Given** a workspace-A override or private exercise, **When** a caller without current workspace-A authorization reads from workspace B or through a client/plan path, **Then** the read is denied generically and reveals no foreign row, video, count, identifier existence or error distinction.

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

### User Story 6 - Resolve exercise video for a client viewing a global template (Priority: P1)

A global workout template keeps canonical exercise identity. When the template is viewed for a client, the exercise video is resolved using that client's workspace at view time. Workspace video edits are reflected in a later view without republishing the global template. Historical plan content remains preserved; behavior for historical non-video override fields is PO-DECISION-NEEDED F16-MCQ-3.

**Independent Test**: Use synthetic global template and client/workspace fixtures. Verify authorized client-plan rendering resolves only the client's workspace video, a later video update is visible on a subsequent view without republishing, and a request lacking authorization returns generic denial without exposing another workspace's media.

**Acceptance Scenarios**:
1. **Given** a global template and a client in an authorized workspace, **When** the template is viewed for that client, **Then** each exercise video is resolved at view time from that client's workspace with global video fallback when no workspace video is configured.
2. **Given** the workspace video has changed since a prior view, **When** the same template is viewed again for the authorized client, **Then** the updated video is resolved without changing or republishing the template.
3. **Given** a client-view request without the required plan/client workspace authorization, **When** video resolution is attempted, **Then** it is denied with generic security behavior and no foreign workspace information is disclosed.

### Edge Cases

- Same-language food with matching name and identity dimensions is an exact duplicate; the same normalized name in another language remains distinct. Test same-language blocking and cross-language distinction.
- Food measured in ml (liquids) vs g: no implicit g<->ml conversion unless the food defines a serving equivalence.
- Concurrent edit of the same entry by two actors: the second write against a stale version is rejected (optimistic concurrency), never silently overwritten.
- Merge chains: requests targeting a superseded entry resolve to its active terminal entry; when an active entry with inbound aliases is merged, all aliases are atomically repointed to the same terminal so chains never remain. Cycles are rejected.
- Restore of a removed entry: the same identity becomes selectable again using its existing current immutable content version; no version or plan reference is rewritten.
- Video reference with a disallowed host, non-https URL, or embedded credentials: rejected.
- A global exercise has no workspace override: video resolution uses the canonical global video fallback.
- Workspace membership revoked mid-session: next request is denied (current-membership check per request).
- Very large catalog search on the Free tier: bounded page size, indexed search, no unbounded scans.
- A staff member with roles in several workspaces adds a workspace exercise: it belongs to exactly one chosen, authorized workspace.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001** Global exercises MUST have stable identities and append-only immutable versions. Taxonomy is exactly 18 muscles (Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps, Triceps, Forearms, Abs, Spinal Erectors, Quads, Hamstrings, Glutes, Adductors, Abductors, Calves) and 10 equipment values (Barbell, Dumbbell, Cable, Machine, Smith Machine, Bodyweight, Kettlebell, Resistance Band, Suspension Trainer, Other). Arabic/English names, primary muscle and required equipment are required; secondary muscles are optional. (PO S20 Message B section 1; supersedes v3 FR-001)
- **FR-002** PO exclusively creates and manages global exercises; authorized staff manage workspace exercises. Only PO removes or merges global entries. Remove hides an entry from catalog search and prevents new selection; it does not change any existing client plan. (PO S20 Message B section 1; amended by PO S21-PO-4)
- **FR-003** A global exercise MUST have one canonical global identity. Every authorized workspace MUST expose that shared entry together with its own independent override scope; workspaces MUST NOT receive duplicated global exercise identities. An override is workspace-scoped, bound to the canonical identity and limited to name, description, instructions, video and alternatives. An override MUST NOT mutate canonical global content or another workspace's override. Only HTTPS YouTube and Google Drive URLs are accepted for video values. The exact storage/creation semantics for automatic mappings, alternative-list composition and localization of name overrides remain PO-DECISION-NEEDED F16-MCQ-1, -2, -4 and -8.
- **FR-004** Staff with `coaching_work` in a workspace MUST be able to create workspace-only exercises in that workspace, versioned like workspace-owned entries; they are invisible to other workspaces and are not global catalog entries. Every workspace library MUST present its authorized shared global entries and that workspace's override state together with its workspace-private exercises, without exposing other workspaces' rows or counts.
- **FR-005** Global foods MUST have a stable identity and immutable versions holding: AR/EN names (at least one), basis (`g` or `ml`), canonical product identity, preparation identity, weighing state (`raw`, `cooked`, or `not_applicable`), per-100-basis energy (kcal) and protein/carbohydrate/fat grams, optional fiber, and one or more serving units each with an exact basis equivalent. Product identity, preparation identity and weighing state are non-null; use `not_applicable` when preparation/weighing distinction does not apply. These dimensions distinguish genuinely different products and raw/cooked forms; the PO-approved dataset audit supplies/approves catalog values before import.
- **FR-006** Any staff member with `coaching_work` in at least one workspace MUST be able to add a global food that is immediately usable (PRD-05: no moderation queue). A non-PO creator MUST explicitly select one current workspace where they have `coaching_work`; the selected workspace is stored as immutable origin provenance on the food identity and its creation record/first version. A PO may create directly without workspace context (origin is NULL) or select an authorized workspace. Origin is provenance only and never changes global catalog ownership. (PO S20 Message B section 1; D16-9)
- **FR-007** Negative nutritional values and non-positive serving equivalents are rejected. When the kcal discrepancy exceeds `max(20 kcal, 10% of stated kcal)`, the system warns; it MUST NOT block saving solely for this discrepancy. (PO S20 Message B section 1; supersedes v3 FR-007)
- **FR-008** Exact-duplicate identity MUST include language, normalized name, basis, canonical product identity, preparation identity and weighing state. Near-duplicate comparisons use normalized textual similarity of at least 90%, with no automatic synonym matching, and kcal proximity at most `max(10%, 10 kcal)`, standardized per 100 g or 100 ml; compare only within the same basis and product/preparation identity and weighing state, so raw/cooked states and genuinely different products remain distinct. Block genuine catalog duplicates, while repeated foods/meals inside client plans remain allowed through Duplicate Food/Meal actions. (PO S20 Message B section 1; supersedes v3 FR-008)
- **FR-009** The creator recorded on the stable food identity or PO may publish food edits without moderation; being the author of a later version alone grants no edit right. Only PO removes or merges global entries. (PO S20 Message B section 1; amended by PO S21-PO-4)
- **FR-010** Only PO may merge global entries. Merge MUST use an active source (never removed or superseded) and mark it superseded (no delete); resolve a requested target through its `superseded_by` chain to the active terminal before merging. Atomically repoint every direct inbound alias of a merged source to that terminal, so all chains are flattened and cycles cannot form. New selection of any alias resolves to the terminal; existing plan references and published snapshots remain unchanged.
- **FR-011** Catalog content versions and audit events are immutable and never updated or deleted. Add creates an identity and its first version; Edit appends a content version; the single staff-facing lifecycle action, Remove, appends a non-destructive inactive marker without deleting content; Restore appends an active marker for the same identity and current content version, without creating or changing a content version. Removing a food or exercise hides it from catalog search and prevents new selections. Remove never cascades to a client plan and never changes, republishes, or removes an existing plan reference, snapshot, log, media availability, or historical data; only an explicit plan-editing action may remove an item from an existing plan. Global Remove and Restore are PO-only; workspace exercise Remove and Restore require `coaching_work` in that workspace. (PO S20 Message B section 1; amended by PO S21-01; Restore retained)
- **FR-012** Global catalog reads MUST be allowed to the PO directly (with or without workspace membership, BRD-02) or to authenticated staff holding `coaching_work` in at least one current workspace; the read function and RLS policy enforce the same rule; Sales, clients and unaffiliated staff are denied. Clients never read catalogs directly; they see plan-version snapshots (F17/F18/P4).
- **FR-013** Global entries MUST NOT expose creator identity or workspace of origin to non-PO actors in lists, details, duplicate candidates, pagination/counts, RPC results, errors, or exports; the immutable creator and origin provenance is visible to PO governance only (D16-9). Global-catalog audit events set `workspace_id` NULL; workspace-catalog events use that workspace. Audit details are an allowlist (action, target/version ids, related id, changed-field codes such as `name_ar`, `kcal`, `video` - codes only, never values; the immutable version rows hold the content for PO review) with no names, notes, nutrition, URLs, origin workspace, raw operation key or free text. Operation keys MUST be client-generated UUIDv4, format-validated and bound to the RPC action name before use, stored only in the idempotency table, which keeps rows for 30 days and is purged by the existing cron (counted in D16-10 storage budgets).
- **FR-014** Exercise video URLs MUST use HTTPS and only YouTube or Google Drive. A single shared global exercise identity MUST support a global video value and independent workspace video overrides. When no workspace video override is configured, the global video is the fallback. Every newly created workspace MUST automatically have its own video mapping without manual staff creation; representation, timing and initial value remain PO-DECISION-NEEDED F16-MCQ-1/-2. WO/Trainer may write only the override for their currently authorized workspace; a PO action scoped to a personal workspace writes only that workspace's override. Canonical global edits remain separately scoped and are PO-DECISION-NEEDED F16-MCQ-5. For global templates viewed for a client, video resolution MUST use the client workspace at view time, including after video updates and without republishing. Resolution MUST authorize the selected workspace on every request, expose the resolved source (workspace override or global fallback) to the authorized caller, and deny generically without revealing another workspace's media, existence, counts or errors. Removal behavior remains PO-DECISION-NEEDED F16-MCQ-6.
- **FR-015** Search MUST support AR and EN through a versioned, collation-independent `normalize_ar_en_v1` (Unicode NFC, explicit Arabic/Latin fold table: alef/hamza forms, ta marbuta/ha, alef maqsura/ya, diacritics and tatweel removal, locale-independent case mapping), filters (muscle group, equipment, basis), bounded pagination (max 50) and stable ordering. Algorithm changes require new columns/indexes via forward migration.
- **FR-016** Every mutating RPC MUST: authorize first; then lock all affected identity roots in deterministic UUID order (or acquire deterministic creation/key locks when a root does not yet exist); then look up `(actor_user_id, operation_key)` (same key + same request hash returns the original result; same key + different hash = conflict); re-read `current_version` and lifecycle state (stale expected version = conflict); recheck membership/capability and resource-specific ownership after lock waits and before disclosing an idempotent replay result; write exactly one audit event. Global food versioning additionally requires the actor to be the food's creator or PO, checked against the locked food identity before any write. Merge is PO-only: resolve a superseded target to its active terminal, atomically flatten direct inbound aliases to that terminal, and recheck all locked identities to prevent cycles or chains. Search is not audited per request.
- **FR-016a** Taxonomy (muscle groups, equipment) MUST be versioned: stable code, kind, AR/EN labels and lifecycle per term version; exercise versions reference term versions; PO taxonomy changes use audited RPCs and never rewrite existing exercise versions.
- **FR-017** Sales MUST have no catalog rights (deny by default; Sales coaching rights unconfirmed).
- **FR-018** UI MUST use the Design System, AR-first RTL + EN, loading/empty/error states, keyboard access, and pass the Frontend Design Gate. The workspace exercise library MUST present the shared global entries and the current workspace's overrides in one library view. The override editor MUST expose only name, description, instructions, video and alternatives to WO/Trainer. Personal-workspace PO edits MUST target that workspace override; canonical global edit remains separately scoped. Visual details follow `DESIGN.md`, `specs/002-design-system/`, and existing implemented tokens/components; this feature adds no visual token or design pattern.
- **FR-019** No YBS import and no seeded catalog content unless the PO supplies an approved starter list (BRD-06).
- **FR-020** Snapshots MUST use explicit immutable exercise/food versions. Exercise plan snapshots preserve canonical exercise identity and historical plan content; exercise video is resolved dynamically for the client workspace at each authorized view and is not snapshotted into a global template. A workspace video update MUST affect a subsequent view without republishing the global template. Historical behavior for non-video override values remains PO-DECISION-NEEDED F16-MCQ-3 and MUST NOT be guessed in requirements or tests. Food snapshots preserve the exact referenced food version and validated per-100 values. (PO S20 Message B section 1; supersedes v3 FR-020)
- **FR-021** Every role authorized by FR-006 (PO, Workspace Owner, or Trainer) is subject to at most 10 accepted new food identities per creator per rolling 24 hours, plus a platform-wide cap of 100 accepted new food identities per rolling 24 hours across all those roles; no more than 10,000 foods may be active. Exact idempotent replay consumes no additional quota. Remove/Merge decrease the active count; Restore must satisfy the active ceiling and does not consume an Add allowance. Enforce counters transactionally under concurrency-safe locks. Benchmark the catalog before production. (PO S20 Message B section 1; D16-10)

### Approved catalog defaults and import protocol

- Exercise defaults are stored per exercise: editable warm-up/working sets, fixed or ranged reps, rest, RIR and exercise alternatives. Adding an exercise to a plan populates these defaults; coaches may override them.
- Each food may have curated default alternatives. A plan may contain at most THREE food alternatives per food; portion quantities are validated and may be overridden per plan.
- The PO supplies the food dataset later. Audit nutritional values, calories, names, duplicates, irrelevant foods and raw/cooked variants; produce the smallest useful Egyptian/Arab-oriented catalog and report corrections, exclusions, sources and alternative groups. PO approval is required before import. Never invent nutritional values or exercise content. (PO S20 Message B section 1; D16-4)

### Key Entities

- **Exercise** (global identity) / **ExerciseVersion** (immutable content).
- **WorkspaceExercise** (workspace-scoped identity) / **WorkspaceExerciseVersion**.
- **ExerciseOverride** (one workspace-scoped, versioned overlay bound to a global exercise: name, description, instructions, video and alternatives only; auto-mapping details remain open).
- **ExerciseVariation** (legacy workspace-scoped mapping/version history to be reconciled by a forward-only migration design; it does not create a second global library).
- **ExerciseOverride** (one workspace-scoped, versioned override bound to one global exercise identity; allowlisted fields are name, description, instructions, video and alternatives; workspace video resolution exposes whether the result came from the workspace override or global fallback. Whether mapping rows are materialized automatically and how alternatives combine remain PO-DECISION-NEEDED.)
- **Food** (global identity with immutable `created_by`, immutable `origin_workspace_id` provenance, lifecycle state and `superseded_by`) / **FoodVersion** (immutable nutrition, normalized product/preparation identity, weighing state and serving units; the first version/creation receipt binds the identity's immutable creator and origin provenance).
- **Taxonomy**: muscle groups, equipment (PO-governed reference lists; bilingual labels).
- **CatalogAuditEvent**: via existing append-only audit log.

## Success Criteria _(mandatory)_

- **SC-001** 100% of catalog edits produce a new version; zero in-place content updates (trigger + mutation test).
- **SC-002** Zero cross-workspace visibility of workspace exercises/variations in foreign-workspace negative tests (API, RPC, RLS, search counts).
- **SC-003** A trainer can add a valid food and find it in search in under 60 seconds of interaction; exact duplicates are blocked 100% in tests.
- **SC-004** Arabic normalization test table passes for all listed variant classes.
- **SC-005** At a defined 10k-food fixture (fixed active/removed ratio, AR/EN name-length distribution, query classes and request concurrency; page size <= 50): Worker CPU p95 <= 5 ms per request (headroom under the 10 ms free-tier hard limit, cold start measured separately); DB/API p95 <= 300 ms (engineering-owned target); EXPLAIN shows the intended indexes with no unbounded scan; exact/near-duplicate checks measured against a separate budget; database and index size recorded and reported against the architecture's 70% exit trigger.
- **SC-006** In workspace-pair isolation tests, 100% of global exercise identities are shared, while 0 foreign workspace overrides/private exercises, videos, counts or existence signals are returned to an unauthorized workspace/client request.
- **SC-007** Override mutation tests prove 100% of accepted WO/Trainer changes are limited to name, description, instructions, video and alternatives; 100% of attempts outside that allowlist and all cross-workspace writes are denied.
- **SC-008** A personal-workspace PO override edit changes only that workspace override and leaves the canonical exercise identity/version unchanged in 100% of tests.
- **SC-009** For authorized global-template client views, 100% of exercise video reads resolve using the client workspace at view time; a subsequent workspace video update is visible on the next view without republishing, and no other workspace's media is returned.
- **SC-010** Workspace library UI acceptance tests show shared global entries and only that workspace's overrides together; the override editor presents only the five allowed override fields.
- **SC-011** Historical plan acceptance tests preserve the canonical exercise identity and historical plan data. Tests for live/snapshot behavior of overridden name/instructions and for override-removal behavior remain blocked by F16-MCQ-3 and F16-MCQ-6 respectively.
- **SC-012** 100% of newly created workspaces have an automatically established logical exercise-video mapping without manual staff setup; implementation timing, row materialization and initial value remain blocked by F16-MCQ-1/-2.

## Approved PO decisions

D16-1a/b/c and D16-2 through D16-10 for the existing catalog/food scope are approved and recorded in docs/04-changes-and-questions.md, S20-03 through S20-13. The PO dataset is a future input; audit it and obtain import approval when supplied. Do not invent food values or exercise content. The separate S36 F16 redesign decisions F16-MCQ-1 through F16-MCQ-8 remain open in `decision-register.md`.

## Assumptions

- `coaching_work` (PO, WO, Trainer) is the right capability for food addition and workspace exercises; PO-only `govern_global_catalog` covers global exercise and food Remove/Restore/Merge governance. Food editing additionally enforces creator-or-PO ownership on the locked identity.
- Nutrition values are per 100 g or 100 ml; micronutrients are out of scope.
- Exercise video references are links, displayed by the planner/portal; no embedding decisions are made here.

## Out of Scope

Workout/nutrition templates and planners (F17/F18), plan versions and exports, client-facing views (P4), food replacement requests (P5), Telegram, YBS import, AI-generated alternatives (PRD-12), moderation/approval queues (PRD-12), image/video uploads.

## Constitution Check

I isolation (workspace rows + composite FKs; global rows readable only by coaching staff; no origin disclosure) - II n/a (no money) - III PO governs global exercises and merges - IV traces to PRD-04/05; open items marked - V immutable versions; snapshots consumed by F17/F18 - VII no PII in catalog audit - VIII bilingual Design System + gate - IX idempotent, optimistic-concurrency RPCs.
## Clarifications

### Session 2026-11-04 — S33-PO-4

PO source: S33-PO-4, “Fix stack drift, flaky tests, billing-related CI blockers, and PR/issue backlog organization.” The S33 F16 change only makes the existing taxonomy/search integration lookup page through synthetic catalog rows with a fixed bound, or narrows it to a unique filter while preserving the same expected result. It does not change search semantics, visibility, limits, or catalog data. No open ambiguities remain within this test-only S33 scope.

### Session 2026-11-06 — S35-PO-3 F16 REDESIGN (binding)

PO source: `C:/Users/NEW LAP/.lifter/runs/s35-ledger3/s35-po-3.verbatim.txt`, F16 REDESIGN paragraph, quoted byte-for-byte as UTF-8:

> **F16 REDESIGN (supersedes #64/manual distribution):** ONE shared global exercise catalog, automatically visible in every workspace via independent editable workspace-specific overrides, NOT duplicated libraries. Each workspace has its own video; fallback to global video. WO/Trainers may edit their workspace name, description, instructions, video and alternatives only. New exercises created by Trainers remain workspace-private. PO's personal workspace edits also affect ONLY its override, never the canonical global original. New workspaces automatically get their own video mapping. Global workout templates must work across all workspaces; resolve exercise videos by CLIENT workspace at viewing time, including after video updates. Preserve historical plans, tenant isolation and authorization. Audit impacts on #43, #64 and F17–F19; supersede conflicting specs/decisions without deleting history.

### Session 2026-11-06 — S36-PO-1 Priorities (binding)

PO source: `C:/Users/NEW LAP/.lifter/runs/s36-po/s36-po-1.verbatim.txt`, Priorities line, quoted byte-for-byte as UTF-8:

> **Priorities:** Implement the approved F16 ONE-global-library redesign through full Spec Kit, independent review and safe delegation; supersede #64/manual distribution. Resolve #43 compatibility and merge only under existing conditional authorization and live gates. Continue F4 #65 security fixes, approved alerts/escalation rules, N11 English copy, and pending PR remediation. Surface only genuinely unresolved PO decisions.

The seven F16 compatibility MCQs plus the additional localization question in `decision-register.md` remain PO-DECISION-NEEDED. The binding paragraphs above do not authorize selecting an answer to any of those MCQs. No open ambiguities are claimed resolved for their affected behavior.

**Ambiguity status:** Open. Eight numbered PO decisions remain unresolved in `decision-register.md`; requirements, defaults and tests must not select their answers. The global-catalog, field allowlist, private exercise, PO personal-workspace routing, global fallback, client-view and historical-preservation behaviors stated above are direct S35-PO-3 decisions, not interpretations of the remaining MCQs.
