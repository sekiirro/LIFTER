# Contract — Nutrition API, authorization and audit

**Owner**: F18. **Status**: Spec-only. Names are contract labels; enforcement uses the existing merged checks (`app_private.is_platform_owner()`, `app_private.has_workspace_access(workspace_id,'coaching_work')`, the F3 platform-wide PO rule). F18 introduces **no new capability**.

## 1. Operations

| Operation                                                                                                                    | Actor                                                                                    | Key binding                           | Writes                                                                                                                 | Audit action                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `save_nutrition_draft(expected_draft_version, content, operation_key)`                                                       | Plan editor (PO/WO/Trainer in plan workspace)                                            | `plan.nutrition_draft_save`           | F19 draft content only (nutrition-validated)                                                                           | `plan.nutrition_draft_save`                  |
| `mark_nutrition_ready` / `unmark_nutrition_ready`                                                                            | Same                                                                                     | `plan.nutrition_ready`                | F19 readiness                                                                                                          | `plan.nutrition_ready`                       |
| `publish_nutrition_revision(expected_revision, operation_key)`                                                               | Same                                                                                     | `plan.nutrition_publish`              | F19 revision + F18 content + selection carry-forward; F19 delivery/activation/productivity in the same F19 transaction | `plan.nutrition_publish`                     |
| `select_nutrition_alternative(plan_version_id, item_id, alternative_id, operation_key)`                                      | Authenticated client, self only                                                          | `client.nutrition_select`             | F18 selection row (upsert or delete when `alternative_id` is null)                                                     | `client.nutrition_select`                    |
| `create_nutrition_workspace_template(...)`                                                                                   | PO/WO/Trainer with `coaching_work`                                                       | `template.nutrition_workspace_write`  | Workspace template identity + v1                                                                                       | `template.nutrition_workspace_write`         |
| `version_nutrition_workspace_template(expected_version, ...)`                                                                | Same                                                                                     | `template.nutrition_workspace_write`  | New immutable workspace version                                                                                        | `template.nutrition_workspace_write`         |
| `retire_nutrition_workspace_template(expected_version)`                                                                      | Same                                                                                     | `template.nutrition_workspace_retire` | Non-destructive status marker                                                                                          | `template.nutrition_workspace_retire`        |
| `create_nutrition_global_template(...)` / `version_nutrition_global_template(...)` / `retire_nutrition_global_template(...)` | PO only                                                                                  | `template.nutrition_global_write`     | Global identity/version/marker                                                                                         | `template.nutrition_global_write`            |
| `assign_nutrition_templates(templateMode, templateIds, excludeIds, workspaceMode, workspaceIds, operation_key)`              | PO only                                                                                  | `template.nutrition_assign`           | One batch + per-target items + workspace copies                                                                        | `template.nutrition_assign`                  |
| `make_nutrition_template_global(workspace_template_id, expected_version, operation_key)`                                     | PO only                                                                                  | `template.nutrition_make_global`      | New separate global identity/version                                                                                   | `template.nutrition_make_global`             |
| `load_nutrition_template_version(templateKind, templateId, version, operation_key)`                                          | Plan editor with access to the target draft; creation-time/empty draft only (F18-FR-009) | `plan.nutrition_template_load`        | Private draft copy (new ids)                                                                                           | `plan.nutrition_template_load`               |
| `read_nutrition_export(plan_id, revision_id)`                                                                                | PO/WO/Trainer in plan workspace                                                          | `plan.nutrition_export`               | None (read)                                                                                                            | `plan.nutrition_export` (success and denial) |
| `copy_nutrition_ai_prompt(plan_id, revision_id)`                                                                             | Same staff roles authorized to export                                                    | `plan.nutrition_prompt`               | None (read)                                                                                                            | `plan.nutrition_prompt` (success and denial) |

Notes:

- `publish_nutrition_revision` is the nutrition domain writer inside the F19 Ready & Publish path. It cannot publish without a current subscription because F19 refuses the enclosing operation first; F18 never introduces a publish path that bypasses delivery.
- `save_nutrition_draft` is the F19 draft write with the nutrition validator attached; F18 adds no draft table.
- All names are contract labels; the implementation may prefix/suffix them consistently, but the actor, key binding and audit action must not change.

