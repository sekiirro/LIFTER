# Implementation Plan: F18 Nutrition Templates & Nutrition Planner

**Spec**: [spec.md](spec.md) · **Design detail**: [data-model.md](data-model.md) · **Contracts**: [contracts/](contracts/)
**Status**: S43 updated spec-only draft. No code, migration, UI, test or workflow change is part of this plan's delivery. Prompt copy is approved byte-exact by S43-PO-5 (architect mapping S43-R6); implementation entry remains blocked by the pending F19 contract.

## Summary

Nutrition plans on the pending F19 Plan Core contract: a versioned nutrition document (single-day or seven-day, day types, meals visible on their own containing day with no day-type filtering, foods with exact quantities, coach alternatives, separate independently editable Meal Notes and Food Notes, optional recipe link) with one exact-decimal algorithm implemented identically in TypeScript and SQL; publish-time snapshot rebuild and server-side recomputation; PO-only global nutrition templates with PO-only manual Assign into independent workspace copies; workspace template management; version-scoped self-only client alternative selection with client-visible recalculation; PDF/Excel/`Copy AI Prompt` exports that distinguish the coach original from the client's permitted selection.

## Technical context

- Same stack as F16/F17: Next.js on Cloudflare + Supabase; RLS at the database wall, application check at the first wall; SECURITY DEFINER RPCs for writes; the shared operation-key ledger for idempotency.
- Consumes, never forks: F19 lifecycle/delivery/activation (pending), F16 `FoodSnapshotV1`, `catalog_search`, serving units, immutable food versions, `can_read_global_coaching_content()`/`is_platform_owner()`/`has_workspace_access` as they exist on `main`.
- Pending dependencies are cited as pending. This plan does not assume an unmerged F19 schema is final; the F18 foreign keys adapt to the merged F19 keys while the F18 invariants stay fixed.

## Constitution check

| Principle             | Plan response                                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I Workspace isolation | Composite tenant keys on every F18 table; two walls; foreign-workspace negatives per endpoint/table/export. Global template tables are platform-scope with no workspace read policy.                             |
| II Financial truth    | n/a; productivity units are F19's.                                                                                                                                                                               |
| III PO governance     | PO-only global templates, Assign and Make it Global; existing checks only; Sales denied.                                                                                                                         |
| IV Approved scope     | Every requirement traces to PRD-05/06/12, D18-x, A5/A6 or F19; no invented behavior; open questions are MCQs.                                                                                                    |
| V Versioned content   | Immutable revisions/template versions; exact-version food snapshots; exact stored computed values with display-only rounding (no storage rounding); schema/algorithm version frozen per revision.                |
| VI People decisions   | n/a.                                                                                                                                                                                                             |
| VII Privacy           | Health-adjacent content; audit allowlist + log scrub; exports/selection audited; prompt privacy follows the resolved staff export-authorization rule; body EN/AR matches the approved local byte-exact contract. |
| VIII Bilingual UI     | AR-first RTL + EN-LTR, design gate, keyboard access, no machine translation, no unapproved copy.                                                                                                                 |
| IX Idempotency        | Operation keys, CAS, deterministic lock order, no duplicate revision/copy/selection/batch.                                                                                                                       |

## Design

### 1. Identity and lifecycle (F19)

F18 adds no plan/draft/revision/delivery/activation table. A nutrition plan root is an F19 root with `plan_kind='nutrition'`, `workspace_id` and `client_id`; the subscription is bound only by a `plan_deliveries` row at Ready & Publish. F18 supplies:

- document validation and computed values at draft save and publish;
- the publish-time snapshot rebuild (inside the F19 publish transaction);
- selection carry-forward inside that same transaction;
- nutrition export reads.

### 2. Document schema v1

Implemented as a frozen, versioned schema module with one fixture set shared by the app validator, the RPC validator and the renderer. `single_day` has an always-required `implicitDayTypeId`; `seven_day` covers dayIndex 0–6 exactly once. Ids are unique within the document; duplicated content remaps its own and descendant ids. Quantities/targets are decimal strings; quantity units use a tagged basis-or-serving reference so catalog keys `g` and `ml` remain distinct from basis units. Each meal appears on, and contributes only to, the day that contains it (the implicit single day, or its own seven-day entry), so days with different meals have independent totals; day types remain available for other nutrition behavior such as carb cycling. Meal Notes and Food Notes are separate editable fields. The optional recipe/preparation link is an HTTPS URL on YouTube or Google Drive only (D18-6); the F16 exercise-video host rule (D16-3/FR-014) does not govern nutrition recipe links, and no `docs.google.com` exception is invented beyond the approved "Google Drive" wording. Contract: `contracts/nutrition-document.md`.

### 3. Canonical algorithm and total derivation

