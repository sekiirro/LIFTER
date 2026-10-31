# Feature Specification: F17 Workout Templates & Workout Planner

**Feature Branch**: `017-workout-planner`
**Status**: PO-approved specification; not implemented (review history in debate.md)
**Phase**: P3 (roadmap)
**Input**: PRD-04 (templates global + workspace, planner features, per-exercise defaults, volume with secondary-muscle credit, multiple plans, versions, PDF/Excel, no Hevy, no AI alternatives, no web logging), PRD-06 and shared Plan Core (independent first deliveries, exactly-once activation), Constitution V, architecture "Plans: one mutable draft per plan; publishing creates an immutable plan_version JSONB with schema version snapshotting canonical exercise ids".

## Why this feature, why now

P4 requires one successful first workout delivery and one successful first nutrition delivery before activation. Their delivery order and dates are independent; Plan Core records both. It runs in parallel with F18 (nutrition) once F16's snapshot contract lands.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build a client workout plan draft (Priority: P1)

A Trainer, WO or PO builds a client's workout plan: sessions and rest days, exercises from the catalog, warm-up and working sets with per-set reps, load, rest and RIR, notes, manual alternatives and video references. They reorder, drag across days and duplicate exercises/days.

**Independent Test**: Create a draft with 3 sessions + rest days; reorder, cross-day drag and duplicate; reload and verify every set parameter is preserved exactly (PRD-04 acceptance check).

**Acceptance Scenarios**:
1. **Given** an approved client in workspace A and a staff member with `coaching_work` in A, **When** they create a workout plan, **Then** exactly one mutable draft exists for that plan, defaults pre-filled from the selected exercise catalog defaults.
2. **Given** a draft, **When** an exercise is moved to another day, duplicated, or reordered, **Then** all set rows (type, reps, load, rest, RIR, notes) move with it unchanged and get new stable item ids only when duplicated.
3. **Given** two staff editing the same draft, **When** the second saves against a stale revision, **Then** the save is rejected with a conflict and no data is lost (optimistic concurrency).
4. **Given** a workspace-B actor, **When** they read or write workspace-A plans, **Then** both walls deny without disclosing existence.

### User Story 2 - Templates: global and workspace (Priority: P1)

