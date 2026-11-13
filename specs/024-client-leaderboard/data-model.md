# Data Model: F24 Client Leaderboard

This document is a proposed implementation model for review; it adds no product policy beyond `spec.md`. Tenant-owned relations carry `workspace_id`; foreign keys and unique constraints are workspace-scoped. Reuse the existing canonical client ID and username owner in F11 rather than creating another identity source.

## Entities

### LeaderboardPublication

- `id`: publication identifier.
- `workspace_id`: owning workspace.
- `period_start`, `period_end`: month interval in the workspace's existing time convention.
- `state`: pending PO decision, approved, or rejected.
- `approved_by`, `decided_at`: nullable until a PO decision; record actor/time when decided.
- `audit_event_id`: reference to spec 005 audit evidence.
- Unique publication identity per `(workspace_id, period_start)` unless an existing publication lifecycle requires version rows; resolve against schema review before implementation.
- State transition: candidate -> approved or rejected. A new approved publication becomes current atomically; the previous approved publication remains current until that commit.

### LeaderboardEntry

- `workspace_id`, `publication_id`, `client_id`: composite tenant relation.
- `rank`: integer 1..5.
- `username_snapshot`: the approved display value for this publication; no health values, score, client code or notes.
- Unique `(workspace_id, publication_id, rank)` and `(workspace_id, publication_id, client_id)`.
- When opt-out occurs, the visible projection filters that client immediately even if a historical row remains stored for audit/history.

### ClientLeaderboardPreference

- `workspace_id`, `client_id`: composite relation to the canonical client.
- `opted_out_at`: null while participating by default; set at client opt-out.
- Audit reference for the opt-out mutation.
- Account settings may reuse an existing preference field if one already exists; do not duplicate it.

### ClientUsername

- Identity remains owned by F11's canonical client account/signup contract.
- Signup selection, workspace-scoped uniqueness, and later client edits follow S55-PO-6 Q11.
- Reuse an existing username field if present; otherwise add it to the F11 signup form/RPC flow. No separate username account or identity table.
- Username validation (S55-PO-9 Q14): 3-20 characters, English letters (A-Z), digits, underscores and dots only; case-insensitive uniqueness per workspace; reserved names (admin, support, lifter, trainer, owner) blocked case-insensitively. Apply at signup and later edits.

### ScoreInputs (transient only)

- `workoutAdherence`, `dietAdherence`: named spec 023 fields, each 0?10 integer. Their mean is the adherence component.
- Goal-relative normalized baseline improvement by goal type: consumed from spec 023's approved progress contract.
- Current-month values are recomputed for prior winners and new candidates.
- These inputs and all scores remain server-only and MUST NOT be persisted in the client display projection or logs.

## Relationships and boundaries

- F13 owns subscription, entitlement and freeze lifecycle.
- F15 owns check-in form assignments and answers.
- F19 owns plan-delivery facts.
- Spec 023 owns measurements, progress and the named adherence fields.
- Spec 003 owns workspace/RLS authorization; spec 005 owns append-only audit.
- F11 owns client signup and canonical client identity. F21 owns staff display names only.

## Invariants

1. Every publication and entry belongs to exactly one workspace; every relation verifies the same `workspace_id`.
2. A client-visible publication has at most five entries and has an approved PO decision.
3. A new approved publication replaces the prior current result only in the approval transaction.
4. Opt-out immediately suppresses the username from the currently visible result and all future results.
5. Username uniqueness is scoped to workspace and checked on signup and edit under a concurrency-safe database constraint.
6. No health values, answer values, notes, plan content, raw scores, client code or formulas are returned or logged.
7. No duplicate eligibility engine, form scheduler, plan-delivery store, audit log or client identity is introduced.
