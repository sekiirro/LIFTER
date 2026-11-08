# Client Notes Application Contract (proposed)

This is a behavioral contract for later implementation, not an API endpoint naming decision. Route/RPC names, request envelope and error copy remain unspecified.

## Operations

| Operation | Allowed actor | Required scope | Result |
| --- | --- | --- | --- |
| List notes | Trainer, Workspace Owner, Platform Owner | Current active workspace membership and role capability. A Trainer's client assignment is not a restriction (CN-MCQ-04, S37-PO-7). PO uses current platform-wide workspace policy. | Notes only for the requested client/workspace, newest-created first with `id` tie-break (FR-008). |
| Create note | Trainer, Workspace Owner, Platform Owner | Same current scope; author is derived from server-verified identity | One independent plain-text note: leading and trailing whitespace removed, then 1 to 5,000 Unicode code points, not blank after trimming (FR-002, CN-MCQ-14; S37-PO-16); the trimmed text is stored; server creation timestamp; one metadata-only audit event in the same transaction (FR-010). |
| Edit note | Original author with current authorization (active membership and a role still authorized), or Platform Owner | Current workspace/client scope; current authorization required | Replace current body in place; last save wins, the winner being the write the database commits last (FR-009); set `edited_at`; keep author, creation timestamp and all immutable columns; no version history; one metadata-only audit event in the same transaction (FR-010). |
| Hard-delete note | Platform Owner only | Existing Platform Owner workspace scope | Permanently remove row; one metadata-only audit event in the same transaction (FR-010). Audit retention is the existing `public.audit_events` policy (CN-MCQ-13); confirmation copy is CN-MCQ-08 rows 11–13. |

## Display

- Timestamps are shown in the viewer's local time zone in the CN-MCQ-08 row 29 format (FR-009, CN-MCQ-12).
- A note with an unavailable author shows the CN-MCQ-08 row 26 label “Unavailable author” / “صاحب الملاحظة غير متاح” (FR-002, CN-MCQ-06).
- Edited marker: CN-MCQ-08 row 25. Byline: row 28. All other strings: CN-MCQ-08 table rows 1–29 in spec.md; no other copy is approved.

## Denials

- Deny Sales, Client and anonymous actors for every operation.
- Deny unauthorized actors, non-PO actors with revoked membership, and all foreign client/workspace scope. A non-PO revoked membership grants zero access; the Platform Owner follows the existing PO rule.
- Do not trust actor, client, workspace or role fields supplied by a caller.
- Application checks and database RLS must independently enforce the matrix.
- Failure response shape is not specified here. Where a denial message is shown, its copy is CN-MCQ-08 row 27 (“You don't have permission to do this.” / “ليست لديك صلاحية للقيام بذلك.”), a generic message that discloses no note, client or workspace existence.
- A denied or rejected operation emits no successful note-mutation event (specs/005-audit-log US1 scenario 2).
