# Plan Core Client Contract

**STATUS: PROPOSED — architect review required**

This proposal describes the shared TypeScript client boundary for T008. It is not an approved transport schema. Feature payloads remain owned by F17/F18.

## Root response DTO

| Field | Proposed contract | Source |
| --- | --- | --- |
| `planId` | Required stable Plan ID (UUID). | `lib/plan-core/schemas.ts:82-86,359-365`; `spec.md:27-29` |
| `draft` | Optional `PrivateDraft`; staff editing projection only. Never include it in a client-owned plan projection. | `lib/plan-core/schemas.ts:121-131,142-176`; `spec.md:15,28` |
| `currentRevision` | Optional immutable revision reference. | `lib/plan-core/schemas.ts:180-194,359-365`; `spec.md:27-28` |
| `publishedVersion` | Optional non-negative version counter. | `lib/plan-core/schemas.ts:359-365,393-399` |
| `readiness` | Optional `draft`, `ready`, `ready_to_publish`, or `published`. | `lib/plan-core/schemas.ts:98-117,359-365` |

## Draft DTO

| Field | Proposed contract | Source |
| --- | --- | --- |
| `planId` | Required and equal to the parent root's stable Plan ID. | `lib/plan-core/schemas.ts:124-131,148-149`; `spec.md:27-28` |
| `draftId` | Optional UUID draft identifier. | `lib/plan-core/schemas.ts:124-126,150-153` |
| `visibility` | Literal `private`; drafts are never client-visible before publish. | `lib/plan-core/schemas.ts:124-128,155-157`; `spec.md:15,28` |
| `content` | Optional feature payload, currently typed `unknown`; F17/F18 own its shape. | `lib/plan-core/schemas.ts:124-131,169-175`; `spec.md:45` |
| `revision` | Optional non-negative draft revision counter. | `lib/plan-core/schemas.ts:128-130,159-162` |
| `updatedAt` | Optional timestamp string. | `lib/plan-core/schemas.ts:129-130,164-166` |

## Immutable revision DTO

| Field | Proposed contract | Source |
| --- | --- | --- |
| `planId` | Required stable Plan ID; equal to the root ID for Save as Draft and Ready & Publish. | `lib/plan-core/schemas.ts:183-194,223-224`; `spec.md:27-28` |
| `revisionId` | Required UUID revision identifier. | `lib/plan-core/schemas.ts:183-194,223-224` |
| `revisionNumber` | Required positive integer, append-only within the plan. | `lib/plan-core/schemas.ts:183-194,225-228`; `spec.md:27,39-41` |
| `authorId` | Required UUID author identifier. | `lib/plan-core/schemas.ts:183-194,251` |
| `version`, `publishedVersion`, `expectedPublishedVersion` | Optional non-negative version values already accepted by the schema. `expectedPublishedVersion` is the proposed publish CAS input. | `lib/plan-core/schemas.ts:187-189,230-249`; `spec.md:27-28` |
| `author`, `createdAt`, `immutable` | Optional legacy/compatibility metadata; if `immutable` is present it must be `true`. | `lib/plan-core/schemas.ts:190-193,253-268` |
| `content` | The revision payload must retain its selected immutable F16 snapshot references; feature-specific workout/nutrition payload shape is not defined here. | `spec.md:45`; F16 `data-model.md:43-46`; F16 `export-read-isolation.md:3-5` |

## Requests and results

| Operation | Derivable request/result fields | Source |
| --- | --- | --- |
| Explicit create | `createMode: 'blank'`; or `createMode: 'template'` with `templateId`; or `createMode: 'existing_plan'` with `sourcePlanId`. Create is an explicit operation. | `lib/plan-core/schemas.ts:303-352`; `spec.md:19,29` |
| Save as Draft | Request must identify the existing `planId`; a successful result must retain that same `planId` and contain the resulting private draft projection. | `spec.md:15,27-28`; `lib/plan-core/schemas.ts:124-131,359-365` |
| Ready & Publish | Request must identify the existing `planId` and may use the defined `expectedPublishedVersion` counter for CAS. A successful result retains that `planId` and returns its appended immutable revision reference. | `spec.md:15,27-28,39-41`; `lib/plan-core/schemas.ts:183-194,291-296,359-365` |
| Exact replay | The shared operation ledger returns the original JSON result for the same actor/action/key/hash; changed action or hash conflicts. | F16 `contracts/catalog-api.md:47-49` |

## Error and replay typing

| Discriminator | Derivable behavior | Source |
| --- | --- | --- |
| `invalid_plan_core` | Existing local validation error code for malformed Plan Core schema input. | `lib/plan-core/schemas.ts:10-19` |
| `operation_key_request_conflict` | Shared ledger conflict for reusing an operation key with changed action or request hash. | F16 `contracts/catalog-api.md:47-49` |

## OPEN QUESTIONS

- What are the wire/client request DTOs for draft autosave and Save as Draft: content field name and type, draft revision/CAS token, operation key placement, and whether autosave and explicit Save as Draft share one request?
- Is `expectedPublishedVersion` the canonical Ready & Publish input name, or only a compatibility field among `version`, `publishedVersion`, and `expectedPublishedVersion`?
- What exact content schema and snapshot-reference container does an F17/F18 published revision use? The shared schema currently types draft content as `unknown`, and the revision reference contains no payload.
- What response envelope and replay indicator are returned? The shared ledger persists the original result, but does not define a client-visible `replayed` field for plan save/publish results.
- What typed error discriminators/status mapping cover not-found, unauthorized, stale version, immutable revision, and action/hash conflict? Only the two codes above are currently specified by the cited contracts.
- Which revision metadata fields are required on the wire versus optional compatibility fields?
