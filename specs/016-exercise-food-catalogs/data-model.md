# F16 Logical Data Model

This is a logical model for implementation planning, subordinate to the approved spec and plan. It defines no SQL syntax or migration implementation.

## Shared invariants

- Identity rows are stable. Every content edit appends an immutable, numbered version; current-version changes use compare-and-set under an identity-row lock.
- Use composite tenant keys and foreign keys for workspace-owned records. Every tenant read and write applies current membership checks plus forced RLS; callers cannot choose a foreign workspace by changing an ID.
- Lifecycle actions are append-only state transitions. `Add` creates identity/version 1; `Edit` appends a version; `Archive`, `Remove`, and `Restore` append a lifecycle version/marker. No action deletes or rewrites a version or breaks plan references. Retirement/restore and superseding are PO-controlled for global entries as set by F16.
- Audit is immutable and transactional with a successful write. Audit details contain only allowlisted action/target/version/related IDs and changed-field codes. Global event `workspace_id` is NULL. Never write names, notes, nutrition, URLs, origin, raw operation keys, or free text to audit.
- Store audit-only governance fields (`created_by`, origin workspace where applicable) separately from non-PO read projections. Non-PO global food projections omit creator and origin in data, errors, counts, and search candidates.
- No exercise or food content is seeded. Seed only the approved taxonomy. No import occurs until the PO supplies and approves a dataset after the D16-4 audit.

## Logical entities and tables

| Table / entity | Scope | Logical fields and invariants |
| --- | --- | --- |
| `exercises` | Global | Stable identity, current version, lifecycle state, creator and timestamps. One shared identity for every workspace. PO exclusively manages global exercise content and lifecycle. |
| `exercise_versions` | Global | `(exercise_id, version)` immutable content: bilingual names, primary muscle, optional secondary muscles, required equipment, coaching metadata, exercise defaults, lifecycle state, creator/time. Version references point to exact taxonomy term versions. |
| `workspace_exercises` | One workspace | Stable workspace-only identity, `(workspace_id, id)` key, current version and lifecycle. Never visible to another workspace. |
| `workspace_exercise_versions` | One workspace | Immutable version content parallel to global exercise fields; creator/time; composite tenant foreign keys. |
| `exercise_variations` | One workspace + one global exercise identity | Workspace mapping identity and current version. The canonical global exercise ID remains shared; workspace video URL and optional note are isolated per workspace. PO may manage all mappings; WO/Trainer may manage only mappings in a currently authorized workspace. |
| `exercise_variation_versions` | One workspace | Append-only versions of mapping URL/note and lifecycle; composite keys include workspace ID. Only HTTPS YouTube or Google Drive URLs; do not store resolved links in plan snapshots. |
| `foods` | Global | Stable identity, current version, lifecycle/superseded pointer, creator ID, optional origin workspace ID and creation time for PO governance. Non-PO views omit creator and origin. |
| `food_versions` | Global | `(food_id, version)` immutable content: at least one localized name, `basis` = `g` or `ml`, kcal/protein/carbs/fat per 100 basis units, optional fiber, raw/cooked weighing state expressed in the localized name, default alternatives, lifecycle state, creator/time. Required nutrition is nonnegative. |
| `food_serving_units` | Global version | Belongs to one food version; localized unit labels and positive exact basis equivalent. A serving is `g`-equivalent for a `g` food or `ml`-equivalent for an `ml` food; never infer cross-basis conversions. |
| `food_default_alternatives` | Global version | References an alternative food/version and validated serving/portion equivalence. Maximum THREE alternatives per food version. Plans may override portions without changing catalog defaults. |
| `catalog_muscle_groups` | Taxonomy | Seed exactly these 18 codes: Chest, Lats, Upper Back, Traps, Front Delts, Side Delts, Rear Delts, Biceps, Triceps, Forearms, Abs, Spinal Erectors, Quads, Hamstrings, Glutes, Adductors, Abductors, Calves. Bilingual labels and versioned lifecycle. No exercises are seeded. |
| `catalog_equipment` | Taxonomy | Seed exactly these 10 codes: Barbell, Dumbbell, Cable, Machine, Smith Machine, Bodyweight, Kettlebell, Resistance Band, Suspension Trainer, Other. Bilingual labels and versioned lifecycle. No exercises are seeded. |
| `catalog_food_name_keys` | Global index | Active normalized language/name/basis keys for exact-duplicate blocking; changed names update keys atomically with a new version. Raw/cooked state stays represented in the name and normalized key. |
| `catalog_operation_receipts` | Actor/action | Actor + UUIDv4 key + action + canonical request hash + original result; 30-day retention, existing cron purge. Raw key appears nowhere else. |
| `catalog_addition_limits` | Global counters/windows | Bounded accounting to enforce 10 trainer food additions/24h, 100 platform food additions/24h, and 10,000 active foods. Keep accounting transactional with accepted additions. Benchmark before production. |

## Nutrition and duplicate rules

- Nutrition basis is exactly per 100 g or per 100 ml. kcal and protein/carbs/fat are required; fiber is optional. Store decimal-safe values and reject negative values. Serving equivalents must be positive. The validator reports a warning when `abs(stated kcal - 4*protein - 4*carbs - 9*fat) > max(20 kcal, 10% of stated kcal)`; this discrepancy alone never blocks save.
- Candidate comparison uses the versioned Arabic/English normalizer. Similarity threshold is at least 90%; no automatic alias/synonym expansion. Near-match kcal distance must be no more than `max(10%, 10 kcal)` per same basis. Matching basis is required; g and ml are never compared as interchangeable.
- Block genuine catalog duplicates and offer the existing identity. Warn and require explicit confirmation for a near match. Raw vs cooked is part of the name and means distinct foods; no automatic state aliasing. Repeating the same food or meal within a plan remains allowed through plan duplicate actions.

## Lifecycle and version references

- Plan snapshots reference explicit `(identity_id, version)` pairs and retain their frozen values. Later catalog edits, archive/remove, restore, or merge never rewrite a plan snapshot.
- Archive/Remove hide the entry from new selection according to its lifecycle state but preserve identity and all versions. Restore appends a new current lifecycle version/marker; it does not reactivate old content by mutation.
- Merge is PO-only. It marks a duplicate as superseded by an active survivor; the target cannot be retired or superseded. Lock both IDs in deterministic order and reject any state that could make a chain/cycle. Existing references remain on the source identity/version; new selection resolves to the survivor.
- Exercise variations resolve for the explicitly selected workspace on each authorized read. Cross-workspace mappings are neither returned nor inferable, and workspace video URLs never enter plan snapshots.

## Search and privacy

- `normalize_ar_en_v1` is collation-independent and versioned: Unicode NFC, explicit Arabic/Latin folding, alef/hamza forms, ta marbuta/ha, alef maqsura/ya, diacritic and tatweel removal, and locale-independent case mapping.
- Search filters support muscle group, equipment and food basis; stable ordering and bounded pagination cap page size at 50. Use indexed normalized columns; algorithm changes require forward migrations and new indexes.
- Global reads: PO directly, or authenticated coaching staff with current `coaching_work` in any workspace. Client, Sales, unknown and unaffiliated actors are denied. Workspace rows require current workspace access. Creator/origin fields are PO-only, including errors and duplicate candidates.
