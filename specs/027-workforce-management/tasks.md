# Tasks: P7 Workforce Management

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Current lane**: Documentation-only; no application code, migrations, stack or tests. Every implementation task below is unchecked.
**Authority**: S70-PO-16. Do not reopen decisions it made. The only open policy items are P7-MCQ-01 and P7-MCQ-02 in `checklists/po-mcqs.md`.

## Slice 0 — Authoritative spec and implementation seams (about 250–400 changed lines)

- [ ] **T001 [FR-001–FR-021]** Review artifacts and answer P7-MCQ-01/02; update only affected requirements and re-run Analyze before implementation. Verify precise F19/F13/F15/F23/F10/F12/F26 schema/API seams against current main. No code before PENDING-PO entries are resolved for dependent behavior.
- [ ] **T002 [FR-017, FR-020]** Add database role/scope test fixtures and role-matrix inventory for PO/WO/Trainer/Sales, including authenticated identity, revoked membership, cross-workspace data and safe error projections. This slice creates no feature table.

## Slice 1 — Check-in history and follow-up (about 300–400 changed lines)

- [ ] **T003 [FR-004, FR-017, FR-020]** RED: add integration tests for every form/follow-up state, required page field, all-Trainer same-workspace weekly history, foreign-workspace denial, revocation race and no Forms duplication.
- [ ] **T004 [FR-004, FR-005, FR-017]** GREEN: extend current F15/F23 projections/authorization for required page fields and all-Trainer history; append transitions; preserve Late after follow-up; no check-in follow-up points.
- [ ] **T005 [FR-004, FR-017]** Validate Arabic RTL/English LTR check-in screen, empty/loading/error/permission states, keyboard and responsive states with PO-approved copy only; no new copy until approved.

## Slice 2 — Append-only points ledger and Trainer penalties (about 350–400 changed lines)

- [ ] **T006 [FR-001, FR-006, FR-017, FR-020]** RED: test F19 new-client +1 once; zero for renewal/upgrade/revision; immutable F19 source; duplicate and concurrent award; exact decimal arithmetic; negative totals; role and workspace denials.
- [ ] **T007 [FR-002, FR-006, FR-020]** RED: test initial plan-set late −1, on-time zero, responsible-Trainer attribution, disputed/corrected attribution by separate entries, and replay/concurrency idempotency.
- [ ] **T008 [FR-003, FR-005, FR-006, FR-020]** RED: test successful-submission plus >24h follow-up → one −0.5; exact 24h no penalty; client lateness no penalty; late persists after confirmation; duplicate clicks and concurrent confirmation create one event.
- [ ] **T009 [FR-001–FR-008, FR-017, FR-020]** GREEN: implement signed append-only KPI ledger and deterministic keys for F19/plan/check-in sources; retain audit attribution; never update/delete F19; permit negative totals; run mutation tests that kill dedup, sign, workspace and authorization predicates.

## Slice 3 — PO workforce review and manual adjustments (about 300–400 changed lines)

- [ ] **T010 [FR-006, FR-007, FR-017, FR-020]** RED: test PO-only manual add/deduct/correct/reattribute, immutable originals, source/reason/actor attribution, PO dispute, stale revision and idempotency mismatch.
- [ ] **T011 [FR-006, FR-007, FR-017]** GREEN: implement PO-only detail/report and separate adjustment/reversal entries; deny WO/Trainer/Sales and prevent UI/API/RPC/RLS/export bypass.

## Slice 4 — Compensation, monthly quality and payroll (about 350–400 changed lines)

- [ ] **T012 [FR-008, FR-009, FR-017, FR-020]** RED: test PO-set Basic Salary during provisioning for Trainer/Sales; WO excluded; own-compensation-only read; no staff-to-staff reads; PO-only incentive/deduction edits; exact monetary snapshot/history. Salary period/currency tests wait for P7-MCQ-02.
- [ ] **T013 [FR-008]** GREEN: add append-only compensation revision and PO-only externally-paid approval. No payout client/provider, salary deduction, or automatic link from points to pay. Implement only currency/period answered by PO.
- [ ] **T014 [FR-009, FR-017, FR-020]** RED/GREEN: test monthly Trainer transformation count/points, feedback counts and per-Trainer +1/−1 default/custom weights, historical revision and concurrent PO edit; implement append-only monthly quality records.

