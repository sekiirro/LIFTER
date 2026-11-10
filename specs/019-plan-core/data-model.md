# Data Model: F19 Shared Plan Core

**Status:** Forward-only design for implementation planning. This spec reserves no migration version. Choose a unique version at implementation time after scanning all refs for `supabase/migrations/`.

## Ownership and invariants

- F19 owns plan identity/draft/revision, delivery, initial activation, and the minimal append-only productivity-unit record. F17 owns workout document fields; F18 owns nutrition document fields; F16 owns catalog identities/versions and Video resolution; F12/F13 own subscription and renewal truth; P7 consumes productivity units.
- Tenant rows include `workspace_id`; client plan roots also include `client_id`. Tenant relations use composite keys and `ON DELETE RESTRICT`. No cascade may remove plans, published revisions, delivery, activation, productivity, authorship, or audit history.
- All writes are authenticated, scoped, idempotent, audited, concurrency-safe, and transactionally committed. No application-role direct write path is introduced by this design.
- The tables described here are a design only. The implementation lane must inventory existing schema, RPCs, triggers, grants, and all migration versions across refs before choosing a forward migration.

## Relationship map

```text
workspace -> client -> plan root -> private draft
                              |-> immutable published revisions
                              |-> plan_deliveries (subscription-bound at delivery)
subscription -> subscription_activations -> productivity_units (initial activation only)
                                      \-> source operation id
```

## Plan roots, drafts, and revisions

### `plan_roots`

Stable identity fields: `id` (Plan ID), `workspace_id`, `client_id`, `plan_kind` (`workout` or `nutrition`), creator/audit references, and creation time. Unique `(workspace_id,id)` and composite client FK prevent cross-workspace ownership. A plan root has no subscription field: subscription association is established by a committed delivery row. A root is never created by autosave, Save as Draft, publish, delivery retry, or revision append.

### `plan_drafts`

One mutable row per plan root, privately readable/writable only by authorized staff. It holds a monotonically increasing `draft_version`, domain `content`, actor/update audit metadata, and no client-visible grants or projection path. Draft mutation requires the expected current draft version. A stale expected version returns `stale_version` and writes nothing. Exact operation replay returns the committed receipt only after current authorization has been rechecked.

### `plan_revisions`

Append-only immutable rows keyed by `(workspace_id, plan_id, revision_id)` and unique `(workspace_id, plan_id, revision_number)`. Each row records author identity, source draft version, domain content, and immutable publication time. A publish transaction compares expected draft and latest published version, appends exactly one revision, and never updates or deletes a prior revision. Author references are RESTRICT/no-cascade. Publication and delivery are atomic when a current subscription exists.

## Catalog and domain snapshot references

- Workout plan versions use the F16 `ExerciseSnapshotV2` shape and reference the corresponding stable exercise identity/version contract. Freeze the non-video planner-entry values captured for the revision: name, description, Notes, alternatives, Rest Time, RIR, and Reps, including trainer overrides. Do not use the obsolete `CatalogSnapshotRef` V1 contract.
- Exercise Video is not frozen/copied as a planner-entry value. F16’s authorized live resolver supplies the current workspace override or global fallback for the referenced exercise identity, subject to client/workspace plan authorization.
- Nutrition plan versions reference immutable F16 food versions and freeze the food/version and quantities/content used by F18. F18 owns the exact nutrition document schema; F19 does not redefine nutrition calculations.
- Template copies read an immutable template version. Existing-plan copies read the source plan’s latest published revision. Both create independent destination content and do not copy authorship, ownership, audit, client/subscription linkage, delivery, activation, or Video.

## `plan_deliveries` — the single delivery table

There is exactly one delivery table; do not add a separate first-delivery table or a first-delivery projection requirement. A row represents a successful Ready & Publish of a published revision for a client with a current subscription. Proposed immutable fields:

