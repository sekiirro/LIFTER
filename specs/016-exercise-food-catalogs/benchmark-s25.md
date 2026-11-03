# S25 F16 D16-10 benchmark (local Stack C)

Date: 2026-11-02. This is an indicative local benchmark only. Production-like Worker CPU and HTTP/API p95 remain a pre-production gate.

## Environment and method

- Windows host, Intel Core i7-13650HX (14 cores / 20 threads), Docker Desktop, local Stack C PostgreSQL `public.ecr.aws/supabase/postgres:17.11.0.006`. Container CPU/RAM limits were unreported. No hosted Worker or HTTP/API path is available locally.
- Fixture: 11,000 foods: 10,000 active and 1,000 removed (10:1), respecting the active-food cap. Bilingual names are deterministic: 50% short (EN 26 / AR 20 chars), 30% medium (EN 42 / AR 36), 20% long (EN 70 / AR 60). One reference serving per food and identity keys are populated; statistics are analyzed.
- Query classes: unfiltered browse (page 50), selective name search, basis-filtered search, exact duplicate, and near duplicate. Each class used one warmup plus 12 timed calls at concurrency 1, 8, and 32. Percentiles use the 12 measured requests per class/concurrency. No worker CPU value is inferred from DB time.
- Benchmark run: 2026-11-01T23:49:11Z. The test fixture near-name differs by one character in a repeated token; sanity checks returned one exact and one near candidate.

## Pre-fix diagnosis (EXPLAIN ANALYZE, BUFFERS)

The initial unfiltered browse timing was stopped after exceeding 120 seconds. After loading the fixture and obtaining an authorized local actor, a warm diagnostic run measured the pre-fix RPC at 712.044 ms (44,989 shared hits); its equivalent browse query took 698.564 ms (44,780 shared hits). The plan showed a hash join over the complete active foods and versions sets followed by a top-N sort and `LIMIT`. The `catalog_food_versions_safe` security-barrier projection produced 11,000 rows and consumed about 44,190 shared hits. Its `CASE` masking expressions called `is_platform_owner()` for every row, and the browse query redundantly joined the safe version projection after already joining the version table. A bounded-page CTE alone still took 565.79 ms / 40,436 shared hits because those per-row masking calls remained.

This was not a missing browse index or offset-pagination issue. A full active-food scan was visible, but the dominant plan time/buffer cost was per-row security projection work and a redundant unbounded safe-view join. The `EXPLAIN` evidence was captured before changing the schema or query.

## Fix and post-fix plans

Forward migration `20261106115400_catalog_search_browse_perf.sql` changes the safe views to evaluate authorization and masking expressions as scalar initplans, pages active foods before fetching versions for unfiltered browse, and removes the redundant safe-version join from catalog search. It preserves security-barrier views, row-level authorization, creator masking, keyset ordering, and page-size limits. No index was changed.

| Plan | Before | After |
|---|---:|---:|
| `catalog_search('food', NULL, page_size=50)` | 712.044 ms; 44,989 shared hits; full join then top-N sort/limit | 4.45 ms; 971 shared hits; function scan bounded to 50 returned rows |
| Equivalent authorized page query | 698.564 ms; 44,780 shared hits | 4.068 ms; 440 shared hits; 50-row materialized page then 50 indexed version lookups |
| Safe-view active-food projection | 10,000 rows, ~40,281 shared hits in the join | 10,000 rows, 285 shared hits; scalar initplans; active-food seq scan ~1.1 ms |

Selective search plan uses `foods_active_limit_idx` and `food_versions_food_version_basis_key` (50 rows, 108 shared hits). Exact duplicate uses `catalog_food_name_keys_active_identity_uq` (one row, 4 shared hits). At the original 11,000-food fixture size, the near-duplicate predicate used a `Seq Scan on food_versions`, examining the 11,000 version rows (472 shared hits), followed by active-food lookups. Its p95 was 112.15 ms at concurrency 1, 112.13 ms at concurrency 8, and 154.92 ms at concurrency 32. The initial fixture was too small for the planner to prefer the existing single-column trigram indexes; the sub-300 ms latency did not satisfy SC-005's no-unbounded-scan requirement.

## T034 near-duplicate access-path correction

Forward migration `20261106124000_catalog_food_near_duplicate_index.sql` enables the Supabase-supported `btree_gin` extension and creates one multicolumn GIN index covering basis, canonical product identity, preparation identity, weighing state, and both normalized language names. The `pg_trgm.similarity_threshold` setting is scoped to the duplicate-candidate function at 0.90, and the near-match query has separate Arabic and English branches. Each branch retains the active/current-version join, all identity and kcal predicates, exact-key exclusion, deterministic food-ID order, and `LIMIT 50`. No session-wide similarity setting is changed.

The regression fixture has 9,000 active benchmark foods with six immutable versions each: **54,000 `food_versions` rows total**. The test runs in a transaction and rolls back the fixture after timing. After `ANALYZE`, with sequential scans left enabled, `EXPLAIN (ANALYZE, BUFFERS)` chose `food_versions_near_duplicate_gin_idx`. The plan had `Bitmap Index Scan` (100 actual rows) and `Bitmap Heap Scan on food_versions` (100 actual rows), followed by active-food index probes, `Sort` (50 rows), and `Limit` (50 rows). It had no `Seq Scan on food_versions`; the small `catalog_food_name_keys` anti-join used an index scan (zero actual rows).

Twelve serial calls to the real duplicate-candidate RPC at that volume measured **9.27 ms p50 / 11.68 ms p95**. The fixture rolls back with the transaction. Dropping the new composite index reproduced a `Seq Scan on food_versions` and failed the regression at the no-sequential-scan assertion. `pg_trgm` 1.6 was already installed in Stack C; `btree_gin` 1.3 was available there and is added by the forward migration. Supabase's hosted extension catalog lists both extensions. This is a database-path benchmark, not a hosted HTTP/API or Worker CPU measurement.

## Timings

All values are milliseconds; each cell is p50 / p95 for 12 requests.

| Query class | Concurrency 1 | Concurrency 8 | Concurrency 32 |
|---|---:|---:|---:|
| Browse | 4.69 / 5.45 | 29.12 / 31.81 | 12.76 / 26.61 |
| Selective search | 7.80 / 8.45 | 10.48 / 15.39 | 15.07 / 18.07 |
| Basis-filtered search | 6.32 / 7.23 | 8.97 / 12.46 | 12.62 / 13.31 |
| Exact duplicate | 86.07 / 93.24 | 45.83 / 100.93 | 61.35 / 99.74 |
| Near duplicate, original 11,000-food fixture | 109.02 / 112.15 | 59.13 / 112.13 | 93.30 / 154.92 |
| Near duplicate RPC, 54,000 versions, 12 serial calls | 9.27 / 11.68 | n/a | n/a |

Database size after fixture load: 46,962,355 bytes (~44.8 MiB). Foods total: 1,941,504 bytes; food_versions total: 14,950,400 bytes; name-key table total: 8,085,504 bytes; combined indexes on those food relations: 16,474,112 bytes (~15.7 MiB), below the 350 MB 70% exit trigger. Fixture candidate sanity: one exact and one near result.

## Release interpretation

Local database p95 is below the 300 ms target for every class/concurrency. The local result is indicative only; it does not satisfy production Worker CPU <=5 ms p95 or production HTTP/API <=300 ms p95. Repeat on a production-like environment with the full request path, observed resource limits, and representative data before production. No production data/service was accessed. The benchmark fixture is removed by the final clean Stack C reset.
