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

#### User Story 5 - Cross-branch migration-version guard (Priority: P2)

An implementer working against multiple fetched remote branches can detect, before merge, that two unmerged branches picked the same 14-digit migration version for different filenames — without touching the working tree.

**Why this priority**: The S31 incident (`20261107030000` chosen by both `015-forms-intake` (F15 #44) and `016-catalog-ui` (F16 #43)) showed that the in-tree duplicate check cannot see across branches. S32-PO-3 authorises the preventive half of that incident ("prevent future duplicates"); the rename of #44 is a separate lane.

**Independent Test**: With remote refs already fetched by the caller, run `npm run check:migration-versions:remote`; it enumerates `refs/remotes/origin/*`, lists each ref's `supabase/migrations` via `git ls-tree` without checkout, and exits non-zero reporting the version, both filenames and the carrying refs when one version maps to two different filenames; otherwise it exits 0.

**Acceptance Scenarios**:

1. **Given** two fetched remote refs each carry a `supabase/migrations` entry with the same 14-digit version and different filenames, **When** the cross-ref check runs, **Then** it exits non-zero and reports the version, both filenames, and the refs that carry them.
2. **Given** several fetched remote refs carry the same version with the same filename, **When** the cross-ref check runs, **Then** it exits 0.
3. **Given** no version maps to two different filenames across the fetched remote refs, **When** the cross-ref check runs, **Then** it exits 0 and prints a summary of the refs scanned.
4. **Given** the default in-tree check (`npm run check:migration-timestamps`) runs, **When** it executes, **Then** its behaviour, output and CI wiring are unchanged by this amendment.

---

## Edge Cases

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
- **FR-015**: The migration-timestamp tooling MUST provide an opt-in cross-branch mode (`node scripts/check-migration-timestamps.mjs --all-remote-refs`, exposed as npm script `check:migration-versions:remote`) that enumerates `refs/remotes/origin` via `git for-each-ref`, lists each ref's `supabase/migrations` via `git ls-tree` (no checkout), and exits non-zero when one 14-digit version maps to two different filenames on any refs, reporting the version, both filenames and the carrying refs. The same filename on several refs MUST NOT fail. The default in-tree mode MUST remain byte-for-byte behaviourally unchanged and MUST NOT perform any git or network access. The cross-ref mode MUST NOT make network calls beyond what the caller already fetched, MUST NOT check out or modify any ref, and MUST exclude the `refs/remotes/origin/HEAD` symbolic ref from enumeration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone reaches all-gates-green in ≤ 10 minutes using only the README.
- **SC-002**: 100% of the listed gates run automatically on every PR. 0 secrets are required.
- **SC-003**: The health endpoint responds successfully in 100% of smoke runs and exposes exactly 2 fields.
- **SC-004**: The size report states the used percentage of the 64 MiB uncompressed Worker limit on every build.
- **SC-005**: 0 deployments and 0 paid-service calls occur as part of this feature.
- **SC-006**: Running `npm run check:migration-versions:remote` on a fetched repository reports every cross-branch same-version/different-filename pair (version, both filenames, carrying refs) in a single run and exits non-zero when at least one exists; same-filename-on-many-refs passes; the in-tree CI step output and exit behaviour are unchanged from before this amendment.

## Assumptions

- Architecture v3 fixes the stack: Next.js App Router, OpenNext Cloudflare adapter, Supabase CLI for local DB, GitHub Actions. This spec doesn't redesign it.
- The Worker size limit comes from the official Cloudflare limits page (checked 2026-10-27: 64 MiB uncompressed, no compressed limit) and stays overridable via `WORKER_SIZE_LIMIT_KIB`.
- Design system, i18n/RTL, auth, tenancy, schema, jobs and backups are separate P0 features.
- The GitHub remote exists. CodeRabbit reviews are enabled separately once configured.

## Clarifications

### Session 2026-11-04 (S32 — placement of the cross-branch migration-version guard)

- Q (architect ruling S32-R3, answering S32-PO-DECISION-1): which feature owns the cross-branch migration-version guard — a new numbered spec, `001-project-scaffold-ci`, `016-exercise-food-catalogs`, or a PO gate waiver? → A: `001-project-scaffold-ci`, as a CI-baseline tooling amendment. Reason (S32-R3, verbatim rationale): the migration-timestamp checker already runs as the CI step "Validate migration timestamps" (CI baseline, FR-009 family); a new numbered spec would consume a roadmap feature number. Spec placement for repo tooling is technical governance, not a product decision.
- PO source: S32-PO-3 (verbatim): "Rename F15 #44's conflicting migration via git mv, preserve F16 #43, verify DB state, repair Stack D history if needed, rerun gates, and prevent future duplicates." Only "prevent future duplicates" is in scope in this amendment; the #44 rename, DB-state verification, Stack D history repair and gate reruns are separate lanes and are not changed here. S32-PO-2 Q4 classifies this lane as low-risk tooling + tests.
- Scope of this amendment: FR-015, SC-006, User Story 5, task T016, the opt-in `--all-remote-refs` mode, its unit tests, and this Clarifications entry. The default in-tree mode and the CI step "Validate migration timestamps" are unchanged. No existing 001 requirement (FR-001..FR-014, SC-001..SC-005) is modified.
- **No open ambiguities.** The guard is detection-and-fail only; it does not rename migrations, does not alter CI behaviour, and consumes only refs the caller already fetched.
