# Tasks: P8 security and performance readiness

**Prerequisites**: spec, plan, research, data model, contracts. Documentation/process tasks only; no external test is commissioned or run here.

## Phase 1: Gate/source reconciliation

- [ ] T001 [FR-001,FR-004,FR-009] Compare proposed PT-01 to all existing docs/13 security, storage, CI, backup and go-live gates; avoid duplicate controls and do not mark any existing row Done.
- [ ] T002 [FR-005,FR-006,FR-007] Reconfirm spec 008 measurement commands/inputs and preserve its existing volume assumptions without duplication.

## Phase 2: External test readiness

- [ ] T003 [FR-001,FR-002,FR-003] Prepare PO-decision-neutral rules-of-engagement, test scope, role/object coverage map and synthetic target plan; no procurement or vendor/window selection occurs while MCQ 031-01 is open.
- [ ] T004 [FR-002,FR-003,FR-004] Map API, export, bot, storage and background job test coverage to existing role/RLS/authorization tests and document evidence/remediation/retest process.
- [ ] T005 [FR-001,FR-003,FR-004,FR-009] Add PT-01 Open row to docs/13 with stable source, owner, PO approval dependency, sanitized evidence, remediation/retest criterion; do not authorize or run engagement.

## Phase 3: Performance readiness

- [ ] T006 [FR-005,FR-006,FR-008] Prepare spec 008 routes/measurement matrix for mobile web, existing client/staff/workspace directory surfaces, reports and pagination/filtering paths using synthetic data; cite exact command/input/output paths.
- [ ] T007 [FR-007] Label PI-03 results baseline-only while MCQ 031-02 is open; do not claim a pass or choose thresholds.
- [ ] T008 [FR-005,FR-006,FR-007,FR-009] If PO later approves numeric budgets, compare reproducible dated runs to those targets and record pass/fail; clarify existing PI-03 evidence to require approved volumes, dated measurement, baseline and approved budgets. Do not add duplicate capacity row or numeric default.

## Phase 4: Documentation acceptance

- [ ] T009 [FR-001..010] Verify every P8 security/performance requirement maps to PT-01 or PI-03, each relevant role has explicit positive/negative coverage, evidence artifacts are sanitized, all prior production gates remain unchanged, and acceptance rows include their full FR clauses.
- [ ] T010 [FR-001..010] Validate docs links/format and record docs-only review evidence; no tests or production actions are run by this spec.

Dependencies: T001-T002 precede drafting. T003 gates procurement only; T004-T005 are independent readiness work. T006 can proceed before MCQ 031-02; T007 gates pass/fail threshold wording. T009-T010 follow content changes.
