# Contract — Nutrition Template Assignment

**Owner**: F18 (nutrition collection only). **Status**: Spec-only.
**Shared shape**: F17 implements the same PO-only manual Assign model for workout templates (A2). The shape is shared; the **tables and types are separate**. No row, id or status is shared between the two collections, and a workspace's initialization is computed independently per collection.

## 1. Template lifecycle

| Action                     | Actor                                       | Rules                                                                                                                                            |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create global template     | PO                                          | Creates a new platform-scope identity + version 1. Not distributed to any workspace.                                                             |
| Version global template    | PO                                          | Appends an immutable version. No workspace copy changes.                                                                                         |
| Retire global template     | PO                                          | Non-destructive marker. Retired templates are not offered by Assign and cannot be loaded for new plans; existing copies and plans are unchanged. |
| Create workspace template  | PO / WO / Trainer with `coaching_work`      | New tenant-scope identity + version 1, workspace-branded name.                                                                                   |
| Version workspace template | Same                                        | Appends an immutable workspace version; no plan changes.                                                                                         |
| Retire workspace template  | Same                                        | Non-destructive; not loadable for new plans; history visible.                                                                                    |
| Load template version      | Plan editor with access to the target draft | Copies one explicit immutable version into the private draft; new ids; no live link.                                                             |
| Make it Global             | PO                                          | Separate global identity/version from an eligible workspace template version; workspace original unchanged.                                      |

No automatic distribution occurs at workspace creation or when a global template is created/versioned. There is no global-template read path for workspaces.

## 2. Assign operation

`assign_nutrition_templates(templateMode, templateIds, excludeIds, workspaceMode, workspaceIds, operation_key)` — PO only, one transaction.

### Step 1 — template set

| Mode         | Set                                                           |
| ------------ | ------------------------------------------------------------- |
| `all`        | Every **active** global nutrition template at operation time. |
| `specific`   | Exactly `templateIds` (must exist, be active, be distinct).   |
| `all_except` | Every active global template except `excludeIds`.             |

Empty set after resolution ⇒ `invalid_selection`, no batch. Retired templates in `specific`/`excludeIds` are rejected, never silently dropped. Any resolved Assign that would create zero copies is rejected before batch/state writes (S42-PO-8; architect mapping (S42 matrix): SH-3).

### Step 2 — workspace set

| Mode       | Set                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all`      | Every **existing** workspace that is **uninitialized for nutrition** at operation time (no `outcome='assigned'` nutrition assignment item ever). Workspaces created after the operation are excluded from it, and already-initialized workspaces are skipped. An exact-key replay returns the original batch and never adds later-created workspaces; a later operation under a **new** key includes any workspace that is still uninitialized then. |
| `specific` | Exactly `workspaceIds` (must exist; distinct). May include initialized/partially assigned workspaces.                                                                                                                                                                                                                                                                                                                                                |

### Per (workspace, template) outcome

1. If the workspace already holds any copy of the targeted global template identity, regardless of the source version ⇒ `skipped_existing`; no duplicate, overwrite, update, or customization change occurs, and the batch reports the skipped workspace/template pair. (S43-PO-1; architect mapping (S43-R1).)
2. Otherwise ⇒ create one new workspace template from the template's **current immutable version**, with `origin_global_template_id`/`origin_global_template_version` recorded, a workspace-branded `display_name`, and one version row; outcome `assigned` with the created id.
3. Ineligible target (for example a workspace retired or inaccessible during the operation) ⇒ `skipped_ineligible`; no copy.

### Invariants

- `All Workspaces` never tops up a partial workspace: a workspace with any prior nutrition assignment is skipped entirely, even if it is missing other templates.
- `All Workspaces` affects only workspaces existing at the operation time.
- `Specific Workspaces` fills only missing selected templates and never overwrites customization; any retained copy, including a retired copy, is skipped and reported per S43-PO-1 when the batch still creates at least one copy; an operation left with zero copies takes the zero-copy rejection below.
- A workspace that created its own templates but never received a nutrition assignment remains uninitialized.
- A workspace may hold at most one copy of a global template identity: `UNIQUE (workspace_id, origin_global_template_id)`.
- If a template is retired between set resolution and copy creation, the batch re-reads status under lock and records `skipped_ineligible`; it is never copied. If a concurrent batch already created the same copy, the later transaction re-reads and records `skipped_existing` instead of failing **only while the batch still creates at least one copy**. If re-reading leaves zero copies to create, the zero-copy rejection applies: the new operation writes no batch, item or copy (test 12).
- After current authorization, check the operation key and canonical request hash before resolving live targets or applying the new-operation zero-copy check. A matching replay returns the original batch id and items even when current resolution would now produce zero copies; a changed payload with the same key is `key_conflict`.
- For a new operation key, if the workspace set is empty or all selected template/workspace pairs would be skipped/ineligible so no copies would be made, reject the Assign before batch/state writes (S42-PO-8; architect mapping (S42 matrix): SH-3). This includes a concurrent batch that leaves zero copies to create after re-reading.
- A batch either fully commits or writes nothing.
- The batch and its items are immutable; there is no "undo" surface. Removing a copy is a normal workspace template retire.

### Decided re-assignment behavior

Any existing copy of a targeted global template identity is skipped regardless of source version. No second copy, overwrite, or update occurs. Each skipped workspace/template pair in a committed batch is reported; a new operation left with zero copies is rejected before writes instead of producing a report-only batch.

## 5. Tests (minimum)

1. All × All: each uninitialized workspace receives exactly one copy of **each selected** active global template (N selected templates ⇒ N copies), one per template identity; initialized (complete and partial) workspaces are skipped. A workspace created after the batch receives nothing automatically or on an exact-key replay, but is included in a later new-key operation if still uninitialized.
2. Specific × Specific: fills only missing templates; any retained existing copy, active or retired and regardless of source version, is `skipped_existing`; customization bytes are unchanged and the skipped pair is reported.
3. All Except: excluded templates are absent; the rest are assigned.
4. Retired template rejected from `specific`/`excludeIds`; not offered by All.
5. Retry with the same key ⇒ identical batch; different payload ⇒ `key_conflict`.
6. Concurrent Assign operations serialize; no duplicate copy for one (workspace, template), including when a retained copy is retired. A later batch records `skipped_existing` only while it still creates at least one copy; a loser left with zero copies follows test 12.
7. Workspace isolation: workspace B cannot list/load/count/infer A's copies; non-PO cannot read the global library.
8. Make it Global: eligible version ⇒ separate global identity; ineligible ⇒ refused with codes and no row; original unchanged.
9. Nutrition vs workout independence: a workspace initialized for workouts is still uninitialized for nutrition, and vice versa.
10. Foreign-workspace negative on every template read/write/load path.
11. Retire between resolution and copy ⇒ `skipped_ineligible`, no copy. Concurrent batches on the same target: when the later batch still creates at least one copy for another target, the taken pair is `skipped_existing` and the batch succeeds with no error; a single-pair race where the other transaction already created the only copy leaves zero copies to create, so the loser is rejected as in test 12 and writes no batch.
12. A new zero-workspace or zero-copy Assign is rejected before writes, including a single-pair concurrent race that leaves zero copies to create; replaying a previously committed request with the same key and hash returns its original batch before live zero-copy validation.