One TypeScript implementation (BigInt coefficient/scale on decimal strings) and one SQL implementation (`numeric`, no intermediate rounding) run the same golden fixture set, including finite-decimal precision boundaries, alternatives, selected-alternative totals, and each day's total counting exactly the meals contained in that day. Sum the item values of each day's own meals into that day's total (a meal never contributes to another day); document totals sum the day totals. Inputs use the live F16 scales; stored results preserve the exact computed decimal at a scale sufficient for the declared input scales; storage does not round. Display applies half-up once from the exact value and never changes stored values. Aggregates come from full-precision exact values. Display is a pure string function (calories integer; macro < 10 g one decimal, ≥ 10 g integer). Display and canonicalization use half-up rounding (S43-PO-1; architect mapping (S43-R1)). Since the supported finite-decimal inputs are multiplied and divided only by 100, repeating-fraction outputs are not realizable fixtures.

### 4. Publish path

`publish_nutrition_revision(expected_revision, operation_key)` (SECURITY DEFINER, invoked from the F19 Ready & Publish flow):

1. authorize (two walls);
2. on a retry, resolve the committed operation receipt with a nonlocking tenant-scoped probe to learn its originally bound subscription, take the F19 lock order (client → that subscription → plan root), re-read the operation ledger, and return the matching receipt before any subscription-eligibility check — an exact authorized replay is returned even if entitlement has since expired;
3. for a new operation key only, resolve the current subscription per F19 (no current subscription ⇒ refused before any nutrition work), then take the F19 lock order → lock draft → idempotency lookup → re-read expected revision → recheck authorization and lifecycle;
4. parse the document with the frozen validator;
5. load every referenced exact food version (items + alternatives), build the per-(version, unit kind, unit identity) snapshot map, recompute all values in SQL;
6. insert the F19 revision + the F18 content row atomically;
7. carry forward valid selections by stable item/alternative id;
8. write one publish audit event; the F19 delivery/activation/productivity writes happen in the same transaction, not here.

Caller-supplied snapshots/totals are ignored. Replaying the same operation key with the same canonical request returns its original receipt; each new authorized Ready & Publish operation appends a new revision and delivery, even when content is unchanged. A missing referenced food version fails the publish with no revision.

### 5. Client selection

`select_nutrition_alternative(plan_version_id, item_id, alternative_id | null, operation_key)`:
authorize the authenticated client for their own plan and current subscription; lock the plan root; lock/read the selection row and per-revision counter; idempotency lookup; re-read the current published revision; verify the item and alternative exist in that immutable revision; upsert/delete and increment the durable per-revision counter only on a real change; one success audit event; generic failures with the required denial audit and no domain-state change.

Client-visible values are derived on read from the revision's snapshot map and the alternative's coach-specified portion. No stored selected totals. See `contracts/nutrition-api.md`.

### 6. Templates and Assign

- Global: platform-scope identities + immutable versions, PO-only writes and reads.
- Workspace: tenant-scope identities + immutable versions with `origin_global_template_id/version`, branded `display_name`, `coaching_work` RLS, PO cross-workspace rights.
- Assign: one transaction, one operation key, PO-only. Step 1 mode (all/specific/all_except), Step 2 mode (all/specific). Check an authorized key/hash replay before resolving live targets or applying zero-copy validation; a new zero-copy operation is rejected before writes. `All Workspaces` evaluates **nutrition-only** initialization at operation time; `Specific Workspaces` skips and reports any retained copy, active or retired, of a template identity regardless of source version. Per target, create one independent workspace copy only for missing identities; never update, overwrite or top up. Contract: `contracts/template-assignment.md`.
- Make it Global: PO-only; validate the source for client data/private references; refuse with field codes; on success create a separate global identity + version.
- Load: creation-time/empty-draft only; copy one explicit immutable template version into the private draft; deep copy, new ids; no live link; a destructive load into existing content is refused.

### 7. Exports

One shared export reader returns an authorized projection (plan, revision, content, computed values, alternatives, selection) and feeds three renderers:

- PDF (shared RTL print layout);
- Excel (workbook skeleton, text-only coach cells, formula-injection tests);
- `Copy AI Prompt` (faithful plan text; no generation instruction).

Both walls are checked before any read; every success and denial is audited. Client selection is primary with recalculated totals; coach original is a per-item side note. Staff export-authorized roles may invoke Copy AI Prompt; selection/totals are included. Prompt body is byte-exact in contracts/copy-ai-prompt.md; substitute {{PLAN_CONTENT}} only (S43-PO-5; architect mapping (S43-R6)). The copied prompt includes the per-item coach-original note and totals rows contain client-selection totals only (S43-PO-2; architect mapping (S43-R4)).

### 8. Audit and privacy

One audit module extension with nutrition action codes and a field allowlist. No content, quantities, macros, notes, recipe text, URLs, document JSON or raw keys. Log-scrub tests assert zero health-content occurrences. Export denials are audited with resource ids only.

### 9. UI

The editor, alternatives editor and template manager reuse existing design-system components and the existing AR/EN catalogs; the historic F18 UI evidence is reference only (mocked projections, not merged). No new user-visible string is added by this draft; a copy gate is required before implementation. Keyboard alternatives to drag, accessible live totals, and loading/empty/error/conflict/unavailable states are acceptance criteria.

