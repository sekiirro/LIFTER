# Feature Specification: Platform Owner comprehensive client dataset export

**Feature Branch**: `s71-030-po-export`
**Created**: 2026-11-27
**Status**: Ready for implementation planning after per-screen PO approval of the proposed field manifest and copy; S71-PO-6 resolves asynchronous UTF-8 CSV delivery.
**Authority**: S71-PO-1 approves the P8 PO full-export item; BRD-06/PRD-11 reserve comprehensive client export to PO.

## Constitution check

No conflict identified. Principle III reserves complete-client export to PO; VII requires audited sensitive exports and minimum exposure; I requires tenant isolation. Do not edit the Constitution.

## User Scenarios & Testing

### User Story 1 - PO exports comprehensive client data (Priority: P1)

As PO, I can request and download a complete authorized client dataset for an explicitly selected scope, with the export audited and protected from non-PO access.

**Why this priority**: Approved P8 item and BRD/PRD capability.

**Independent Test**: Use synthetic data across workspaces; request one-workspace and all-workspace exports as PO, then verify UTF-8 CSV archive contents against the per-screen PO-approved field manifest, scope, audit, and denial for WO/Trainer/Sales/Client.

**Acceptance Scenarios**:

1. **Given** PO selects one workspace or all workspaces and approves the proposed manifest for the export screen, **When** asynchronous generation completes, **Then** a UTF-8 CSV archive contains exactly the selected approved fields and scope.
2. **Given** a non-PO calls the export API or replays an identifier, **When** authorization runs, **Then** the request is denied with no rows, count, file location or existence disclosure.
3. **Given** an export is requested, **When** audit is written or generation fails, **Then** audit contains safe metadata only and logs contain no client health values, secrets or file contents.

### User Story 2 - PO handles bounded export results (Priority: P2)

As PO, I can retrieve a potentially large export through an approved packaging flow without unbounded request time or leaking a download to another actor.

**Independent Test**: Measure bounded paging and memory at the illustrative spec 008 pilot volumes; verify artifact authorization, expiry and replay behavior.

**Acceptance Scenarios**:

1. **Given** a large synthetic export is requested, **When** the existing jobs/outbox path generates the archive, **Then** it completes or returns a safe state without data loss, duplicate artifacts or unbounded memory.
2. **Given** an artifact identifier is opened by a different, revoked, or unauthenticated actor, **When** current authorization runs, **Then** access is denied.
3. **Given** the requesting PO remains authenticated and authorized, **When** the short-lived download is retrieved before expiry, **Then** the archive is streamed through an authenticated download response.

## Clarifications

S71-PO-6 resolves MCQ 030-01 as an asynchronous UTF-8 CSV archive, scoped to one workspace or all workspaces. Generation reuses the jobs/outbox from spec 006 and export implementation patterns identified in the reuse audit. The proposed field manifest is an explicit per-screen field approval item and requires PO approval before the export screen ships; no fields are presumed approved by this specification. Downloads are authenticated, short-lived, and reauthorize the current PO on retrieval. Per-plan PDF/Excel exports remain separate.

## Requirements

- **FR-001**: Add a PO-only export section to the existing Reports screen; do not create a separate client-data page or export database.
- **FR-002**: Enforce PO-only authorization in application service and server-side reader/RPC; direct calls and foreign identifiers cannot bypass it.
- **FR-003**: Generate only fields in the versioned, explicit field manifest after per-screen PO approval; the manifest is PROPOSED until approved. Client-plan PDF/Excel exports remain separate.
- **FR-004**: Require explicit scope of one workspace or all workspaces; only PO can request either scope, with server-derived authorization.
- **FR-005**: Audit the request, generation outcome, and every artifact retrieval with actor, scope, time, result and safe opaque reference; never log row data, health values, secrets or URLs. Retrieval audit failure fails closed.
- **FR-006**: Generate one asynchronous UTF-8 CSV file through the existing spec 006 jobs/outbox path, using one definer RPC (`po_export_snapshot`) that returns one MVCC-consistent bounded rowset in a single statement (limit 10001) where more than 10,000 rows fails closed with no artifact and no cross-transaction paging (architect technical decision S72-R37/S71-R34), idempotent request handling, and no duplicate file or missing rows.
- **FR-007**: Store the file in a new private export-artifacts bucket with owner/scope metadata and a per-screen PO-approved short-lived expiry; bind it to the requesting PO and selected scope; require authenticated current-PO authorization and a retrieval audit on every fetch; deny after expiry or revocation without a public/bearer URL.
- **FR-008**: Exclude WO comprehensive export, bulk actions, plan export changes and leaderboard (spec 024).
- **FR-009**: Provide accessible loading/empty/error/download states; copy and the versioned field manifest are PROPOSED approval items for the existing Reports export screen and require per-screen PO approval before it ships.
- **FR-010**: Serialize CSV fields using RFC 4180 escaping and neutralize spreadsheet-formula execution in text fields beginning with `=`, `+`, `-`, or `@` after optional leading whitespace by prefixing an apostrophe before CSV quoting. Preserve negative numeric values as numeric data.

