# Implementation Plan: Free-tier Validation Prep (P0-F8)

**Branch**: `008-free-tier-validation` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

F8 adds four offline-safe Node scripts under `scripts/free-tier/`, each with pure, unit-tested cores, plus a report template and a runbook. Nothing deploys. The existing `npm run size` already covers the web Worker. F8 adds the cron Worker size to the same report and reuses `evaluate()` from `scripts/size-limit.mjs`.

## Technical Context

- **Language/Version**: Node 24 ESM scripts (`.mjs` + `.d.mts` types, the same pattern as `scripts/backup/lib`), TypeScript-checked tests
- **Primary Dependencies**: existing ones only (`postgres`, `wrangler` dry-run). No new packages.
- **Testing**: Vitest unit (pure cores). Reviewer runs against the local stack and a local `next start`.
- **Constraints**: no network writes, no cloud API calls, no secrets in output.

## Design

| Script | Input | Output | Safety |
|---|---|---|---|
| `scripts/free-tier/db-usage.mjs` | `FREE_TIER_DB_URL` env (never argv) | JSON + table: `pg_database_size`, the top 15 relations by `pg_total_relation_size` in `public`, `auth` and `app_private`, row estimates (`reltuples`) and exact counts for the tables listed in a `--count` allow-list; % of `--limit-mb` (default 500) | `begin read only` + `set transaction read only`; `statement_timeout 15s`; the URL is redacted with the backup `redact` helper on any error |
| `scripts/free-tier/http-probe.mjs` | `--base-url`, `--routes <file.json>` (`[{ "path": "/login" }]`), `--n` (default 20, max 200), `--concurrency` (default 2, max 5) | per route: status counts, p50/p95 latency ms, median bytes | `https:` or loopback `http:` only; no cookies or auth headers; `redirect: 'manual'`; query strings stripped from output |
| `scripts/free-tier/parse-tail.mjs` | a saved `wrangler tail --format json` file (JSONL) | per route (method + pathname, ids collapsed to `:id`): count, CPU p50/p95/max, wall p50/p95, outcome counts; flags `> limit` and `≥ 70%` | read-only file; prints no headers, query or log messages |
| `scripts/free-tier/project.mjs` | `--per-row <db-usage.json>`, `--volumes <volumes.json>` | projected bytes per table and total vs the limit; lists missing volume keys as `MISSING` and exits 2 when any are missing | pure |

Pure cores live in `scripts/free-tier/lib/{stats,routes,usage,projection}.mjs` with `.d.mts`. Unit tests: percentile math, route normalization (UUIDs and numbers → `:id`), threshold verdicts (`ok` < 70% ≤ `warn` ≤ 100% < `over`), URL safety, missing-volume handling, and output redaction.

Report template: `docs/06-free-tier-report.md` (Claude-authored). Rows per FR-007, with the columns Limit | Official value (source, date) | Measured/Projected | % | Source type | Verdict | Exit option.

Runbook: README section "Free-tier validation" covering offline steps now, plus post-approval steps (deploy is **not** documented as a command to run; it says "after PO approval, per the approval record").

## Constitution Check

| Principle | Status |
|---|---|
| IV Scope | Roadmap P0 spike. Use the S31-PO-4 illustrative pilot inputs (2 workspaces × 150 clients/workspace × 2 staff/workspace × 2 plans/client × 2 new versions/client/month), after schema/unit verification. ✅ |
| VII Privacy | No secrets or PII in output. The read-only DB session reads catalog stats and counts only, no row contents. ✅ |
| Platform | $0. No deploy or resource creation without PO approval (FR-001). ✅ |
| Workflow | Spec → Plan → Tasks. Codex implements, and Claude reviews. ✅ |

## Project Structure

```text
scripts/free-tier/{db-usage,http-probe,parse-tail,project}.mjs
scripts/free-tier/lib/{stats,routes,usage,projection}.mjs (+ .d.mts)
scripts/free-tier/routes.example.json, volumes.example.json
tests/unit/free-tier-*.test.ts
package.json scripts: free-tier:db, free-tier:probe, free-tier:tail, free-tier:project
docs/06-free-tier-report.md (Claude)
README.md section (Codex)
```

## Complexity Tracking

None.


## S41-R7 FR-006 evidence reconciliation

The traceability description records the existing limit: `scripts/free-tier/db-usage.mjs` supplies at most 15 relations, and omitted tables/database overhead mean full database projection coverage is not demonstrated. Keep FR-006 PARTIAL until that coverage exists. Documentation only; T013 tracks this record correction.
