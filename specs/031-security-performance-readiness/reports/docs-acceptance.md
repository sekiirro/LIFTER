# P8 docs acceptance (T002, T006, T009, T010)

Docs-only verification for spec 031. No tests, production actions or measurements were run by this spec.

## T002 / T006 Spec 008 measurement matrix and routes

- **Preserved volume assumptions**: Reuses existing spec 008 illustrative pilot inputs (2 workspaces; 150 clients/workspace; 2 staff/workspace; 2 plans/client; 2 new plan versions/client/month) from `specs/008-free-tier-validation/spec.md` (ND-F8-1 / S31-PO-4) and `scripts/free-tier/lib/pilot-volumes.mjs` without duplication.
- **Applicable routes list**: Recorded in `specs/031-security-performance-readiness/reports/perf-route-matrix.json` and `specs/031-security-performance-readiness/reports/perf-baseline-2026-11-28.md`:
  - `/api/health` (mobile-web/health, public)
  - `/login` (mobile-web/auth, public)
  - `/auth/recovery` (mobile-web/auth, public)
  - `/clients` (client directory, authenticated-shell)
  - `/clients?page=1&pageSize=50` (client directory/pagination, authenticated-shell)
  - `/clients?query=Pilot` (client directory/filtering, authenticated-shell)
  - `/workspaces` (workspace/staff directory, authenticated-shell)
  - `/reports` (reports, authenticated-shell)
  - `/welcome` (client portal mobile web, authenticated-shell)
- **Exact command paths**:
  - Baseline execution: `node scripts/free-tier/baseline-031.mjs --routes specs/031-security-performance-readiness/reports/perf-route-matrix.json --server-mode next-start-production --n 20 --concurrency 2 --json specs/031-security-performance-readiness/reports/perf-baseline-<YYYY-MM-DD>.json`
  - Probe-only execution: `node scripts/free-tier/http-probe.mjs --base-url http://127.0.0.1:3000 --routes <extracted routes array JSON> --n 20 --concurrency 2 --json specs/031-security-performance-readiness/reports/perf-probe-<YYYY-MM-DD>.json`
- **Input paths**: `specs/031-security-performance-readiness/reports/perf-route-matrix.json`
- **Output paths**: `specs/031-security-performance-readiness/reports/perf-baseline-<YYYY-MM-DD>.json`, `specs/031-security-performance-readiness/reports/perf-baseline-<YYYY-MM-DD>.md`

## T009 verification

- Every FR-001..FR-010 maps to PT-01 or PI-03 (see `traceability.md` FR table).
- Each relevant role (Platform Owner, Workspace Owner, Trainer, Sales, Client, anonymous) has explicit positive and negative coverage in `coverage-map.md`, tied to `docs/02-architecture.md:35-49`.
- Evidence artifacts are sanitized: `pen-test-readiness.md` section 2 reporting, `coverage-map.md` lifecycle, `evidence-index.md` sanitization rule; no secrets or client data committed.
- All prior production gates remain unchanged and independently required: `pen-test-readiness.md` section 7 reconciliation; no `docs/13` row marked Done.
- Acceptance rows include full FR clauses: `spec.md` FR Acceptance Matrix.

## T010 validation

- Docs links and formatting validated via Prettier `format:check` and `format-check-changed.mjs` on changed files.
- No tests, production actions, or benchmark tools were run by this spec.
- Vendor and timing selection remain deferred until after the pilot (S71-PO-7).
- Performance budgets remain proposed/unsigned (PI-03 post-pilot) and are not marked signed or passed by this PR.
