# F17 Logical Data Model

**Status**: Updated spec-only draft (S43, 2026-11-10). Logical model only: no SQL, no column types, no migration files, and **no migration version is reserved** by this document. It is subordinate to `spec.md` and `plan.md`.

## 1. Scope and boundaries

F17 owns workout content, workout template content and governance, template distribution state, and workout exports. It does **not** own:

- plan identity, drafts, published revisions, deliveries, activation, productivity units or client projection — those belong to the **pending F19 PR** (`specs/019-plan-core/`). F17 stores workout content _inside_ F19-owned plan draft/revision rows (or a companion content row keyed to them); it defines no second lifecycle table and no delivery/activation table.
- exercise identities, versions, overrides, alternatives, defaults or video resolution — F16.
- subscriptions, entitlement, expiry — F12/F13; enforcement surface — P4.

## 2. Shared invariants

- Every tenant-owned row carries `workspace_id` and uses composite `(workspace_id, id)` keys and foreign keys (Constitution I).
- Template identities are stable; every content edit appends an immutable numbered version; current-version changes use compare-and-set under the identity lock.
- Published revisions are immutable; a template version is immutable; retire is a non-destructive state change, never a delete or rewrite.
- Every mutation is authorized first, then operation-key checked, then CAS-applied; exact replay returns the original receipt; changed arguments conflict.
- Audit is transactional with the write and carries only allowlisted ids/codes — never workout content, notes, URLs, client data or raw operation keys.
- No plan or template content is seeded. Assignment copies are created only by an explicit PO operation.

## 3. Plan content entities

| Entity                             | Ownership                       | Logical fields and invariants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workout plan root                  | F19 (pending PR)                | `workspace_id`, `client_id`, stable Plan ID. **No `subscription_id`.** Subscription relation exists only through a delivery row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Workout private draft content      | F17 content on F19 draft row    | `schema_version`, workout document (days/items/sets), draft revision, ready state. Autosaved; never client-visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Workout published revision content | F17 content on F19 revision row | Immutable workout document + the frozen non-video entry values as `ExerciseSnapshotV2` references. One revision per publish. Video is never stored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Revision contributor set           | F17 content on F19 revision row | Immutable set of staff ids, action codes and timestamps for contributors since the previous revision. No plan content or PII. Survives access revocation and trainer deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Workout document                   | Embedded value                  | `{ days: [{ id, kind: session\|rest, title?, notes?, items: [...] }], notes? }`; item = `{ id, exerciseRef, reps?, restSec?, rir?, notes?, alternatives[] (max 3 unique), sets[] }`; these entry-level prescriptions are independent of sets. A new entry may have zero set rows. Set = `{ id, type: warmup\|working, load: bodyweight \| added_weight(value, kg\|lb) \| assisted(value, kg\|lb) }`. Reps and defaults follow F16 bounds (integer/range 1–100; RIR 0–5; rest 0–600 s in 15 s steps).                                                                                                                                                                                                                                                                                                                                        |
| Exercise reference                 | Value in document               | Global: `{ source: 'global', identity_id, version: global_version, override_version?, override_workspace_id? }`. Private: `{ source: 'workspace_private', identity_id, version: workspace_private_version, workspace_id }`. A private version has no override. Capture/pin the identity-source version and, for global references, the applicable override version with its source workspace; copy effective non-video values into the editable plan entry at add. Preserve both pins and the current entry values through draft save/reload. Promotion retains source-workspace identity and captured values but never resolves a foreign override as destination-local. **No `variation` field.** Resolution follows F16 FR-026; Global Workout Template fresh authoring resolves canonical-only. (S44-PO-2; architect mapping (S44-R2).) |
| `ExerciseSnapshotV2`               | F16 type, embedded per revision | Source-specific identity/version + applicable global-exercise override version and source workspace (or null) + current trainer-edited non-video values from the plan entry at publication. Add-time pins remain fixed; publication freezes the latest entry values without rereading catalog/override content. Video resolves live. Later catalog/override changes alter neither draft nor snapshot.                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Rest-day document invariant (S44-PO-11; architect mapping (S44-R10)): a `kind: rest` day has an empty `items` array. Adding or moving an item to a rest day is rejected before writes with `invalid_document`; after a rejected move the item remains on its source day.

