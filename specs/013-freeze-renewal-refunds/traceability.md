# F13 Traceability — Freeze, renewal, refunds and expiry

**Analyzed source commit**: `origin/main` @ `7e2d014` (HEAD). Implementation delivered via merged **PR #27** (`c6a6237`). Static source + test review only; no tests or DB runs in this lane. **VERIFIED** requires a concrete asserting test on this commit. A row without an asserting test is **PARTIAL** or **UNVERIFIED**, never **VERIFIED**. Blocked tasks T019/T020 are recorded in the final section and are not marked complete.

Columns: `Requirement` (FR/SC from `spec.md`) → `Task(s)` (from `tasks.md`) → `Test(s)` (`file::test name` that exists on this commit) → `Evidence` → `Status` → `Gap`.

**Evidence basis (S35-R2):** All cited tests were executed in PR #27's CI on merge head `c6a6237` (run id `41347434112`: `integration`, `validate`, `storage` all `success`). They were **not** re-executed in this lane; statuses reflect static review of whether each cited test asserts the requirement's outcome. A row is `VERIFIED` only where the cited test asserts that outcome; otherwise `PARTIAL`/`UNVERIFIED`.

## Known gaps

- Spec `013` has no `## Clarifications` heading and no explicit "No open ambiguities" statement; PO decisions are recorded inline ("PO Decisions", "PO Decisions — Session 13") and in `docs/04-changes-and-questions.md` (ND-01/ND-08 marked DECIDED). Pre-existing gap; recorded here per architect ruling S35-R1; `spec.md` is not edited in this lane.
- T019 (retention legal/technical) and T020 (production readiness) remain OPEN; see Blocked tasks.

## Matrix

