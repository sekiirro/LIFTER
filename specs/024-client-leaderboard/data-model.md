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
- `rank`: integer 1..n: the full ranking of all eligible clients (S57-PO-6). The public Top 5 is derived at read time from the first five visible entries, renumbered 1-5.
- Display identity is read live from the canonical F11 username (no snapshot copy, data minimization); no health values, score, client code or notes.
- Unique `(workspace_id, publication_id, rank)` and `(workspace_id, publication_id, client_id)`.
- When opt-out occurs, the public projection filters that client immediately and the next eligible entry moves up (#6 -> #5) without reapproval; the stored row keeps the client's private rank (S57-PO-6).
- Private rank (read-time only): the caller's own approved rank and the count of all entries of the current approved ranking (opted-out clients included), returned only while the caller is eligible apart from the opt-out (S57-PO-12).

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

### ClientGoalType (S57-PO-1)

- `workspace_id`, `client_id`: composite relation to the canonical client.
- `goal_type`: one of `fat_loss`, `muscle_gain`, `maintenance`.
- `updated_by`, `updated_at`: actor and time of the latest change; every change is audited without the value.
- Set and read only by coaching staff (trainer, workspace owner, Platform Owner; never Sales). A client without a goal type is not eligible.

### ScoreInputs (transient only)

- `workoutAdherence`, `dietAdherence`: named spec 023 fields, each 0?10 integer. Their mean is the adherence component.
- Goal-relative progress (S57-PO-1): body weight from spec 023 baselines, first value vs this month's latest, normalized by goal type to 0-1.
- Achievement instant (S57-PO-2): the latest counted check-in or body-weight measurement of the month.
- Client code (S57-PO-3): registration approval order.
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
2. A client-visible publication has an approved PO decision; its public view shows at most five entries.
3. A new approved publication replaces the prior current result only in the approval transaction.
4. Opt-out immediately suppresses the username from the public view and all future results, promotes the next eligible entry without reapproval, and keeps the client's private rank.
5. A client reads only their own private rank and the participant total; no other client's rank outside the public Top 5 is readable by any client or non-PO staff member.
6. Username uniqueness is scoped to workspace and checked on signup and edit under a concurrency-safe database constraint.
7. No health values, answer values, notes, plan content, raw scores, client code or formulas are returned or logged.
8. No duplicate eligibility engine, form scheduler, plan-delivery store, audit log or client identity is introduced.
