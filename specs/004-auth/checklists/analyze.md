# Spec Kit Analyze — F4 Authentication, S39 round 7

- Date: 2026-11-09 04:56 +02:00, after the last changes to spec.md, plan.md, tasks.md, traceability.md, copy-proposal.md and contracts/auth-surface.md in this round, and after the round-7 review fixes to spec.md (SC-016), traceability.md and tasks.md (T041/T041a, T048).
- Scope: specification and planning only. No application code, SQL, migration, environment or test was changed or run.
- Inputs: S39-PO-4 option 2 (English of the 13 former proposal rows approved as written); S39-PO-5 option 1 (Egyptian Arabic redraft approved exactly as in `runs/s39-haiku-f4-ar/copy-ar-redraft.md` "proposed Egyptian Arabic", plus the five-key term switch). Exact quoted extracts and mappings are in the round report; prior inputs are the S38 round-6 records.
- Method: cross-artifact review of spec.md, plan.md, tasks.md, research.md, traceability.md, contracts/auth-surface.md, data-model.md and this checklist against Spec Kit entry requirements and the round-6 critique findings.

## Entry check (Spec Kit gate)

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios cover the touched scope | PASS | spec.md FR-001–FR-031; SC-001–SC-016; US5 scenarios 1–15 cover request, hook failures, idempotent intent retry, session binding, reset outcome, timing and the five-key Arabic term switch (scenario 15). |
| Clarifications cite PO sources and state remaining ambiguities | PASS | spec.md records S39-PO-4/S39-PO-5; COPY-F4-R6 is resolved. S38 register quotes S38-PO-1/3/5. No behavior decision is implicit. |
| Plan covers touched scope; tasks have IDs and FR tags | PASS | plan.md provider-boundary design, G1–G6 and sequencing; tasks.md T033, T041, T042, T049a–T049e, T050a/T050b, T051 and new T052 (FR-031) include FR tags. |
| Analyze is dated after spec/plan/tasks edits and has 0 open CRITICAL/HIGH | PASS | This dated review; finding dispositions below. |

**Spec-only gate result: PASS. Implementation entry: NOT READY (technical gates only).** The copy condition is now satisfied: English approved by S39-PO-4, Egyptian Arabic and the five-key term switch by S39-PO-5. T033 still requires the remaining entry checks; local feasibility G1–G6, RED/acceptance evidence and T051 mutation evidence remain unexecuted. These are explicit technical gates, not unresolved requirements. No task is ticked.

## S39 round 7 copy approval (resolves S38-F4-3)

- `specs/004-auth/copy-proposal.md` now carries the final approved AR/EN table (26 rows). The 13 former "New proposal; PENDING-PO" rows use the S39-PO-4 English and the S39-PO-5 Egyptian Arabic byte-exact. No PENDING-PO marker remains.
- spec.md FR-027 cites S39-PO-4/S39-PO-5 and reproduces the approved table after FR-029.
- The five keys `auth.newPassword`, `auth.confirmPassword`, `auth.setPassword`, `auth.weak_password` and `auth.mismatch` carry only the S39-PO-5 term switch; this is FR-031 with SC-016. The catalog change is task T052 and is explicitly not made by this specification-only PR.
- FR-031 lists every `origin/main` screen and test that reads the five keys: `app/auth/recovery/RecoveryForm.tsx`, `app/auth/recovery/page.tsx`, `lib/i18n/messages/{ar,en}.ts`, `tests/unit/auth-actions.test.ts`, plus indirect coverage in `tests/unit/messages.test.ts`, `tests/e2e/auth.spec.ts` and `tests/integration/client-accounts-verification.md`. `components/` has no read.
- The two FR-029 strings remain byte-exact and are unchanged by the switch; a byte comparison confirmed all 26 rows, the 13 redraft strings and the four FR-029 strings.

## Sol Medium critique disposition (S38 round 6, retained as history)