| Requirement | Task(s) | Test(s) (file::test name) | Evidence | Status | Gap |
|---|---|---|---|---|---|
| FR-001 | T002,T004,T008,T012,T014,T015,T017 | `tests/integration/freeze-lifecycle.test.ts::T008 freeze facts are tenant-bound, forced-RLS, immutable ledger rows` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-002 | T002,T005,T010,T014,T015,T017 | `tests/integration/matrix-parity.test.ts::T005 bidirectional parity: ${role} / ${capability}` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-003 | T001,T009,T010,T012,T014,T015,T017 | `tests/integration/renewal-operations.test.ts::T010 reuses F12 installment snapshots and anchors renewal dues to its recording date` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-004 | T006 | `tests/unit/freeze-calendar.test.ts::resolves the first valid instant after the Cairo spring midnight gap` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-005 | T007,T009,T011 | `tests/unit/entitlement-projection.test.ts::projects awaiting activation, future, active, and exclusive expiry states` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-006 | T006,T007,T008 | `tests/unit/freeze-lifecycle.test.ts::enforces the decided 1–30 day duration bounds` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-007 | T006,T007,T011 | `tests/unit/freeze-lifecycle.test.ts::extends the base end by counted freeze days exactly once` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-008 | T006,T007,T008 | `tests/unit/freeze-lifecycle.test.ts::credits Apply on a same-day Stop and does not count the Stop day` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-009 | T006,T007,T008 | `tests/unit/freeze-lifecycle.test.ts::removes only the selected contribution and clamps to today and delivered access` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-010 | T006,T009,T010 | `tests/unit/renewal-projection.test.ts::anchors each issued installment offset to recording date` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-011 | T009,T010 | `tests/integration/renewal-operations.test.ts::T010 reuses F12 installment snapshots and anchors renewal dues to its recording date` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-012 | T009,T010 | `tests/integration/renewal-operations.test.ts::T010 rejects renewal before initial activation and a second unstarted successor` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-013 | T009,T010 | `tests/unit/renewal-projection.test.ts::separates renewal recording/activation from an early service start` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-014 | T014,T015 | `tests/unit/refund-service.test.ts::submits an explicit positive refund for an attested purchase and returns the safe receipt` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-015 | T001,T012,T013,T015,T017 | `tests/unit/refund-allocation.test.ts::allocates FIFO by Cairo collection date, installment sequence, then event UUID` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-016 | T012,T015 | `tests/integration/refund-ledger-integrity.test.ts::T012 cancellation and refund terminal facts cannot reopen obligations or successors` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-017 | T001,T012,T013,T015 | `tests/unit/refund-allocation.test.ts::respects previous allocations and rejects amounts above the remaining source cap` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-018 | T012,T013,T014,T015 | `tests/unit/refund-service.test.ts::submits an explicit positive refund for an attested purchase and returns the safe receipt` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-019 | T003,T016,T019,T020 | `tests/integration/refund-operations.test.ts::records an atomic capped refund and replays its exact authorized receipt`; `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` | PR #27 merge `c6a6237` | PARTIAL | Hook test asserts sign-in/refresh denial only; refund-operations test asserts deactivation/outbox/receipt/allocation. No single test asserts full FR-019 atomicity (commission reversal, cancellation, audit, RET-1, worker retry). T019/T020 gates remain open. || FR-020 | T001,T012,T015 | `tests/integration/refund-ledger-integrity.test.ts::T012 preserves F12 correction reversal uniqueness while allowing partial-source allocation keys` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-021 | T012,T014,T015 | `tests/integration/refund-ledger-integrity.test.ts::T012 cancellation and refund terminal facts cannot reopen obligations or successors` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-022 | T009,T010 | `tests/unit/renewal-projection.test.ts::anchors each issued installment offset to recording date` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-023 | T001,T007,T008,T010,T014,T015,T017 | `tests/unit/refund-service.test.ts::authorizes before the RPC can disclose a previous receipt to a revoked actor` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-024 | T001,T008,T010,T015,T017 | `tests/integration/freeze-lifecycle.test.ts::T008 has a serialized freeze operation with safe replay and expected revisions` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-025 | T001,T008,T012,T015,T017 | `tests/integration/refund-ledger-integrity.test.ts::T012 deferred caps reject cumulative partial allocations above source residual` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-026 | T001,T004,T008,T010,T012,T014,T015,T017 | `tests/integration/freeze-lifecycle.test.ts::T008 audit failure rolls back the Apply fact and idempotency receipt` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-027 | T009,T011 | `tests/unit/entitlement-projection.test.ts::projects awaiting activation, future, active, and exclusive expiry states` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-028 | T007,T009,T011 | `tests/unit/entitlement-projection.test.ts::treats a refund as terminal regardless of remaining service coverage` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-029 | T008,T010,T011,T015,T017,T019 | `tests/integration/refund-audit.test.ts::audits refund, allocation, cancellations and deactivation with allow-listed details` | PR #27 merge `c6a6237` | VERIFIED | Retention/legal evidence T019 remains open (production blocker). |
| FR-030 | T014,T015 | `tests/unit/refund-service.test.ts::returns generic unauthorized for missing or foreign workspace authorization` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-031 | T018 | NOT-FOUND: no asserting test for the Frontend Design Gate flag/matrix evidence | PR #27 merge `c6a6237` | UNVERIFIED | No rendered UI built; Frontend Design Gate evidence pending. |
| FR-032 | (none) | NOT-FOUND: no asserting test; P4-owned consumer, not implemented in F13 | PR #27 merge `c6a6237` | UNVERIFIED | P4 owns notices/communication; out of F13 scope. |
| FR-033 | T002,T008,T010,T011,T012,T015,T017 | `tests/integration/rls-catalog.test.ts::all private functions have hardened ownership, search path and execute grants` | PR #27 merge `c6a6237` | VERIFIED | - |
| FR-034 | T001,T002,T004,T015,T017,T018,T019 | `tests/integration/f13-stack-readiness.test.ts::has the selected project identity, API/DB ports, and complete migration baseline (${stack})` | PR #27 merge `c6a6237` | VERIFIED | Legal/technical retention and production gates T019 remain open. |
| FR-035 | T003,T015,T016,T019,T020 | `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` | PR #27 merge `c6a6237` | VERIFIED | Hosted hook enablement T020 remains a separate PO-approved change. |
| FR-036 | T002,T005,T010,T015,T017 | `tests/integration/matrix-parity.test.ts::T005 bidirectional parity: ${role} / ${capability}` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-001 | T012,T013,T014,T015 | `tests/integration/refund-operations.test.ts::records an atomic capped refund and replays its exact authorized receipt` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-002 | T012,T013,T015 | `tests/unit/refund-allocation.test.ts::respects previous allocations and rejects amounts above the remaining source cap` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-003 | T006,T007,T008 | `tests/unit/freeze-calendar.test.ts::counts Apply and excludes Stop` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-004 | T009,T010 | `tests/unit/renewal-projection.test.ts::merges contiguous predecessor and early-renewal coverage without losing remaining days` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-005 | T010,T014 | `tests/integration/matrix-parity.test.ts::T005 bidirectional parity: ${role} / ${capability}` | PR #27 merge `c6a6237` | PARTIAL | Cited parity test does not assert unactivated fixtures have no expiry/later due date or zero service days, nor full/partial refund on eligible paid fixtures without activation. || SC-006 | T006,T007,T009,T011 | `tests/unit/freeze-calendar.test.ts::keeps calendar arithmetic independent of elapsed hours over DST` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-007 | T001,T012,T013,T015 | `tests/integration/refund-ledger-integrity.test.ts::T012 allows multiple partial allocations against one source up to the exact cap` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-008 | T005,T010,T014,T015,T017 | `tests/integration/matrix-parity.test.ts::T005 bidirectional parity: ${role} / ${capability}` | PR #27 merge `c6a6237` | VERIFIED | - |
| SC-009 | T003,T015,T016,T019,T020 | `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` | PR #27 merge `c6a6237` | VERIFIED | T019/T020 production gates remain open. |
| SC-010 | T007,T008,T011,T015,T019 | `tests/integration/refund-audit.test.ts::audits refund, allocation, cancellations and deactivation with allow-listed details` | PR #27 merge `c6a6237` | PARTIAL | Cited audit test does not assert freeze audit replay (one fact per committed freeze mutation, zero on replay) or AT-KPI-03 genuine delivered productivity unchanged. Retention/legal evidence T019 remains open. || SC-011 | T018 | NOT-FOUND: no asserting test for the 8-cell AR/EN light/dark mobile/desktop matrix | PR #27 merge `c6a6237` | UNVERIFIED | No rendered UI; Frontend Design Gate pending. |
| SC-012 | T007,T009,T011 | `tests/unit/entitlement-projection.test.ts::uses successor coverage to bridge an expired predecessor` | PR #27 merge `c6a6237` | PARTIAL | P4 notice and access enforcement consumer tests pending. |
| SC-013 | T007,T009,T011,T018 | `tests/unit/entitlement-projection.test.ts::includes freeze contribution and reports the freeze window without job state` | PR #27 merge `c6a6237` | PARTIAL | P5 check-in and resume policy consumer tests pending. || SC-014 | T003,T016,T020 | `tests/integration/refund-auth-lockout-hook.test.ts::denies client sign-in and refresh immediately after committed deactivation, even while lockout worker is unavailable` | PR #27 merge `c6a6237` | PARTIAL | Hosted non-production smoke test (T020) not run; production enablement requires PO approval. |

