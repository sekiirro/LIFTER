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

For the S33 CI optimization, the workflow will run push events only on `main`, retain pull request checks, cancel superseded pull request runs without canceling main pushes, and omit the unused Playwright browser installation from `validate` after confirming no validate step uses a browser. The `storage` job and its independent required result remain separate. The `integration` and `validate` jobs retain their current names and all other steps and pinned actions remain intact.

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

## S33 CI optimization plan

- Keep the workflow on GitHub-hosted `ubuntu-latest` runners.
- Set the push branch filter to `main`; retain the `pull_request` trigger.
- Add top-level concurrency grouping by PR number for pull requests. Give each push run a unique group containing its ref and run ID; set cancellation true only for `pull_request` events. This prevents GitHub from replacing a pending main run in a shared concurrency group.
- Inspect every `validate` step for browser use. If none uses a browser, remove only the Playwright browser install from `validate`.
- Preserve job names `validate`, `integration`, and `storage`; leave Storage separate and required. Preserve every other step and existing action pin.
- Update docs/08-agent-workflow.md in the same PR and include all workflow changes in the PR description.
- Validate with actionlint and the authorized diff secret scan with positive control; then use the required hosted CI/CodeRabbit review gates on the exact PR head. No merge is part of this plan.

## Complexity Tracking

None.
