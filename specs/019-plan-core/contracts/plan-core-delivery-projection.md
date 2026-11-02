# Plan Core Client Delivery Projection

**STATUS: APPROVED (S27-R5, S27-R6.2, S27-R6.3)**

This contract specifies the pure T017 client projection over already-authorized typed delivery, activation, and published-revision inputs. It does not define a database read path.

## Visible projection fields

| Field | Contract | Source |
| --- | --- | --- |
| `planId` | Stable identity of the delivered plan; retained across published revisions. | `spec.md:15,27-28`; S27-R5 rules 8, 12 |
| `kind` | `workout` or `nutrition`, corresponding to the independently delivered plan kind. | `spec.md:21,30,39-40`; Plan Core `data-model.md:5` |
| `revisionNumber` | Revision number of the latest published revision returned for this delivered Plan ID. | `spec.md:27,39-41`; `lib/plan-core/schemas.ts:183-194`; S27-R5 rule 12 |
| `publishedAt` | `createdAt` of the latest projected immutable published revision. | S27-R5 rule 9; `lib/plan-core/schemas.ts:258-268` (`createdAt` source field) |
| `content` | Feature envelope `{ kind, schemaVersion, document }` for a delivered plan, joined by `(plan_id, revision_id)`; never a live catalog read. | S27-R5 rules 3, 8-9; F16 `contracts/export-read-isolation.md:3-5` |
| `delivery.status` | `delivered` for every returned projection. Plans without a matching first-delivery record are omitted entirely. | Plan Core `data-model.md:5`; `lib/plan-core/delivery-contract.ts:43-51`; S27-R5 rule 9 |
| `activation.status` | `pending` until activation commits; `complete` after the activation record commits. A queued retry remains `pending`. | `spec.md:21,31,39-41`; Plan Core `data-model.md:5`; S27-R5 rules 9, 11 |

Only these fields are client-visible. Never project delivery IDs, operation keys, author IDs, internal version counters, or retry/outbox state. Do not project any draft fields.

## Projection and ownership rules

- Return the latest **published** revision of a delivered plan, under its existing Plan ID. Later revisions become visible without a re-delivery step and do not restart activation. Sources: `spec.md:15,27-28,41`; S27-R5 rule 12.
- Resolve revision content by `(plan_id, revision_id)` and use its immutable feature envelope and T018 catalog snapshots. Do not call live catalog reads. Sources: S27-R5 rules 3, 7-8; F16 `contracts/export-read-isolation.md:3-5`.
- The caller supplies already-authorized inputs scoped by `auth.uid()` → `clients.auth_user_id` → that client → their own subscription. Unknown, foreign, or deactivated clients are denied with `not_permitted`; the projector itself performs no authorization or I/O. Source: S27-R5 rule 10.
- Delivery and activation remain separate states. A single delivery does not activate; if both deliveries exist and activation retry is queued but uncommitted, return `activation.status: 'pending'`. Sources: `spec.md:21,30-31,39-41`; Plan Core `data-model.md:5`; S27-R5 rules 9, 11.
- A plan without a matching delivery is omitted entirely: no metadata and no `content: null` entry. This is the minimal-disclosure rule in S27-R6.3.

