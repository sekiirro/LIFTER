# PI-03 performance baseline and signed budgets — 2026-11-28 (slice 2)

**Status: BASELINE AND BUDGETS SIGNED (S73-PO-4).** Per S73-PO-4 item 2 and architect ruling S73-R34, the performance budgets are signed from the local production-mode baseline measured on commit `ca2fbd15` (merged to main in `35faee5d`). Production capacity re-measurement is deferred to the pre-launch checklist on lifter-prod (PI-04).
**Authority**: S71-PO-1, S71-PO-7, S70-PO-1 item N, S71-R10, S73-PO-4, S73-R34.

## 1. Run identity and environment

| Field                 | Value                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Run (UTC)             | 2026-11-28T01:14:15.646Z (measured in lane `s73-hungerg-measure031`)                                                               |
| Commit / harness head | `ca2fbd15d39269f238885111042c6d747ef18ea7` (PR #379; merged to main in commit `35faee5d`)                                          |
| Machine target        | Local non-production Stack B (`lifter-stack-b`), loopback `127.0.0.1:3000`                                                         |
| Server mode           | `next-start-production` (`next build` on Next.js 16.4.6; `next start --hostname 127.0.0.1 --port 3000`)                            |
| Hosted target         | **Not used locally** — deferred to pre-launch checklist on lifter-prod per S73-PO-4 (PI-04)                                        |
| Data                  | Synthetic only; no real client records, no secrets                                                                                 |
| CPU p50/p95/max       | **Not available locally** (platform request logs only); pending hosted pre-launch re-measurement                                   |
| Tooling               | spec 008 `http-probe.mjs`, `lib/stats.mjs`, `lib/pilot-volumes.mjs` orchestrated by committed `scripts/free-tier/baseline-031.mjs` |
| Raw output            | [perf-baseline-2026-11-28.json](perf-baseline-2026-11-28.json)                                                                     |
| Route matrix          | [perf-route-matrix.json](perf-route-matrix.json)                                                                                   |

## 2. Pilot volumes (spec 008 / S31-PO-4 inputs, preserved without duplication)

Inputs: 2 workspaces; 150 clients/workspace; 2 staff/workspace; 2 plans/client; 2 new plan versions/client/month. Derived: 2 workspaces, 300 clients, 4 staff memberships, 600 plans, 600 new plan versions/month. Synthetic fixture on Stack B matched these inputs. Items the offline projection cannot verify (distinct staff total, auth rows, plan-kind split, audit/job volume, bytes per row) remain recorded as `UNVERIFIED` in the JSON; none is guessed.

## 3. HTTP route baseline (20 requests/route, concurrency 2)

Measured table from `s73-hungerg-measure031/report.md` compared against signed budgets:

| Route                         | Statuses | p95 (ms) | Signed p95 budget (ms) | Signed error budget | Status |
| ----------------------------- | -------: | -------: | ---------------------: | ------------------: | :----: |
| `/api/health`                 | 200 × 20 |    16.75 |                    200 |                 ≤1% |  PASS  |
| `/login`                      | 200 × 20 |    34.77 |                    200 |                 ≤1% |  PASS  |
| `/auth/recovery`              | 200 × 20 |    35.06 |                    200 |                 ≤1% |  PASS  |
| `/clients`                    | 200 × 20 |    98.61 |                    200 |                 ≤1% |  PASS  |
| `/clients?page=1&pageSize=50` | 200 × 20 |    63.96 |                    200 |                 ≤1% |  PASS  |
| `/clients?query=Pilot`        | 200 × 20 |    62.59 |                    200 |                 ≤1% |  PASS  |
| `/workspaces`                 | 200 × 20 |    56.62 |                    200 |                 ≤1% |  PASS  |
| `/reports`                    | 200 × 20 |    67.15 |                    200 |                 ≤1% |  PASS  |
| `/welcome`                    | 200 × 20 |    33.29 |                    200 |                 ≤1% |  PASS  |

Matrix: 20 samples per route, concurrency 2. All 180 HTTP samples returned 200. Staff routes used a synthetic PO SSR cookie; `/welcome` used a synthetic client SSR cookie; public matrix routes were probed public. All 9 routes meet the signed p95 budget (200 ms) and error budget (≤1%).

## 4. DB query classes at pilot volumes (synthetic PO identity, 20 requests, concurrency 2)

Measured table from `s73-hungerg-measure031/report.md` compared against signed budgets:

| Query class                 | Requests | Errors | p95 (ms) | Signed p95 budget (ms) | Signed error budget | Status |
| --------------------------- | -------: | -----: | -------: | ---------------------: | ------------------: | :----: |
| `directory_page_1`          |       20 |      0 |     4.73 |                    100 |               ≤0.5% |  PASS  |
| `directory_page_6`          |       20 |      0 |     4.18 |                    100 |               ≤0.5% |  PASS  |
| `directory_search_filter`   |       20 |      0 |     4.85 |                    100 |               ≤0.5% |  PASS  |
| `directory_approval_filter` |       20 |      0 |     3.77 |                    100 |               ≤0.5% |  PASS  |

All 4 query classes meet the signed p95 budget (100 ms) and error budget (≤0.5%).

## 5. PO signature and budget sign-off

The performance budgets are signed by the Platform Owner per S73-PO-4 item 2 and architect ruling S73-R34.

- **Source file**: `runs/s73-po/s73-po-4.verbatim.txt`
- **PO verbatim text**:
  > `1- A`
  > `2- B`
  > `(context: 1 = manual point reason MCQ, A = required free-text written reason with length limit stored on ledger row; 2 = corrected PI-04 MCQ, B = sign 031 budgets now from the local production-mode baseline (s73-hungerg-measure031), re-measure on lifter-prod later in pre-launch checklist)`
- **Architect ruling**: S73-R34
- **Signed budgets**:
  - HTTP route p95 budget: ≤ 200 ms; error budget ≤ 1%
  - DB query-class p95 budget: ≤ 100 ms; error budget ≤ 0.5%
- **Gate status**: Changed from proposal-only (`PROPOSED_ONLY_NOT_A_GATE_PENDING_PO_SIGNATURE`) to signed (`SIGNED_PER_S73_PO_4`). The earlier proposal artifact (`perf-baseline-2026-11-27.md` / `.json`) remains unchanged as historical baseline proposal evidence.
- **Hosted production re-measurement**: Deferred to the pre-launch checklist on lifter-prod under PI-04 per S73-PO-4.

## 6. Limitations / honest gaps

- Local production-mode server (`next-start-production`) on Stack B; not a hosted environment.
- Synthetic fixture data only; no real client records or secrets used.
- The harness's pilot-volume section is a projection; DB query classes ran against the synthetic workspace fixture.
- CPU metrics (p50/p95/max) are not available locally (platform request logs only); deferred to the pre-launch checklist re-measurement on lifter-prod.
- No production deployment or real client traffic was involved.
