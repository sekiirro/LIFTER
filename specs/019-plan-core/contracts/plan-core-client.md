# Plan Core Client Contract

**STATUS: APPROVED (S27-R5, S27-R6.1)**

This is the shared TypeScript client contract for T008. Feature-owned workout and nutrition document schemas remain owned by F17/F18.

## DTOs

| DTO / field | Contract | Source |
| --- | --- | --- |
| `PlanRootDto.planId` | Required stable Plan ID. | `spec.md:27-29`; `lib/plan-core/schemas.ts:82-86,359-365` |
| `PlanRootDto.draft` | Optional private draft for staff projections only; never included in a client projection. | `spec.md:15,28`; `lib/plan-core/schemas.ts:121-131,142-176` |
| `PlanRootDto.currentRevision` | Optional current immutable revision reference. | `spec.md:27-28`; `lib/plan-core/schemas.ts:180-194,359-365` |
| `PlanRootDto.publishedVersion` | Optional non-negative read-side version metadata. | `lib/plan-core/schemas.ts:359-365,393-399` |
| `PlanRootDto.readiness` | Optional readiness enum: `draft`, `ready`, `ready_to_publish`, or `published`. | `lib/plan-core/schemas.ts:98-117,359-365` |
| `PrivateDraftDto` | `planId`, optional `draftId`, literal `visibility: 'private'`, `content`, optional draft `revision`, optional `updatedAt`. `content` is the feature envelope below. | `spec.md:15,27-28,45`; `lib/plan-core/schemas.ts:121-176` |
| `PublishedRevisionDto` | Wire-required `planId`, `revisionId`, positive `revisionNumber`, and `createdAt`; `authorId` is present only in staff projections. Do not serialize `author`, `immutable`, or `version`. | `spec.md:27-28`; S27-R5 rule 6; `lib/plan-core/schemas.ts:183-194,223-268` |
| `PlanContentEnvelope` | `{ kind: 'workout' | 'nutrition', schemaVersion: number, document: unknown }`. Every catalog reference inside `document` is a T018 `CatalogSnapshotRef`; Plan Core validates the envelope and snapshot references only. | `spec.md:45`; F16 `data-model.md:43-46`; S27-R5 rule 3 |

## Requests and operation results

| Request / result | Contract | Source |
| --- | --- | --- |
| `DraftWriteRequest` | One shape for autosave and Save as Draft: `{ planId, expectedDraftRevision, content, operationKey, intent: 'autosave' \| 'save_draft' }`. `expectedDraftRevision` is a CAS token. Autosave never creates a revision. | `spec.md:15,27-28`; `plan.md:13-18`; F16 `contracts/catalog-api.md:47-49`; S27-R5 rule 1 |
| `PublishRequest` | `{ planId, expectedPublishedVersion, operationKey }`. `expectedPublishedVersion` is the only publish CAS input; `version` and `publishedVersion` are read-side metadata only. Publish appends a revision under the same Plan ID. | `spec.md:15,27-28`; `plan.md:13-18`; F16 `contracts/catalog-api.md:47-49`; S27-R5 rule 2 |
| `DraftWriteData` | `{ planId, draft }`; `planId` equals the request's Plan ID. `draft` is private. | `spec.md:15,27-28`; `lib/plan-core/schemas.ts:124-131,359-365`; S27-R5 rule 4 |
| `PublishData` | `{ planId, revision }`; `planId` equals the request's Plan ID and `revision` is its appended immutable revision. | `spec.md:15,27-28`; `lib/plan-core/schemas.ts:183-194,359-365`; S27-R5 rule 4 |
| `CreatePlanRequest` | `{ createMode: 'blank' | 'template' | 'existing_plan', kind: 'workout' | 'nutrition', templateId?, sourcePlanId?, operationKey }`. `templateId` is required only for `template`; `sourcePlanId` is required only for `existing_plan`; other combinations are `invalid_input`. | S27-R6.1 |
| `CreatePlanData` | Success data is the root DTO of the newly created plan; source plans are never mutated and replay uses the shared ledger. | S27-R6.1 |

## Response envelope and errors

Success is `{ status: 'ok', replayed: boolean, data }`. `replayed` is passed through from the shared operation ledger result. Failure is `{ status: <code> }` with no detail text.

| Error code | Meaning / mapping | Source |
| --- | --- | --- |
| `not_permitted` | Covers both not-found and unauthorized; do not reveal existence. | S27-R5 rule 5; F16 `contracts/catalog-api.md:9,47-49` |
| `invalid_input` | Client boundary result for local `invalid_plan_core` validation errors. | S27-R5 rule 5; `lib/plan-core/schemas.ts:10-19` |
| `stale_version` | Expected draft or published version did not match current state. | S27-R5 rules 1, 5; `spec.md:31`; `plan.md:15` |
| `immutable_revision` | Attempted mutation of an immutable published revision. | S27-R5 rule 5; `spec.md:27,31` |
| `key_conflict` | Shared ledger `operation_key_request_conflict`. | S27-R5 rule 5; F16 `contracts/catalog-api.md:47-49` |
| `unavailable` | Unknown response status or unavailable transport/service. | S27-R5 rule 5 |

The error union is closed. Unknown server statuses map to `unavailable`; do not pass through unknown text or status values. A local `PlanCoreValidationError` with code `invalid_plan_core` maps to `invalid_input`.


