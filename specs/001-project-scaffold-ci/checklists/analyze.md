# F1 001-project-scaffold-ci — Analyze (S32 cross-branch migration-version guard amendment)

**Date**: 2026-11-04 · **Pass**: spec ↔ plan ↔ tasks consistency review for the S32 amendment (FR-015, SC-006, US5, T016). **Implementation has NOT started** at this pass; a post-implementation revalidation addendum is appended after T016 lands (see the end of this file). **Ruling**: architect S32-R3 (answering S32-PO-DECISION-1) — ownership assigned to this feature as a CI-baseline tooling amendment; spec placement is technical governance, not a product decision. PO source: S32-PO-3 ("prevent future duplicates" only).

## Entry check (LIFTER Spec Kit gate, PO S29-PO-2)

- [x] spec.md has numbered FRs, measurable SCs and Given/When/Then acceptance scenarios for the touched scope — US5 acceptance scenarios 1–4; **FR-015** (opt-in cross-ref mode; default in-tree mode unchanged; no network beyond caller's fetch; HEAD excluded); **SC-006** (single-run report of every cross-branch conflict; exit non-zero; CI unchanged).
- [x] Clarifications recorded — `## Clarifications` session 2026-11-04 added to spec.md, citing S32-PO-3 (verbatim) and S32-R3, explicitly stating "**No open ambiguities.**"
- [x] plan.md covers the touched scope — new "S32 delta" section (changes, design decisions, non-goals).
- [x] tasks.md has a task ID for the work, tagged with its FR IDs — **T016** [US2] [FR-015, SC-006].
- [x] This analyze.md is dated after the last change to spec/plan/tasks (all edits 2026-11-04, this file created after them) with 0 open CRITICAL/HIGH findings.

## Findings

### Consistency (spec ↔ plan ↔ tasks)

- FR-015 maps 1:1 to plan.md "Changes" (script + npm script), to design decisions (enumeration via `git for-each-ref` on `refs/remotes/origin`, HEAD excluded; `git ls-tree -r --name-only` listing; no checkout; conflict rule = one version → ≥2 different filenames ⇒ exit 1; same filename on several refs ⇒ pass), and to tasks.md **T016** (implementation + RED→GREEN tests with injected ref-lister).
- SC-006 measures FR-015: single-run full report (not first-conflict-only), exit codes, in-tree CI output unchanged. T016's unit tests assert pass/fail paths; the real-repo run output is recorded in the S32 run report (expected `20261107030000` until the #44 rename lane lands — recorded, not fixed, per S32-PO-3 lane split).
- US5 "Independent Test" matches FR-015's command surface and SC-006's measurable outcome. Constitution check: no new dependency, no secrets, no deploy, no schema/migration/SQL changes — consistent with plan.md's constitution table (workflow gates row: this amendment strengthens the existing gate without bypassing anything).
- No existing 001 requirement is modified: diff is additive only (US5 added; FR-014→FR-015; SC-005→SC-006; new Clarifications session; new plan delta; new T016). FR-001..FR-014 and SC-001..SC-005 texts are untouched; CI behaviour (FR-009 binding) is preserved because the cross-ref mode is opt-in and `ci.yml` is not modified.
- Duplicate-owner check: no other spec references the checker for this scope (verified by the S32-PO-DECISION-1 investigation; zero hits under `specs/` before this amendment). `016-exercise-food-catalogs` release-gate citations are F16-local and unchanged.

### Issues

- **CRITICAL**: none.
- **HIGH**: none.
- MEDIUM (non-blocking, recorded): FR-015 intentionally does not fail on same-version/same-filename across refs (by design — those refs will converge on merge); residual risk of identical filenames with divergent content is out of scope for a filename/version guard and is noted in the run report. T016 ticks only after its tests execute and pass on the current head; traceability.md is written in the implementation commit.
- LOW (non-blocking): the cross-ref mode is advisory for local use (not wired into CI) by S32-R3 ruling; enabling it in CI would be a workflow change out of this amendment's scope.

## Verdict

**PASS — 0 CRITICAL, 0 HIGH.** Implementation of T016 is authorized.

## Post-implementation revalidation (2026-11-04, appended after commit `a1a4412`)

- T016 was ticked `[x]` in tasks.md only after its tests executed and passed: RED first (7 failed, functions absent — 2026-11-04 07:50), then GREEN (12 passed in `tests/unit/migration-timestamps.test.ts` — 07:51; full unit suite 141 files / 2018 tests passed — 07:51 and 07:52; typecheck, lint, format:check, check:migration-timestamps, check:secrets all green on the implementation head).
- spec/plan/tasks delta vs the pre-implementation pass: only the T016 checkbox flipped (commit `a1a4412`) and `traceability.md` was added (this commit); no requirement text changed. FR-015/SC-006/US5 are unchanged. Pre-implementation findings remain valid; none reopened.
- Real-repo verification (post `git fetch origin --prune`, not part of the unit suite): `npm run check:migration-versions:remote` exits 1 and reports `20261107030000` — `20261107030000_catalog_workspace_exercise_remove.sql` (`refs/remotes/origin/016-catalog-ui`) vs `20261107030000_f15_slider_middle_label_required.sql` (`refs/remotes/origin/015-forms-intake`). Expected until the #44 rename lane lands; recorded, not fixed (S32-PO-3 lane split). CI (`ci.yml`) is unchanged.
- **Revalidation result: PASS — 0 CRITICAL, 0 HIGH.** This file is dated after the last change to spec/plan/tasks (2026-11-04; tasks.md last changed in `a1a4412`, this addendum and traceability.md land after it).

## Post-implementation revalidation addendum 2 (2026-11-04, S32 round 2 — CodeRabbit PR #54 threads)

Two unresolved CodeRabbit threads on PR #54 were verified against the code and fixed in the round-2 commit:

- `PRRT_kwDOVYgYQ86zd7ao` (`scripts/check-migration-timestamps.mjs` line 125): the `!line.endsWith('/HEAD')` filter also dropped valid refs such as `refs/remotes/origin/feature/HEAD`. Fixed: ref enumeration now goes through the exported pure helper `parseOriginRemoteRefs`, which excludes **only** `refs/remotes/origin/HEAD` and retains every other ref including those ending in `/HEAD`. Finding valid — fixed, not dismissed.
- `PRRT_kwDOVYgYQ86zd7a3` (`scripts/check-migration-timestamps.mjs` line 135): `git ls-tree` without `-z` C-quotes paths with non-ASCII bytes, so quoted entries failed the `.sql` filter and same-version/different-filename pairs on such filenames could be missed. Fixed: `ls-tree` now runs with `-z` and output is parsed by the exported pure helper `parseMigrationTreeOutput` (split on NUL, basename, `.sql` filter, sort). Finding valid — fixed, not dismissed.

- Tests: `remote-ref parsing helpers` block added to `tests/unit/migration-timestamps.test.ts` (3 tests: HEAD-suffix retention + symbolic-HEAD exclusion; NUL-delimited non-ASCII parsing; empty output). RED first: 3 failed (`parseOriginRemoteRefs is not a function` / `parseMigrationTreeOutput is not a function`), 12 passed. GREEN: 15 passed in the file; full `npm run test:unit` 141 files / 2021 tests passed (was 2018) on the round-2 head before commit.
- spec.md unchanged: FR-015/SC-006 wording remains accurate (FR-015 does not pin the `ls-tree` quoting mode; the default in-tree mode is untouched and performs no git/network access). No requirement text, plan scope or tasks.md change; plan.md design-decisions/changes sections updated to name `-z` and the two parsers. tasks.md T016 wording remains accurate.
- Gates on the round-2 head (before commit): `test:unit` ✓ (2021), `lint` ✓, `typecheck` ✓, `format:check` ✓, `check:migration-timestamps` ✓ (111 migrations, 11 exceptions), `check:secrets` ✓ (exit 0; `.next` build output present). Real-repo scan after `git fetch origin --prune` (78 remote refs): `Cross-ref migration-version check passed across 78 remote refs; no version maps to different filenames.` exit 0. `20261107030000` now appears only on `refs/remotes/origin/016-catalog-ui` (`..._catalog_workspace_exercise_remove.sql`) — the F15 #44 rename lane has landed.
- **Revalidation result: PASS — 0 CRITICAL, 0 HIGH.** This file is dated after the plan.md / test / script edits (all 2026-11-04, this session).
