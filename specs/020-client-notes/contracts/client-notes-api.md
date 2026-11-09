# Client Notes Application Contract (proposed)

This is a behavioral contract for later implementation, not an API endpoint naming decision. Route/RPC names, request envelope and error copy remain unspecified.

## Operations

| Operation | Allowed actor | Required scope | Result |
| --- | --- | --- | --- |
| List notes | Trainer, Workspace Owner, Platform Owner | Current active workspace membership and role capability. A Trainer's client assignment is not a restriction (CN-MCQ-04, S37-PO-7). PO uses current platform-wide workspace policy. | Notes only for the requested client/workspace, newest-created first with `id` tie-break (FR-008). |
| Create note | Trainer, Workspace Owner, Platform Owner | Same current scope; author is derived from server-verified identity | One independent plain-text note: leading and trailing whitespace removed, then 1 to 5,000 Unicode code points, not blank after trimming (FR-002, CN-MCQ-14; S37-PO-16); the trimmed text is stored; server creation timestamp; one metadata-only audit event in the same transaction (FR-010). The request carries a client-generated idempotency key, generated once per create and re-sent unchanged on retry; a duplicate create in the same workspace/client scope returns the existing note row instead of creating a second note (FR-011, CN-MCQ-18; S39-PO-9). |
| Edit note | Original author with current authorization (active membership and a role still authorized), or Platform Owner | Current workspace/client scope; current authorization required | Replace current body in place; last save wins, the winner being the write the database commits last (FR-009); set `edited_at`; keep author, creation timestamp and all immutable columns; no version history; one metadata-only audit event in the same transaction (FR-010). |
| Hard-delete note | Platform Owner only | Existing Platform Owner workspace scope | Permanently remove row; one metadata-only audit event in the same transaction (FR-010). Audit retention is the existing `public.audit_events` policy (CN-MCQ-13); confirmation copy is CN-MCQ-08 rows 11–13. |

## Display

- Timestamps are shown in the viewer's local time zone in the CN-MCQ-08 row 29 format (FR-009, CN-MCQ-12).
- A note with an unavailable author shows the CN-MCQ-08 row 26 label “Unavailable author” / “صاحب الملاحظة غير متاح” (FR-002, CN-MCQ-06).
- Edited marker: CN-MCQ-08 row 25. Byline: row 28. Exit-protection warning copy (title, body, Stay and Discard): CN-MCQ-16 rows 30–33 in spec.md (S38-PO-11). All other strings: CN-MCQ-08 table rows 1–29 in spec.md; no other copy is approved.
- The in-flight warning body (a save already sent) is CN-MCQ-19. Its direction is approved by S39-PO-9 (leaving cannot cancel an in-flight save); its exact EN and Egyptian Arabic strings are PENDING-PO and no string is specified here. Rows 30–33 are unchanged and row 31 covers only text that has not been submitted. The proposal is `C:/Users/NEW LAP/.lifter/runs/s40-ds-cn-r8/cn-mcq-19-copy-proposal.md`.
- Leaving the editor or choosing Discard does not cancel a create or edit request already submitted; its outcome is the server result (committed or refused), and a committed save keeps its row and its one audit event (CN-MCQ-17; S39-PO-8). Only text that has not been submitted is discarded.

## Denials

- Deny Sales, Client and anonymous actors for every operation.
- Deny unauthorized actors, non-PO actors with revoked membership, and all foreign client/workspace scope. A non-PO revoked membership grants zero access; the Platform Owner follows the existing PO rule.
- Do not trust actor, client, workspace or role fields supplied by a caller. An idempotency key is not an authorization factor and never widens scope; it only identifies one create attempt for duplicate prevention.
- Application checks and database RLS must independently enforce the matrix.
- Failure response shape is not specified here. Where a denial message is shown, its copy is CN-MCQ-08 row 27 (“You don't have permission to do this.” / “ليست لديك صلاحية للقيام بذلك.”), a generic message that discloses no note, client or workspace existence.
- A denied or rejected operation emits no successful note-mutation event (specs/005-audit-log US1 scenario 2).
