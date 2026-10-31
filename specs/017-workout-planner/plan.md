# Implementation Plan: F17 Workout Templates & Workout Planner

**Spec**: spec.md (same folder) | **Status**: PO-approved plan; implementation not started (debate.md is historical)

## Summary

Workout plans consume the canonical shared Plan Core contract, retain same-Plan-ID edits after publication, and use per-exercise defaults, global/workspace templates, volume reporting, and audited published-only PDF/Excel exports.

## Technical Context

As F16 (Next.js/OpenNext Workers, Supabase RLS, invoker RPCs, `authorize()`, audit, next-intl, Design System, Vitest/Playwright/axe). Browser-side export per architecture (print CSS + ExcelJS), Arabic shaping validated in the P0 print spike (specs/002-design-system/print-spike.md).

## Design

### Shared Plan Core

F17 consumes the canonical plan identity, draft/revision, Ready & Publish, independent first-delivery and exactly-once activation contract in [019 Plan Core](../019-plan-core/spec.md). When workout is the second successful first delivery, its delivery transaction performs the activation check; if activation cannot complete there, that transaction persists the Plan Core durable retry item. Exact replay is idempotent. F17 owns only workout schema, validation, snapshots, templates, volume and exports. Do not define a paired-publish writer or duplicate Plan Core lifecycle tables/operations.

Plan-root mutations use the Plan Core lock order: authorize -> lock the stable plan root -> check the idempotency ledger -> for an exact replay, recheck current staff membership/capability before returning the stored result; otherwise lock the draft (when applicable) -> re-read expected revision -> recheck current staff membership/capability -> validate and write -> append one audit event. Explicit plan creation uses Plan Core's operation-key creation lock before the root exists. Template-root writes use the same order against their template identity; template creation uses a deterministic creation lock until the root exists. Loading a template into a draft follows the plan-root order and reads the immutable template version without locking it.

### Workout document schema v1 (Zod in `lib/plans/workout/schema.ts`, DB check on version + size)

`{ days: [{ id, kind: 'session'|'rest', title?, notes?, items: [{ id, exercise: {source:'global'|'workspace', id, version, variation?: {id, version}}, notes?, alternatives: [{source, id, version, variation?: {id, version}}], sets: [{ id, type:'warmup'|'working', reps: {min,max}|{value}, load: {mode:'bodyweight'}|{mode:'added_weight', value:decimal-string, unit:'kg'|'lb'}|{mode:'assisted', value:decimal-string, unit:'kg'|'lb'}, restSec?, rir?, notes? }] }] }], notes? }`. Load is a per-set tagged union: Bodyweight has no value or unit; Added Weight and Assisted are separate variants, each requiring a positive exact decimal value and an explicit kg or lb unit. Item and set ids are UUIDs generated client-side, validated unique server-side. Published versions embed `ExerciseSnapshotV1` per referenced exercise in a `snapshots` map.

### Templates

Separate `workout_global_templates` + `workout_global_template_versions` and `workout_workspace_templates` + `workout_workspace_template_versions` (FR-006). Global reads via F16 `can_read_global_coaching_content()` through a security-barrier view masking creator/origin for non-PO; workspace rows via `has_workspace_access`. Global write rights per D17-3. Loading = server copies one explicit template version document into the draft and remaps all ids.

### Defaults

Defaults live on each F16 exercise catalog entry and are copied when coaches add that exercise. They are editable per exercise and overridable per plan; no platform defaults screen or universal defaults row exists. (PO S20 Message B section 1; supersedes v3 FR-005)

### Volume

Pure function `lib/plans/workout/volume.ts` over the document + snapshots; secondary credit uses the fixed immutable 5,000-basis-point constant (0.5, D17-1=A), not a configurable value; table-driven tests.

### Export

`lib/plans/export/` shared module (also used by F18): print route rendering a selected published version with RTL print CSS; ExcelJS workbook built in the browser from the published-version API response. Version selection is explicit; drafts are not exportable (FR-011, D17-8=A).

### Authorization

Plan actions require `coaching_work` in the plan workspace. Workspace-template reads/writes require `coaching_work` in the template workspace. Global-template reads use F16 `can_read_global_coaching_content()`; global-template writes, retirement and Make it Global require PO-only D17-3 authority. Exercise defaults come from F16 catalog entries, not a platform settings action.

## Validation phases

RED-first: full SC-002 negative matrix, readiness cleared by save, stale ready_revision refused by publish, source_revision uniqueness, variation v2 not altering a v1-pinned draft, duplicate-day descendant id remap, template version concurrency, per-exercise defaults and coach overrides, export audit + formula-injection strings, schema registry fail-closed, independent first-delivery idempotency/concurrency and exactly-once activation through Plan Core, parameter-preserving moves (property test), version immutability, foreign-workspace negatives, template copy semantics, volume table, export golden files (AR/EN). Integration on a dedicated stack. Playwright + axe AR/EN light/dark mobile/desktop, including keyboard-only reorder.

## Migration range

20261107000000-20261107235959 (valid UTC timestamps).

## Ownership

Implementation staffing and sequencing are tracked outside these canonical contract artifacts; feature requirements and dependencies are recorded here.

## Dependencies

Hard: F16 merged; F13 subscription lifecycle available; Plan Core merged before F17/F18 integration. F17 and F18 may develop domain work in parallel and integrate against the same Plan Core contract. P4 consumes both.

## Risks

| Risk | Mitigation |
|---|---|
| Planner UI size vs Free-tier 10 ms CPU | Client-side editing; server only validates/saves; size cap; perf gate |
| Drift between F17/F18 plan core | Single Plan Core Contract doc + mirrored contract tests in both |
| Drag-and-drop accessibility | Keyboard move controls required (FR-016) |
| P4 activation integration | Preserve F12 `subscription_activations.delivery_event_id` as NOT NULL for legacy readers; P4 adds typed workout/nutrition delivery links and uses them as authoritative proof that both first deliveries succeeded. |
| JSONB schema evolution | `schema_version` + versioned Zod parsers; old versions render via their own parser |

## Approved PO decisions

D17-1=A primary muscle credit 1.0 and secondary 0.5; D17-2 per-exercise defaults, no universal defaults; D17-3 global templates PO-only and workspace templates by authorized staff, with safe PO Make it Global; D17-4=A fixed reps and ranges; D17-5=A drafts allowed after client approval, publishing requires submitted intake; D17-7=A kg/lb per set plus Bodyweight, Added Weight and Assisted modes; D17-8=A published-plan exports only with audit and formula-injection protection; D17-9 catalog-based alternatives editable per plan. (PO S20 Message B section 2.)
