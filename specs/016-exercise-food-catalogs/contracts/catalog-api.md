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

### Planned operations (not implemented)

The rows below describe the F16 redesign (S35-PO-3, S36-PO-2). They are not implemented in this tree and are kept out of the implemented matrix above, which `tests/unit/catalog-role-parity.test.ts` parses against the SQL fixture. Each row moves into the implemented matrix in the same commit that adds its SQL, fixture row and parity test.

| Planned operation (not implemented) | PO | WO | Trainer | Sales | Client | Unknown/unauthenticated |
| --- | --- | --- | --- | --- | --- | --- |
| Edit/version canonical global exercise (global admin scope only; S36-PO-2, F16-MCQ-5 answered a) | Allow in an explicit global admin scope only; never from a personal-workspace context | Deny | Deny | Deny | Deny | Deny |
| Workspace override create/update of name, description, instructions, video and alternatives (CAS; S36-PO-2) | Allow for an explicit workspace; a personal-workspace edit writes only that workspace's override | Allow in own current workspace | Allow in own current workspace | Deny | Deny | Deny |
| Workspace override remove/clear (video removal restores global fallback; F16-MCQ-6 answered a) | Allow for an explicit workspace | Allow in own current workspace | Allow in own current workspace | Deny | Deny | Deny |
| Client-plan exercise video projection (published plan only; workspace-private exercises pending F16-MCQ-9) | Not a staff operation; use the workspace video row | Not a staff operation; use the workspace video row | Not a staff operation; use the workspace video row | Deny | Allow only for own authenticated client and published plan | Deny |

### Executable app-wall matrix (T032)

| App-wall operation | PO | WO | Trainer | Sales | Client | Unknown/unauthenticated | Mutation assertion |
|---|---|---|---|---|---|---|---|
| Global search | Allow without membership | Allow with current coaching membership | Same as WO | Deny | Deny | Deny | Removing the role guard makes the no-RPC denial assertion fail. |
| Global exercise create/version/lifecycle/merge | Allow | Deny | Deny | Deny | Deny | Deny | Removing the PO guard makes the no-RPC role assertions fail. |
| Workspace exercise/variation write | Allow for explicitly scoped authorized workspace | Own current workspace | Own current workspace | Deny | Deny | Deny | Removing the scope/membership guard makes foreign and revoked workspace assertions fail. |
| Food create | Allow, with optional origin workspace | Current coaching membership | Current coaching membership | Deny | Deny | Deny | Removing the role/scope guard makes the no-RPC denial assertions fail. |
| Food version | Allow | Current creator only | Current creator only | Deny | Deny | Deny | Making creator preflight always true causes the non-creator assertion to fail. |
| Food lifecycle/merge | Allow | Deny | Deny | Deny | Deny | Deny | Removing the PO guard makes the no-RPC role assertions fail. |

Unit mutation checks also prove that replacing the production session-client boundary with service-role access, exposing a raw database error, or dropping UUIDv4 operation-key forwarding fails. The role/session integration test runs against Stack C RPCs; Client and unknown have no staff role and are denied by the same non-disclosing app-wall rule.

## Two-wall and SQL parity contract

- TypeScript server actions/services call `authorize()` before validation, resolve explicit scope, and do not treat hidden controls as access control.
- Database functions independently authorize `auth.uid()`, role/capability and current membership. RLS repeats the same read/write boundaries. Every role/action row above must have matching TypeScript and SQL tests; maintain a single parity fixture/table asserting both matrices agree.
- Base catalog tables have no direct authenticated INSERT/UPDATE/DELETE grants. Mutations use approved RPCs only; workspace RLS uses `has_workspace_access(workspace_id, 'coaching_work')`. Global read policy and read function use the same PO-or-coaching-staff rule.
- Definer functions use the established F12-F15 owner pattern, empty search path, qualified names, explicit revokes/grants, and no dynamic SQL. Authorization occurs before validation and is rechecked after lock waits.
- Every security guard has a test-first RED case and a mutation check that deliberately removes/bypasses that guard and confirms the test fails: app authorization, SQL role/capability, RLS, current membership, tenant composite key, creator masking, video host validation, lifecycle immutability, stale-version CAS, operation-key binding, merge lock/state, audit privacy, and add-rate/active-count limits.

