# Research: PO comprehensive client dataset export

**Date**: 2026-11-27 | **Baseline**: origin/main 49713aff. Parallel audit file was read before Plan and contained only a heartbeat; no outside claims relied upon.

## Source audit

- `docs/03-roadmap.md:32`: P8 includes PO full export.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:40-46,86-91,100-114`: role boundaries; only PO exports comprehensive client datasets; WO/Trainer/Sales scopes remain limited.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:231-237`: PRD-11 permits only PO complete client data export; client plan PDF/Excel is separate and subject to current entitlement.
- `.specify/memory/constitution.md:22-37,58-68,108-118,137-145`: strict tenant isolation, PO exclusive governance, audit and health-data privacy, idempotency.
- `docs/13-production-readiness.md:77-86,99-105`: exact-head/security, log-redaction and production gates remain separate; no production change implied.
- `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsView.tsx`, `lib/packages/reporting.ts:95-134`: current report route and authorized report reader/service are reusable.
- Existing client plan export routes are under `app/(client)/plans/[planId]/export/route.ts`; these are client-specific plan exports, not full dataset export.

## Reuse decisions and technical findings

Use existing PO report authorization, source readers and audit conventions. S71-PO-6 selects one asynchronous UTF-8 CSV file for one workspace or all workspaces. Reuse spec 006 jobs/outbox; adapt authorization/audit/spreadsheet-safety patterns from `lib/client-access/plan-export.ts`, `lib/plans/nutrition/export.ts`, and `lib/workout-planner/client-export.ts`. The audit found no comprehensive dataset reader, CSV engine, or authorized export-artifact bucket. Add a PO-only source reader, private bucket policies and RFC 4180 serializer while keeping plan PDF/Excel exports separate. Re-check authorization and write audit evidence at generation and every authenticated artifact fetch; keep artifact contents out of audit/logs. The field manifest and expiry duration are PROPOSED per-screen PO approval items.

The reuse audit is relied on for existing export-code paths; it found no comprehensive dataset export implementation. No unapproved field list or additional package behavior is inferred.