## 2. Authorization

| Surface                                | PO            | WO/Trainer (`coaching_work`) | Sales  | Client                                                                                                                    | Other  |
| -------------------------------------- | ------------- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| Global template read/write             | yes           | **denied (no read)**         | denied | denied                                                                                                                    | denied |
| Assign                                 | yes           | denied                       | denied | denied                                                                                                                    | denied |
| Make it Global                         | yes           | denied                       | denied | denied                                                                                                                    | denied |
| Workspace template CRUD/version/retire | any workspace | own workspace                | denied | denied                                                                                                                    | denied |
| Plan draft/ready/publish               | any workspace | own workspace                | denied | denied                                                                                                                    | denied |
| Export / prompt                        | any workspace | own workspace                | denied | none in the F18 staff UI; prompt only if `resolved S42-PO-8: staff export authorization` = B (P4 owns any client surface) | denied |
| Client selection                       | no            | no                           | no     | self only, current subscription                                                                                           | no     |

Enforcement rules:

1. Authorize before any read; authorize again after every lock wait and before disclosing a replay result.
2. The application wall and RLS must implement the same predicate; a table/read denied at one wall is denied at both.
3. Cross-workspace, cross-client, unauthorized and missing resources share one generic failure shape with no existence, count or timing disclosure.
4. No role may call a global-template read except through a PO-authorized RPC. Workspaces receive content only as workspace copies.
5. `service_role` never bypasses the write RPCs; direct table DML is revoked.

## 3. Idempotency and concurrency

- Every mutating operation carries a client UUIDv4 `operation_key`, format-validated and bound to the action name; the canonical request hash binds all arguments.
- Same key + same hash ⇒ the original stored result is returned after the current authorization recheck. Same key + different hash ⇒ `key_conflict`, no write. Keys are retained 30 days.
- Plan-root operations: F19 order — client → subscription (publish) → plan root → draft/revision rows → selection rows → operation ledger. Re-read expected draft/revision, then re-authorize, then write, then one audit event.
- Selection: lock the plan root before the selection row; write only if `plan_version_id` is still the current published revision. A publish that commits first makes the stale selection fail with `stale_version` and write nothing; the client re-reads and retries with a new key.
- Publish reads and carries forward selections while holding the plan-root lock, so a selection and a publish cannot interleave into an inconsistent revision.
- Template batch: creation lock for the batch/PO operation → global template identities in sorted UUID order → workspace copies in sorted workspace-id order. Any failure rolls back the whole batch: there is no partial distribution.
- Template load: lock the target plan root; load is a copy, so it never conflicts with the source template version.

## 4. Selection RPC rules

`select_nutrition_alternative(plan_version_id, item_id, alternative_id, operation_key)`

1. Resolve the client from `auth.uid()`; require the plan belongs to that client, is in the client's workspace and has a current subscription (F19/F13 entitlement). No caller-supplied client or workspace is authority.
2. Require `plan_version_id` to be the current published, delivered revision of that plan.
3. Require `item_id` to exist in that immutable revision and `alternative_id` (when non-null) to be one of that item's approved alternatives.
4. Upsert one row `(workspace_id, plan_version_id, item_id)` or delete it when `alternative_id` is null; increment `selection_revision`; one audit event. Selecting the alternative that is already selected, or clearing when nothing is selected, is a successful **no-op**: no row write and no audit event (the operation key still records the result).
5. Return only the selection state and its revision; never return coach content or another client's data.
6. Failures are generic: `not_permitted`, `stale_version`, `invalid_selection`, `key_conflict`. Every failure writes nothing and leaks no existence.

## 5. Publish RPC rules

`publish_nutrition_revision(expected_revision, operation_key)`

- Preconditions: current subscription (F19); current authorization; expected draft/revision match; the document passes the frozen schema validator; all reachable `training_days_only` meals have a training day; every referenced food version exists.
- Effects, one transaction: validate → build snapshot map → recompute all values in SQL → append F19 revision → insert 1:1 content row → carry forward valid selections → one audit event. F19 appends the delivery row and activation/unit in the same transaction.
- Caller-supplied document values are accepted only for draft content; caller-supplied snapshots, computed values and totals are ignored.
- An identical idempotency key and canonical request returns its original committed receipt without another revision, delivery, or audit event. Any new authorized Ready & Publish operation, including one whose content is unchanged, appends a new immutable revision and a delivery row through F19 in the same transaction.
- A missing food version, an over-range value or a validator failure aborts the entire transaction with no revision.
- Post-publish revision content is immutable: `UPDATE`/`DELETE`/`TRUNCATE` rejected.

