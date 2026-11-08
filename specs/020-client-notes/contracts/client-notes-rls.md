# Client Notes Database/RLS Contract (proposed)

No SQL or migration is supplied by this document. The following acceptance contract governs a future design.

## Scope and policy

- Every note has a non-null `workspace_id` and `client_id`; same-workspace composite integrity binds it to `public.clients`.
- RLS is ENABLED and FORCED. Policies default to deny. No anonymous note privileges.
- Read and create allow only the authorized Trainer, Workspace Owner or Platform Owner in current scope; Sales and Client are denied.
- Edit allows original `author_user_id` or Platform Owner, only when actor also has current authorization and workspace scope.
- Delete allows Platform Owner only, scoped by the existing PO workspace access rule.
- Revoked memberships confer zero workspace access. Caller-supplied IDs cannot widen the scope.
- The authorization checks must not rely on UI hiding or the service-role client as a substitute for the signed-identity RLS boundary.

## Required future denial/allow tests

| Fixture / action | Expected |
| --- | --- |
| Trainer / WO / PO read and create in authorized scope | Allow |
| Note author edit in authorized scope | Allow |
| Other authorized non-PO edit | Deny |
| PO edit in PO scope | Allow |
| Any non-PO hard delete, including author | Deny |
| PO hard delete in PO scope | Allow |
| Sales / Client / anonymous, all operations | Deny |
| Revoked membership / non-PO, all operations | Deny |
| Workspace A actor accesses workspace B note or client in B | Deny |
| Forged workspace/client/author identity | Deny or ignore untrusted field; never widen |
| Unknown operation/role/capability | Deny by default |

The future test suite must assert both database policy behavior and application/database matrix parity.
