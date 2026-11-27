# Research: P8 security and performance readiness

**Date**: 2026-11-27 | **Baseline**: origin/main 49713aff. The parallel audit file was read before Plan and contained only its start heartbeat; no claims from it are used.

## Source audit with verified requirements

- `docs/03-roadmap.md:32,34,49-55`: P8 explicitly names external pen-test and performance; production requires pre-production evidence; roadmap test strategy calls for external cross-tenant pen-test.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:257-267`: PRD-13.1 requires cross-workspace penetration testing for APIs, exports, bot, storage and background jobs. PRD-13.6 requires pagination/filtering, practical mobile web performance and graceful loading. PRD-13.8 requires operational metrics without private data in logs.
- `docs/13-production-readiness.md:21-24,77-86,99-105`: PI-03 already gates approved pilot-volume capacity evidence; CS-02/03 and OP-01/security/log/backup gates remain; external test is not currently a named row. New PT-01 belongs in this single register; do not make current rows Done.
- `specs/008-free-tier-validation/spec.md:31-38,57,80`: existing tools measure route p50/p95, response bytes and CPU p50/p95/max; current illustrative pilot inputs are 2 workspaces, 150 clients/workspace, 2 staff/workspace, 2 plans/client and 2 new versions/client/month.
- `specs/008-free-tier-validation/plan.md:21-22`: current HTTP probe and platform log parser can be reused; safe-target restrictions and redaction remain.
- `.specify/memory/constitution.md:22-37,108-118,137-156,158-166`: cross-surface isolation, privacy, idempotency, backup/deploy/CI/PO gates and mandatory critique rules.
- `specs/024-client-leaderboard/spec.md`: P5 leaderboard/legal review is separately owned and is not part of P8 external pen-test planning.

## Reuse decisions

Reuse spec 008 scripts and existing test suite/CI for test preparation; no duplicate load generator or security scanner is proposed. The independent external assessor addresses testing independence and validates surfaces that code-level RLS tests cannot fully substitute. Reports must be sanitized and synthetic-account based. PT-01 remains Open until PO approves procurement and the external evidence/remediation process is complete. PI-03 remains Open until capacity measurement at approved volumes and a PO-approved budget are recorded. No numeric SLA is inferred from “practical” performance.

## Decisions pending PO

MCQ 031-01: procurement vendor/budget/timing. MCQ 031-02: numeric performance acceptance budget. Readiness plan, surface coverage and baseline measurements can proceed independently. No test engagement or production run is authorized by this specification.