Staff load a workout template (global or their workspace's) into a client draft and customize it independently. Trainers create/edit workspace templates; global template governance follows the approved matrix.

**Independent Test**: Load a template into a draft, edit the draft, then edit the template; verify the client draft and any published versions are unaffected (copy, not reference).

**Acceptance Scenarios**:
1. **Given** a workspace template, **When** loaded into a client draft, **Then** the content is copied; later template versions never change the draft or published plan versions.
2. **Given** a workspace template in A, **When** a B actor lists templates, **Then** it is not visible.
3. **Given** an authorized actor per the approved matrix, **When** they create or edit a global template, **Then** a new immutable template version is appended.

### User Story 3 - Mark ready and publish revisions (Priority: P1)

Ready and publication use the shared Plan Core contract. First workout delivery may succeed independently; subscription activation waits until both first plans are delivered. A published plan remains editable with the same Plan ID.

**Independent Test**: For a non-activated subscription, verify `publish` is refused and `ready` is allowed; verify a save after `mark_ready` clears readiness; for an activated-subscription fixture, publish, edit the draft, publish again and verify two immutable versions with distinct `source_revision`, newest first, both retained; re-publishing the unchanged revision returns the existing version.

**Acceptance Scenarios**:
1. **Given** a first workout plan, **When** it is delivered, **Then** the delivery is recorded independently and activation waits for first nutrition delivery (Plan Core PC-FR-004/005).
2. **Given** an existing plan, **When** a coach edits and publishes it, **Then** the same Plan ID remains and a new immutable revision becomes visible only after Ready & Publish.
3. **Given** several published plans/versions, **When** listed, **Then** all are retained, newest first; nothing is auto-archived.
4. **Given** the catalog later changes or retires an exercise, **When** an old version is viewed or exported, **Then** it renders from its snapshot unchanged.

### User Story 4 - Volume reporting (Priority: P2)

The planner shows weekly volume per muscle group counting working sets only, with the approved fractional credit for secondary muscles.

**Independent Test**: Table-driven unit tests: warm-up sets excluded; primary = 1.0 per working set; secondary = approved fraction; per-session and per-week totals.

### User Story 5 - Export a selected plan version (Priority: P2)

Staff export a selected published version (published versions only, with every export audited) to PDF (browser print, RTL-correct) and Excel (ExcelJS in browser). No Hevy option exists.

**Independent Test**: Export version N while version N+1 exists; verify the file content matches N exactly in AR and EN; verify no Hevy workflow appears (PRD-04 acceptance check).

### Edge Cases

- Rest-day only weeks; a session with zero exercises (allowed in draft, blocked at ready/publish).
- Rep ranges vs single values; per-set kg or lb; Bodyweight, Added Weight or Assisted load modes.
- An alternative exercise that is retired after selection (snapshot keeps it; draft shows indicator).
- Client deactivated/refunded while a draft exists: draft preserved, publish denied per lifecycle.
- Plan document size above the cap: rejected with a clear message (Free-tier protection).
- Duplicate submit of publish (network retry): idempotent, one version.
- Membership revoked mid-edit: next save denied.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001** Workout plan roots retain workspace, client and subscription relationships. Plan identity, draft/revision lifecycle, readiness, publication, first delivery and activation MUST follow [019 Plan Core](../019-plan-core/spec.md), PC-FR-001 through PC-FR-007. (PO S20 Message B section 4; supersedes v3 FR-001)
- **FR-001a** F17 first-plan delivery MUST implement Plan Core PC-FR-004/005; F17 does not define a pair transaction. (PO S20 Message B section 4; supersedes v3 FR-001a)
- **FR-002** Plan identity, draft lifecycle, save, readiness and publication MUST follow specs/019-plan-core PC-FR-001 through PC-FR-007. (PO S20 Message B section 4; supersedes v3 FR-002)
- **FR-003** The plan document MUST support: ordered days (session or rest), ordered exercise items with stable item ids, exercise reference `{source:'global'|'workspace', id, version, variation?: {id, version}}` (same shape for alternatives), ordered sets (`warmup`|`working`) with reps (per D17-4), per-set kg/lb load or Bodyweight, Added Weight or Assisted mode (D17-7=A), rest seconds, RIR, notes; optional alternatives (catalog references; catalog-based coach-approved alternatives editable per plan); exercise and day notes.
- **FR-003a** The planner MUST add exercises through F16's bounded, indexed AR/EN search, selecting an explicit exercise (and variation) version; the picker excludes other workspaces' exercises/variations and never runs unbounded queries.
- **FR-004b** Every successful draft save and publication attributes the acting staff member; each published version exposes an immutable contributor set (staff ids, action codes, timestamps only) of all staff who contributed since the previous version (PRD-06 "other trainer contributions recorded independently"); P4 records the responsible trainer separately.
- **FR-004a** Across revisions of the same plan, unchanged day and exercise item ids MUST be retained (session-version continuity, PRD-04); deliberate duplicates get new ids; published versions keep their ids forever. Test: unchanged, moved, duplicated and removed items across revisions.
- **FR-004** Reorder and cross-day move MUST preserve all ids and parameters. Duplicate exercise MUST remap the item id and all descendant set ids; duplicate day MUST remap the day id and every descendant item and set id; copied values are field-for-field identical; source ids unchanged; no id collisions.
- **FR-005** Exercise defaults are per catalog exercise, not platform-wide. Each exercise carries editable warm-up/working sets, fixed/ranged reps, rest, RIR and alternatives; adding an exercise populates these defaults and coaches may override them. No platform defaults screen exists. (PO S20 Message B section 1; supersedes v3 FR-005)
- **FR-006** Global and workspace workout templates MUST live in separate tables (identity + immutable versions, `UNIQUE(template_id, version)`, `current_version` composite FK advanced by an append-only RPC with expected-version concurrency). Global: reads via F16 `can_read_global_coaching_content()`, writes per D17-3; PO may Make it Global from an eligible workspace template only after private data and references are removed; reference only global catalog versions, contain no client data, creator/origin masked for non-PO, audit `workspace_id` NULL. Workspace: `coaching_work` in that workspace. Template documents use the same workout schema v1 minus client-specific fields (validated by the same registry). Template RPCs: `template_create`, `template_version(expected_version, operation_key)`, `template_retire`, `template_load_into_draft(template_version, expected_revision, operation_key)`. Loading selects one explicit visible version, copies content and remaps all document ids.
- **FR-007** Ready and publish behavior follows Plan Core PC-FR-001 through PC-FR-007. F17 allows planning after client approval, and Ready & Publish requires submitted intake (D17-5=A). (PO S20 Message B section 2; supersedes v3 FR-007)
- **FR-008** F17 plan revisions snapshot canonical exercise identity only. Resolve the selected workspace video dynamically on each authorized read/export; never store it in the plan snapshot and never require plan republishing when a workspace video changes. Other same-Plan-ID edit and activation semantics follow Plan Core. (PO S20 Message B section 1; supersedes v3 video-snapshot semantics in FR-008.)
- **FR-009** Plan versions MUST be immutable (trigger + grants); published plans are retained and listed newest first; no one-active-plan constraint, no auto-archive.
- **FR-010** Volume reporting MUST count working sets only; per working set, each primary muscle group is credited 1.0 and each secondary muscle group the 0.5 (D17-1=A), per session and per week.
- **FR-011** Staff export MUST produce audited PDF (browser print CSS, RTL-correct Arabic) and Excel (ExcelJS) for published plan versions only, from authorized API data only. ExcelJS MUST write every coach-authored cell as a string, never a formula (tests for leading `=`, `+`, `-`, `@`). Every export and every export denial emits an audit event (actor, workspace, plan/version id, format) with no content, notes, client data or PII filenames. Client export and overdue restriction belong to P4.
- **FR-012** Authorization: all plan/template actions require `coaching_work` in the plan's workspace (both walls); Sales, clients and unaffiliated staff denied; unauthorized and foreign-target errors are indistinguishable; client has no F17 surface (client viewing is P4).
- **FR-013** Every mutating operation MUST authorize first and accept an opaque client UUID `operation_key`; an idempotency record (F16 `app_private.operation_keys` pattern: actor, action, target, request hash, original result, 30-day retention) returns the original result for the same key+hash and conflicts for a different hash; raw keys never appear in version rows, exports, errors or audit. Each write emits one audit event without plan content or PII.
- **FR-014** Plan and template documents MUST be validated by a shared schema and DB checks for `schema_version` and a byte cap: provisional 512 KB for the SC-005 benchmark, final cap set from its results. Every schema version has a registered immutable parser and frozen fixture; publishing uses only registered versions; rendering supports every retained version; unknown versions fail closed with a generic error; new versions are added by forward migration before use.
- **FR-015** Excluded (PRD-12): web set/rep logging, timers, Hevy, AI-generated alternatives, bulk plan assignment.
- **FR-016** UI MUST meet the Design System, AR/EN, keyboard-accessible drag alternatives (move up/down/to-day controls), and the Frontend Design Gate.

### Key Entities

WorkoutPlan (workspace, client), WorkoutPlanDraft (document JSONB, revision, ready_at/ready_by), WorkoutPlanVersion (immutable JSONB, schema_version, version, published_at/by), WorkoutTemplate (scope global|workspace) + WorkoutTemplateVersion, PlatformWorkoutDefaults (PO, versioned).

## Success Criteria _(mandatory)_

- **SC-001** Zero parameter corruption across 1,000 randomized reorder/move/duplicate operations (property test).
- **SC-002** Every F17 endpoint, RPC, export and table passes: foreign-workspace app + RLS tests, direct-DML denial, Sales/client/unaffiliated-staff denial, revoked-membership denial, global creator/origin masking, operation-key replay vs conflict, and indistinguishable denied/not-found responses.
- **SC-003** Export of version N matches N exactly in AR and EN (golden tests).
- **SC-004** Independent first workout and nutrition deliveries are idempotent and concurrency-safe; subscription activates exactly once after both succeed, as verified by Plan Core acceptance scenarios.
- **SC-005** On production-like fixtures (7-day/40-exercise plan and the maximum accepted bytes, 10,000 requests): Worker CPU p95 <= 8 ms, max < 10 ms, zero CPU timeouts; DB/API p95 <= 300 ms; EXPLAIN shows bounded indexed access; DB/index bytes, autosave churn and a 10,000-version projection recorded against the 350 MB (70%) exit trigger. The byte cap is chosen from this benchmark.

## Assumptions

- Planning is allowed for approved clients; drafts may start after approval; publishing requires submitted intake (D17-5=A).
- P4 owns the client plan view and client export; first-delivery and activation semantics are defined in specs/019-plan-core.

## Out of Scope

Nutrition (F18), catalogs (F16), Plan Core delivery/activation/productivity units/client portal/overdue restriction (P4), check-ins and mobile logging (P5/future), Telegram (P6).

## Constitution Check

I composite FKs + two walls + negatives - II n/a - III PO governance - IV PRD-04 traced - V immutable workout revisions and canonical exercise snapshots; Plan Core lifecycle - VII no plan content in logs - VIII bilingual accessible UI + gate - IX concurrency and idempotency.
