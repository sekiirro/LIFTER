# Client Notes Database/RLS Contract (proposed)

No SQL or migration is supplied by this document. The following acceptance contract governs a future design.

## Scope and policy

- Every note has a non-null `workspace_id` and `client_id`; same-workspace composite integrity binds it to `public.clients`.
- RLS is ENABLED and FORCED. Policies default to deny. No anonymous note privileges.
- Read and create allow a Trainer (any client in the workspace, regardless of client assignment), a Workspace Owner, or a Platform Owner, each with current active membership in the workspace or PO scope. Sales and Client are denied.
- Edit allows the original `author_user_id` only with current authorization in the note's workspace (active membership and a role still authorized, for example Trainer or Workspace Owner), or a Platform Owner in PO scope.
- Delete allows Platform Owner only, scoped by the existing PO workspace access rule.
- Revoked memberships confer zero workspace access. Caller-supplied IDs cannot widen the scope.
- The authorization checks must not rely on UI hiding or the service-role client as a substitute for the signed-identity RLS boundary.

## Required future denial/allow tests

| Fixture / action | Expected |
| --- | --- |
| Trainer read and create for a client in the same workspace, not assigned to that Trainer | Allow |
| Workspace Owner / PO read and create in authorized scope | Allow |
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
| Body blank, whitespace-only, or over 5,000 Unicode code points | Deny; no row persisted |
| Two valid saves to one note | Both succeed in order; final body is the last save; `created_at` and `author_user_id` unchanged; no version row (CN-MCQ-11) |
| Audit event for a successful create, edit or hard delete | Contains only actor, workspace, client ID, note ID, action and timestamp; contains no body text (CN-MCQ-07) |
| Unknown operation/role/capability | Deny by default |

The future test suite must assert both database policy behavior and application/database matrix parity.
