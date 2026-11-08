# F4 Traceability - static source review

Base: `origin/main` `7e2d0149b0370e4389b462130508352bbd69daa2`. Task mapping is taken from `tasks.md` task text; no tests or CI jobs were run for this documentation change. Status MAPPED means the task is ticked in `tasks.md` and merged; it is not a re-verification on this head. PARTIAL and UNVERIFIED mark rows whose cited test does not assert the requirement (read from source). VERIFIED is not claimed for any row.

| Requirement | Task(s) | Test(s) (file level, from tasks.md) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T014, T016 | `tests/e2e/auth.spec.ts` cited by tasks.md but it only checks login/recovery accessibility and redirects, not sign-in; password sign-in is exercised at Auth level only by `tests/integration/auth-recovery.test.ts` ("consumes once, sets a password and signs in with that password") | tasks.md `[x]`; merged on main | PARTIAL | No test drives the login server action (`app/login/actions.ts:19`) end to end. UNVERIFIED for the app sign-in flow. |
| FR-002 | T014, T016 | none found (`tests/e2e/auth.spec.ts` does not assert the generic invalid-credentials message `auth.invalid_credentials`) | tasks.md `[x]`; merged on main | UNVERIFIED | Coverage gap: no test asserts one generic message for wrong password and unknown email (`app/login/actions.ts:18-25`). |
| FR-003 | T014, T015 | none found (`tests/e2e/auth.spec.ts` has no sign-out step; `signOut` action at `app/(app)/actions.ts:6` is untested) | tasks.md `[x]`; merged on main | UNVERIFIED | Coverage gap: no test signs out through the app. |
| FR-004 | T009, T010, T011 | `tests/unit/actor.test.ts`; `tests/integration/auth-recovery.test.ts` (actor) | tasks.md `[x]`; merged on main | MAPPED | Test names not re-checked here. |
| FR-005 | T012, T013, T016, T023 | `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | Test names not re-checked here. |
| FR-006 | T003, T004, T022 | `tests/integration/matrix-parity.test.ts`; `tests/integration/rls-catalog.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Trainer scope: denied until T032 (SK-004-02, all workspace Trainers). |
| FR-007 | T017, T020, T021 | `tests/integration/auth-recovery.test.ts`; `tests/unit/recovery-link.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Staff targets denied; matches ND-F4-6 decision SK-004-06. |
| FR-008 | T006, T017, T024 | `scripts/check-client-secrets.mjs` (CI step) | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-009 | T003, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-010 | T003, T020, T031 | `tests/integration/auth-recovery.test.ts` (placeholder 20 / 3 / 1 hour) | tasks.md `[x]` for T003/T020; T031 unchecked | PARTIAL | Decided limits (SK-004-04: 10 per staff per hour, 3 per client per 24 hours) are not implemented; T031. |
| FR-011 | T017, T019, T021 | `tests/unit/recovery-link.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-012 | T003, T018, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | Session-lifetime enforcement deferred per `docs/13-production-readiness.md:34` (no task). |
| FR-013 | T018, T020 | `tests/integration/auth-recovery.test.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-014 | T008, T014, T018, T019 | `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| FR-015 | T016, T020, T021, T023, T024 | `tests/integration/auth-recovery.test.ts`; `tests/unit/recovery-link.test.ts`; `tests/e2e/auth.spec.ts` | tasks.md `[x]`; merged on main | MAPPED | - |
| AT-AUTH-01 (docs/01-traceability.md:45), manual reset: single-use, expiring, audited | FR-007, FR-011, FR-012, FR-013 via T017-T021; documentation T030 | `tests/integration/auth-recovery.test.ts` ("consumes once, sets a password and signs in with that password", "supersedes an earlier unused hash", "rejects an expired hash", "accepts a link verified 59 minutes after it was issued", "rejects a link verified 61 minutes after it was issued", "preflight, record and exact audit attribution"); `tests/unit/recovery-link.test.ts` | D-19 approved: S31-PO-2 SK-004-01; recorded in `docs/04-changes-and-questions.md:25` and spec Clarifications. Test names read from source; not executed on this head. | MANUAL RESET MAPPED; T030 UNCHECKED | Self-service email reset is PENDING under ND-F4-7 (unanswered; not built). Trainer manual reset pending T032 (SK-004-02). T030 also requires PR merged with CI and CodeRabbit gates; not met by the documentation change alone. |

