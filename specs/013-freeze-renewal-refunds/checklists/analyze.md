# Spec Kit Analyze: F13 continuity decisions

## Historical analysis (retained)

The original analysis and S24 addendum below are preserved as history. The current-head refresh is appended after that record.

**Pass**: spec ↔ plan ↔ tasks consistency review. No implementation or tests run. **Model/effort**: Luna High.
**Analyzed:** 2026-11-10 17:48 UTC
**Method:** Reconciled S45-PO-2/S45-R3 with byte-exact source verification; reviewed FR-005/012/038/039, scenarios 13/14, SC-033 and SC-034, plan, T041/T042, traceability, lifecycle/data model, research, and earlier S43-PO-6/architect mapping for credit after upgrade, renewal, then upgrade. Reviewed in-flight, unknown-result, retry, deletion, concurrency, crash-between-step, and no-partial-write states for these spec-only changes.

## Entry check

- PASS - FR-005/012/039, scenarios 13/14, and measurable SC-033 and SC-034 specify the changed renewal and credit behavior.
- PASS - S45-F13-MCQ-1 is resolved by the exact PO quote and separate S45-R3 mapping in the PO-decision register. The earlier credit finding is covered by S43-PO-6 residual 5 and S43-R7; no new product choice is inferred.
- PASS - plan.md and tagged tasks T041/T042 cover the new behavior and expected tests; implementation tasks remain unchecked.
- PASS - this Analyze pass follows the latest spec, plan, and task edits.

## Findings

- CRITICAL: 0 open.
- HIGH: 0 open.
- MEDIUM: 0 open PO decisions in this change scope.
- LOW: 0 FR/task/SC ID or task-tag mismatches found in the touched continuity and credit scope.

## Decision and evidence status

- FR-012/039 are specified as pre-activation refusal with no writes/no queued duration, then FR-039 active/expired rules after activation. Existing T010 evidence is historical and does not verify all current no-write outcomes; see traceability.md.
- S43-PO-6 residual 5 states the original package full payment is the sole credit after renewal then upgrade. FR-038 and scenario 14 clarify that prior upgrade charges and separate renewal payments are excluded even when an earlier upgrade preceded the renewal.
- SC-033 and SC-034 map to unchecked T041/T042; no test execution or implementation is claimed. Other implementation evidence gaps and independent technical/security gates remain as recorded.

**Analyze result:** CRITICAL 0; HIGH 0; MEDIUM 0 open PO decisions; LOW 0.

## S45 R3 review-fix analysis

**Analyzed:** 2026-11-11 00:51 Africa/Cairo
**Scope:** CodeRabbit round-3 fixes for expired-renewal term anchoring and cumulative refund caps.

Forward migration `20261103130700_f13_renewal_required_keys.sql` follows the immutable lineage-tail guard and makes each of the five validated keys (`client_id`, `predecessor_subscription_id`, `package_offer_id`, `request_key`, `expected_revision`) reject absence as `invalid_input`, and requires `renewal_confirmed` to be `true`. That `invalid_input` result is reached only after authentication and the workspace preflight succeed: an unauthenticated caller returns `not_permitted`, and a missing or malformed `workspace_id` returns `not_permitted` before that branch. `installments` is optional: an omitted or null `installments` is not `invalid_input` — the renewal then uses the package price — and only a present, non-null `installments` that is not an array or is an empty array is rejected as `invalid_input`. The quickstart and task history record the new current endpoint; round 12's 82-migration replay remains historical.

**S45 R3 results (kept with the S45 R3 scope above):**

- PASS: the expired-renewal anchor is the renewal operation date in lifecycle mapping; this follows the existing approved mapping and makes no new product choice.
- PASS: each source's cumulative refunded principal is bounded by eligible collections; group cumulative refunds use total eligible collections, while a new request is bounded by the pre-operation residual.
- PASS: subscription/group locking and deterministic allocation remain unchanged; FR/SC/task IDs and task tags are untouched.
- PASS: no product ambiguity or new PO decision found.
- CRITICAL: 0 open; HIGH: 0 open.

