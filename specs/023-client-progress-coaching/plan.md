# Implementation Plan: 023 Client Progress Coaching (P5 Progress)

**Spec**: [spec.md](spec.md) | **Status**: Spec-only. No implementation is authorized by this plan.

## Summary

P5 Progress coaching loop: weekly check-ins (P5-A), measurements (P5-B), food replacement requests (P5-C), client timeline (P5-E), with trainer notes reused from F20 (P5-D). Reuses F13 freeze, F15 forms/scheduler/notifications, F18 alternatives, F19 publish, F20 notes/audit, F21 bylines. Client leaderboard is a separate spec (024) that consumes `workoutAdherence` and `dietAdherence`. All work is spec-only in this lane; implementation requires a future lane. Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

## Technical context

- Next.js App Router with server-verified identity and existing `authorize()` (F11).
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership authoritative; platform-owner exception per constitution Principle I (F3).
- Reuse F13 freeze intervals/entitlement; F15 recurring assignment engine, autosave, snapshots, SLA, retention, notification inbox; F18 alternatives, publish revisions, max-3 cap; F19 Ready & Publish; F20 notes/audit; F21 bylines.
- F15 forms machinery is the single source for weekly check-in form answers, including the two adherence questions on a 0-10 integer scale.
- Audit retention inherited from F11/F20; no new retention rule.
- Migrations forward-only, expand/contract; unique versions chosen after an all-origin scan (no versions assigned here; spec-only).
- Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production. Security/authorization/RLS remain mandatory.

## Design

### Weekly check-ins (P5-A)

- Schedule first check-in 7 days after subscription activation, then every 7 days including Fridays, via F15 recurring assignments (FR-001, FR-003). No separate scheduler or occurrence table.
- Pause during freeze; resume with anchor shifted by frozen days; no catch-up (FR-002, F13, F15 FR-003).
- Outstanding forms remain visible across freeze/resume (FR-004); check-in completion is not a login gate (FR-005).
- In-app reminder on the due day and a second 24 hours later if unanswered, both at 10:00 AM workspace time (FR-006, FR-007).
- KPI counts check-ins received, not sent (FR-008); frozen clients receive no active-cycle prompts (FR-009).
- Two self-reported adherence questions (workout, diet) on a 0-10 integer scale, presented as neutral self-report items, never exposing leaderboard scoring mechanics (FR-037, FR-038, SC-011).

### Measurements (P5-B)

- Dedicated Progress measurement store with source reference to the weekly form submission (FR-010).
- Auto-extract from F15 weekly form answers, preserving question mappings, units, history (FR-011, FR-014).
- Reject duplicate manual entry for same client/day/type; direct the user to edit (FR-012, FR-015).
- Auto-extracted conflict with an existing same-day record directly updates that record in place and records the change in the background audit log; no user-visible correction-history entry (FR-012).
- Authorized trainer correction directly updates the measurement; change recorded in background audit log only (actor, timestamp, previous/new values); no user-facing correction-history UI (FR-013, SC-006).
- Measurement types/units derived from F15 mappings; no separate catalog (FR-014).
- Progress photos remain over Telegram; no web upload or auto ingestion (FR-017).
- Visibility subject to F13 plan-access restrictions (FR-016).

### Food replacement requests (P5-C)

- Clients freely select existing approved F18 alternatives with no request or revision (FR-018).
- New alternative requires a free-text request, at most one open per food (FR-019); F15 text limits 150/1,000 code points, 4,096 bytes, no attachments (FR-021).
- Cancel allowed; in-place edit not allowed (FR-020).
- Approval adds/replaces within F18 max-3 via draft revision + manual Ready & Publish; no auto-publish (FR-022, FR-023).
- Pending requests do not hide existing alternatives (FR-024).
- Stale-close when target food removed in a newer revision (FR-025).
- Preserve F18 mapping, client-specific totals/exports, fallback (FR-026).
- Lifecycle states open/rejected/approved-via-published-revision/stale-closed; notifications per p5-audit Q8 option A (FR-027).
- No SLA escalation (FR-028).

### Client timeline (P5-E)

- Concise chronological timeline of the fixed meaningful event set (FR-029, FR-032).
- Visible to client (own) and authorized trainers, workspace owners, platform owners (FR-030).
- Reuse existing audit retention; no new retention rule (FR-031).
- Reuse event emission from F13/F15/F19/F20/P4; no duplicate audit rows (FR-033).

### Trainer notes (P5-D) — reuse only

- Governed by F20; P5 adds no notes FRs, tables or endpoints (FR-034).
- Timeline may reference note events via F20 audit events only (FR-035).

### Notifications / reuse

- In-app notifications reuse F15 inbox and dedupe patterns (FR-036).

## Constitution check

- Principle I (workspace isolation): PASS for spec scope. All tenant records carry workspace_id; two authorization walls; foreign-workspace negative tests required.
- Principle IV (approved scope only): PASS. All FRs trace to BRD/PRD or approved PO decisions; no invented rules; PRD-12 exclusions respected (no web progress photos, no in-app chat).
- Principle V (versioned content): PASS. Published plans/forms immutable; submitted forms remain readable.
- Principle VII (privacy/health data): PASS. Measurements are health data; least-privilege; audit append-only; timeline is curated projection.
- Principle IX (idempotent operations): PASS. Reminders, check-ins, SLA timers idempotent with dedup keys.
- Development workflow: spec-only lane; Analyze dated after latest spec/plan/tasks change; zero open CRITICAL/HIGH before implementation.

## Risks and mitigations

- Cross-spec coupling with 024: field names `workoutAdherence`/`dietAdherence` and 0-10 scale are fixed; 024 owns scoring. This spec must not redefine leaderboard scoring.
- F15 reuse: P5-A must not define a separate scheduler or occurrence table.
- F18 reuse: P5-C owns request workflow only; approval prepares draft, manual publish.
- F20 reuse: no duplicate notes spec.
- Feature flags are cancelled while LIFTER is not live (PO S56-PO-4); this work proceeds without a flag; flags are reconsidered before production.

## Complexity tracking

None. No constitution deviations identified at spec stage.
