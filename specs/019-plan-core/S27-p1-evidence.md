# S27 Plan Core round p1 evidence

## Merge and migration order

- Merged `origin/main` into `019-plan-core` without rebasing. Merge commit: `fa5a6b9`.
- The merge conflicts were `lib/i18n/messages/ar.ts`, `lib/i18n/messages/en.ts`, and `specs/012-registration-approval/data-model.md`. Main's versions were retained; Plan Core translation keys from the lane were restored alongside main's catalog translations in `6b14853`.
- `git diff --name-only --diff-filter=D origin/main HEAD` was empty: no main-tracked files are deleted.
- Main's latest migration is `20261106124000`; reserved F16 detail migration is `20261106125000`; Plan Core's planned range starts at `20261106200000`. Both precede it lexicographically, so the Plan Core migration versions remain correctly ordered. No migrations were authored or applied in this round.
- `node scripts/check-migration-timestamps.mjs`: pass; 111 migration timestamps validated, with 11 documented merged exceptions allowed.

## T018 — F16 catalog snapshot references

- RED test commit: `115c06c` added `tests/contracts/plan-core-catalog-snapshot.test.ts`. The first targeted run exposed that the default Vitest include omitted `tests/contracts`; `233d4f2` added contract tests to the normal unit suite. The now-discovered test failed because `lib/plan-core/catalog-snapshot-ref.ts` did not exist (module import at test line 2). This is the recorded RED failure.
- GREEN commit: `ca249ba`. `createCatalogSnapshotRef` and `normalizeCatalogSnapshotRef` validate F16 exercise/food snapshots, require explicit positive versions, match the identity and version to the embedded snapshot, deep-copy and freeze the reference and snapshot, and reject unknown/live-pointer fields. The task checkbox is ticked in `tasks.md`.
- Mutation: changed the version-equality guard in `lib/plan-core/catalog-snapshot-ref.ts` to accept a mismatch. The test failed at `tests/contracts/plan-core-catalog-snapshot.test.ts:56` (“expected [Function] to throw an error”). Restored the source from the backup in the requested run directory; `git diff -- lib/plan-core/catalog-snapshot-ref.ts` was empty after restoration.
- Lifecycle semantics remain with F16: persisted plan revisions retain the originally selected immutable snapshot; F16's selection resolver is used when selecting at use time to resolve aliases to the terminal survivor. A removed selection must surface as unavailable; consumers must not silently substitute. Plan Core does not implement a second alias/lifecycle engine.

## T008 and T017 — not implemented

- **T008** has no frozen client transport contract for root/draft/revision request and response DTO shapes, published payload shape, same-ID save/publish result and replay fields, or typed error-code/discriminator mapping. `PrivateDraft.content` is `unknown`, and immutable revision metadata alone does not define those payloads. The planned T003 revision/audit fixture is also absent. Implementing a transport client now would invent these items.
- **T017** has no typed authorized client projection contract: the exact client-visible fields and ownership boundary, how a delivery record maps to the published plan content, or how pending/complete activation is projected while durable activation retry work remains. The task asks for mocked authorized projections but does not define their shape. Implementing it now would invent these items.

## End gates

After `npm ci`, all requested final gates passed:

| Gate | Result |
| --- | --- |
| `npm run test` | Pass — 141 files, 2,019 tests |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run format:check` | Pass |
| `npm run build` | Pass |
| `npm run check:secrets` | Pass |
| `npm run size` | Pass — web 8,309.37 KiB; cron 11.76 KiB |
| `node scripts/check-migration-timestamps.mjs` | Pass |
| `git diff --check` | Pass |

The first gate attempt before restoring the Plan Core translations exposed the dropped merge-conflict keys and an incomplete local `node_modules` (`happy-dom` missing). The translation keys were restored, dependencies were clean-installed with `npm ci`, and the final complete gate run passed.

## Remaining tasks requiring a database stack

T006, T007, T009–T016, T019, T020, T022, and T024. T008 and T017 remain blocked on the TypeScript contracts above, not stack assignment. T018 is complete. No Supabase stack, Docker, database, or migration application was used.

## Pushed head

`6b14853` (`fix(plan-core): retain lifecycle translations after merge`), on `019-plan-core`, pushed to `origin/019-plan-core`. No PR was opened.
