# S28 Plan Core p4 pure TypeScript evidence

## S27-R6.3 ? omit not-delivered plans

- RED commit `dffa539`: `npm test -- --run tests/unit/plan-core-delivery-projection.test.ts` failed at line 160: `expected { ?(7) } to be null`; actual output contained plan metadata, `delivery.status: not_delivered`, and `content: null`.
- GREEN commit `c680b40`: projector returns `null` without a matching subscription/plan/kind delivery. Updated foreign-subscription and no-delivery assertions. Focused suite passed (5 tests).
- Mutant: removed the omission guard and reintroduced metadata/null content. Same suite failed at lines 146 and 151 with expected null versus returned projection. Restored source from `%TEMP%\s28-projection-backup.ts`; `git diff -- lib/plan-core/delivery-projection.ts` was empty.

## S27-R6.1 ? explicit create client

- RED commit `a36bb5a`: `npm test -- --run tests/unit/plan-core-client.test.ts` failed at line 279: `TypeError: client.create is not a function`.
- GREEN commit `c680b40`: introduced `CreatePlanRequest`, transport `create`, mode-specific validation, operation key, shared success/error envelope and root DTO parsing. Tests cover blank transport and reject missing/extra `templateId` / `sourcePlanId`; focused suite passed (11 tests).
- Mutant: filtered `templateId` from mode validation so blank plus template ID was accepted by normalization. Test failed in `requires mode-specific create IDs...` at line 300; received unavailable after mutant invoked empty transport instead of `invalid_input`. Restored source from `%TEMP%\s28-client-backup.ts`; `git diff -- lib/plan-core/client.ts` was empty.

## S27-R6.2 ? published timestamp

Already covered by `tests/unit/plan-core-delivery-projection.test.ts:68`: expected projection explicitly sets `publishedAt: revisions[1]?.createdAt`. This verifies projected published revision `createdAt` mapping.

## Contracts and tasks

Updated both APPROVED contracts with the S27-R6 decisions and removed resolved questions. Updated T008/T017 traceability in `tasks.md`.
