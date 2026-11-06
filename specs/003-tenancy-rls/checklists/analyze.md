# Spec Kit Analyze — F3 Workspace Tenancy, Permission Matrix & RLS (S35 G1 resolution)

- Date: 2026-11-06 08:19 +02:00 (fresh analysis after S35-PO-1 G1=A resolution and the S35 round-2 CodeRabbit documentation fixes: deactivate/revoke, no deletion)
- Analyzed source baseline: `21c022f15ba0254271191167a7a87826c4787f60` (S35 documentation amendment `docs(spec 003): resolve S35-PO-1 G1=A (deactivate/revoke; preserve audit)`, parent `552361c41a231c8cbbf37b7cab7c828b03eb528d` = S34 baseline; no source, migration, workflow, or test files changed in this amendment or in the round-2 fixes).
- Static code/test evidence baseline: `d04ef52` (branch base; no code, migration, workflow, or test files changed in this amendment). The #47 compliance refresh remains the source for the 16 baseline traceability rows.
- Scope: F3 baseline (`FR-001`..`FR-012`, `SC-001`..`SC-004`), the S30-PO-3 Q7/Q8 governance amendment (`FR-013`, `FR-014`, `SC-005`, `SC-006`), and the S35 resolved departed-trainer departure requirement (`FR-015`, `SC-007`).
- Method: static cross-artifact, migration, FK, trigger, workflow, and test-source review. No tests, builds, SQL execution, stacks, or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..FR-015, SC-001..SC-007, seven GWT story groups), `plan.md`, `tasks.md` (T001-T020), `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`, `traceability.md`, and this analysis.
- `spec.md` has numbered FRs, measurable SCs, and Given/When/Then acceptance scenarios for every touched behavior. Story 7 now reflects the resolved G1=A model (deactivate + revoke; no deletion).
- Clarifications: S30-PO-3 Q6/Q7/Q8 remain recorded. S35-PO-1 records G1=A (deactivate/revoke; preserve audit) verbatim and G2=A. No ambiguity is assumed: G1 is resolved by this decision; the only remaining open item is the absence of a deactivation capability in the current schema, tracked by T020 (tagged FR-015).
- Plan/tasks: T001-T013 cover the F3 baseline; T014-T016 cover the roster and G2-scoped final-PO guard; T017-T020 cover the resolved trainer-departure model. Every new task is tagged with its FR/SC IDs and states its prerequisite. T017-T019 are no longer BLOCKED.
- Initial entry result: PASS. Requirements/scenarios PASS, clarifications PASS, plan/tasks PASS, and this analysis is dated after the last spec/plan/tasks change with 0 open CRITICAL/HIGH findings.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist, but the tests do not establish every helper condition or every attempted identity-widening path. | Keep FR-004 PARTIAL pending broader assertions. |

The only retained findings are A1 and A2. There are **0 open CRITICAL/HIGH findings**. PO-ESCALATION G1 is resolved by S35-PO-1 G1=A (no deletion); the absence of a deactivation capability is an implementation gap tracked by T020, not an Analyze ambiguity.

## Coverage and constitution

- FR-to-task coverage: FR-001..FR-012 map to T001-T013; FR-013 maps to T014/T016; FR-014 maps to T015/T016; FR-015 maps to T017-T020. All 15 FRs have task coverage.
- SC-to-task coverage: SC-001..SC-004 map to T001-T013; SC-005 maps to T015/T016; SC-006 maps to T014/T016; SC-007 maps to T017-T020. All 7 SCs have task coverage.
- No orphan task was found. The G1 lane is ordered T017 (RED-first characterization) -> T020 (deactivation capability) -> T018 (forward-only migration with S32-R1 all-origin-refs uniqueness) -> T019 (independent security/audit review).
- G2 removes membership revocation/hard deletion and auth-user cascade from the final-PO matrix because those paths do not affect valid Platform Owner count. The remaining role-demotion and staff-profile-deletion paths share one serialization invariant.
- Constitution v1.5.0: Principle I requires workspace isolation; Principle III requires least-authority governance; Principle VI preserves membership/history. G1 now preserves the auth user and `staff_profiles` row and all protected history. The analysis makes no implementation-conformity claim without code and executed tests.

## Static FK and trigger findings

