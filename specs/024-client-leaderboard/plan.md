# Implementation Plan: F24 Workspace-Isolated Client Leaderboard

**Branch**: `024-client-leaderboard` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: `specs/024-client-leaderboard/spec.md`

## Summary

Deliver an optional monthly Top-5 leaderboard isolated per workspace. Derive eligibility and scores from F13, F15, F19 and spec 023; expose username-only entries; keep the approved publication visible until the PO approves its successor; apply client opt-out immediately; record PO decisions and opt-outs through the existing audit contract. Implement signup username behavior within F11's existing invitation-link signup boundary. Do not redefine dependency contracts.

## Technical Context

**Language/Version**: TypeScript, existing Next.js application, Node version pinned by the repository.

**Primary Dependencies**: Existing Next.js App Router, Supabase server client, PostgreSQL authorization/RLS, Design System components and i18n.

**Storage**: Supabase PostgreSQL; workspace-scoped leaderboard publication/entry and client opt-out state. Exact schema is proposed in [data-model.md](data-model.md), subject to dependency-contract review.

**Testing**: Existing Vitest unit and integration suites, including real local Supabase RLS/authorization tests; no hosted data. Follow the repo's required local CI-equivalent before implementation PR.

**Target Platform**: Cloudflare-hosted Next.js and Supabase, client and staff web surfaces.

**Project Type**: Multi-tenant web application.

**Performance Goals**: No product-specific latency target is stated. Queries must bound one workspace and at most five visible entries; do not add an invented SLA.

**Constraints**: Two authorization walls; no cross-workspace disclosure; no health values or scoring mechanics in client output/logs; PO-only approval; immediate opt-out; signup username format/reserved-name implementation waits for Q14.

**Scale/Scope**: Monthly workspace result with no more than five displayed clients; reads available to workspace clients, staff, trainers, workspace owners and the PO, subject to existing capabilities.

## Constitution Check (before research)

- **I Strict Workspace Isolation**: PASS in design intent. Every query and mutation is workspace-bound; app authorization and RLS both deny by default; plan includes foreign-workspace negative tests.
- **II Immutable Financial Truth**: N/A. This feature does not touch money or financial snapshots.
- **III PO Governance / Least Privilege**: PASS. Only the PO approves/rejects a result; no staff approval capability is added.
- **IV Approved Scope Only**: PASS with Q14 constraint. No username format/reserved-name policy will be invented.
- **V Versioned Content**: PASS. No plan/form content is edited; dependency snapshots are consumed by reference.
- **VI Human-Governed Decisions**: PASS. Publication approval is a manual PO decision.
- **VII Privacy / Health Data**: PASS in design intent. Score inputs stay server-side; projection and logs use allow-lists; opt-out is audited.
- **VIII Bilingual Accessible UI**: PASS subject to frontend design gate; copy is only proposed in `copy-proposal.md`, English professional and Arabic Egyptian colloquial.
- **IX Reliable Operations**: PASS in design intent. Unique workspace username, opt-out, current publication replacement and decision recording require transaction-safe/idempotent handling.
- **Feature flag**: Constitution 1.16.0 requires unfinished merged work to stay dark behind a server-side default-OFF flag. The shared flag mechanism needs its own small spec/PR before this feature uses it.

## Research and Design Outputs

- [research.md](research.md) records source decisions, existing contract reuse, and the Q14 boundary.
- [data-model.md](data-model.md) describes workspace publication, entries, opt-out state, username ownership reference and audit links.
- [contracts/leaderboard-surface.md](contracts/leaderboard-surface.md) defines the proposed read/write boundaries and safe response fields.
- [quickstart.md](quickstart.md) lists the local validation path and acceptance scenarios.

## Architecture and Data Flow

1. A workspace-scoped server operation derives eligibility and current-month score inputs from F13, F15, F19 and spec 023.
2. Ranking retains eligible past winners and compares them to new candidates using current-month values. An opted-out client is filtered before candidate construction.
3. The server stores the proposed monthly result and exposes it only after the PO records approval. Until approval, clients continue to see the previous approved result. A later opt-out immediately filters the opted-out row from that result.
4. Each workspace viewer reads only the display allow-list: rank and client username. No health metric, check-in answer, score, client code, note, plan detail, or scoring explanation crosses the client boundary.
5. The client username is created/validated in F11's invitation-link signup transaction and edited through the existing account-settings area; both paths enforce workspace uniqueness. Q14 must be decided before final format/reserved-name validation is implemented.

## Constitution Check (post-design)

- Tenant-bound data model and APIs preserve Principle I; all entry points need both app authorization and RLS proof.
- The PO-only decision and its audit reference preserve Principles III and VI.
- The client projection, audit payloads and log allow-lists preserve Principle VII.
- Copy and rendered-state validation must satisfy Principle VIII.
- All mutation operations use stable idempotency/concurrency boundaries per Principle IX.
- No unresolved CRITICAL/HIGH product decision blocks the plan. S55-024-Q14 remains a non-blocking implementation detail.

## Project Structure

```text
app/(app)/leaderboard/                 # PO result review/approval surface
app/(client)/leaderboard/              # client leaderboard and settings opt-out
app/(client)/account/settings/         # reuse existing account-settings route if present
app/register/[token]/                  # F11 signup field reuse/addition only
lib/leaderboard/                       # eligibility, scoring, publication and DTO boundaries
lib/feature-flags/                     # server-side default-OFF flag mechanism, separate prerequisite spec/PR
supabase/migrations/                   # forward-only workspace-scoped schema/policies
tests/unit/                            # pure score, eligibility and mapping tests
tests/integration/                     # real RLS, approval, opt-out, signup and workspace tests
specs/024-client-leaderboard/          # requirements and design artifacts
```

**Structure Decision**: Extend the existing root Next.js application and Supabase project. Keep feature rules in a focused `lib/leaderboard/` module, reuse established F11 signup and client settings routes, and keep migrations/tests in existing top-level directories. No new project or dependency is proposed.

## Delivery Slices

Target one user-story vertical slice per PR, approximately 400?800 changed lines as permitted by S54 R3/R8. Merge origin/main before a push and run the local CI-equivalent before that push. Any incomplete slice is gated by the separate server-side default-OFF feature-flag mechanism; the flag never gates authorization/RLS. Perform one cumulative AI review when the feature is complete.

1. Flag mechanism prerequisite (separate small spec/PR): server-side default-OFF flag and fail-closed read behavior.
2. Client identity/settings slice: F11 invitation-link username, workspace uniqueness, later client edit, and direct opt-out; wait for S55-024-Q14 before final format/reserved-name behavior.
3. Read-only leaderboard slice: eligibility, current-month score, privacy projection, workspace isolation.
4. PO publication slice: candidate result, audit decision, approved-list swap only on approval.
5. Cross-cutting privacy/localization/isolation hardening: data allow-lists, accessible UI, concurrency and regression evidence.

## Complexity Tracking

No constitution exceptions are requested.
