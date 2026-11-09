# Implementation Plan: Project Scaffold & CI Baseline (P0-F1)

## S38-PO-7 CI and merge-gate amendment (2026-11-09)

Implement FR-021..FR-024 and SC-011..SC-013 in the existing CI baseline. Add a `workflow_dispatch` trigger with required PR number and full head SHA inputs. Dispatch runs use a unique run-scoped concurrency group, check out the PR merge ref, print PR/head/merge SHAs, and fail before test work unless `HEAD^2` equals the supplied SHA. In all secret-bearing jobs, reject fork PR dispatches before dependency installation or execution of untrusted PR code. Preserve pull-request and main push behavior and `contents: read` permissions. Shard the existing full Vitest integration selection into three disjoint groups using the existing stack setup for each shard; do not remove or weaken any test or security step. Update gate-check d to count successful, executed PR attempts or exact-head dispatch runs, recording run IDs and sources; dispatch provenance must use the PR base branch's trusted workflow and require its workflow blob to match the tested merge result. Leave gates a-c and e-h unchanged. Document the constitution exception and standing approval protocol in the constitution, workflow guide, decision register, and PR body. This amendment PR itself always needs explicit PO exact-SHA approval.

### Verification approach

List the complete Vitest integration suite and each shard locally; confirm pairwise disjointness and exact union. Use GitHub-hosted runs as authoritative for PR gates. Confirm event payload/merge SHA provenance and executed job steps for both event paths. Keep run evidence under `C:/Users/NEW LAP/.lifter/runs/s38-const110-ci`. The full Playwright browser suite remains required and runs once in shard 1; every shard retains the same Supabase setup and runs only its own Vitest file partition.

GitHub only accepts `workflow_dispatch` after the workflow exists on the default branch. This constitution PR uses sequential `pull_request` runs; dispatch-path proof is deferred until after an explicit PO exact-SHA approval and authorized merge. Do not merge this PR merely to test dispatch.

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
- Add top-level event-scoped concurrency grouping with PR number for pull requests. Give each push run a unique group containing its event name, ref, and run ID; set cancellation true only for `pull_request` events. This prevents GitHub from replacing a pending main run in a shared concurrency group.
- Inspect every `validate` step for browser use. If none uses a browser, remove only the Playwright browser install from `validate`.
- Preserve `validate` and `storage`; rename the shard matrix id to `integration-shard` while keeping its display name `integration shard ${{ matrix.shard }}/3`; add required aggregator id/name `integration` with `needs: [integration-shard]`, `if: always()`, and failure unless the matrix result is exactly success. Keep the aggregator on ubuntu-latest with contents: read and no checkout/secrets. Leave Storage separate and required. Preserve every other step and existing action pin.
- Update docs/08-agent-workflow.md in the same PR and include all workflow changes in the PR description.
- Validate with actionlint and the authorized diff secret scan with positive control; then use the required hosted CI/CodeRabbit review gates on the exact PR head. No merge is part of this plan.

## S39 required status-check correction

- Keep the three matrix shard executions and setup intact under job id `integration-shard`; retain the visible per-shard names.
- Add a light `integration` aggregator that runs after the matrix even when shards fail or are cancelled, returns failure for any matrix conclusion other than `success`, and compares all three shard revision tuples using unique shard-specific outputs. On PR and dispatch events, require PR/head/merge values; on main pushes, require a valid merge SHA while allowing empty PR/head values. Log the common revisions on success.
- Update the unit assertions, traceability, constitution, and workflow guidance so the required-check list includes the aggregator and each shard execution, and the aggregator compares each shard revision tuple and logs the same revisions as every required job.
- Test first by asserting the aggregator contract before workflow implementation, including a main-push case with empty PR/head values and a valid merge SHA.

## Complexity Tracking

None.

## S32 delta — cross-branch migration-version guard (2026-11-04)

Per architect ruling **S32-R3** (answering S32-PO-DECISION-1), the cross-branch migration-version guard is owned by this feature as a CI-baseline tooling amendment: the migration-timestamp checker already runs as the CI step "Validate migration timestamps" (CI baseline, FR-009 family), and a new numbered spec would consume a roadmap feature number. Spec placement is technical governance, not a product decision.

References: **FR-020**, **SC-010**, **US6**, **T019**. PO source **S32-PO-3** (verbatim, only "prevent future duplicates" in scope; the remainder is other lanes). Lane class **S32-PO-2 Q4** (low-risk tooling + tests).

### Changes (this amendment)

- `scripts/check-migration-timestamps.mjs`: new exported, unit-testable pieces - `findCrossRefVersionConflicts(refMigrations)` (pure), `checkRemoteRefs(listRefMigrations)` (injected ref-list), and (S32 round 2, CodeRabbit PR #54) the pure parsers `parseOriginRemoteRefs(refsOut)` (excludes only `refs/remotes/origin/HEAD`) and `parseMigrationTreeOutput(treeOut)` (parses `-z` NUL-delimited `git ls-tree` output) - plus an opt-in `--all-remote-refs` flag on `main`. The default in-tree mode is byte-for-byte behaviourally unchanged and performs no git or network access.
- `package.json`: new script `check:migration-versions:remote` = `node scripts/check-migration-timestamps.mjs --all-remote-refs`; new alias `test:unit` = `vitest run` (used by the S32 gate commands). `.github/workflows/ci.yml` is **not** modified; CI keeps running the default in-tree check.
- `tests/unit/migration-timestamps.test.ts`: RED→GREEN cross-ref cases with an injected ref-listing function (no real git in unit tests); existing in-tree tests unchanged. (S32 round 2 adds `remote-ref parsing helpers` cases for `parseOriginRemoteRefs` and `parseMigrationTreeOutput`, RED first then GREEN.)
- `specs/001-project-scaffold-ci/checklists/analyze.md`: created fresh for this amendment, dated 2026-11-04, 0 open CRITICAL/HIGH.

### Design decisions

- Enumeration: `git for-each-ref --format=%(refname) refs/remotes/origin`, excluding only the symbolic `refs/remotes/origin/HEAD` (other refs whose last segment is `HEAD`, e.g. `refs/remotes/origin/feature/HEAD`, are retained). Listing: `git ls-tree -r -z --name-only <ref> -- supabase/migrations` (no checkout; `-z` gives NUL-delimited unquoted paths so non-ASCII filenames are not dropped). No network calls beyond what the caller already fetched. Ref-list and tree-list parsing live in the exported pure helpers `parseOriginRemoteRefs` / `parseMigrationTreeOutput` so unit tests cover them without touching a real repository.
- Conflict rule: one 14-digit version mapped to two or more **different** filenames across refs ⇒ exit non-zero, reporting the version, both filenames and the carrying refs. Same filename on several refs ⇒ pass. Filenames that do not match the 14-digit pattern are ignored by the cross-ref check (they remain the in-tree validator's concern).
- `main` prints one report block per conflict; a summary line and exit 0 otherwise. Exit code 1 when at least one conflict exists.
- The cross-ref check is detection-and-fail only; it does not rename migrations, does not touch the working tree and does not alter CI behaviour. Running it against the real repo (after `git fetch`) is expected to flag `20261107030000` until the #44 rename lane lands; that output is recorded, not fixed, in this lane.
