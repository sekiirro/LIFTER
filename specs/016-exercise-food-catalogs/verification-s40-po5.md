# S40-PO-5 verification — no real data affected (S40 round 10)

Read-only check, run at head `c6d620b9ec47a2facf8bfac08ea654cd945514ac` (round 10 start) and re-checked for the spec commit `989e5de7`. Scope: tracked repo configuration, CI workflows, migrations, tests and fixtures. No `.env*`, credentials or secrets were read. Date: 2026-11-09 14:32 +02:00.

| Check | Evidence (file:line) | Result |
| --- | --- | --- |
| Linked or production Supabase project in committed config | `supabase/config.toml:1` `project_id = "lifter"`; the file has no `project_ref` or remote-project key | No linked remote project in tracked config |
| Link state location | `supabase/.gitignore` ignores `.temp/` (where a CLI link is stored); the worktree has no `supabase/.temp` | Link state is not tracked and was not read |
| CI secrets and remote calls | `.github/workflows/ci.yml:55-56` and `:109-110` (only `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`); `:80` and `:130` `supabase start`; `:100` and `:164` `supabase stop --no-backup`. No `supabase link`, `db push` or `--project-ref` in any workflow | CI only drives local stacks |
| Placeholder hosts in tests | `tests/unit/client-signup-session.test.ts:64` (`project.supabase.co`); `tests/unit/cron-rpc-timeout.test.ts:25` (`example.supabase.co`); `tests/unit/second-local-stack.test.ts:120` | Placeholder hosts only |
| Literal legacy exercise rows | No `supabase/seed.sql` tracked; `supabase/` holds `config.toml`, `.gitignore` and migrations only. Every insert into `exercises`, `exercise_versions`, `workspace_exercises`, `exercise_variations` sits inside a function body: `20261106110000_catalog_exercise_operations.sql:97-98, :133`; `20261106111000_catalog_workspace_exercise_operations.sql:50`; `20261106112000_catalog_variation_operations.sql:59`; `20261106123000_catalog_round3_fixes.sql:25` | No literal exercise data in migrations or seeds |
| Instructions text in tests | `tests/unit/exercise-library-actions.test.ts:170, :176-177` (literal "Existing instructions" in a unit test); no `instructions` text in `tests/fixtures` | Synthetic unit values |
| Email-like values in fixtures, migrations and tests | Scan of tests/fixtures, supabase/migrations, tests/unit, tests/integration: only `example.test` addresses (`tests/integration/client-accounts-fixture.ts:92`, `tests/integration/f14-banner/capture.mjs:273`) | Synthetic |
| Production use | `spec.md` line 245 "No production clients exist." (S36-PO-5). The S40-PO-1 architect mapping cites S38-PO-3 "production not in use" (architect words; not re-verified here) | Per PO record |

## Environments and what is NOT verified

| Environment | Status in this round |
| --- | --- |
| Local CI stacks (`supabase start` in `ci.yml`) | Disposable; no real data by construction |
| Any linked or deployed Supabase project | No link in tracked config. Contents NOT inspected: the link state is git-ignored (`supabase/.temp/`) and no target database was queried |
| Developer checkouts (including the PO checkout) | NOT inspected beyond the tracked tree |

## Conclusion

No repo-side evidence that real data is affected. Target-database verification was NOT performed in this round. S40-PO-5 says "Verify no real data is affected", so the T068 deletion gate (tasks.md) requires that verification against the target database before any legacy exercise row is deleted; if it cannot be established, the cutover stops. The PO also states that all legacy exercises are disposable agent-generated mock data (S40-PO-5).
