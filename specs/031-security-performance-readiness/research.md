# Research: P8 security and performance readiness

**Date**: 2026-11-27 | **Baseline**: origin/main 49713aff. The parallel audit file was read before Plan and contained only its start heartbeat; no claims from it are used.

## Source audit with verified requirements

- `docs/03-roadmap.md:32,34,49-55`: P8 explicitly names external pen-test and performance; production requires pre-production evidence; roadmap test strategy calls for external cross-tenant pen-test.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:257-267`: PRD-13.1 requires cross-workspace penetration testing for APIs, exports, bot, storage and background jobs. PRD-13.6 requires pagination/filtering, practical mobile web performance and graceful loading. PRD-13.8 requires operational metrics without private data in logs.
- `docs/13-production-readiness.md:21-24,77-86,99-105`: PI-03 and PT-01 already exist in the single readiness register; CS-02/03 and OP-01/security/log/backup gates remain. Update the existing PT-01 row; do not add a duplicate or mark current rows Done.
- `specs/008-free-tier-validation/spec.md:31-38,57,80`: existing tools measure route p50/p95, response bytes and CPU p50/p95/max; current illustrative pilot inputs are 2 workspaces, 150 clients/workspace, 2 staff/workspace, 2 plans/client and 2 new versions/client/month.
- `specs/008-free-tier-validation/plan.md:21-22`: current HTTP probe and platform log parser can be reused; safe-target restrictions and redaction remain.
- `.specify/memory/constitution.md:22-37,108-118,137-156,158-166`: cross-surface isolation, privacy, idempotency, backup/deploy/CI/PO gates and mandatory critique rules.
- `specs/024-client-leaderboard/spec.md`: P5 leaderboard/legal review is separately owned and is not part of P8 external pen-test planning.

## Reuse decisions

Reuse spec 008 scripts and existing test suite/CI for test preparation; no duplicate load generator or security scanner is proposed. The independent external assessor addresses testing independence and validates surfaces that code-level RLS tests cannot fully substitute. Reports must be sanitized and synthetic-account based. PT-01 remains Open and blocks go-live until post-pilot vendor/timing selection, required external evidence, verified remediation, and retest are complete. PI-03 records a baseline at spec 008 pilot volumes and proposed per-route p95 latency/error budgets; those budgets become a gate only after PO signature.

## Decision status

S71-PO-7 resolves both MCQs. No PO decision remains open. Vendor/timing follow the pilot; performance baseline/proposed budgets precede PO signature. No test engagement or production run is performed by this documentation specification.