## Blocked tasks (not implemented in this lane)

- **T019** (U07, retention legal/technical): BLOCKED — 30-day retention across all recoverable copies including backups requires legal/technical feasibility review; minimal legally required financial/audit evidence reconciliation pending. Owner: `quickstart.md` + approved retention register. Gates: FR-019, FR-029, FR-034, FR-035; SC-009, SC-010. No answer proposed here.
- **T020** (U07 production readiness): BLOCKED — (a) **D-20 conflict (OPEN PO item, separate from F13-PB-03):** D-20 permits one cloud project for production and requires development/testing to use local Docker, so the required non-production hosted smoke test (password sign-in + refresh denied for a synthetic deactivated user) cannot run on a hosted project without a decision. (b) **F13-PB-03 (separate):** production Auth-hook enablement approval for the Custom Access Token hook. These two restrictions are recorded separately; no answer is proposed here. Gates: FR-019, FR-035; SC-009, SC-014.

## Counts by status

- VERIFIED: 41
- PARTIAL: 6 (FR-019, SC-005, SC-010, SC-012, SC-013, SC-014)
- UNVERIFIED: 3 (FR-031, FR-032, SC-011)
- Blocked tasks: 2 (T019, T020)
- Total matrix rows: 50 (36 FR + 14 SC)
