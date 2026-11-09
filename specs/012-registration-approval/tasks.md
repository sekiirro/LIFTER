# Tasks: F12 — Registration approval and payments

**Input**: [plan](plan.md), [spec](spec.md), [research](research.md), [model](data-model.md), [surface contract](contracts/registration-approval-surface.md), [handoffs](contracts/feature-handoffs.md), [verification](quickstart.md).

**Status**: Execution in progress, 2026-10-29. Session 12 completed T001 and T006-T012 with observed evidence in `tests/integration/registration-approval-verification.md`; previously completed U1 money and DB-free flexible terms tasks remain checked. U3 T013-T017, U4 T018-T022 and U5 T023-T027 are also complete with observed operation, replay, concurrency, audit, safe-reader and full regression evidence in `tests/integration/registration-approval-verification.md`. All other tasks remain pending. Session-12 architect/user instructions explicitly substitute Stack A for the historical B requirements below. PA-F12-1..9 are Decided; independent review and later feature acceptance remain outstanding.

## Task format, ownership and execution rules

`[ID] [P?] [Story]` is followed by exact owned paths and the required result. US1 approve; US2 reject/reconsider; US3 later payment; US4 correction; US5 live self-status; US6 isolation/denial; US7 concurrency/replay. All stories are spec priority P1; US8 is flexible F10 terms configuration (T049-T054), with [US1] tags retained for its approval prerequisite linkage. Tests are expressly required by this brief: write assertions first, capture meaningful RED, then implement the owned scope and capture GREEN. Do not mark planned tests passing before they execute.

One writing agent per worktree/branch and disjoint files, no shared checkout edits. Every task owns only the paths it lists; shared migrations/messages/evidence are serialized. [P] means file-disjoint preparation is possible after prerequisites, not parallel DB execution. No task author approves their own unit. New migration names below are proposed; recheck collision and latest F11 head before allocation, never edit committed migrations.

Every DB unit must use the landed selector/harness with explicit `LIFTER_SUPABASE_STACK=b`, project `lifter-stack-b`, matching loopback API/DB config ports in 25420–25429, and exclusive B lock. Missing B/selectors/harness/provisioning authorization blocks that unit, with no fallback to A. Stack A remains F11-owned. App-mock/pure-unit work is DB-free; real integration/e2e needs B. Remote CI is isolated and never a workstation DB-lock substitute.

## Unit boundaries

| Unit | Tasks     | Scope / prerequisite                                               | DB / stack need                                                                             | Exit                                                                       |
| ---- | --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| U0   | T001–T003 | Baseline, approvals and infrastructure integration readiness       | DB-free; read-only B readiness records, no provisioning                                     | F11/infrastructure SHA, PA approvals, selector integration path accepted   |
| U1   | T004–T007 | Exact money, shape validation and TS matrix                        | DB-free, pure unit checks only                                                              | Q-V02/03 RED→GREEN; future SQL parity pending U2                           |
| U1F  | T049-T054 | F10 flexible issuance extension, after U1 and selector integration | B lock for SQL/integration; UI/unit parts DB-free                                           | upfront/count/default/custom preservation RED-to-GREEN                     |
| U2   | T008–T012 | Tenant model, chain constraints, guards, DB matrix, audit source   | B lock; migration/catalog/integrity tests                                                   | model/guard/grant/audit catalog GREEN; public operations not yet available |
| U3   | T013–T017 | US1/2 approval/reject/reconsider + durable fact/receipts           | B lock; U2; final code/custom-offset policy applied                                         | atomic transitions, first collection and replay/concurrency GREEN          |
| U4   | T018–T022 | US3/4 collect/correct/recollect                                    | B lock; U3; final sequential/correction-month policy                                        | full money/correction/idempotency assertions GREEN                         |
| U5   | T023–T027 | US5/6 safe readers, client helper, activation projection           | B lock; U4; final custom/default calendar-day rule                                          | direct reads/RLS/self-status GREEN, no P4 writer                           |
| U6   | T028–T032 | Server Actions/services and app authorization                      | DB-free mocks; U5 contracts fixed                                                           | accepting-backend mocks cannot bypass app wall                             |
| U7   | T033–T037 | Staff queue/full review/payment/correction UI                      | DB-free component/mocked render; final badge/dashboard/retry policy; real e2e deferred      | UI unit GREEN; rendered authenticated matrix pending U9/Stack A                  |
| U8   | T038–T041 | Self-status presentation and live refresh                          | DB-free component/action mocks; U5/6, final standalone-status policy; U7 shared i18n merged | no-relogin refresh behavior unit GREEN; real session proof pending U9      |
| U9   | T042–T047 | Integrated verification, mutations, frontend gate/evidence         | Exclusive Stack A lock, owned DB/Storage and app; all prior units                                 | money/isolation/AR-EN/log-scrub/gates + exact-head CI evidence             |
| U10  | T048      | Independent architect/PO acceptance review                         | DB-free review of diff/CI/evidence; no Claude git/tests                                     | independent verdict; PO release/merge decisions remain reserved            |

