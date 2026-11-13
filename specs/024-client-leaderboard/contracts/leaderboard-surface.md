# Contract: Leaderboard Surface

Proposed internal application contract; route placement follows the existing App Router conventions. All operations use authenticated server-side identity and scope each read/write to the resolved workspace. Both app authorization and database RLS apply. This contract does not authorize implementation.

## Client and workspace viewer read

- Input: authenticated user and workspace context resolved by the existing session/membership/PO authorization helpers. No caller-supplied workspace id is trusted as authorization.
- Output: `available` plus at most five rows `{ rank, username }`, or the existing empty/unavailable state. No score, client code, health value, adherence answer, measurement, note, plan data, formula or internal decision evidence.
- Workspace clients, staff, trainers, workspace owners and PO may read within the established spec 003 policy. Foreign workspace, anonymous and revoked callers are denied at both walls.

## Client settings opt-out

- Input: authenticated client action in account settings; derive client/workspace from the session and authorized membership.
- Effect: idempotently mark opt-out and audit actor/time; immediately suppress the username from the currently visible result and future candidate lists.
- Output: status only; never echo scoring inputs or other client data. No PO approval or request queue is involved.

## F11 username signup/edit

- Signup: use the exact F11 invitation-link route and `client_signup(token, request_secret, admission_ticket, fields)` transaction from `specs/011-client-accounts/contracts/client-signup-surface.md`. Reuse an existing username field or add it within that field contract; never create a parallel signup path.
- Edit: authenticated client updates only their own username through the account-settings boundary. Enforce workspace uniqueness both in application validation and a database constraint.
- Q14 remains open: final username-specific format and reserved-name validation waits for PO answer. The planning placeholder must not ship as decided policy.

## PO decision

- PO-only action records approve/reject, actor, time, publication and audit reference after the off-app WhatsApp verification.
- Approval atomically makes the candidate result current; until approval, the prior approved list remains current. Rejection leaves it current.
- The PO UI does not receive raw health data or check-in answers.

## Ranking input boundary

- Server-only reads named adherence values `workoutAdherence` and `dietAdherence` from spec 023 (each 0?10 integer), plus normalized goal-relative baseline improvement by goal type. Re-score incumbents and new candidates on current-month data.
- Equal-score ordering follows FR-021. Input fields and formula never cross to client-facing output.

## Audit boundary

Reuse spec 005 audit append behavior for PO approve/reject and client opt-out. Include actor, timestamp, workspace, target and decision/action; exclude username values, health data, score inputs, raw scores and formula.
