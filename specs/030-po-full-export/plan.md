# Implementation Plan: PO comprehensive client dataset export

**Branch**: `s71-030-po-export` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Add a PO-only export section to the existing Reports screen to deliver one asynchronous UTF-8 CSV file for one workspace or all workspaces, with a versioned field manifest, audited request/generation/retrieval and safe artifact handling. Reuse spec 006 jobs/outbox and adapt audited export code patterns. A private export-artifacts bucket and policies are added; no export page, job table, worker or duplicate data store is created. The proposed field manifest and expiry duration require per-screen PO approval.

## Technical Context

**Language/Version**: Existing TypeScript/Next.js and PostgreSQL/Supabase; docs-only lane.
**Primary Dependencies**: Existing `/reports`, current reporting readers, spec 006 jobs/outbox, audited export paths `lib/client-access/plan-export.ts`, `lib/plans/nutrition/export.ts`, and `lib/workout-planner/client-export.ts`, approved audit patterns, and a new private export-artifacts bucket.
**Storage**: Existing source records and spec 006 jobs/outbox; one private export-artifacts bucket with scoped policies for short-lived authenticated CSV downloads.
**Testing**: Planned RED-first PO-only, direct endpoint/RPC, scope and artifact authorization tests; not run here.
**Target Platform**: Existing LIFTER app and Supabase; no production data use.
**Project Type**: Web application and authorized export data path.
**Performance Goals**: Read source rows via one definer RPC (`po_export_snapshot`) returning one MVCC-consistent bounded rowset in a single statement (limit 10001), failing closed with no artifact if exceeding 10,000 rows with no cross-transaction paging (architect technical decision S72-R37/S71-R34); measure bounded memory at the illustrative spec 008 pilot volumes.
**Constraints**: PO only; audit sensitive export action; do not log client/health fields; export only the PO-approved manifest.
**Scale/Scope**: Comprehensive client data, explicit workspace/platform scope selected by PO.

## Constitution Check

PASS: Principles I, III, VII, IX. PO-only export, server/RLS authorization, minimal logging, audited sensitive export and bounded/repeat-safe retrieval. No Constitution conflict or amendment proposed.

## Reuse decisions

- Reuse existing Reports route and its authorization/service conventions; do not create an export dashboard.
- The audit found no comprehensive dataset reader, endpoint, or CSV export engine. Add a new PO-authorized export reader/request path over existing source facts; do not add an export dataset table.
- Reuse the existing audit-event pattern with allow-listed events for request, generation outcome and every retrieval; include actor, scope, safe outcome and opaque reference only, and fail closed when a retrieval event cannot be written.
- Reuse spec 006 `public.jobs`/outbox and its existing cron drain/handler registry for asynchronous generation; add no new jobs table, worker, or scheduler.
- Adapt authorization, audit and spreadsheet-safety patterns from `lib/client-access/plan-export.ts`, `lib/plans/nutrition/export.ts`, and `lib/workout-planner/client-export.ts`. None is a comprehensive CSV engine; add RFC 4180 UTF-8 CSV serialization for this feature while retaining their plan PDF/Excel behavior.
- Add a private `export-artifacts` bucket with restrictive policies; no existing authorized export-artifact storage path is present. Access only through an authenticated route that reauthorizes and audits each retrieval; direct storage reads and bearer URLs are denied.
- Existing report route/readers are shared by PO and WO. Add a distinct PO-only comprehensive-export capability check at application and reader/storage boundaries, and regression-test that authorized WO workspace reporting still works. Never widen the shared report authorization to export.
- Do not change client-plan PDF/Excel export (a separate capability), WO rights, or spec 024 leaderboard.

## Clarifications

S71-PO-6 resolves MCQ 030-01 as one asynchronous UTF-8 CSV file, one workspace or all, with short-lived authenticated download. The versioned field manifest, expiry duration and copy remain PROPOSED per-screen PO approval items; no field is treated as approved until that approval is recorded.

## Proposed implementation slices

1. RED authz tests through app, API/RPC, artifact URL, direct table/storage path, foreign actor/workspace and replay.
2. Present the versioned field manifest as PROPOSED for per-screen PO approval, then implement a new PO-guarded source reader/request path with bounded UTF-8 CSV output.
3. Add an export handler to the existing spec 006 job registry, private bucket policies, and audited retrieval; authenticated retrieval rechecks current PO authorization and the per-screen PO-approved short-lived expiry.
4. Verify artifact expiry/revocation, no leakage in logs, usability and data completeness.

## Structure Decision

Keep export within current report route/service, current audit path and current job/worker owners; add one private bucket and scoped storage policies through a migration. New page, export database, job table or worker is not planned. Planned extension points: `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsView.tsx`, `lib/packages/reporting.ts`, a new PO-only reader/RPC and authenticated retrieval route, plus matching existing component/RPC integration tests. Before implementation, list exact existing test file paths and assert baseline WO report behavior. No export is enabled until the proposed field manifest and expiry duration receive per-screen PO approval.
