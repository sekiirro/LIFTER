# S27 T018 mutation evidence

Captured on Stack D at the clean pre-merge head `f42d4bc724f8f7e702cbe2507f984ece743e60d6`. The unmutated focused suite passed: 1 file, 2 tests.

## Executed mutant runs

Each run used the Stack D safe wrapper and `tests/integration/forms-purge.test.ts`. The test fixture's `probe()` wraps each case in a transaction and throws its rollback sentinel after the assertion body. SQL `CREATE OR REPLACE FUNCTION` changes were made inside that transaction, so the function replacement and synthetic fixture data rolled back together. No pushed migration or persisted database definition was changed. Each mutant command exited 1 because the expected invariant detected the mutant.

| Mutant | Executed test filter | Failing assertion or database guard | Observed failure |
| --- | --- | --- | --- |
| Start retention 60 days before deactivation | `-t 'starts retention'`, `F15_T018_MUTANT=start_clock` | `tests/integration/forms-purge.test.ts:146` | Retention window differed: `ended_at` was 2026-09-03 while authoritative deactivation was 2026-11-02; `purge_after` was correspondingly early. |
| Skip purge of submission intents | `-t closes`, `F15_T018_MUTANT=skip_sensitive` | `tests/integration/forms-purge.test.ts:303` | `app_private.form_submission_intents: expected 1 to be +0`. |
| Delete reusable form template | `-t closes`, `F15_T018_MUTANT=delete_template` | `tests/integration/forms-purge.test.ts:284` | Purge failed with `update or delete on table "forms" violates foreign key constraint "form_versions_workspace_id_form_id_fkey"`. |
| Delete audit row | `-t closes`, `F15_T018_MUTANT=delete_audit` | `tests/integration/forms-purge.test.ts:284` | Purge failed with `Audit events are immutable`. |
| Return a nonzero result on purge replay | `-t closes`, `F15_T018_MUTANT=replay` | `tests/integration/forms-purge.test.ts:315` | Second purge result did not match the expected zero revisions and drafts. |
| Accept direct `deactivation_reason` update | `-t closes`, `F15_T018_MUTANT=forge_reason` | `tests/integration/forms-purge.test.ts:340` | `promise resolved "undefined" instead of rejecting`. |
| Omit the immediate auth lockout row | `-t closes`, `F15_T018_MUTANT=no_lockout` | `tests/integration/forms-purge.test.ts:235` | Required joined deactivation/lockout fact was `undefined`. |
| Write a financial ledger row during closure | `-t closes`, `F15_T018_MUTANT=closure_ledger` | `tests/integration/forms-purge.test.ts:280` | Payment count changed from 1 to 2 around closure. |

Command template (the filter and mutant name shown in each row were supplied per run):

```powershell
$repoRoot = (Resolve-Path .).Path
$stackWorkdir = Join-Path $repoRoot 'supabase-stack-d'
$nodeDir = Split-Path (Get-Command node).Source
$env:SUPABASE_SAFE_CLI = "node `"$nodeDir/node_modules/npm/bin/npx-cli.js`""
$env:LIFTER_SUPABASE_STACK='d'
$env:F15_T018_MUTANT='<mutant>'
$safeWrapper = Join-Path $env:USERPROFILE '.lifter/tools/supabase-safe.mjs'
node $safeWrapper --workdir $stackWorkdir --stack D exec -- npm run test:integration -- tests/integration/forms-purge.test.ts --reporter=dot -t '<filter>'
```

Per-run console logs were kept outside the repository and are not retained as repository artifacts. The temporary mutation hooks were backed up, removed, and the source test file returned byte-for-byte to its pre-probe contents; `git diff -- tests/integration/forms-purge.test.ts` was empty afterward.
