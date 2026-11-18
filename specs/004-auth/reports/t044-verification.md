# T044 schema verification (S65-R57 PR1a)

Stack: D only (`lifter-stack-d`, API 45421, DB 45422). The integration suite uses a random UUID, writes no real identity data, and does not call Auth `/recover` or send email.

## RED

- Moved the uncommitted T044 migration out of `supabase/migrations/` and reset Stack D through the safe wrapper.
- Ran `tests/integration/staff-reset-hook-schema.test.ts`: 6 tests failed because the T044 RPCs/table were absent. This established the schema-dependent RED.
- Ran `tests/integration/client-accounts-provision.mjs` after reset; passed. No Vault values printed.

## GREEN

- Restored the migration and reset Stack D through the safe wrapper.
- Ran the client-account provisioning check after reset; passed. No Vault values printed.
- Ran `tests/integration/staff-reset-hook-schema.test.ts`: 6/6 passed. Coverage includes the five-per-account and ten-global request caps, separate two-delivery cap, denied-hook request counting, service-role-only RPCs, forced RLS, empty search path, duplicate hook IDs, one requested audit, and audit failure rollback.

## Mutation

- Mutated the per-account threshold from `target_count >= 5` to `target_count >= 4`, then reset Stack D and reran provisioning.
- The schema suite killed the mutation: the account/delivery-limit case failed on the fifth request (`rate_limited` instead of `delivery_limited`); the other 5 tests passed.
- Restored the threshold to 5, reset Stack D, reran provisioning, then reran the schema suite: 6/6 passed.

## Status

- T044 remains unticked because the later provider call is outside PR1a. Verified so far: the migration schema and its tests; Remaining: provider call with server-built `redirectTo` and T044a template in PR2.
- The migration is now named `20261130040000_staff_password_reset_hook_limits.sql` under the S65-PO-17 S65 block reservation `20261130040000-20261130045959`. It was previously verified under the old local-only timestamp; rerun stack D reset, provisioning, schema integration, and account-limit mutation after the rename.

## Final merged-base revalidation (2026-11-18)

- Fresh `origin/main` base: `201ef09bd550728ffccd37006eea7d72a5892a04`, including migration `20261124130000_f17_client_workout_projection.sql`.
- After reset and client-account provisioning, `tests/integration/staff-reset-hook-schema.test.ts` passed 6/6.
- The `target_count >= 5` to `>= 4` mutation was killed on this base by the per-account limit test; after restoring the migration, resetting, and provisioning, the suite passed 6/6.
- Full unit passed 323 files / 3,684 tests on this base. No email was sent by the schema tests.
- The migration has been renamed to `20261130040000` under the recorded S65 block reservation. Post-rename reset, provisioning, schema suite and mutation evidence are recorded below.

## Post-rename final revalidation (2026-11-18)

- Reset Stack D through the safe wrapper; migration 20261130040000_staff_password_reset_hook_limits.sql applied successfully.
- Ran ests/integration/client-accounts-provision.mjs after each of the post-rename resets; passed. No Vault values printed.
- ests/integration/staff-reset-hook-schema.test.ts: 6/6 passed with the restored threshold.
- Account-limit mutation lowering 5 to 4 was killed by the fifth request assertion (
  ate_limited instead of delivery_limited); restored threshold 5, reset, reprovisioned, and reran 6/6.
- No email was sent. Migration timestamp validation passed for all 312 local migrations.