### 10. Performance and capacity

No hard-coded envelope is adopted. Before implementation, define the maximum document envelope and bench it on the merged stack; the historic Worker p95 ≤ 5 ms and DB/API p95 ≤ 300 ms figures are provisional and must be re-measured (`F18-SC-006`). Record bytes per revision and template against the F16/F19 storage budget.

## Contracts

| File                                                                 | Covers                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [contracts/nutrition-document.md](contracts/nutrition-document.md)   | Document v1 shape, invariants, snapshot keying, computed-value shape, validator fixture rules                                          |
| [contracts/nutrition-api.md](contracts/nutrition-api.md)             | RPCs, actions, authorization matrix, idempotency/lock order, selection, export/prompt reader, audit codes                              |
| [contracts/template-assignment.md](contracts/template-assignment.md) | Global/workspace template lifecycle, Assign modes and skip rules, Make it Global, load/copy, state derivation, S43 assignment decision |

## Validation phases

1. **Contract fixtures (independent)**: document schema, macro/total goldens, publish ignore-caller-data, selection, assignment state machine, export/prompt fidelity.
2. **Persistence**: F18 content table on F19 revisions, snapshot map build, computed values, immutability/privileges.
3. **RPCs**: publish, selection, carry-forward, template create/version/retire/load, Assign, Make it Global — each with RED-first negative tests.
4. **Security matrix**: every endpoint/table/export; foreign workspace/client, Sales, client, revoked membership, direct DML, replay/conflict, concurrency, malformed references, forged payloads.
5. **Exports**: goldens AR/EN, selection distinction, formula injection, prompt fidelity.
6. **Audit**: allowlist + log scrub.
7. **Benchmark**: envelope defined and measured; provisional numbers replaced.
8. **Release**: migration ordering/scan, fresh replay + upgrade rehearsal, zero direct DML, frozen schema/algorithm, full gates.

Each task begins with its failing test, then the minimal implementation, then the named mutation. Database work runs on an assigned local stack, never a shared one. Analysis must be re-run after any spec/plan/task change.

## Migration

None reserved. At implementation time: scan every `origin` ref, choose one unused version above the global maximum, forward-only, no destructive change, no edit to a pushed migration, and rehearse fresh + upgrade before merge.

## Dependencies

Hard: F16 merged (food versions, serving units, snapshot transport) — **landed**. F19 merged (identity/draft/revision/delivery/activation) — **pending**. F13 merged (entitlement) — landed. F17 is a parallel lane; F18 shares assignment _shape_ but not tables/types and does not depend on F17 code.

## Risks

| Risk                                         | Mitigation                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS/SQL macro divergence                      | One golden set executed by both; algorithm version frozen per revision; mutation tests on rounding and aggregate derivation.           |
| Snapshot cannot serve multiple serving units | Per-(version, serving unit) snapshot map; publish rebuild test with two units of one food version.                                     |
| F19 key/shape drift                          | F18 foreign keys adapt to merged F19 keys; invariants unchanged; integration test fails fast if the revision composite key is missing. |
| Assignment overload/wrong skip               | Pure state-machine fixtures for all/specific/all-except × all/specific, initialized/partial/uninitialized, retries.                    |
| Selection drift or forgery                   | Ids-only selection, derived totals, composite FKs, self-only RPC, plan-root serialization, negative and race tests.                    |
| Export leaks cross-workspace                 | Both walls before read; negative matrix per renderer; audit denials.                                                                   |
| Unapproved copy                              | Hard copy gate; no new string in this draft.                                                                                           |
| Unbounded document                           | Envelope defined and benchmarked before implementation.                                                                                |

## Complexity tracking

| Deviation                                     | Why                                                                                                                        | Status                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| F18 content side table keyed to F19 revisions | F19 owns lifecycle but not the nutrition shape; keeps domain content versioned with the revision without forking lifecycle | Technical; reconcile with F19 implementation (F18-C-10) |
| Contributor attribution retained in F18       | PRD-06 requires independent contributions; F19 spec currently omits it                                                     | Technical; move to F19 if it lands there (F18-C-11)     |
| Selection totals derived on read              | Prevents drift and editability of client-visible values                                                                    | Accepted; caching allowed only with the stated key      |

## Open items and blocked work

S43-MCQ-A prompt body EN/AR is resolved by S43-PO-5 and has per-locale byte-equality acceptance. The S43-MCQ-B representation is decided by S43-PO-2 (per-item coach-original note in exports and copied prompt; client-selection totals only).

## S43-PO-8 historical export plan

T023 implements the revision-scoped last-valid-selection export contract and its PDF/Excel goldens. Historical exports read selection history for the requested revision and never substitute the current revision's selection. The task is unblocked and remains unchecked until implementation tests pass. **architect mapping (S43-R10).**
