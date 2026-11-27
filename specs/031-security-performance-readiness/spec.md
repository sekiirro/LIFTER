# Feature Specification: P8 security and performance readiness

**Feature Branch**: `s71-031-hardening`
**Created**: 2026-11-27
**Status**: Draft; S71-PO-7 defers vendor/timing until after the pilot while retaining a blocking pre-go-live pen-test gate, and requires performance baselines before PO-signature of proposed budgets.
**Authority**: S71-PO-1 approves the P8 external pen-test and performance items. Readiness/process/gates only; no test execution or production change.

## Constitution check

No conflict identified. Constitution I/VII/IX require tenant isolation, privacy and reliable retries. PRD-13 requires cross-workspace tests for APIs, exports, bot, storage and jobs plus practical mobile performance, pagination/filtering and graceful loading. Do not edit Constitution.

## User Scenarios & Testing

### User Story 1 - PO commissions and reviews an independent external pen-test (Priority: P1)

As PO, I can approve a qualified test scope, vendor, budget and window, receive a sanitized report, and track remediation evidence before production data use.

**Why this priority**: PRD-13.1 and roadmap P8 require external cross-workspace testing; docs/13 separates readiness from execution.

**Independent Test**: Review a readiness pack with approved scope, rules of engagement, synthetic test account plan, deliverables, severity/remediation gates and evidence storage; this spec runs no test.

**Acceptance Scenarios**:

1. **Given** the pilot is incomplete, **When** readiness is reviewed, **Then** vendor and timing selection are deferred and PT-01 remains a blocking pre-go-live gate in `docs/13-production-readiness.md`.
2. **Given** PO approves an engagement, **When** an assessor completes testing, **Then** coverage includes APIs, exports, bot, storage and jobs and the report is sanitized.
3. **Given** required findings remain unresolved, **When** production readiness is checked, **Then** the gate remains open until verified remediation and required retest disposition are recorded.

### User Story 2 - PO reviews performance at approved pilot volumes (Priority: P1)

As PO, I can review reproducible measurements for core mobile web and directory/reporting paths at the existing illustrative pilot volumes, with thresholds approved before acceptance.

**Independent Test**: Run non-production measurements at spec 008 inputs and compare against PO-approved budgets; capture p50/p95, throughput/CPU and errors without secrets/client data.

**Acceptance Scenarios**:

1. **Given** synthetic pilot-volume fixtures, **When** approved scripts run, **Then** route timings, response size, CPU and failures are recorded; comparison to proposed budgets occurs only after PO signature.
2. **Given** a baseline at spec 008 pilot volumes, **When** route results are reviewed, **Then** proposed per-route p95 latency and error budgets are documented for PO signature.
3. **Given** the PO has not signed the proposed budgets, **When** measurements are collected, **Then** they are baseline-only and no pass/fail gate is asserted; after signature, compare the same reproducible run with the signed budgets.

### Edge Cases

- Never use real client data or production targets without separate PO approval.
- Missing, unavailable or partial evidence is not a pass.
- Security evidence must identify workspace/object scope without disclosing secrets or client content.
- A measurement baseline is distinct from passing an approved budget.

## Clarifications

S71-PO-7 resolves MCQ 031-01/02: select vendor and timing after the pilot, with the pen-test a blocking pre-go-live docs/13 gate; baseline at spec 008 pilot volumes and propose per-route p95 latency/error budgets, which become a gate only after PO signature. No open PO ambiguity remains.

## Requirements

