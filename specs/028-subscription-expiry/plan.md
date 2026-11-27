# Implementation Plan: Subscription expiry notices and scoped client list

**Branch**: `s71-028-expiry` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

## Summary

Extend the current F22 client inbox, F23 staff notice inbox, F13 expiry projection, staff/client read surfaces, and existing authorized directory/report route to deliver approved expiry notices and a scoped expiring/expired list. No duplicate inbox, directory page, report page, or cron job. S71-PO-1 makes this the first/highest-priority P8 spec and supersedes the v1-scope.md P8 hardening deferral.

## Technical Context

**Language/Version**: TypeScript/Next.js app and PostgreSQL/Supabase as in repository; no code changed in this spec PR.
**Primary Dependencies**: Existing F13 projector; F22/F23 notice tables and RPCs; existing client directory/report route; current `workers/cron` minute schedule.
**Storage**: Existing private notice tables and authoritative subscription/lifecycle records.
**Testing**: Planned unit, RPC/contract, and integration authorization/idempotency suites; not run in this docs-only spec lane.
**Target Platform**: Existing LIFTER web app, Supabase, current Worker cron deployment.
**Project Type**: Web application plus database RPC/jobs.
**Performance Goals**: No numeric target specified; use bounded pagination, indexed due-stage reads, and existing route performance measurement.
**Constraints**: No migrations/code/stack in this lane; no new inbox/list/job; current F26 retention and scheduling gates remain authoritative.
**Scale/Scope**: P8 expiry behavior for subscriptions/workspaces already represented in F13.

## Constitution Check

- I Strict Workspace Isolation: PASS; current actor/workspace/object checks plus private forced-RLS tables.
- III PO Governance & Least Privilege: PASS; PO/own-WO/authorized-Trainer only; Sales denied by default; MCQ 028-01 gates Trainer semantics.
- VII Privacy & Health Data: PASS; inbox state stores IDs/codes only; names resolve at current authorized read; no health values in logs/audit.
- VIII Bilingual Accessible UI: PASS; extend existing surfaces, complete state matrix; proposed copy only pending per-screen PO approval.
- IX Reliable Idempotent Operations: PASS; deterministic recipient/subscription/stage uniqueness and concurrency-safe producer.
- Constitution conflict: none. No amendment proposed.

## Reuse decisions

| Area                 | Existing source                                                                                                   | Decision                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective expiry     | F13 entitlement projector and lifecycle events                                                                    | Use the current projected expiry; never create a competing expiry calculator.                                                                                                                                                       |
| Client notices       | `app_private.client_inbox_notices`, `f22_enqueue_client_notice`, `read_client_notices`, `mark_client_notice_read` | Extend approved kind and dismiss/read fields/RPCs. Existing recipient is client self only.                                                                                                                                          |
| Staff notices        | `app_private.staff_inbox_notices`, `read_staff_notices`, `mark_staff_notice_read`                                 | Extend notice kinds and recipient-specific dismiss behavior. Do not repurpose F15's form-only alert schema.                                                                                                                         |
| Staff directory/list | Existing `/clients` route and staff directory RPC                                                                 | Add expiry filter/status to its current authorized query and UI. Do not create an expiry list page.                                                                                                                                 |
| Scheduler            | `workers/cron` already ticks each minute                                                                          | Add expiry evaluator to the existing scheduled dispatch, or to its existing job/outbox path after exact implementation review. Do not add a distinct cron registration/job. Persistent notice writes are idempotent even on reruns. |
| F15 late alerts      | F11 T057 and F15 forms inbox/scheduler                                                                            | Keep separate form deadlines/stages and behavior; no new client-late or Trainer-late schedule.                                                                                                                                      |
| Retention            | F26 approved 30-day rules and existing purge activation gate                                                      | Extend F26's existing purge allowlist/flow for notice rows; do not add another purge cron or alter the approved clock.                                                                                                              |
| P7 audit privacy     | F27 role-safe P7 data/audit boundary                                                                              | Expiry notices and list must not query or reveal P7 audit details.                                                                                                                                                                  |

## Scope split and reasoning

- **028 first**: highest priority named by S71-PO-1; a prerequisite for operational follow-through and combines only the shared expiry lifecycle plus scoped list.
- **029 PO drill-down**: report depth is independently shippable and is split from export because it reuses reporting readers and has different open dimension choices.
- **030 PO full export**: separate security-sensitive export with its own schema/package MCQ and audit/access lifecycle.
- **031 hardening**: external pen-test readiness and performance measurement share pre-production evidence gates but not product data flows; vendor/budget/timing and performance targets remain PO choices.
- Leaderboard is excluded because spec 024 already owns it (including legal gating).

## Clarifications and open decisions

S71-PO-1 scope is settled. MCQ 028-01 Trainer recipient/list definition, 028-02 short-lead T-3 catch-up, 028-03 whether already-sent stage reopens after a later extension, and 028-04 expiring-list horizon remain PENDING-PO. Independent PO/WO notices, client-approved stages, Cairo boundary conversion, idempotency foundation, list scoping for resolved roles, and F26 retention reuse may proceed in design. No assumption is encoded for pending cases.

## Proposed implementation slices

1. Add RED tests first for role/RLS denial, state/stage eligibility, F13 Cairo expiry-date-to-instant conversion, current recipient resolution, and lifecycle races. Serialize evaluation with the existing per-subscription lifecycle lock; recheck state/recipients after waits.
2. Extend existing notice-kind/read/dismiss RPC seams and worker evaluation; prove cron reruns, concurrent claims, lifecycle changes and safe errors.
3. Extend the current directory filter and existing notification presentation; verify role matrix, pagination, localization/accessibility states, and no P7 audit disclosure.
4. Extend F26 purge allowlist. Keep notice rows while the account is active; after closure/deletion apply the approved 30-day clock and tied dispute hold/restart. Keep audit's separate 30-day-from-creation clock. Existing purge activation gates remain unchanged.

## Structure Decision

Documentation lives under `specs/028-subscription-expiry/`. Future code is limited to existing notification/directory/worker modules, existing Supabase migration/test paths, and F26 purge owner paths; no new app/page/inbox/worker is planned.

## PO delivery gates

Per-screen AR/EN copy approval is still required before UI copy ships. The four MCQs gate only the listed product semantics. Sol Medium's independent critique found 3 HIGH and 3 MEDIUM items; all six have been addressed in the updated spec, data model, contract, tasks, and retention wording. Its report is in `checklists/critique-sol-medium.md`.