## Slice 5 — Sales acquisitions, refund reversals and privacy (about 350–400 changed lines)

- [ ] **T015 [FR-010–FR-012, FR-015, FR-017, FR-020]** RED: test one Sales +1 only after approved new client + confirmed first payment; link issuer attribution; installments equal; duplicate/refund races; full refund asks PO only; partial refund asks none; PO-selected staff deduction.
- [ ] **T016 [FR-010, FR-011, FR-015]** GREEN: attach once-only Sales acquisition and reversal to existing F10/F12/F13 facts; no changed refund math or duplicate refund engine; commit PO full-refund staff-fault answer and selected deductions atomically.
- [ ] **T017 [FR-012, FR-017]** RED/GREEN: test Sales secrecy before month-end, before finalization, cross-user/workspace, raw table/RLS, app API, RPC, export, cache and replay receipt. Grant only own finalized month total after month-end; PO detail stays full. Include exact-head mutation evidence for each boundary.

## Slice 6 — Monthly finalization, strikes, departure and retention (about 350–400 changed lines)

- [ ] **T018 [FR-013, FR-014, FR-020]** RED: test Cairo month-end boundary, snapshot recomputation, concurrent close, concurrent source writes and simultaneous PO edits. Post-close correction assertions require P7-MCQ-01.
- [ ] **T019 [FR-013, FR-014, FR-021]** GREEN: implement immutable monthly snapshots and finalization and correction behavior exactly as PO answers P7-MCQ-01; keep earlier versions. No default before answer.
- [ ] **T020 [FR-016, FR-017, FR-020]** RED/GREEN: test rolling 90-day boundary and thresholds 3/6/9, no automatic discipline, departure, immediate access revocation, client reassignment, preserved historical attribution and concurrency/revocation.
- [ ] **T021 [FR-018, FR-020]** RED/GREEN: test F26 30-day closure and audit clocks, pseudonymized/client-unlinked KPI records, historical staff totals and no use of `audit_events` as KPI state. Preserve existing F26 behavior and gates.

## Slice 7 — Post-launch Telegram feasibility note (documentation only; no implementation task)

- [ ] **T022 [FR-019]** Preserve the official-source feasibility record in a post-launch documentation note: inbound timestamp support, human reply observability/attribution UNVERIFIED, ordinary bots cannot observe human-to-human chats, LIFTER-owned shift configuration, retention/ToS limits. Cite exact URLs/claims from the read-only research artifact; mark unsupported items unverified. Add no runtime, bot, webhook, worker, schema, or implementation task for response-speed monitoring.

## Final verification slice (about 300–400 changed lines)

- [ ] **T023 [FR-001–FR-021]** Validate PO report/payroll/quality, Trainer Check-ins and Sales total UIs against the Frontend Design Gate: Arabic RTL/English LTR × light/dark × mobile/desktop, required loading/empty/error/permission states, keyboard use and accessibility. Use only PO-approved strings. Execute full unit, touched integration/RLS/security/money/concurrency suites and current format, lint, typecheck, secret, migration-version and exact-head docs CI gates. Update traceability only with passing evidence; re-run Analyze after any spec/plan/task/contract requirement text change. Do not claim gates until executed.

## Dependency order

1. T001 and T002; resolve relevant PO decisions first. T001 blocks T012/T013 on salary fields and T018/T019 on post-close policy; other slices continue.
2. T003 → T004 → T005 for check-in feature; T006/T007/T008 → T009 for KPI fact foundation.
3. T009 → T010 → T011 for reports/manual adjustments; T009 → T012 → T013/T014 for payroll/quality.
4. F10/F12/F13 integration begins after T009; T015 → T016 → T017 for Sales; T018 → T019 for monthly close; T020/T021 can proceed once tenant model and ledger exist.
5. T022 is post-launch documentation only and may run independently; it is never an implementation dependency.
6. T023 last, on final exact head. No task is ticked until executed test evidence is recorded in `traceability.md`.

## Slice discipline

Each implementation PR should stay near 400 changed lines and contain one independently testable vertical slice. Split further if a feature slice exceeds that target. Tests are RED-first for changed behavior, with role/RLS/money mutations where applicable. Keep all changes forward-only and merge order follows dependencies. Open product decisions block only dependent work.
