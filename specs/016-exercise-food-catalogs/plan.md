# Implementation Plan: F16 Exercise & Food Catalogs

**Spec**: spec.md (same folder) | **Status**: PO-approved plan; implementation not started (debate.md is historical)

## Summary

Add the global exercise library (PO-governed), workspace exercise variations and workspace exercises, and the global food database (trainer-addable, validated, duplicate-checked), all as immutable versioned entries behind both authorization walls, plus bilingual staff catalog screens. Output contract: version snapshot payloads consumed by F17/F18.

## Technical Context

Next.js App Router on Cloudflare Workers (OpenNext), Supabase Postgres + FORCE RLS, supabase-js with user JWT, the established F12-F15 privilege pattern for writes (SECURITY DEFINER RPCs in `app_private`/`public`, owned exactly like the existing F12-F15 definer functions (no new owner role), with table policies denying all direct client DML and integration tests proving authorized RPC writes succeed and unauthorized ones fail under that owner, `set search_path = ''` with fully qualified objects, EXECUTE revoked from public/anon/service_role and granted only to `authenticated`, every RPC rechecking `auth.uid()`, current membership, capability and expected version; no direct table DML grants; reads through hardened read functions or security-barrier views). `docs/02-architecture.md` now distinguishes invoker-rights reads from the F12-F15 SECURITY DEFINER mutation RPC pattern. Existing `authorize()` + `app_private.role_has_capability` + `has_workspace_access(ws, cap)`, append-only `audit_events`, next-intl AR/EN, Design System, Vitest, Playwright + axe. Free-tier limits: 500 MB DB, 10 ms Worker CPU per request.

## Design

### Database

- Tables (global, no `workspace_id`): `exercises(id, created_by, created_at, lifecycle_state, superseded_by)`, `exercise_versions(exercise_id, version, payload columns..., created_by, created_at, unique(exercise_id, version))`, `foods(id, created_by, created_at, lifecycle_state, superseded_by)`, `food_versions(..., product_identity_norm, preparation_identity_norm, weighing_state, ...)`, `food_serving_units(food_version_id, unit_key, label_ar, label_en, basis_qty)`, append-only `catalog_lifecycle_events` for Remove/Restore/merge transitions, versioned taxonomy `taxonomy_terms(id, kind 'muscle_group'|'equipment', code unique)` + immutable `taxonomy_term_versions(term_id, version, label_ar, label_en, lifecycle)`; exercise versions reference term versions (FR-016a).
- Tables (workspace-scoped, `workspace_id` + composite FKs `(workspace_id, id)`): `workspace_exercises` + versions, `exercise_variations(workspace_id, exercise_id, ...)` + versions.
- Current-version pointer: `current_version` on the identity row with composite FK `(id, current_version) -> versions(identity_id, version)`; advanced only by the versioning RPC after `FOR UPDATE` and an expected-version check. Version rows append-only (trigger + revoked grants); identity lifecycle changes use append-only lifecycle markers, including Restore to the same active identity/current version; content versions are never edited or deleted.
- Nutrition storage: `numeric(7,2)` grams and `numeric(7,1)` kcal per 100 basis units; CHECKs for non-negativity. For the 4/4/9 kcal discrepancy, warn only above max(20 kcal, 10% of stated kcal); saving is not blocked solely for this discrepancy. Do not infer an additional macro-sum epsilon. Snapshot transport per FR-020 (decimal strings).
- Search: `app_private.normalize_ar_en_v1(text)` IMMUTABLE, NFC + explicit fold table (FR-015); generated columns `name_norm_ar_v1`, `name_norm_en_v1` on version rows; `pg_trgm` GIN indexes; page size max 50; read via a hardened `catalog_search` function (not audited per call).
- Duplicate detection: denormalized `food_identity_keys(lang, name_norm, basis, product_identity_norm, preparation_identity_norm, weighing_state, food_id)` with every key component NOT NULL and UNIQUE `(lang, name_norm, basis, product_identity_norm, preparation_identity_norm, weighing_state)` (food_id is payload, not part of the key), maintained in the same transaction: create inserts; a new version with unchanged identity dimensions keeps its key; changed dimensions remove the old key and insert the new one (conflict = exact duplicate unless the existing key belongs to the same food); Remove/merge remove the food's key; concurrent key collisions are tested. Writers lock a hash of every key component in deterministic order before checking. Near-duplicate candidates are compared only when language, basis, product/preparation identity and weighing state match; normalized name similarity is >=90% with no automatic synonym matching and kcal proximity is <=max(10%, 10 kcal) per 100g/100ml. Raw/cooked and genuinely different products remain distinct; true catalog duplicates are blocked, while plan repeats use Duplicate actions.
- Lifecycle and merge: Remove appends one non-destructive inactive lifecycle marker; it hides the food or exercise from catalog search and prevents new selection. It never cascades to or modifies a client plan, snapshot, log, media reference, or historical record; removal from an existing plan requires an explicit plan-editing action. Restore appends an active marker for the same identity and current immutable content version. Restore RPCs are `catalog_restore_food`, `catalog_restore_exercise`, and `catalog_restore_workspace_exercise`; global Remove/Restore is PO-only, while workspace exercise Remove/Restore requires `coaching_work` in the owning workspace. Only PO merges global entries. Food versioning additionally checks creator-or-PO on the locked identity. For merge, a superseded target resolves to its active terminal; source must be active; merging a source atomically repoints its direct inbound aliases to that terminal. Lock every affected identity in UUID order and recheck state; lifecycle operations never rewrite plan references or published snapshots.
- Operation keys: `app_private.operation_keys(actor_user_id, action, operation_key uuid, request_hash, result jsonb, created_at, unique(actor_user_id, operation_key))`, key bound to action, looked up after authorization; rows older than 30 days purged by the existing cron job.
- Snapshots: builders for canonical global/workspace exercise identity versions; selected workspace video mappings are resolved dynamically and never enter plan snapshots (FR-020).
- Audit: existing `audit_events`, two-segment action names (`catalog.food_created`, `catalog.food_versioned`, `catalog.food_merged`, `catalog.exercise_versioned`, `catalog.taxonomy_versioned`, ...), `workspace_id` NULL for global, allowlisted details only (FR-013).

