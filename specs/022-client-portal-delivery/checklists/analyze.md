# Analyze: Client Portal Delivery

**Date**: 2026-11-23 (Round 8 re-check after S70-PO-2 changed FR-011, directory copy, contract and tasks; prior analyses remain historical)
**Inputs**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, `copy-proposal.md`, PO S56-PO-4, S57-PO-5, S57-PO-9, S57-PO-10, S57-PO-11, S57-PO-12, S57-PO-13

## Changes analyzed

- Review follow-up (2026-11-18, no new decision): FR-009 now states the existing behavior that notice reads ignore F13 entitlement (kind and timestamps only, no plan content). tasks.md evidence paths are repointed to real files and the missing verification-report.md reference is replaced by the test files as the record; the coverage matrix is unchanged (same task IDs). Accepted LOW findings: directory per-row F13 summary cost, notice entitlement intent. No open CRITICAL, HIGH or MEDIUM findings.
- Round 5 (2026-11-17, no FR, SC or acceptance text changed; no new decision): contracts/client-portal.md gains the "Nutrition view and export read" section for the new client-wall read `client_portal_nutrition_plan`, which implements the already-approved FR-004 (S57-PO-9) and FR-008 for nutrition using the F18 renderer and builders; tasks.md gains the Round 5 re-audit section and slice 7 (task status and evidence, plus the blocked-owner contracts for T017/T018/T022/T023-T028/T034-T037). Findings: none open. The workout view and export, T018, T022 and T034-T037 remain blocked on the owners named there; T035 additionally needs PO wording and an F11 visibility ruling (PO-DECISION-NEEDED).
- FR-003, User Story 1 scenario 4, SC-003, the override edge case and the Productivity point entity now follow S57-PO-11: a PO override gives an eligible new client its one unit under F19-FR-007. The S48-PO-19 zero-point clarification is kept and marked superseded. T011 is updated to match.
- FR-005 now encodes S57-PO-5 (last covered day, display only) and S57-PO-12 (approved status labels; Refunded only for a full refund; a partial refund shows no label; the directory reuses the labels and its Refunded filter matches full refunds only). Data model, contracts, research, T016 and T035 match.
- FR-004 encodes S57-PO-9: the plan body uses the F17/F18 shared read-only views, and P4 builds no renderer. T017 and research match.
- FR-009 encodes S57-PO-10: an F19-owned hook, and a P4 client-recipient extension of the F15 inbox reused by spec 023. Data model (new client notice record), plan storage, contracts, research, T021 and T022 match.
- A Client navigation reuse boundary records S57-PO-12 "Top 5 belongs inside Progress, not Main Navigation".
- S57-PO-13: the staff directory uses separate staff status labels (same states, full-refund-only Refunded); the client labels are unchanged. FR-005, the staff directory contract, T035, data-model and copy-proposal.md match. The spec no longer calls any copy proposed or pending: the two copy statements in Assumptions and Clarifications and the empty-state wording in User Story 2 and the edge cases now say approved.
- tasks.md gains a Slice record section for T005 (task status/traceability only; no requirement text).
- Quickstart scenario 1 no longer describes a dark-by-default flag (removed under S56-PO-4), and quickstart no longer states that no migration is required. The plan now cites Constitution 1.17.0.

## Specification Analysis Report

| ID  | Category | Severity | Location(s) | Summary                                         | Recommendation |
| --- | -------- | -------- | ----------- | ----------------------------------------------- | -------------- |
| -   | -        | -        | -           | No open CRITICAL, HIGH, MEDIUM or LOW findings. | None.          |

Resolved during this Analyze: the quickstart flag scenario and migration statement contradicted S56-PO-4 and the new client notice record (MEDIUM, fixed in `quickstart.md`); the plan cited Constitution 1.16.0 (LOW, fixed in `plan.md`).

## Coverage Summary

| Requirement Key | Has Task? | Task IDs                                               | Notes                                                                       |
| --------------- | --------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| FR-001          | Yes       | T003, T006-T011                                        | Independent F19 delivery and idempotency                                    |
| FR-002          | Yes       | T003, T006-T008, T011                                  | Exactly-once activation                                                     |
| FR-003          | Yes       | T003, T006-T008, T011                                  | One new-client unit, normal or override (S57-PO-11)                         |
| FR-004          | Yes       | T003, T012-T018                                        | Client plan projection and revision choice; F17/F18 views (S57-PO-9)        |
| FR-005          | Yes       | T003, T012-T016, T035                                  | Status labels, full-refund rule and last covered day (S57-PO-5, S57-PO-12)  |
| FR-006          | Yes       | T003, T013-T015, T018, T023-T027                       | Entitlement for reads and exports                                           |
| FR-007          | Yes       | T003, T013-T015, T018                                  | Fresh lifecycle authorization                                               |
| FR-008          | Yes       | T003, T023-T029                                        | Selected-revision exports                                                   |
| FR-009          | Yes       | T003, T019-T022                                        | F15 inbox client-recipient extension and F19 hook (S57-PO-10)               |
| FR-010          | Yes       | T003-T004, T013-T014, T018, T023-T027, T032-T033, T038 | Identity, privacy and workspace boundaries                                  |
| FR-011          | Yes       | T003-T004, T030-T038, T044-T045                        | Approved directory fields, role visibility, username and client-code search |
| FR-012          | Yes       | T003, T023-T027, T042                                  | Client exports remain per-plan; comprehensive export remains PO-only        |
| FR-013          | Yes       | T003, T042                                             | No YBS access, migration or synchronization                                 |

