# Implementation Plan: PO comprehensive client dataset export

**Branch**: `s71-030-po-export` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Extend the existing PO reporting/export surface to deliver the approved comprehensive client dataset only to PO, with a manifest, audited request and safe artifact handling. Package format, fields, sync/async mode, and expiry remain PENDING-PO (MCQ 030-01). This spec creates no export page/service/worker/table.

## Technical Context

**Language/Version**: Existing TypeScript/Next.js and PostgreSQL/Supabase; docs-only lane.
**Primary Dependencies**: Existing `/reports`, current reporting readers, approved audit/export patterns and existing private storage/job surfaces if PO selects them.
**Storage**: Existing source records; artifact storage choice depends on MCQ 030-01.
**Testing**: Planned RED-first PO-only, direct endpoint/RPC, scope and artifact authorization tests; not run here.
**Target Platform**: Existing LIFTER app and Supabase; no production data use.
**Project Type**: Web application and authorized export data path.
**Performance Goals**: No export capacity target is invented; test against approved volume and package choice.
**Constraints**: PO only; audit sensitive export action; do not log client/health fields; package questions must resolve first.
**Scale/Scope**: Comprehensive client data, explicit workspace/platform scope selected by PO.

## Constitution Check

PASS: Principles I, III, VII, IX. PO-only export, server/RLS authorization, minimal logging, audited sensitive export and bounded/repeat-safe retrieval. No Constitution conflict or amendment proposed.

## Reuse decisions

- Reuse existing Reports route and its authorization/service conventions; do not create an export dashboard.
- Reuse existing source readers and immutable source-of-truth records; no duplicated export dataset table.
- Reuse existing audit-event path with an allow-listed event containing actor, scope, safe outcome and opaque reference only.
- Reuse existing job/Storage facilities only if MCQ 030-01 selects asynchronous artifact delivery; no new worker/scheduler is assumed.
- Existing report route/readers are shared by PO and WO. Add a distinct PO-only comprehensive-export capability check at application and reader/storage boundaries, and regression-test that authorized WO workspace reporting still works. Never widen the shared report authorization to export.
- Do not change client-plan PDF/Excel export (a separate capability), WO rights, or spec 024 leaderboard.

## Clarifications

PO-only comprehensive export is settled. MCQ 030-01 decides the package/fields/lifetime. Authorization, audit, minimization and direct denial can be designed without selecting the format.

## Proposed implementation slices

1. RED authz tests through app, API/RPC, artifact URL, direct table/storage path, foreign actor/workspace and replay.
2. Approve field manifest and package using MCQ 030-01; extend existing authorized reader with bounded output.
3. Add audited generation/retrieval lifecycle and only reuse existing async jobs/Storage if selected.
4. Verify artifact expiry/revocation, no leakage in logs, usability and data completeness.

## Structure Decision

Keep export within current report route/service, current audit path and current data/worker/storage owners. New page, export database, unapproved storage or worker is not planned. Planned extension points: `app/(app)/reports/page.tsx`, `app/(app)/reports/ReportsView.tsx`, `lib/packages/reporting.ts`, the identified existing report RPC, plus matching existing component/RPC integration tests. Before T004 execution, list exact existing test file paths and assert baseline WO report behavior. Implement neither package generation nor new schema until T001-T003 access tests and the T005-T006 RED fixtures exist.