- On the start HEAD and `origin/main`, the relevant migration set is identical for this evidence: 40 FKs directly reference `auth.users` or `public.staff_profiles` (19 and 21 respectively); no FK references `public.workspace_memberships`. Thirty-five use `ON DELETE RESTRICT`; five use PostgreSQL's default `NO ACTION`.
- None of those referencing tables is trainer-only/disposable. They hold shared governance, client, plan, log, subscription, financial, audit, catalog-provenance, or idempotency records.
- `public.staff_profiles.user_id` -> `auth.users(id)` is `ON DELETE RESTRICT`, so deleting the auth user is rejected while the `staff_profiles` row exists. `staff_profiles_no_delete`, `workspace_memberships_no_delete`, and `workspaces_no_delete` are separate controls that fire only on direct deletes of their own tables (including for privileged callers) and do not run on the auth-user parent-delete path. Under G1=A these guards intentionally remain; departure is performed by deactivation + revoke, not deletion.
- Existing tests cover application DELETE denial, immutable/no-delete triggers, restrictive client FKs, and a client auth-deletion failure. No existing test covers a successful departed-trainer deletion, because that behavior is no longer in scope.

## Static traceability

`traceability.md` covers 22 feature rows: 5 VERIFIED, 11 PARTIAL, 6 NOT-FOUND, 0 DEFERRED. The existing feature citations were checked statically; the S35 FR-015/SC-007 rows are NOT-FOUND and track the missing deactivation capability (T020) and executed tests. No test suite or CI job was run. PARTIAL rows identify gaps in composite/schema assertions, source confirmation, coverage breadth, CI workflow assertions, migration direction, and PII scans.

## Implementation gates (not Analyze defects)

- T014 remains open until its roster migration and executed positive/negative tests pass; T016 records the subsequent architect security/evidence package.
- T015 is not blocked by G1 (S35-PO-1 G1=A). Its role-demotion and staff-profile-deletion guard work (G2=A scope) is independent; departed-trainer deletion stays blocked by the retained no-delete trigger and RESTRICT FK. T016 follows T014/T015.
- T017-T020 cover the resolved deactivate+revoke model and are no longer blocked. T020 specifically tracks the missing deactivation capability (tagged FR-015). No deletion mechanism is introduced.
- These are implementation, evidence, security, and PO-approval gates. They are not open CRITICAL/HIGH Analyze findings.

## Verdict

**PASS WITH OPEN BLOCKERS — 0 open CRITICAL/HIGH findings** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW). The two retained MEDIUM evidence gaps are A1 (FR-003 assertion breadth) and A2 (FR-004 helper/access-widening breadth); both are visible in traceability and are not claimed closed. The roster, G2-scoped final-PO, and resolved G1 deactivate+revoke artifacts are ready for their independent implementation lanes after their stated gates. PO-ESCALATION G1 is closed by S35-PO-1 G1=A. This static document review does not claim implementation completion.

## History

- 2026-11-06 08:19 +02:00, S35 round-2 CodeRabbit fixes (review 5795944252): corrected the analyzed-baseline header to name the S35 amendment `21c022f` and its S34 parent `552361c`; replaced the T015 "BLOCKED pending G1" gate with the G1=A resolution (G2=A guard scope unchanged). Verdict unchanged: 0 open CRITICAL/HIGH with A1/A2 MEDIUM retained.
- 2026-11-06, S35 G1 resolution: recorded S35-PO-1 G1=A verbatim (deactivate/revoke; preserve audit), resolved PO-ESCALATION G1, rewrote FR-015/SC-007 and T017-T019 to the deactivate+revoke model (no deletion), added T020 for the missing deactivation capability (tagged FR-015), updated traceability. Verdict: 0 open CRITICAL/HIGH with A1/A2 MEDIUM retained. No tests, builds, SQL, stacks, or code were run.
- 2026-11-05 04:58 +02:00, S34 G1/G2 round: recorded G1=A (conditional) and G2=A verbatim; FR-015/SC-007 and T017-T019 BLOCKED. Verdict 0 open CRITICAL/HIGH.
- 2026-11-04 19:38 +02:00, S33 CodeRabbit docs round: corrected traceability summary. Verdict 0 CRITICAL/HIGH.
- 2026-11-04 17:59 +02:00, S33 SK-A9 fix round: restored Project Structure and Complexity Tracking. Verdict unchanged.
- 2026-11-04, reconciled with #47 compliance merge `ff6e0b9`.
- 2026-11-03, refreshed on `e9888dc` / `e8c03d4` / `7fd9461`: roster RPC projection, final-PO guard, clarification wording.
- 2026-11-03, base analysis on `d04ef52`: found open scope/active-state questions (A1/A2).
- First SK-A merged-feature review on `origin/main` `ed88574`: initial verdict 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW.
