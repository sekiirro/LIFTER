# Spec Kit Analyze — F19 Shared Plan Core

- **Date:** 2026-11-10 01:34 UTC (Analyze rerun after final S42-PO-4 edits)
- **Freshness:** Refreshed after the final spec, plan, tasks, data-model, contract, and traceability edits for S42-PO-4.
- **Scope:** Spec-only F19 rebuild: FR-001-FR-014, SC-001-SC-012, contracts, data model, traceability, PO decisions A1-A8/B and S42-PO-2/3/4.
- **Base:** `origin/main` `d0c5d1ac7ec8adb13ad12712f85cf9702a97a414`; prior branch text `origin/019-plan-core` read only.
- **Method:** Static cross-artifact, authority, supersession, state, persistence, and edge-case analysis. No application tests/builds were run or added.

## Entry check

At the start of this documentation rebuild, `specs/019-plan-core/{spec.md,plan.md,tasks.md,traceability.md,checklists/analyze.md}` were absent on `origin/main`. The entry gate therefore failed for implementation readiness. Only the explicitly requested Spec Kit documentation rebuild proceeded; no implementation task was started.

| Required item                                             | Result                          | Evidence                                                                                                 |
| --------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Numbered FRs, measurable SCs, Given/When/Then             | PASS in rebuilt artifacts       | `spec.md` FR-001-FR-014 and SC-001-SC-012; scenario per criterion                                        |
| Clarifications with explicit ambiguity status             | PASS in rebuilt artifacts       | `spec.md` Clarifications; “No open ambiguities” explicitly not claimed; MCQ-11 listed                    |
| Plan and task IDs tagged with FRs                         | PASS in rebuilt artifacts       | `plan.md` sequence; `tasks.md` T001-spec/T010–T032 with FR coverage table                                |
| Analyze dated after spec/plan/tasks, 0 open Critical/High | PASS for this artifact revision | This analysis date follows the final spec/plan/tasks authoring; findings below show 0 open Critical/High |

## Static findings

| ID  | Severity | Finding                                                                                                                                        | Disposition                                                                                                                                            |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | CRITICAL | Old projection contract omitted plans lacking a first-delivery marker, conflicting with A5.                                                    | Fixed: one `plan_deliveries` table; projection includes every delivered plan and has no first-marker omission.                                         |
| A2  | HIGH     | Old activation contract required both typed delivery links and a durable outbox fallback, conflicting with Override and S42-PO-2 architecture. | Fixed: three activation sources, source-specific typed-link checks, atomic transaction, no outbox; no fabricated delivery rows.                        |
| A3  | HIGH     | Old renewal-credit text conflicted with Q2/Q3.                                                                                                 | Fixed: renewal activation at recording, no productivity unit; supersession is enumerated without changing neighbor files and cites current-main lines. |
| A4  | HIGH     | `CatalogSnapshotRef` V1 did not match current F16 snapshot/version semantics.                                                                  | Fixed: `ExerciseSnapshotV2`, immutable food-version references, live Video, frozen planner values.                                                     |
| A5  | HIGH     | Legacy migration timestamp range is stale and cannot be reserved.                                                                              | Fixed: no version numbers in this spec; all-refs scan required during implementation.                                                                  |
| A6  | HIGH     | Q5 recipient and Q10 assignment semantics needed separation.                                                                                   | Fixed: recipient only; no assignment write; selection required only when no trainer is assigned.                                                       |
| A7  | HIGH     | Trainer deletion/history retention needed F11 alignment.                                                                                       | Fixed: RESTRICT/no-cascade and retained non-login author ID per F11 policy; PR #73 remains pending, not merged.                                        |
| A8  | MEDIUM   | Four readiness states conflicted with the one Ready & Publish action.                                                                          | Fixed: contract uses only `draft` and `published`, with rationale.                                                                                     |
| A9  | MEDIUM   | Delivery needed a measurable definition.                                                                                                       | Fixed: Ready & Publish without a current subscription is refused; no published-but-undelivered revision exists.                                        |
| A10 | MEDIUM   | Expiry example copy was not approved; Q11 approves only body.                                                                                  | Fixed: body extracted from PO source and byte-compared; title/button remain MCQ-11.                                                                    |
| A11 | MEDIUM   | PO override scope could conflict with cancelled/refunded/deactivated state and assignment.                                                     | Fixed by Q9/Q10: generic `not_permitted`, no assignment side effect; tests required in T022.                                                           |
| A12 | LOW      | Prior task text used agent/model owner names and mislabeled static evidence as tests.                                                          | Fixed: skill/risk ownership; traceability marks all implementation tests as required/not run.                                                          |
| A13 | MEDIUM   | Q5 did not specify the automatic activation recipient when no trainer is assigned.                                                             | Fixed by S42-PO-4: credit completing delivery Trainer publisher; refuse completion if publisher is not a Trainer.                                      |

**Open Critical: 0. Open High: 0.** MCQ-11 is the only remaining product decision and blocks only final renewal page title/button copy. F11 PR #73 is pending; retained non-login author ID policy is documented without treating PR text as merged.

## Cross-artifact and edge-case sweep

- ID inventory: FR-001–FR-014 and SC-001–SC-012 exist in spec and traceability; task FR tags and plan dependencies resolve. T001-spec/T010–T032 and MCQ-11/12/13/14 decisions resolve. No `research/*` files were created or referenced.
- Decision coverage: A1–A8, baseline B, Q1–Q8, Q9–Q11 all map to FR/SC rows. PO words and architect mappings are labeled separately.
- State coverage: private draft, stale CAS, exact replay, changed-key conflict, unknown commit, independent delivery days, delivery rollback, concurrent second-kind delivery, already-activated delivery, zero/one/two-delivery Override, renewal, expired/deactivated client, assigned/unassigned trainer paths, unlimited plan visibility, no-subscription publish refusal, source copy, and trainer deletion are addressed.
- Access matrix: Trainer/Workspace Owner/Platform Owner can edit within workspace; Sales cannot; cross-workspace denied. Client reads are self-scoped and exclude drafts/undelivered plans.
- Data retention: no cascade; restrictive author references retain deleted trainer non-login account ID under pending F11 deletion policy.
- Copy review: Q11 page body only; byte comparison evidence is in run report. No title/button/error copy was invented. Existing generic error `not_permitted` is referenced.
- Persistence claims: no mocks/static checks counted as persistence. All implementation persistence/concurrency tests remain named requirements in tasks/traceability.
- Cross-feature supersessions: 013, 012, docs/01, docs/02, and docs/03 conflicts are listed with superseding authority; those neighboring files are untouched.

## Verdict

**PASS for the spec-only documentation scope; 0 open Critical and 0 open High findings.** Implementation readiness remains subject to normal implementation review and MCQ-11 for final renewal-page title/button copy. This checklist does not claim tests, implementation, or production readiness.
