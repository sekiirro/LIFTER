# Feature Specification: P8 security and performance readiness

**Feature Branch**: `s71-031-hardening`
**Created**: 2026-11-27
**Status**: Draft; external vendor/budget/timing and performance targets are PENDING-PO in `checklists/po-mcqs.md`.
**Authority**: S71-PO-1 approves the P8 external pen-test and performance items. Readiness/process/gates only; no test execution or production change.

## Constitution check

No conflict identified. Constitution I/VII/IX require tenant isolation, privacy and reliable retries. PRD-13 requires cross-workspace tests for APIs, exports, bot, storage and jobs plus practical mobile performance, pagination/filtering and graceful loading. Do not edit Constitution.

## User Scenarios & Testing

### User Story 1 - PO commissions and reviews an independent external pen-test (Priority: P1)

As PO, I can approve a qualified test scope, vendor, budget and window, receive a sanitized report, and track remediation evidence before production data use.

**Why this priority**: PRD-13.1 and roadmap P8 require external cross-workspace testing; docs/13 separates readiness from execution.

**Independent Test**: Review a readiness pack with approved scope, rules of engagement, synthetic test account plan, deliverables, severity/remediation gates and evidence storage; this spec runs no test.

**Acceptance Scenarios**:

1. **Given** vendor/budget/window approval is absent, **When** readiness is reviewed, **Then** no engagement is commissioned and production gate stays open.
2. **Given** PO approves an engagement, **When** an assessor completes testing, **Then** coverage includes APIs, exports, bot, storage and jobs and the report is sanitized.
3. **Given** required findings remain unresolved, **When** production readiness is checked, **Then** the gate remains open until verified remediation and required retest disposition are recorded.

### User Story 2 - PO reviews performance at approved pilot volumes (Priority: P1)

As PO, I can review reproducible measurements for core mobile web and directory/reporting paths at the existing illustrative pilot volumes, with thresholds approved before acceptance.

**Independent Test**: Run non-production measurements at spec 008 inputs and compare against PO-approved budgets; capture p50/p95, throughput/CPU and errors without secrets/client data.

**Acceptance Scenarios**:

1. **Given** synthetic pilot-volume fixtures, **When** approved scripts run, **Then** route timings, response size, CPU and failures are recorded against approved targets.
2. **Given** a route exceeds a selected threshold, **When** results are reported, **Then** it is labeled as not passing readiness.
3. **Given** no numeric target is approved, **When** measurements are collected, **Then** they are baseline-only and no pass is asserted.

### Edge Cases

- Never use real client data or production targets without separate PO approval.
- Missing, unavailable or partial evidence is not a pass.
- Security evidence must identify workspace/object scope without disclosing secrets or client content.
- A measurement baseline is distinct from passing an approved budget.

## Clarifications

S71-PO-1 approves test/performance scope. Vendor, budget, timing and acceptance thresholds are PENDING-PO in MCQ 031-01/02. Preserve the existing illustrative volume inputs from spec 008; they are not reasked. No other open ambiguity is assumed.

## Requirements

- **FR-001**: Produce external pen-test readiness plan and gate; do not purchase, schedule or execute without MCQ 031-01 (**PENDING-PO**).
- **FR-002**: Proposed test scope covers cross-workspace/object access for APIs, exports, bot, storage, background jobs, authenticated routes and role boundaries.
- **FR-003**: Require synthetic accounts/data, least-privilege test identities, approved rules of engagement, sanitized evidence, severity tracking, remediation verification and final retest disposition.
- **FR-004**: Keep production-data use/go-live blocked until external evidence and remediation satisfy docs/13; do not mark existing gates Done.
- **FR-005**: Define repeatable non-production measurements for mobile web and the existing client, staff, and workspace directory surfaces where present, plus reports and PRD-13 pagination/filtering paths.
- **FR-006**: Use spec 008 illustrative volumes (2 workspaces, 150 clients/workspace, 2 staff/workspace, 2 plans/client, 2 new versions/client/month) unless superseded by a later PO-approved target.
- **FR-007**: Record baseline and compare with numeric targets only after MCQ 031-02 (**PENDING-PO**); invent no SLA.
- **FR-008**: Use synthetic data, redact secrets/PII, and preserve current safety, CI and production-approval gates.
- **FR-009**: Update existing docs/13 readiness rows with stable ID, source, owner, evidence and status where needed; do not create another readiness register.
- **FR-010**: Exclude leaderboard/legal review (spec 024), implementation changes, duplicate benchmark tools, and production testing.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** no PO procurement approval, **When** PT-01 readiness is reviewed, **Then** a decision-neutral readiness plan and open gate exist while vendor work remains uncommissioned.                                                                                                                                 |
| FR-002 | **Given** an approved rules-of-engagement draft, **When** coverage is checked, **Then** APIs, exports, bot, storage, jobs, authenticated routes and role/object boundaries appear, with positive and negative cases mapped to the permissions in `docs/02-architecture.md:35-49`.                                    |
| FR-003 | **Given** test identities and evidence handling, **When** the plan is inspected, **Then** synthetic-only data, least privilege, redaction, severity, remediation and retest are required.                                                                                                                            |
| FR-004 | **Given** the external report or remediation is incomplete, **When** production readiness is evaluated, **Then** the go-live gate remains open and no row is marked Done.                                                                                                                                            |
| FR-005 | **Given** the existing client, staff and workspace directory surfaces and supported report routes, **When** spec 008 measurements run, **Then** mobile latency, response bytes, CPU, errors, pagination, filtering, loading and graceful-failure evidence is captured for each applicable surface.                   |
| FR-006 | **Given** synthetic fixtures, **When** the volume matrix is prepared, **Then** it uses approved spec 008 illustrative pilot inputs unless a later PO-approved target supersedes them.                                                                                                                                |
| FR-007 | **Given** no numeric budget is approved, **When** baseline results are reported, **Then** they are baseline-only and no performance pass is asserted; **Given** targets later approved by PO, **When** the same reproducible run is compared, **Then** each metric is labeled pass/fail against the recorded target. |
| FR-008 | **Given** evidence artifacts and existing CI/security/production gates, **When** they are reviewed, **Then** no real-client data or secrets appear and existing gates remain independently required and unweakened.                                                                                                  |
| FR-009 | **Given** a new readiness requirement, **When** docs are updated, **Then** the matching docs/13 row includes stable ID, source, owner, observable evidence and status with no duplicate register.                                                                                                                    |
| FR-010 | **Given** P8 scope, **When** implementation planning is reviewed, **Then** spec 024 leaderboard/legal review, code, duplicate tooling and production execution remain excluded.                                                                                                                                      |

### Success Criteria

- **SC-001**: PO can determine from the readiness pack whether the external test is authorized, complete and remediated using sanitized evidence.
- **SC-002**: Every PRD-13.1 test surface has a coverage-evidence row.
- **SC-003**: Baselines are reproducible at spec 008 pilot volumes; no threshold is passed without PO approval.
- **SC-004**: No secret or real client datum appears in committed evidence.
- **SC-005**: Every open requirement maps to a docs/13 gate and owner.

### Assumptions

- Spec 008 is the existing measurement toolset and volume source; no duplicate tool is created.
- Vendor, budget and timing are PO decisions; readiness drafting is unblocked.
