# Spec Kit Analyze — F3 Workspace Tenancy, Permission Matrix & RLS (S34 G1/G2 reconciliation)

- Date: 2026-11-05 04:01 +02:00 (fresh analysis after the S34 PO decision, FK audit, G2 scope correction, and CodeRabbit docs fixes)
- Analyzed source baseline: `dd8c4bec8505a0040d744057431f83c0d34ec151` (start HEAD); this analysis covers the S34 documentation working-tree change in `spec.md`, `plan.md`, `tasks.md`, and `traceability.md`.
- Static code/test evidence baseline: `d04ef52` (branch base; no code, migration, workflow, or test files changed in this amendment). The #47 compliance refresh remains the source for the 16 baseline traceability rows.
- Scope: F3 baseline (`FR-001`..`FR-012`, `SC-001`..`SC-004`), the S30-PO-3 Q7/Q8 governance amendment (`FR-013`, `FR-014`, `SC-005`, `SC-006`), and the S34 conditional trainer-deletion clarification (`FR-015`, `SC-007`).
- Method: static cross-artifact, migration, FK, trigger, workflow, and test-source review. No tests, builds, SQL execution, stacks, or CI jobs were run.

## Inventory and entry check

- Present: `spec.md` (FR-001..FR-015, SC-001..SC-007, seven GWT story groups), `plan.md`, `tasks.md` (T001-T019), `research.md`, `data-model.md`, `contracts/db-contract.md`, `quickstart.md`, `checklists/requirements.md`, `traceability.md`, and this analysis.
- `spec.md` has numbered FRs, measurable SCs, and Given/When/Then acceptance scenarios for every touched behavior. Story 7 explicitly distinguishes the verified blocked-deletion baseline from the still-blocked desired G1 outcome.
- Clarifications: S30-PO-3 Q6/Q7/Q8 remain recorded. S34-PO-1 records G1=A (conditional) and G2=A verbatim. No ambiguity is assumed: the G1 implementation mechanism and disposable-record set are explicitly open under PO-ESCALATION G1, and FR-015/SC-007 plus T017-T019 are marked BLOCKED.
- Plan/tasks: T001-T013 cover the F3 baseline; T014-T016 cover the roster and G2-scoped final-PO guard; T017-T019 cover only the future PO-approved trainer-departure contract and remain blocked. Every new task is tagged with its FR/SC IDs and states its prerequisite.
- Initial entry result was FAIL because this file predated the last 003 change and still claimed “0 open findings.” The documentation-only CodeRabbit/CI-fix exception applied; no implementation was performed. The final entry result is **PASS**: requirements/scenarios PASS, clarifications PASS, plan/tasks PASS, and this analysis is dated after the last spec/plan/tasks change with 0 open CRITICAL/HIGH findings.

## Findings

| ID | Category | Severity | Location | Finding | Disposition |
|---|---|---|---|---|---|
| A1 | Evidence coverage | MEDIUM | `traceability.md` FR-003 | Signed-session isolation tests cover representative roles/tables, but do not establish deny-by-default policy predicates across every table and role. | Keep FR-003 PARTIAL until complete policy-predicate evidence exists. |
| A2 | Evidence coverage | MEDIUM | `traceability.md` FR-004 | Catalog hardening and a representative authenticated identity check exist, but the tests do not establish every helper condition or every attempted identity-widening path. | Keep FR-004 PARTIAL pending broader assertions. |

The only retained findings are A1 and A2. There are **0 open CRITICAL/HIGH findings**. PO-ESCALATION G1 is an explicit implementation blocker recorded in the artifacts and run report, not a hidden Analyze ambiguity.

## Coverage and constitution

- FR-to-task coverage: FR-001..FR-012 map to T001-T013; FR-013 maps to T014/T016; FR-014 maps to T015/T016; FR-015 maps to T017-T019. All 15 FRs have task coverage, but FR-015 is intentionally BLOCKED.
- SC-to-task coverage: SC-001..SC-004 map to T001-T013; SC-005 maps to T015/T016; SC-006 maps to T014/T016; SC-007 maps to T017-T019. All 7 SCs have task coverage, but SC-007 is intentionally BLOCKED.
- No orphan task was found. The new G1 lane is ordered T017 (RED-first characterization) → T018 (PO-selected forward-only migration with S32-R1 all-origin-refs uniqueness) → T019 (independent security/audit review).
- G2 removes membership revocation/hard deletion and auth-user cascade from the final-PO matrix because those paths do not affect valid Platform Owner count. The remaining role-demotion and staff-profile-deletion paths share one serialization invariant.
- Constitution v1.5.0: Principle I requires workspace isolation; Principle III requires least-authority governance; Principle VI preserves membership/history. G1 explicitly protects client/plan/log/subscription/financial/audit history. The analysis makes no implementation-conformity claim without code and executed tests.

## Static FK and trigger findings

- On the start HEAD and `origin/main`, the relevant migration set is identical for this evidence: 40 FKs directly reference `auth.users` or `public.staff_profiles` (19 and 21 respectively); no FK references `public.workspace_memberships`. Thirty-five use `ON DELETE RESTRICT`; five use PostgreSQL's default `NO ACTION`.
- None of those referencing tables is trainer-only/disposable. They hold shared governance, client, plan, log, subscription, financial, audit, catalog-provenance, or idempotency records.
- `public.staff_profiles.user_id` → `auth.users(id)` is `ON DELETE RESTRICT`. `staff_profiles_no_delete`, `workspace_memberships_no_delete`, and `workspaces_no_delete` independently reject privileged deletion. The verified current behavior is that departed-trainer auth-user deletion is blocked; no cascade path exists.
- Existing tests cover application DELETE denial, immutable/no-delete triggers, restrictive client FKs, and a client auth-deletion failure. No existing test covers a successful departed-trainer auth-user deletion, because that behavior does not exist and its safe mechanism is blocked pending PO-ESCALATION G1.