### Authorization (two walls)

- New capability `govern_global_catalog` -> PO only (extend `app_private.role_has_capability`; forward migration, never edit pushed ones).
- New SECURITY DEFINER helper `app_private.can_read_global_coaching_content()` = caller is PO (direct, regardless of membership; F14 FR-001 global-access precedent) OR holds `coaching_work` in at least one current workspace membership. RLS on global tables: SELECT if helper; no direct INSERT/UPDATE/DELETE grants (RPC only). F17/F18 reuse this helper for global templates.
- Workspace tables: RLS `has_workspace_access(workspace_id, 'coaching_work')`.
- Creator columns on global rows are not exposed to non-PO: SELECT via a security-barrier view that nulls `created_by` unless PO; base tables not granted to `authenticated` directly.
- Every catalog mutation has an explicit authorization action and scope: `catalog_create_food` -> `catalog.food.create` (`coaching_work`); `catalog_version_food` -> `catalog.food.version` plus creator-or-PO checked on the locked food identity; `catalog_remove_food`, `catalog_restore_food`, and `catalog_merge_food` -> `catalog.food.govern` (PO only); global exercise create/version/remove/restore/merge RPCs -> `catalog.exercise.govern` (PO only); workspace exercise create/version/remove/restore RPCs -> `catalog.workspace_exercise.write` (`coaching_work` in the owning workspace); `catalog_write_variation` -> `catalog.workspace_variation.write` (`coaching_work` in the owning workspace); `catalog_version_taxonomy_term` -> `catalog.taxonomy.version` (PO only); `catalog_search` -> `catalog.read` (PO direct access or `can_read_global_coaching_content()`). Every RPC MUST authorize before validation and recheck current membership/capability after lock waits.

### RPCs (SECURITY DEFINER per the established pattern above)

`catalog_create_food`, `catalog_version_food`, `catalog_remove_food`, `catalog_restore_food`, `catalog_merge_food`, `catalog_create_exercise`, `catalog_version_exercise`, `catalog_remove_exercise`, `catalog_restore_exercise`, `catalog_merge_exercise`, `catalog_write_workspace_exercise`, `catalog_remove_workspace_exercise`, `catalog_restore_workspace_exercise`, `catalog_write_variation`, `catalog_version_taxonomy_term`, and read function `catalog_search(kind, query, filters, cursor)`. Mutations follow FR-016 exactly (authorize -> lock affected identity roots or deterministic creation/key locks in UUID order -> idempotency lookup -> recheck version/lifecycle/ownership and current permissions -> write -> one audit event).

### Application and UI

Routes under `app/(dashboard)/catalog/{exercises,foods}`: list + search + filters, detail with version history, add/edit forms (edit = new version), the single Remove action and Restore where authorized, merge dialog (PO), variation editor (workspace). Remove is a soft delete; there is no Archive action. Shared Zod schemas in `lib/catalog/` reused by F17/F18. Frontend Design Gate applies; any design gap -> PO.

