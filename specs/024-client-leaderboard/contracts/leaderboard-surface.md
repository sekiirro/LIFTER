# Contract: Leaderboard Surface

Proposed internal application contract; route placement follows the existing App Router conventions. All operations use authenticated server-side identity and scope each read/write to the resolved workspace. Both app authorization and database RLS apply. This contract does not authorize implementation.

## Client and workspace viewer read

- Input: authenticated user and workspace context resolved by the existing session/membership/PO authorization helpers. No caller-supplied workspace id is trusted as authorization.
- Output: `available` plus at most five rows `{ rank, username }` (the public Top 5, derived at read time from the approved full ranking; ranks renumbered 1-5 among visible entries), or the existing empty/unavailable state. No score, client code, health value, adherence answer, measurement, note, plan data, formula or internal decision evidence.
- Placement (S57-PO-12): the client reads the Top 5 inside the Progress area; the earlier client leaderboard route redirects to that section. No Main Navigation entry.
- Workspace clients, staff, trainers, workspace owners and PO may read within the established spec 003 policy. Foreign workspace, anonymous and revoked callers are denied at both walls.

## Client private rank (S57-PO-6, S57-PO-12)

- Input: authenticated client session only; no client or workspace argument is accepted.
- Output: `{ status: "ranked", period_month, rank, total }` for the caller's own entry in the current approved ranking, or `none` / `not_ranked` / `not_permitted`. `total` counts every entry of the approved ranking, opted-out clients included.
- Returned only while the caller is eligible apart from the opt-out; an opted-out client keeps their rank. Staff, the Platform Owner, anonymous and foreign-workspace callers receive no rank.
- Never returns another client's rank, username, score or input.

## Goal type (S57-PO-1)

- Set: coaching staff (trainer, workspace owner, Platform Owner; never Sales) set one of fat loss, muscle gain, maintenance for a client of their workspace; audited without the value.
- Read: the same staff read the goal type and the id of the client's latest submitted assignment that asks the F15 near-term goal question; the answer itself is read only through F15's audited answer reader and is never logged.

## Client settings opt-out

- Input: authenticated client action in account settings; derive client/workspace from the session and authorized membership.
- Effect: idempotently mark opt-out and audit actor/time; immediately hide the client from the public Top 5 (the next eligible entry moves up without reapproval) and from future candidate lists; keep the client's private rank (S57-PO-6).
- Output: status only; never echo scoring inputs or other client data. No PO approval or request queue is involved.

## F11 username signup/edit

- Signup: use the exact F11 invitation-link route and `client_signup(token, request_secret, admission_ticket, fields)` transaction from `specs/011-client-accounts/contracts/client-signup-surface.md`. Reuse an existing username field or add it within that field contract; never create a parallel signup path.
- Edit: authenticated client updates only their own username through the account-settings boundary. Enforce workspace uniqueness both in application validation and a database constraint. A reserved or already-used name shows the approved "Username unavailable" message (S57-PO-12); signup keeps F15's generic message (S57-PO-7).
- Q14 is decided (S55-PO-9): usernames are 3-20 characters, English letters (A-Z), digits, underscores and dots only; case-insensitive uniqueness per workspace; reserved names (admin, support, lifter, trainer, owner) blocked case-insensitively. Apply at signup and later edits.

## PO decision

- PO-only action records approve/reject, actor, time, publication and audit reference after the off-app WhatsApp verification.
- The candidate is the full ranking of all eligible clients; the PO reviews and approves the full ranking (S57-PO-6).
- Approval atomically makes the candidate ranking current; until approval, the prior approved ranking remains current. Rejection leaves it current. Opt-out promotions need no reapproval.
- The PO UI does not receive raw health data or check-in answers.

## Ranking input boundary

- Server-only reads named adherence values `workoutAdherence` and `dietAdherence` from spec 023 (each 0-10 integer; monthly mean, S57-PO-4), plus body-weight baselines normalized by the trainer-set goal type (S57-PO-1). Re-score incumbents (the current public Top 5) and new candidates on current-month data.
- Equal-score ordering follows FR-021 (last scoring input, S57-PO-2; registration order, S57-PO-3). Input fields and formula never cross to client-facing output.

## Audit boundary

Reuse spec 005 audit append behavior for PO approve/reject and client opt-out. Include actor, timestamp, workspace, target and decision/action; exclude username values, health data, score inputs, raw scores and formula.
