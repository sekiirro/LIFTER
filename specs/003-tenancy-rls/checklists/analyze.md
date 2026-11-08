# Spec Kit Analyze — F3 Workspace Tenancy, Permission Matrix & RLS (S36 round-4 / S36-Q1 answered)

- Date: 2026-11-08 15:57 +02:00 (fresh analysis after the S36 round-4 edits: PO answer S36-Q1 = option (a), quoted verbatim in `spec.md` Clarifications; Story 6 scenario 2, FR-014, data-model.md helpers, plan.md, tasks.md (T015, T021, T022) and traceability.md updated; the S36-Q2 target-role question is recorded as OPEN and not encoded)
- Analyzed source baseline: working tree on top of `f537d7531b43b159e5c9843fab3193ce8ad17bcb` (PR #50 head before S36 round 4), with the round-4 documentation edits applied to `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, `data-model.md` and this file. No source, migration, workflow, or test files changed.
- Static code/test evidence baseline: `d04ef52` (branch base). The #47 compliance refresh remains the source for the 16 baseline traceability rows.
- Scope: F3 baseline (`FR-001`..`FR-012`, `SC-001`..`SC-004`), the S30-PO-3 Q7/Q8 governance amendment (`FR-013`, `FR-014`, `SC-005`, `SC-006`) as amended by S36-PO-2, and the S35 resolved departed-trainer departure requirement (`FR-015`, `SC-007`).
- Method: static cross-artifact, migration, FK, trigger, workflow, and test-source review. No tests, builds, SQL execution, stacks, or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..FR-015, SC-001..SC-007, seven GWT story groups), `plan.md`, `tasks.md` (T001-T022), `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`, `traceability.md`, and this analysis.
- `spec.md` has numbered FRs, measurable SCs, and Given/When/Then acceptance scenarios for every touched behavior. Story 6 scenarios 1-4 now name demotion AND membership revocation (S36-PO-2).
- Clarifications: S30-PO-3 Q6/Q7/Q8 remain recorded. S35-PO-1 records G1=A and G2=A. S36-PO-2 is recorded verbatim in the spec decision register (`spec.md`, Clarifications). S36-Q1 is answered by the PO (#50 bullet, verbatim in `spec.md` Clarifications) with option (a). S36-PO-2 is unchanged.
- Open PO question: **S36-Q2** (the fixed non-PO target role for a membership-revocation demotion; see the Findings escalation below). It is recorded as PO-DECISION-NEEDED in the S36 round-4 run report and is not encoded as a requirement, default or test expectation.
- Plan/tasks: T001-T013 cover the F3 baseline; T014 covers the roster; T015 covers the S36-amended final-PO guard (demotion, membership revocation with the S36-Q1(a) atomic role demotion, staff-profile deletion); T016 covers architect review; T017-T020 cover the resolved trainer-departure model; T021 (RED, demotion path) and T022 (RED, membership-revocation path) cover the S36-PO-2 RED tests, each including last-PO refusal and atomic rollback. Every new task is tagged with its FR/SC IDs and states its prerequisite.
- Entry result: PASS for the requirements and scenarios, clarifications (S36-Q2 is stated explicitly and is not assumed), and plan/tasks tagging. Open item: S36-Q2 blocks only the fixed target-role value of T015's membership-revocation branch. T021 and T022 assert only that `platform_owner` access is removed, so they are not blocked. This analysis is dated after the last spec/plan/tasks/data-model change.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist, but the tests do not establish every helper condition or every attempted identity-widening path. | Keep FR-004 PARTIAL pending broader assertions. |
| A3 | Former gap: how membership revocation removes PO access (S36-Q1) | Resolved by PO (option (a)) | `spec.md` FR-014, Story 6 scenario 2, Clarifications; `data-model.md` helpers | The PO answer (#50 bullet, verbatim in `spec.md` Clarifications) makes revocation of a PO membership demote the staff role in the same transaction, under the same last-PO guard, atomically. FR-014, Story 6 scenario 2, data-model.md, plan.md and tasks.md now encode this. | Closed. T022 and T015's revocation branch are unblocked except for the fixed target role (A4). |
| A4 | Escalated product question (PO-DECISION-NEEDED S36-Q2); not classified as an Analyze defect in the spec text | Escalated (see note) | `spec.md` FR-014, Clarifications; `data-model.md` helpers; `plan.md` blockers table; `tasks.md` T015 | The PO decision says "role demotion" but names no non-PO target role. `staff_profiles.role` is NOT NULL, and a membership revocation has no role parameter, so the revocation branch needs a fixed target role (options: `workspace_owner`, `trainer`, `sales`). The spec does not choose one. | Escalated to the PO as S36-Q2 in the S36 round-4 report. Blocks only the fixed target-role value of T015's revocation branch. T021 and T022 are target-neutral and are not blocked. **Architect note:** if the architect classifies A4 as HIGH, this analysis's verdict becomes 0 CRITICAL / 1 HIGH and the S36 "0 CRITICAL/0 HIGH" gate is not met. This analysis does not down-grade it silently; the classification is the architect's call. |

The retained findings are A1 and A2 (MEDIUM) and the escalation A4. There are **0 open CRITICAL findings** and **0 open HIGH findings** among the Analyze findings above, with A4 escalated as stated.

## Coverage and constitution

- FR-to-task coverage: FR-001..FR-012 map to T001-T013; FR-013 maps to T014/T016; FR-014 maps to T015/T016/T021/T022; FR-015 maps to T017-T020. All 15 FRs have task coverage.
- SC-to-task coverage: SC-001..SC-004 map to T001-T013; SC-005 maps to T015/T016/T021/T022; SC-006 maps to T014/T016; SC-007 maps to T017-T020. All 7 SCs have task coverage.
- No orphan task was found. The G1 lane is ordered T017 (RED-first characterization) -> T020 (deactivation capability) -> T018 (forward-only migration with S32-R1 all-origin-refs uniqueness) -> T019 (independent security/audit review).
- S36-PO-2 lane: T021 (RED, demotion path) -> T015 (demotion branch) -> T016. T022 (RED, membership-revocation path; unblocked by S36-Q1 option (a)) -> T015 (revocation branch; fixed target-role value BLOCKED by S36-Q2) -> T016.
- Constitution v1.5.0: Principle I requires workspace isolation; Principle III requires least-authority governance; Principle VI preserves membership/history. The S36 amendment keeps membership hard deletion prohibited, keeps the staff-profile no-delete trigger and RESTRICT foreign keys, and adds no deletion path. The analysis makes no implementation-conformity claim without code and executed tests.

## Static FK and trigger findings

- On the start HEAD and `origin/main`, the relevant migration set is identical for this evidence: 40 FKs directly reference `auth.users` or `public.staff_profiles` (19 and 21 respectively); no FK references `public.workspace_memberships`. Thirty-five use `ON DELETE RESTRICT`; five use PostgreSQL's default `NO ACTION`.
- None of those referencing tables is trainer-only/disposable. They hold shared governance, client, plan, log, subscription, financial, audit, catalog-provenance, or idempotency records.
- `public.staff_profiles.user_id` -> `auth.users(id)` is `ON DELETE RESTRICT`, so deleting the auth user is rejected while the `staff_profiles` row exists. `staff_profiles_no_delete`, `workspace_memberships_no_delete`, and `workspaces_no_delete` are separate controls that fire only on direct deletes of their own tables (including for privileged callers) and do not run on the auth-user parent-delete path. Under G1=A these guards intentionally remain; departure is performed by deactivation + revoke, not deletion.
- The `workspace_memberships.workspace_id` → `workspaces(id)` relationship is asserted by no test (see `traceability.md` FR-002). This is an evidence gap, not a new finding.
- Existing tests cover application DELETE denial, immutable/no-delete triggers, restrictive client FKs, and a client auth-deletion failure. No existing test covers a successful departed-trainer deletion, because that behavior is no longer in scope.

## Static traceability

`traceability.md` covers 22 feature rows: 5 VERIFIED, 11 PARTIAL, 6 NOT-FOUND, 0 DEFERRED. The FR-002 row now names the missing `workspace_memberships`→workspace assertion and cites only what `rls-catalog.test.ts:792-803` covers. The FR-014/SC-005 rows cite T021/T022 and the S36-PO-2 amendment. No test suite or CI job was run.

## Implementation gates (not Analyze defects)

- T014 remains open until its roster migration and executed positive/negative tests pass; T016 records the subsequent architect security/evidence package.
- T015 is not blocked by G1 (S35-PO-1 G1=A). Its demotion and staff-profile-deletion branches are implementable after T021 RED tests. Its membership-revocation branch is implementable after T022 RED tests except for the fixed target-role value, which is BLOCKED by S36-Q2 (A4). Departed-trainer deletion stays blocked by the retained no-delete trigger and RESTRICT FK. T016 follows T014/T015.
- T017-T020 cover the resolved deactivate+revoke model and are not blocked. No deletion mechanism is introduced.
- These are implementation, evidence, security, and PO-approval gates. A4 is a PO-approval gate (S36-Q2) recorded above.

## Verdict

**PASS WITH OPEN ITEMS — 0 open CRITICAL findings; 0 open HIGH findings among the Analyze findings; 2 MEDIUM (A1, A2) retained; A3 closed by the S36-Q1 PO answer (option (a)); 1 escalated PO question (A4 / S36-Q2) blocking only the fixed target-role value of the membership-revocation branch of T015.** The S36-PO-2 revocation and demotion RED tests (T021, T022) are unblocked. This static document review does not claim implementation completion.

## History

- 2026-11-08 15:57 +02:00, S36 round 4 (PR #50): PO answered S36-Q1 with option (a) (#50 bullet recorded verbatim in `spec.md` Clarifications). Updated Story 6 scenario 2, FR-014, `data-model.md` helpers, plan.md (blockers table, guard rows, ND-F3-3, governance plan, clarification status), tasks.md (dependencies, T015, T021 (e) atomic rollback, T022 unblocked with (e) atomic rollback), traceability.md (FR-014/SC-005 rows). Escalated S36-Q2 (fixed non-PO target role for the revocation demotion). Verdict: 0 open CRITICAL/HIGH with A1/A2 MEDIUM retained. No tests, builds, SQL, stacks, or code were run.
- 2026-11-06 21:44 +02:00, S36 round 3 follow-up 2 (CodeRabbit review 5805979169 on `3ef0f4f`, threads `PRRT_kwDOVYgYQ860qh7o` and `PRRT_kwDOVYgYQ860qh7y`): plan.md escalation table lists S36-Q1 as OPEN (blocks T022 and T015's membership-revocation branch only); tasks.md dependency block split so that the S36-Q1 block applies only to T015's membership-revocation branch and T014 and T015 both gate T016. Verdict unchanged (0 open CRITICAL; 0 open HIGH among Analyze findings; A1/A2 MEDIUM; A3 escalated as S36-Q1).
- 2026-11-06 21:30 +02:00, S36 round 3 follow-up (CodeRabbit thread `PRRT_kwDOVYgYQ860ZwyS`): Story 6 scenario 2 now states that staff-profile deletion is not a removal path (`staff_profiles_no_delete`, shared serialization). Re-analysis: verdict unchanged (0 open CRITICAL; 0 open HIGH among Analyze findings; A1/A2 MEDIUM; A3 escalated as S36-Q1).
- 2026-11-06 21:24 +02:00, S36 round 3 (PR #50, CodeRabbit thread fixes): recorded S36-PO-2 verbatim (demotion AND membership revocation remove PO access; final-PO guard covers membership revocation; mapping option (c) per architect). Amended FR-014, SC-005, Story 6 scenarios 1-4, plan.md ND-F3-3 and governance plan, and tasks T015; added T021 (RED demotion) and T022 (RED revocation, BLOCKED by S36-Q1). Corrected FR-002 evidence in `traceability.md`. Escalated S36-Q1 (removal mechanism for membership revocation). No tests, builds, SQL, stacks, or code were run.
- 2026-11-06 08:19 +02:00, S35 round-2 CodeRabbit fixes (review 5795944252): corrected the analyzed-baseline header to name the S35 amendment `21c022f` and its S34 parent `552361c`; replaced the T015 "BLOCKED pending G1" gate with the G1=A resolution (G2=A guard scope unchanged). Verdict unchanged: 0 open CRITICAL/HIGH with A1/A2 MEDIUM retained.
- 2026-11-06, S35 G1 resolution: recorded S35-PO-1 G1=A verbatim (deactivate/revoke; preserve audit), resolved PO-ESCALATION G1, rewrote FR-015/SC-007 and T017-T019 to the deactivate+revoke model (no deletion), added T020 for the missing deactivation capability (tagged FR-015), updated traceability. Verdict: 0 open CRITICAL/HIGH with A1/A2 MEDIUM retained. No tests, builds, SQL, stacks, or code were run.
- 2026-11-05 04:58 +02:00, S34 G1/G2 round: recorded G1=A (conditional) and G2=A verbatim; FR-015/SC-007 and T017-T019 BLOCKED. Verdict 0 open CRITICAL/HIGH.
- 2026-11-04 19:38 +02:00, S33 CodeRabbit docs round: corrected traceability summary. Verdict 0 CRITICAL/HIGH.
- 2026-11-04 17:59 +02:00, S33 SK-A9 fix round: restored Project Structure and Complexity Tracking. Verdict unchanged.
- 2026-11-04, reconciled with #47 compliance merge `ff6e0b9`.
- 2026-11-03, refreshed on `e9888dc` / `e8c03d4` / `7fd9461`: roster RPC projection, final-PO guard, clarification wording.
- 2026-11-03, base analysis on `d04ef52`: found open scope/active-state questions (A1/A2).
- First SK-A merged-feature review on `origin/main` `ed88574`: initial verdict 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW.
