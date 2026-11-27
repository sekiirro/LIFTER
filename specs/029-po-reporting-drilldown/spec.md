# Feature Specification: Platform Owner aggregate reporting drill-down depth

**Feature Branch**: `s71-029-po-drilldown`
**Created**: 2026-11-27
**Status**: Draft; additional depth dimensions are PENDING-PO in `checklists/po-mcqs.md`.
**Authority**: S71-PO-1 approves the P8 PO aggregate drill-down item.

## Constitution check

No conflict identified. Enforce workspace isolation, PO-only platform views, minimum necessary client data, and accessible bilingual reporting. Do not modify the Constitution.

## User Scenarios & Testing

### User Story 1 - PO drills from platform aggregate to permitted workspace detail (Priority: P1)

As PO, I can move from existing platform aggregate reporting into authorized workspace-scoped reporting to investigate the aggregate, with consistent filters and no cross-workspace comparison dashboard unless approved.

**Why this priority**: P8 explicitly includes PO aggregate drill-down depth; BRD-06 requires platform aggregate and workspace drill-down.

**Independent Test**: Seed synthetic workspaces with collections, refunds, commissions, active/expiring subscriptions and delivered plans; compare platform aggregate and selected-workspace results through the existing report route and readers.

**Acceptance Scenarios**:

1. **Given** PO opens the existing report surface, **When** a supported aggregate is selected, **Then** the result drills to its workspace-scoped source rows with consistent time boundaries and totals.
2. **Given** a selected workspace, **When** the PO opens detail, **Then** only that workspace's approved report fields appear and each detail set reconciles to its parent total.
3. **Given** WO, Trainer, Sales, or Client requests platform aggregate/detail, **When** authorization is evaluated, **Then** only an already-approved role-specific report scope is returned; no cross-workspace detail is exposed.

### User Story 2 - PO reviews approved aggregate dimensions with bounded interaction (Priority: P2)

As PO, I can use agreed drill-down dimensions through the current report UI without a duplicate dashboard.

**Independent Test**: Exercise each PO-selected dimension and filter against synthetic records; verify pagination, sums, currency, timezone and empty/error states.

**Acceptance Scenarios**:

1. **Given** approved drill-down dimensions, **When** PO filters and pages the result, **Then** values reconcile and no page exceeds its bound.
2. **Given** no matching records or an unavailable reader, **When** the report loads, **Then** an empty/error state appears without changing aggregate permissions.

## Clarifications

S71-PO-1 approves aggregate drill-down. Additional breakdown dimensions beyond BRD/PRD are not specified; MCQ 029-01 is PENDING-PO. No additional dimensions or cross-workspace comparisons are presumed. No other open ambiguity is assumed.

## Requirements

- **FR-001**: Extend the existing `/reports` route and reporting readers; no new report page or parallel report store.
- **FR-002**: Support platform aggregate to workspace drill-down for PO only, consistent with BRD-06 and PRD-11.
- **FR-003**: Keep WO views within its own workspace; Trainer, Sales, and Client receive only specifically authorized report scope, otherwise denied.
- **FR-004**: Include only PO-approved dimensions from MCQ 029-01 (**PENDING-PO**); preserve existing finance/accounting definitions and integer minor-unit calculations.
- **FR-005**: Enforce filters, period boundaries, pagination, and counts in authorized server-side readers; UI filtering is not a security boundary.
- **FR-006**: Reconcile each detail subtotal with its parent aggregate using the same source, currency, timezone and filters.
- **FR-007**: Exclude leaderboard (spec 024), full dataset export (spec 030), and audit-event browsing.
- **FR-008**: Provide loading/empty/error and EN/LTR, AR/RTL, mobile and keyboard-accessible states; copy remains proposed until per-screen approval.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** the current Reports route, **When** PO drills down, **Then** the same route and report readers serve the detail.                                                                                        |
| FR-002 | **Given** PO has selected a platform aggregate, **When** it opens a workspace, **Then** detail is available only under PO authorization.                                                                          |
| FR-003 | **Given** WO, Trainer, Sales or Client supplies a platform/foreign workspace ID, **When** the reader is called directly, **Then** the role matrix denies or returns only current approved scope.                  |
| FR-004 | **Given** MCQ 029-01 is resolved, **When** PO selects a chosen dimension, **Then** only those rows are returned; until then the new dimensions remain PENDING-PO.                                                 |
| FR-005 | **Given** filters and cursors are supplied, **When** a report query runs, **Then** server-side validation, workspace authorization and page bounds apply before rows/counts return.                               |
| FR-006 | **Given** one parent aggregate and its detail rows, **When** totals are compared for the same period/currency, **Then** integer minor-unit sums reconcile exactly.                                                |
| FR-007 | **Given** a report request, **When** it is evaluated, **Then** no leaderboard, full-export or audit-browsing capability is added.                                                                                 |
| FR-008 | **Given** loading, empty, error and populated states, **When** the existing Reports view renders, **Then** approved design/accessibility requirements are met and proposed copy remains unshipped until approval. |

### Success Criteria

- **SC-001**: Every returned detail row belongs to the selected authorized workspace and every parent total reconciles exactly to children for the same query.
- **SC-002**: Non-PO cross-workspace detail probes return denied/empty with no existence/count leakage.
- **SC-003**: No drill-down duplicates, alters or bypasses existing report source facts or finance math.

### Assumptions

- Existing PO/WO reporting APIs and route are the source surface; `lib/packages/reporting.ts` and package-report RPCs are reused where applicable.
- Dimensions not already specified by BRD/PRD remain PENDING-PO.
