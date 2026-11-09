# Client Notes Database/RLS Contract (proposed)

No SQL or migration is supplied by this document. The following acceptance contract governs a future design.

## Scope and policy

- Every note has a non-null `workspace_id` and `client_id`; same-workspace composite integrity binds it to `public.clients`. The note and the create-idempotency record each carry a `(workspace_id, id)` unique key (constitution Principle I).
- RLS is ENABLED and FORCED. Policies default to deny. No anonymous note privileges.
- Read and create allow a Trainer (any client in the workspace, regardless of client assignment), a Workspace Owner, or a Platform Owner, each with current active membership in the workspace or PO scope. Sales and Client are denied.
- Edit allows the original `author_user_id` only with current authorization in the note's workspace (active membership and a role still authorized, for example Trainer or Workspace Owner), or a Platform Owner in PO scope.
- Delete allows Platform Owner only, scoped by the existing PO workspace access rule.
- A non-PO actor with a revoked membership has zero workspace access. The Platform Owner follows the existing merged F3 platform-wide `app_private.has_workspace_access` PO rule (it grants Platform Owner access without a membership check; CN-MCQ-25; S40-PO-12 option A). Caller-supplied IDs cannot widen the scope.
- The authorization checks must not rely on UI hiding or the service-role client as a substitute for the signed-identity RLS boundary.

## Required future denial/allow tests

| Fixture / action | Expected |
| --- | --- |
| Trainer read and create for a client in the same workspace, not assigned to that Trainer | Allow |
| Workspace Owner / PO read and create in authorized scope | Allow |
| Platform Owner without a workspace membership row | Allow under the existing merged F3 platform-wide `app_private.has_workspace_access` PO rule (CN-MCQ-25; S40-PO-12) |
| Note author edit with active membership and an authorized role (Trainer or Workspace Owner) in the workspace | Allow |
| Note author whose current role is Sales, with active membership | Deny |
| Note author edit after membership revoked, before restoration | Deny |
| Note author edit after membership restored | Allow (CN-MCQ-05) |
| Other authorized non-PO edit (including Trainer or WO who did not author) | Deny |
| PO edit in PO scope | Allow |
| Any non-PO hard delete, including author | Deny |
| PO hard delete in PO scope | Allow |
| Sales / Client / anonymous, all operations | Deny |
| Revoked membership / non-PO, all operations | Deny |
| Trainer in workspace A accesses workspace B note or client in B | Deny |
| Forged workspace/client/author identity | Deny or ignore untrusted field; never widen |
| Body blank after trimming, or over 5,000 Unicode code points after trimming | Deny; no row persisted (CN-MCQ-02, CN-MCQ-14) |
| Body containing U+0000 | Deny; no row persisted; existing generic save-error state (row 18); no new copy (FR-002) |
| Body with leading or trailing whitespace and 1 to 5,000 code points after trimming | Allow; stored as the trimmed text (CN-MCQ-14; S37-PO-16) |
| Body of 5,000 code points plus leading or trailing whitespace | Allow; stored as the 5,000 code points without that whitespace (CN-MCQ-14) |
| Body with interior whitespace or line breaks | Allow; interior formatting stored unchanged (S37-PO-16) |
| Any stored note body with leading or trailing whitespace | Not persisted; the database boundary keeps only trimmed text (CN-MCQ-14) |
| Overlapping valid saves by the author or PO to one note (serialized by the database) | Both succeed; the later committed body is final; `created_at` and `author_user_id` unchanged; no version row; one audit event per successful save (CN-MCQ-11) |
| Direct UPDATE changing `id`, `workspace_id`, `client_id`, `author_user_id`, `created_at` or `idempotency_key`, by author (including an author authorized in two workspaces), Trainer, Workspace Owner or PO | Refuse; row unchanged (FR-003) |
| Author authorized in workspaces A and B edits a note in A, with the request naming B | Deny; no change (FR-005) |
| Audit write fails during a create, edit or hard delete | Mutation rolled back; no row change; no successful audit event (FR-010) |
| Rejected or denied write | No successful note-mutation event (`specs/005-audit-log` US1 scenario 2) |
| Audit event for a successful create, edit or hard delete | Contains only actor, workspace, client ID, note ID, action and timestamp; contains no body text (CN-MCQ-07) |
| Duplicate create with an already-used `(workspace_id, client_id, idempotency_key)` and the same trimmed body while the note is live | Return the existing note row; no second row; no second create audit event (FR-011; CN-MCQ-18) |
| Same-key create with a different trimmed body while the note is live | Refuse as a key/body mismatch; no second note, no body change, no create audit event (CN-MCQ-22; S40-R9) |
| Same-key retry after the note was hard-deleted | Return deleted/not-found regardless of the retry body; never recreate the note; no create audit event; the content-free key record survives with no body (CN-MCQ-20; S40-PO-6) |
| Same-key reconciliation retry when no content-free key record exists (the earlier retry never reached the server) | Follow the normal create path: create the first note and its one create audit event; never treat a missing record as a deleted/not-found or mismatch outcome (FR-007, FR-011) |
| Same-key retry after the note was edited | Compare against the original submission fingerprint, not the current edited body; a matching retry returns the existing note, a different trimmed body is a mismatch (FR-011; CN-MCQ-22; S40-R9) |
| Content-free create-idempotency record | Holds workspace/client scope, key, a required one-way fingerprint of the original trimmed body, and an outcome state; never the note body or note text (CN-MCQ-20, CN-MCQ-22) |
| Server-side pending note body for an unresolved create | No such record or column exists; only the content-free key record is stored, and the unresolved create's recovery state is device-local tab `sessionStorage`, or page memory only when storage is unavailable or its pre-dispatch write fails (CN-MCQ-24; S40-PO-12) |
| Recovery record after sign-out or account switch | Cleared; a different actor cannot read or retry it, including through direct `sessionStorage` access (CN-MCQ-24; FR-007) |
| Unknown operation/role/capability | Deny by default |

The future test suite must assert both database policy behavior and application/database matrix parity.
