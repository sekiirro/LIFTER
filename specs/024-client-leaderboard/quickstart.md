# Quickstart: F24 Client Leaderboard

Validation guide for the future implementation. Use synthetic fixtures and the lane's local Supabase stack only. The spec-only lane does not run application tests.

## Prerequisites

- Feature flag mechanism has its own reviewed spec/PR and is server-side default OFF.
- Local Supabase stack and synthetic workspace/client fixtures are available.
- F11, F13, F15, F19, spec 023, spec 003 and spec 005 contracts are merged or pinned for the implementation slice.
- S55-024-Q14 is answered before final username validation is implemented.

## Validation scenarios

1. Create two synthetic workspaces and eligible clients. Compute and publish in A; prove A never reads B's candidate, rows or username.
2. With at least five eligible clients, compute at most five rows using the 50/50 composite; verify named adherence inputs are 0?10 integers and no score/health field reaches the read response.
3. Re-score past winners and new candidates from current-month inputs. A past winner remains unless a new candidate's current score is higher. Verify the previous approved list stays visible through pending/rejected PO decisions and swaps only after approval.
4. Approve/reject as PO after external verification evidence; deny client/staff/trainer/workspace-owner approval attempts; verify spec 005 audit actor/time and decision.
5. Opt out as the client while listed. Verify immediate removal from the current visible list, exclusion from later candidates, repeated-action idempotence, and audit evidence.
6. Signup with invitation-link through F11, including concurrent same-workspace duplicate usernames and same value in another workspace. Verify uniqueness, canonical client ownership and atomic signup. Edit own username; deny editing another client. Apply only Q14-approved validation.
7. Probe every API/read/write as anonymous, revoked, foreign-workspace, client, staff, trainer, workspace owner and PO. Confirm app policy and RLS independently.
8. Check AR-RTL/EN-LTR, light/dark, mobile/desktop, empty/pending/approved/rejected/opted-out/error states, keyboard use, field errors and proposed-copy approval status.
9. Inspect application responses, audit payloads and logs for score inputs, scores, health values, notes, plan content, client code and cross-workspace data.

## Commands

Run the scoped unit/integration suites and full local CI-equivalent specified by the owning implementation lane, then the repo format and security gates. Do not use hosted or production data for these scenarios.