## Phase 1 — Setup and foundational readiness (U0)

(s14 architect ruling: Stack A.)

- [x] T001 Record final F11/infrastructure merge SHA and installed guard/audit diff in `specs/012-registration-approval/research.md` and `plan.md`; resolve source conflicts through architect review, never auto-merge conflicting F11 behavior. Depends on final F11 PR #14 review; no source code ownership.
- [ ] T002 Verify the verbatim final PO decisions and their Decided PA-F12-1..9 mapping, and record architect AI-F12-1 integration choice in `specs/012-registration-approval/plan.md`; propagate approved refinements into `data-model.md`, both `contracts/*.md`, `quickstart.md` and `tasks.md` before affected work. Do not reopen final policy or substitute prior recommendations.
- [ ] T003 After separately approved infrastructure integration, record landed selector/harness/provisioner/e2e routing and Stack A readiness evidence in `specs/012-registration-approval/research.md`; verify Q-V01's pre-connection guards under its separate infrastructure tests. This task owns documentation only: do not edit `infra-second-stack` files or start/provision Stack A. Stop until the integrated infrastructure owner supplies that evidence.

## Phase 2 — Exact money, request validation and app matrix (U1)

- [x] T004 [P] [US3] Write RED vectors in `tests/unit/registration-approval-money.test.ts` for Round Half Up, 0/100%, ties, bigint extremes, bounds, no JS-number money and exact display-string transformation. Own this test file only; Q-V02/Q-M07.
- [x] T005 [US3] Implement pure BigInt/decimal-string helpers in `lib/registration-approval/money.ts` to turn T004 GREEN, without new dependencies or currency policy. Test results are strings, no float conversion.
- [x] T006 [US6] Write RED role/shape/result tests in `tests/unit/registration-approval-validation.test.ts` and `tests/unit/registration-approval-capabilities.test.ts`; reject method/free text/numeric money/actor/time overrides and deny Sales approval while preserving payment. Own both test files; Q-V03/Q-M01.
- [x] T007 [US6] Remove Sales approval in `lib/auth/capabilities.ts` only and implement `lib/registration-approval/validation.ts` / `results.ts` against the approved contracts; T006 GREEN. No SQL/matrix-helper changes in this DB-free unit.

Sales-denial work for T006/T007 lands with the U2 SQL capability and matrix-parity change; do not push the TS matrix removal alone.

## F12-owned F10 extension (U1F, T049-T054, before U2)

(s14 architect ruling: Stack A.)

Final F12-3 is in scope here, not a deferred F10 feature. Historical F10 spec is unchanged; see [addendum](../010-registration-links/addendum-f12-flexible-installments.md). This unit must include the full Frontend Design Gate for changed link-creation UI, DESIGN.md authority, AR/EN/RTL states and retained screenshot evidence later in U9. AI-F12-2/3 govern detailed editor mechanics; no invented default percentage/equal split. Shared messages/validation/service files are released sequentially before U7/U8.

