# F18 Nutrition Planner — Verification Report

## Environment

- **Base `origin/main` SHA**: `9995e5b7`
- **Stack**: D (`LIFTER_SUPABASE_STACK=d`, API port 45421, DB port 45422)
- **Node**: `v24.19.0`
- **Vitest**: `vitest/5.1.0`
- **PostgreSQL image**: `public.ecr.aws/supabase/postgres:17.11.0.006`

## Slice 2: T014 (`assign_nutrition_templates`) & T015 (`make_nutrition_template_global`)

- **Migration**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql`
- **Integration suites**:
  - `tests/integration/nutrition-assign.test.ts` (6 tests)
  - `tests/integration/nutrition-make-global.test.ts` (1 test)
  - `tests/integration/rls-catalog.test.ts` (42 tests; `app_private.nutrition_template_assign_guard`, `app_private.nutrition_template_private_fields` registered)
- **GREEN**: 3 test files passed, 49/49 tests passed after clean Stack D reset and provisioning (`tests/integration/client-accounts-provision.mjs`).

### Mutation Evidence (all killed, restored, `git diff --exit-code` 0)

1. **T014 — `All` tops up a partial workspace**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:124-126,133-140`
   - **Mutation**: Removed the `not exists (... nutrition_template_assignment_items ... outcome='assigned')` filters for `p_workspace_mode='all'`.
   - **Result**: KILLED — `tests/integration/nutrition-assign.test.ts` failed 1/6 (`keeps All away from partial workspaces and reports held copies without overwriting them` at `tests/integration/nutrition-assign.test.ts:382`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision.

2. **T014 — Overwrite a held copy**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:156`
   - **Mutation**: Added `update public.nutrition_workspace_templates c set display_name = c.display_name || ' — overwritten'` in the `skipped_existing` branch instead of skipping without modification.
   - **Result**: KILLED — `tests/integration/nutrition-assign.test.ts` failed 2/6 (`nutrition_template_version_conflict` immutability guard triggered on `assign_nutrition_templates` at `tests/integration/nutrition-assign.test.ts:281,396`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision.

3. **T015 — Non-PO `make_nutrition_template_global`**
   - **Target**: `supabase/migrations/20261119070000_f18_template_assignment_promotion.sql:239,246,252,257`
   - **Mutation**: Removed `not app_private.is_platform_owner()` authorization checks in `public.make_nutrition_template_global`.
   - **Result**: KILLED — `tests/integration/nutrition-make-global.test.ts` failed 1/1 (`denies non-PO callers, refuses private fields, and promotes an unchanged separate copy` at `tests/integration/nutrition-make-global.test.ts:138`, non-PO `trainerA` call resolved instead of rejecting with `42501`).
   - **Restore**: Reverted mutation; clean Stack D reset + provision; 49/49 tests passed on restored state.