## S30 analysis snapshot at reviewed revision `0449b100`

- **Date:** 2026-11-03
- **Analyzed revisions:** baseline `506e3bf4135b49319e0bdabab4d5166e2d608f5b`; S30 static review at `0449b10075254be9bd31ce6296cf0404abea63d8`, including the final Clarifications and T020 D-20 deferral.
- **Scope:** current `spec.md`, `plan.md`, `tasks.md`, existing analysis history, code/tests, and D-20/B4 production readiness. Static review only; no tests, stack operations, hosted queries, or deployments.
- **Entry inventory:** 36 FRs and 14 SCs; plan/tasks exist; existing requirements and analysis checklists exist; Clarifications at the reviewed head cite D-13, D-15, D-20, and S22-PO-5. T001-T018 are checked with historical evidence, T019 remains open, and T020 is explicitly deferred by D-20.

### Findings

| ID      | Severity | Artifact                                                 | Finding                                                                                                                                                               | Disposition                                                                                                                         |
| ------- | -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| F13-A01 | MEDIUM   | `tasks.md:T019`; D-20; `docs/13-production-readiness.md` | RET-1..3 technical/legal feasibility across backups remains unresolved; B4 client/audit retention values remain open and block production with real client data.      | Preserve T019 open and record the existing B4 production blockers; no retention threshold or legal interpretation added.            |
| F13-A02 | MEDIUM   | `tasks.md:T020`; D-20                                    | The task requires a hosted non-production Supabase project, while D-20 limits hosting to one production project and requires development/testing to use local Docker. | Mark T020 `[DEFERRED: docs/04-changes-and-questions.md D-20]`; this is directly sourced and does not claim the hosted proof passed. |

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

| ID        | Severity | Artifact                                                                                | Finding                                                                                                                                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F13-R4-01 | LOW      | `tasks.md:T020`; `spec.md` Clarifications (2026-11-03 session); S30 F13-A02 disposition | T020 carried `[DEFERRED: docs/04-changes-and-questions.md D-20]`, but no PO deferral exists. D-20 limits development/testing to local Docker and provides no hosted non-production project; it does not defer the task. | T020 kept OPEN, annotated "blocked by D-20 (no cloud staging); Go-Live gate F13-PB-03 remains open". The S30 F13-A02 disposition text is superseded by fact and architect ruling; the S30 snapshot above is retained as the historical record at `0449b100`. No gate is lowered: F13-PB-03 remains an open Go-Live gate and no hosted proof is claimed.                                                                                                                                                                                                                                                                                    |
| F13-R4-02 | LOW      | `traceability.md` SC-014 and summaries                                                  | SC-014 covered Stack C Auth hook/worker behavior with recorded executed test evidence; its PARTIAL status rested only on the hosted non-production proof, which is the separate FR-035/T020 gate.                       | SC-014 upgraded to VERIFIED citing executed test file::name with quoted assertions (see `traceability.md` SC-014 row: `refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` asserts HTTP 403 sign-in/refresh with no access token; its before-hook branch asserts HTTP 400 after the Auth Admin ban; `keeps the service-role admin client behind a server-only worker boundary`, etc.). Summaries updated: success criteria 9 VERIFIED / 5 PARTIAL; total 41 VERIFIED / 9 PARTIAL. FR-035 stays PARTIAL (hosted proof blocked by D-20). |
| F13-R4-03 | LOW      | This file, S31 round 6 Coverage line                                                    | Retention was tracked under SC-010 and hosted verification under SC-014. SC-010 covers audit/delivered-productivity; SC-014 covers Stack C Auth hook/worker.                                                            | Coverage line corrected: retention under FR-029 and B4/ND-F5-1 (DP-01/DP-02); hosted verification under FR-019/FR-035, T020, and F13-PB-03. Coverage counts and SC-009 status unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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
- Verdict: PASS for this documentation-only correction. (The S45 R3 PASS results are recorded with the S45 R3 scope above, not here.)

