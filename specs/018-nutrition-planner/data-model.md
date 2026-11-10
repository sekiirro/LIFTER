# Data Model: F18 Nutrition Templates & Nutrition Planner

**Status**: Spec-only design for implementation planning. **No migration version is reserved.** The historic range `20261108000000-20261108235959` (`docs/03-roadmap.md:63-65`) is obsolete and is not used. Implementation must scan every `origin` ref for `supabase/migrations/` and pick a unique, strictly greater version at implementation time (F16 FR-032 rule).

**Boundaries**: F19 owns plan identity, drafts, revisions, delivery, activation and productivity (pending: `C:/Users/NEW LAP/Desktop/LFTR-s42-f19/specs/019-plan-core/data-model.md`). F16 owns food identities, immutable versions, serving units and snapshot transport. F18 owns the nutrition document, its computed values, nutrition templates, template assignment and client selections. F18 creates **no** plan/draft/revision/delivery/activation table and no second lifecycle path.

## Relationship map

```text
F19 plan root (workspace_id, client_id, plan_kind='nutrition')   [F19, pending]
  |-> F19 draft (private)
  |-> F19 immutable revision  ---> nutrition_plan_version_contents (1:1)   [F18]
  |-> F19 plan_deliveries (subscription bound here)                        [F19, pending]
                                   |
client_nutrition_alternative_selections (version-scoped)                   [F18]

nutrition_global_templates -> nutrition_global_template_versions           [F18, platform scope]
        |  PO manual Assign (batch)
        v
nutrition_template_assignment_batches -> nutrition_template_assignment_items
        |  creates
        v
nutrition_workspace_templates -> nutrition_workspace_template_versions     [F18, tenant scope]
```

## 1. Nutrition revision content (F18, 1:1 with an F19 revision)

### `nutrition_plan_version_contents`

| Column                                   | Contract                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`, `plan_id`, `revision_id` | Tenant + F19 plan root + F19 immutable revision. Composite FK `(workspace_id, plan_id, revision_id) -> plan_revisions(workspace_id, plan_id, id)` with `ON DELETE RESTRICT`. `UNIQUE (workspace_id, revision_id)`.                                                                                                                                                                            |
| `schema_version`                         | Frozen document schema version (integer). Selects the validator/renderer/export/algorithm version. Never reinterpreted.                                                                                                                                                                                                                                                                       |
| `algorithm_version`                      | Macro-algorithm version used for the stored values. Immutable per row.                                                                                                                                                                                                                                                                                                                        |
| `document`                               | The immutable nutrition document v1 (see `contracts/nutrition-document.md`). No client selection, no computed totals authored by the caller.                                                                                                                                                                                                                                                  |
| `snapshot_map`                           | `{ [snapshotKey]: NutritionSnapshotEntry }`, built by the database at publish from exact F16 food versions. Keys use `#basis:<unit>` or `#serving:<serving_id>`; one entry per distinct (food version, unit kind, unit identity) referenced by items **and** alternatives. Basis entries store per-100 data; serving entries wrap the exact F16 `FoodSnapshotV1` and its real serving-row id. |
| `computed_values`                        | Exact-arithmetic results stored once: per-item values, per-meal totals, per-day totals, document totals, each as an exact decimal string at a scale sufficient for the exact product of declared input scales. No storage rounding is performed. Derived from exact intermediates, never from already-rounded item values.                                                                    |
| `created_at`, `created_by`               | Server time and acting staff id from the publish transaction (audit reference, not client-visible).                                                                                                                                                                                                                                                                                           |

Rules:

- Insert-only. `UPDATE`, `DELETE` and `TRUNCATE` are rejected for every application role; only the publish RPC inserts, in the same transaction as the F19 revision and delivery.
- `document`, `snapshot_map` and `computed_values` are written only by the database publish path. Caller-supplied copies are ignored.
- A revision row always has exactly one content row; a content row cannot exist without its revision.
- The F19 revision row does not duplicate the nutrition document. If F19 implementation decides to store domain content inline in `plan_revisions`, the F18 content table is still the authoritative nutrition shape and must be kept 1:1 and immutable; this is a technical reconciliation item (see `research/conflicts.md` F18-C-10).

## 2. Food snapshot and total derivation

### Input scales (verified against live `main`)

| Input                                  | Live storage                                                                          | Source                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| per-100 kcal                           | `numeric(7,1)`                                                                        | `supabase/migrations/20261106093000_catalog_food_versions_and_servings.sql:9` |
| per-100 protein/carbohydrate/fat/fiber | `numeric(7,2)`                                                                        | same file `:10-13`                                                            |
| serving basis quantity                 | `numeric(12,3)`                                                                       | same file `:28`                                                               |
| plan quantity                          | document decimal string, ≤ 3 decimals                                                 | F18-FR-003                                                                    |
| stored computed value                  | exact decimal numeric at declared-input product scale, serialized as a decimal string | F18-FR-003                                                                    |

