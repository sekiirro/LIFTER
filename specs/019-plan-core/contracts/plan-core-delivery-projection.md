# F19 Client Delivery Projection Contract

**Status:** Spec-only projection contract. The reader/authorization boundary belongs to P4; this document defines only its authorized result shape and privacy rules.

## Projection result

| Field                           | Contract                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planId`                        | Stable identity of a plan with at least one committed delivery to this client.                                                                                                                                                                                                            |
| `kind`                          | `workout` or `nutrition`, matching the root and delivered revision.                                                                                                                                                                                                                       |
| `revisionNumber`, `publishedAt` | Latest immutable published revision for the delivered Plan ID. Every published revision has a delivery row; the projection returns each Plan ID once with its latest delivered revision.                                                                                                  |
| `content`                       | Published F17/F18 feature payload joined by plan/revision identity. Workout exercise entries use F16 `ExerciseSnapshotV2`; non-video planner-entry values remain frozen and Video is resolved live by F16’s authorized resolver. Nutrition entries reference immutable F16 food versions. |
| `delivery.status`               | `delivered` for every returned plan. There is no first-delivery marker requirement. Every plan with a committed `plan_deliveries` row is eligible for projection.                                                                                                                         |
| `activation.status`             | `pending` or `complete` for the associated subscription. Override may make it complete without delivery links. Renewal activation is recorded at renewal time and has no productivity unit. This status does not filter plan visibility.                                                  |

Only those client-safe fields and the domain content required to render a plan are returned. Exclude drafts, author IDs, delivery IDs, source operation IDs, idempotency keys, internal versions, activation source/link details, retry internals, unit recipient/records, and unrelated client/workspace data.

## Inclusion and ownership

- Include every delivered plan for the authenticated client, including multiple plans of the same kind and later subscription-bound deliveries. Never omit a plan because it lacks a “first-delivery” record. Never include a draft or a plan belonging to another client/workspace. Ready & Publish is refused without an eligible subscription, so no published-but-undelivered revision can exist.
- Each published revision has a delivery row binding workspace, client, subscription, root, kind, and immutable revision. For a delivered plan, the projection returns the latest delivered revision once under the stable Plan ID; it does not reactivate or add a unit for later revisions.
- Client identity is derived from authenticated identity to the current client row. The caller cannot select client or workspace as authority. Expired or deactivated clients receive the existing generic denial and no plan content. Video is resolved only behind the authorized F19/P4 boundary; F16 exposes no client-callable catalog function.
- A plan without any delivery is omitted entirely: no metadata and no `content: null` placeholder. This omission rule never applies to an otherwise delivered plan based on first-delivery status.
