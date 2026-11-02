# S27 Plan Core round p3 evidence

## S27-R5 contract update

- Read `C:/Users/NEW LAP/.lifter/briefs/s27-architect-rulings.md`; applied only binding S27-R5 rules 1–12.
- Updated [plan-core-client.md](contracts/plan-core-client.md) and [plan-core-delivery-projection.md](contracts/plan-core-delivery-projection.md) to `STATUS: APPROVED (S27-R5)` in `e044d60`.
- Follow-up `bbb7d77` keeps two T017 items as open questions because the ruling names the output fields but not their source/visibility mapping.
- Remaining questions: (1) T008 explicit Create New Plan transport/idempotency shape is outside the ruling and T008's save/publish scope; (2) whether T017 `publishedAt` maps from revision `createdAt` or a separate timestamp; (3) whether metadata for a not-delivered plan is visible and whether its feature `content` must be withheld. Implementation maps `createdAt` to `publishedAt` and emits `content: null` when not delivered; both choices are documented for architect confirmation.

## T008 — Plan Core client

- RED test commit: `fc7bd55`. Initial targeted run failed because `lib/plan-core/client.ts` did not exist; import failure is at `tests/unit/plan-core-client.test.ts:2`. The committed behavioral assertions cover root/draft/revision parsing, same-ID results, error mapping, replay passthrough, and publish CAS field exclusion.
- GREEN commits: `aa1b5d7` plus schema-version conformance follow-up `9b89d6d`. Injected transport only; no network or database. DTOs and response envelopes are validated, local `invalid_plan_core` maps to `invalid_input`, unknown statuses map to `unavailable`, replayed passes through, publish requires `expectedPublishedVersion` only, and published content is frozen with validated T018 snapshot references.
- Mutation: removed the exact-key check in `normalizePublishRequest` so read-side `version`/`publishedVersion` fields could pass. `tests/unit/plan-core-client.test.ts:186` failed: expected `invalid_input`, received `unavailable` after the mutated client called transport. The source was restored from a backup in the run directory; its diff was empty after restoration.
- T008 is checked in `tasks.md`.

## T017 — client delivery projection

- RED test commit: `88a06bc`. Initial targeted run failed because `lib/plan-core/delivery-projection.ts` did not exist; import failure is at `tests/unit/plan-core-delivery-projection.test.ts:2`.
- GREEN commit: `fdcde1d`. The pure projector selects the latest published revision for the Plan ID, scopes records to the supplied subscription, keeps activation pending until a matching activation record exists, returns only the seven approved fields, and withholds content when no delivery exists. It ignores the root draft and internal delivery/author fields.
- Mutation: added `deliveryId` to the projection. The allowlist assertion failed at `tests/unit/plan-core-delivery-projection.test.ts:63` because the result contained an eighth, prohibited field. Restored from the requested backup; source diff was empty after restoration.
- T017 is checked in `tasks.md`.

## Final gates

| Gate | Result |
| --- | --- |
| `npm run test` | Pass — 143 files, 2,033 tests |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run format:check` | Pass |
| `npm run build` | Pass |
| `npm run check:secrets` | Pass |
| `npm run size` | Pass — web 8,309.37 KiB; cron 11.76 KiB |
| `git diff --check` | Pass |

The first complete gate attempt found a strict draft-content type error, a failure-envelope generic typing error, and a lint warning in the client. They were corrected in `98b4645`; the full gate run on that corrected head passed all gates above.