- [x] T049 [US1] Write RED explicit flexible-input/default-constructor tests in `tests/unit/registration-links-flexible.test.ts` and extend `tests/unit/registration-links-actions.test.ts`: upfront/count/row coherence, positive exact residual, custom amounts/offsets, price-total validation and Trainer denial. Own these tests only; Q-V15/Q-M19/20.
- [ ] T050 [US6] Write RED wrapper and historic-fingerprint tests in `tests/integration/registration-links-flexible.test.ts`, extending `tests/integration/registration-links-fixture.ts` sequentially: exact total/deferred rollback, wrong upfront/count, current-version/role/foreign checks, no changes to issued legacy first/second offsets or amounts and F11 signup binding. Stack A lock required; Q-M19..21.
- [ ] T051 [US1] Verify the already-installed forward migration `20261101131000_flexible_registration_link_terms_forward.sql` on Stack A: authenticated `issue_flexible_registration_link` wrapper, upfront/count/array coherence and reauthorization, delegation to installed issuer, explicit EXECUTE grants, and preserved legacy issuer/guards/RLS/snapshots/tokens/audit. T050 Stack A verification remains pending. Do not modify the committed migration; if a correction is required, use a new forward migration after the required gates.
- [x] T052 [US1] Extend `lib/registration-links/validation.ts`, `service.ts`, `app/(app)/registration-links/actions.ts` for the v2 paymentTerms shape and wrapper call; write missing module assertions before changing each path, then T049 GREEN. Null means full upfront/no schedule; legacy DB contract remains intact. No new money-number arithmetic or dependencies.
- [ ] T053 [US1] Write RED default/custom Upfront/count/individual amount/timing UI tests in `tests/unit/registration-links-flexible-ui.test.ts`, extend `tests/unit/registration-links-dialog.test.ts` and message parity assertions in `tests/unit/registration-approval-messages.test.ts`; no arbitrary upfront default. Confirm full-price upfront has no zero remainder and count changes never silently rewrite entered agreements.
- [ ] T054 [US1] Extend existing `components/registration-links/RegistrationLinkDialog.tsx`, `RegistrationLinksManager.tsx`, `registration-links.module.css` and `lib/i18n/messages/ar.ts`/`en.ts` from reviewed editor design; message tests/strings first, then T053 GREEN. Implement chosen upfront/default residual +30, explicit custom count/amounts/timing, live exact total/anchor copy; preserve show-once URL/privacy/role states. Record U1F evidence in `tests/integration/registration-approval-verification.md`; release shared files before U7/U8. Real rendered Stack A matrix and e2e remain U9.

## Phase 3 — Tenant model and immutable integrity (U2, blocking foundation)

- [x] T008 [US6] Write RED model/catalog/RLS tests in `tests/integration/registration-approval-schema.test.ts` and synthetic helpers in `tests/integration/registration-approval-fixture.ts`. Enumerate every new table's forced RLS, grants, composite FKs, guard and exact function inventory; controlled-grant role tests independent of grants. B lock required; Q-V04/Q-M03..06/12.
- [x] T009 [US7] Write RED chain/snapshot/deferral/commission tests in `tests/integration/registration-approval-integrity.test.ts`; raw different-key roots/branches/revisions, reversal equality, recollection, overflow and exact totals fail independently of RPC. No public operation assumptions at U2 exit.
- [x] T010 [US6] Extend `tests/integration/matrix-parity.test.ts` and write `tests/integration/registration-approval-audit.test.ts` RED assertions for complete latest audit branch inventory, client UPDATE trigger, no duplicate signup INSERT audit, new financial events and grants. B lock required; Q-V03/11/Q-M02/13.
- [x] T011 [US7] Create only new forward `supabase/migrations/20261101120000_registration_approval_model.sql`: all planned tables/constraints/append-only guards, narrow clients approval guard/decision correspondence, DB Sales capability removal, integer-money helper, and complete latest audit body extension. Own this migration exclusively; preserve F11 Auth/consumption/recovery and all historical mappings. T008–T010 model/catalog assertions GREEN; RPC-specific assertions are authored in their later units.
- [x] T012 Record U2 RED→GREEN commands and pending surfaces in `tests/integration/registration-approval-verification.md`; run scoped B catalog/integrity/audit and existing F11/F9/F10/matrix regressions as required by the later brief. Own evidence file after prior owner releases it; no full-release claim.

