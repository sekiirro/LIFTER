# F16 Catalog API and RPC Contract

Observable contract only. Exact SQL argument types and transport schemas remain implementation details unless specified by `spec.md`/`plan.md`.

## Role authorization matrix

| Operation | PO | WO | Trainer | Sales | Client | Unknown/unauthenticated |
| --- | --- | --- | --- | --- | --- | --- |
| Read global catalog/search/history | Allow directly, including without workspace membership | Allow with current `coaching_work` membership in at least one workspace | Same as WO | Deny | Deny; clients receive plan snapshots only | Deny |
| Create global exercise; edit/version; taxonomy governance | Allow | Deny | Deny | Deny | Deny | Deny |
| Remove/restore/merge global exercise or food | Allow | Deny | Deny | Deny | Deny | Deny |
| Create global food | Allow if PO identity is authenticated | Allow with current `coaching_work` in at least one workspace | Allow with current `coaching_work` in at least one workspace | Deny | Deny | Deny |
| Edit/version global food | Allow | Allow only when current actor is the food creator; otherwise deny | Allow only when current actor is the food creator; otherwise deny | Deny | Deny | Deny |
| Read/write workspace-only exercise | Allow with explicit workspace scope | Allow in own current workspace | Allow in own current workspace | Deny | Deny | Deny |
| Read/write workspace exercise variation | Allow for any explicit workspace | Allow in own current workspace | Allow in own current workspace | Deny | Deny | Deny |
| Resolve workspace video | Allow for selected authorized workspace | Allow for own authorized workspace | Allow for own authorized workspace | Deny | Deny | Deny |

`coaching_work` is checked against current membership on every request. PO's global authority does not require a workspace membership, but a PO writing a workspace row supplies and authorizes that workspace. Denials are generic and do not reveal whether foreign-workspace IDs or global creator/origin metadata exist.

## Two-wall and SQL parity contract

- TypeScript server actions/services call `authorize()` before validation, resolve explicit scope, and do not treat hidden controls as access control.
- Database functions independently authorize `auth.uid()`, role/capability and current membership. RLS repeats the same read/write boundaries. Every role/action row above must have matching TypeScript and SQL tests; maintain a single parity fixture/table asserting both matrices agree.
- Base catalog tables have no direct authenticated INSERT/UPDATE/DELETE grants. Mutations use approved RPCs only; workspace RLS uses `has_workspace_access(workspace_id, 'coaching_work')`. Global read policy and read function use the same PO-or-coaching-staff rule.
- Definer functions use the established F12-F15 owner pattern, empty search path, qualified names, explicit revokes/grants, and no dynamic SQL. Authorization occurs before validation and is rechecked after lock waits.
- Every security guard has a test-first RED case and a mutation check that deliberately removes/bypasses that guard and confirms the test fails: app authorization, SQL role/capability, RLS, current membership, tenant composite key, creator masking, video host validation, lifecycle immutability, stale-version CAS, operation-key binding, merge lock/state, audit privacy, and add-rate/active-count limits.

## Mutating RPCs

Every mutation accepts an action-bound UUIDv4 operation key, request data, and (for edits/transitions) expected current version. Same actor/key/action/hash returns the original result; same key with a different action/hash returns conflict. Successful mutation appends one audit event atomically. Stale versions return conflict; membership/capability is rechecked after lock waits.

### Shared operation-key ledger (S23 R8)

`app_private.operation_keys` is a feature-neutral ledger for F16, Plan Core, F17 and F18. Its stable columns are `actor_user_id`, two-segment `action`, UUIDv4 `operation_key`, canonical SHA-256 `request_hash`, original JSONB `result`, and `created_at`. The primary key is `(actor_user_id, operation_key)`, so one key cannot be rebound to another action or request. A caller checks authorization and acquires resource locks before looking up a replay, rechecks authorization after lock waits, then performs the write, stores the result once, and writes its audit event in the same transaction. Exact actor/action/hash replay returns that stored result; changed action or hash raises `operation_key_request_conflict`. The ledger grants no direct access to client roles and stores no key outside the UUID column. Entries older than 30 days are deleted by the existing hourly F11 retention job; activation of that job remains deferred to its approved pre-production step.

