# Research: PO aggregate reporting drill-down

**Date**: 2026-11-27 | **Baseline**: origin/main 49713aff. The parallel audit file was read before Plan; it contained only a start heartbeat and no claims. Source facts below were checked directly.

## Source audit

- `docs/03-roadmap.md:26-32`: P4 has minimum finance reporting and PO aggregate+drill-down; P8 requires greater PO drill-down depth, full export, external pen-test and performance; leaderboard already belongs to P5/spec 024 and is excluded.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:59-60,86-91`: platform aggregate with workspace drill-down; workspace reports remain workspace-specific; only PO exports comprehensive datasets.
- `LIFTER_Claude_Files/LIFTER_BRD_PRD_Claude_Master.md:231-237`: PRD-11 defines report scopes, audit visibility, and PO-only comprehensive export.
- `.specify/memory/constitution.md:22-37,41-55,58-68,108-113`: strict workspace isolation, immutable financial records, PO governance, and least-privilege privacy.
- `app/(app)/reports/page.tsx` and `ReportsView.tsx`: existing route/view is the report surface. `lib/packages/reporting.ts:95-134` calls existing package commission/installment report RPCs after PO/WO authorization.
- `specs/024-client-leaderboard/spec.md`: separate leaderboard feature is already specified; exclude it.

## Reuse and technical decisions

Use existing report route, readers, source facts, permission checks, money math and display components. Add only PO-selected drill-down fields to the existing reader. Authorization remains in database/service layer; filters must be applied before aggregation/detail return. Keep row bounds and stable pagination. Compare exact sums in integer minor units and do not convert currencies unless existing report rules already define it.

No other report dimensions, timing defaults, or new SLA are inferred. MCQ 029-01 is the only open product choice. No product/privacy claim from the parallel audit was relied upon.
