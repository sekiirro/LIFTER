# Client Notes — Data Model (proposal)

This document describes a future schema only. It adds no SQL or migration file. Exact schema remains subject to PO decisions below and implementation-time scan of all origin refs.

## Existing model reused

- Staff roles are `platform_owner | workspace_owner | trainer | sales` in `public.staff_profiles`.
- `public.workspace_memberships` represents active workspace membership using `revoked_at IS NULL`; revoked membership is not authorization.
- `app_private.has_workspace_access(workspace_id, capability)` provides the established database workspace boundary. Its Platform Owner branch covers all workspaces; non-PO access requires current active membership and role capability.
- The existing client entity is `public.clients`, keyed by `id` and `workspace_id`, with a composite `(workspace_id,id)` unique key. Client scoped records use same-workspace composite relations.
- Existing app `authorize()` and database role/capability behavior remain the two independent walls.

## Proposed entity: ClientNote

One row represents one independent note. Proposed relation name: `public.client_notes` (subject to implementation review).

| Attribute | Proposed type/constraint | Source |
| --- | --- | --- |
| `id` | UUID primary key | Technical shape, subject to implementation review. |
| `workspace_id` | UUID, required | Tenant isolation requirement. |
| `client_id` | UUID, required; composite FK `(workspace_id, client_id) -> public.clients(workspace_id,id)` | Binds note to one client in one workspace. |
| `author_user_id` | UUID, required; references verified staff identity | PO requires author attribution. Never accepted from untrusted request input. |
| `body` | Plain text, maximum 5,000 characters | PO requirement. Character counting/empty handling: CN-MCQ-02. |
| `created_at` | Server-assigned timestamp, required | PO requires timestamp; recommendation that it marks creation is pending confirmation of any edit metadata (CN-MCQ-03). |
| `edited_at`, `edited_by` | Not specified | CN-MCQ-03; do not add until decided. |

No version table, soft-delete marker, or history table is proposed. An edit changes the current body in place. A hard delete removes the row. Whether audit events duplicate note data is CN-MCQ-07.

## Invariants

1. Every note belongs to exactly one workspace and one client in that workspace.
2. The authenticated actor determines author identity at creation; callers cannot forge workspace, client, or author scope.
3. Only current authorized actors can read/create within scope; edit requires current authorization plus original author identity or PO role.
4. Hard delete requires PO role plus workspace access under the existing PO model.
5. Database RLS is enabled and forced, with no anonymous privileges and deny-by-default policies. Mutation grants/RPC design must follow established security patterns at implementation time and be independently checked by RLS tests.
6. Preserve the current author/created timestamp for attribution; if PO chooses additional edit metadata, it does not create content history (CN-MCQ-03).
7. No design in this model selects note ordering, whitespace rules, collation/count function, audit retention, conflict behavior, or display copy.

## Planned migration description

A future forward-only migration may add the note relation, composite workspace/client integrity, grants/policies or hardened mutation functions, and any required authorization parity. No migration filename/version is specified in this spec-only PR. At implementation time, rescan every origin ref for the highest migration version and choose a unique version above it; current scan evidence is in the run report.