### Snapshot contract (consumed by F17/F18)

`lib/catalog/snapshot.ts` exports `ExerciseSnapshotV1`/`FoodSnapshotV1` and builders that take explicit versions only (FR-020), retaining canonical exercise identity only; selected workspace videos are resolved dynamically, not stored in plan-version snapshots. Frozen fixture contract tests; F17/F18 consume the same fixtures.

## Validation phases

1. RED tests first: direct table DML denial for every role; Sales denial for every catalog action; WO/Trainer denial of unapproved global mutations (per D16-1); non-creator/non-PO food-version denial; creator masking in views/RPCs/errors/global audit (`workspace_id` NULL); non-HTTPS YouTube/Google Drive-only URL rejection, credential-bearing URL rejection; membership revoked between precheck and commit; duplicate-key uniqueness across language, product/preparation identity and raw/cooked state, including distinct products/states; concurrent exact duplicates and duplicate-on-edit; Remove/Restore authorization, same-identity/current-version reactivation, no-cascade plan preservation; merge-to-superseded-target terminal resolution, alias flattening, concurrent merge cycles and preserved snapshots; operation-key replay (same hash) vs conflict (different hash); stale-version conflict; canonical identity across a workspace variation; serving-equivalence computation and undefined-unit rejection; taxonomy versioning non-retroactivity; Arabic normalization table incl. composed/decomposed forms on two DB collations; `ExerciseSnapshotV1`/`FoodSnapshotV1` frozen fixtures.
2. Integration on one dedicated local Supabase stack (assigned at kickoff; one lane per stack).
3. Playwright + axe AR/EN light/dark mobile/desktop; perf fixture 10k foods for search.
4. Full gates once on the final head; CodeRabbit; CI window; PO exact-SHA approval.

## Ownership

Implementation staffing and sequencing are tracked outside this canonical contract. Feature requirements, dependencies and migration allocation are recorded here.

## Migration range

`20261106000000`-`20261106195959` inclusive, valid UTC times. Plan Core follows at `20261106200000`-`20261106235959`; the ranges do not overlap.

## Dependencies

- Hard: main with F9-F12 (capability function, audit, idempotency patterns). Merge order: F14 -> F13 -> F15 -> F16 (F16 merges only after F15 is verified on main); lands after F14/F13/F15 merges to avoid capability-function merge conflicts (each redefines `role_has_capability`; F16 must rebase onto the latest definition).
- Blocks: the F16 snapshot contract blocks both planners. F17 and F18 may develop domain/UI work in parallel once it is fixed; F18 integration depends on the canonical Plan Core (F19) contract and the F17 export contract landing first. P4 depends on both planners' ready-draft and snapshot contracts.

## Risks

| Risk | Mitigation |
|---|---|
| Concurrent `role_has_capability` redefinitions across open branches | Rebase after F15; capability-matrix test asserting the full matrix |
| Global table RLS misconfiguration leaks creator/workspace | Security-barrier view + negative tests for every non-PO role |
| Free-tier CPU on search | Indexed trigram search, page cap, perf fixture gate |
| Catalog pollution (no moderation, PRD-05) | Exact-dup block, near-dup confirm, PO merge, audit |
| Storage exhaustion via immutable history + open global writes | D16-10 write-rate/storage budgets, DB-size monitoring vs 70% exit trigger |
| Normalization drift across collations | Versioned `normalize_ar_en_v1`, cross-collation tests |

## Approved PO decisions

D16-1a=A, D16-1b=A, D16-1c=A; D16-2 exact exercise taxonomy; D16-3 HTTPS YouTube/Google Drive only; D16-4 PO dataset and audit, explicit PO approval before import; D16-5 warn-only at max(20 kcal, 10% of stated kcal); D16-6 kcal/protein/carbs/fat required, fiber optional; D16-7a at least 90% normalized text similarity/no automatic aliases; D16-7b at most max(10%, 10 kcal) per 100g/100ml; D16-7c block true catalog duplicates and allow plan repeats with Duplicate actions; D16-8 at least one food-name language; D16-9 creator/origin PO-only; D16-10 10 trainer additions/24h, 100 platform additions/24h, max 10,000 active foods, benchmark before production. (PO S20 Message B section 1.)

No dataset has been supplied. Do not invent or import food/exercise content.

## Project Structure

specs/016-exercise-food-catalogs/{spec.md, plan.md, debate.md, tasks.md (after approval)}; future source: supabase/migrations/202611060*, lib/catalog/*, app/(dashboard)/catalog/**, tests/{unit,integration,e2e}/catalog*.