**Consumer transaction rule (required for every mutating RPC in F16, Plan Core, F17 and F18):** perform, in this order and in one database transaction: authorize the actor and requested scope; acquire deterministic locks for the canonical identity roots (or deterministic creation/key locks when the identity does not yet exist); call `operation_key_result(actor, action, key, request_hash)`; if it returns a result, recheck current membership/capability and resource ownership after lock waits, then return the saved response; otherwise claim `(actor_user_id, operation_key)`, do the work, write exactly one audit event when required, and set the immutable result once before commit. If claiming races and raises `unique_violation`, do not leak `23505`: recover to a savepoint/subtransaction, call `operation_key_result` again, and return the identical stored response (or the normal action/hash conflict). The losing transaction must not perform a second effect. This is a shared consumer contract; later features must not require schema changes to `operation_keys`.

| RPC | Action | Allowed role/scope | Result contract |
| --- | --- | --- | --- |
| `catalog_create_exercise` | Create global identity + v1 | PO only | Stable ID and v1; bilingual name/taxonomy fields valid; one audit event. |
| `catalog_version_exercise` | Append global exercise version | PO only | New immutable version under same ID; expected-version CAS. |
| `catalog_transition_exercise` | Global exercise Remove/Restore | PO only | Append lifecycle revision/event without editing content versions; expected-revision CAS. |
| `catalog_merge_exercise` | Merge global exercise identities | PO only | Active source; target resolves to active terminal; aliases flatten; no content or plan reference rewrites; one audit event. |
| `catalog_resolve_exercise_selection` | Resolve a requested exercise identity for new selection | PO or current coaching staff | Returns the active terminal identity for merged aliases, otherwise the active identity or null. |
| `catalog_resolve_exercise_video` | Resolve current selected-workspace mapping | PO for an explicit workspace; WO/Trainer with current `coaching_work` in that workspace | HTTPS YouTube/Google Drive URL only; returns only the selected workspace mapping, resolved dynamically. |
| `catalog_remove_exercise` / `catalog_restore_exercise` | Global lifecycle transition | PO only | Append non-destructive Remove or Restore marker; preserve identity, versions, plans and snapshots. |
| `catalog_merge_exercise` | Supersede duplicate identity | PO only | Active survivor only; deterministic pair locking; no chains/cycles. |
| `catalog_write_workspace_exercise` | Create/version workspace-only exercise | PO for explicit authorized workspace; WO/Trainer in own workspace | Workspace-bound identity/version; no cross-workspace read. |
| `catalog_write_variation` | Create or version a mapping | PO for any explicit workspace; WO/Trainer with `coaching_work` in the explicitly selected workspace | Append a mapping version for the shared global exercise ID; HTTPS YouTube/Drive only. |
| `catalog_transition_variation` | Remove/restore a workspace mapping | PO for any explicit workspace; WO/Trainer with current `coaching_work` in that workspace | Append a lifecycle marker for the same mapping; video resolution hides removed mappings and resumes on restore. |
| `catalog_create_food` | Create global food v1 | PO, or WO/Trainer with current `coaching_work` in one explicitly selected workspace | Immediate global availability; persist immutable `created_by` and `origin_workspace_id` provenance; PO may create without workspace context; required nutrition/servings; kcal discrepancy is warn-only; enforce dedup and D16-10. |
| `catalog_version_food` | Append food version | PO or creator | New immutable version; expected-version CAS; duplicate checks against changed names. |
| `catalog_remove_food` / `catalog_restore_food` | Global lifecycle transition | PO only | Append non-destructive Remove or Restore marker; preserve identity, versions, plans and snapshots. Restore re-reserves the exact keys atomically and conflicts if another active food owns one. |
| `catalog_merge_food` | Supersede duplicate identity | PO only | Active survivor only; deterministic pair locking; no chains/cycles. |
| `catalog_version_taxonomy_term` | Append taxonomy labels/lifecycle | PO only | Stable code, immutable term version; old exercise versions unchanged. |