## 2026-11-11 Analyze — Greptile review PRR_kwDOVYgYQ88AAAABXNC1UA (01:33 UTC)

- Scope: correct the two S43-PO-8 scenario-to-SC citations and the 50-row traceability status summary.
- PASS: scenario 2 maps upgrade term anchors to SC-027; scenario 3 maps pre-activation duration start to SC-028. SC-029 remains mapped to renewal-then-upgrade credit.
- PASS: recomputed matrix statuses are 37 PARTIAL and 13 UNVERIFIED across 50 rows; the summary IDs exactly match the matrix rows and status counts.
- PASS: FR-012/FR-039 and S45-R3's pre-activation renewal refusal, zero-write/no-queued-duration rule remain unchanged. No PO behavior or copy was introduced.
- PASS: numbered FRs, measurable SCs, GWT acceptance, clarifications, plan coverage, task mappings, and dated analysis artifacts exist for the touched feature.
- CRITICAL: 0 open; HIGH: 0 open; MEDIUM: 0 open PO decisions; LOW: 0 stale cross-reference findings.

## 2026-11-11 Analyze — merge of main, no PR content change (01:52 UTC)

- Scope: merged main commit b1476db5f95d447ed2b0525e19ed4a9c890b90cc; no PR content change.
- CRITICAL: 0 open; HIGH: 0 open.

## 2026-11-11T02:40:45Z Analyze — merge of main d1b1aff3 (PR #77 F13 continuity), no PR content change

- Scope: merged main tip d1b1aff3; conflict resolution only. 7 hunks across 3 files: analyze.md 2 keep-both (HEAD S30-S46 history + MAIN continuity/Greptile/merge notes); spec.md 2 take-main (PR decision-traceability rows restating successor-lineage and purchase-selection facts superseded by S43-PO-5/FR-037..039, recorded as superseded); traceability.md hunk1 keep-both (distinct gap notes), hunks 2-3 take-main (successor-era PARTIAL rows superseded by current UNVERIFIED/PARTIAL). No product choice taken.
- Entry: numbered FRs, measurable SCs, Given/When/Then scenarios, Clarifications/PO-decision register, FR-tagged tasks present; this pass follows the merge.
- Findings: 0 CRITICAL, 0 HIGH. T019/T020 gates remain open/blocked as recorded.

## S47 CodeRabbit round-6 review-fix analysis — 2026-11-11T06:24:05Z

- Scope: CodeRabbit review-body findings F1-F3 (required-key claim, S45 R3 placement, date-check rationale). The migration summary names the five validated keys with workspace_id returning not_permitted first; S45 R3 results sit with the S45 R3 scope; the date-check rationale cites the post-merge re-analyses and the S35-R4 UNCERTAIN record is marked historical.
- Entry gate: PASS - numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and FR-tagged tasks cover the scope.
- Findings: 0 open CRITICAL, 0 open HIGH. Static review only; no tests ran and no status changed.
- Verdict: PASS for this documentation-only correction.

## S48 CodeRabbit round-7 review-fix analysis - 2026-11-11T14:45:00Z

- Scope: CodeRabbit inline-thread finding on the required-key migration summary above. The claim is narrowed to what the migration does: the five validated keys (`client_id`, `predecessor_subscription_id`, `package_offer_id`, `request_key`, `expected_revision`) reject absence as `invalid_input` and `renewal_confirmed` must be `true`; `invalid_input` is reached only after authentication and the workspace preflight succeed, so an unauthenticated caller and a missing or malformed `workspace_id` both return `not_permitted` first. `installments` is optional: an omitted or null value is not `invalid_input` and the renewal uses the package price; only a present, non-null value that is not an array or is an empty array is rejected as `invalid_input`.
- Entry gate: PASS - numbered FRs, measurable SCs, GWT scenarios, Clarifications, plan and FR-tagged tasks cover the scope.
- Findings: 0 open CRITICAL, 0 open HIGH. Static documentation review only; no migration, code, test, or application behavior changed, and no status changed. **No open ambiguities** remain for this correction.
- Verdict: PASS for this documentation-only correction.
