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
| ND-F4-3 session-lifetime enforcement deferral | S35-PO-1 "ND-F4-3=A (defer, track security blocker)"; `docs/13-production-readiness.md:34` (label "PO decision: B", RD-1) | spec.md Clarifications, ND-F4-3 | None; no task; blocker stays Open, Pre-Production |
| ND-F4-5 client-target sequencing | S35-PO-1 "ND-F4-5=A." (architect: option a) | spec.md Clarifications, ND-F4-5 | Pending P1 client accounts; denial until then unchanged |
| ND-F4-7 staff email reset | S35-PO-1 line 9 (verbatim in spec.md Clarifications) | spec.md User Story 5, FR-016 to FR-028, SC-008 to SC-013, Security Notes, PDN-F4-7-01 to 11 | Specified only; implementation Phase 9 (T033 to T048); UNVERIFIED |

## ND-F4-7 rows (S35-PO-1) - all UNVERIFIED until implemented and executed

No ND-F4-7 row is VERIFIED or MAPPED. Each status describes the planned test only; none has been run. Test names are planned and will be read from source when implemented.

| Requirement | Task(s) | Planned test(s) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| US5 scenario 1 (request, email, link) | T041, T043, T044 | `tests/e2e/auth.spec.ts` (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 2 (no enumeration, no send) | T035, T041 | `tests/unit/staff-reset.test.ts`, `tests/e2e/auth.spec.ts` (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 3 (GET does not consume) | T037, T045 | `tests/unit/auth-logs.test.ts`, recovery e2e (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 4 (set password, audit completed) | T039, T045 | `tests/integration/auth-recovery.test.ts` (planned) | none | UNVERIFIED | Not implemented |
| US5 scenario 5 (used, expired, superseded) | T040 | `tests/integration/auth-recovery.test.ts` (planned) | none | UNVERIFIED | Provider behaviour unverified (AT-3) |
| US5 scenario 6 (rate limit refused) | T038 | `tests/integration/auth-recovery.test.ts` (planned) | none | UNVERIFIED | PDN-F4-7-03, 04 |
| US5 scenario 7 (delivery cap) | T038, T044 | planned | none | UNVERIFIED | PDN-F4-7-01 |
| US5 scenario 8 (client: no email) | T034, T041 | planned | none | UNVERIFIED | PDN-F4-7-02 for roles |
| US5 scenario 9 (SMTP gate) | T046, T047 | documentation check | none | UNVERIFIED | Hosted change out of scope |
| FR-016 | T034, T043 | planned | none | UNVERIFIED | PDN-F4-7-02 |
| FR-017 | T041, T043 | planned | none | UNVERIFIED | - |
| FR-018 | T035, T041, T043 | planned | none | UNVERIFIED | Timing tolerance AT-2 |
| FR-019 | T041, T044 | planned | none | UNVERIFIED | PDN-F4-7-01 |
| FR-020 | T046, T047 | documentation check | none | UNVERIFIED | Gated; hosted out of scope |
| FR-021 | T040, T044 | planned | none | UNVERIFIED | AT-3 |
| FR-022 | T037, T045 | planned | none | UNVERIFIED | - |
| FR-023 | T036, T044 | planned | none | UNVERIFIED | Hosted allow-list gated by FR-020 |
| FR-024 | T038, T044 | planned | none | UNVERIFIED | PDN-F4-7-03, 04 |
| FR-025 | T039, T044, T045 | planned | none | UNVERIFIED | AT-1 |
| FR-026 | T045 | planned | none | UNVERIFIED | ND-F4-3 session-lifetime blocker unchanged |
| FR-027 | T042, T045 | planned | none | UNVERIFIED | BLOCKED-COPY (PDN-F4-7-06) |
| FR-028 | T034 to T042, T048 | planned | none | UNVERIFIED | Security review pending |
| SC-008 | T041 | planned | none | UNVERIFIED | - |
| SC-009 | T038, T041 | planned | none | UNVERIFIED | - |
| SC-010 | T040 | planned | none | UNVERIFIED | - |
| SC-011 | T046, T047 | documentation check | none | UNVERIFIED | - |
| SC-012 | T037, T039 | planned | none | UNVERIFIED | - |
| SC-013 | T041 | planned | none | UNVERIFIED | PDN-F4-7-09 |