## Phase 4 — Approve, reject, reconsider (US1/US2, U3)

**Independent slice**: From real synthetic F11 signup, approve once with installment 1 and immutable terms; separately reject a pending fixture, then PO-reconsider it using the same initial purchase invariant.

- [x] T013 [US1] Write RED success/rollback/history-binding tests in `tests/integration/registration-approval-operations.test.ts`: committed binding after link expiry/consumption/disablement/new version, no schedule full price, exact copied schedule, initial uniqueness, audit/deferred failure zero partial graph; Q-V05.
- [x] T014 [US2] Write RED rejection/reconsideration tests in `tests/integration/registration-approval-decisions.test.ts`: approved code list only, no free text, PO/WO reject, PO-only rejected→approved, stale normal approve, no identity/link/recovery change; Q-V06.
- [x] T015 [US7] Write RED bound-receipt/concurrency/revocation tests in `tests/integration/registration-approval-replay.test.ts`; authorization before replay/stale disclosure, identical safe receipt, different intent conflict, same-client races and role/membership changes after waits. Q-V09/10/Q-M10/11.
- [x] T016 [US1] Create `supabase/migrations/20261101121000_registration_approval_operations.sql` with hardened approve/reject/reconsider operations and private authorization/receipt/first-collection primitives. Atomically append approval fact, decision/client transition, subscription/obligations, first collection, audit and receipt; force deferred checks. Own this migration only; reuse model constraints; T013–T015 GREEN.
- [x] T017 [US1] Extend `tests/integration/registration-approval-audit.test.ts` and `registration-approval-verification.md` for exact transition/collection/fact counts, failed/rejected/replayed event absence, safe audit payload and F11 regressions; Q-V11/13/Q-M13/17. Sequential ownership after U2.

## Phase 5 — Later collection and correction (US3/US4, U4)

**Independent slice**: Approved fixture with unpaid later obligation; record one full payment, PO-correct it, then record a replacement full payment without altering the prior events.

- [x] T018 [US3] Write RED full-collection/date/timing tests in `tests/integration/registration-approval-payments.test.ts`: explicit expected installment/revision, full amount/currency, any past/today date, fresh Cairo future denial, no method/reference, seq>=2 only after activation, all earlier obligations currently paid, early before due allowed. Q-V07.
- [x] T019 [US4] Write RED exact-original correction/recollection tests in `tests/integration/registration-approval-corrections.test.ts`: PO only, no partial reversal, net original amount/commission, no client/subscription cancellation, no original mutation, effective_on = fresh Cairo correction recording date, in correction month; replay keeps that date across months. Q-V08/Q-M08/09.
- [x] T020 [US7] Extend `tests/integration/registration-approval-replay.test.ts` for two-session collect/correct/recollect/double-correction and distinct-key same-revision races; reject receipt intent drift and revoked actor replay. Own file only after U3 releases it; Q-V09/10.
- [x] T021 [US4] Create `supabase/migrations/20261101122000_payment_operations.sql` implementing explicit collection and PO correction RPCs, exact-value reversal, shared subscription serialization and atomic receipt/audit; T018–T020 GREEN. No mutable financial row or F13 refund behavior.
- [x] T022 Extend `tests/integration/registration-approval-audit.test.ts` and `registration-approval-verification.md` sequentially for correction audit/rollback, stored commission and final correction recording-month accounting; run relevant scoped money gate/regressions on B. Correction is a mandatory pre-real-finance gate, not deferred to F13.