Transport is decimal strings, including inside `FoodSnapshotV1` (`specs/016-exercise-food-catalogs/plan.md:38` "Snapshot transport per FR-020 uses decimal strings"). The existing TypeScript builder types these as `number` (`lib/catalog/snapshot.ts:21-37`); the implementation must parse/format at fixed scale and must not rely on binary floating point. This is a technical item, not a product question.

### Algorithm

```text
basisQuantity =
    quantityValue                                   if unit.kind = basis and unit.value matches food.basis
    quantityValue * serving.basis_qty               if unit.kind = serving and unitKey resolves on the exact food version
itemValue(field) = per100(field) * basisQuantity / 100
exactValue       = exactDecimalProduct(per100(field), basisQuantity) / 100
mealTotal(field) = sum(exact itemValue(field))
dayTotal(field)  = sum(exact itemValue(field) for every item in every meal on that day)
documentTotal    = sum(dayTotal(field) across the document's day instances)
```

Each meal is visible on, and all of its items contribute only to, the day that contains it (the single implicit day for `single_day`, its own `days[]` entry for `seven_day`); days holding different meals therefore have independent totals. Day types, including training/rest classification and carb-cycling targets, remain available for their other nutrition uses; they do not filter meals or totals. Meal Notes and Food Notes are separate fields in the document and are independently editable: changing or clearing one preserves the other's value.

- Persist exact computed decimal values without storage rounding. The persisted decimal scale must be large enough to represent the exact product of the declared input scales. No intermediate rounding occurs anywhere; aggregates are computed from exact item values, never rounded stored/display values.
- A quantity for an undeclared serving key or a basis reference that does not match the food basis is rejected (F18-FR-004). The tagged kind distinguishes basis `g` from a catalog serving whose key is also `g`.
- Display is a pure function of the exact persisted decimal string: calories integer; protein/carbohydrate/fat one decimal below 10 g and integer at or above 10 g (D18-4=C + S27-PO-2). A below-threshold value that rounds to 10.0 renders `10`; zero renders `0` (S27 evidence). Round half-up exactly once for the requested display precision; display never writes back. For example, exact `1.44996` displays as `1.4` at one decimal, without first rounding to four decimals. This is a technical settlement (architect ruling S43-R9, accepting Sol-1), separate from PO wording.
- Worked non-tie examples: protein 12.34 per 100 g at 37 g → exact `4.5658`, stored `4.5658`, displayed `4.6`; fat 12.34 per 100 g at 37 g → displayed `4.6`; a `1.5` serving of a 30 g serving → basis `45.000` g.
- Values that do not fit the exact persistence precision reject the whole publish. The prior `numeric(12,4)` storage proposal is superseded by this exact-persistence rule (architect ruling S43-R9, Sol-1).
- Alternative foods are snapshotted and computed exactly like primary items; a selection reuses the same function, never a second one.

### Selected-alternative derivation

The selection stores ids only (`item_id`, `alternative_id`). Client-visible selected values are derived on read from the immutable revision's `snapshot_map` + the coach-specified alternative quantity, using the same canonical function. **No selected totals are persisted**, so they cannot drift and cannot be edited. If a performance projection caches them, the cache is keyed by `(authenticated client, plan id, revision id, selection revision)` and revalidated on authorization (F16 FR-034 pattern).

## 3. Client selection model

### `client_nutrition_alternative_selections`

