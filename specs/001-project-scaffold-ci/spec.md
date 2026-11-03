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

#### User Story 5 - Reliable and safe self-hosted CI operations (Priority: P1)

Push and pull-request verification runs on the approved self-hosted runner when selected, preserves the existing quality/security gates and hosted fallback, isolates its Docker engine and ports from Stacks A–D, and obeys the repository-visibility and CI-window controls.

**Acceptance Scenarios**:

1. **Given** a push or pull request selects the self-hosted runner, **When** CI finishes, **Then** the validate, integration and storage jobs pass and all existing tests/security gates remain enabled. Source: S28-PO-3: "Verify that Push + PR CI runs pass, all existing tests and security gates remain intact".
2. **Given** a CI job runs, **When** it starts and cleans up its isolated Supabase profile, **Then** Stacks A–D are unaffected and all reserved lane ports are released. Source: S28-PO-3: "Supabase Stacks A–D are unaffected"; approved CI isolation contract.
3. **Given** the machine has rebooted, **When** the supported startup trigger runs, **Then** the WSL2 distro, Docker engine and runner start automatically and the runner registers online. Source: S28-PO-3: "the runner automatically starts after reboot".
4. **Given** a public/ private CI window is required, **When** that window runs, **Then** the self-hosted runner is offline for every PUBLIC interval, the CI-window lock is held, and PRIVATE is restored and verified before the window closes. Source: SESSION_HANDOFF.md S28 architect rule and `s29-startup-prompt.md` CI rules.
5. **Given** full end-to-end reliability has not yet been verified, **When** self-hosted CI is reviewed, **Then** the repository remains subject to the existing Public/Private procedures and hosted fallback remains enabled; only after full verification may the repository stay permanently PRIVATE and switching procedures be eliminated. Source: S28-PO-3 (quoted in FR-018).

## Edge Cases

- A missing local env file must not break typecheck, lint, unit tests or build. A committed example file documents the variables (with no values).
- Windows and Linux developers produce the same results (line endings, path handling).
- The local database tooling config is present, but no schema/migrations exist yet. Starting it is optional for this feature's gates.

## Clarifications

The product acceptance authority for self-hosted GitHub CI is S28-PO-3; the infrastructure security rules for public intervals and CI windows are cited in FR-019-FR-020. No open product ambiguities remain for this infrastructure scope. Evidence gates that are not yet proven remain open tasks and are not represented as completed. Repository visibility, merge approval, and runner state are not changed by this specification review.

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
- **FR-015**: For the self-hosted CI lane, Push and PR CI runs MUST pass and all existing tests and security gates MUST remain intact. Source: S28-PO-3 (verbatim): "Verify that Push + PR CI runs pass, all existing tests and security gates remain intact".
- **FR-016**: Self-hosted CI MUST leave Supabase Stacks A–D unaffected. Its Docker engine, project identity, app port and Supabase port range MUST remain isolated from Stacks A–D and other reserved lane ports. Source: S28-PO-3 (verbatim): "Supabase Stacks A–D are unaffected"; implementation isolation is documented in `docs/ci-self-hosted.md`.
- **FR-017**: The self-hosted runner environment MUST automatically start after machine reboot and register ready for work. Source: S28-PO-3 (verbatim): "the runner automatically starts after reboot". A real reboot verification is a required acceptance gate.
- **FR-018**: The GitHub repository MUST remain subject to the current visibility procedures until full end-to-end verification. Only after that verification may it remain permanently PRIVATE and Public/Private switching procedures be eliminated. The existing hosted CI fallback MUST remain enabled until the self-hosted setup is proven reliable. Existing merge gates MUST remain, and no PR may merge without explicit PO approval. Source: S28-PO-3 (verbatim): "Only after full end-to-end verification, keep the GitHub repository permanently PRIVATE and eliminate all Public/Private switching procedures. Do not disable the existing CI fallback until the new setup is proven reliable. Preserve all merge approval gates. No PR merges without my explicit approval."
- **FR-019**: The self-hosted runner MUST be offline whenever the repository is PUBLIC. Source: `docs/SESSION_HANDOFF.md:119` (S28 architect ruling, verbatim): "Self-hosted runner must be offline whenever repo PUBLIC."
- **FR-020**: Every temporary CI visibility window MUST hold `~/.lifter/tmp/ci-window.lock`; a watchdog MUST be started and confirmed live before a later step changes repository visibility, and PRIVATE MUST be restored and verified before the watchdog is stopped. Record exact timestamps. Source: `s29-startup-prompt.md:79` (verbatim): "Self-hosted runner offline for every PUBLIC interval; CI-window lock `~/.lifter/tmp/ci-window.lock` required. Launch watchdog and confirm PID/liveness first; only in a later command set PUBLIC. Restore and verify PRIVATE before stopping watchdog; record exact timestamps."


## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh clone reaches all-gates-green in ≤ 10 minutes using only the README.
- **SC-002**: 100% of the listed gates run automatically on every PR. 0 secrets are required.
- **SC-003**: The health endpoint responds successfully in 100% of smoke runs and exposes exactly 2 fields.
- **SC-004**: The size report states the used percentage of the 64 MiB uncompressed Worker limit on every build.
- **SC-005**: 0 deployments and 0 paid-service calls occur as part of this feature.
- **SC-006**: For every required push and PR verification on the accepted head, validate, integration and storage jobs complete successfully; 100% of baseline tests and security gates remain enabled. (FR-015)
- **SC-007**: During every self-hosted CI run, the before/after state of Stacks A–D is unchanged and 100% of mapped CI ports are released after cleanup. (FR-016)
- **SC-008**: A real machine reboot results in the runner becoming online automatically without manual logon or service start. (FR-017)
- **SC-009**: Until reliability is proven, the hosted fallback remains selectable and the visibility-switching procedure remains in place; after verification, the repository is PRIVATE with no visibility-switch procedure. Merge approval gates remain enabled and no PR is merged without PO approval. (FR-018)
- **SC-010**: The runner is offline for 100% of observed repository-PUBLIC intervals. (FR-019)
- **SC-011**: Every observed CI visibility window has a live lock/watchdog before the visibility change and a verified PRIVATE state before lock/watchdog release, with start/end timestamps recorded. (FR-020)

## Assumptions

- Architecture v3 fixes the stack: Next.js App Router, OpenNext Cloudflare adapter, Supabase CLI for local DB, GitHub Actions. This spec doesn't redesign it.
- The Worker size limit comes from the official Cloudflare limits page (checked 2026-10-27: 64 MiB uncompressed, no compressed limit) and stays overridable via `WORKER_SIZE_LIMIT_KIB`.
- Design system, i18n/RTL, auth, tenancy, schema, jobs and backups are separate P0 features.
- The GitHub remote exists. CodeRabbit reviews are enabled separately once configured.