S38-R4 recorded the critique result as NOT READY, CRITICAL 0 / HIGH 6 / MEDIUM 3 / LOW 1. The critique ran at the exact starting SHA. Its ten findings are resolved at the specification/process level as follows; implementation evidence remains required by the listed tasks.

| Finding | Severity at critique | Round-6 disposition | Evidence |
|---|---:|---|---|
| 1. S38-PO-3 absent; PDN-17 and hosted path block local work | HIGH | Fixed: exact PO words recorded; T050b is local-only; hosted changes and Resend deferred; PDN-17 closed. | spec.md S38 register, FR-019/020; plan.md; tasks.md T033/T050b |
| 2. Hook failure classes overclaim generic response | HIGH | Fixed technically: refusal, caught audit error, unavailable transport and timeout are separate; no-send/no-fallback required; direct outcomes recorded; no mapper assumption. | spec.md FR-018/030; plan.md G6; T049b/T049c |
| 3. Hook trust boundary and secrets unspecified | HIGH | Fixed technically: authenticated invocation, schema/action validation, identity/destination checks, secret protection, idempotence, audit-before-send and no token logs required. | plan.md Control A/G6; tasks.md T049c/T050b; contracts/auth-surface.md |
| 4. Account-scoped intent permits competing session | HIGH | Remediated technically: intent bound to initiating user/session; guard requires trusted request context; competing session negative; infeasible binding blocks T050a. No exception accepted. | spec.md FR-025(b), US5 scenario 13; plan.md G1/G2; T049a/T050a |
| 5. Rate-limit ownership duplicated | HIGH | Fixed: hook is the authoritative counter for app/direct routes; app does not pre-consume; unknown-address accounting, mixed requests and concurrency are required. | spec.md FR-024/030; plan.md flow/G6; T038/T049c |
| 6. No mutation evidence acceptance task | HIGH | Fixed: explicit T051 maps each security control to a disabling/bypass mutation and evidence/restoration requirements. | tasks.md T051; traceability.md |
| 7. Gate order circular | MEDIUM | Fixed: RED tests precede local feasibility spikes; implementation entry and final acceptance are separate; spikes do not require their own GREEN result before they can run. | plan.md F4 execution order; tasks.md T033/T050a/T050b |
| 8. PDN register mixes obsolete and product questions | MEDIUM | Fixed: -04/-06/-10/-11/-16 pruned or deferred; -17 closed; -01/-02/-03/-05/-09/-12 recorded answered; concrete copy table now approved. | spec.md Open items/register; copy-proposal.md |
| CodeRabbit 7. Client manual-link completion could be changed by blanket login redirect | MEDIUM | Fixed: staff self-service redirects to login; client manual-link preserves FR-013 signed-in outcome. | spec.md FR-026; contracts/auth-surface.md; tasks.md T045 |
| CodeRabbit 8. Blanket intent immutability could reject valid state transitions | MEDIUM | Fixed: identity/origin fields remain immutable; only guarded open-to-closed transitions are allowed, with timestamps set once; no-delete remains unconditional. | plan.md; data-model.md |
| CodeRabbit 9. Copy proposal was only in local run directory | MEDIUM | Fixed: committed proposal is linked from the spec, contract, plan/tasks and Analyze; run-dir evidence copy retained. Approval now recorded. | copy-proposal.md; spec.md FR-027 |
| CodeRabbit 10. Refused requests must still be counted at the send hook | MEDIUM | Fixed: all valid requests reach the authoritative hook for policy accounting; acceptance asserts no email, generic mapped response, and shared counters. | contracts/auth-surface.md; tasks.md T038/T038a; FR-024 |
| CodeRabbit 11. Contract copy link resolves to the wrong directory | MINOR | Fixed: link now resolves to `../copy-proposal.md`. | contracts/auth-surface.md |
| CodeRabbit 12. Preserve client invalid-link instruction while using staff copy | MEDIUM | Fixed: existing `auth.invalid_link` catalog copy remains for client manual links; staff uses the exact approved FR-029 string. A display-only `flow=staff` marker selects copy and never affects authorization. | copy-proposal.md; spec.md FR-027/029; tasks.md T037a/T044a |
| CodeRabbit 13. Session revocation did not cover Data API JWT replay | HIGH | Fixed as an acceptance gate: T049e proves pre-reset access at a protected Data API resource and requires replay denial after reset; any success blocks T050a and control-C acceptance until a technical control is proven. | spec.md FR-030 control C; plan.md G3; tasks.md T049e; traceability.md |
| CodeRabbit 14. PDN-13 gates were stale after PDN-14 was answered | MINOR | Fixed: current T033, feasibility and RED-test prerequisites are stated; release block remains until controls and FR-020 pass. | spec.md PDN-F4-7-13; tasks.md T033/T049/T050 |
| CodeRabbit 15. Retry after ambiguous begin could be stranded | MINOR | Fixed: `begin` is idempotent for the same verified session and reuses its fresh intent without a duplicate audit; another session is refused. | spec.md FR-025(a), scenario 14; plan.md; data-model.md; tasks.md T049d |
| CodeRabbit 16. E2E did not verify the new password works | MINOR | Fixed: T041 now verifies old-password failure and successful sign-in with the new password after normal-login handoff. | tasks.md T041 |
| CodeRabbit 17. T050a omitted control-D acceptance | MINOR | Fixed: T050a requires the control-D subset of T049b separately from control-A/T050b acceptance. | tasks.md T049b/T050a; spec.md PDN-F4-7-13 |
| 9. Contracts/data model omit recovery | MEDIUM | Fixed: both artifacts now describe local staff recovery actions, session-bound intent, hook boundary, audit/limits, session outcomes and hosted deferral. | contracts/auth-surface.md; data-model.md |
| 10. Analyze metrics and status stale | LOW | Fixed: unique finding IDs, current dispositions and metrics below; prior round critique is recorded as executed. | This checklist; traceability.md |

