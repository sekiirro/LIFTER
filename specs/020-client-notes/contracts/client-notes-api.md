# Client Notes Application Contract (proposed)

This is a behavioral contract for later implementation, not an API endpoint naming decision. Route/RPC names, request envelope and error copy remain unspecified.

## Operations

| Operation | Allowed actor | Required scope | Result |
| --- | --- | --- | --- |
| List notes | Authorized Trainer, Workspace Owner, Platform Owner | Existing client authorization and workspace scope; PO uses current platform-wide workspace policy | Notes only for the requested client/workspace. Ordering is CN-MCQ-01. |
| Create note | Authorized Trainer, Workspace Owner, Platform Owner | Same current scope; author is derived from server-verified identity | One independent plain-text note with server timestamp and <= 5,000 chars. Empty/count boundary CN-MCQ-02. |
| Edit note | Original author or Platform Owner | Current workspace/client scope; current authorization required | Replace current body in place; no version history. Extra edit metadata CN-MCQ-03. |
| Hard-delete note | Platform Owner only | Existing Platform Owner workspace scope | Permanently remove row. Audit/confirmation behavior CN-MCQ-07/CN-MCQ-08. |

## Denials

- Deny Sales, Client and anonymous actors for every operation.
- Deny unauthorized or revoked membership actors and all foreign client/workspace scope.
- Do not trust actor, client, workspace or role fields supplied by a caller.
- Application checks and database RLS must independently enforce the matrix.
- Failure response shape and UI copy are not specified here and must not disclose note/client/workspace existence; obtain PO approval or use an already-approved generic security pattern without extending it.
