# Feature Specification: F18 Nutrition Templates & Nutrition Planner

**Feature Branch**: `018-nutrition-planner`
**Status**: PO-approved specification; not implemented (review history in debate.md)
**Phase**: P3 (roadmap)
**Input**: PRD-05 (global/shared nutrition templates, plan editor, single-day or seven-day repeating structure, carb cycling, conditional pre-workout meals on rest days, multiple published plans, manual alternatives with precise grams, unified client-visible alternatives, versioning preserves coach source, PDF/Excel, no meal logging), PRD-06 and shared Plan Core (independent first deliveries and exactly-once activation), amended PRD-12 (global and workspace templates per D18-1), Constitution V, F16 final (food snapshots, shared helpers), F17 final + shared Plan Core ("PC") contract.

D18-1, D18-2, D18-4, D18-6 and D18-9 are approved and binding; no D18 decision remains pending.

## Why this feature, why now

The first nutrition delivery may occur before or after the first workout delivery. The subscription activates exactly once after both succeed; F18 consumes Plan Core rather than defining another lifecycle.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build a client nutrition plan (Priority: P1)

A Trainer, WO or PO builds a client's nutrition plan from global foods: meals with foods in exact quantities (basis g/ml or defined serving units), per-meal notes, optional recipe text and video links, computed daily calories and macros, and either a single repeating day or a seven-day structure with day types (carb cycling, training vs rest days, conditional pre-workout meal omitted on rest days).

**Independent Test**: Build a 7-day plan with high/low carb day types and a pre-workout meal flagged training-days-only; verify per-meal and per-day totals equal the golden-fixture values for the snapshot values and quantities, and that rest days omit the conditional meal.

**Acceptance Scenarios**:
1. **Given** an approved client in workspace A and `coaching_work` in A, **When** staff add foods with quantities, **Then** macros are computed from the selected food version's per-100 values and the unit's exact basis equivalent with exact decimal arithmetic; intermediate arithmetic stays exact, computed totals are rounded once half-even to four decimal places for storage, and the UI displays calories and macros as integers (D18-4=C).
2. **Given** a unit the food version does not define (e.g. ml for a g-basis food without an equivalence), **When** entered, **Then** it is rejected; no implicit conversion (PRD-05 acceptance).
3. **Given** a seven-day structure with day types, **When** a meal is `training_days_only`, **Then** it appears only on days whose resolved day type has `trainingDay = true`.
4. **Given** reorder, duplicate meal/day or drag of foods, **Then** quantities, alternatives and notes are preserved exactly; duplicates remap their own and all descendant ids.
5. **Given** concurrent edits, **Then** the stale save is rejected (Plan Core optimistic concurrency).

### User Story 2 - Coach-configured manual alternatives (Priority: P1)

For a food item, staff configure manual alternatives, each with a precise quantity and calculated macros, shown as one unified list (no strict/functional split).

**Independent Test**: Configure two alternatives for an item; verify each alternative's macros derive from its own food version and quantity; verify the published version stores one unified list.

**Acceptance Scenarios**:
1. **Given** an item, **When** an alternative is added with a quantity, **Then** its macros are computed; nothing auto-adjusts quantities (no AI, PRD-12). No delta-versus-original display (not in PRD-05; out of scope unless separately approved).
2. **Given** an alternative whose food is retired or merged in F16, **When** the draft is opened, **Then** an indicator appears and the stored snapshot values remain unchanged.

### User Story 3 - Global and workspace nutrition templates (Priority: P1)

Staff load a global nutrition template into a client plan and customize it independently. Authorized staff may manage workspace templates; PO manages global templates and may Make it Global after removing private data/references (D18-1 amendment).

**Independent Test**: Authorized staff create and version a workspace-A template; workspace B cannot list or load it. Load its v2 into a client draft, then publish template v3; the draft and published client versions remain unchanged. The PO can Make it Global only after private data and references are removed.

**Acceptance Scenarios**:
1. **Given** authorized staff in workspace A, **When** they create or edit a workspace nutrition template, **Then** its identity and immutable versions are scoped to A and unavailable to workspace B.
2. **Given** a workspace template selected by the PO for global promotion, **When** Make it Global runs, **Then** only eligible template content without private data or references is copied into a separate global identity/version; the workspace original remains unchanged (D18-1).

### User Story 4 - Ready, publish revisions, multiple plans (Priority: P1)

Plan Core lifecycle is defined only in specs/019-plan-core. First plans may be delivered independently; activation occurs once after both succeed. Multiple published nutrition plans may be simultaneously eligible (PRD-05, settled); all are shown with dates, newest first; none auto-archived.

**Independent Test**: As F17 US3 (edit between publications, `source_revision` uniqueness, unchanged re-publish returns the existing version), plus two simultaneously published plans for one activated client both remain listed and exportable.

### User Story 5 - Client alternative selection (server side) (Priority: P2)

The client may select one coach-approved alternative per item in a published version. Selection is client-owned state, never overwrites the coach-authored source; the latest serialized accepted selection wins. The client UI ships in P4; F18 delivers the data model and the self-only RPC.

