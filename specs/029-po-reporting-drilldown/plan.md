# Implementation Plan: PO aggregate reporting drill-down

**Branch**: `s71-029-po-drilldown` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Extend the existing `/reports` route and currently authorized reporting readers to provide the PO-approved additional level of platform aggregate drill-down. Maintain existing finance truth, workspace boundaries, and pagination. The extra dimension set is PENDING-PO (MCQ 029-01); no new comparisons or report page are implied.

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
- The current `reports/page.tsx` selects a workspace and `lib/packages/reporting.ts` exposes workspace-specific package metrics; neither implements the proposed platform aggregate. FR-002/FR-004 therefore include identifying and extending the actual existing aggregate reader/source within `/reports`, with only established BRD/PRD measures. Any extra dimensions remain pending MCQ 029-01.
- Keep leaderboard excluded (spec 024), full client export in spec 030, and raw audit browsing out of reports.

## Clarifications / PO decisions

MCQ 029-01 is PENDING-PO for the exact additional breakdown dimensions. Existing aggregate and workspace drill-down behavior is settled by BRD-06/PRD-11. Do not invent more report categories while the choice is pending.

## Proposed implementation slices

1. RED authz/reconciliation tests through app and direct RPC for PO, WO, Trainer, Sales, Client, foreign workspace and malformed filters. Include a fixture proving platform total → workspace subtotal → source rows; define measures from existing source data before selected MCQ dimensions.
2. Identify and extend the aggregate reader within `/reports`; use only existing BRD/PRD measures until MCQ dimensions are approved. Keep a distinct PO platform-scope gate while retaining WO's existing workspace report access.
3. Extend existing report view and its loading/empty/error, AR/EN, mobile/accessibility tests. Explicitly test intended breakdowns, role outcomes, and exclusions.
4. Verify finance totals, security probe coverage and exact-head evidence.

## Structure Decision

No new page or persistence model. Changes stay within `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsView.tsx`, `lib/packages/reporting.ts`, an identified existing report RPC, and corresponding existing test suites. Add a multi-workspace platform-total → workspace-subtotal → source-row acceptance fixture before implementing aggregate reads.