## 4. Template entities

| Entity                                | Scope         | Logical fields and invariants                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout_global_templates`            | Global        | Stable identity, lifecycle state, current version, creating PO. Create/edit/retire is PO-only. Holds no client data. Fresh authoring accepts only canonical exercise references; a promoted template may retain workspace-private references, which must be RED and block loading until fixed.                                         |
| `workout_global_template_versions`    | Global        | `(template_id, version)` immutable content using the workout schema minus client fields. Append-only.                                                                                                                                                                                                                                  |
| `workout_workspace_templates`         | One workspace | Stable identity owned by the workspace; branded copy of an origin global template **or** created directly in the workspace. `origin_global_template_id`, `origin_global_template_version`, `origin_assignment_id` are provenance (visible to the PO only) and are **not** a live link: no read of content goes back to the global row. |
| `workout_workspace_template_versions` | One workspace | `(workspace_id, template_id, version)` immutable content. Editing a copy appends here; the global source is never touched.                                                                                                                                                                                                             |
| `workout_template_distribution_state` | One workspace | Durable per-workspace state used by All Workspaces eligibility. See §5.                                                                                                                                                                                                                                                                |

## 5. Assignment state model (PO A2)

The product needs three distinguishable situations. Two are stored; the third is a derived view of "never assigned plus own templates".

| State                                            | How it is represented                                                                                                       | All Workspaces behaviour (literal A2)                                        | Specific Workspaces behaviour                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **(a) Never assigned**                           | No distribution-state row, or a row with `ever_received_global_assignment = false`                                          | Eligible: receives every selected template                                   | Eligible                                                                    |
| **(b) Intentionally partially assigned**         | `ever_received_global_assignment = true`, with a subset of global templates copied                                          | **Skipped entirely**; missing templates are not filled (no implicit top-up)  | Eligible; adds only missing selected copies, never duplicates or overwrites |
| **(c) Own templates only, no global assignment** | Derived: zero origin-global copies and `ever_received_global_assignment = false`, while the workspace has its own templates | Eligible, because it has never received a global-template assignment/library | Eligible                                                                    |

Stored fields (logical): `workspace_id`, `ever_received_global_assignment` (default false), `first_assigned_at`, `first_assignment_id`, `last_assignment_id`. The flag is set at most once and never cleared. The derived state (c) is computed, not stored as a fourth flag, so a workspace that later creates its own template cannot silently change from (a) to a different eligibility class.

A zero-copy Assign is rejected before the batch or distribution-state flag is written (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-3=C).

### 5.1 Assignment operation entities

| Entity                               | Scope                                   | Logical fields and invariants                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workout_template_assignment_runs`   | PO operation                            | One row per accepted `Global Templates → Assign` submit: actor (PO), `operation_key` (unique per actor, raw key never stored elsewhere), template selection mode (`all` \| `specific` \| `all_except`), target mode (`all_workspaces` \| `specific_workspaces`), selected template ids, selected workspace ids, created_at, outcome counts.                                            |
| `workout_template_assignment_items`  | One run × workspace                     | One row per targeted workspace: run id, workspace id, outcome (`assigned` \| `skipped_already_assigned` \| `no_copies` \| `denied`), created copy ids, created_at. `no_copies` is a committed per-workspace receipt when another target receives a copy; reject before writes only if total batch copies = 0. Unique `(run_id, workspace_id)`. (S44-PO-2; architect mapping (S44-R2).) |
| `workout_template_assignment_copies` | One workspace × global template version | Links one run to one created workspace template version. Unique `(run_id, workspace_id, global_template_id, global_template_version)` and unique `(workspace_id, global_template_id)`. Ensures a workspace holds at most one copy of a global template identity, regardless of source version.                                                                                         |

### 5.2 Idempotency, retry and concurrency

