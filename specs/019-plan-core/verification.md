# F19 Verification Evidence — T031 (Trainer Deletion Retention Integration)

- **Task**: T031 (`FR-012`, `FR-013`, `SC-011`)
- **Stack**: Stack D (`LIFTER_SUPABASE_STACK=d`, `lifter-stack-d`)
- **Test file**: `tests/integration/f19-trainer-deletion.test.ts` (2/2 passed)
- **Full F19 + RLS catalog run on Stack D**: 7 files, 83/83 tests passed (`f19-plan-core-schema.test.ts`, `f19-plan-delivery.test.ts`, `f19-plan-activation.test.ts`, `f19-plan-override.test.ts`, `f19-plan-renewal.test.ts`, `f19-trainer-deletion.test.ts`, `rls-catalog.test.ts`)

## FK Inventory & F11 Compatibility

- All 11 F19 staff/author foreign keys (`plan_roots.created_by`, `plan_drafts.created_by`, `plan_drafts.updated_by`, `plan_revisions.authored_by`, `plan_deliveries.delivered_by`, `productivity_units.recipient_trainer_user_id`, `plan_audit_events.actor_user_id`, `app_private.plan_operation_keys.actor_user_id`, `app_private.plan_delivery_operations.actor_user_id`, `app_private.subscription_reattachments.actor_user_id`, `app_private.f19_override_operations.actor_user_id`) have `confdeltype = 'r'` (`ON DELETE RESTRICT`) referencing `public.staff_profiles(user_id)`.
- `public.staff_profiles.user_id` has `confdeltype = 'r'` (`ON DELETE RESTRICT`) referencing `auth.users(id)` plus `staff_profiles_no_delete` trigger.
- Zero `CASCADE` or `SET NULL` FKs exist on F19 tables or `subscription_activations`. No forward migration is required.
- External run artifacts: `C:/Users/NEW LAP/.lifter/runs/s59-hy-f19t031/fk-inventory.md`, `C:/Users/NEW LAP/.lifter/runs/s59-hy-f19t031/f11-compat.md`.

## Mutation Evidence

- **Mutant**: Changed `plan_revisions.authored_by` in `supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql:36` (and Stack D constraint `plan_revisions_authored_by_fkey`) from `ON DELETE RESTRICT` to `ON DELETE CASCADE`.
- **Result**: `tests/integration/f19-trainer-deletion.test.ts:86` failed (`expected false to be true` on `confdeltype === 'r'`).
- **Restore**: Restored `supabase/migrations/20261114120000_f19_plan_roots_drafts_revisions.sql` (`git diff --exit-code supabase/migrations` = 0) and Stack D constraint (`ON DELETE RESTRICT`), then re-ran `tests/integration/f19-trainer-deletion.test.ts` (2/2 passed).
- **Re-verified after #134**: Updated `tests/integration/f19-trainer-deletion.test.ts` to publish the nutrition plan via `public.publish_nutrition_revision` with valid F18 document shape and assert `.data.status === 'ok'` on both publishes; re-ran `f19-trainer-deletion.test.ts` (2/2 passed), `f19-plan-activation.test.ts`, `f19-plan-delivery.test.ts`, `nutrition-publish.test.ts`, and `rls-catalog.test.ts` (4 files, 63/63 passed) on Stack D; re-ran the `plan_revisions.authored_by` -> `ON DELETE CASCADE` mutation on Stack D (`f19-trainer-deletion.test.ts:95` failed as expected), restored `ON DELETE RESTRICT`, verified `git diff --exit-code -- supabase` = 0, and re-ran `f19-trainer-deletion.test.ts` (2/2 passed).
