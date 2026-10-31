# F16 Catalog API and RPC Contract

Observable contract only. Exact SQL argument types and transport schemas remain implementation details unless specified by `spec.md`/`plan.md`.

## Role authorization matrix

| Operation | PO | WO | Trainer | Sales | Client | Unknown/unauthenticated |
| --- | --- | --- | --- | --- | --- | --- |
| Read global catalog/search/history | Allow directly, including without workspace membership | Allow with current `coaching_work` membership in at least one workspace | Same as WO | Deny | Deny; clients receive plan snapshots only | Deny |
| Create global exercise; edit/version; taxonomy governance | Allow | Deny | Deny | Deny | Deny | Deny |
| Archive/remove/restore/merge global exercise or food | Allow | Deny | Deny | Deny | Deny | Deny |
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

| RPC | Action | Allowed role/scope | Result contract |
| --- | --- | --- | --- |
| `catalog_create_exercise` | Create global identity + v1 | PO only | Stable ID and v1; bilingual name/taxonomy fields valid; one audit event. |
| `catalog_version_exercise` | Append global exercise version | PO only | New immutable version under same ID; expected-version CAS. |
| `catalog_retire_exercise` | Global lifecycle transition | PO only | Append lifecycle marker/version; no delete. |
| `catalog_merge_exercise` | Supersede duplicate identity | PO only | Active survivor only; deterministic pair locking; no chains/cycles. |
| `catalog_write_workspace_exercise` | Create/version workspace-only exercise | PO for explicit authorized workspace; WO/Trainer in own workspace | Workspace-bound identity/version; no cross-workspace read. |
| `catalog_write_variation` | Create/version/archive/restore a mapping | PO for any explicit workspace; WO/Trainer in own workspace | Workspace mapping version for shared global exercise ID; HTTPS YouTube/Drive only. |
| `catalog_create_food` | Create global food v1 | PO, WO or Trainer with current coaching membership | Immediate global availability; required nutrition/servings; kcal discrepancy is warn-only; enforce dedup and D16-10. |
| `catalog_version_food` | Append food version | PO or creator | New immutable version; expected-version CAS; duplicate checks against changed names. |
| `catalog_retire_food` | Global lifecycle transition | PO only | Append marker/version; hide from new selection, preserve references. |
| `catalog_merge_food` | Supersede duplicate identity | PO only | Active survivor only; deterministic pair locking; no chains/cycles. |
| `catalog_version_taxonomy_term` | Append taxonomy labels/lifecycle | PO only | Stable code, immutable term version; old exercise versions unchanged. |

## Read RPCs

| Read operation | Authorization | Projection |
| --- | --- | --- |
| `catalog_search(kind, query, filters, cursor)` | Global PO-or-current-coaching-staff predicate; workspace items also require matching current workspace access | Max 50, stable order, indexed normalized search, no creator/origin to non-PO, no foreign workspace variation data. |
| Entry/version detail read (via hardened `catalog_search` continuation or dedicated hardened read function) | Same rule as search | Explicit immutable versions; non-PO creator/origin omitted; lifecycle clearly identified. |
| Workspace video resolution | Explicit selected workspace authorization on every call | Returns only that workspace's current authorized YouTube/Drive mapping; never returns or signals other workspace links. |

Read calls are not audit events. Client plan reads consume F17/F18 immutable snapshots and do not call catalog reads.

## Audit action contract

Use the established two-segment format, e.g. `catalog.food_created`, `catalog.food_versioned`, `catalog.food_merged`, `catalog.exercise_versioned`, `catalog.taxonomy_versioned`. A successful write emits one event in the same transaction. Global `workspace_id` is NULL; workspace-specific changes carry that workspace ID. Details are allowlisted IDs and changed-field codes only.