## Phase 6 — Safe reads and self-status (US5/US6, U5)

- [x] T023 [US6] Write RED safe-projection, commission and foreign read tests in `tests/integration/registration-approval-reads.test.ts`; test direct RPC/PostgREST/embedding/wildcard and controlled-grant RLS, Sales commission omission, PO real workspace, no receipt disclosure. Q-V04/12/Q-M04/15.
- [x] T024 [US5] Write RED signed self-status/helper tests in `tests/integration/registration-approval-client-access.test.ts`: no target input, indexed self association, pending/rejected status-only exception, no cross-request cache, approved alone no other resource rights, no recursion. Q-V12/Q-M14.
- [x] T025 [US3] Write RED undefined-before-activation and snapshot-offset tests in `tests/integration/registration-approval-activation.test.ts`; use transaction-only synthetic activation facts, not a public writer or fake plan engine. Include default 30-calendar-day and custom offset/day-end/DST boundaries, with no fixed-second-offset normalization and no premature due date; Q-V13/Q-M16.
- [x] T026 [US6] Create `supabase/migrations/20261101123000_registration_approval_reads.sql` for safe role-separated readers, narrow self-status/private client helper and due projection; no base grants, no activation writer, no P2 consumer. Own this migration only; T023–T025 GREEN.
- [x] T027 Update `tests/integration/registration-approval-verification.md` sequentially with read/RLS/catalog inventory, full denials and activation/P2 dependency limits. Run F11 pending/recovery regressions with the intended status-only exception clearly scoped.

## Phase 7 — Server adapters and app wall (U6)

- [x] T028 [US6] Write RED accepting-backend-mock tests in `tests/unit/registration-approval-actions.test.ts`: each role/scope, PO-only correction/reconsideration, CSRF/shape, exact replay request retention and generic failures; a permissive mocked RPC must not bypass app denial. Q-M09/18. Evidence: U6 section in `tests/integration/registration-approval-verification.md`; focused actions suite passed 33 tests.
- [x] T029 [P] [US6] Write RED reader/projection/request-memoization tests in `tests/unit/registration-approval-read.test.ts` and `tests/unit/client-access.test.ts`; no service-role import, shared cache, or commission in safe results. Evidence: U6 section; focused reader/client suites passed 15 tests.
- [x] T030 [US1] Implement `lib/registration-approval/service.ts`, `read.ts` and `app/(app)/registration-approvals/actions.ts` using signed session client and app authorize before one bounded RPC; normalize only safe result codes. T028 GREEN; DB-free mocked calls only in U6. Evidence: U6 section; role-denial, single-RPC names, projection and safe-result mocks passed.
- [x] T031 [US5] Implement `lib/client-access/authorize.ts` and `lib/client-access/status.ts` with signed self association, separate client path and per-request memoization; T029 GREEN. No staff helper widening or Storage grant. Evidence: U6 section; signed no-argument self-status and request-isolation tests passed.
- [x] T032 [US6] Add log-scrub result/action cases to `tests/unit/registration-approval-actions.test.ts`; extend `tests/integration/registration-approval-verification.md` with mock-only limits, no raw input/provider output. Sequential ownership after T028/U5; final real wiring waits U9. Evidence: U6 section; thrown-provider and returned-error log-scrub tests passed; all four required mutations were detected and restored.

## Phase 8 — Staff UI (US1/2/3/4/6, U7)