## Current findings

| ID | Severity | Status | Detail / gate |
|---|---|---|---|
| S38-F4-1 | MEDIUM | OPEN — implementation evidence | G1/G2 must prove a trusted initiating-session binding on the pinned local Auth path. Otherwise T050a remains blocked; no account-scope bypass is accepted. |
| S38-F4-2 | MEDIUM | OPEN — local feasibility | G3–G6 and T049b–T049e have not run. They must establish hook behavior, unknown-address accounting, response observations, session revocation and recovery age before implementation acceptance. |
| S38-F4-3 | MEDIUM | CLOSED — copy approved | COPY-F4-R6 resolved by S39-PO-4 (English) and S39-PO-5 (Egyptian Arabic + five-key term switch). No PENDING-PO copy remains. |
| S38-F4-4 | MEDIUM | OPEN — acceptance evidence | T051 mutation evidence and the T048 security/review/CI gates are not executed in this spec-only round. |
| S39-F4-1 | LOW | CLOSED — tracked task | The five-key catalog change is not implemented by this spec-only PR by design; task T052 (FR-031) carries it with a byte-comparison test. |

Open CRITICAL: **0**. Open HIGH: **0**. Open MEDIUM: **3**. Open LOW: **0**. The three medium items do not contradict the specified behavior; they are explicit implementation, feasibility and acceptance gates. All product decisions, including copy, are recorded.

## Requirements and task metrics

- FRs: 31 (FR-031 added for the five-key term switch). SCs: 16 (SC-016 added). Given/When/Then scenarios: US1–US5, 15 F4 scenarios.
- Existing task count: 61; T052 added (62); T041a added by the round-7 review fix (63). No task was ticked in this round.
- F4 task coverage includes T033–T052 plus T041a; recovery control requirements trace to T049a–T049e, T050a/T050b and T051.
- Spec-only readiness: PASS. Implementation readiness: FAIL until T033, G1–G6, the relevant RED tests and implementation acceptance evidence pass; copy is no longer a blocker.
- Ambiguities: **No open ambiguities.** COPY-F4-R6 is resolved by S39-PO-4/S39-PO-5; the five-key term switch is fully specified (FR-031). Session-binding feasibility is technical and explicitly gated, not an open product question. Existing other-session revocation rule is cited rather than guessed.

