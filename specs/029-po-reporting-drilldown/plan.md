# Implementation Plan: PO aggregate reporting drill-down

**Branch**: `s71-029-po-drilldown` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Extend the existing `/reports` route and currently authorized reporting readers to provide PO-approved month and package breakdowns within platform aggregate drill-down. Maintain existing finance truth, workspace boundaries, and pagination; no comparison dashboard or new report page is implied.

## Technical Context

**Language/Version**: Existing TypeScript/Next.js and PostgreSQL/Supabase; docs-only lane.
**Primary Dependencies**: `app/(app)/reports`, `lib/packages/reporting.ts`, existing report RPCs and F13/report projections.
**Storage**: Existing finance/source tables and current report queries; no new reporting database.
**Testing**: Planned contract/integration RLS and reconciliation tests; none run in this docs-only PR.
**Target Platform**: Existing LIFTER web app and Supabase.
**Project Type**: Web application plus database readers.
**Performance Goals**: No new numeric SLA; bounded pages and approved metrics only.
**Constraints**: P8 PO scope only; preserve money math and PRD-11 role constraints.
**Scale/Scope**: PO aggregate -> workspace/report detail.

## Constitution Check

PASS: Principles I, II, III, VII, VIII. Any report rows remain server-authorized, immutable finance sources unchanged, full-platform view PO-only, sensitive detail minimized, and existing UI standards reused. No Constitution conflict or amendment proposed.

## Reuse decisions

- Reuse `app/(app)/reports/page.tsx` and `ReportsView.tsx`; no second report dashboard.
- Reuse `lib/packages/reporting.ts` and existing package commission/installment report RPCs where metrics align; do not reconstruct ledger math in UI.
- Reuse existing source readers, but do not treat the shared `/reports` UI/service as PO-only: it currently supports both PO and WO. Add an export/drill-down-specific capability check and server-side PO role check for platform aggregate scope; preserve existing WO workspace reports. Verify permission rules against `docs/02-architecture.md:35-49` and source readers before implementation.
- The current `reports/page.tsx` selects a workspace and `lib/packages/reporting.ts` exposes workspace-specific package metrics; no platform aggregate reader/RPC exists. Add a new PO-only platform aggregate reader/RPC over the existing source facts, and integrate it into `/reports`; apply month and package breakdowns to the established revenue, client, subscription, and finance measures.
- Keep leaderboard excluded (spec 024), full client export in spec 030, and raw audit browsing out of reports.

## Clarifications / PO decisions

S71-PO-6 resolves MCQ 029-01 as month and package breakdowns. Existing aggregate and workspace drill-down behavior is settled by BRD-06/PRD-11. No other dimensions are included.

## Proposed implementation slices

1. RED authz/reconciliation tests through app and direct RPC for PO, WO, Trainer, Sales, Client, foreign workspace and malformed filters. Include a fixture proving platform total → workspace subtotal → month/package breakdown → source rows for established revenue/client/subscription/finance measures.
2. Add a PO-only platform aggregate reader/RPC over existing source facts and integrate it with `/reports`; add month and package breakdowns. Keep a distinct PO platform-scope gate while retaining WO's existing workspace report access.
3. Extend existing report view and its loading/empty/error, AR/EN, mobile/accessibility tests. Explicitly test intended breakdowns, role outcomes, and exclusions.
4. Verify finance totals, security probe coverage and exact-head evidence.

## Structure Decision

No new page or persistence model. Changes stay within `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsView.tsx`, `lib/packages/reporting.ts`, an identified existing report RPC, and corresponding existing test suites. Add a multi-workspace platform-total → workspace-subtotal → source-row acceptance fixture before implementing aggregate reads.
