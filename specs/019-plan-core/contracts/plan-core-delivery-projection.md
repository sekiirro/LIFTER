# Plan Core Client Delivery Projection

**STATUS: PROPOSED — architect review required**

This proposal describes T017's client-facing read projection. It is derived from the approved lifecycle and delivery contracts; it does not authorize or define a database read path.

## Projection fields

| Field / projection element | Proposed contract | Source |
| --- | --- | --- |
| `planId` | Stable plan identity for a published plan. Do not expose a private draft as a client plan. | `spec.md:15,27-28`; `lib/plan-core/schemas.ts:359-365` |
| `publishedRevision` | Reference to the immutable revision used for the delivered plan; the payload is the explicit feature snapshot, not a live catalog read. | `spec.md:15,27,45`; F16 `contracts/export-read-isolation.md:3-5` |
| `delivery.kind` | Workout and nutrition are separate delivery kinds and may be delivered on different days. | `spec.md:21,30,39-40`; `lib/plan-core/delivery-contract.ts:23,43-51` |
| `delivery.planId` | Plan identity associated with this first-delivery record. | `lib/plan-core/delivery-contract.ts:43-48`; Plan Core `data-model.md:5` |
| `delivery.deliveredAt` | Timestamp of the successful first-delivery record, if the client projection is approved to expose it. | `lib/plan-core/delivery-contract.ts:43-51`; Plan Core `data-model.md:5` |
| `activation.status` | Proposed `pending` until an activation record exists; `complete` only after the exactly-once activation commits. Delivery status remains independent from activation status. | `spec.md:21,31,39-41`; Plan Core `data-model.md:5` |
| `activation.activatedAt` | Present only for a completed activation and recorded by the activation transaction after both first deliveries are verified. | Plan Core `data-model.md:5` |

## Ownership and visibility boundary

- A client projection contains published plan snapshots only; a private draft is never included. F16 exposes no client catalog endpoint or live catalog read. Sources: `spec.md:15,28`; F16 `contracts/export-read-isolation.md:3-5`.
- Workout and nutrition deliveries are projected independently. One delivery does not imply activation. Both durable delivery records lead to activation, or a durable activation retry before delivery commit; exact replay must not duplicate delivery, activation, or productivity credit. Sources: `spec.md:21,30-31,39-41`; Plan Core `data-model.md:5`.
- A delivery row is bound to workspace, subscription, kind, client, plan, and immutable plan version in the canonical P4 contract. A client read must be scoped to its own subscription/plan relation; the exact authorization relation and query boundary remain open. Source: Plan Core `data-model.md:5`; `tasks.md:36` (client self-ownership).

## OPEN QUESTIONS

- Does `plan_version_id` reference `ImmutableRevisionRef.revisionId`, another published-version identifier, or a separate F17/F18 version row? The P4 contract names the field but does not map it to the shared TypeScript revision fields.
- What exact F17/F18 payload is returned as `publishedRevision`, and how does the read join that payload to `(plan_id, plan_version_id)`? The shared Plan Core revision schema contains metadata only; feature payload schemas are owned by F17/F18.
- Are `planId`, `deliveredAt`, revision IDs/version numbers, and delivery IDs visible to clients, or should the projection expose only plan content and delivery state? The source contracts define stored fields and snapshot visibility but do not enumerate the client JSON shape.
- Which authenticated client identity and subscription relation establish self-ownership, and what is the exact authorized projection/read contract? T019 names client self-ownership but no claim or join implementation.
- If both delivery rows exist and durable activation retry is queued but activation has not committed, should the client see only `pending`, or a separate retry state? PC-FR-005 guarantees durability but specifies no retry-status projection.
- Does a later published revision replace the client's delivered snapshot immediately or only after a new explicit delivery? The lifecycle spec says later revisions do not restart activation but does not specify client re-delivery visibility.
