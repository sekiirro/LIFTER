# S25 F16 D16-10 benchmark (local Stack C)

Date: 2026-11-02. Scope: local indicative benchmark attempt only. Production benchmarks remain a pre-production release gate.

## Environment and method

- Windows 11 host, Intel Core i7-13650HX (14 cores / 20 threads); Docker Desktop, Stack C local PostgreSQL `public.ecr.aws/supabase/postgres:17.11.0.006`. Container CPU/RAM limits were unreported/unbounded. No hosted Worker or HTTP/API path is available in this environment.
- Fixture successfully loaded on Stack C: 11,000 foods, 10,000 active and 1,000 removed (10:1). Deterministic bilingual name distribution: 50% short (EN 26 / AR 20 chars), 30% medium (EN 42 / AR 36), 20% long (EN 70 / AR 60). One reference serving per food; identity keys populated; table statistics analyzed.
- Intended query classes: browse, selective name search, basis-filtered search, exact duplicate, near duplicate. Intended concurrency: 1, 8, 32. The local run was stopped before completing the class sweep after the first browse request remained actively executing for over 120 seconds at concurrency 1.

## Results

| Query class | Concurrency | Result | Spec target |
|---|---:|---|---|
| Browse (`catalog_search`, food, unfiltered, page 50) | 1 | One request still executing after >120 s; timing pass stopped; p50/p95 not available | DB/API p95 <=300 ms — **FAIL** |
| Selective name search | 1/8/32 | Not reached | <=300 ms p95 — not measured |
| Basis-filtered search | 1/8/32 | Not reached | <=300 ms p95 — not measured |
| Exact duplicate | 1/8/32 | Not reached | Cost/target not measured |
| Near duplicate | 1/8/32 | Not reached | Cost/target not measured |
| Worker CPU | N/A | No local Worker runtime in measured path | <=5 ms p95 — not measured |
| Index plans and index/database size | N/A | Not collected because the browse class did not complete | Intended plans and <=350 MB 70% exit trigger — not measured |

The observed browse result is a local performance failure. No index was changed. The incomplete measurements do not support a production release decision; repeat the full benchmark against a production-like environment after diagnosing browse execution. Production Worker CPU, HTTP/API p95, all query classes, plans and database/index size remain required pre-production gates.

The fixture and incomplete timing run were removed by the final clean Stack C reset. No production data or service was accessed.