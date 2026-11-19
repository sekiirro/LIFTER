# T051 mutation verification — PR1b candidate

Initial mutation SHA: `4ed4dad8a009891734f587573fe4fb2637cdb6fe`. Post-merge candidate SHA: `d6749eadbac13decde924eb4d7dc51adaa4c886b` (`git rev-parse HEAD`). PR #270 merged at `2026-11-19T02:14:11Z`; origin/main `8d37c116276f54723f8dd9880f7cde3def0c7b3e` was merged into this branch.
Tools: Node v24.19.0; Vitest 5.1.0; Supabase CLI 2.122.0; PostgreSQL image `public.ecr.aws/supabase/postgres:17.11.0.006`.
All database runs used Stack D through `supabase-safe.mjs`, with the lane migration junction and client-account provisioning after each reset. Browser/app origin was port 3104. Hook deliveries were local only; the accepted test request delivered only to `staff-reset@example.test` in local capture. No built-in SMTP or external recipient was used. No migration version was added.

## RED → restore → clean diff → GREEN

| Control                 | Mutation                                                                | RED assertion                                                                                                                        | Restoration and GREEN                                                          |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Authorization           | `isEligibleStaffRole` temporarily returned `true`.                      | New unit case `authorizes only staff roles for reset delivery`: client expected false, got true.                                     | Restored; `git diff --exit-code` 0; `tests/unit/staff-reset-hook.test.ts` 7/7. |
| Hook authentication     | Signature verifier temporarily returned true after parsing.             | `rejects a changed body, stale timestamp, or malformed secret` failed on changed body.                                               | Restored; diff 0; unit 7/7.                                                    |
| Recipient authorization | Approved-recipient predicate temporarily returned true.                 | `allows only the PO-approved local test recipient` failed for `outside@example.test`.                                                | Restored; diff 0; unit 7/7.                                                    |
| Audit-before-send       | Route temporarily skipped `staff_password_reset_hook_audit`.            | Stack D integration `audits before sending one email to the approved local test recipient` failed because `audit_written` was false. | Restored; diff 0; after clean reset/provision, targeted integration 1/1.       |
| Audit transition        | Removed the requested-audit insert from the T044 migration's audit RPC. | Schema suite killed it: audit-once and injected audit-insert-failure cases failed (2 failed, 4 passed).                              | Restored; diff 0; reset/provision; schema integration 6/6.                     |
| Account limit           | Changed `target_count >= 5` to `>= 4`.                                  | Schema account/delivery-boundary case failed (1 failed, 5 passed).                                                                   | Restored; diff 0; reset/provision; schema integration 6/6.                     |
| Global limit            | Changed `global_count >= 10` to `>= 9`.                                 | Schema global-boundary case failed (1 failed, 5 passed).                                                                             | Restored; diff 0; reset/provision; schema integration 6/6.                     |

Candidate-head GREEN: `tests/unit/staff-reset-hook.test.ts` 7/7; `tests/integration/staff-reset-hook.test.ts` 5/5; `tests/integration/staff-reset-hook-schema.test.ts` 6/6. The route audit mutation also had an intermediate GREEN attempt fail from its prior delivery reservation; the database was reset and reprovisioned before the recorded 1/1 clean GREEN.

## Incomplete controls / disposition

T051 also requires mutation evidence for the session-bound reset intent/guard and successful-reset session revocation. This candidate has no staff-reset intent/guard/reconciliation migration, implementation, or corresponding reset-flow tests; the T050a controls are absent. Existing generic recovery/session tests do not exercise those staff-reset controls. Those two T051 clauses remain unverified. T051 and T050b remain unchecked; this report does not claim full acceptance.

MCQ-1 — Where should the remaining T051 mutations run? (1) On the later candidate that includes the approved T050a guard/intent and staff-session-revocation implementation and tests (recommended); (2) expand this PR1b branch to include that implementation after explicit scope approval. Blocked: complete T051 acceptance and any push/open-PR step.

## Post-merge acceptance and exact-head evidence

On d6749eadbac13decde924eb4d7dc51adaa4c886b, post-merge gates passed: lint, typecheck, changed-file format, full format, and full unit (TZ=Africa/Cairo: 356 files; 3,989 passed, 24 expected failures). Stack D touched integration passed: schema 6/6 and hook 5/5. The unit authorization, signature, and recipient mutations were rerun on this exact head; each was killed, restored, verified by git diff --exit-code, then unit 7/7 passed. Route audit, SQL audit transition, account limit, and global limit mutations were performed on 4ed4dad8a009891734f587573fe4fb2637cdb6fe; git diff --exit-code 4ed4dad8a009891734f587573fe4fb2637cdb6fe HEAD -- app/api/internal/staff-reset-hook/route.ts lib/auth/staff-reset.ts lib/auth/staff-reset-hook.ts supabase/migrations/20261215040000_staff_password_reset_hook_limits.sql tests/integration/staff-reset-hook.test.ts tests/integration/staff-reset-hook-schema.test.ts passed, confirming those tested files are unchanged at the post-merge head.

All-ref migration scan ran after fetching every
efs/pull/_/head into
efs/remotes/origin/pr/_; no migration filename in reserved range 20261216020000-20261216025959 exists across fetched refs. This lane added no migration.

T051 remains incomplete: session-bound reset intent/guard and successful-reset session revocation implementation and tests are absent. These clauses cannot be truthfully mutated on this candidate. No task is ticked, no push/PR1b was created, and MCQ-1 remains open. Branch is READY-UNPUSHED pending the scope/implementation decision.
