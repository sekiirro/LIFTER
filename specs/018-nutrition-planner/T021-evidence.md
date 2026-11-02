# F18 T021 — Seven-day editor model

- RED: focused tests failed on conditional meal visibility (expected 2, got 0), stable reorder/duplication mapping, and exact day totals (expected 125.0000 calories, got 0).
- GREEN: `NutritionPlanEditorModel` passes 4/4 focused tests for conditional visibility, reorder ID preservation, duplicate ID remapping, day-type assignment, exact quantity edits, and totals via `computeNutritionMacroTotals`.
- Mutation table:

| Mutant | Failing assertion | Restored result |
| --- | --- | --- |
| Always filter out `training_days_only` meals | `shows conditional meals only when the assigned day type is a training day` — expected 2 meals, received 1 | Restored day-type conditional; 4/4 tests pass |

- No DB, Supabase, schema, or dependency changes.
