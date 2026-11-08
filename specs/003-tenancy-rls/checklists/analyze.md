# Spec Kit Analyze — F3 Workspace Tenancy, Permission Matrix & RLS (S37 round 2: replacement-PO model; PO gates S37-Q4, S37-Q5)

- Date: 2026-11-08 18:50 +02:00 (re-analysis after the S37-PO-3 / S37-PO-4 edits in commit `7bc877b4`; research.md S37 safeguard audit added in the following commit)
- Analyzed baseline: `7bc877b4` on branch `speckit-003-q2c`, on top of `origin/main` `6d4c41148e789da31e19081041e7aa511c310e1c` (PR #50 merge). No source, migration, workflow, or test files changed.
- Scope: F3 baseline (`FR-001`..`FR-012`, `SC-001`..`SC-004`), the S30-PO-3 Q7/Q8 governance amendment (`FR-013`, `FR-014`, `SC-005`, `SC-006`), the S35 departed-trainer requirement (`FR-015`, `SC-007`), and the S36-Q2 = C / S37-PO-3 / S37-PO-4 revocation and ownership-change semantics (`FR-016`, `SC-008`).
- Method: static cross-artifact, migration, FK, trigger, `lib/auth` and test-source review. No SQL executed, no stack started, no CI job run. Local gates: `prettier --check specs/003-tenancy-rls` passes; `npm run lint` passes; `npm run check:secrets` exits 1 locally with "No client build directories found" (no build output in the worktree; CI runs it at `.github/workflows/ci.yml:45` and is authoritative).

## Inventory and entry check

- Present: `spec.md` (FR-001..FR-016, SC-001..SC-008, Stories 1-7), `plan.md`, `tasks.md` (T001..T027; T023 RETIRED), `research.md` (with the S37 safeguard audit), `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`, `traceability.md`, and this analysis.
- Entry check (Spec Kit gate section 1):
  - `spec.md` has numbered FRs, measurable SCs and Given/When/Then scenarios for every touched scope: PASS.
  - Clarifications record S30-PO-3 Q6-Q8, S35-PO-1 G1/G2, S36-PO-2 verbatim, S36-Q1 and S36-Q2 (both marked superseded in part), S37-PO-3 and S37-PO-4 verbatim (byte-checked), S37-Q1 resolved, S37-Q2 removed, S37-Q3 resolved, and PENDING-PO MCQs S37-Q4 and S37-Q5. "No open ambiguity" is NOT claimed: S37-Q4 and S37-Q5 are open and named: PASS.
  - `plan.md` covers the touched scope (blockers table, resolved decisions, FR-014 / FR-016 plan text): PASS.
  - `tasks.md` has a task ID for every touched item, tagged with FR/SC IDs: PASS.
  - `checklists/analyze.md` is dated after the last spec/plan/tasks/data-model/traceability change (commit `7bc877b4`) and has 0 open CRITICAL and 0 open HIGH defect findings (see verdict): PASS.

## Findings (defects)

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | OPEN. Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist; the tests do not establish every helper condition or every identity-widening path. | OPEN. Keep FR-004 PARTIAL pending broader assertions. |
| A3 | Former gap: membership-revocation removal mechanism (S36-Q1) | Superseded, not a defect | `spec.md` FR-014, Story 6 scenario 2, Clarifications | The atomic demotion of S36-Q1 option (a) is removed by S37-PO-3 and S37-PO-4. | CLOSED (superseded). |
| A4 | Former gap: fixed non-PO target role (S36-Q2 = C) | Superseded, not a defect | `spec.md` FR-014, Clarifications; `data-model.md`; `plan.md`; `tasks.md` T015, T022, T023 | The `workspace_owner` target and the T023 atomic-target test are removed. T023 is RETIRED with its ID kept. | CLOSED (superseded). |
| A5 | Undecided: stale-session mechanism (S37-Q1) | Resolved | `research.md` S37 audit; `spec.md` FR-016(c); `tasks.md` T027 | The audit shows the role and membership are re-read per request in the DB helpers (`tenancy.sql:38-77`) and in `getActor()` (`lib/auth/actor.ts:23-51`). No gap was found, so no mechanism is added. | CLOSED (resolved by existing per-request authorization). |
| A6 | Undecided: other active memberships of a demoted identity (S37-Q2) | Removed (moot) | `spec.md` Clarifications; `tasks.md` T025 | The question depended on the atomic demotion that S37-PO-3 and S37-PO-4 remove. This also removes the previous round's open question on whether it should be classified HIGH. | CLOSED (removed). |
| A7 | Undecided: Platform Owner workspace creation (S37-Q3) | Resolved | `spec.md` FR-016(d), Clarifications | S37-PO-3 says the PO creates the workspace manually through the normal flow. The audit found no automatic provisioning. | CLOSED (resolved by S37-PO-3). |
| A8 | Test design error (T027(d) in the previous round) | MEDIUM, fixed in this round | `tasks.md` T027 | The previous text required a pure `authorize()` to deny a stale actor object. A pure function cannot detect staleness, so that assertion could not be met. T027 now characterizes the per-request re-read in `getActor()` and `loadActorRows()` (`lib/auth/actor.ts:23-51`). | CLOSED (fixed in `7bc877b4`). |

Open defect findings: **2** (A1 MEDIUM, A2 MEDIUM). Closed in this round: **6** (A3, A4, A5, A6, A7, A8).

## Gates (PO decisions and implementation; not counted as defects)

| ID | Item | Where | Status | Blocks |
|---|---|---|---|---|
| G-1 | S37-Q4: mechanism of the "safely delete the old account" step | `spec.md` S37-Q4; `tenancy.sql:5`; `audited_tables_no_delete.sql:17`; G1=A; FR-015 | PENDING-PO (MCQ with options and recommendation (a)) | Only the deletion step. The replacement-PO step and the last-PO guard are not blocked. |
| G-2 | S37-Q5: whether a membership revocation removes Platform Owner access | `spec.md` S37-Q5; `tenancy.sql:67-68`; S36-PO-2 | PENDING-PO (MCQ with options and recommendation (a)) | The PO case of FR-016(a), T022, T024 (membership-revocation case) and the PO case of T025. |
| G-3 | Last-PO guard (FR-014) is not implemented on `origin/main` | `research.md` S37 audit, finding F-A1; `tenancy.sql:127-128` (a PO can change their own role, read-only reasoning) | Implementation gate; approved requirement; existing pending tasks T015, T021, T022, T024 | The implementation of the guard. This is the largest open risk in the round and is not an analysis defect. |

## Coverage and constitution

- FR-to-task coverage: FR-001..FR-012 map to T001-T013; FR-013 maps to T014/T016; FR-014 maps to T015/T016/T021/T022/T024; FR-015 maps to T017-T020; FR-016 maps to T025 (a)(b)(c), T026 (b), T027 (c). FR-016(d) (manual PO workspace creation) needs no new task: it is covered by the existing governance test T009 ("PO succeeds at: create workspace C"). All 16 FRs have coverage.
- SC-to-task coverage: SC-001..SC-004 map to T001-T013; SC-005 maps to T015/T016/T021/T022/T024; SC-006 maps to T014/T016; SC-007 maps to T017-T020; SC-008 maps to T025-T027. All 8 SCs have coverage.
- Last-PO guard tests: T021 (b) sole-PO demotion refusal and (d) concurrent demotions are not blocked. The membership-revocation cases (T022 (b)(d), T024 (a)(b)) are BLOCKED by S37-Q5.
- Constitution: Principle I (isolation) is unchanged. Principle III (least-authority governance): the last-PO guard and PO-only governance writes are kept. Principle VI (history): memberships are revoked, never deleted. Principle VII (privacy): synthetic data only. No table, workflow or state is added by this round.

## Static traceability

- `traceability.md` has 24 rows (FR-001..FR-016 and SC-001..SC-008): 5 VERIFIED, 11 PARTIAL, 8 NOT-FOUND, 0 DEFERRED. **Count correction:** the previous round recorded 22 rows and 6 NOT-FOUND; the table contains 24 rows, of which FR-013, FR-014, SC-005, SC-006, FR-015, SC-007, FR-016 and SC-008 are NOT-FOUND (8).
- Status changes in this round: none. Rows FR-014, SC-005, FR-016 and SC-008 keep NOT-FOUND, with updated task and gate text.

## Implementation gates (not Analyze defects)

- T014 open until its roster migration and tests pass. T016 follows T014 and T015.
- T015: the demotion and staff-profile-deletion branches are implementable after T021 RED tests. The membership-revocation branch waits for S37-Q5 (G-2). The atomic role change is not implemented.
- T017-T020 (G1=A lane): not blocked. No deletion mechanism is introduced.
- T021: not blocked. T022 and T024: BLOCKED by S37-Q5. T023: RETIRED.
- T025: non-PO zero access is not blocked; the PO case is BLOCKED by S37-Q5. T026: not blocked. T027: a characterization of the existing per-request authorization; not blocked.
- Old-account deletion is BLOCKED by S37-Q4 (G-1).
- Task checkboxes: 13 ticked (T001-T013), 13 open, 1 RETIRED (T023); total 27 IDs.

## Verdict

**PASS WITH OPEN ITEMS: 0 open CRITICAL findings; 0 open HIGH defect findings; 2 MEDIUM defect findings (A1, A2) retained; 6 findings closed (A3-A8); 2 PO gates (G-1 / S37-Q4 and G-2 / S37-Q5) and 1 implementation gate (G-3, last-PO guard, T015).** The architect decides whether G-1 or G-2 is HIGH: if either is classed HIGH, the verdict becomes 0 CRITICAL / 1 HIGH (or 2 HIGH). This analysis does not down-grade either item silently. This is a static document review; it makes no implementation-conformity claim.

## History

- 2026-11-08 18:50 +02:00, S37 round 2 (PR #67, PO decisions S37-PO-3 and S37-PO-4, branch `speckit-003-q2c`): commit `7bc877b4` removed the atomic demotion requirements (S36-Q1 option (a), S36-Q2 = C demotion clause, S36-PO-2 former-PO demotion) from spec.md, plan.md, data-model.md, tasks.md and traceability.md; recorded S37-PO-3 and S37-PO-4 verbatim; kept the last-PO guard, zero-access revocation, no automatic membership and tenant isolation. S37-Q1 resolved by existing per-request authorization (research.md S37 audit, no gap found); S37-Q2 removed; S37-Q3 resolved by S37-PO-3; T023 retired; T022, T024 and the PO case of T025 blocked by S37-Q5; T027 rewritten as a characterization test (A8). New PO gates S37-Q4 (old-account deletion mechanism) and S37-Q5 (membership revocation and PO access). Audit finding F-A1: last-PO guard not implemented (T015). Verdict: 0 open CRITICAL; 0 open HIGH defects; A1/A2 MEDIUM retained. No tests, builds, SQL, stacks, or CI jobs were run; prettier and lint run locally.
- 2026-11-08 18:20 +02:00, S37 (PR #50 follow-up, branch `speckit-003-q2c` on `6d4c4114`): recorded S36-Q2 = C verbatim (`spec.md` Clarifications). FR-014 target role set to `workspace_owner`; new FR-016 (zero access, no automatic membership, stale-session bypass blocked) and SC-008; Story 6 scenario 5; tasks T023–T027 (RED-first) and T015/T022 updated; plan.md, data-model.md and traceability.md updated. Escalated S37-Q1, S37-Q2 and S37-Q3 as PENDING-PO. Verdict: 0 open CRITICAL; 0 open HIGH defects; A1/A2 MEDIUM retained. No tests, builds, SQL, stacks, or CI jobs were run.
- 2026-11-08 18:45 +02:00, S37 CodeRabbit round (PR #67, review on `37b26d9`, 2 inline threads): (1) T025(a) narrowed to `workspaces` zero-row access; the existing `workspace_memberships` own-row SELECT policy is unchanged and not asserted against (no policy change; not a PO decision). (2) T027(d) added: an actor object loaded before a non-PO membership revocation is denied `coaching_work` by `authorize()` (RED only; GREEN mechanism still BLOCKED by S37-Q1). Verdict unchanged.

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
