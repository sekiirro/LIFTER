# Feature Specification: Project Scaffold & CI Baseline (P0-F1)

**Feature Branch**: `001-project-scaffold-ci`
**Created**: 2026-10-27
**Status**: Draft
**Input**: User description: "P0-F1 Project Scaffold & CI baseline: single-repo TypeScript web app buildable for the approved edge host, strict typing, lint/format, unit + e2e smoke tests, local database tooling config, CI gates, health route, free-tier bundle-size report. No design system, i18n, auth, tenancy, schema or deployment."

Governing documents: [Architecture v3](../../docs/02-architecture.md) (approved stack, not redesigned here), [Roadmap P0](../../docs/03-roadmap.md), Constitution v1.0.0.

## User Scenarios & Testing *(mandatory)*

Actors: **Implementer** (Codex/OpenCode), **Reviewer** (Claude Technical Lead), **Product Owner**.

### User Story 1 - Reproducible local baseline (Priority: P1)

A fresh clone can be installed and then typechecked, linted, unit-tested and built with documented commands, all of them passing.

**Why this priority**: Every later feature and the review gates depend on it.

**Independent Test**: On a clean clone, run the documented install, typecheck, lint, test and build commands. All exit 0.

**Acceptance Scenarios**:

1. **Given** a clean clone with the documented runtime version, **When** the Reviewer runs install then each gate command, **Then** every command exits successfully with no manual steps.
2. **Given** a deliberate type error or lint violation, **When** the gates run, **Then** the corresponding gate fails with a non-zero exit.

---

### User Story 2 - Automated CI gates (Priority: P1)

Every push and pull request runs the same gates automatically and reports pass/fail.

**Why this priority**: The Constitution requires independent, repeatable quality gates before commit/merge.

**Independent Test**: Push a branch. CI runs typecheck, lint, unit tests and the edge build, and reports status.

**Acceptance Scenarios**:

1. **Given** a pull request, **When** CI runs, **Then** typecheck, lint, format check, unit tests, edge build and bundle-size report all execute, and the PR shows a pass/fail status.
2. **Given** CI configuration, **When** inspected, **Then** it requires no secrets, no paid services and performs no deployment.

---

### User Story 3 - Running app with health check and e2e smoke (Priority: P2)

The app starts locally and exposes a health endpoint that reports status and version without any sensitive data. An e2e smoke test confirms the health endpoint. No pages or UI are added: UI waits for the PO-approved Design System (F2).

**Why this priority**: Proves the runtime path end to end before features land.

**Independent Test**: Start the app locally, request the health endpoint, and run the e2e smoke suite.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the health endpoint is requested, **Then** it returns success with `status` and `version` only, and no environment values, secrets or internal paths.
2. **Given** the app is running, **When** the e2e smoke suite runs, **Then** the health check passes.

---

### User Story 4 - Free-tier bundle-size report (Priority: P2)

Each build reports the edge-worker size against the official Workers size limit (64 MiB uncompressed), so the Product Owner sees early whether the $0 hosting target (D-06) holds.

**Why this priority**: The P0 free-tier spike is a gate in the approved roadmap.

**Independent Test**: Run the size-report command after an edge build. It prints the sizes, the configured limit and the headroom percentage.

**Acceptance Scenarios**:

1. **Given** a completed edge build, **When** the size report runs, **Then** it prints the uncompressed and gzip sizes, the limit and the percentage used.
2. **Given** the size exceeds the configured limit, **When** the report runs, **Then** it exits non-zero, and CI marks it as failed.

---

### Edge Cases

- A missing local env file must not break typecheck, lint, unit tests or build. A committed example file documents the variables (with no values).
- Windows and Linux developers produce the same results (line endings, path handling).
- The local database tooling config is present, but no schema/migrations exist yet. Starting it is optional for this feature's gates.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Repository MUST contain a single TypeScript web application on the approved stack (Architecture v3), with strict type checking enabled.
- **FR-002**: Repository MUST provide documented commands for install, dev, typecheck, lint, format check, unit test, e2e smoke, edge build and size report.
- **FR-003**: Lint MUST fail on errors, and format check MUST fail on unformatted files.
- **FR-004**: A unit-test runner MUST be configured with at least one passing test (health response shape).
- **FR-005**: An e2e smoke suite MUST verify the health endpoint. No pages, layouts or UI components are created in this feature.
- **FR-006**: The app MUST expose a public health endpoint returning only `status` and `version`.
- **FR-007**: The edge build MUST produce the worker artifact for the approved edge host without deploying it.
- **FR-008**: A size-report command MUST compute the worker bundle size (uncompressed, plus gzip shown for information), compare the uncompressed size to a configurable limit (default = official Workers limit of 64 MiB uncompressed; Cloudflare has no compressed limit, verified 2026-10-27), print headroom, and exit non-zero when over.
- **FR-009**: CI MUST run typecheck, lint, format check, unit tests, edge build and size report on every push and PR. CI MUST use no secrets and MUST NOT deploy.
- **FR-010**: Local database tooling configuration MUST be committed (no schema, no migrations, no credentials).
- **FR-011**: No secrets or real env values may be committed. A placeholder-only example env file MUST exist.
- **FR-012**: A README section MUST document prerequisites, commands and the gate list.
- **FR-013**: Runtime and package-manager versions MUST be pinned for reproducibility (Node 24, `npm@11.17.0`, verified installed).
- **FR-014**: The edge build and size report MUST run in Linux CI. The edge adapter's Windows support is limited, so these two checks are not required on Windows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone reaches all-gates-green in ≤ 10 minutes using only the README.
- **SC-002**: 100% of the listed gates run automatically on every PR. 0 secrets are required.
- **SC-003**: The health endpoint responds successfully in 100% of smoke runs and exposes exactly 2 fields.
- **SC-004**: The size report states the used percentage of the 64 MiB uncompressed Worker limit on every build.
- **SC-005**: 0 deployments and 0 paid-service calls occur as part of this feature.

## Assumptions

- Architecture v3 fixes the stack: Next.js App Router, OpenNext Cloudflare adapter, Supabase CLI for local DB, GitHub Actions. This spec doesn't redesign it.
- The Worker size limit comes from the official Cloudflare limits page (checked 2026-10-27: 64 MiB uncompressed, no compressed limit) and stays overridable via `WORKER_SIZE_LIMIT_KIB`.
- Design system, i18n/RTL, auth, tenancy, schema, jobs and backups are separate P0 features.
- The GitHub remote exists. CodeRabbit reviews are enabled separately once configured.

## Clarifications

### Session 2026-11-03 — merged-scope compliance reconciliation

- **Decision register:** `docs/04-changes-and-questions.md`; `docs/01-traceability.md` is the shared traceability index. This entry is limited to the original merged scaffold FR-001..FR-014. Self-hosted CI coverage FR-015..FR-020 is separately owned by SK-A4 and is not duplicated here.
- **Result:** The original scaffold behavior and artifact scope remain as specified by FR-001..FR-014. One policy question remains open: whether FR-009's original no-secrets constraint applies only to the baseline job or to later integration/storage jobs that use optional Docker Hub credentials. No interpretation is made here.
- **Evidence limit:** Static repository inspection only; no tests or CI were run in this lane.
