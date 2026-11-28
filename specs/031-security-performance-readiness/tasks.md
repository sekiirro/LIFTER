# Tasks: P8 security and performance readiness

**Prerequisites**: spec, plan, research, data model, contracts. Documentation/process tasks only; no external test is commissioned or run here.

## Phase 1: Gate/source reconciliation

- [x] T001 [FR-001,FR-004,FR-009] Compare proposed PT-01 to all existing docs/13 security, storage, CI, backup and go-live gates; avoid duplicate controls and do not mark any existing row Done.
- [x] T002 [FR-005,FR-006,FR-007] Reconfirm spec 008 measurement commands/inputs and preserve its existing volume assumptions without duplication.

## Phase 2: External test readiness

- [x] T003 [FR-001,FR-002,FR-003] Prepare rules-of-engagement, test scope, role/object coverage map and synthetic target plan; defer vendor and timing selection until after pilot and keep PT-01 blocking pre-go-live.
- [x] T004 [FR-002,FR-003,FR-004] Map API, export, bot, storage and background job test coverage to existing role/RLS/authorization tests and document evidence/remediation/retest process.
- [x] T005 [FR-001,FR-003,FR-004,FR-009] Update the existing PT-01 row in docs/13 with S71-PO-7 post-pilot vendor/timing deferral, blocking pre-go-live status, stable source, owner, sanitized evidence, and remediation/retest criterion; do not create a duplicate row, authorize or run engagement.

## Phase 3: Performance readiness

- [x] T006 [FR-005,FR-006,FR-008] Prepare the spec 008 routes/measurement matrix for mobile web, existing client/staff/workspace directory surfaces, reports and pagination/filtering paths using synthetic data; record the applicable route list and exact command/input/output paths before a run.
- [ ] T007 [FR-007] In the post-pilot PI-03 evidence activity, measure the baseline at spec 008 pilot volumes and propose per-route p95 latency/error budgets; label them proposals and do not claim a pass before PO signature. This documentation-only specification PR does not execute the measurement.
- [x] T008 [FR-005,FR-006,FR-007,FR-009] Gate PI-03 performance pass/fail only after PO signs the proposed per-route p95 latency/error budgets; compare reproducible dated runs to signed targets and record results. Do not add a duplicate capacity row or numeric default.

## Phase 4: Documentation acceptance

- [x] T009 [FR-001..010,SC-001..SC-005] Verify every P8 security/performance requirement maps to PT-01 or PI-03, each relevant role has explicit positive/negative coverage, evidence artifacts are sanitized, all prior production gates remain unchanged, and acceptance rows include their full FR clauses.
- [x] T010 [FR-001..010,SC-001..SC-005] Validate docs links/format and record docs-only review evidence; no tests or production actions are run by this spec.

Dependencies: T001-T002 precede drafting. T003-T005 establish PT-01 while vendor/timing remain deferred until after pilot. T006-T007 record baseline and proposed budgets; T008 gates performance pass/fail on PO signature. T009-T010 follow content changes.
