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
  - Gzip the emitted bundle with Node zlib and sum the sizes.
  - Compare against `WORKER_SIZE_LIMIT_KIB`, defaulting to the free-tier compressed limit from https://developers.cloudflare.com/workers/platform/limits/ (value + URL in a comment; if unverifiable, 3072 with a printed warning).
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

## Dependencies

B1 → B2 → B3. One writing agent at a time.
