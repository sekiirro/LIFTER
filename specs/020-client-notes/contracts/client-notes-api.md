# Client Notes Application Contract (proposed)

This is a behavioral contract for later implementation, not an API endpoint naming decision. Route/RPC names, request envelope and error copy remain unspecified.

## Operations

| Operation | Allowed actor | Required scope | Result |
| --- | --- | --- | --- |
| List notes | Trainer, Workspace Owner, Platform Owner | Current active workspace membership and role capability. A Trainer's client assignment is not a restriction (CN-MCQ-04, S37-PO-7). PO uses current platform-wide workspace policy. | Notes only for the requested client/workspace, newest-created first with `id` tie-break (FR-008). |
| Create note | Trainer, Workspace Owner, Platform Owner | Same current scope; author is derived from server-verified identity | One independent plain-text note: leading and trailing whitespace removed, then 1 to 5,000 Unicode code points, not blank after trimming (FR-002, CN-MCQ-14); the trimmed text is stored; server creation timestamp; one metadata-only audit event (FR-010). |
| Edit note | Original author with current authorization (active membership and a role still authorized), or Platform Owner | Current workspace/client scope; current authorization required | Replace current body in place; last save wins (FR-009); set `edited_at`; keep author and creation timestamp; no version history; one metadata-only audit event (FR-010). |
| Hard-delete note | Platform Owner only | Existing Platform Owner workspace scope | Permanently remove row; one metadata-only audit event (FR-010). Audit retention is the existing `public.audit_events` policy (CN-MCQ-13); confirmation copy is CN-MCQ-08. |

## Display

- Timestamps are shown in the viewer's local time zone (FR-009, CN-MCQ-12). The format is part of CN-MCQ-08.
- A note with an unavailable author shows a neutral unavailable-author label (FR-002, CN-MCQ-06). Its exact AR and EN wording is part of CN-MCQ-08.

## Denials

- Deny Sales, Client and anonymous actors for every operation.
- Deny unauthorized or revoked membership actors and all foreign client/workspace scope. Revoked membership grants zero access.
- Do not trust actor, client, workspace or role fields supplied by a caller.
- Application checks and database RLS must independently enforce the matrix.
- Failure response shape and UI copy are not specified here and must not disclose note/client/workspace existence; obtain PO approval or use an already-approved generic security pattern without extending it.