**Independent Test**: As the client, select alternative 2 of item X in version N; verify the source version is unchanged, a selection row exists, an id not in that item's list is rejected generically, a foreign client or forged plan/version/client combination cannot select, and direct table DML is denied.

**Acceptance Scenarios**:
1. **Given** a newer version where an item or approved alternative no longer exists, **Then** the old selection is discarded and the coach default shows. A valid selection carries forward only while the client remains authorized and the stable item and alternative remain (D18-9=A).
2. **Given** exports, **Then** they reflect the current permitted selection while showing the coach source (PRD-05).

### User Story 6 - Export (Priority: P2)

Staff export a selected published version only (D17-8=A) to PDF/Excel via the shared Plan Core export module, with per-meal and per-day totals and alternatives.

### Edge Cases

- Snapshot vs current catalog values differ: plan shows snapshot values; refreshing to the latest food version is an explicit coach action per item.
- Zero-calorie items and very small quantities; exact-precision boundaries in golden fixtures.
- Seven-day plan where every day is a rest day (conditional meals never appear).
- Two simultaneously eligible plans with conflicting targets (allowed; no one-active constraint).
- Stable item ids across revisions (needed by P5 replacement requests and selections).
- Maximum-size document and Worker CPU on publish verification.
- Spreadsheet formula prefixes in coach-authored text.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001** Nutrition plans MUST use the shared identity, draft/revision, readiness, publication, first-delivery and activation contract in [019 Plan Core](../019-plan-core/spec.md), PC-FR-001 through PC-FR-007. F18 owns nutrition schema, exact calculations, templates, selections and exports only. (PO S20 Message B section 4; supersedes v3 FR-001)
- **FR-001b** Every mutating operation (draft save, ready/unready, template create/version/retire/load, publish, selection) MUST use the shared `app_private.operation_keys` idempotency ledger: client UUIDv4 key + canonical request hash scoped by actor, action and resource; same key + hash returns the original result; different hash conflicts.
- **FR-002** Document schema v1 MUST define: `single_day` = exactly one implicit day and no `days` array, with an `implicitDayTypeId` that is ALWAYS required and resolves to a day type (so `training_days_only` meals use its `trainingDay` flag); `seven_day` = dayIndex 0-6 each exactly once, every `dayTypeId` resolves; day types with names, `trainingDay` flag and optional calorie/macro targets (D18-2=A); document, day-type, meal, item and alternative ids unique within the document; every meal resolves to at least one day; `conditional: 'always'|'training_days_only'` derived from the resolved day type; ordered food items referencing an exact food version, quantity `{value: decimal string, unit}`, notes, and manual alternatives (food version, quantity, unit); optional recipe/preparation video link to HTTPS YouTube or Google Drive; its icon/link is entirely hidden when absent; exact per-meal and per-day computed-totals shapes. Quantities positive, targets non-negative. A `training_days_only` meal in a document with no reachable training day is a draft warning and is rejected at `mark_nutrition_ready`/publish. Note: plan quantities (<= 3 decimals) live in the document; `FoodSnapshotV1` carries only per-100 nutrient values at F16 fixed scales - the two are distinct. App and RPC validators share the same fixtures.
- **FR-003** One canonical macro algorithm with exact decimal/rational arithmetic and no intermediate rounding: per-item = per-100 snapshot value x basis quantity / 100, using only the food version's declared serving equivalences. All quantities, targets and totals are decimal strings, never JavaScript numbers. TypeScript (UI, export) and SQL (publish) implementations MUST pass identical fixed golden fixtures. Canonical representation (identical in TS and SQL): quantities <= 3 decimals, serving equivalences <= 4 decimals, per-100 values at F16 fixed scales; exact intermediate arithmetic; stored totals are the exact result rounded ONCE, half-even, to 4 decimals, serialized as fixed-scale strings; values beyond `numeric(12,4)` are rejected. Fixtures assert serialized outputs incl. repeating fractions and boundaries. Display calories and macros as integers; preserve exact decimal calculations and storage. Display rounding never changes stored values. (PO S20 Message B section 3; supersedes v3 FR-003)
- **FR-004** Unit conversion MUST use only the food version's declared serving equivalences; undefined conversions are rejected.
- **FR-005** The publish transaction MUST ignore caller-supplied snapshots and totals, load every referenced exact F16 food version (incl. alternatives), rebuild `FoodSnapshotV1`, recompute totals in the database and store only those; published versions always store computed totals (engineering requirement for export/audit integrity). Publish RPCs follow the established SECURITY DEFINER pattern; version rows reject UPDATE/DELETE/TRUNCATE.
- **FR-006** Alternatives are coach-configured existing food catalog entries, with at most THREE default alternatives per food in a plan. Each alternative has a validated portion quantity and calculated macros; coaches may override quantities per plan. No alternatives are invented automatically. (PO S20 Message B section 1)
- **FR-007** Global nutrition templates are PO-managed; authorized staff manage workspace-owned templates. The PO may use Make it Global on an eligible template, copying only approved template content and excluding private data and references. Apply two-wall authorization, immutable versions, creator/origin masking for non-PO, safe audit and explicit-version copy semantics. (PO S20 Message B section 3; D18-1 amendment)
- **FR-008** Multiple published nutrition plans per client MUST be allowed and listed newest first with dates; no automatic archive or deletion.
- **FR-009** Client selections apply only to coach-approved alternatives in the published version. On publish, copy a version-scoped selection to the new version only when the client remains authorized and the same stable item ID and approved alternative ID both exist; if either ID is absent or invalid, write no selection for that new version so the coach default applies. Selections never create plans or affect other clients. (PO S20 Message B section 3; supersedes v3 FR-009)
- **FR-010** Export authorization MUST check both walls (`has_workspace_access(plan.workspace_id, coaching_work)` in app and RLS) before any read. Exports MUST include meals, items, quantities, alternatives, per-meal/day totals, day types and the client's current permitted selection marked as such; ExcelJS writes coach-authored cells as strings (formula-injection tests).
- **FR-010a** Every successful plan/template/selection mutation and every export (and export denial) appends one audit event with an allowlist: action, workspace, actor, resource/version/item/alternative ids, changed-field codes. Never food names, quantities, macros, notes, recipe text, URLs, client display data, document JSON, free text or raw operation keys. Log-scrub tests prove zero health-content occurrences.
- **FR-010b** Every successful draft save and publication attributes the acting staff member; each published version exposes an immutable contributor set (staff ids, action codes, timestamps only) of all staff who contributed since the previous version (PRD-06 "other trainer contributions recorded independently"); `action_code` is a CHECK-constrained enum (`draft_save`, `ready`, `unready`, `publish`, `template_load`); P4 records the responsible trainer separately.
- **FR-011** Excluded: meal check-offs, consumption logs, calorie diary, AI-generated alternatives, offline client queue, and food replacement requests (P5). Workspace nutrition templates are in scope under amended D18-1; Telegram AI may only select coach-approved existing alternatives. (PO S20 Message B section 3, 6)
- **FR-012** UI MUST meet Design System, AR/EN, keyboard alternatives to drag, live totals with accessible announcements, loading/empty/error/conflict states, and the Frontend Design Gate. Food search uses F16's indexed `catalog_search` (no global-food scans); template lists paginated <= 50.
- **FR-013** Every schema version keeps a frozen validator, renderer, export path and macro-algorithm version; new versions never reinterpret old documents or totals; support is added by forward migration, never rewritten.