### FR Acceptance Matrix

| FR     | Given / When / Then acceptance test                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | **Given** the current Reports area, **When** PO requests the export, **Then** its existing route/service is extended without a second page.                                                                                                                                                                                                                                                                                                                                                             |
| FR-002 | **Given** PO and each non-PO role, **When** direct API/RPC/storage retrieval is attempted, **Then** only current PO authority is permitted.                                                                                                                                                                                                                                                                                                                                                             |
| FR-003 | **Given** the PO has approved the PROPOSED manifest for the export screen, **When** CSV rows are generated, **Then** every field matches that versioned manifest and no other field is included.                                                                                                                                                                                                                                                                                                        |
| FR-004 | **Given** PO selects one workspace or all workspaces, **When** generation runs, **Then** all and only authorized rows in the explicit selected scope are returned.                                                                                                                                                                                                                                                                                                                                      |
| FR-005 | **Given** export success/failure or an artifact fetch, **When** audit/logs are inspected, **Then** each action has safe actor/scope/result metadata and no row/health values, secrets, URL or file content appears.                                                                                                                                                                                                                                                                                     |
| FR-006 | **Given** repeated requests, response loss or a large spec 008 pilot-volume dataset, **When** the existing jobs/outbox generates the UTF-8 CSV file via one definer RPC (`po_export_snapshot`) returning one MVCC-consistent bounded rowset in a single statement (limit 10001, where more than 10,000 rows fails closed with no artifact and no cross-transaction paging; architect technical decision S72-R37/S71-R34), **Then** output is bounded and idempotent without duplicate file or row loss. |
| FR-007 | **Given** an artifact is requested by a non-PO, unauthenticated/revoked PO, or after its PO-approved expiry, **When** retrieval authorization and audit run, **Then** access is denied without artifact-existence disclosure.                                                                                                                                                                                                                                                                           |
| FR-008 | **Given** export scope is tested, **When** it is compared with excluded features, **Then** WO comprehensive export, bulk actions, plan-export changes and leaderboard are absent.                                                                                                                                                                                                                                                                                                                       |
| FR-009 | **Given** loading, empty, error and download states, **When** the existing report surface renders, **Then** it passes accessibility and approved locale/copy checks.                                                                                                                                                                                                                                                                                                                                    |
| FR-010 | **Given** source text contains CSV delimiters, line breaks, quotes or a spreadsheet formula prefix, **When** the UTF-8 CSV is serialized, **Then** it round-trips as one field without row injection and formula-leading text is emitted as text; negative numeric fields remain unchanged.                                                                                                                                                                                                             |

### Success Criteria

- **SC-001**: 100% of exported fields and rows match the approved manifest and selected scope.
- **SC-002**: All non-PO and foreign-scope probes are denied without row/count/artifact-existence leakage.
- **SC-003**: Every request, generation outcome and retrieval leaves the defined audit evidence without PII payloads or secrets; retrieval audit failure releases no bytes.
- **SC-004**: The existing jobs/outbox produces one CSV file per idempotency key; downloads require current authenticated PO authorization until the per-screen PO-approved expiry and are denied afterward.
- **SC-005**: CSV delimiters, newlines, quotes and formula-leading text cannot create additional rows or execute spreadsheet formulas; negative numeric values remain unchanged.

### Assumptions

- Existing PO-only reports/readers and audit patterns are reused; full client export is distinct from plan PDF/Excel.
- The field manifest is PROPOSED and requires per-screen PO approval before the export screen ships.
