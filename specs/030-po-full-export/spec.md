# Feature Specification: Platform Owner comprehensive client dataset export

**Feature Branch**: `s71-030-po-export`
**Created**: 2026-11-27
**Status**: Draft; packaging details are PENDING-PO in `checklists/po-mcqs.md`.
**Authority**: S71-PO-1 approves the P8 PO full-export item; BRD-06/PRD-11 reserve comprehensive client export to PO.

## Constitution check

No conflict identified. Principle III reserves complete-client export to PO; VII requires audited sensitive exports and minimum exposure; I requires tenant isolation. Do not edit the Constitution.

## User Scenarios & Testing

### User Story 1 - PO exports comprehensive client data (Priority: P1)

As PO, I can request and download a complete authorized client dataset for an explicitly selected scope, with the export audited and protected from non-PO access.

**Why this priority**: Approved P8 item and BRD/PRD capability.

**Independent Test**: Seed synthetic clients across workspaces with health, account, subscription and plan references; export as PO and verify completeness, exact scope, audit, and denial for WO/Trainer/Sales/Client.

**Acceptance Scenarios**:

1. **Given** PO selects an approved export scope, **When** the export is generated, **Then** it contains exactly the selected approved dataset and no other workspace/client record.
2. **Given** a non-PO calls the export API or replays an identifier, **When** authorization runs, **Then** the request is denied with no rows, count, file location or existence disclosure.
3. **Given** an export is requested, **When** audit is written or generation fails, **Then** audit contains safe metadata only and logs contain no client health values, secrets or file contents.

### User Story 2 - PO handles bounded export results (Priority: P2)

As PO, I can retrieve a potentially large export through an approved packaging flow without unbounded request time or leaking a download to another actor.

**Independent Test**: Measure memory and query behavior on synthetic data at the selected capacity target; verify artifact authorization, expiry and replay behavior.

**Acceptance Scenarios**:

1. **Given** the selected packaging option, **When** a large synthetic export is requested, **Then** it completes or returns a safe state without data loss, duplicate artifacts or unbounded memory.
2. **Given** an artifact identifier is opened by a different actor, **When** authorization runs, **Then** access is denied.

## Clarifications

PO-only full-export authority is settled. Format, column manifest, packaging and artifact expiry are not specified by BRD/PRD; see MCQ 030-01. Do not infer these from per-plan PDF/Excel exports. No other open ambiguity is assumed.

## Requirements

- **FR-001**: Extend the existing PO reporting/export area; do not create a separate client-data page or export database.
- **FR-002**: Enforce PO-only authorization in application service and server-side reader/RPC; direct calls and foreign identifiers cannot bypass it.
- **FR-003**: Include comprehensive fields only as selected by MCQ 030-01 (**PENDING-PO**); client-plan PDF/Excel exports remain separate.
- **FR-004**: Require explicit export scope; if full-platform scope is selected, only PO can select it.
- **FR-005**: Audit actor, scope, time, result and safe opaque reference; never log row data, health values, secrets or signed URLs.
- **FR-006**: Use bounded, repeat-safe generation and retrieval; format, size and artifact lifetime follow the PO choice.
- **FR-007**: Protect artifacts with current PO authorization and deny after configured expiry or revocation.
- **FR-008**: Exclude WO comprehensive export, bulk actions, plan export changes and leaderboard (spec 024).
- **FR-009**: Provide accessible loading/empty/error/download states; copy is proposed and approval is per screen.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** the current Reports area, **When** PO requests the export, **Then** its existing route/service is extended without a second page.                                               |
| FR-002 | **Given** PO and each non-PO role, **When** direct API/RPC/storage retrieval is attempted, **Then** only current PO authority is permitted.                                               |
| FR-003 | **Given** MCQ 030-01's approved manifest, **When** export rows are generated, **Then** every field matches that manifest and no unapproved field is included (PENDING-PO until resolved). |
| FR-004 | **Given** PO selects a workspace or platform scope, **When** generation runs, **Then** all and only selected workspace rows are returned.                                                 |
| FR-005 | **Given** export success/failure, **When** audit/logs are inspected, **Then** safe actor/scope/result metadata exists and no row/health values, secrets, URL or file content appears.     |
| FR-006 | **Given** repeated request, response loss or a large dataset, **When** the approved package runs, **Then** output is bounded and idempotent without duplicate artifact or row loss.       |
| FR-007 | **Given** an artifact is requested after actor revocation or expiry, **When** retrieval authorization runs, **Then** access is denied without artifact-existence disclosure.              |
| FR-008 | **Given** export scope is tested, **When** it is compared with excluded features, **Then** WO comprehensive export, bulk actions, plan-export changes and leaderboard are absent.         |
| FR-009 | **Given** loading, empty, error and download states, **When** the existing report surface renders, **Then** it passes accessibility and approved locale/copy checks.                      |

### Success Criteria

- **SC-001**: 100% of exported fields and rows match the approved manifest and selected scope.
- **SC-002**: All non-PO and foreign-scope probes are denied without row/count/artifact-existence leakage.
- **SC-003**: Every request leaves the defined audit evidence without PII payloads or secrets.
- **SC-004**: Dataset-size target is measurable and passed before acceptance after PO selects packaging.

### Assumptions

- Existing PO-only reports/readers and audit patterns are reused; full client export is distinct from plan PDF/Excel.
- Field list, format, generation mode and artifact lifetime need PO choice.
