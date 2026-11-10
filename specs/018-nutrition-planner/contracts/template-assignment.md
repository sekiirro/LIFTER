# Contract — Nutrition Template Assignment

**Owner**: F18 (nutrition collection only). **Status**: Spec-only.
**Shared shape**: F17 implements the same PO-only manual Assign model for workout templates (A2). The shape is shared; the **tables and types are separate**. No row, id or status is shared between the two collections, and a workspace's initialization is computed independently per collection.

## 1. Template lifecycle

| Action | Actor | Rules |
| --- | --- | --- |
| Create global template | PO | Creates a new platform-scope identity + version 1. Not distributed to any workspace. |
| Version global template | PO | Appends an immutable version. No workspace copy changes. |
| Retire global template | PO | Non-destructive marker. Retired templates are not offered by Assign and cannot be loaded for new plans; existing copies and plans are unchanged. |
| Create workspace template | PO / WO / Trainer with `coaching_work` | New tenant-scope identity + version 1, workspace-branded name. |
| Version workspace template | Same | Appends an immutable workspace version; no plan changes. |
| Retire workspace template | Same | Non-destructive; not loadable for new plans; history visible. |
| Load template version | Plan editor with access to the target draft | Copies one explicit immutable version into the private draft; new ids; no live link. |
| Make it Global | PO | Separate global identity/version from an eligible workspace template version; workspace original unchanged. |

No automatic distribution occurs at workspace creation or when a global template is created/versioned. There is no global-template read path for workspaces.

## 2. Assign operation

`assign_nutrition_templates(templateMode, templateIds, excludeIds, workspaceMode, workspaceIds, operation_key)` — PO only, one transaction.

### Step 1 — template set

| Mode | Set |
| --- | --- |
| `all` | Every **active** global nutrition template at operation time. |
| `specific` | Exactly `templateIds` (must exist, be active, be distinct). |
| `all_except` | Every active global template except `excludeIds`. |

Empty set after resolution ⇒ `invalid_selection`, no batch. Retired templates in `specific`/`excludeIds` are rejected, never silently dropped.

### Step 2 — workspace set

| Mode | Set |
| --- | --- |
| `all` | Every **existing** workspace that is **uninitialized for nutrition** at operation time (no `outcome='assigned'` nutrition assignment item ever). Workspaces created later are excluded; a rerun excludes already-initialized workspaces. |
| `specific` | Exactly `workspaceIds` (must exist; distinct). May include initialized/partially assigned workspaces. |

### Per (workspace, template) outcome

1. If the workspace already holds a copy of **the same source version** of that global template ⇒ `skipped_existing`. Nothing is created and no customization is touched.
2. If the workspace already holds a copy from a **different (older or newer) source version**, the outcome is **undecided** (`F18-MCQ-6`). The contract, fixtures and implementation MUST NOT assert a behaviour for this row. Option A (skip), option B (second separate copy) and option C (explicit version update) are all compatible with "no overwrite"; the PO must choose.
3. Otherwise ⇒ create one new workspace template from the template's **current immutable version**, with `origin_global_template_id`/`origin_global_template_version` recorded, a workspace-branded `display_name`, and one version row; outcome `assigned` with the created id.
4. Ineligible target (for example a workspace retired or inaccessible during the operation) ⇒ `skipped_ineligible`; no copy.

### Invariants

