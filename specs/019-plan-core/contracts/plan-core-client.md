# F19 Plan Core Client Contract

**Status:** Spec-only shared contract; F17/F18 own domain payload schemas.

## Identity and projections

| Contract item       | Required behavior                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PlanRoot`          | Stable `planId`, `workspaceId`, `clientId`, `kind`, current lifecycle metadata. Workspace/client are server-authorized and cannot be reassigned by a draft write.                                                                                                                                                                                |
| `readiness`         | Exactly `draft` or `published`. `draft` means no published revision exists; `published` means at least one immutable revision exists. No separate `ready` or `ready_to_publish` state is specified because Ready & Publish is one action and PO records require no intermediate readiness state.                                                 |
| `PrivateDraft`      | Staff-only projection with plan ID, CAS `draftVersion`, feature content, and update metadata. Never included in a client projection.                                                                                                                                                                                                             |
| `PublishedRevision` | Stable plan/revision IDs, positive revision number, immutable publication time, content, and staff-only author reference. Clients receive no author/actor ID.                                                                                                                                                                                    |
| `PlanContent`       | Discriminated `{ kind: workout or nutrition, schemaVersion, document }`. Workout document uses F16 `ExerciseSnapshotV2` and its exact canonical/override or workspace-private version references; Video remains live. Nutrition document refers to immutable F16 food-version identities/versions. No `CatalogSnapshotRef` V1 field is accepted. |

## Requests

- `CreatePlanRequest`: explicit `createMode: 'blank' | 'template' | 'existing_plan'`, `clientId`, `kind`, mode-specific `templateId` or `sourcePlanId`, and `operationKey`. Workspace and actor are derived from current authorization, not trusted request fields. Source plan must be in an authorized workspace and available to the actor. Copy rules are F19-FR-008.
- `DraftWriteRequest`: `{ planId, expectedDraftVersion, content, operationKey, intent: 'autosave' | 'save_draft' }`. Both intents mutate only the private draft. Neither publishes, delivers, nor creates a root.
- `ReadyAndPublishRequest`: `{ planId, expectedDraftVersion, expectedPublishedRevision, operationKey }`. It appends one immutable revision using CAS. Ready & Publish binds delivery to the client's resolved continuous subscription under the pending F13-FR-037 requirement and F19-FR-002. Each successful publish appends a revision and delivery row in one operation. Without an eligible subscription, while a legacy chain is unresolved, or if continuity is unexpectedly violated, the request fails closed with `not_permitted` and no writes.
- `OverrideActivateRequest`: Platform Owner-only, initial-subscription target, operation key, plus a trainer recipient only when no trainer is assigned. The selected recipient is not an assignment input. Cancelled/refunded, deactivated, or already-active targets return `not_permitted`; these refusals write or change nothing.

## Results and errors

Success returns `{ status: 'ok', replayed, receipt }`, where `receipt` is the immutable operation-specific result and an exact authorized replay returns that original receipt. Its fields are limited to identifiers and values created by that operation:

| Operation                 | Success receipt                                                |
| ------------------------- | -------------------------------------------------------------- |
| `CreatePlanRequest`       | `planId`; no revision ID exists for a blank or copied draft.   |
| `DraftWriteRequest`       | `planId` and the resulting `draftVersion`.                     |
| `ReadyAndPublishRequest`  | `planId`, `revisionId`, and the resulting revision number.     |
| `OverrideActivateRequest` | Activation outcome only; no Plan or revision IDs are included. |

Do not return internal operation IDs to clients. Failure results are closed and contain no free-form detail.

| Result          | Meaning                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `not_permitted` | Missing, foreign, expired/deactivated, or unauthorized object; do not reveal existence or distinguish security states. |
| `invalid_input` | Invalid enum, malformed request, source mode mismatch, or domain validation failure.                                   |
| `stale_version` | Draft or published revision compare-and-swap failed; no partial write.                                                 |
| `key_conflict`  | Operation key was previously bound to different canonical arguments.                                                   |
| `unavailable`   | Unknown transport/service result; caller may replay the same operation key.                                            |

## Authorization

Trainer, Workspace Owner, and Platform Owner with current authorization in the plan workspace may edit any client plan there. Sales may not edit plans. Cross-workspace access is denied generically. Client self-read derives identity from the authenticated client mapping, checks current entitlement, and returns only delivered plans and latest published revisions. There is no collaborative editing presence/locking UX.
