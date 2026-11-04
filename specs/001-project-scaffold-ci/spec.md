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

Pushes to main and pull requests run the same gates automatically and report pass/fail.

**Why this priority**: The Constitution requires independent, repeatable quality gates before commit/merge.

**Independent Test**: Push to main. CI runs typecheck, lint, unit tests and the edge build, and reports status.

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

### User Story 5 - Focused CI event coverage (Priority: P1)

The Product Owner wants main pushes and pull requests to receive the required CI checks without duplicate push checks on feature branches or wasted work on superseded pull request heads. The Storage checks remain a distinct required job.

**Independent Test**: Inspect workflow event filters, concurrency behavior, and job definitions; observe one PR-head run and confirm the Storage job reports independently.

**Acceptance Scenarios**:

1. **Given** a push to a branch other than `main`, **When** GitHub evaluates workflow triggers, **Then** the push trigger does not run CI.
2. **Given** a push to `main`, **When** GitHub evaluates workflow triggers, **Then** one push-triggered CI run starts.
3. **Given** a pull request head commit, **When** GitHub evaluates workflow triggers, **Then** CI runs for the pull request head.
4. **Given** an earlier CI run for a pull request is still active, **When** a newer head supersedes it, **Then** the earlier pull request run is canceled; main push runs are never canceled or replaced by concurrency.
5. **Given** the validate job has no browser-dependent steps, **When** validate runs, **Then** it does not install the unused Playwright browser.
6. **Given** CI runs, **When** Storage checks execute, **Then** they remain a distinct `storage` job with an independent result.

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
- **FR-009**: CI MUST run typecheck, lint, format check, unit tests, edge build and size report on pushes to main and pull requests. CI MUST use no secrets and MUST NOT deploy.
- **FR-010**: Local database tooling configuration MUST be committed (no schema, no migrations, no credentials).
- **FR-011**: No secrets or real env values may be committed. A placeholder-only example env file MUST exist.
- **FR-012**: A README section MUST document prerequisites, commands and the gate list.
- **FR-013**: Runtime and package-manager versions MUST be pinned for reproducibility (Node 24, `npm@11.17.0`, verified installed).
- **FR-014**: The edge build and size report MUST run in Linux CI. The edge adapter's Windows support is limited, so these two checks are not required on Windows.
- **FR-015**: CI push events MUST run only for the `main` branch; pushes to other branches MUST NOT start a push-triggered CI run.
- **FR-016**: CI MUST run for pull request heads through the `pull_request` event.
- **FR-017**: CI MUST cancel superseded pull request runs using a concurrency group scoped by pull request number; main push runs MUST use unique concurrency groups so queued runs are never replaced.
- **FR-018**: The `validate` job MUST NOT install Playwright browser binaries when none of its steps use a browser.
- **FR-019**: The Storage checks MUST remain a distinct required CI job named `storage`, with an independently reported result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone reaches all-gates-green in ≤ 10 minutes using only the README.
- **SC-002**: 100% of the listed gates run automatically on every PR. 0 secrets are required.
- **SC-003**: The health endpoint responds successfully in 100% of smoke runs and exposes exactly 2 fields.
- **SC-004**: The size report states the used percentage of the 64 MiB uncompressed Worker limit on every build.
- **SC-005**: 0 deployments and 0 paid-service calls occur as part of this feature.
- **SC-006**: A push to `main` starts one push-triggered CI run; a push to a non-main branch starts none; pull requests receive CI through `pull_request`.
- **SC-007**: When a newer head supersedes an active pull request run, the older pull request run is canceled, while main push runs remain uncanceled and are never replaced by concurrency grouping.
- **SC-008**: The `validate` job contains no Playwright browser installation step if no validate step uses a browser.
- **SC-009**: Every CI run reports distinct `validate`, `integration`, and `storage` jobs, with Storage required independently.

## Clarifications

### Session 2026-11-04

- **S33-PO-4 (binding)**: The Product Owner directed: “S33-Q6: Approve Option 2. Implement all proposed CI optimizations, but keep the Storage job separate for now.” The same decision directs GitHub-hosted runners, postpones local self-hosted runner work and PR #45, and preserves exact-head CodeRabbit approval, zero unresolved threads, three executed green CI runs, and explicit PO approval per merge. No automatic merges.
- The approved CI scope for this specification is: push events only on `main`; `pull_request` CI per pull request head; PR-only concurrency that cancels superseded runs while unique main-push groups prevent queued runs from being replaced; remove the unused Playwright browser installation from `validate` only when no validate step uses a browser; retain `validate`, `integration`, and separate required `storage` jobs and all other steps/checks.
- **No open ambiguities** remain for this CI optimization scope.

## Assumptions

- Architecture v3 fixes the stack: Next.js App Router, OpenNext Cloudflare adapter, Supabase CLI for local DB, GitHub Actions. This spec doesn't redesign it.
- The Worker size limit comes from the official Cloudflare limits page (checked 2026-10-27: 64 MiB uncompressed, no compressed limit) and stays overridable via `WORKER_SIZE_LIMIT_KIB`.
- Design system, i18n/RTL, auth, tenancy, schema, jobs and backups are separate P0 features.
- The GitHub remote exists. CodeRabbit reviews are enabled separately once configured.
