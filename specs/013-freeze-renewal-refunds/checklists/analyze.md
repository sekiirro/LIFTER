# F13 plan analysis

## Historical analysis (retained)

The original analysis and S24 addendum below are preserved as history. The current-head refresh is appended after that record.

**Pass**: spec ↔ plan ↔ tasks consistency review. No implementation or tests run. **Model/effort**: Luna High.

## Findings

- FR-001–FR-036 are mapped to one or more named units in tasks.md; FR-034/035/036 have dedicated gate and parity coverage. SC-001–SC-013 map to the financial, freeze, renewal, calendar, authorization, audit, UI-gate and P4/P5 integration units listed there.
- Every task names an originating FR/SC/decision, owner files, DB need, tests-first RED→GREEN evidence and a named mutation check for security/financial logic. No implementation code is included.
- PO-1 uses atomic deactivation/outbox plus a synchronous Custom Access Token hook to deny new issuance; the server-side Auth Admin ban worker remains defense in depth. Stack C integration verifies sign-in/refresh denial while the worker fails. F12 U4 is merged and verified at PR #18 / `e3a2534`; reuse its writer and function contracts.
- F13 database and Auth API verification is assigned to isolated Stack C (lifter-stack-c). Stack A/B remain prohibited targets.
- Order F13 migrations after the integrated replay baseline: enumerate only F12/F14 migrations present in the implementation branch and replay; never depend on unmerged migrations. Rebuild shared audit and capability bodies from the latest integrated versions.
- Capability delta and bidirectional parity are sequenced after both F12 and F14. Cross-feature table/FK/function/i18n/dashboard/nav/CI interactions and merge ordering are stated in tasks.md.
- Remaining production blocker: technical and legal feasibility of 30-day retention across all recoverable copies, including backups.

## Issues corrected during analysis

No critical or high inconsistency found in the generated planning artifacts. No PO policy is inferred beyond the binding decision record and feature spec. Constitution check has no exception. No rendered UI task is included; the future UI gate requirement is explicit in plan.md.

## Remaining medium/low observations

- F12 U4 RPC and receipt shapes are verified against merged PR #18 at `e3a2534`; planning copies must use the pinned merged contract and must not create a duplicate payment writer.
- The Auth design is resolved as the Custom Access Token hook plus the Auth Admin worker; the isolated database and Auth API stack is assigned to Stack C (`lifter-stack-c`).
- F13 UI is outside this plan's implementation units; any later request to add rendered UI must use the Frontend Design Gate and DESIGN.md.

## S24 round 16 implementation addendum

Forward migration `20261103130700_f13_renewal_required_keys.sql` follows the immutable lineage-tail guard and makes each required `record_renewal` key reject absence as `invalid_input`. The quickstart and task history record the new current endpoint; round 12's 82-migration replay remains historical.

## S30 analysis snapshot at reviewed revision `0449b100`

- **Date:** 2026-11-03
- **Analyzed revisions:** baseline `506e3bf4135b49319e0bdabab4d5166e2d608f5b`; S30 static review at `0449b10075254be9bd31ce6296cf0404abea63d8`, including the final Clarifications and T020 D-20 deferral.
- **Scope:** current `spec.md`, `plan.md`, `tasks.md`, existing analysis history, code/tests, and D-20/B4 production readiness. Static review only; no tests, stack operations, hosted queries, or deployments.
- **Entry inventory:** 36 FRs and 14 SCs; plan/tasks exist; existing requirements and analysis checklists exist; Clarifications at the reviewed head cite D-13, D-15, D-20, and S22-PO-5. T001-T018 are checked with historical evidence, T019 remains open, and T020 is explicitly deferred by D-20.

### Findings

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F13-A01 | MEDIUM | `tasks.md:T019`; D-20; `docs/13-production-readiness.md` | RET-1..3 technical/legal feasibility across backups remains unresolved; B4 client/audit retention values remain open and block production with real client data. | Preserve T019 open and record the existing B4 production blockers; no retention threshold or legal interpretation added. |
| F13-A02 | MEDIUM | `tasks.md:T020`; D-20 | The task requires a hosted non-production Supabase project, while D-20 limits hosting to one production project and requires development/testing to use local Docker. | Mark T020 `[DEFERRED: docs/04-changes-and-questions.md D-20]`; this is directly sourced and does not claim the hosted proof passed. |

### Coverage and verdict

