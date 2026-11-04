# Traceability: F13 Freeze, Renewal, and Refunds

Static source inspection and review of historical evidence recorded in `tasks.md`/`quickstart.md`; no tests were run in this compliance lane. VERIFIED means concrete assertions and prior evidence are recorded, not freshly executed.

| Requirement | Task(s) | Asserting test(s) / evidence | Status |
|---|---|---|---|
| FR-001 | T002,T004,T008,T012,T014,T017 | `tests/integration/refund-operations.test.ts`; `freeze-lifecycle.test.ts`; tenant/RLS and readiness assertions in T017 | VERIFIED |
| FR-002 | T002,T005,T007,T010,T017 | `tests/integration/matrix-parity.test.ts`; TypeScript/SQL parity checks recorded by T017 | VERIFIED |
| FR-003 | T001,T009,T012,T013,T017 | `tests/unit/refund-ledger.test.ts`; `refund-allocation.test.ts`; F12 ledger contract probes | VERIFIED |
| FR-004 | T006,T007 | `tests/unit/freeze-calendar.test.ts` gap/fold and Cairo boundary cases | VERIFIED |
| FR-005 | T007,T011,T012,T014 | `tests/integration/freeze-lifecycle.test.ts::T008 preserves F12 activation and delivered-access facts...` (asserts freeze triggers and table existence only); no named assertion covers no activation or delivery on full refund | PARTIAL |
| FR-006 | T006-T008 | `tests/integration/freeze-lifecycle.test.ts::T008 has a serialized freeze operation...`; unit duration/overlap tests | VERIFIED |
| FR-007 | T007,T008,T011 | `tests/integration/freeze-lifecycle.test.ts::T008 committed-style freeze facts feed the existing entitlement projection...` | VERIFIED |
| FR-008 | T006-T008 | `tests/integration/freeze-lifecycle.test.ts` Stop boundary/day-credit cases; `tests/unit/freeze-lifecycle.test.ts` | VERIFIED |
| FR-009 | T007-T008 | `tests/integration/freeze-lifecycle.test.ts` Remove/reversal and delivered-access clamp cases | VERIFIED |
| FR-010 | T007,T010,T011 | `tests/integration/renewal-operations.test.ts::T010 reuses F12 installment snapshots and anchors renewal dues...`; freeze schedule invariants | VERIFIED |
| FR-011 | T009-T010,T012 | `tests/integration/renewal-operations.test.ts::Q2 Trainer may collect a renewal installment...`; refund/renewal ledger tests | VERIFIED |
| FR-012 | T010-T011 | `tests/integration/renewal-operations.test.ts::T010 rejects renewal before initial activation...`; `S22-PO-5 shifts an unstarted renewal...` | VERIFIED |
| FR-013 | T010-T011 | renewal service-start, activation and predecessor-boundary cases in `renewal-operations.test.ts` | VERIFIED |
| FR-014 | T014-T015 | `tests/integration/refund-operations.test.ts::records an atomic capped refund...`; selected-purchase/zero/over-balance cases | VERIFIED |
| FR-015 | T001,T012-T013,T017 | `tests/unit/refund-ledger.test.ts`; `tests/integration/refund-ledger-integrity.test.ts` allocation lineage/immutability cases | VERIFIED |
| FR-016 | T012-T013,T017 | refund-ledger integrity successor/cancellation constraints; direct integrity probes recorded in T017 | VERIFIED |
| FR-017 | T001,T009,T012-T013 | `tests/unit/refund-allocation.test.ts`; refund ledger cap/concurrency tests | VERIFIED |
| FR-018 | T014-T015 | `tests/integration/refund-operations.test.ts` explicit external-refund confirmation and Cairo recording-date cases | VERIFIED |
| FR-019 | T003,T012-T016,T020 | `tests/integration/refund-auth-lockout-hook.test.ts`; `refund-operations.test.ts`; hosted non-production hook test unavailable under D-20 | PARTIAL |
| FR-020 | T001,T012,T017 | F12 correction compatibility and refund ledger integrity cases recorded by T017 | VERIFIED |
| FR-021 | T014-T015 | refund receipt, audit, and PO-only operation assertions in `refund-operations.test.ts` | VERIFIED |
| FR-022 | T009-T010,T017 | renewal payment/collection role and ledger assertions in `renewal-operations.test.ts` | VERIFIED |
| FR-023 | T001,T007,T017 | `tests/integration/f13-cross-feature-contract.test.ts`; F12 ledger contract compatibility | VERIFIED |
| FR-024 | T007,T008,T017 | `tests/integration/freeze-lifecycle.test.ts` tenant guard and lifecycle mutation cases | VERIFIED |
| FR-025 | T001,T012-T013,T017 | `tests/integration/refund-ledger-integrity.test.ts` correction/recollection/refund lineage checks | VERIFIED |
| FR-026 | T001,T004,T014,T017 | workspace and selected-purchase checks in `refund-operations.test.ts` | VERIFIED |
| FR-027 | T009-T011 | `tests/integration/renewal-operations.test.ts` renewal lineage, sequence and freeze interactions | VERIFIED |
| FR-028 | T007,T014-T015 | entitlement and refund access-boundary cases in freeze/refund integration suites | VERIFIED |
| FR-029 | T008,T010,T017,T019 | `tests/integration/refund-auth-lockout-hook.test.ts`; retention feasibility across backups remains open in T019 | PARTIAL |
| FR-030 | T014-T015,T017 | refund audit/receipt and cross-feature reader assertions in T017 | VERIFIED |
| FR-031 | T018 | dependency and migration integration order documented in `tasks.md:T018` and `quickstart.md` | VERIFIED |
| FR-032 | T017-T018 | F12/F14 function/audit/matrix reconciliation in `tests/integration/f13-cross-feature-contract.test.ts` | VERIFIED |
| FR-033 | T002,T008,T010,T011,T017 | migration order, shared-function and cross-feature ownership checks in T017 | VERIFIED |
| FR-034 | T001-T002,T017-T019 | planning restrictions and unresolved-slice treatment recorded in tasks, Analyze and production readiness docs | VERIFIED |
| FR-035 | T003,T016,T020 | `tests/integration/refund-auth-lockout-hook.test.ts`; hosted non-production smoke test blocked by D-20 (no cloud staging); Go-Live gate F13-PB-03 remains open | PARTIAL |
| FR-036 | T002,T005,T010,T017 | `tests/integration/matrix-parity.test.ts` bidirectional capability parity | VERIFIED |
| SC-001 | T012-T013 | refund principal/commission cap and cumulative allocation tests in `refund-ledger.test.ts` and `refund-allocation.test.ts` | VERIFIED |
| SC-002 | T012-T014 | `tests/integration/refund-ledger-integrity.test.ts` successor, cancellation and immutability probes | VERIFIED |
| SC-003 | T006-T008 | `tests/unit/freeze-calendar.test.ts`; `tests/integration/freeze-lifecycle.test.ts` Apply/Stop/Remove cases | VERIFIED |
| SC-004 | T009-T011 | `tests/integration/renewal-operations.test.ts` predecessor/successor/date cases | VERIFIED |
| SC-005 | T007,T014 | activation and no-delivery/refund behavior is required, but no located asserting test covers every stated no-delivery/productivity clause | PARTIAL |
| SC-006 | T006 | `tests/unit/freeze-calendar.test.ts` Cairo DST gap/fold, leap-day and month-end fixtures | VERIFIED |
| SC-007 | T013,T015,T017 | `tests/integration/refund-races.test.ts`; replay/serialization tests | VERIFIED |
| SC-008 | T005,T008,T014,T017 | `tests/integration/matrix-parity.test.ts`, tenant/RLS and role-denial tests | VERIFIED |
| SC-009 | T012-T016 | `tests/integration/refund-operations.test.ts::rejects an over-balance refund without writing any financial or lockout facts`; `tests/integration/refund-audit.test.ts::rolls back refund, audit, deactivation and lockout together when audit fails`; `::R7 rolls back refund, financial, cancellation, audit and receipt facts when outbox insertion fails`; `tests/integration/refund-auth-lockout-hook.test.ts::keeps sign-in allowed when deactivation is rolled back`; authorization and deactivation guard assertions in refund operations/integrity suites. No located asserting test injects a numeric overflow failure and verifies zero partial lifecycle/financial/receipt effects; retention and hosted-hook evidence belong to other criteria. | PARTIAL |
| SC-010 | T007,T014-T017 | `tests/integration/freeze-lifecycle.test.ts` audit/replay and refund productivity/audit tests | VERIFIED |
| SC-011 | T018 | No rendered UI is implemented in this feature; required later UI surface gate is documented, but no rendered verification artifact exists | PARTIAL |
| SC-012 | T017 | F13 projection/input assertions are present; P4 consumer behavior is explicitly not claimed by F13 | PARTIAL |
| SC-013 | T017-T018 | F13 owns interval facts only; P5 check-in consumer test is outside this feature | PARTIAL |
| SC-014 | T003,T016,T020 | Stack C evidence executed on Stack C (recorded in `tasks.md` T003/T016; focused hook suite 5/5 green, full gates green): `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` asserts `expect(deniedSignIn.status).toBe(403); expect(deniedRefresh.status).toBe(403);` and `expect(deniedSignIn.body.access_token).toBeUndefined();` with no token issued while the worker is failing; its before-hook branch asserts `expect(lockout.error).toBeNull();` (Auth Admin ban succeeds) and `expect(afterBanSignIn.status).toBe(400); expect(afterBanRefresh.status).toBe(400);`; `::keeps sign-in allowed when deactivation is rolled back`; `::does not change staff sign-in and restricts hook execution to supabase_auth_admin`; `::passes claims through unchanged for an active client and fails closed for malformed hook events`. Unit `tests/unit/refund-auth-lockout.test.ts::keeps the service-role admin client behind a server-only worker boundary`; `::rolls back both refund deactivation and outbox when the transaction fails`; `::uses one idempotent client lockout row across repeated refunds`; `::keeps the refund committed, schedules bounded retry, and raises a safe alert after persistent failure`. Hosted non-production verification is the FR-035/T020 gate (blocked by D-20, no cloud staging; Go-Live gate F13-PB-03 remains open), not an SC-014 criterion. SC-014 is not held PARTIAL by that separate gate. | VERIFIED |

## Summary

- Functional requirements: 32 VERIFIED, 4 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Success criteria: 9 VERIFIED, 5 PARTIAL, 0 NOT-FOUND, 0 DEFERRED.
- Total: 41 VERIFIED / 9 PARTIAL. Static review only; no tests were run in this lane. T019 remains open; T020 remains open and is blocked by D-20 (no cloud staging); Go-Live gate F13-PB-03 remains open. No PO deferral exists for T020. SC-014 was upgraded to VERIFIED on 2026-11-04 (S33 round 4) citing the executed Stack C tests recorded in `tasks.md` T003/T016; hosted verification remains tracked under FR-035/T020/F13-PB-03.