### Key Entities

NutritionPlan, NutritionPlanDraft, NutritionPlanVersion (+ contributor set), NutritionGlobalTemplate + Version, ClientAlternativeSelection, shared OperationKey ledger.

## Success Criteria _(mandatory)_

- **SC-001** 500 fixed golden macro cases (units, precision boundaries, alternatives) pass identically in TypeScript and SQL.
- **SC-002** An inventory of every F18 endpoint, RPC, direct-table path and export; each passes foreign-workspace and foreign-client negatives across PO, WO, Trainer, Sales, client, unaffiliated-staff and revoked-membership fixtures, plus direct DML and UPDATE/DELETE/TRUNCATE denial, creator masking, PO-without-membership read, forged selection keys, operation-key replay/conflict, concurrent draft/publish/selection, malformed references, old-schema export and forged publish payloads (ignored).
- **SC-003** Two simultaneously published plans stay visible and exportable (PRD-05 acceptance).
- **SC-004** Invalid unit swaps are rejected 100% (PRD-05 acceptance).
- **SC-005** Export of version N equals canonical AR/EN golden artifacts including current selection; Playwright + axe cover AR/EN x light/dark x mobile/desktop.
- **SC-006** Benchmark envelope (defined before implementation): maximum document bytes (shared Plan Core cap), max meals/items/alternatives, quantity precision per FR-003 and a fixed request mix; at that envelope (macro recompute runs in SQL; the Worker only validates for UX): Worker CPU p95 <= 5 ms (max < 10 ms, cold start measured separately) and DB/API p95 <= 300 ms for save/publish; bytes per version/template recorded with capacity projected against the 350 MB (70%) exit trigger; shared byte cap per Plan Core (engineering-owned).

## Assumptions

- F16 food versions provide per-100 values and serving equivalences as fixed-scale decimal strings.
- P4 renders the client plan view and selection UI and enforces overdue restriction on client view/export.

## Out of Scope

Workout planning (F17), catalogs (F16), shared Plan Core delivery/activation and client portal (P4), replacement requests and check-ins (P5), Telegram (P6), offline sync.

## Constitution Check

I composite FKs incl. selection->plan->client, two walls, self-only selection deriving identity from auth - II n/a - III global template governance D18-1 approved - IV PRD-05 traced; amended PRD-12 traced; no pending D18 items - V immutable versions recomputed server-side from exact food versions; selection never mutates source - VII audit allowlist, nutrition data treated as health-adjacent, log-scrub tests - VIII bilingual accessible UI - IX idempotency ledger, optimistic concurrency, serialized selection.
