# Implementation Plan: F18 Nutrition Templates & Nutrition Planner

**Spec**: spec.md (same folder) | **Status**: PO-approved plan; implementation not started (debate.md is historical)

## Summary

Nutrition plans on [the shared Plan Core contract](../019-plan-core/spec.md): schema v1 with single-day or seven-day structures, day types, conditional meals, items referencing exact F16 food versions, manual alternatives, one canonical exact-decimal macro algorithm (TypeScript + SQL parity), server-side rebuild/recompute on publish, PO-governed global and authorized workspace templates per D18-1, self-only client alternative selection, contributor attribution, and export via the shared module.

## Technical Context

Same stack and SECURITY DEFINER pattern as F16/F17. Consumes the shared Plan Core contract in specs/019-plan-core/spec.md and its implementation interface; never forks or redefines it. F16: `lib/catalog/snapshot.ts`, `catalog_search`, `can_read_global_coaching_content()`.

## Design

### Tables

`nutrition_plans(workspace_id, id, client_id, subscription_id, ...)`; `nutrition_plan_drafts`; `nutrition_plan_versions(workspace_id, plan_id, id, version, schema_version, source_revision, document, computed_totals, published_at, published_by, UNIQUE(workspace_id,id), UNIQUE(workspace_id,plan_id,version), UNIQUE(workspace_id,plan_id,source_revision))`; `nutrition_plan_version_contributors(workspace_id, version_id, staff_user_id, action_code, at)` with composite FK `(workspace_id, version_id) -> nutrition_plan_versions(workspace_id, id)` and workspace-scoped RLS; `nutrition_global_templates` + `nutrition_global_template_versions` (no workspace_id; FORCE RLS with a SELECT policy using `can_read_global_coaching_content()`, no DML policies); `nutrition_workspace_templates(workspace_id, id, ...)` + `nutrition_workspace_template_versions(workspace_id, template_id, version, ...)` with composite workspace FKs and `coaching_work` RLS; and version-scoped `client_alternative_selections` with one row per `(workspace_id, plan_version_id, client_id, item_id)` and a composite relation to the published version/client, per FR-009. Plan/version/template rows and contributor rows are immutable/append-only; authorized RPCs create versions, remove templates, and load a selected version. Make it Global uses a PO-only RPC that validates/removes private data and references, then copies eligible content to a distinct global identity/version without modifying the workspace original. Selection changes/clears occur only through its authorized RPC; direct DML remains revoked.

### Document schema v1 (`lib/plans/nutrition/schema.ts`, registered per Plan Core registry)

As FR-002; quantities/targets/totals are decimal strings. Published versions add `snapshots` (FoodSnapshotV1 map, DB-built) and `computed_totals` (DB-computed from exact intermediates, rounded once half-even to four decimal places and serialized as fixed-scale strings).

### Macro algorithm

`lib/plans/nutrition/macros.ts` (TypeScript, BigInt rational arithmetic on decimal strings) and `app_private.nutrition_compute_totals(document, snapshots)` (SQL `numeric`, no intermediate rounding). One shared golden-fixture set (500 cases incl. precision boundaries) run by both Vitest and the SQL integration suite; algorithm version recorded per schema version. Calories and macros display as integers while calculations and storage retain exact decimals (D18-4=C).

### Publish path

Route handler validates for UX only; `publish_nutrition_revision(expected_revision, operation_key)` (SECURITY DEFINER): authorize -> lock the stable `nutrition_plans` identity row -> check the idempotency ledger -> lock draft -> re-read expected revision -> recheck current membership and capability -> recheck lifecycle eligibility -> parse schema -> load exact food versions -> rebuild snapshots -> compute exact totals in SQL and round once half-even to four decimals -> look up `(workspace_id, plan_id, source_revision)` while holding the plan-root lock. If that published revision already exists, return its existing version and record this operation key's result without inserting a version, contributor row, or duplicate publish audit; this unchanged re-publish creates no new visible plan. Otherwise insert version + contributors -> read and copy valid client selections to the new version by stable item and alternative IDs (drop selections whose item/alternative is missing or invalid so coach default applies) -> one audit event. Concurrent publishes of the same revision serialize on the plan-root lock, so the later request observes and returns the first version instead of racing into a uniqueness error. Caller-supplied snapshots/totals are ignored. First-delivery and activation semantics are owned by Plan Core: the second independent first delivery performs the activation check in its delivery transaction or durably records the Plan Core retry item before committing; exact replay is idempotent, and no paired-publish transaction is required. F18 supplies the nutrition domain writer.