## Decision rows

| Decision | Source | Spec location | Implementation |
|---|---|---|---|
| D-19 approved | S31-PO-2 SK-004-01 | spec.md Clarifications | n/a |
| ND-F4-4 limits | S31-PO-3 SK-004-04 | spec.md Clarifications, ND-F4-4 | Pending, T031 (FR-010) |
| ND-F4-6 clients only | S31-PO-2 SK-004-06 | spec.md Clarifications, ND-F4-6 | Matches current design |
| ND-F4-1 Trainers | S31-PO-2 SK-004-02 "All workspace Trainers" | spec.md Clarifications, ND-F4-1 | Pending, T032 (FR-006); Trainers denied until then |
| ND-F4-2 delivery | S31-PO-2 SK-004-03 "Copy only" | spec.md Clarifications, ND-F4-2 | Satisfied: `components/auth/RecoveryLinkDialog.tsx:40` copies only; no share action |
| ND-F4-3 session-lifetime enforcement deferral | S35-PO-1 "ND-F4-3=A (defer, track security blocker)"; `docs/13-production-readiness.md:34` ("PO decision: B"; RD-1 reconciled by S35-R6: both mean the deferral) | spec.md Clarifications, ND-F4-3 | None; no task; blocker stays Open, Pre-Production |
| ND-F4-5 client-target sequencing | S35-PO-1 "ND-F4-5=A." (architect: option a) | spec.md Clarifications, ND-F4-5 | Pending P1 client accounts; denial until then unchanged |
| ND-F4-7 staff email reset | S35-PO-1 line 9 (verbatim in spec.md Clarifications) | spec.md User Story 5, FR-016 to FR-030, SC-008 to SC-015, Security Notes, PDN-F4-7-01 to 13 | Specified only; implementation Phase 9 (T033 to T050); UNVERIFIED |
| PDN-F4-7-14 public /recover mechanism = B (send hook, control A) | S37-PO-8 item 2 = B; the option text is the written waiver of the built-in-email wording for the test phase only (`C:/Users/NEW LAP/.lifter/runs/s37-po/s37-po-1.verbatim.txt`) | spec.md FR-019, FR-030 control A, PDN-F4-7-14 | Specified; T050b after gate G6; UNVERIFIED |
| PDN-F4-7-15 auth.users guard = A (local-only in test phase) | S37-PO-8 item 3 = A (consequence: staff password changes outside self-service refused, no override) | spec.md FR-030 control B, PDN-F4-7-15 | Specified; T050a; UNVERIFIED |
| PDN-F4-7-17 local config containment | S38-PO-3, S38-R2 | spec.md FR-019/FR-020; plan.md; T050b | CLOSED: local-only T050b; hosted changes deferred |

## ND-F4-7 rows (S35-PO-1) - all UNVERIFIED until implemented and executed

No ND-F4-7 row is VERIFIED or MAPPED. Each status describes the planned test only; none has been run. Test names are planned and will be read from source when implemented.