## Static traceability

`traceability.md` covers 22 feature rows: 5 VERIFIED, 11 PARTIAL, 6 NOT-FOUND, 0 DEFERRED. The existing feature citations were checked statically; the S34 FR-015/SC-007 rows are NOT-FOUND and explicitly BLOCKED pending PO-ESCALATION G1. No test suite or CI job was run. PARTIAL rows identify gaps in composite/schema assertions, source confirmation, coverage breadth, CI workflow assertions, migration direction, and PII scans.

## Implementation gates (not Analyze defects)

- T014 remains open until its roster migration and executed positive/negative tests pass; T016 records the subsequent architect security/evidence package.
- T015's role-demotion/serialization work is independent, but its staff-profile-deletion path remains BLOCKED pending PO-ESCALATION G1 because the current no-delete trigger and protected attribution FKs make safe trainer deletion impossible. T016 follows T014/T015.
- T017-T019 remain BLOCKED pending an explicit PO resolution of PO-ESCALATION G1. T017 must establish RED-first characterization only after the exact contract and disposable-record set are selected. T018 may then implement only that selected contract in a new forward-only migration after the S32-R1 all-origin-refs scan proves its version unique; G1 is not authority for blanket cascade. T019 requires independent security/privacy/audit review and exact-head evidence.
- These are implementation, evidence, security, and PO-approval gates. They are not open CRITICAL/HIGH Analyze findings.

## Verdict

**PASS WITH OPEN BLOCKERS — 0 open CRITICAL/HIGH findings** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 0 LOW). The two retained MEDIUM evidence gaps are A1 (FR-003 assertion breadth) and A2 (FR-004 helper/access-widening breadth); both are visible in traceability and are not claimed closed. The roster and G2-scoped final-PO artifacts are ready for their independent implementation lanes after their stated gates. FR-015/SC-007 and T017-T019 are explicitly BLOCKED pending PO-ESCALATION G1, with no deletion mechanism invented. This static document review does not claim implementation completion.

## History

- First SK-A merged-feature review on `origin/main` `ed88574`; initial verdict 0 CRITICAL, 2 HIGH, 1 MEDIUM, 0 LOW.
- S30-PO-3 Q6-Q8 refresh: Q6 resolved; Q7/Q8 recorded as future-cycle decisions. Round 6 clarified the source and fixed task/traceability mappings. Static only; no suite run.
- 2026-11-03, base analysis on `d04ef52`: found open scope/active-state questions (A1/A2), concurrency and failure-contract questions (A3/A4), missing implementation evidence (A5), coverage note (A6), and undefined removal operation (A7). The HIGH questions were routed as SK-003-04..10.
- 2026-11-03, refreshed on `3237afa`: S30-R8 closed the scope questions as architect clarification of the existing PO-approved Q7/Q8 behavior. Implementation tests and security review remain gates, not specification defects. No PO question was raised.
- 2026-11-03, refreshed on `e9888dc`: the plan now defines the roster RPC projection and base-table boundary, the final-PO guard's shared transaction lock and six mixed race pairs, and T014/T015 independent done-conditions followed by T016 review. The stale Story 5 and `created_at` clarification wording are corrected. Static code/test statuses remain unchanged; no suite was run.
- 2026-11-03, refreshed on `e8c03d4`: the roster scenario and SC-006 now describe the fixed membership fields and associated staff role rather than calling the associated role a membership column. No implementation or test evidence changed.
- 2026-11-03, refreshed on `7fd9461`: FR-013 now separates membership columns from the associated staff role, and the resolved decision summary specifies that all protected owner-count mutations use the shared transaction lock. No implementation or test evidence changed.
- 2026-11-04, reconciled with #47 compliance merge `ff6e0b9`: combined #47 task FR tags, traceability row updates (commit `ed88574`, PARTIAL FR-003/FR-004 evidence gaps), and #50 governance rows FR-013/FR-014/SC-005/SC-006 + all Given/When/Then scenarios; verdict adjusted to reflect the merged 20-row traceability table (5 VERIFIED / 11 PARTIAL / 4 NOT-FOUND / 0 DEFERRED).
- 2026-11-04 17:59 +02:00, S33 SK-A9 fix round: refreshed the analysis against branch head `0a4e95c` after restoring the `Project Structure` and `Complexity Tracking` sections dropped at merge `012f9ed`. Both parents were compared; no requirement, task, decision, citation, or substantive section content was dropped. The finding set and 0 CRITICAL / 0 HIGH verdict are unchanged; no tests, builds, SQL, stacks, or code were run.
- 2026-11-04 19:38 +02:00, S33 CodeRabbit docs round: corrected the 20-row traceability summary to 5 VERIFIED / 11 PARTIAL / 4 NOT-FOUND and replaced stale Q7 future-cycle/unresolved wording in the spec and plan with the already-recorded approved scope. No numbered FR, SC, task, or requirement meaning was dropped. The auth-user deletion cascade contract was escalated as PO-DECISION-NEEDED and was not applied. The finding set and 0 CRITICAL / 0 HIGH verdict are unchanged; no tests, builds, SQL, stacks, or code were run.
- 2026-11-05 04:01 +02:00, S34 G1/G2 round: recorded G1=A (conditional) and G2=A verbatim, removed the stale auth-user cascade/membership-operation claims, scoped the final-PO guard to valid-owner-count operations, documented the verified blocked-deletion fact, added blocked RED-first/migration/review tasks with S32-R1, and added FR-015/SC-007 traceability. Verdict now states 0 open CRITICAL/HIGH and names both retained MEDIUM gaps. No tests, builds, SQL, stacks, or code were run.