- FR-to-task mapping: 36/36; SC-to-task mapping: 14/14. Existing T017 records cross-feature FR/SC reconciliation and T018 records runtime consumer boundaries.
- Clarifications cite D-13, D-15, D-20, and S22-PO-5. Resolved ND-01/ND-08 remain closed; unresolved retention items are explicit.
- **PASS WITH OPEN PRODUCTION BLOCKERS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM; 50/50 FR/SC items mapped. Static evidence only; no tests executed.

## S31 round 6 refresh

- **Date:** 2026-11-04
- **Analyzed commit:** `cb08f711716d7f0667dadb4fdce286c1a09cdc92` plus the S31 documentation updates to SC-009 traceability.
- **Scope:** Spec/plan/tasks/traceability consistency only; no tests or code changed.
- **Finding:** SC-009 has named evidence for over-balance validation, audit rollback, outbox rollback, deactivation rollback, authorization and hook behavior. No asserting test was found for an injected numeric overflow failure with zero partial lifecycle/financial/receipt effects. Retention and hosted-hook evidence are separate criteria and do not lower SC-009.
- **Coverage:** FR mapping remains 36/36 and SC mapping 14/14. SC-009 stays PARTIAL for the specific numeric-overflow assertion gap; retention remains tracked under FR-029 and B4/ND-F5-1 (DP-01/DP-02), and hosted verification remains tracked under FR-019/FR-035, T020, and Go-Live gate F13-PB-03. SC-014 is not downgraded or held PARTIAL by the hosted gate; retention and hosted verification are separate criteria from SC-010/SC-014.
- **Verdict:** 0 CRITICAL, 0 HIGH; 3 MEDIUM. Static source/test-name review only; no tests executed.
- **Severity note (S33):** this file defines no separate rubric for a missing-verification evidence gap, so the S31 count is stated both ways. Reading 1 (gap excluded as an evidence limitation): 2 MEDIUM carried forward from the S30 snapshot (F13-A01 — RET-1..3/B4 retention production blockers; F13-A02 — T020 D-20 deferral), plus the SC-009 numeric-overflow evidence gap tracked separately as SC-009 PARTIAL. Reading 2 (gap included as a MEDIUM finding): 3 MEDIUM. The higher total is retained: **3 MEDIUM** (F13-A01, F13-A02, and the S31 SC-009 numeric-overflow evidence gap). No severity is lowered and no finding is reclassified downward.

## S33 SK-52 fix round 4 refresh