| Column                                   | Contract                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`, `plan_id`                | Tenant + stable F19 plan root. Composite FK `(workspace_id, plan_id, client_id)` to the plan root; `client_id` is derived at write from that root, never from the caller.                                                 |
| `plan_version_id`                        | Exact published revision the selection applies to. Composite FK `(workspace_id, plan_id, plan_version_id) -> plan_revisions(workspace_id, plan_id, id)`; must be the current published, delivered revision at write time. |
| `client_id`                              | Plan's client; self only, derived from `auth.uid()`.                                                                                                                                                                      |
| `item_id`                                | Stable document item id.                                                                                                                                                                                                  |
| `alternative_id`                         | Coach-approved alternative id in that item, in that revision.                                                                                                                                                             |
| `created_at`, `updated_at`, `created_by` | Server time; `created_by` must equal the authenticated client.                                                                                                                                                            |

- `UNIQUE (workspace_id, plan_version_id, item_id)` → at most one active selection per item per revision.
- No row = coach default. **Clear deletes the row** and appends one audit event; deletion is not a "hidden null". The durable per-revision counter below survives the deletion.
- Only the selection RPC writes. Direct DML is revoked from every role, including `service_role`.
- A row is only valid if `alternative_id` still exists in that item of `plan_version_id`; because the revision is immutable, validity is decidable without a join to mutable data.
- Rows for earlier revisions are retained as history but are not exposed by the client's latest-revision projection; an authorized staff export may read that revision's last valid selection through the requested-revision projection. They never affect a newer revision.
- When a plan or client is deleted: no cascade deletes a revision, template, selection or audit history; plan roots use F19 `ON DELETE RESTRICT` (F19-FR-012). Selections have no independent deletion surface in F18, and trainer deletion is F19/F11's (author references retain the non-login account id per `F19-MCQ-13`).

### `client_nutrition_selection_revision_counters`

| Column                            | Contract                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `workspace_id`, `plan_version_id` | Composite key and FK to the immutable plan revision; one counter covers the full selection projection for that revision. |
| `selection_revision`              | Monotonic integer, default 0; increment exactly once for every real selection change for any item in the revision.       |

The counter row is upserted with the first real selection change and retained even after all selection rows are cleared. A no-op select or clear does not create/increment it. It is never reset or deleted while the revision is retained. Only the selection RPC writes it; direct DML is revoked and RLS follows the selection table's tenant boundary. Projection caches key on `(authenticated client, plan id, revision id, selection_revision)`; an absent counter reads as 0. This prevents a clear followed by a later selection from reusing a cache key.

### Selection state machine

```text
none --select(valid, authorized, current revision)--> selected(alternative_id)
selected --select(other valid alternative)--> selected(other)
selected --clear--> none
selected --publish newer revision with same item+alternative ids and client authorized--> selected carried to new revision
selected --publish newer revision missing item or alternative--> none for new revision (coach default)
any --expiry/deauthorization--> content denied (F19/F13); no write
```

The carry-forward is part of the publish transaction and is decided from stable ids, never from names, positions or quantities. Quantity, note and reorder edits keep ids; replacing an item's or alternative's food reference assigns new ids (inferred from D18-9=A + retained artifacts — see `research/po-decision-matrix.md` and register gap 2).

## 4. Nutrition templates

### `nutrition_global_templates` (platform scope, PO-only)

`id`, `status` (`active` \| `retired`), `current_version`, `created_by`, `created_at`, `retired_at`. No `workspace_id`: this is catalog-style global content, not tenant data (same shape as F16 global foods). FORCE RLS with **no** policy granting workspaces or clients any read; only the PO-facing RPCs read it. Audited.

### `nutrition_global_template_versions`

`(template_id, version)` PK, `document`, `schema_version`, `created_at`, `created_by`. Insert-only. A new version is a new row; retirement is a marker on the identity, never a delete.

### `nutrition_workspace_templates`

`workspace_id`, `id` (composite PK), `status` (`active` \| `retired`), `display_name` (workspace-branded), `current_version`, `origin_global_template_id` (nullable), `origin_global_template_version` (nullable), `created_at`, `created_by`, `retired_at`. `UNIQUE (workspace_id, origin_global_template_id)` permits at most one workspace copy per global template identity, regardless of source version. Origin metadata is masked from non-PO actors (F16 FR-013 pattern).

### `nutrition_workspace_template_versions`

`(workspace_id, template_id, version)` PK, `document`, `schema_version`, `created_at`, `created_by`. Insert-only, workspace-scoped composite FK, `coaching_work` RLS, `ON DELETE RESTRICT`.

Template document versioning mirrors the plan document but carries no client data and no computed values. A loaded template is a copy into a private draft, never a link.

## 5. Template assignment state

### `nutrition_template_assignment_batches` (platform scope, PO-only)

`id`, `template_selection_mode` (`all` \| `specific` \| `all_except`), `template_ids` (required for `specific`, otherwise null), `excluded_template_ids` (required for `all_except`, otherwise null), `workspace_selection_mode` (`all` \| `specific`), `workspace_ids` (required for `specific`, otherwise null), `operation_receipt_id` (the shared ledger receipt; no raw operation key is stored in this table), `created_at`, `created_by`, `assigned_count`, `skipped_count`. One batch = one idempotent PO operation. Insert-only; a retry with the same key returns the stored batch and its items.

### `nutrition_template_assignment_items`

`batch_id`, `seq`, `workspace_id`, `global_template_id`, `global_template_version`, `outcome` (`assigned` \| `skipped_existing` \| `skipped_ineligible`), `created_workspace_template_id` (set only for `assigned`), `created_at`. Insert-only. Composite workspace FK. `UNIQUE (batch_id, workspace_id, global_template_id)`.

### Derived workspace state (no extra table)

For the **nutrition** collection only:

- **Uninitialized** = no `nutrition_template_assignment_items` row with `outcome='assigned'` for that workspace, ever.
- **Initialized (partial or complete)** = at least one such row. Partial assignment is a normal, intentional state; nothing tops it up.
- **Already holds global template T** = any retained workspace template, active or retired, with `origin_global_template_id = T`, regardless of `origin_global_template_version` (used for `skipped_existing`). Every skipped workspace/template pair is included in the PO report.

`All Workspaces` selects workspaces that are uninitialized at operation time and exist at operation time. `Specific Workspaces` targets exactly the chosen workspaces and skips/reports every template identity they already hold, regardless of source version. Reject the Assign before writes if no copies would be created. A workspace with its own hand-made nutrition templates but no assignment item is still uninitialized (A5 Q1=A + A2: only an assignment initializes).

## 6. Authorization matrix

| Actor                  | Global templates | Assign / Make it Global | Workspace templates                     | Nutrition plan draft/publish             | Exports / prompt                                                                   | Client selection                                           |
| ---------------------- | ---------------- | ----------------------- | --------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Platform Owner         | read + manage    | **yes**                 | full across workspaces (view/edit/copy) | any workspace (F19-FR-009)               | yes                                                                                | no                                                         |
| Workspace Owner        | none             | no                      | own workspace, with `coaching_work`     | own workspace                            | own workspace                                                                      | no                                                         |
| Trainer                | none             | no                      | own workspace, with `coaching_work`     | own workspace                            | own workspace                                                                      | no                                                         |
| Sales                  | none             | no                      | none                                    | none                                     | none                                                                               | no                                                         |
| Client                 | none             | no                      | none                                    | none (self-read via F19 projection only) | none in the F18 staff UI; P4 may consume the export projection under its own rules | self only; prompt uses the same staff export authorization |
| Unaffiliated / revoked | none             | no                      | none                                    | none                                     | none                                                                               | no                                                         |

Enforcement uses the existing merged checks (`app_private.is_platform_owner()`, `app_private.has_workspace_access(workspace_id, 'coaching_work')`) and the F3 platform-wide PO rule; F18 adds no capability and no role (F16 FR-033 pattern). Verified on `main`: `app_private.has_workspace_access` returns true for the Platform Owner without a membership row and maps `coaching_work` to Platform Owner / Workspace Owner / Trainer (`supabase/migrations/20261027120000_tenancy.sql:48-80`). Every denial is generic and writes one denial audit event only for exports/selection.

## 7. Integrity, locking, retention

- Composite tenant FKs on every tenant-owned table; `ON DELETE RESTRICT` on every plan/revision/template/selection reference. No cascade deletes content history. Platform-scope global tables and assignment batches have no `workspace_id` and no tenant FK by design.
- Lock order follows the pending F19 contract (level-2 authority): client → subscription (publish only) → plan root → draft/revision rows → selection rows → operation ledger. For template batches, after current PO authorization, take the batch-creation lock and check the operation key/hash before resolving live global targets or workspaces; on a replay, recheck authorization before disclosure. For a new key, resolve targets, then lock global template identities in sorted UUID order and workspace copies in sorted workspace-id order before writing the batch and operation receipt.
- Assignment batch creation and per-target copy creation share one transaction; a failure writes no partial batch (no partial distribution).
- Selecting while publishing: the publish holds the plan-root lock while it reads selections and carries them forward; a racing selection against the old revision fails `stale_version`, leaves selection/domain state unchanged and records the required denial audit.
- Retention: revisions, template versions, assignment batches/items, selections (historically) and audit events are not deleted by F18. Client/plan deletion follows F19/F11; nutrition rows restrict instead of cascading.
- No `security definer` function is introduced without: explicit `search_path`, `EXECUTE` revoked from `public`/`anon`/`authenticated`/`service_role` except the intended role, authorization before any read, and a mutation/negative test.

## 8. Migration obligations (design only)

1. Scan all `origin` refs; choose one unused version strictly greater than the global maximum.
2. Create F18 tables and constraints forward-only; no destructive change; no edit to a pushed migration.
3. Reuse the existing operation-key ledger; do not create a second idempotency store.
4. RLS/privilege audit: FORCE RLS, `REVOKE ALL` then grant the minimum, explicit policies per table, and foreign-workspace negatives for each.
5. Rehearse fresh replay **and** upgrade from the current merged schema before merge.
6. Verify the F19 revision composite keys exist before adding the F18 FK; if F19 key names differ, adapt only the foreign keys, never the F18 invariants.

## S43-PO-8 revision-scoped selection retention

Retain each published revision's last valid client selection as revision-scoped history suitable for authorized PDF/Excel export. A later selection on a newer revision must not replace the historical revision's selection in an export. **architect mapping (S43-R10).**