- **FR-001**: Keep PT-01 as a blocking pre-go-live external pen-test gate in `docs/13-production-readiness.md`; vendor and timing are selected after the pilot, and the gate remains open until required test, remediation and retest evidence are recorded.
- **FR-002**: Proposed test scope covers cross-workspace/object access for APIs, exports, bot, storage, background jobs, authenticated routes and role boundaries.
- **FR-003**: Require synthetic accounts/data, least-privilege test identities, approved rules of engagement, sanitized evidence, severity tracking, remediation verification and final retest disposition.
- **FR-004**: Keep production-data use/go-live blocked until external evidence and remediation satisfy docs/13; do not mark existing gates Done.
- **FR-005**: Define repeatable non-production measurements for mobile web, the existing client, staff, and workspace directory surfaces, reports, and PRD-13 pagination/filtering paths; T006 records the applicable route list in the measurement matrix before any run.
- **FR-006**: Use spec 008 illustrative volumes (2 workspaces, 150 clients/workspace, 2 staff/workspace, 2 plans/client, 2 new versions/client/month) unless superseded by a later PO-approved target.
- **FR-007**: After the pilot, measure a baseline at spec 008 pilot volumes and propose per-route p95 latency and error budgets. Do not assert pass/fail until the PO signs the proposed values; after signature, compare reproducible runs against those values.
- **FR-008**: Use synthetic data, redact secrets/PII, and preserve current safety, CI and production-approval gates.
- **FR-009**: Update existing docs/13 readiness rows with stable ID, source, owner, evidence and status where needed; do not create another readiness register.
- **FR-010**: Exclude leaderboard/legal review (spec 024), implementation changes, duplicate benchmark tools, and production testing.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** the pilot is incomplete or required pen-test evidence is missing, **When** PT-01 is reviewed, **Then** vendor/timing remain deferred until after pilot and the external pen-test remains a blocking pre-go-live gate.                                                                                |
| FR-002 | **Given** an approved rules-of-engagement draft, **When** coverage is checked, **Then** APIs, exports, bot, storage, jobs, authenticated routes and role/object boundaries appear, with positive and negative cases mapped to the permissions in `docs/02-architecture.md:35-49`.                              |
| FR-003 | **Given** test identities and evidence handling, **When** the plan is inspected, **Then** synthetic-only data, least privilege, redaction, severity, remediation and retest are required.                                                                                                                      |
| FR-004 | **Given** the external report or remediation is incomplete, **When** production readiness is evaluated, **Then** the go-live gate remains open and no row is marked Done.                                                                                                                                      |
| FR-005 | **Given** the existing client, staff and workspace directory surfaces and supported report routes, **When** spec 008 measurements run, **Then** mobile latency, response bytes, CPU, errors, pagination, filtering, loading and graceful-failure evidence is captured for each applicable surface.             |
| FR-006 | **Given** synthetic fixtures, **When** the volume matrix is prepared, **Then** it uses approved spec 008 illustrative pilot inputs unless a later PO-approved target supersedes them.                                                                                                                          |
| FR-007 | **Given** baseline measurements at spec 008 pilot volumes, **When** per-route p95 latency/error budgets are proposed, **Then** no pass/fail gate is asserted before PO signature; **Given** signed budgets, **When** a reproducible run is compared, **Then** each route is labeled against the signed values. |
| FR-008 | **Given** evidence artifacts and existing CI/security/production gates, **When** they are reviewed, **Then** no real-client data or secrets appear and existing gates remain independently required and unweakened.                                                                                            |
| FR-009 | **Given** a new readiness requirement, **When** docs are updated, **Then** the matching docs/13 row includes stable ID, source, owner, observable evidence and status with no duplicate register.                                                                                                              |
| FR-010 | **Given** P8 scope, **When** implementation planning is reviewed, **Then** spec 024 leaderboard/legal review, code, duplicate tooling and production execution remain excluded.                                                                                                                                |

### Success Criteria

- **SC-001**: PO can determine from the readiness pack whether the external test is authorized, complete and remediated using sanitized evidence.
- **SC-002**: Every PRD-13.1 test surface has a coverage-evidence row.
- **SC-003**: Baselines are reproducible at spec 008 pilot volumes; proposed per-route p95 latency/error budgets are recorded, with no gate until PO signature.
- **SC-004**: No secret or real client datum appears in committed evidence.
- **SC-005**: Every open requirement maps to a docs/13 gate and owner.

### Assumptions

- Spec 008 is the existing measurement toolset and volume source; no duplicate tool is created.
- Vendor, budget and timing are PO decisions; readiness drafting is unblocked.