## 6. Export and prompt reader

`read_nutrition_export` returns a single authorized projection:

```text
plan: { id, workspaceId, clientId (staff only), title, dates }
revision: { id, revisionNumber, publishedAt }
content: { document, computedValues }
selection: { itemId, alternativeId, selectedValues }[]   // last valid selection for the requested revision
```

- Both walls checked before any row is read.
- `revision_id` MUST be a published revision of the stated plan. For any published revision, the selection projection is the client's last valid selection for that specific revision. A historical export MUST NOT substitute the current revision's selection. (S43-PO-8 source line 5; architect mapping (S43-R10)).
- PDF/Excel renderers consume the projection; neither re-reads tables.
- Render the selected value as primary with its recalculated totals; place the labelled coach original beside the affected item. With no selection, render the coach original only. Totals rows contain client-selection totals only; the copied prompt includes the per-item coach-original side note (S43-PO-2; architect mapping (S43-R4)).
- Excel cells containing coach text are written as text; formula prefixes are never evaluated.
- The AI prompt uses the same authorized projection and includes current selected alternatives and recalculated totals. The action label and success confirmation are S43-PO-1 approved; body EN/AR is byte-exact in copy-ai-prompt.md (S43-PO-5; architect mapping (S43-R6)). The copied prompt includes the per-item coach-original side note; totals rows use client-selection totals only (S43-PO-2; architect mapping (S43-R4)). Substitute {{PLAN_CONTENT}} only; all remaining bytes match the approved locale template.
- Every call, success or denial, writes one audit event with ids only.

## 7. Audit allowlist

Allowed: action, workspace id, actor id, plan id, revision id, template id, template version, item id, alternative id, assignment batch id, target workspace ids, outcome codes, counts, changed-field codes (`document`, `day_types`, `meals`, `items`, `alternatives`, `notes`, `recipe_url`, `targets`, `status`, `name`, `selection`).

Forbidden: food names, quantities, macros, notes, recipe text, URLs, document JSON, client display data, free text, raw operation keys, prompt text.

Every action in §1 appears in the allowlist; the log-scrub test asserts zero forbidden occurrences across a full action sweep.

## 8. Negative and concurrency test rows (minimum)

| Row                                                                         | Expected                                                        |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Foreign workspace read/write/export/prompt                                  | generic denial, no content, one denial audit for exports        |
| Foreign client selection / forged plan/version/client tuple                 | generic denial, no row                                          |
| Selection id not in the item's approved list                                | `invalid_selection`, no row                                     |
| Selection against an older revision                                         | `stale_version`, no row                                         |
| Selection while expired/deactivated                                         | denial, no row                                                  |
| Direct table DML by any role                                                | denied by privilege/RLS                                         |
| Publish with caller snapshots/totals                                        | ignored; database values win                                    |
| Publish with a missing food version                                         | whole transaction aborts                                        |
| Publish without a current subscription                                      | F19 refuses; no revision                                        |
| Identical key + same canonical publish request                              | original receipt returned; no duplicate revision/delivery/audit |
| New authorized publish key with unchanged content                           | new revision and delivery appended                              |
| Concurrent publish + selection                                              | one deterministic outcome; no mixed revision                    |
| 100 replay attempts per mutating action                                     | one result, no duplicate rows/audit                             |
| Assign retried (same key)                                                   | same batch, zero duplicate copies                               |
| All Workspaces with a partial workspace                                     | workspace skipped, no top-up                                    |
| Specific Workspaces with an existing copy                                   | `skipped_existing`, no overwrite                                |
| Make it Global with client data                                             | refused with field codes, no global row                         |
| Non-PO global template read                                                 | generic denial                                                  |
| Sales on every plan/template/export surface                                 | generic denial                                                  |
| UPDATE/DELETE/TRUNCATE on revisions, template versions, batches, selections | denied                                                          |