## Round 7 review fixes (revalidated)

Two review findings were fixed after the first review of the inserted copy; Analyse was re-run after those edits.

- SC-016 (spec.md, FR-031) was clarified so its catalog comparison is measurable: pre-existing keys and their English values are compared against `origin/main`; the approved recovery-key additions required by FR-027/T042 and the five-key Arabic term switch are explicitly permitted; no unapproved change is allowed. This removes the contradiction with FR-027 and T042 without changing any requirement or adding one.
- traceability.md decision-gap notes no longer describe PDN-F4-7-12 or PDN-F4-7-14 as pending: PDN-F4-7-12 is answered by S38-PO-5/S38-R7, and PDN-F4-7-14 = B (S37-PO-8). Their control evidence stays UNVERIFIED.
- tasks.md CI prerequisites now match `.github/workflows/ci.yml`: T048 requires the three executed green jobs (`validate` with its `check:secrets` step, `integration`, `storage`) instead of a non-existent secret-scan job; T041 records its dependency on the new T041a, which schedules enabling local Inbucket mail capture in the `integration` job (local-only, implementation round). No workflow file is changed by this specification-only PR.
- Revalidation: 0 open CRITICAL, 0 open HIGH, 0 open LOW; the three MEDIUM items remain the scheduled gates. **No open ambiguities.**

## Session and outcome decisions

- Existing spec rule: FR-025(b) requires revocation of the user's other sessions during the successful password change; FR-030 control C and PDN-F4-7-07 repeat that rule. T049e tests the other pre-existing sessions. Therefore S38-R7's conditional MCQ is not raised.
- After known success, the recovery session ends and the user goes to normal login without auto-login. If closing audit fails after known success, retain the success-then-login result and require reconciliation. Ambiguous Auth outcomes remain open for reconciliation.
- Limits: 5 per account per rolling hour, 10 global requests per rolling hour, and a separate cap of 2 local test deliveries per hour.

## No implementation

This round changes specification artifacts only. No code, SQL, migration, environment or test file changed. No tests were executed. Local Supabase and hosted services were not run or changed.
## S41 main-sync reconciliation re-analysis

- Date: 2026-11-09 19:23:34 UTC, after the current-main merge resolution and this reconciliation's spec/plan/task edits.
- Scope: static Spec Kit recheck of the current-main baseline, Clarifications and decision citations, FR/SC/scenario and FR-tagged task cross-references, and the PR #52 compliance edits. Documentation only; no implementation or test task was marked complete, and no tests were executed.
- Result: Entry checks PASS for numbered FRs, measurable SCs and Given/When/Then coverage in this touched scope; plan and FR-tagged task coverage remains present. No new product ambiguity or unapproved behavior was introduced. FR-015 now states the already-approved Trainer denial boundary until T032; the approved all-workspace-Trainer capability remains unimplemented until its separate cycle.
- Findings: 0 open CRITICAL, 0 open HIGH. Existing medium/low findings, pending approvals, implementation gates and verification status remain as recorded above.
- Verdict: PASS for this documentation-only reconciliation; no task checkbox or verification status changed.

## S41 review-finding re-analysis

- Date: 2026-11-09 19:56:44 UTC, after the documentation reference/status corrections.
- Scope: static check of ND-F4 decision versus implementation status, AI-04 expiry-verification ownership, T031 manual-link limit work, T033 self-service entry gate, and the Decision register anchor links.
- Findings: 0 open CRITICAL, 0 open HIGH. No product decision or task status changed.
- Verdict: PASS for the documentation corrections.