## Mutating RPCs

Every mutation accepts an action-bound UUIDv4 operation key, request data, and (for edits/transitions) expected current version. Same actor/key/action/hash returns the original result; same key with a different action/hash returns conflict. Successful mutation appends one audit event atomically. Stale versions return conflict; membership/capability is rechecked after lock waits.

### Shared operation-key ledger (S23 R8)

`app_private.operation_keys` is a feature-neutral ledger for F16, Plan Core, F17 and F18. Its stable columns are `actor_user_id`, two-segment `action`, UUIDv4 `operation_key`, canonical SHA-256 `request_hash`, original JSONB `result`, and `created_at`. The primary key is `(actor_user_id, operation_key)`, so one key cannot be rebound to another action or request. A caller checks authorization and acquires resource locks before looking up a replay, rechecks authorization after lock waits, then performs the write, stores the result once, and writes its audit event in the same transaction. Exact actor/action/hash replay returns that stored result; changed action or hash raises `operation_key_request_conflict`. The ledger grants no direct access to client roles and stores no key outside the UUID column. Entries older than 30 days are deleted by the existing hourly F11 retention job; activation of that job remains deferred to its approved pre-production step. The existing inactive job `lifter-f11-purge-signup` now invokes `app_private.purge_f11_retained_data()`, which runs both signup-attempt and expired-operation-key purges; no schedule is active.

**Consumer transaction rule (required for every mutating RPC in F16, Plan Core, F17 and F18):** perform, in this order and in one database transaction: authorize the actor and requested scope; acquire deterministic locks for the canonical identity roots (or deterministic creation/key locks when the identity does not yet exist); call `operation_key_result(actor, action, key, request_hash)`; if it returns a result, recheck current membership/capability and resource ownership after lock waits, then return the saved response; otherwise claim `(actor_user_id, operation_key)`, do the work, write exactly one audit event when required, and set the immutable result once before commit. If claiming races and raises `unique_violation`, do not leak `23505`: recover to a savepoint/subtransaction, call `operation_key_result` again, and return the identical stored response (or the normal action/hash conflict). The losing transaction must not perform a second effect. This is a shared consumer contract; later features must not require schema changes to `operation_keys`.

| RPC | Action | Allowed role/scope | Result contract |
| --- | --- | --- | --- |
| `catalog_create_exercise` | Create global identity + v1 | PO only | Stable ID and v1; bilingual name/taxonomy fields valid; one audit event. |
| `catalog_version_exercise` | Append global exercise version | PO only | New immutable version under same ID; expected-version CAS. |
| `catalog_transition_exercise` | Global exercise Remove/Restore | PO only | Append lifecycle revision/event without editing content versions; expected-revision CAS. |
| `catalog_merge_exercise(p_source_id, p_target_id, p_expected_source_revision, p_operation_key)` | Merge global exercise identities | PO only | Active source; target resolves to active terminal; aliases flatten; no content or plan reference rewrites; one audit event. |
| `catalog_resolve_exercise_selection` | Resolve a requested exercise identity for new selection | PO or current coaching staff | Returns the active terminal identity for merged aliases, otherwise the active identity or null. |
| `catalog_resolve_exercise_video` | Resolve current selected-workspace mapping | PO for an explicit workspace; WO/Trainer with current `coaching_work` in that workspace | HTTPS YouTube/Google Drive URL only; returns only the selected workspace mapping, resolved dynamically. |
| `catalog_write_workspace_exercise` | Create/version workspace-only exercise | PO for explicit authorized workspace; WO/Trainer in own workspace | Workspace-bound identity/version; no cross-workspace read. |
| _Follow-on: workspace exercise lifecycle_ | Workspace exercise lifecycle | PO for explicit authorized workspace; WO/Trainer in own workspace | `catalog_remove_workspace_exercise` / `catalog_restore_workspace_exercise` are not implemented in this tree. |
| `catalog_write_variation` | Create or version a mapping | PO for any explicit workspace; WO/Trainer with `coaching_work` in the explicitly selected workspace | Append a mapping version for the shared global exercise ID; HTTPS YouTube/Drive only. |
| `catalog_transition_variation` | Remove/restore a workspace mapping | PO for any explicit workspace; WO/Trainer with current `coaching_work` in that workspace | Append a lifecycle marker for the same mapping; video resolution hides removed mappings and resumes on restore. |
| `catalog_create_food` | Create global food v1 | PO, or WO/Trainer with current `coaching_work` in one explicitly selected workspace | Immediate global availability; persist immutable `created_by` and `origin_workspace_id` provenance; PO may create without workspace context; required nutrition/servings; kcal discrepancy is warn-only; enforce dedup and D16-10. Accepts optional `p_alternatives` (0–3 defaults) and writes them atomically with version 1. |
| `catalog_version_food` | Append food version | PO or creator | New immutable version; expected-version CAS; duplicate checks against changed names. Accepts optional `p_alternatives` (0–3 defaults) for this version; prior version defaults remain immutable. |
| `catalog_transition_food` | Global food Remove/Restore | PO only | Append non-destructive Remove or Restore marker; preserve identity, versions, plans and snapshots. Restore re-reserves the exact keys atomically and conflicts if another active food owns one. |
| `catalog_merge_food(p_source_id, p_target_id, p_expected_source_revision, p_operation_key)` | Supersede duplicate identity | PO only | Active survivor only; deterministic pair locking; no chains/cycles. |
| `catalog_can_version_food(p_food_id)` | Food version authorization preflight | PO or current food creator | Returns whether the current actor may append a version; the write RPC repeats authorization. |
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

