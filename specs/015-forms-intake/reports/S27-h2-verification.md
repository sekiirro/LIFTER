# S27 F15 h2 verification

- Branch: `015-forms-intake`
- Final verified/pushed head: `4b0e23e437ffb44feb38a84d91616c6b0260b340`
- Merge commit: `ef43123c6e67446c28d3ef00415e01ce1554cab4` (parents: F15 `9935263bc415ef380053048969fd8e8c4c57b893`, main `24694ffb731ae7e75c4ca5dcbae6ceb923fb1404`)
- Main tracked deletions: none (`git diff --diff-filter=D origin/main HEAD` empty).
- Migration checker on merged tree: 155 timestamps validated; 11 documented merged exceptions.

## Stack D replay

Stack D only was reset once, then the local Vault provisioner completed. After replay:

- `StartedAt`: `2026-11-02T18:43:05.538142345Z`
- Migration SQL files: 155; `supabase_migrations.schema_migrations`: 155; missing/extra versions: none.
- Latest recorded migration: `20261106124000`; F15 `20261104032200` and `20261104032300` precede F16 `20261106090000` onward.
- `cron.job`: 0. The scheduler opt-in variable was unset for all integration runs.
- Vault API-role isolation assertion: 2 passed.

## Gates

| Gate | Result |
| --- | --- |
| Full default Stack D integration at final head | 120 files passed, 1,595 passed, 2 expected skips; 641.10 s |
| Clean-environment unit at final code | 179 files passed, 2,258 passed |
| Lint | Passed |
| Typecheck | Passed |
| Format check | Passed after formatting merged locale files |
| Build | Passed |
| Edge build | Passed |
| Secrets check | Passed |
| Size | Passed: web 8,645.86 KiB (13.19%); cron 11.76 KiB (0.02%) |
| Migration timestamp check | Passed: 155 validated; 11 documented merged exceptions |
| `git diff --check` | Passed |

## Playwright reconciliation

Both full suites ran on Stack D with local-only API-key aliases and `LIFTER_E2E_ALLOW_HTTP=true`; no test assertion was weakened.

| Snapshot | Passed | Failed | Skipped | Failure classification |
| --- | ---: | ---: | ---: | --- |
| `origin/main` (`24694ff`) | 180 | 15 | 9 | 15 client-account/storage cases; all pass in the F15 run. |
| F15 merged head | 261 | 22 | 9 | 22 F15 Forms-only cases absent from main: 8 default-starter cases (starter question input not found), 13 builder cases (second question field not found after adding a health notice), and 1 production-route sign-in case (Email input not found). These remain unresolved for T024 final acceptance. |

Issue #41's seven historical PO/staff failures were not in either current failure list. The F15 run did not reproduce those exact failures. The baseline run's 15 failures did not overlap the 22 F15 Forms failures; no tests were changed to mask either set.

## Task status for PR

- T009 remains open only for the post-batch DRAFT key `forms.staffQuestionOptional`.
- T029 remains blocked by its listed prerequisites.
- T024 stays the final acceptance task and remains open; the F15 Forms Playwright failures above require reconciliation before acceptance.
- Executed T018 mutation evidence is in [S27-T018-mutation-evidence.md](S27-T018-mutation-evidence.md). All eight mutants were detected in rollback-scoped transactions.

The binding S27-R1 design is recorded in the architect ruling: Closure and Refund share the immutable deactivation timestamp and 30-day retention boundary, with reason derived from the authoritative operation. Closure uses the refund authority and idempotency/locking pattern, writes immediate auth lockout, and creates no financial rows. Refund remains the existing financial-reversal path. Retention uses deactivation time plus the operation row ID; purge preserves templates, financial ledger and audit events.