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
  - `permissions: contents: read`; no `secrets.*`; no deploy.
- [x] T013 [P] Commit only Supabase local config `supabase/config.toml` (+ its `.gitignore`) from `npx supabase init`; no migrations or seed data
- [x] T014 Unit-test the size-report's pure comparison function in `tests/unit/size-report.test.ts` (under, equal and over the limit → exit code)
- [x] T015 Run all Windows-capable quickstart steps; fix failures; run `npm run format`

**Review B3:** Windows gates + workflow inspection. `build:edge`/`size` are verified in Linux CI after the PO authorizes a push.

## Batch 4: S32 cross-branch migration-version guard (amendment, 2026-11-04)

- [x] T019 [US6] [FR-020, SC-010] Add the opt-in `--all-remote-refs` cross-branch mode to `scripts/check-migration-timestamps.mjs` plus the `check:migration-versions:remote` npm script: enumerate `refs/remotes/origin` via `git for-each-ref` (excluding symbolic `refs/remotes/origin/HEAD`), list each ref's `supabase/migrations` via `git ls-tree` (no checkout), exit non-zero reporting version + both filenames + carrying refs when one 14-digit version maps to two different filenames; same filename on several refs passes; default in-tree mode and CI unchanged; unit tests with an injected ref-listing function, RED first then GREEN. (S32-R3, S32-PO-3 "prevent future duplicates".) Tests executed and passed on the implementation commit (see traceability.md).

## S39 required integration-check aggregator

- [x] T023 [FR-022, FR-023] Rename the matrix job id to `integration-shard` without changing the three display names; add the `integration` always-run success aggregator; extend `tests/unit/ci-local-e2e.test.ts` with a red-first contract test; update the authoritative required-check descriptions in the constitution and CI documentation; record focused test evidence in traceability.md after the test passes.

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

- [ ] T020 [FR-021, FR-023] Add verified manual dispatch runs to CI with exact merge-result parent validation, same-repository head checks before dependency installation in secret-bearing jobs, and no-cancel concurrency; preserve PR/push behavior and read-only permissions.
- [ ] T021 [FR-022] Shard all integration tests into three Vitest shards with unchanged per-shard stack setup and confirm shard union equals the full test list.
- [ ] T022 [FR-023, FR-024] Update constitution 1.10.0, workflow guide, decision register, and gate-check d for trusted dispatch provenance (base-branch workflow and matching merge-result workflow blob), parallel full-run provenance, standing approval, and the constitution PR exception while retaining gates a-c/e-h and all security requirements.

Tasks remain unchecked until tests and exact-head GitHub gate evidence are recorded.