**Frontend Design Gate**: Include all of [docs/09](../../docs/09-frontend-design-gate.md) in this unit's brief; read authoritative DESIGN.md/F2 tokens/components and the full skill catalog, record per-skill applicability and apply applicable skills. Missing design decisions stop that portion and go to PO with A/B/C. Never invent DS tokens or role tabs. Final badge/dashboard/retry policy governs affected presentation; full page and read-only amount/confirmation already decided and must not be re-asked.

Execute U7 as T033 → T036 (message tests/strings) → T034 → T035 → T037, so components never need temporary hard-coded copy. T035 adds its own component assertions before its implementation.

- [x] T033 [US1] Write RED page/component tests in `tests/unit/registration-approval-page.test.ts` and `tests/unit/registration-approval-components.test.ts` for full-page review, automatic noneditable amount, explicit confirmation, date/code controls, role-based correction/reconsider visibility, safe stale/network states. Verify Sales payment list/detail allowed but approval queue/review denied. No real backend needed.
- [x] T034 [US1] Implement `app/(app)/registration-approvals/page.tsx`, `[clientId]/page.tsx`, `loading.tsx`, `error.tsx`, separate `app/(app)/payments/page.tsx`, `[subscriptionId]/page.tsx`, `loading.tsx`, `error.tsx` and `components/registration-approval/PaymentQueue.tsx`, `ApprovalReview.tsx`, `ApprovalQueue.tsx`, `registration-approval.module.css` using existing DS. Staff names/issued terms only as safe reader permits; no contact/free-text/method fields. T033 GREEN with T036 messages present. Also own `app/(app)/page.tsx` dashboard links: Approvals for PO/WO approval capability, Payments for PO/WO/Sales record_payment; no Trainer/foreign leakage and no role-nav redesign. A signed client gets a self-status link, no staff links.
- [x] T035 [US4] Implement `components/registration-approval/PaymentHistory.tsx`, `PaymentConfirmation.tsx` and `StatusBadge.tsx` from final existing-token/identical-key retry decisions and existing semantic fg/bg/border tokens. Include PO-only correction and reconsideration actions on review, full exact amount display and explicit confirmation. Extend T033 component test file sequentially before each implementation change to preserve RED→GREEN.
- [x] T036 [US6] Add reviewed AR/EN messages to `lib/i18n/messages/ar.ts` and `en.ts` and first write message parity/semantics tests in `tests/unit/registration-approval-messages.test.ts`; use Bidi, existing fonts/tokens/preferences and no ad hoc motion. Own both message files exclusively; T036 must finish before U8 edits them.
- [x] T037 Record component/state/accessibility review and mock-render limits in `tests/integration/registration-approval-verification.md`. No rendered matrix PASS claim until U9's authenticated B screenshots; identify any remaining gate gap rather than inventing it.

U7 T035 exit note (2026-10-30): payment confirmation, collection history, retry-key retention and PO-only correction are implemented on the Payments detail flow. The `registration_approval_review` U5 projection returned by `readRegistrationApprovalReview` contains no subscription ID, obligation ID, revision or event ID, which `correctCollectionAction` requires. Therefore the PO correction action is not placed on the approval review screen; T035 remains open. Recommended: add a separately reviewed U5 safe review projection in a follow-up before placing correction on the review page. Alternatives: move the approved T035 placement to Payments detail (already implemented, lower scope but requires PO/task wording approval), or defer correction UI until the next approved slice.

S14 T035 closure (2026-10-30): Architect accepted option 1. Added the separate PO-only minimal correction projection in forward migration `20261101125000_registration_approval_correction_read.sql`, then wired its four-field context into `ApprovalReview`. See the S14 continuation in `tests/integration/registration-approval-verification.md` for RED/GREEN, mutation, and Stack A evidence. The membership check now precedes the review reader.

## Phase 9 — Client status presentation (US5, U8)

**Frontend Design Gate**: Same full gate as U7; no intake/form UI or Trainer capability decision. Final F12-6 governs the standalone page, detection/redirect and manual fallback; refresh must still reveal approval without re-login.