### Copy-forward ids

New versions from a draft keep unchanged item and alternative ids when content remains the same; duplicates remap their own and descendant ids. The publish and selection RPCs serialize on the same stable `nutrition_plans` identity row, acquired before locking draft or selection rows. Lock order is plan root -> idempotency ledger -> draft (publish only) -> selection rows; an exact replay rechecks current authorization before returning its stored result. If selection commits first, publish sees and carries it forward when the stable item and approved alternative IDs remain valid and the client remains authorized. If publish commits first, a selection request for the prior version fails with a stale-version conflict after it obtains the plan lock; the client rereads the current version and retries with a new operation key. Missing or invalid item/alternative IDs produce no new-version selection row, so the coach default applies. Idempotent retries with the same key and request hash return the original result.

### Client selection RPC

`select_nutrition_alternative(plan_version_id, item_id, alternative_id, operation_key)` on the client path, per FR-009: authorize the authenticated client only for their own plan; lock the stable plan root -> check idempotency -> for an exact replay, recheck current client-plan ownership before returning the result; otherwise lock/read the version-scoped selection row -> recheck current client-plan ownership and that `plan_version_id` is the current published version -> apply `selection_revision`; bind the key to `client.nutrition_select`; null clears; failures are generic. A stale-version conflict writes no selection; after rereading the current version, the client retries with a new operation key. The shared plan lock makes publish carry forward all selections committed before publish and prevents a stale selection write from racing past it.

### Authorization

Actions `plan.nutrition_read|write|ready|publish|export`, `template.nutrition_global_write`, `template.nutrition_workspace_write`, and PO-only `template.nutrition_make_global` (D18-1), `client.nutrition_select` (two-segment audit action names per the existing CHECK). Sales denied.

## Validation phases

RED-first per SC-002 inventory, golden macro parity (TS vs SQL), forged publish payload ignored, selection forgery/foreign-client/direct DML, concurrent selection serialization, contributor same-workspace composite-FK and foreign-workspace negative tests, conditional-meal visibility, seven-day schema invariants, copy-forward id stability, multiple simultaneous plans, version immutability, independent nutrition first-delivery retry/concurrency through Plan Core, export goldens AR/EN + formula injection, audit allowlist + log scrub, max-size CPU benchmark. Integration on a dedicated local Supabase stack, never shared with F17 integration at the same time (stack lock); wrapper rule: `supabase-safe.mjs --workdir <F18 worktree> --stack <assigned> exec -- ...`. Before implementation: tasks.md + clean analyze. Final: full gates, CodeRabbit APPROVED on the exact head, CI window, PO exact-SHA approval.

## Migration range

20261108000000-20261108235959 (valid UTC timestamps).

## Ownership

Implementation staffing and sequencing are tracked outside these canonical contract artifacts; feature requirements and dependencies are recorded here.

## Dependencies

Hard: F16 merged; Plan Core PR merged; F13 merged (eligibility). Parallel with the F17 planner. Blocks P4. Merge order: F16 -> Plan Core -> F17 || F18.

## Risks

| Risk | Mitigation |
|---|---|
| TS/SQL macro divergence | One golden-fixture set run by both; algorithm versioned per schema |
| Forged published data via direct RPC | DB rebuild + recompute; caller values ignored |
| Selection forgery across clients | Composite workspace FKs, identity from auth, item/alternative validation in the immutable document |
| Plan Core dependency serializes F18 | F18 plan-root writes follow the single Plan Core lock/idempotency order; domain/UI work can proceed in parallel |
| Stack contention with F17 | Separate stacks or stack-lock serialization |

## Approved PO decisions

D18-1 global templates PO-only; workspace templates by authorized staff; PO Make it Global safely without private data/references. D18-2=A targets optional, totals always calculated. D18-4=C calories/macros display as integers while exact decimals remain in calculations/storage. D18-6 optional HTTPS YouTube/Google Drive recipe/preparation link, hidden entirely when absent. D18-9=A selection persists while authorized and valid, otherwise coach default. (PO S20 Message B section 3.)


Plan-root F18 mutations follow the shared Plan Core order: authorize -> lock stable plan root -> idempotency lookup -> for an exact replay, recheck current actor authorization before returning the stored result; otherwise lock draft or selection row -> re-read expected revision/current published version -> recheck current actor authorization (staff membership/capability or client self-ownership) and lifecycle eligibility -> validate/write -> one audit event. Template-root mutations lock the template identity before idempotency and version recheck; template creation uses a deterministic creation lock until its root exists. (Plan Core implementation contract.)