- Under a transaction-scoped advisory lock derived from the actor+operation key, the assignment ledger is checked first: an exact replay returns the stored per-workspace outcomes after current authorization is rechecked and creates nothing new; the same key with different selection/target arguments returns `key_conflict`. Only a new request proceeds to eligibility calculation, and it creates the run row, copies, items and distribution-state changes in the same transaction.
- Per-target-workspace writes take that workspace's assignment lock so two PO tabs cannot interleave All/Specific runs on the same workspace. The eligibility read and the flag write occur in the same transaction.
- The run-level copy key is `(run_id, workspace_id, global_template_id, global_template_version)`. The permanent identity-level key is `(workspace_id, global_template_id)` and excludes the source version. A replay cannot duplicate a copy; a different run skips and reports any template identity the workspace already holds, regardless of source version.
- Cancellation/failure before commit leaves no run row, no flag change and no copy. An unknown client result after commit is resolved by replaying the same operation key, which returns the original receipt.
- A resolved Assign that would create zero copies is rejected before the run, item, or state marker is written (S42-PO-8; architect mapping (S42 matrix): F17-MCQ-3=C).

### 5.3 No duplicate and no overwrite

- A workspace copy is created at most once per (workspace, global template identity), regardless of source version. Creating it never updates, resets or deletes an existing workspace template or version.
- For each eligible selected template, assignment creates a new workspace template identity and inserts its immutable version 1 into `workout_workspace_template_versions` in the same transaction. It never updates an existing workspace template or version; when the workspace already holds the origin identity, assignment adds nothing.
- Later global edits/versions create a new immutable global version. A workspace holding any copy of the identity is skipped regardless of source version, and the pair is reported; no second copy or update is created (S43-PO-1; architect mapping (S43-R1)).
- There is no live-linked copy: a workspace copy read never joins back to global content for rendering.

### 5.4 Promotion and PO governance

- PO promotion of a workspace template into the global collection creates a **new global template identity + version 1** that copies the workspace content; the original workspace template and all its versions remain unchanged.
- Promotion must exclude client data. Promotion may preserve workspace-private exercise references; unresolved references are flagged RED and loading is blocked until fixed (S42-PO-8; architect mapping (S42 matrix)). The canonical-only constraint applies to fresh authoring, not to a promoted version's retained references.
- PO cross-workspace view/edit/copy uses explicit PO authority; workspace staff never gain access to another workspace through PO actions.

## 6. Volume

Volume is derived, not stored: a pure function over the plan document and primary/secondary muscle membership resolved from each reference's pinned immutable source version (global or workspace-private), not from `ExerciseSnapshotV2`, which does not carry muscle taxonomy. Working sets only; primary 1.0, secondary 0.5, warm-up 0; per session and per week. Weeks are consecutive 7-program-day blocks: days 1?7, 8?14, and so on; rest days remain in each block and the final partial block is a week. No calendar date is required (S43-PO-5; architect mapping (S43-R6)). A cached projection, if any, is keyed by plan + revision + workspace and invalidated by revision identity, never by mutable content alone.

## 7. Retention and deletion consequences

- Publishing appends revisions; earlier revisions and snapshots are retained permanently. No auto-archive, no one-active-plan constraint.
- Retiring a template hides it from new selection and new assignment; existing workspace copies, drafts and published revisions remain valid.
- F16 catalog Remove/Merge never rewrites published non-video snapshot values; Video resolves live and a removed target shows unavailable rather than being substituted.
- Trainer deletion must not cascade-delete templates, copies, plans, revisions or audit history (pending F19 F19-FR-012 / F11 PR #73, pending not merged).
- Assignment run history is append-only for audit and diagnosis; it is not a source of template content.
- No migration version is reserved. `docs/03-roadmap.md:64-65` ranges are treated as obsolete; the implementation allocates a unique version above the highest across all origin refs at that time.

## 8. Deliberate non-entities

- No `F17` delivery, activation, productivity-unit, subscription or client-projection table.
- No second plan root/draft/revision table.
- No `variation` or `ExerciseSnapshotV1` entity.
- No `platform_workout_defaults` entity: F16 has no universal defaults and PO A1 forbids inventing them.
- No seeded global or workspace template content.
- No per-workspace template "sync cursor" or live-link table.

## 9. Open data questions

| Id        | Question                                             | Affected entity        |
| --------- | ---------------------------------------------------- | ---------------------- |
| S43-MCQ-A | Resolved: exact prompt EN/AR bytes in local contract | prompt golden equality |
| S43-MCQ-C | Resolved: program-day week blocks; no calendar start | volume anchoring       |
