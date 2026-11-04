# Feature Specification: Free-tier Validation Prep (P0-F8)

**Feature Branch**: `008-free-tier-validation`
**Created**: 2026-10-27
**Status**: Draft
**Input**: Roadmap P0 "free-tier spike (OpenNext bundle/CPU, Supabase limits)". Architecture v3 § Free-tier validation (exit trigger at 70% of a limit). D-06 ($0 recurring). Owner decision 2026-10-27: prepare the validation plan, measurement scripts and report template; **no deployment (Cloudflare Workers or Supabase) without PO approval**.

## Scope

F8 **prepares** the validation: it adds the measurement tooling, the procedure and a report template, and records the measurements that can be taken without deploying. The measured run against real Cloudflare and Supabase environments is a later step that needs the PO's explicit approval. It isn't part of this feature.

## User Scenarios & Testing *(mandatory)*

Actors: **Product Owner (PO)**, **Technical Lead (reviewer)**.

### User Story 1 - Offline measurements now (Priority: P1)

The reviewer can measure everything that doesn't need a deployment: Worker bundle sizes (web and cron), the local database size, and the per-row footprint of the existing tables. The results are compared with the published Free-plan limits.

**Independent Test**: Run the offline commands on a clean checkout with the local stack up, and get a filled "offline" section of the report.

**Acceptance Scenarios**:

1. **Given** a built project, **When** the size command runs, **Then** web and cron Worker sizes are reported against the documented limits with a percentage.
2. **Given** the local stack with fixture data, **When** the database usage command runs, **Then** the total database size, the largest tables and the row counts are reported. The command can't modify data.

---

### User Story 2 - Ready-to-run post-approval measurements (Priority: P1)

After the PO approves a deployment, the reviewer can measure request latency and response size per route, and CPU time per request (from the platform's request logs), with no new tooling. The tools refuse unsafe targets and never print secrets.

**Independent Test**: Run the probe against a local server, and run the log parser on a sample log file.

**Acceptance Scenarios**:

1. **Given** a base URL and a route list, **When** the probe runs, **Then** it reports per-route status counts, p50/p95 latency and response bytes. It refuses non-https targets except loopback.
2. **Given** a saved platform request-log file, **When** the parser runs, **Then** it reports per-route CPU time p50/p95/max and flags routes above the CPU limit or above 70% of it.
3. **Given** any run, **When** output is printed, **Then** it has no cookies, tokens, keys or query-string secrets.

---

### User Story 3 - Report template and decision rules (Priority: P1)

The PO receives one report in a fixed format. It shows each limit, the measured or projected value, the percentage, the source (measured, dashboard or projection), and a verdict against the 70% exit trigger. Values that can't be known yet are marked as such, never guessed.

**Independent Test**: Fill the template from US1 outputs and leave the deployment-only rows marked "pending approval".

**Acceptance Scenarios**:

1. **Given** a limit with no measurement yet, **When** the report is filled, **Then** it says "pending approval" or "NEEDS SOURCE CONFIRMATION", never a guess.
2. **Given** a measured value ≥ 70% of a limit, **When** the report is filled, **Then** the exit option from the architecture is shown for the PO to decide.

### Edge Cases

- Dashboard-only metrics (egress, MAU, project pause state) are entered manually with the date read.
- Pilot volumes (clients, staff, plans per client) aren't confirmed. Projections take them as explicit inputs and are labeled by their assumptions.
- A probe that targets a host that isn't approved is refused unless that host is passed explicitly.

## Requirements *(mandatory)*

- **FR-001**: Measurement tooling MUST NOT deploy, create, or modify any cloud resource, and MUST NOT write to a database. Database reads MUST run in a read-only session.
- **FR-002**: The tooling MUST NOT print or persist secrets: connection strings, keys, cookies, tokens.
- **FR-003**: The HTTP probe MUST accept only `https:` targets or loopback `http:`, and MUST send no credentials.
- **FR-004**: The log parser MUST work offline on a saved file and report CPU per route against a configurable limit (default 10 ms) and a 70% warning threshold.
- **FR-005**: The database usage report MUST show total size, the top tables by size, and row counts, as a percentage of a configurable limit (default 500 MB).
- **FR-006**: A projection MUST compute the projected database size from measured per-row sizes × explicit volume inputs. Missing inputs MUST be reported as missing, not defaulted.
- **FR-007**: The report template MUST cover: Workers requests/day, CPU per request, Worker size; Supabase DB size, egress, storage, MAU, active-project count, inactivity pause, backups (not included on Free, so F7 covers them); default auth SMTP restrictions; each row with source, date and verdict.
- **FR-008**: Every limit value in the template MUST cite the official page and the date it was checked.

## Success Criteria *(mandatory)*

- **SC-001**: All offline rows of the report can be filled from repository commands alone.
- **SC-002**: 0 cloud resources created or changed while preparing F8.
- **SC-003**: 0 secrets in any tool output in tests.
- **SC-004**: The post-approval run needs only the documented commands, with no new code.

## NEEDS DECISION

- **ND-F8-1 — Pilot volumes. Decided (S31-PO-4, illustrative pilot only):** 2 workspaces × 150 clients/workspace × 2 staff/workspace × 2 plans/client × 2 new plan versions/client/month. This is an illustrative pilot input; verify schema and units before measurement.
- **ND-F8-2 — Deployment approval** for the measured run: which Cloudflare account, which Supabase organization/project (see the eligibility report), and the region (bounded by B4).
- **ND-F8-3 — Authenticated route measurement**: whether a dedicated test account may be used against the approved staging environment.

## Clarifications

### Session 2026-11-03 — compliance reconciliation

- **Decision register:** `docs/04-changes-and-questions.md` D-06 and the owner decision dated 2026-10-27 cited in this spec; ND-F8-1 is decided by S31-PO-4. ND-F8-2/3 remain unresolved.
- **Result:** S31-PO-4 supplies illustrative pilot values; T012 verifies schema units before recording table-level volumes. F8 remains preparation-only; actual environment measurements remain gated on explicit PO deployment approval. Authenticated-route permission remains open and is not defaulted.
- **Evidence limit:** Static source/test inspection only; no tests or cloud actions were performed in this lane.

## Assumptions

- Limits are taken from the official pages on the date checked. Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU per HTTP request, 64 MiB uncompressed Worker size (architecture, verified 2026-10-27). Supabase Free (pricing page, checked 2026-10-27): 2 active projects, 500 MB database, 5 GB egress + 5 GB cached egress, 1 GB storage, 50,000 MAU, no automatic backups, pause after 1 week of inactivity.
- CPU time can only be measured on the deployed platform. Local timing is a smoke signal only.
