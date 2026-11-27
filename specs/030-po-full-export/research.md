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

Use existing PO report authorization, source readers and audit conventions. Comprehensive export is not a new user-facing page or replacement for client plan PDF/Excel. Re-check authorization at generation and every artifact fetch; if artifact storage or async work is selected, extend the existing worker/storage job ownership after checking its ACL and retention capabilities. Keep artifact contents out of audit and logs. Full-export field list, serialization and artifact lifetime are absent from approved sources and must remain PENDING-PO.

No claim from the parallel audit is used. No legal, retention, field, format, or packaging default is inferred.