| Requirement | Task(s) | Planned test(s) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| US5 scenario 1 (request, email, link) | T041, T043, T044 | `tests/e2e/auth.spec.ts` (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 2 (no enumeration, no send) | T035, T041 | `tests/unit/staff-reset.test.ts`, `tests/e2e/auth.spec.ts` (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 3 (GET does not consume, scanner prefetch) | T037, T037a, T044a, T045 | `tests/unit/auth-logs.test.ts`, `tests/integration/auth-recovery.test.ts` section "staff-reset-prefetch" (planned) | none | UNVERIFIED | Not implemented; provider verify-endpoint behaviour not relied on |
| US5 scenario 4 (intent, set password, audit completed) | T039, T044, T045, T049d, T050a | `tests/integration/auth-recovery.test.ts` section "staff-reset-intent" (planned) | none | UNVERIFIED | Two-phase intent per FR-025 (a) to (h), database state machine (S36 round 4); user-visible sub-question of PDN-F4-7-12 awaits PO |
| US5 scenario 5 (used, expired, superseded) | T040 | `tests/integration/auth-recovery.test.ts` (planned; real expiry by backdating `recovery_sent_at`) | none | UNVERIFIED | Provider behaviour unverified (AT-3) |
| US5 scenario 6 (rate limit refused) | T038 | `tests/integration/auth-recovery.test.ts` (planned) | none | UNVERIFIED | PDN-F4-7-03, 04 |
| US5 scenario 7 (delivery cap) | T038, T044 | planned | none | UNVERIFIED | PDN-F4-7-01 |
| US5 scenario 8 (client: no email) | T034, T041 | planned | none | UNVERIFIED | PDN-F4-7-02 for roles |
| US5 scenario 9 (SMTP gate) | T046, T047 | documentation check | none | UNVERIFIED | Hosted change out of scope |
| US5 scenario 10 (direct Auth API enforcement) | T049a to T049e, T050a, T050b | local Auth and Data API boundary tests (planned) | E1 to E4 (bypass evidence, `research.md` R10) | UNVERIFIED (bypass evidenced) | Control A decided as PDN-F4-7-14 = B; control B decided as PDN-F4-7-15 = A; gates G1 to G6 not verified; control tests not run |
| US5 scenario 11 (exact approved copy) | T042b | byte comparison of application output and locale catalogs (planned) | none | UNVERIFIED | FR-029 applies to two staff states; client `auth.invalid_link` catalog copy is preserved |
| FR-016 | T034, T043 | planned | none | UNVERIFIED | PDN-F4-7-02 |
| FR-017 | T041, T043 | planned | none | UNVERIFIED | - |
| FR-018 | T035, T041, T043 | planned | none | UNVERIFIED | Timing tolerance AT-2 |
| FR-019 | T041, T044 | planned | none | UNVERIFIED | PDN-F4-7-01 answered A; local-only hook under S38-PO-3; hosted work deferred |
| FR-020 | T046, T047 | documentation check | none | UNVERIFIED | Gated; hosted out of scope |
| FR-021 | T040, T044 | planned | none | UNVERIFIED | AT-3 |
| FR-022 | T037, T037a, T044a, T045 | planned | none | UNVERIFIED | Scanner-safe app link (S35-R5 T2) |
| FR-023 | T036, T044 | planned | none | UNVERIFIED | Hosted allow-list gated by FR-020 |
| FR-024 | T038, T044 | planned | none | UNVERIFIED | PDN-F4-7-03, 04 |
| FR-025 | T039, T044, T045, T049d, T050a | planned | none | UNVERIFIED | FR-025 (a) to (h) durable intent, reconciliation (S36-PO-2 F4 line; PDN-F4-7-12 answered); user-visible sub-question awaits PO; guard in T050a |
| FR-026 | T045 | planned | none | UNVERIFIED | ND-F4-3 session-lifetime blocker unchanged |
| FR-027 | T042, T045 | planned | none | UNVERIFIED | Remaining copy in copy-proposal.md is PENDING-PO; approved FR-029 strings reused |
| FR-028 | T034 to T042, T048 | planned | none | UNVERIFIED | Security review pending |
| FR-029 | T042b | localization and rendered-output byte comparison (planned) | none | UNVERIFIED | Four strings approved for only two states by S36-R6 |
| FR-030 | T049a to T049e, T050a, T050b | direct /recover and updateUser negative tests plus local boundary implementation (planned) | E1 to E4 (bypass evidence, `research.md` R10) | UNVERIFIED | Control A: PDN-F4-7-14 = B, send hook not run (gate G6). Control B: PDN-F4-7-15 = A, guard not run. Controls C and D need gates G3 to G5 |
| SC-008 | T041 | planned | none | UNVERIFIED | - |
| SC-009 | T038, T041 | planned | none | UNVERIFIED | - |
| SC-010 | T040 | planned | none | UNVERIFIED | - |
| SC-011 | T046, T047 | documentation check | none | UNVERIFIED | - |
| SC-012 | T037, T039 | planned | none | UNVERIFIED | - |
| SC-013 | T041 | local e2e timing from link open to successful reset (planned) | none | UNVERIFIED | 2-minute test target; 5-minute real-user UX target (S38-PO-5) |
| SC-014 | T042b | byte comparison (planned) | none | UNVERIFIED | - |
| SC-015 | T049a to T049e, T050a, T050b | local boundary negative tests and implementation (planned) | E1 to E4 (bypass evidence, `research.md` R10) | UNVERIFIED | PDN-F4-7-14 = B and PDN-F4-7-15 = A (S37-PO-8, answered); session-binding feasibility remains technical; -16 pruned; -17 closed by S38-PO-3; no hosted Auth changes |

## S35-R5 rows (CodeRabbit round 2) - UNVERIFIED until implemented and executed

Spec-level fixes only. No row is VERIFIED.

| Item | Severity | Requirement | Task(s) | Planned test(s) | Status |
|---|---|---|---|---|---|
| T1 password update vs completion audit | Superseded in round 4: FR-025 (a) to (h) and FR-030 controls B to D | FR-025, FR-030 | T039, T044, T045, T049a to T049e, T050a | `tests/integration/auth-recovery.test.ts` "staff-reset-guard", "staff-reset-intent", "staff-reset-sessions" (planned) | UNVERIFIED; control A open (PDN-F4-7-14) |
| T2 default recovery email verifies on GET | HIGH until fixed; fixed in spec | FR-022 (app link, POST-only verify) | T037a, T044a | `tests/integration/auth-recovery.test.ts` "staff-reset-prefetch" (planned) | UNVERIFIED |
| T3 built-in email scope end point | Minor (CodeRabbit); fixed in spec | FR-019 | T041, T044 | planned | UNVERIFIED; hosted scope deferred under FR-020/S38-PO-3 |
| T4 Referrer-Policy on the page | Fixed in spec | FR-022 | T037, T045 | `tests/unit/auth-logs.test.ts` (planned) | UNVERIFIED |
| Nitpick T040 real expiry | Fixed in spec | FR-021 | T040 | `tests/integration/auth-recovery.test.ts` "staff-reset-link" (planned) | UNVERIFIED |
| Nitpick T041 reset to signed-in | Fixed in spec | SC-013, US5 scenario 1 | T041 | `tests/e2e/auth.spec.ts` (planned) | UNVERIFIED |

## S36 round 4 rows (PO-2 F4 decisions; spec-level only; all UNVERIFIED)

| Item | Requirement | Task(s) | Planned test(s) | Status | Gap |
|---|---|---|---|---|---|
| Control A, public /recover | FR-030, SC-015, PDN-F4-7-13, PDN-F4-7-14 (= B, S37-PO-8) | T049b, T049c, T050b, gate G6 | local route tests (planned); E1 (`research.md` R10) | EVIDENCED (bypass, E1 CONFIRMED); CONTROL UNVERIFIED | Send hook not run; G6 open; app five-per-account bypass NOT CONFIRMED (E1); local config authorized by S38-PO-3 |
| Control B, auth.users guard | FR-030, FR-025 (b), PDN-F4-7-15 (= A, S37-PO-8) | T049a, T049d, T050a | `tests/integration/auth-recovery.test.ts` "staff-reset-guard" (planned); E2 (`research.md` R10) | EVIDENCED (bypass, E2 CONFIRMED); CONTROL UNVERIFIED | Guard not run; G1, G2 open; E2 used a password sign-in session and its account is not stated to be staff |
| Control C, session revocation | FR-025(b), FR-030 control C, PDN-F4-7-07 | T049e, T050a | staff-reset-sessions plus protected Data API pre-reset-token replay (planned); E4 (`research.md` R10) | PARTLY EVIDENCED; CONTROL UNVERIFIED | G3/G5 remain local feasibility checks; all other pre-existing account sessions must end; Auth and Data API must both refuse old tokens; any gap blocks implementation for technical resolution |
| Control D, recovery-session age | FR-030 control D, ND-F4-3 (password path) | T049b, T050a | "staff-reset-direct" (planned) | UNVERIFIED (E2 did not exercise it) | G4 (JWT amr otp recovery entry, merged test lines 332 to 355); general session lifetime remains the open ND-F4-3 blocker (docs/13) |
| FR-025 (a) begin, eligibility | FR-025 (a), FR-016 | T049b, T050a, T033 | "staff-reset-direct" (planned) | UNVERIFIED | Eligible roles answered A (S38-PO-5) |
| FR-025 (c), (d), (e), (g) closing and reconciliation | FR-025 | T049d, T050a | "staff-reset-intent" (planned) | UNVERIFIED | Unique closing-event index to verify against public.audit_events on main |
| Nitpick: public /recover five-request limit | FR-024, FR-030 | T049c | "staff-reset-public-route" (planned) | UNVERIFIED | Enabled route is option B (PDN-F4-7-14 = B). E1: GoTrue's own limiter refused five of six calls, so E1 does not prove the app limit; T049c must test it |
| Nitpick: delivery permission, eligible staff outside list | FR-019, FR-024 | T038a, T049c | "staff-reset-permitted", "staff-reset-public-route" (planned) | UNVERIFIED | PDN-F4-7-01 answered A (S38-PO-5) |
| T048 merge-base criterion (tasks.md:176) | SC gate, S36-R9 | T048 | none (process gate) | DOCUMENTED | Acceptance evidence is the run record on the final head |
| FR-018 timing parity (tasks.md:158) | FR-018 | T035 | timing-parity check (planned) | UNVERIFIED | AT-2 method and tolerance are the architect's decision; not encoded |
| FR-019 delivery cap (tasks.md:162) | FR-019 | T038b | "staff-reset-delivery-cap" (planned) | UNVERIFIED | Blocked by PDN-F4-7-01 for implementation |
| Session-bound intent (S38-R4 finding 4) | FR-025 (a),(b), FR-030 control B | T049a, T050a; G1/G2 | `tests/integration/auth-recovery.test.ts` staff-reset-guard (planned) | SPECIFIED; feasibility UNVERIFIED | Must prove trusted session context; competing session must be refused; no account-scope exception |

## S37 round 5 rows (direct Auth bypass evidence, Stack D; no control verified)

Evidence only. Source: `C:/Users/NEW LAP/.lifter/runs/s37-luna-f4-bypass2/report.md`. Details and limits are in `research.md` R10.

| Evidence | Control | Result | Status |
|---|---|---|---|
| E1 direct anon `/recover` | A (FR-030) | Mail sent with no app audit; GoTrue's limiter refused 5 of 6 | Bypass CONFIRMED; app five-per-account bypass NOT CONFIRMED |
| E2 direct `updateUser` password | B (FR-030, FR-025 (b)) | 200, no audit row, no existing guard fired | Bypass CONFIRMED; recovery-OTP route NOT CONFIRMED (otp_expired) |
| E3 CLI Kong config | A | No `/auth/v1/recover` deny rule or toggle | Deny rule NOT AVAILABLE as-is |
| E4 other session after direct update | C | Other session 403 on `GET /auth/v1/user` | CONFIRMED for one session (GoTrue native); app path UNVERIFIED |
| Control D (recovery session age) | D | Not exercised by E2 | UNVERIFIED (G4 open) |
| Send hook (control A, PDN-F4-7-14 = B) | A | Not run by the experiment | UNVERIFIED (gate G6) |
| Guard (control B, PDN-F4-7-15 = A) | B | Not run by the experiment | UNVERIFIED (gates G1, G2) |


## S38 round 6 decisions and acceptance traceability

| Decision / requirement | Source | Artifacts | Status / acceptance |
|---|---|---|---|
| PDN-F4-7-01 = A, local test list enforced by hook | S38-PO-5 with architect option mapping | spec.md FR-019, PDN register; plan.md; T038a/T049c/T050b | DECIDED; local enforcement unverified |
| PDN-F4-7-02 = A, all four staff roles | S38-PO-5 mapping | spec.md FR-016; T034/T043/T050a | DECIDED; tests unverified |
| PDN-F4-7-03 = B, 10 global requests/hour, 2 deliveries/hour | S38-PO-5 mapping | spec.md FR-019/024/030; plan.md; T038/T049c/T050b | DECIDED; tests unverified |
| PDN-F4-7-05 = A, accepted request/completion audit only | S38-PO-5 mapping | spec.md FR-025; T039 | DECIDED; tests unverified |
| PDN-F4-7-09, 2-minute test and 5-minute user target | S38-PO-5 | spec.md SC-013; T041 | DECIDED; test unverified |
| PDN-F4-7-12, end recovery session and normal login; known success remains success-then-login on audit-close failure | S38-PO-5, architect S38-R7 | spec.md FR-025(h), FR-026, SC scenarios; contracts | DECIDED; tests unverified |
| Other pre-existing account sessions end after reset | Existing FR-025(b), FR-030 control C, PDN-F4-7-07 | spec.md; T049e/T050a | Existing rule cited; no new PO decision |
| Mutation evidence for recovery controls | Critique finding 6; constitution gate | tasks.md T051; spec.md FR-028/030 | REQUIRED; not executed in this spec-only round |
| Remaining AR/EN strings | S38-R4 | run copy-proposal.md; spec.md FR-027 | PENDING-PO; not implementation-approved |

No code, SQL, migration or test was implemented or executed in this round. All F4 implementation tasks remain unchecked.