## F16 redesign override and client-view contracts (design only)

The canonical exercise identity stays global and shared. Each workspace's override is an isolated, versioned overlay whose writable field allowlist is name, description, instructions, video and alternatives. The UI shows global entries together with the selected workspace's override state. Trainer-created exercises remain separate workspace-private identities. PO actions made in a personal workspace affect only that workspace override; canonical edits are separately scoped and remain PO-DECISION-NEEDED F16-MCQ-5.

Two mutation contracts are required after PO-MCQ resolution:

| Operation | Contract | Observable result |
| --- | --- | --- |
| Override write/create/update | Explicit workspace + canonical exercise ID + allowlisted fields + a CAS precondition. A create asserts `expected current override revision: absent`; an update asserts the expected current revision. WO/Trainer require current `coaching_work` in that workspace; PO workspace-scoped edit writes only that workspace. Follow existing authorize → deterministic lock → idempotency lookup/claim → recheck → CAS → append immutable version and one audit event transaction. | A create conflicts if a competing first write has already established the override, except an exact idempotent replay returns its original result. An update with a stale expected revision conflicts. Reusing a key with a different action/hash conflicts. Disallowed fields are rejected before any write. The transport representation of `absent` is implementation-time detail. |
| Override remove/clear | Explicit workspace + canonical exercise ID + expected current revision + action-bound UUIDv4 operation key; same role/scope, CAS, idempotency and audit conventions. | The externally visible video after removal is unresolved by F16-MCQ-6; do not encode a fallback/no-video behavior until PO decides. |

Exact RPC names, SQL argument types and transport schema are implementation-time design and are deliberately not frozen here. Neither RPC may expose another workspace's row or distinguish a foreign ID from a missing/unauthorized ID. RLS and application authorization independently enforce the same workspace boundary.

### Client/plan-workspace video read

This is a separate client-plan projection path from staff catalog search. The client request supplies the plan and, where required by Plan Core, published version identity; it does not supply a workspace as authority. The Plan Core/P4 client boundary verifies that the authenticated client owns the client record, the plan belongs to that client in the same workspace, and the requested published plan/version is viewable. The projection derives workspace from the persisted plan/client relation and resolves only exercises referenced by that published plan. For global exercises, the scoped projection may read the matching workspace override and global fallback internally; this authorization is separate from staff `coaching_work` and does not grant direct client access to override rows, catalog tables, or staff search/RPCs. Whether a workspace-private Trainer exercise in a valid published plan resolves its workspace video through this projection or has no video in the client view remains PO-DECISION-NEEDED F16-MCQ-9; this uncertainty does not deny otherwise-authorized plan access. Every missing/foreign/unauthorized plan, client, version or exercise returns one generic denial with no partial rows, media, counts or existence distinction. For ordinary global-exercise resolution when no override has been removed, precedence is workspace video override then global video; the authorized projection includes the source. If both configured values are absent, return explicit absence (`video: null`, source `none`) without inventing a URL. A later workspace video update is returned on the next view without republishing the global template. The video result and source after override removal remain unresolved by F16-MCQ-6; MCQ-3 historical non-video values also remain unresolved.

