# Analyze: Client Portal Delivery

**Date**: 2026-11-15 (full Analyze after the S57-PO-5, S57-PO-9, S57-PO-10, S57-PO-11 and S57-PO-12 requirement changes)
**Inputs**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, `copy-proposal.md`, PO S56-PO-4, S57-PO-5, S57-PO-9, S57-PO-10, S57-PO-11, S57-PO-12

## Changes analyzed

- FR-003, User Story 1 scenario 4, SC-003, the override edge case and the Productivity point entity now follow S57-PO-11: a PO override gives an eligible new client its one unit under F19-FR-007. The S48-PO-19 zero-point clarification is kept and marked superseded. T011 is updated to match.
- FR-005 now encodes S57-PO-5 (last covered day, display only) and S57-PO-12 (approved status labels; Refunded only for a full refund; a partial refund shows no label; the directory reuses the labels and its Refunded filter matches full refunds only). Data model, contracts, research, T016 and T035 match.
- FR-004 encodes S57-PO-9: the plan body uses the F17/F18 shared read-only views, and P4 builds no renderer. T017 and research match.
- FR-009 encodes S57-PO-10: an F19-owned hook, and a P4 client-recipient extension of the F15 inbox reused by spec 023. Data model (new client notice record), plan storage, contracts, research, T021 and T022 match.
- A Client navigation reuse boundary records S57-PO-12 "Top 5 belongs inside Progress, not Main Navigation".
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
| FR-009          | Yes       | T003, T019-T022                                        | F15 inbox client-recipient extension and F19 hook (S57-PO-10)              |
| FR-010          | Yes       | T003-T004, T013-T014, T018, T023-T027, T032-T033, T038 | Identity, privacy and workspace boundaries                                  |
| FR-011          | Yes       | T003-T004, T030-T038                                   | Approved directory fields, filters and indicators                           |
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
