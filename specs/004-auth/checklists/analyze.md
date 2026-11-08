# Spec Kit Analyze — F4 Authentication, S38 round 6

- Date: 2026-11-09 00:59 +02:00, after the last changes to spec.md, plan.md and tasks.md in this round.
- Scope: specification and planning only. No application code, SQL, migration or test was changed or run.
- Inputs: Sol Medium critique at `549c6466cea254e90dd180d20c7b1b976e35a267`; S38-PO-1, S38-PO-3, S38-PO-5; architect S38-R2, S38-R4 and S38-R7. Exact quoted extracts are in spec.md and the round report.
- Method: cross-artifact review of spec.md, plan.md, tasks.md, research.md, traceability.md, contracts/auth-surface.md, data-model.md and this checklist against Spec Kit entry requirements and the critique findings.

## Entry check (Spec Kit gate)

| Check | Result | Evidence |
|---|---|---|
| Numbered FRs, measurable SCs, Given/When/Then scenarios cover the touched scope | PASS | spec.md FR-001–FR-030; SC-001–SC-015; US5 scenarios 1–13 cover request, hook failures, session binding, reset outcome and timing |
| Clarifications cite PO sources and state remaining ambiguities | PASS | spec.md Clarifications and S38 register quote S38-PO-1/3/5. No behavior decision is implicit; copy proposal is explicitly PENDING-PO. S38-R7's question about other sessions is answered by existing FR-025(b), FR-030 control C and PDN-F4-7-07. |
| Plan covers touched scope; tasks have IDs and FR tags | PASS | plan.md provider-boundary design, G1–G6 and sequencing; tasks.md T033, T041, T049a–T049e, T050a/T050b and new T051 include FR tags. |
| Analyze is dated after spec/plan/tasks edits and has 0 open CRITICAL/HIGH | PASS | This dated review; finding dispositions below. |

**Spec-only gate result: PASS. Implementation entry: NOT READY.** T033 still requires PO approval of `C:/Users/NEW LAP/.lifter/runs/s38-luna-f4-r6/copy-proposal.md` (COPY-F4-R6); local feasibility G1–G6 and RED/acceptance evidence remain unexecuted. These are explicit gates, not assumed approvals. No task is ticked.

## Sol Medium critique disposition

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
| 8. PDN register mixes obsolete and product questions | MEDIUM | Fixed: -04/-06/-10/-11/-16 pruned or deferred; -17 closed; -01/-02/-03/-05/-09/-12 recorded answered; concrete copy table is PENDING-PO. | spec.md Open items/register; copy-proposal.md |
| 9. Contracts/data model omit recovery | MEDIUM | Fixed: both artifacts now describe local staff recovery actions, session-bound intent, hook boundary, audit/limits, session outcomes and hosted deferral. | contracts/auth-surface.md; data-model.md |
| 10. Analyze metrics and status stale | LOW | Fixed: unique finding IDs, current dispositions and metrics below; prior round critique is recorded as executed. | This checklist; traceability.md |

## Current findings

| ID | Severity | Status | Detail / gate |
|---|---|---|---|
| S38-F4-1 | MEDIUM | OPEN — implementation evidence | G1/G2 must prove a trusted initiating-session binding on the pinned local Auth path. Otherwise T050a remains blocked; no account-scope bypass is accepted. |
| S38-F4-2 | MEDIUM | OPEN — local feasibility | G3–G6 and T049b–T049e have not run. They must establish hook behavior, unknown-address accounting, response observations, session revocation and recovery age before implementation acceptance. |
| S38-F4-3 | MEDIUM | OPEN — PO copy approval | Proposed AR/EN recovery copy (COPY-F4-R6) is concrete but pending one PO review. Implementation tasks using those strings remain blocked until approval. |
| S38-F4-4 | MEDIUM | OPEN — acceptance evidence | T051 mutation evidence and the T048 security/review/CI gates are not executed in this spec-only round. |

Open CRITICAL: **0**. Open HIGH: **0**. Open MEDIUM: **4**. Open LOW: **0**. The four medium items do not contradict the specified behavior; they are explicit implementation, copy-approval and acceptance gates.

## Requirements and task metrics

- FRs: 30. SCs: 15, numbered SC-001 through SC-015. Given/When/Then scenarios: US1–US5, with 13 F4 scenarios.
- Existing task count: 61; T051 added. Existing completed tasks remain unchanged. No task was ticked in this round.
- F4 task coverage includes T033–T051; recovery control requirements trace to T049a–T049e, T050a/T050b and T051.
- Spec-only readiness: PASS. Implementation readiness: FAIL until T033, G1–G6, the relevant RED tests, PO copy approval and implementation acceptance evidence pass.
- Ambiguities: no unrecorded behavior ambiguity is claimed absent. COPY-F4-R6 approval is PENDING-PO. Session-binding feasibility is technical and explicitly gated. Existing other-session revocation rule is cited rather than guessed.

## Session and outcome decisions

- Existing spec rule: FR-025(b) requires revocation of the user's other sessions during the successful password change; FR-030 control C and PDN-F4-7-07 repeat that rule. T049e tests the other pre-existing sessions. Therefore S38-R7's conditional MCQ is not raised.
- After known success, the recovery session ends and the user goes to normal login without auto-login. If closing audit fails after known success, retain the success-then-login result and require reconciliation. Ambiguous Auth outcomes remain open for reconciliation.
- Limits: 5 per account per rolling hour, 10 global requests per rolling hour, and a separate cap of 2 local test deliveries per hour.

## No implementation

This round changes specification artifacts only. No code, SQL, migration, environment or test file changed. No tests were executed. Local Supabase and hosted services were not run or changed.
