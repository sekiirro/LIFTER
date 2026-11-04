# Implementation Plan: Project Scaffold & CI Baseline (P0-F1)

**Branch**: `001-project-scaffold-ci` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-project-scaffold-ci/spec.md`

## Summary

This feature creates the LIFTER repository baseline on the approved Architecture v3 stack. It adds:

- a Next.js App Router app, built for Cloudflare Workers with the OpenNext adapter (no deploy)
- strict TypeScript, ESLint and Prettier
- Vitest unit tests and a Playwright smoke test
- a `/api/health` route
- Supabase CLI config (no schema)
- GitHub Actions CI
- a Worker-size report checked against the official 64 MiB uncompressed limit

Design decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.3 (strict; eslint-config-next requires <6.1), Node.js 24 LTS (pinned via `.nvmrc` + `engines`)
**Primary Dependencies**: Next.js (App Router), `@opennextjs/cloudflare`, `wrangler` (local build/dry-run only)
**Storage**: N/A. Supabase CLI `supabase/config.toml` only, with no migrations.
**Testing**: Vitest (unit), Playwright Chromium (e2e smoke)
**Target Platform**: Cloudflare Workers (free plan), modern browsers
**Project Type**: Single web application (repo root)
**Package manager**: npm 11 with a committed `package-lock.json` (already installed; no extra tooling)
**Performance Goals**: Uncompressed worker ≤ 64 MiB official limit (FR-008)
**Constraints**: $0; no secrets; no deploy; no Cloudflare/Supabase account calls; Windows and Linux parity (`.gitattributes` LF)
**Scale/Scope**: Baseline only; no business features

## Constitution Check

| Principle | Status |
|---|---|
| I Isolation | N/A (no tenant data). Health route exposes no data. ✅ |
| II Financial truth | N/A ✅ |
| III Governance | N/A ✅ |
| IV Approved scope only | Scope matches roadmap P0. No excluded features. ✅ |
| V Versioning | N/A ✅ |
| VI People decisions | N/A ✅ |
| VII Privacy | No secrets committed; `.env.example` holds placeholders only; health route returns no env. ✅ |
| VIII Design System UI | No UI at all; deferred to P0-F2 after PO approval. ✅ |
| IX Reliability | N/A ✅ |
| Platform constraints | Approved stack, $0, no deploy. ✅ |
| Workflow gates | Establishes the gates themselves. ✅ |

Post-design re-check: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-scaffold-ci/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── contracts/health.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
app/
└── api/health/route.ts      # GET → { status, version }; no pages/layout (UI waits for F2 approval)
lib/health.ts                # pure builder of health payload (unit-tested)
tests/unit/health.test.ts
tests/e2e/health.spec.ts
scripts/size-report.mjs      # wrangler dry-run → uncompressed size vs 64 MiB (gzip info)
supabase/config.toml         # supabase init output, no migrations
.github/workflows/ci.yml
open-next.config.ts
wrangler.jsonc               # no account_id, no secrets
next.config.ts  tsconfig.json  eslint.config.mjs  .prettierrc  .prettierignore
vitest.config.ts  playwright.config.ts
.nvmrc  .gitattributes  .env.example  README.md (dev section)
```

**Structure Decision**: A single app at the repo root. A monorepo isn't justified until a second deployable exists; the `telegram-webhook` and `cron` Workers arrive in later features and can live under `workers/` then.

## Complexity Tracking

None.

## S32 delta — cross-branch migration-version guard (2026-11-04)

Per architect ruling **S32-R3** (answering S32-PO-DECISION-1), the cross-branch migration-version guard is owned by this feature as a CI-baseline tooling amendment: the migration-timestamp checker already runs as the CI step "Validate migration timestamps" (CI baseline, FR-009 family), and a new numbered spec would consume a roadmap feature number. Spec placement is technical governance, not a product decision.

References: **FR-015**, **SC-006**, **US5**, **T016**. PO source **S32-PO-3** (verbatim, only "prevent future duplicates" in scope; the remainder is other lanes). Lane class **S32-PO-2 Q4** (low-risk tooling + tests).

### Changes (this amendment)

- `scripts/check-migration-timestamps.mjs`: new exported, unit-testable pieces — `findCrossRefVersionConflicts(refMigrations)` (pure) and `checkRemoteRefs(listRefMigrations)` (injected ref-list) — plus an opt-in `--all-remote-refs` flag on `main`. The default in-tree mode is byte-for-byte behaviourally unchanged and performs no git or network access.
- `package.json`: new script `check:migration-versions:remote` = `node scripts/check-migration-timestamps.mjs --all-remote-refs`; new alias `test:unit` = `vitest run` (used by the S32 gate commands). `.github/workflows/ci.yml` is **not** modified; CI keeps running the default in-tree check.
- `tests/unit/migration-timestamps.test.ts`: RED→GREEN cross-ref cases with an injected ref-listing function (no real git in unit tests); existing in-tree tests unchanged.
- `specs/001-project-scaffold-ci/checklists/analyze.md`: created fresh for this amendment, dated 2026-11-04, 0 open CRITICAL/HIGH.

### Design decisions

- Enumeration: `git for-each-ref --format=%(refname) refs/remotes/origin`, excluding the symbolic `refs/remotes/origin/HEAD`. Listing: `git ls-tree -r --name-only <ref> -- supabase/migrations` (no checkout). No network calls beyond what the caller already fetched.
- Conflict rule: one 14-digit version mapped to two or more **different** filenames across refs ⇒ exit non-zero, reporting the version, both filenames and the carrying refs. Same filename on several refs ⇒ pass. Filenames that do not match the 14-digit pattern are ignored by the cross-ref check (they remain the in-tree validator's concern).
- `main` prints one report block per conflict; a summary line and exit 0 otherwise. Exit code 1 when at least one conflict exists.
- The cross-ref check is detection-and-fail only; it does not rename migrations, does not touch the working tree and does not alter CI behaviour. Running it against the real repo (after `git fetch`) is expected to flag `20261107030000` until the #44 rename lane lands; that output is recorded, not fixed, in this lane.