| Field                                     | Contract                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`, `workspace_id`                      | Stable delivery identity and tenant.                                                                                 |
| `subscription_id`, `client_id`, `plan_id` | Subscription/client/root correspondence enforced by composite FKs; subscription is bound here, not on the plan root. |
| `plan_kind`, `revision_id`                | Kind and immutable published revision delivered; kind and revision must match the plan root.                         |
| `delivery_event_id`                       | Source operation ID for the Ready & Publish delivery, bound to the canonical idempotency receipt.                    |
| `delivered_at`, `delivered_by`            | Immutable database time and signed actor.                                                                            |

Unique `(workspace_id, subscription_id, plan_id)` prevents duplicate delivery of one plan to one subscription; operation uniqueness prevents duplicate delivery through retries. A plan can have distinct delivery rows for a later subscription. First workout/nutrition delivery for a subscription is derived from committed rows by kind; no fabricated or special milestone rows are written. A committed first delivery remains even if the other kind is absent.

The client projection selects every delivered plan associated with that client and returns its latest published revision. It does not filter by a “first” marker. Undelivered roots and drafts are omitted. A later revision of a delivered root is visible without another delivery row; it does not change activation.

## `subscription_activations` forward extension

The installed table at `20261101120000_registration_approval_model.sql:165-174` has immutable identity, tenant/subscription, `activated_at`, non-null `delivery_event_id`, and unique `(workspace_id, subscription_id)`. Keep historical rows and the legacy source-ID meaning. Add `activation_source` with exactly `plan_deliveries`, `po_override`, or `renewal`, plus nullable typed workout/nutrition delivery links.

Typed-link design:

- `plan_deliveries` exposes composite unique keys for `(workspace_id, subscription_id, plan_kind, id)` and `(workspace_id, subscription_id, client_id, plan_kind, id)`.
- A workout typed link has a fixed `workout` kind checked by a CHECK constraint and a composite FK to `plan_deliveries`; the nutrition link similarly has fixed `nutrition` kind. Both links must match activation workspace, subscription, and the subscription’s client. No typed link points to any table other than `plan_deliveries`.
- CHECK constraints require both typed links when `activation_source='plan_deliveries'`, and require neither for `po_override` or `renewal`. `plan_deliveries` source is valid only for an initial subscription with one workout and one nutrition delivery. `po_override` is valid only for an eligible initial subscription. `renewal` is valid only for a renewal subscription.
- `delivery_event_id` always denotes the source operation ID, not a fabricated delivery-row ID. For `plan_deliveries`, it identifies the delivery operation that completed the pair; for `po_override`, the override operation; for renewal, the renewal operation, as already written by `record_renewal`.
- Existing activation rows must be classified only from durable evidence. A row with a matching renewal operation may be tagged `renewal`; any row without enough evidence blocks the migration pending architecture review. Do not fabricate links, invent source values, rewrite an old source ID, or backfill synthetic deliveries.

### Activation transaction paths

**Automatic initial activation:** Delivery writer takes the shared target locks, checks operation-key replay, appends the revision/delivery as applicable, and checks the durable delivery set for one workout plus one nutrition row for this subscription/client. If both exist and no activation exists, the same transaction writes one activation (`plan_deliveries`), both typed FKs, and the productivity unit. If any write fails, the entire second-delivery transaction rolls back; there is no committed delivery plus outbox fallback. The earlier independent delivery remains durable. Concurrent attempts serialize on the subscription and the unique activation key is a final guard.

When no trainer is assigned at automatic activation, credit the Trainer who published the completing delivery. If that actor is not a Trainer, refuse the completing Ready & Publish so no delivery, activation, or unit is written.

**Platform Owner override:** Under the same subscription serialization, independently authorize Platform Owner and current workspace scope; reject cancelled/refunded subscription or deactivated client with existing generic `not_permitted`. The transaction resolves current trainer assignment or requires an active same-workspace trainer selection when none exists. It writes one `po_override` activation with no typed delivery FKs, records the chosen recipient only on the productivity-unit row, and creates no assignment or delivery row. Activation and unit commit together. A later plan delivery observes the unique activation and cannot add a unit.

**Renewal:** Preserve F13 `record_renewal` activation at recording. It writes `activation_source='renewal'`, no typed plan-delivery links, and `delivery_event_id` equal to the renewal operation ID. It writes no productivity unit. F19 introduces no renewal activation RPC.

## Minimal append-only `productivity_units`

F19 owns one immutable unit row for each activation that awards a unit. Fields are limited to `id`, `workspace_id`, `subscription_id`, `activation_id`, recipient trainer identity, fixed `unit_count=1`, and immutable recorded time. Unique `(workspace_id, activation_id)` and subscription correspondence prevent duplicates. Restrict/no-cascade references preserve history. No unit row is created for a renewal activation. The unit does not create payroll, settlement, assignment, or balance effects; P7 is the consumer and owns its separate KPI/payroll behavior.

## Idempotency, transaction, and lock ordering

- Reuse the F12 target order and replay rules: client → subscription → relevant plan root → any domain row needed for revision serialization → operation ledger. A write without a subscription (draft work or a publish not associated with a current subscription) uses client → plan root → operation ledger. Avoid any reverse-order lock acquisition. For operations needing multiple plans, acquire plan-root locks in stable sorted Plan ID order.
- After lock waits, re-read current actor, role/capability, workspace membership, client state, current subscription, current assignment, and expected draft/revision state in a new statement. Assignment mutation and activation recipient selection must share the client serialization point so the recipient means the trainer assigned at activation time; implementation must align the concrete lock with F11. Recheck authorization before disclosing replay receipts. Idempotency-key lookup follows target locks; exact same-key/same-canonical-request returns the original receipt, changed binding returns `key_conflict`.
- Delivery, activation, unit, operation receipt, and required audit record share one database transaction. A failed/unknown commit is safely retried using the same idempotency key. There is no outbox, background job, or retry worker for activation. No successful delivery is acknowledged until commit is confirmed; an unknown result is resolved by replay/read of the operation receipt.
- Compare-and-swap on draft version and published revision prevents delayed autosave or stale tabs from overwriting newer state. This is backend concurrency protection, not collaborative editing UX.

## Deletion and audit

Author references retain the deleted trainer non-login account ID under F11 deletion policy, without tombstone rewrite. PR #73 remains pending and is not a merged fact. Audit events record IDs, operation type, version/revision identifiers, source, and actor using the established allowlist, never plan content, nutrition details, Notes, credentials, or raw operation keys.

## Privacy and client access

Client self-read resolves the authenticated client identity server-side, verifies active authorization and subscription entitlement, then queries only delivery rows for that client. Expired/deactivated clients cannot read normal plan content. The client projection contains Plan ID, kind, latest revision number/time, and published content required by F17/F18; it excludes drafts, author/actor IDs, delivery IDs, source operation IDs, internal versions, idempotency receipts, activation internals, and unit details.

## Persistence verification obligations

Implementation tasks require real-DB integration coverage for save/publish CAS, concurrent operations, ambiguous commit replay, workspace/client/subscription/revision binding, retry/rollback, both delivery orders, exactly-once automatic activation, override with 0/1/2 delivered kinds, Q9 refusal, recipient selection without assignment, renewal with no unit, unlimited delivered-plan projection, draft privacy, expired access, and RESTRICT/no-cascade behavior. Static, mocked, or in-memory tests do not count as persistence or concurrency evidence.
