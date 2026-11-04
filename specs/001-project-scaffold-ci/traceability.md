# F1 Traceability — S32 cross-branch migration-version guard amendment (FR-015, SC-006)

Analyzed source commit: `a1a4412` (implementation). Tests executed locally on the implementation working tree before commit (2026-11-04). VERIFIED requires a concrete asserting test.

| Requirement | Task(s) | Test(s) (file::test name) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-015 (opt-in `--all-remote-refs` mode; no FR-009 regression) | T016 | `tests/unit/migration-timestamps.test.ts::cross-branch migration-version guard > fails when one version maps to two different filenames across refs`; `::passes when the same version and filename appear on several refs`; `::passes when no version overlaps across refs`; `::reports every conflicting version in a single run`; `::ignores filenames without a 14-digit version`; `::checkRemoteRefs uses the injected ref-lister and reports failure`; `::checkRemoteRefs passes when nothing conflicts` | Commit `a1a4412`; `npm run test:unit` 141 files / 2018 tests passed; in-tree mode run: `Validated 111 migration timestamps; 11 documented merged exceptions allowed.` | VERIFIED (unit) | The real-repo scan (`git for-each-ref` + `git ls-tree` against fetched `origin/*`) is exercised manually, not in unit tests (by design — unit tests inject the ref-lister); its output is recorded in the S32-pulse-migguard2 run report (flagged `20261107030000`, exit 1 — expected until the #44 rename lane lands). |
| SC-006 (single-run full report; non-zero exit; in-tree CI unchanged) | T016 | `::reports every conflicting version in a single run` (multiple conflicts all reported); `::checkRemoteRefs uses the injected ref-lister and reports failure` (non-zero path); `::checkRemoteRefs passes when nothing conflicts` (exit-0 path) | Commit `a1a4412`; real-repo run: `version 20261107030000 maps to different filenames across remote refs:` + both filenames + refs, exit 1; `ci.yml` unchanged in this amendment (default in-tree check only) | VERIFIED (unit + manual real-repo) | CI wiring of the cross-ref mode is intentionally out of scope (would be a workflow change; recorded in analyze.md). |

## Notes

- Default in-tree behaviour is covered by the pre-existing tests (`validateMigrationFilenames` block, unchanged: 5 passed before and after).
- Gate results on the implementation commit: typecheck ✓, lint ✓, format:check ✓, check:migration-timestamps ✓ (111 migrations), check:secrets ✓ (after `npm run build`, since the worktree had no client build output; fresh-clone default is exit 1 with "No client build directories found.").
- Existing `tests/unit/migration-timestamps.test.ts::migration timestamp validation` rows are untouched.
