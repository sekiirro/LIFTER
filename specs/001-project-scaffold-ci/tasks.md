# Tasks: Project Scaffold & CI Baseline (P0-F1)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [contracts/health.md](contracts/health.md), [quickstart.md](quickstart.md)
**Tests**: Requested by the spec (FR-004, FR-005). **No pages, layouts or UI** (PO: UI waits for Design System approval).

## Batch 1: Setup + tooling (Codex), then Claude review

- [x] T001 Create `package.json` (name `lifter`, version `0.1.0`, private, `"packageManager": "npm@11.17.0"`, `engines.node ">=24 <25"`, scripts `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `format:check`, `test`, `e2e`, `build:edge`, `size`), plus `.nvmrc` (`24`) and `.gitattributes` (`* text=auto eol=lf`)
- [x] T002 Install Next.js App Router + React + TypeScript, and create `tsconfig.json` (strict: true, noUncheckedIndexedAccess: true) and `next.config.ts` (injects `APP_VERSION` from package.json at build time)
- [x] T003 [P] Configure ESLint 9 flat config `eslint.config.mjs` (eslint-config-next, `--max-warnings=0`) and Prettier `.prettierrc` + `.prettierignore` (ignore `.next`, `.open-next`, `specs`, `docs`, `.specify`, `.claude`, `LIFTER_Claude_Files`)
- [x] T004 [P] Create `.env.example` (placeholder keys only) and extend `.gitignore` with `.open-next/`, `.wrangler/`, `test-results/`, `playwright-report/`, `next-env.d.ts`
- [x] T005 Add `@opennextjs/cloudflare` + `wrangler` (devDependencies); create `open-next.config.ts` and `wrangler.jsonc` (name `lifter-web`, `nodejs_compat`, **no account_id, no secrets, no routes**); script `build:edge` = `opennextjs-cloudflare build`
- [x] T006 [P] [US1] Configure Vitest in `vitest.config.ts` (node env, `tests/unit/**`, `passWithNoTests: false`)

**Review B1 (Windows):** `npm ci`, `typecheck`, `lint`, `format:check`; no UI files; no secrets.

## Batch 2: Health route + tests + README (Codex), then Claude review

- [x] T007 [P] [US3] Write unit test `tests/unit/health.test.ts`: payload has exactly the keys `status`, `version`; `status === "ok"`; version matches semver
- [x] T008 [US3] Implement the pure builder `lib/health.ts` and the route `app/api/health/route.ts` per [contracts/health.md](contracts/health.md) (GET only, `Cache-Control: no-store`; other methods return 405)
- [x] T009 [P] [US3] Configure Playwright in `playwright.config.ts` (Chromium, `webServer: npm run build && npm run start`) and write `tests/e2e/health.spec.ts` (200 response with exactly the 2 keys; POST returns 405)
- [x] T010 [US1] Write a README "Development" section in `README.md` (prereqs, commands, gate list, Linux-only edge checks, no-deploy note)

**Review B2 (Windows):** `test`, `build`, `e2e`, contract check.

## Batch 3: Size report + CI + Supabase config (Codex), then Claude review

- [x] T011 [US4] Implement `scripts/size-report.mjs`:
  - Run `wrangler deploy --dry-run --outdir <tmp>`; no login.
  - Sum the uncompressed size of all emitted modules (gzip shown for information).
  - Compare against `WORKER_SIZE_LIMIT_KIB`, defaulting to the official uncompressed Worker limit (64 MiB) from https://developers.cloudflare.com/workers/platform/limits/ (value + URL in a comment; if unverifiable, 3072 with a printed warning).
  - Print the result; exit 1 when over the limit.
- [x] T012 [US2] Create `.github/workflows/ci.yml`:
  - Triggers: push + pull_request; runs on `ubuntu-latest`.
  - Node from `.nvmrc`, npm cache.
  - Steps: `npm ci` → typecheck → lint → format:check → test → build:edge → size → install Playwright Chromium → e2e.
  - `permissions: contents: read`; `validate` requires no repository-configured secrets; on pull-request and push runs `actions/checkout@v4` uses GitHub-provided `github.token` with read-only `contents: read`, and the workflow also uses that token for read-only revision and dispatch metadata requests; the `integration` aggregator has no repository-configured secrets and no Docker Hub credentials, and its artifact download uses the GitHub-provided per-job `ACTIONS_RUNTIME_TOKEN`; only `integration-shard` and `storage` may use optional Docker Hub pull credentials, set as job-level environment variables available to every step in those jobs, for authenticated image pulls; no deployment secrets or deploy.
- [x] T013 [P] Commit only Supabase local config `supabase/config.toml` (+ its `.gitignore`) from `npx supabase init`; no migrations or seed data
- [x] T014 Unit-test the size-report's pure comparison function in `tests/unit/size-report.test.ts` (under, equal and over the limit → exit code)
- [x] T015 Run all Windows-capable quickstart steps; fix failures; run `npm run format`

**Review B3:** Windows gates + workflow inspection. `build:edge`/`size` are verified in Linux CI after the PO authorizes a push.

## Batch 4: S32 cross-branch migration-version guard (amendment, 2026-11-04)

- [x] T019 [US6] [FR-020, SC-010] Add the opt-in `--all-remote-refs` cross-branch mode to `scripts/check-migration-timestamps.mjs` plus the `check:migration-versions:remote` npm script: enumerate `refs/remotes/origin` via `git for-each-ref` (excluding symbolic `refs/remotes/origin/HEAD`), list each ref's `supabase/migrations` via `git ls-tree` (no checkout), exit non-zero reporting version + both filenames + carrying refs when one 14-digit version maps to two different filenames; same filename on several refs passes; default in-tree mode and CI unchanged; unit tests with an injected ref-listing function, RED first then GREEN. (S32-R3, S32-PO-3 "prevent future duplicates".) Tests executed and passed on the implementation commit (see traceability.md).

## S39 required integration-check aggregator

- [x] T023 [FR-022, FR-023] Rename the matrix job id to `integration-shard` without changing the three display names; add the `integration` always-run success aggregator that compares shard revision tuples, validates PR/head fields only on PR/dispatch events, and allows empty PR/head fields on main pushes with a valid merge SHA; extend `tests/unit/ci-local-e2e.test.ts` with a red-first contract test; update the authoritative required-check descriptions in the constitution and CI documentation; record focused test evidence in traceability.md after the test passes.

T020-T022 remain unchecked until their tests and exact-head GitHub gate evidence are recorded. T023 is verified by its focused regression test and traceability entry.

## Dependencies

B1 → B2 → B3. One writing agent at a time. T019 is independent of B1–B3 and lands after them as a CI-baseline tooling amendment.
B1 → B2 → B3. One writing agent at a time.

## S33 CI optimization tasks

- [x] T016 [FR-015, FR-016, FR-017] Restrict push CI to `main`; retain `pull_request`; add PR-number concurrency that cancels superseded PR runs and unique ref-plus-run-ID groups for main pushes.
- [x] T017 [FR-018] Verify validate has no browser-dependent steps, then remove only the unused Playwright browser installation from validate.
- [x] T018 [FR-019] Preserve separate required `storage` job and existing job names, pinned actions, and every other workflow step; update docs/08-agent-workflow.md and document workflow changes in the PR body.

Tasks remain unchecked until the exact PR head has the required executed green CI evidence and traceability evidence is recorded.

## S38 CI and merge-gate amendment tasks

- [x] T020 [FR-021, FR-023] Add verified manual dispatch runs to CI with exact merge-result parent validation, authenticated PR metadata lookup, same-repository head checks before dependency installation in secret-bearing jobs, and no-cancel concurrency; preserve PR/push behavior and read-only permissions. Evidence (S63): workflow clauses present on main (.github/workflows/ci.yml:7-20 dispatch inputs/concurrency, :67-97 validate revision gate, :171-205 shard gate, :587-617 storage gate; docs/08-agent-workflow.md:94,106). Verified manual dispatch runs on main at head `e50b553b646c000a9faaae53976bfca729205d20`: run `44049662655` and run `44049669467` (both `workflow_dispatch`, `main`), each with validate, integration shard 1/3, 2/3, 3/3, integration aggregator and storage all success and executed steps > 0 (docs-only skipped, PR-only by design). All 22 validate steps success in run 44049662655, so the revision gate (second-parent == head_sha, authenticated same-repo PR lookup, both before `npm ci`) executed and passed. Note: the brief's run ID `44049665525` does not exist (404); the verified ID is `44049662655`.
- [x] T021 [FR-022] Shard all integration tests into three Vitest shards with unchanged per-shard stack setup and confirm shard union equals the full test list. Evidence (S63): .github/workflows/ci.yml:155-156 three-shard matrix, :225 per-shard supabase setup, :453-464 Playwright partition/union checks, :541-553 Vitest union-equals-full-list checks; main CI run 43995126788 verified by lane via gh (integration shard 1/3, 2/3, 3/3 success with 23 steps each; integration aggregator success with 5 steps).
- [x] T022 [FR-023, FR-024] Update constitution 1.10.0, workflow guide, decision register, and gate-check d for trusted dispatch provenance (base-branch workflow and matching merge-result workflow blob), parallel full-run provenance, standing approval, and the constitution PR exception while retaining gates a-c/e-h and all security requirements. Status (S63): superseded by constitution 1.19.0 (.specify/memory/constitution.md:191), which reversed the constitution-PR exception (:172 standing approval now covers constitution/workflow/secrets PRs); gate-check d is off-repo (traceability.md:40 PENDING). Not done as written against 1.10.0. Close-out (S67-R1): ticked as delivered-historically and superseded — trusted dispatch provenance is in docs/08-agent-workflow.md:94,106,110 and .specify/memory/constitution.md:280, parallel full-run provenance in docs/04-changes-and-questions.md:38; superseded by constitution 1.15.0 (.specify/memory/constitution.md:337) and 1.19.0 (:191, :172); gate-check d stays off-repo.

## S40 Playwright e2e sharding tasks

- [x] T024 [FR-025, FR-026, SC-014, SC-015] Run the Playwright browser suite as a file-level `--shard=<k>/3` partition in every `integration-shard` execution with unchanged environment gates, `--workers=1`, no retries and the same preconditions; add the non-empty shard-list guard, Storage readiness and Docker CLI preconditions; upload per-shard Playwright/Vitest JSON inventories and reports; extend the no-checkout `integration` aggregator with the fail-closed union/skip/failure coverage proof; extend `tests/unit/ci-local-e2e.test.ts` red-first, update the workflow guide, and record traceability plus before/after wall times.

Tasks remain unchecked until tests and exact-head GitHub gate evidence are recorded.

## S41 documentation reconciliation

- [x] T033 [FR-009] Reconcile the CI credential boundary in the feature specification, plan, and research from merged workflow commit `9d24e6444aea5f72ce5dd00e13d3d25c979c8619`: `validate` requires no repository-configured secrets; on pull-request and push runs `actions/checkout@v4` uses GitHub-provided `github.token` with read-only `contents: read`, and the workflow also uses that token for read-only revision and dispatch metadata requests; the `integration` aggregator has no repository-configured secrets and no Docker Hub credentials, and its artifact download uses the GitHub-provided per-job `ACTIONS_RUNTIME_TOKEN`; only `integration-shard` and `storage` may use optional Docker Hub pull credentials, set as job-level environment variables available to every step in those jobs, for authenticated image pulls; no deployment secrets or deploy. Documentation only; no workflow change. Evidence (S63): reconciliation present verbatim in specs/001-project-scaffold-ci/spec.md:233, plan.md:148, research.md:15 from merged workflow 9d24e644; task requires no tests and no workflow change.

## S41 CI/CodeRabbit optimization tasks

- [x] T025 [FR-027, SC-016] Write unit tests for spec-consistency first (unknown FR/SC/task IDs, date freshness, decided pending-PO markers, valid case, multi-feature diff, untouched inconsistent feature ignored, touched feature missing tasks.md, changed-path enumeration error fails closed), execute RED, then implement `scripts/spec-consistency.mjs` changed-feature enumeration and wire it into validate. Evidence (S63): tests/unit/spec-consistency.test.ts:55-68 valid case, :109-133 unknown IDs, :135-164 stale-date/pending-PO markers, :178 multi-feature, :196 untouched-ignored, :208 missing-tasks.md, :292-302 enumeration fail-closed; scripts/spec-consistency.mjs enumeration; wired at .github/workflows/ci.yml:111; RED (8 failed/22 passed) + GREEN (35/35) recorded in traceability.md:106; main CI run 43995126788 validate success verified by lane via gh (spec-consistency.test.ts 36 tests passed, spec-consistency.mjs step executed).
- [x] T026 [FR-029, SC-017] Write table-driven docs-only path classification tests first (allow-list, disallowed paths, renames, empty/error input); execute RED, implement fail-closed classifier, then wire pull_request conditionals while dispatch remains full and aggregator rejects skipped integration. Evidence (S63): tests/unit/spec-consistency.test.ts:394-425 classification table (allow-list, disallowed workflow path, renames, empty/error/null fail-closed) + :427-441 filter assertions; scripts/spec-consistency.mjs:11,324 classifier + --classify-paths; .github/workflows/ci.yml:26-58 docs-only job, :140 + :571 PR conditionals, :278-301 aggregator rejects skipped; main CI run 43995126788 validate success verified by lane via gh (36 unit tests passed).
- [x] T027 [FR-028] Add CodeRabbit path_filters for generated evidence only and assert protected paths remain included. Evidence (S63): .coderabbit.yaml:3-6 excludes only generated evidence (`specs/**/reports/**`, `**/*.log`, `gate-*.json`); tests/unit/spec-consistency.test.ts:427-441 asserts the three filters present and no broad exclusions; main CI run 43995126788 validate success verified by lane via gh.
- [ ] T028 [FR-027, FR-029, SC-018] Verify the repository `format:check` scope plus the changed-file formatter (`scripts/format-check-changed.mjs`), preserve required job names, run local workflow/unit/static checks and prove this workflow-changing PR runs the full CI jobs. Status (S63): not done: static clauses present (scripts/format-check-changed.mjs, .github/workflows/ci.yml:59,139,278,570 required names) but the task requires proving "this workflow-changing PR runs the full CI jobs" — a run-bound process proof with no executable residue on main. What remains: an executed full-CI run on the workflow-changing PR head.
- [x] T029 [FR-030, SC-019] Amend Constitution 1.10.0 to 1.11.0 with docs-only three-dispatch green form and sync impact report; no other principle changes. (Historical three-dispatch count superseded by constitution 1.15.0, S54-PO-4.) Status (S63): superseded: the 1.10.0 to 1.11.0 amendment was made (.specify/memory/constitution.md:280) but its three-dispatch green form was superseded by constitution 1.15.0 (:337; spec.md:255 records the single-dispatch current form); current version is 1.19.0. Close-out (S67-R1): ticked as delivered-historically and superseded — amendment and sync impact report landed 2026-11-09 in commit db558c3e1cc881182471a5c13784fccc30a8ea7d (PR #75) at .specify/memory/constitution.md:280; three-dispatch form superseded by 1.15.0 (:337), version by 1.19.0 (:191, :379).
- [x] T030 [FR-030] Write `s41-luna-ci-opt3/gate-check-d-proposal.md` and matching patch outside the repository; do not edit gate-check.mjs. Status (S63): not done: off-repo proposal by design, so no evidence can exist on main (nothing matching under specs/ or repo root). Close-out (S67-R1): ticked as delivered-historically and superseded — artifacts exist off-repo at `C:/Users/NEW LAP/.lifter/runs/s41-luna-ci-opt3/gate-check-d-proposal.md` + `gate-check-d.patch` (sha256 recorded in traceability.md), producer report confirms gate-check.mjs was not edited; the three-dispatch form was superseded before adoption by constitution 1.15.0 (.specify/memory/constitution.md:337) and the shipped one-attempt gate-check rule (gate-check.mjs:801-805).
- [ ] T031 [FR-027, FR-028, FR-029, FR-030] Complete pre-request checklist, CodeRabbit review (max 2 requests; incremental first request per S41-R13), fix all valid findings in one push, then exact-head approval and sequential executed PR reruns. Status (S63): not done: PR-process task with no executable residue on main (no checklist/review/rerun record exists on main). What remains: the full review-and-rerun sequence on a PR head.
- [ ] T032 [FR-030] Run gate-check on final exact head; record expected gate e failure. Do not merge. Status (S63): not done: run-bound process task with no executable residue on main. What remains: a gate-check run on a final exact head with the recorded expected gate-e failure.

> NOTE (s47 fix): the `T025 [FR-009]` reconciliation task above was renumbered to `T033 [FR-009]` (unused id) to resolve the duplicate with `T025 [FR-027, SC-016]`; the s46 verbatim-merge note above is retained as history.

- [ ] T034 [FR-009] CI-1: pull Supabase images from GHCR (S50-PO-6 CI=A; S51-R9): add SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io to both Supabase-starting job env blocks; keep -x inbucket (mailpit runs; S51-R9 reversal). Evidence pending greens on PR #92. Status (S63): not done: GHCR env present on main (.github/workflows/ci.yml:164,580; -x inbucket :225,:633) but the task explicitly requires "Evidence pending greens on PR #92", which is not on main; traceability.md:18 IMPLEMENTED (pending verification). What remains: PR #92 green-run evidence.
