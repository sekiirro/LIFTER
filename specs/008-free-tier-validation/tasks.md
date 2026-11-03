# Tasks: Free-tier Validation Prep (P0-F8)

**Input**: [spec.md](spec.md), [plan.md](plan.md) (Design is binding).

**Coder rules**:

- No new dependencies. No deploy, wrangler login, or cloud API calls.
- Never print secrets.
- Don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off).
- Codex sandbox: vitest with `--configLoader native --pool threads`.

**Task tag semantics:** FR/SC tags on tasks indicate implementation scope, not evidence ownership. The `traceability.md` matrix maps requirements and success criteria to cited assertions or controls; its task IDs identify evidence owners and may differ from scope tags.

## Phase 1: Foundational

- [x] T001 [P] `scripts/free-tier/lib/stats.mjs` + `.d.mts` (FR-004, FR-007):
  - `percentile(values, p)` uses nearest-rank and throws on an empty list or p outside 0–100
  - `verdict(value, limit)` → `'ok' | 'warn' | 'over'` (warn at ≥ 70%, over at > 100%)
  - `pct(value, limit)`
- [x] T002 [P] `scripts/free-tier/lib/routes.mjs` + `.d.mts` (FR-003):
  - `normalizeRoute(method, url)` drops query and hash, and replaces UUID segments and all-digit segments with `:id`
  - `assertSafeBaseUrl(url)` allows `https:` or `http:` on `localhost`, `127.0.0.1` or `[::1]` only

## Phase 2: US1 — Offline measurements

- [x] T003 [US1] `scripts/free-tier/lib/usage.mjs` + `.d.mts` holds the pure formatting of db-usage rows into a report object with `pct`/`verdict`. `scripts/free-tier/db-usage.mjs` (FR-001, FR-005, FR-007):
  - reads `FREE_TIER_DB_URL` from env only, and errors if it's passed on argv
  - uses `postgres` with `max: 1`, runs inside `sql.begin('read only', …)` with `set local statement_timeout = '15s'`
  - queries `pg_database_size(current_database())`, the top 15 relations in schemas `public`, `auth` and `app_private` by `pg_total_relation_size` (with `reltuples`), and exact `count(*)` only for the names in `--count a,b` that match `^[a-z_]+\.[a-z_]+$` and exist in `pg_tables` (quote identifiers)
  - flags: `--limit-mb` (default 500), `--json <out>`
  - error messages are passed through `scripts/backup/lib/redact.mjs`
- [x] T004 [US1] `npm run size` covers the cron Worker too: extend `scripts/size-report.mjs` to also dry-run `workers/cron/wrangler.jsonc` and print both sizes and both percentages. Keep the existing behavior and exit codes. Add or extend its unit tests if they exist (FR-007, SC-001).

## Phase 3: US2 — Post-approval tooling (runs offline in tests)

- [x] T005 [US2] `scripts/free-tier/http-probe.mjs` (FR-002, FR-003):
  - flags per plan; checks the URL with `assertSafeBaseUrl`
  - sends sequential batches up to the concurrency, with `redirect: 'manual'` and no credentials
  - records the status, the latency (`performance.now()`) and the body bytes
  - prints a table and writes `--json`
  - never prints the query string, headers or bodies
- [x] T006 [US2] `scripts/free-tier/parse-tail.mjs` (FR-002, FR-004):
  - reads a JSONL file of `wrangler tail --format json` events, skipping invalid lines and counting them
  - for each event, uses `event.request.method` + `url` → `normalizeRoute`, `cpuTime` and `wallTime` when present, and `outcome`
  - aggregates per route; `--cpu-limit-ms` (default 10)
  - prints no logs, exceptions text, headers or query
  - add `scripts/free-tier/fixtures/tail-sample.jsonl` with synthetic events

## Phase 4: US3 — Projection

- [x] T007 [US3] `scripts/free-tier/lib/projection.mjs` + `.d.mts` and `scripts/free-tier/project.mjs` (FR-006):
  - bytes per row = `total_bytes / max(reltuples, 1)` per table from the db-usage JSON
  - the volumes JSON maps table → expected rows; any table in the usage file without a volume is listed as `MISSING`
  - exit 2 if anything is missing
  - output the total vs `--limit-mb`
  - add `volumes.example.json` with every value `null` and a `_note: "ND-F8-1: pilot volumes NEEDS SOURCE CONFIRMATION"`
  - add `routes.example.json` listing `/login`, `/auth/recovery`, `/api/health`
- [x] T008 [P] Unit tests `tests/unit/free-tier-{stats,routes,projection,tail,db}.test.ts`. The tail test parses the fixture, and asserts that the output text doesn't contain a fixture header value, a query-string value or a log message (FR-001..FR-006, SC-003).

## Phase 5: Polish

- [x] T009 `package.json` scripts: `free-tier:db`, `free-tier:probe`, `free-tier:tail`, `free-tier:project`. The README section "Free-tier validation" covers (FR-001..FR-008, SC-001..SC-004):
  - offline steps
  - post-approval steps, worded "after PO approval"; no deploy command is given as a step
  - the env-only DB URL rule
- [x] T010 Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npx vitest run --configLoader native --pool threads` (FR-001..FR-008, SC-001..SC-004).

## Phase 6: Review (Claude)

- [x] T011 Re-run the gates. Run `free-tier:db` against the local stack and `free-tier:probe` against a local `next start`. Fill the offline rows of `docs/06-free-tier-report.md`. PR, CI, CodeRabbit (FR-001..FR-008, SC-001..SC-004).

## Dependencies

T001–T002 → T003, T005–T007. T008 after T001–T007. T004 is independent.
