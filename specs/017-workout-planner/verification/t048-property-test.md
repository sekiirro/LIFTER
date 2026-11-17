# T048 verification — schema-v1 document property test

- Scope: T048 only, per architect ruling S58-R15. T038 is deferred to PO decision MCQ-1.
- RED: the new test was first run with the 1,000-operation property harness unimplemented; it failed the `operationCount === 1000` assertion (received 0; exit 1).
- GREEN: `npm run test:unit -- --run tests/unit/workout-document-property.test.ts` passed after adding the seeded property harness (1 test passed; exit 0). It executes exactly 1,000 operations: 200 each of reorder, cross-day move, duplicate, add-to-rest rejection, and move-to-rest rejection.
- Properties checked: parsed schema-v1 after every successful mutation; stable ids for existing items and unique ids throughout; all item prescriptions/text and set type/load data preserved through reorder, move, and duplicate; duplicate item/set ids remapped; rest-day add/move throw `invalid_document`; rejected attempts leave the input JSON unchanged; rejected moves keep the source item on its source day.
- Mutation: temporarily changed `moveWorkoutItem` to add 15 seconds to a moved item's `restSec`. The property test failed on deep parameter equality (expected 75, received 90; exit 1), killing the mutation.
- Restore: removed the temporary mutation; `git diff --exit-code -- lib/workout-planner/document.ts` returned 0. The focused property test passed again after restoration (1 test passed; exit 0).
- Commands/evidence were run on branch `017-ts-slice-2`, base `17f5f31fa0776036d713816ab0d8d77e84a33f31`.