- **Date:** 2026-11-04T21:49:05+02:00 (after the S33 PR #52 round-4 edits).
- **Analyzed commit:** `ab3111caeecbac0594eaf7d3cb42de5c1fba0ebe` (this round-4 fix commit's parent; the analyzed state is held in that revision, and this section lands in the round-4 fix commit). Baseline for the S30 snapshot remains `0449b10075254be9bd31ce6296cf0404abea63d8`; S31 round 6 remains `cb08f711716d7f0667dadb4fdce286c1a09cdc92`.
- **Scope:** documentation-only consistency fixes from PR #52 round-4 review threads (`tasks.md` T020; `spec.md` Clarifications result line; `traceability.md` SC-014 and summaries; this file's S31 Coverage line). No tests, scans, stacks, deployments, cloud queries, or implementation actions performed.
- **Findings:**

| ID | Severity | Artifact | Finding | Disposition |
|---|---|---|---|---|
| F13-R4-01 | LOW | `tasks.md:T020`; `spec.md` Clarifications (2026-11-03 session); S30 F13-A02 disposition | T020 carried `[DEFERRED: docs/04-changes-and-questions.md D-20]`, but no PO deferral exists. D-20 limits development/testing to local Docker and provides no hosted non-production project; it does not defer the task. | T020 kept OPEN, annotated "blocked by D-20 (no cloud staging); Go-Live gate F13-PB-03 remains open". The S30 F13-A02 disposition text is superseded by fact and architect ruling; the S30 snapshot above is retained as the historical record at `0449b100`. No gate is lowered: F13-PB-03 remains an open Go-Live gate and no hosted proof is claimed. |
| F13-R4-02 | LOW | `traceability.md` SC-014 and summaries | SC-014 covered Stack C Auth hook/worker behavior with recorded executed test evidence; its PARTIAL status rested only on the hosted non-production proof, which is the separate FR-035/T020 gate. | SC-014 upgraded to VERIFIED citing executed test file::name with quoted assertions (see `traceability.md` SC-014 row: `refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` asserts HTTP 403 sign-in/refresh with no access token; its before-hook branch asserts HTTP 400 after the Auth Admin ban; `keeps the service-role admin client behind a server-only worker boundary`, etc.). Summaries updated: success criteria 9 VERIFIED / 5 PARTIAL; total 41 VERIFIED / 9 PARTIAL. FR-035 stays PARTIAL (hosted proof blocked by D-20). |
| F13-R4-03 | LOW | This file, S31 round 6 Coverage line | Retention was tracked under SC-010 and hosted verification under SC-014. SC-010 covers audit/delivered-productivity; SC-014 covers Stack C Auth hook/worker. | Coverage line corrected: retention under FR-029 and B4/ND-F5-1 (DP-01/DP-02); hosted verification under FR-019/FR-035, T020, and F13-PB-03. Coverage counts and SC-009 status unchanged. |

- **Coverage:** FR mapping remains 36/36; SC mapping 14/14. SC-005, SC-009, SC-011, SC-012, SC-013 remain PARTIAL; FR-035 remains PARTIAL (hosted proof blocked by D-20). FR/SC verification counts in `traceability.md`: 32 VERIFIED / 4 PARTIAL FRs; 9 VERIFIED / 5 PARTIAL SCs; 41 VERIFIED / 9 PARTIAL total.
- **Verdict:** 0 CRITICAL, 0 HIGH, 3 MEDIUM carried (F13-A01 retention production blockers; F13-A02/T020 D-20 hosting conflict remains open and blocked; S31 SC-009 numeric-overflow evidence gap). T020 remains open; no finding is reclassified downward. Static review only; no tests executed.
## S41 main-sync reconciliation re-analysis

- Date: 2026-11-09 19:23:34 UTC, after the current-main merge resolution and this reconciliation's spec/plan/task edits.
- Scope: static Spec Kit recheck of the current-main baseline, Clarifications and decision citations, FR/SC/scenario and FR-tagged task cross-references, and the PR #52 compliance edits. Documentation only; no implementation or test task was marked complete, and no tests were executed.
- Result: The current traceability matrix is 0 VERIFIED, 43 PARTIAL, and 7 UNVERIFIED; SC-014 is PARTIAL. This is the S41 status; S33 counts remain historical. Existing findings, approvals, implementation gates and verification details remain unchanged. No new product ambiguity or behavior was introduced.
- Findings: 0 open CRITICAL, 0 open HIGH. Existing medium/low findings, pending approvals, implementation gates and verification status remain as recorded above.
- Verdict: PASS for this documentation-only reconciliation; no task checkbox or verification status changed.

## S41-R12 round-3 PR-wide re-analysis

- Date: 2026-11-09 22:50 UTC (2026-11-10 00:50 Africa/Cairo), after PR-wide status/reference inspection; no later spec/plan/tasks edits follow this analysis.
- Scope: rechecked all 36 FR and 14 SC traceability rows, current totals, status wording, cross-links and pending/blocked statements against docs/04 and later decisions. Current matrix remains 0 VERIFIED / 43 PARTIAL / 7 UNVERIFIED; SC-014 remains PARTIAL. T019/T020 and hosted proof remain open/blocked as recorded; no historical S33 count is presented as current.
- Entry gate: PASS - numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and tagged tasks are present.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests were run and no task/status changed.
- Verdict: PASS for this PR-wide documentation audit.


## S41 CodeRabbit round-3 historical finding-count re-analysis

- Date: 2026-11-09 23:17 UTC, after correcting the carried-medium count.
- Scope: S33 historical disposition of F13-A02/T020 alongside F13-A01 and SC-009. F13-A02 remains counted as a carried medium finding; T020 remains open and blocked.
- Findings: 0 open CRITICAL, 0 open HIGH. No task/status changed.

## S46 CodeRabbit round-5 finding re-analysis

- Date: 2026-11-10 23:29 UTC (2026-11-11 01:29 Africa/Cairo), after the F5 traceability date-check rewrite.
- Scope: F5 — the Known-gaps date-check row now retains the S35-R4 UNCERTAIN record as history and states the current check is satisfied (S41 re-analyses of 2026-11-09 postdate the latest spec/plan/tasks changes of 2026-11-04/11-01). This S46 section postdates all spec/plan/tasks edits. Matrix totals unchanged (0 VERIFIED / 43 PARTIAL / 7 UNVERIFIED); T019/T020 remain open/blocked.
- Entry gate: PASS — numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and tagged tasks are present.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests ran and no status changed.
- Verdict: PASS for this documentation-only correction.
