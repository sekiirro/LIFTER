# PI-03 performance baseline — 2026-11-27 (slice 1)

**Status: BASELINE + PROPOSED BUDGETS ONLY. NOT A GATE.** Per S71-PO-7 / FR-007, no pass or fail is asserted. The proposed per-route p95 latency and error budgets below become a readiness gate only after the PO signs them; PI-03 stays Open until then.
**Authority**: S71-PO-1, S71-PO-7, S70-PO-1 item N, S71-R10 (synthetic data; no legacy-data handling).

## 1. Run identity and environment

| Field                                  | Value                                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run (UTC)                              | 2026-11-27T10:45:25Z (recorded run; one prior warm-up run discarded)                                                                                                                         |
| Machine target                         | Local non-production Stack D (Docker Desktop), Next dev server, loopback `127.0.0.1:3000`                                                                                                    |
| Hosted target                          | **Not used** — pending PI-04 approval (ND-F8-2/3)                                                                                                                                            |
| Data                                   | Synthetic only; no real client records, no secrets                                                                                                                                           |
| CPU p50/p95/max                        | **Not available locally** (platform request logs only); pending hosted run                                                                                                                   |
| Tooling                                | spec 008 `http-probe.mjs`, `lib/stats.mjs`, `lib/pilot-volumes.mjs` (all unmodified) orchestrated by `scripts/free-tier/baseline-031.mjs` (orchestration only — no duplicate load generator) |
| Raw output                             | [perf-baseline-2026-11-27.json](perf-baseline-2026-11-27.json)                                                                                                                               |
| Route matrix (recorded before the run) | [perf-route-matrix.json](perf-route-matrix.json)                                                                                                                                             |

Reproduction (Stack D held; `supabase-safe.mjs` env injection):

```
node scripts/free-tier/baseline-031.mjs \
  --routes specs/031-security-performance-readiness/reports/perf-route-matrix.json \
  --n 20 --concurrency 2 \
  --json specs/031-security-performance-readiness/reports/perf-baseline-2026-11-27.json
```

## 2. Pilot volumes (spec 008 / S31-PO-4 inputs, preserved without duplication)

Inputs: 2 workspaces; 150 clients/workspace; 2 staff/workspace; 2 plans/client; 2 new plan versions/client/month. Derived: 2 workspaces, 300 clients, 4 staff memberships, 600 plans, 600 new plan versions/month. Synthetic fixtures seeded on Stack D matched these counts exactly: `workspaces=2, clients=300, workspace_memberships=4, plan_roots=600, plan_revisions=600`. Items the offline projection cannot verify (distinct staff total, auth rows, plan-kind split, audit/job volume, bytes per row) remain recorded as `UNVERIFIED` in the JSON; none is guessed.

## 3. HTTP route baseline (20 requests/route, concurrency 2)

| Surface / route                                 | p50 (ms) | p95 (ms) | Statuses | Median bytes | **Proposed p95 budget (ms)** | **Proposed error budget** |
| ----------------------------------------------- | -------- | -------- | -------- | ------------ | ---------------------------- | ------------------------- |
| `/api/health` (mobile web health)               | 14.74    | 45.09    | 200 ×20  | 33           | 200                          | ≤1%                       |
| `/login` (mobile web auth)                      | 72.72    | 95.37    | 200 ×20  | 127142       | 200                          | ≤1%                       |
| `/auth/recovery` (mobile web auth)              | 80.55    | 92.29    | 200 ×20  | 125863       | 200                          | ≤1%                       |
| `/clients` (client directory shell)             | 13.32    | 16.27    | 307 ×20  | 22           | 200                          | ≤1%                       |
| `/clients?page=1&pageSize=50` (pagination)      | 14.48    | 16.27    | 307 ×20  | 49           | 200                          | ≤1%                       |
| `/clients?query=Pilot` (filtering)              | 14.82    | 16.07    | 307 ×20  | 38           | 200                          | ≤1%                       |
| `/workspaces` (workspace/staff directory shell) | 14.79    | 16.49    | 307 ×20  | 25           | 200                          | ≤1%                       |
| `/reports` (reports shell)                      | 13.56    | 16.75    | 307 ×20  | 22           | 200                          | ≤1%                       |
| `/welcome` (client portal mobile web shell)     | 14.93    | 16.61    | 307 ×20  | 22           | 200                          | ≤1%                       |

Authenticated data-path routes return the unauthenticated shell/redirect (307) because spec 008's probe sends no credentials (FR-003). The actual data-path measurement at pilot volumes requires the PI-05 dedicated test-account approval; the DB query classes below cover the data path at pilot volumes with a synthetic Platform Owner identity.

## 4. Data-path query classes at pilot volumes (synthetic PO identity, 20 requests, concurrency 2)

| Query class (surface)                       | p50 (ms) | p95 (ms) | max (ms) | Errors | Median bytes | Throughput (rps) | **Proposed p95 budget (ms)** | **Proposed error budget** |
| ------------------------------------------- | -------- | -------- | -------- | ------ | ------------ | ---------------- | ---------------------------- | ------------------------- |
| `directory_page_1` (client list)            | 11.41    | 13.32    | 29.29    | 0      | 14286        | 148.1            | 100                          | ≤0.5%                     |
| `directory_page_6` (pagination, offset 250) | 23.40    | 26.63    | 27.42    | 0      | 47           | 83.0             | 100                          | ≤0.5%                     |
| `directory_search_filter` (filtering)       | 11.26    | 15.32    | 15.67    | 0      | 14288        | 157.4            | 100                          | ≤0.5%                     |
| `directory_approval_filter` (filtering)     | 10.00    | 13.17    | 15.73    | 0      | 14286        | 182.3            | 100                          | ≤0.5%                     |

## 5. Proposal formula (not a gate)

- HTTP p95 budget = measured p95 × 2, rounded up to the next 50 ms, floor 200 ms. Error budget = 1% of requests.
- DB p95 budget = measured p95 × 2, rounded up to the next 25 ms, floor 100 ms. Error budget = 0.5%.
- The headroom factor is a documentation proposal, not an approved SLO. **PI-03 remains Open; no route is labeled pass or fail until the PO signs these values.** After signature, the same reproducible run is compared to the signed budgets (T008, deliberately not implemented in this slice).

## 6. Limitations / honest gaps

- Local Next **dev** server: cold-compilation inflated the warm-up run; the recorded run followed a warm-up and is the single dated baseline. Hosted timings/CPU remain pending PI-04.
- Anonymous probe cannot exercise authenticated page data; see §3.
- Proposed budgets are derived from a local smoke baseline at pilot-volume data; they are not validated against hosted free-tier limits.
- No production target, real client data, secrets, vendor, budget or engagement is involved. No `docs/13` row was changed or marked Done.