Success criteria SC-001 to SC-010 remain mapped through their FRs. SC-003 now matches FR-003, and SC-006 matches the FR-004/FR-005 restricted projection.

## Constitution Alignment Issues

None. The plan cites Constitution 1.17.0 and preserves workspace isolation, server and database authorization, vertical slices, the PO S56-PO-4 decision to proceed without a feature flag while LIFTER is not live, one cumulative AI review per feature, and local validation. The new client notice record has composite workspace keys, forced RLS, no API table privileges and foreign-workspace negative tests. The refund-scope helper reads F13 facts only and alters no F13 object. Authorization, entitlement and export-authorization controls stay marked `[HIGH-RISK: authorization]` with mutation-evidence tasks.

## Unmapped Tasks

None. All 43 tasks identify FR coverage; user-story tasks also carry a US label and an implementation path. Setup/foundational/completion tasks map to cross-cutting requirements.

## Metrics

- Total functional requirements: 13
- Total tasks: 43
- Coverage: 100% (13/13 FRs have one or more mapped tasks)
- Ambiguity count: 0
- Duplication count: 0
- Critical issues: 0
- High issues: 0

## Next Actions

Continue implementation on the updated spec. Paused integrations stay blocked on their owners: F17/F18 views and exporters, the F19 notice hook, and F11 client code and assignment. No product decision is open in this spec.

## Round 6 re-audit against main (2026-11-18, re-dated after independent review)

Scope: the F22 blockers delivered by the orchestrator PR (F13 overdue input, F19 delivery notice hook, F11 client code and assignment wall, F16/F17 client workout projection, F23 facts). Only the tasks.md Round 6 section and tick state changed; no FR, SC, plan, contract or copy text changed. Ticked tasks T017, T018, T022-T028 and T034 have exact-head green CI on `68bd6a76` (run 44315256704: validate, integration shards 1-3, integration, storage, docs-only).

- FR-006/FR-007: overdue is consumed from F13 (`f13_client_overdue_state`) and restricts every plan read and export, workout included; F22 computes no overdue.
- FR-009: the F19 hook is the single delivery writer `ready_and_publish_plan_impl`; one notice per first-plan delivery, activation text on the activating delivery; exactly two notices per pair.
- FR-011: the assignment filter and client code are behind the F11 owner-or-Platform-Owner wall and never widen `coaching_work`; Trainers get the parameter ignored and no assignment or code. Remaining partial: T035 and T034 UI (no approved copy), T036 new check-ins (no F23 definition), T037 other links (no routes).

- Review follow-ups applied: workout content in `client_portal_plan` goes through the F17 allowlist; `record_nutrition_export_audit` and `record_workout_export_audit` apply the active-and-not-overdue client condition; the overdue default fails closed; migrations are forwarded to `20261223050000`-`20261223050300` after merge with `origin/main`.

## Round 7 re-audit for S70-PO-1 item 1 (2026-11-23)

Scope: PO/WO-only assignment-state and client-code visibility; Trainer denial; migration forwarding after the `origin/main` merge. The spec and staff directory contract now state the approved access boundary. No new status, data model, or assignment behavior is introduced.

| ID        | Category     | Severity | Location(s)                                                 | Summary                                                                                                                                                                                                        | Recommendation                                                                                                                                                                         |
| --------- | ------------ | -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F22-S70-1 | PO copy / UI | HIGH     | `copy-proposal.md`; `app/(app)/clients/page.tsx`; T034-T035 | The exact assignment-filter label/options and client-code row label are absent from the referenced copy artifact. The page also displays the code-search placeholder to Trainers, contrary to S70-PO-1 item 1. | Keep those controls/row display unrendered until exact approved strings are located; do not advertise code search to Trainers. Record the copy-source question in the S70 lane report. |

Server/database review: current `staff_client_directory` enforces its F11 Platform Owner/Workspace Owner predicate for both assignment and exact code matching/output; the existing Trainer tests assert ignored assignment filters, absent assignment/code keys, and no code match. Application service repeats the owner predicate and removes restricted row fields. The RLS catalog has no `staff_client_directory` entry and needs one. No finding in scope on data mutation or money math. Acceptance remains blocked on F22-S70-1; no UI copy is inferred.

Critical 0, High 0.

## Round 8 re-audit for S70-PO-2 (2026-11-23)

S70-PO-2 (verbatim source SHA-256 `AC5DEE4F353FDE79B58B43DE2DD13B4343F6C36754969F995CD4748556D8AA0E`) resolves the Round 7 F22-S70-1 copy gap and clarifies that username search is available to every staff role within existing row visibility. `spec.md`, `copy-proposal.md`, the staff directory contract, plan, and tasks now record the same role boundary and exact strings. T044/T045 cover RED-first RPC tests, rendered owner-only filter/code, and the role-specific placeholder test.

Re-analysis findings: no cross-artifact contradiction, new role/data rule, or missing task/test trace was found. The old F22-S70-1 HIGH finding is resolved by the recorded PO decision and updated artifacts; its code-search disclosure is addressed by the trainer/non-owner placeholder and the unchanged PO/WO database/application wall. Existing T036/T037 owner gaps are unchanged and remain separately tracked. No open CRITICAL or HIGH findings. No open ambiguities for this directory slice.