Read calls are not audit events. Client plan reads consume F17/F18 immutable snapshots and do not call catalog reads. Every non-PO RPC/view/search/detail/history/error/export projection nulls or omits both `created_by` and `origin_workspace_id`; name the negative and positive tests `global_food_provenance_masking_non_po` and `global_food_provenance_po_governance_read` respectively. Workspace read authorization and foreign-workspace non-disclosure are checked independently for search, detail/history, variation, video resolution and planner/export joins.

Exercise search filters use the stored payload keys `primary_muscle_code` (one code) and `equipment_codes` (an array of codes). The session server wall forwards those names and shapes unchanged to the RPC; equipment matches when any requested code is present.

`catalog_food_duplicate_candidates(name, language, basis, product_identity, preparation_identity, weighing_state, kcal)` returns privacy-safe exact and near candidates to PO or current coaching staff. The full exact identity key is `(language, normalized name, basis, normalized product identity, normalized preparation identity, weighing state)` for every localized version name; version duplicate checks use this same tuple. Near-match candidates are scoped to same basis, normalized name similarity >=90%, kcal tolerance `max(10%, 10 kcal)`, and matching normalized product identity, normalized preparation identity and weighing state. Product/preparation identities and advisory-lock keys share NFC, case-folding, Arabic folding, and whitespace-collapse normalization; equivalent spellings cannot claim distinct exact keys. Callers must require explicit confirmation before accepting a near match. Synonyms are never inferred. Internal `reserve_catalog_food_keys(food_id, version)` serializes name-key claims and uses a unique active reservation for each exact identity; Remove/Merge release keys and Restore reserves the current version atomically.

Food create/version requests may provide `p_alternatives: [{alternative_food_id, alternative_version, source_portion, alternative_portion}]`. Each requested portion must exactly match an existing serving equivalent for that food version and basis. The alternative must identify the active current version of another food with the same `g`/`ml` basis. At most three distinct alternatives are allowed; excess count or out-of-range integer versions return `catalog_food_alternatives_invalid` (`22023`) before insertion/casting. Authorization runs before alternative lookup. Targets are validated active and current only when the source version is written; the list is frozen with that immutable version. Later target Remove/version/Merge does not change stored defaults. At use time, F17/F18 planners and UI follow merge aliases to the terminal survivor's current version; removed targets are skipped with a visible “alternative unavailable” state, never silently substituted. Alternative validation and insertion run in the same RPC transaction as the new food version, audit event, key reservation and idempotency result. An exact operation-key replay returns the same response and stored defaults; changed alternatives with the same key conflict.

### Food addition limits (D16-10)

`catalog_create_food` serializes quota checks with a global transaction advisory lock and records each created identity in private `catalog_addition_limits` state. A creator may add at most 10 identities in any rolling 24-hour window; all authorized creators together may add at most 100. At most 10,000 identities may be active. Exact operation-key replay returns before quota evaluation and consumes no additional allowance. Remove and Merge deactivate the usage row and reduce the active-food count but do not refund the rolling add quota; Restore reactivates it only when the active-food ceiling permits. Limit errors are `catalog_food_creator_limit`, `catalog_food_platform_limit`, and `catalog_food_active_limit`; all writes and usage-state changes roll back together.

## Audit action contract

Use the established two-segment format, e.g. `catalog.food_created`, `catalog.food_versioned`, `catalog.food_merged`, `catalog.exercise_versioned`, `catalog.taxonomy_versioned`. A successful write emits one event in the same transaction. Global `workspace_id` is NULL; workspace-specific changes carry that workspace ID. The audit writer accepts only catalog action/table pairs and the `identity_id`, `version`, `related_id`, and `changed_fields` detail keys; changed-field values are codes from the writer's fixed allowlist. It rejects names, nutrition values, notes, URLs, origin data, raw operation keys, and free text.