Execute U8 as T038 → T040 (message tests/strings) → T039 → T041, after U7 releases both message files.

- [x] T038 [US5] Write RED visible-page refresh/focus/manual retry/no-session/long-lived-session tests in `tests/unit/registration-approval-status-page.test.ts`; test 15-second minimum/12-attempt visible budget/one-in-flight, hidden/offline pause, Auth expiry, manual refresh, rejected stop, safe single redirect and failed-navigation fallback; mock transition pending→approved without sign-in and verify denied foreign target shapes and no shared cache.
- [x] T039 [US5] Implement `app/(client)/account/status/page.tsx`, `actions.ts`, `loading.tsx`, `error.tsx` and `components/registration-approval/ClientStatus.tsx`; separate client route authorization, token-free self-status, reviewed non-activation copy and bounded visibility-aware polling/approved-transition redirect per contract; never Realtime or guessed routes. T038 GREEN; no future form CTA or assignment stub; existing `/` fallback rechecks Auth/self mapping and remains manually usable if automatic navigation fails.
- [x] T040 [US5] Extend `lib/i18n/messages/ar.ts`, `en.ts` and `tests/unit/registration-approval-messages.test.ts` sequentially after U7; test new message parity first, then reviewed bilingual status strings. No shell/role-tab changes outside an approved explicit task.
- [x] T041 Record U8 mock status/accessibility outcomes and P2 presentation dependency in `tests/integration/registration-approval-verification.md`; actual signed-client no-relogin proof remains U9/B.

## Phase 10 — Integrated money/isolation/UI verification (U9)

(s14 architect ruling: Stack A.)

- [ ] T042 [US7] Add missing RED integrated real-F11-signup/session cases first to `tests/integration/registration-approval-operations.test.ts`, `registration-approval-client-access.test.ts`, `registration-approval-replay.test.ts`; exercise real sessions/Revocation/PostgREST/Storage, not grant-masked or mock-only denials. Run scoped GREEN after approved implementation fixes in separately assigned owned paths; no broad ownership license to edit another unit silently.
- [ ] T043 [US6] Write RED real staff/client UI, axe and eight-cell screenshot journeys in `tests/e2e/registration-approval.spec.ts` and `tests/e2e/registration-approval-a11y.spec.ts`; then verify GREEN on Stack A app/session. Gate covers full review/collections/correction/status and state matrix, all role denials, no P2 form; retained evidence links required.
- [ ] T044 [US7] Execute Q-M01..Q-M24 on disposable Stack A/module fixtures, capture expected failing meaningful assertions and restored GREEN in `tests/integration/registration-approval-verification.md`. No committed mutants, historical migration edits, unowned stack access or arbitrary destructive reset.
- [ ] T045 Run the later authorized full repository gates (typecheck/lint/format/unit/integration/e2e/axe/edge-build/secrets/size plus diff check), relevant F11/F9/F10/audit/matrix/recovery regressions, explicit money/isolation/log-scrub and frontend review; record exact commands/results and gaps in `tests/integration/registration-approval-verification.md`. Do not claim P2/P4 behavior from fixture seams.
- [ ] T046 Reconcile final traceability FR-001..029/SC-001..011, Q-V/Q-M and ND/DG/PA approvals in `tests/integration/registration-approval-verification.md`; fix only approved bounded ownership deltas, then rerun affected checks. Correction operationality is mandatory before real finance; production B4/hosted/backup gates remain.
- [ ] T047 Attach retained rendered artifacts and exact-head push CI IDs/conclusions to `tests/integration/registration-approval-verification.md` after reviewed explicit staging/commit/push under its later brief. If a PR is later authorized, record pull_request merge-result CI/security/CodeRabbit evidence too. This task grants no PR or main merge authorization.

## Phase 11 — Independent review (U10)