## Read RPCs

| Read operation | Authorization | Projection |
| --- | --- | --- |
| `catalog_search(kind, query, filters, cursor, workspace_id)` | Global reads use the PO-or-current-coaching-staff predicate and return global rows only; workspace reads require one explicit `workspace_id` plus current `coaching_work` in it | Max 50, stable order, indexed normalized search; workspace-owned rows and videos from other workspaces are never returned or inferable. |
| `catalog_food_detail(food_id, version)` | PO or current coaching staff, including PO without membership | One immutable food version; provenance is visible only to PO. |
| `catalog_food_history(food_id)` | PO or current coaching staff, including PO without membership | Immutable versions newest first; provenance is visible only to PO. |
| `catalog_food_export_safe` | PO or current coaching staff through the safe read views | Same version and provenance projection as detail/history; exports use this safe view. |
| Workspace exercise or variation detail/history | Explicit `workspace_id` plus current `coaching_work` in that workspace | Returns only that workspace's rows and media; errors and counts do not reveal another workspace. |
| Workspace video resolution | Explicit selected workspace and current `coaching_work` authorization on every call | Returns only that workspace's current authorized YouTube/Drive mapping; never returns or signals other workspace links. |

Read calls are not audit events. Client plan reads consume F17/F18 immutable snapshots and do not call catalog reads. Every non-PO RPC/view/search/detail/history/error/export projection nulls or omits both `created_by` and `origin_workspace_id`; name the negative and positive tests `global_food_provenance_masking_non_po` and `global_food_provenance_po_governance_read` respectively. Workspace read authorization and foreign-workspace non-disclosure are checked independently for search, detail/history, variation, video resolution and planner/export joins.

`catalog_food_duplicate_candidates(name, language, basis, product_identity, preparation_identity, weighing_state, kcal)` returns privacy-safe exact and near candidates to PO or current coaching staff. Exact matches use the localized normalized name and every identity dimension. Near matches use normalized text similarity >=90% and same-basis kcal tolerance `max(10%, 10 kcal)`; callers must require explicit confirmation before accepting a near match. Synonyms are never inferred. Internal `reserve_catalog_food_keys(food_id, version)` serializes name-key claims and uses a unique active reservation for each exact identity; Remove/Merge release keys and Restore reserves the current version atomically.

### Food addition limits (D16-10)

`catalog_create_food` serializes quota checks with a global transaction advisory lock and records each created identity in private `catalog_addition_limits` state. A creator may add at most 10 identities in any rolling 24-hour window; all authorized creators together may add at most 100. At most 10,000 identities may be active. Exact operation-key replay returns before quota evaluation and consumes no additional allowance. Remove and Merge deactivate the usage row; Restore reactivates it only when the active-food ceiling permits. Limit errors are `catalog_food_creator_limit`, `catalog_food_platform_limit`, and `catalog_food_active_limit`; all writes and usage-state changes roll back together.

## Audit action contract

Use the established two-segment format, e.g. `catalog.food_created`, `catalog.food_versioned`, `catalog.food_merged`, `catalog.exercise_versioned`, `catalog.taxonomy_versioned`. A successful write emits one event in the same transaction. Global `workspace_id` is NULL; workspace-specific changes carry that workspace ID. The audit writer accepts only catalog action/table pairs and the `identity_id`, `version`, `related_id`, and `changed_fields` detail keys; changed-field values are codes from the writer's fixed allowlist. It rejects names, nutrition values, notes, URLs, origin data, raw operation keys, and free text.
