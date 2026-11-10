# Contract — Workout template assignment

**Status**: spec-only draft (S42). No implementation, no SQL, no migration version.

## 1. Actors

- **PO only**: create/edit/retire a Global Workout Template; run `Global Templates → Assign`; promote a workspace template to global.
- **Workspace owner / Trainer with current `coaching_work`**: create, edit, version, retire and load templates in their own workspace, including assigned copies.
- Everyone else (Sales, client, foreign workspace, unaffiliated, revoked membership): denied generically.

## 2. Template identity and versions

- One stable identity per template; append-only immutable versions; `retire` is a non-destructive state change that only removes the template from new selection/assignment.
- A workspace copy is a **new workspace-owned identity** with its own versions. A workspace holds at most one copy per global template identity, regardless of source version. Provenance to `(global_template_id, global_template_version, assignment_run_id)` is retained for PO governance and is not a content link.
- A global template contains no client data. Promoted workspace-private exercise references may be retained; unresolved references are RED and block loading until fixed.

## 3. Assignment operation

Request (logical): `operation_key`, template selection (`all` | `specific(ids)` | `all_except(ids)`), workspace target (`all_workspaces` | `specific(ids)`).

Semantics:

0. Read the selected templates' current immutable versions once at run start and record them; a version created concurrently does not join the run. A retired template is not selectable.
1. Resolve the selected template set and the target workspace set at request time.
2. For `all_workspaces`: retain the full request-time workspace set, then divide it into assignment targets (`ever_received_global_assignment = false`) and skipped workspaces (`ever_received_global_assignment = true`). A workspace with only self-created templates remains an assignment target (literal PO A2).
3. For `specific_workspaces`: include the named workspaces regardless of prior assignment.
4. For each target workspace, for each selected template version: create a copy only if that workspace does not already hold any copy of that template identity; otherwise skip and report the workspace/template pair. Never update, reset, delete or overwrite an existing copy or version.
5. Record one item per requested workspace with its outcome and the created copy ids. Each workspace excluded from All Workspaces because its flag is true receives `skipped_already_assigned`. If an assignment target receives no copies in a batch that creates at least one copy overall, its committed receipt outcome is `no_copies`; the batch still commits. If the total batch would create zero copies, reject before any batch/state writes (S44-PO-2; architect mapping (S44-R2); S42-PO-8 zero-copy rule remains).
6. Set `ever_received_global_assignment = true` for workspaces that received at least one copy; a workspace with `no_copies` does not have this flag newly set.
7. Later global template creation or versioning distributes nothing. Later workspace creation receives nothing.

## 4. Idempotency and concurrency

- Exact replay of the same `operation_key` with identical arguments returns the original run and item outcomes after rechecking PO authorization; it creates no additional run, flag change or copy.
- Same key with different arguments → `key_conflict`.
- The eligibility read and the flag/copy writes for a workspace happen under one per-workspace lock so two concurrent runs cannot both distribute to the same never-assigned workspace.
- Crash before commit: no run, no flag, no copy. Unknown result after commit: replay returns the receipt.
- Copy uniqueness: `(run_id, workspace_id, global_template_id, global_template_version)` and one workspace copy per origin template identity.

## 5. State model

| State                 | Stored representation           | All Workspaces     | Specific Workspaces                     |
| --------------------- | ------------------------------- | ------------------ | --------------------------------------- |
| Never assigned        | flag false/no row               | included           | included                                |
| Intentionally partial | flag true + subset of copies    | skipped, no top-up | included, missing selected copies added |
| Own templates only    | flag false + zero origin copies | included           | included                                |

The implementation MUST be able to report which of the three applies; state (c) is derived, not a fourth flag. A resolved Assign that would create zero copies is rejected before any batch or state write.

## 6. Promotion (PO)

- Creates a new global identity + version 1 that copies the workspace template content; the source workspace template and versions remain unchanged.
- Client data is never copied.
- Promotion may retain workspace-private exercise references. Any unresolved exercise reference is flagged RED and blocks loading until fixed (S42-PO-8; architect mapping (S42 matrix)).

## 7. Operation results

| Result                     | Meaning                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `assigned`                 | at least one copy created                                                                                |
| `skipped_already_assigned` | All Workspaces skipped a workspace with the flag set                                                     |
| `no_copies`                | targeted workspace received none in a batch that committed because at least one copy was created overall |
| `denied`                   | caller not PO or workspace unavailable; generic to the caller                                            |
| `key_conflict`             | same operation key, different request                                                                    |
| `stale_version`            | template identity changed under a concurrent edit                                                        |

## 8. Test obligations (future)

Foreign-workspace and non-PO negatives; All/Specific/All-Except matrices over the Kendo/Alpha/Beta/Gamma fixture, including one targeted workspace returning `no_copies` while another is assigned and zero-total rejection; concurrent double-run; replay and key-conflict; copy independence after workspace edits; promotion separation; retirement effects; no live link read.