- [ ] T048 Architect independently reviews actual final diff, traceability, mutation evidence, selected-stack proof, money/isolation/UI gate results and exact-head CI. Record verdict in `specs/012-registration-approval/review.md` through the authorized git operator; PO retains plan/production/main-merge approvals. Do not mark self-approved or rerun git/tests as Claude. D-26 intermediate integration and full main merge gate remain mandatory.

## Dependencies and parallel opportunities

Critical path: U0 → U1 → U1F → U2 → U3 → U4 → U5 → U6 → U7 → U8 → U9 → U10. Pure U1 preparation can proceed while B provisioning is externally blocked only after its relevant plan items are approved. U6 mock tests can be prepared from approved contracts while DB units run in another disjoint worktree, but cannot claim integration before U5. T004 and T006, or T028 and T029, may be file-disjoint preparation; serialize shared validation/results, migrations, fixtures, messages and evidence. No concurrent database agents even on B; separate A/B locks and at most three total agents per governance.

Stories 1/2 share the atomic client transition foundation; 3/4 share obligation streams and receipts; 5 adds only self-status; 6/7 apply to all. Independent story tests use synthetic seeded prerequisites rather than assuming unrelated UI features. The smallest synthetic approval slice is not eligible for real money until correction, privacy and verification units are green. P2 and P4 consumers stay external dependencies; current unit creates no implementation.

## Traceability and unit exits

| Requirement / outcome                                 | Tasks / evidence                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| FR-001 / ND1 role removal                             | T006–T011/T014/T028; Q-V03, Q-M01/02/09                                 |
| FR-002..003 immutable binding/subscription            | T008–T017; Q-V05, Q-M03/06/12                                           |
| FR-004..005/009..010 confirmed full ledger/commission | T004–T005/T009/T013/T018–T022; Q-V02/07/08, Q-M05..08/12                |
| FR-006/008/017..018 isolation/projection              | T008/T010/T023/T026/T028–T032/T042; Q-V03/04/09/12, Q-M01..04/09..11/15 |
| FR-007 live client status                             | T024/T026/T029/T031/T038–T043; Q-V12/14, Q-M14                          |
| FR-011..012 receipts/locks                            | T015–T016/T020–T021/T028–T030/T042; Q-V09/10, Q-M05/10/11               |
| FR-013 historical dates                               | T006–T009/T018/T021; Q-V07, fresh Cairo/invalid date probes             |
| FR-014..015 correction                                | T019–T022/T035/T043; Q-V08..10, Q-M06/08/09                             |
| FR-016 audit                                          | T010–T017/T022/T044; Q-V11, Q-M13                                       |
| FR-019..021 / DG2..4 UI                               | T033–T043/T045; Q-V14, Q-M18; docs/09 retained evidence                 |
| FR-022 / REQ-P2-01                                    | T013/T016–T017/T025–T027; Q-V13, Q-M16/17; no form implementation       |
| SC-001..003                                           | Q-V02/05/07/08/10; U1–U4/U9                                             |
| SC-004..005                                           | Q-V03/04/09/12; U5/U6/U8/U9                                             |
| SC-006..007                                           | Q-V05/08..11/13 and Q-M checks; U2–U4/U9                                |
| SC-008                                                | Q-V14/doc09; U7–U9                                                      |

Final extension coverage: FR-023 and SC-009 -> T049-T054/Q-V15/Q-M19..21; FR-024/SC-010 -> T038-T043/Q-V16/Q-M23; FR-025/SC-011 -> T019-T022/Q-V17/Q-M22; FR-026 -> T014; FR-027 -> T018-T021/Q-M21; FR-028 -> T033-T034/Q-V18; FR-029 -> T028/T033-T035/Q-M24. U9 T043 adds default/custom link issuance, status redirect/manual fallback and dashboard role journeys before GREEN.

All checkboxes are execution status, not requirements approval. Preserve incomplete tests/blocked units honestly at each exit; no unit can waive a failed assertion by marking it out of scope after authoring it. Only architect/PO-approved scope changes alter the tasks.