- `All Workspaces` never tops up a partial workspace: a workspace with any prior nutrition assignment is skipped entirely, even if it is missing other templates.
- `All Workspaces` affects only workspaces existing at the operation time.
- `Specific Workspaces` fills only missing selected templates and never overwrites customization; the different-source-version row is F18-MCQ-6.
- A workspace that created its own templates but never received a nutrition assignment remains uninitialized.
- A second copy of the **same** global template source version in one workspace is prevented by `UNIQUE (workspace_id, origin_global_template_id, origin_global_template_version)`. Whether one workspace may hold copies of **different** versions of the same global template is F18-MCQ-6; if option A is chosen, the implementation adds the stricter `UNIQUE (workspace_id, origin_global_template_id)`.
- If a template is retired between set resolution and copy creation, the batch re-reads status under lock and records `skipped_ineligible`; it is never copied. If a concurrent batch already created the same copy, the later transaction re-reads and records `skipped_existing` instead of failing.
- If the workspace set resolves to zero workspaces, the batch commits with zero items and zero counts (a no-op, audited); this is not an error.
- A batch either fully commits or writes nothing.
- Replaying the same operation key returns the same batch id and items; a changed payload with the same key is `key_conflict`.
- The batch and its items are immutable; there is no "undo" surface. Removing a copy is a normal workspace template retire.

### Open product question — F18-MCQ-6

When a global template has a **newer version** than an existing workspace copy came from, this contract currently records the row as undecided: option A (skip; the PO uses the existing edit right to create a new workspace version), option B (assign a second, separate copy) and option C (explicit "update copy" only when the workspace copy has no local edits since assignment) are all open. Until `F18-MCQ-6` is answered, the newer-version row is a contract gap: the assignment fixtures must not assert it and no implementation may choose silently.

## 3. Make it Global

`make_nutrition_template_global(workspace_template_id, expected_version, operation_key)` — PO only.

1. Authorize PO; lock the workspace template identity; idempotency; re-read the expected version.
2. Validate the selected immutable workspace version for eligible content: no client names/ids, client-specific values, workspace-private references, internal ids or other workspace metadata in any field (names, notes, meal/food labels, recipe URLs that embed client data).
3. If any is present ⇒ refuse with the offending **field codes** (no values, no free text); copy nothing. The PO must remove them in a new workspace version first (D18-1 wording "after private data and references are removed").
4. On success ⇒ create a **new global identity + version** as a separate copy; record the provenance for PO governance only; never modify the workspace original. Each successful call creates its own global identity (retries are collapsed by the operation key); the PO manages or retires any duplicate global identity.
5. One audit event with ids and field codes only.

Eligibility: only an **active** workspace template version can be promoted. A retired workspace template (or retired version) is refused with the generic `not_permitted` shape; a retired global identity is never resurrected.

## 4. Error shapes

| Outcome | Shape |
| --- | --- |
| Not PO | generic `not_permitted` |
| Invalid/empty template or workspace set | `invalid_selection` |
| Same key, different payload | `key_conflict` |
| Stale expected version (make global, version) | `stale_version` |
| Private data present | `private_content_present` with field codes |
| Copy creation failure | whole batch rolled back; generic failure |

## 5. Tests (minimum)

1. All × All: uninitialized workspaces receive exactly one copy each; initialized (complete and partial) are skipped; a later-created workspace receives nothing on rerun.
2. Specific × Specific: fills only missing templates; a same-version existing copy is `skipped_existing`; customization bytes are unchanged; the different-version row is not asserted (F18-MCQ-6).
3. All Except: excluded templates are absent; the rest are assigned.
4. Retired template rejected from `specific`/`excludeIds`; not offered by All.
5. Retry with the same key ⇒ identical batch; different payload ⇒ `key_conflict`.
6. Concurrent Assign operations serialize; no duplicate copy for one (workspace, template).
7. Workspace isolation: workspace B cannot list/load/count/infer A's copies; non-PO cannot read the global library.
8. Make it Global: eligible version ⇒ separate global identity; ineligible ⇒ refused with codes and no row; original unchanged.
9. Nutrition vs workout independence: a workspace initialized for workouts is still uninitialized for nutrition, and vice versa.
10. Foreign-workspace negative on every template read/write/load path.
11. Retire between resolution and copy ⇒ `skipped_ineligible`, no copy; concurrent batch on the same target ⇒ one `assigned`, one `skipped_existing`, no error.
12. Zero target workspaces ⇒ committed no-op batch with zero counts.
