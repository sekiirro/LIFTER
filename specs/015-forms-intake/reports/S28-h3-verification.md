# S28 F15 h3 verification

- Branch: `015-forms-intake`
- Current pushed head: `efe2f99b634b8b6e8a2b528575c864eec9d33c96`
- Stack D only. No reset was run. StartedAt before and after: `2026-11-02T18:43:05.538142345Z`.
- After integration: 155 migration records, matching the 155 migration files; `cron.job` has 0 rows. `LIFTER_F15_SCHEDULER_E2E` remained unset.

## Main merge

- Merged `origin/main` (`ed88574ae09c722b1f6ded4fc0b66122bbeb4f13`) in commit `192f094fb1462758986e24251cd0de8a6e310662`; no rebase or force push.
- Conflicts: `components/shell/NavRail.tsx` and `eslint.config.mjs`. NavRail retained main's GlassSurface, scroll container, tooltip portal, and More filter. ESLint retained the broader `vendor/glisse/**` ignore. No documentation conflicts.
- `git diff --diff-filter=D origin/main HEAD` is empty. Migration timestamp validation: 155 files, 11 documented merged exceptions.
- PR #44 currently changes 369 files: 273 text files and 96 binary files, under CodeRabbit's 300-file limit.

## Copy approval

S28-PO-2 approved all new DRAFT strings in F15, F17, and F18 as written. The `forms.staffQuestionOptional` marker was removed from English and Arabic; pinned values are EN `Optional` and AR `اختياري`. The one-character expectation mutant failed at `tests/unit/forms-approved-copy-s27.test.ts:20` (`forms.staffQuestionOptional English: expected 'Optional' to be 'Optionxl'`) and was restored. T009 remains open for final acceptance evidence, not copy approval.

## Playwright reconciliation

- Before the selector fixes, the full branch run at `318af78` on port 3000 reported 261 passed, 29 failed, and 18 skipped. Its Forms failures were 22 cases: 8 default-starter, 13 builder, and 1 production-route case, matching the unresolved S27 h2 categories.
- Fixed the starter assertions to inspect localized collapsed question content, and fixed builder steps to target the active expanded question. The Forms production test now uses Playwright's configured `baseURL` for cookies and auth.
- Focused post-fix Forms browser run on Stack D: 23 passed, 0 failed. It covers the 8 starter cases, builder preview matrix, reorder/remove keyboard flow, and production Forms route.
- Package/registration focused run on Stack D: 20 passed, 5 failed. The remaining failures are the two PO package-management locales (generic unavailable state), two PO registration-management locales (404), and the late-issuance registration state (its expected Issue link is absent after the 404). These need server-side fixture/read-path root cause fixes.
- The exact `ed88574` main baseline could not be rerun on the same configured port because port 3000 remained occupied by a WSL relay after the branch run. The attempted baseline on 3100 is not valid for reconciliation because some tests use hard-coded port 3000 URLs. No baseline-only or branch-only total is claimed here.
- No assertions were weakened, skipped, or quarantined. T024 remains open; there is no final full-suite acceptance result for this head.

## Gates

| Gate | Result |
| --- | --- |
| Full default Stack D integration | 120 files passed; 1,595 passed, 2 expected skips; 813.51 s |
| Clean unit suite | 185 files; 2,296 passed |
| Lint | Passed |
| Typecheck | Passed |
| Format check | Passed |
| Build | Passed |
| Edge build | Passed |
| Secrets check | Passed |
| Size | Passed: web 8,711.13 KiB (13.29%); cron 11.76 KiB (0.02%) |
| Migration timestamps | Passed: 155 validated, 11 documented merged exceptions |
| `git diff --check` | Passed |
| Full Playwright | Not accepted: package/registration failures remain; current-main baseline unavailable on matching port |

## Task and review state

- T009 remains open pending full acceptance; its optional-question copy approval is complete.
- T029 remains blocked on its listed database prerequisites.
- T024 remains the final acceptance task and stays open.
- PR #44 is `UNSTABLE`, head `efe2f99b634b8b6e8a2b528575c864eec9d33c96`.
- CodeRabbit's prior request was skipped at 322 reviewable files. No new review request or 40-minute poll was made because final full Playwright acceptance is not green.
