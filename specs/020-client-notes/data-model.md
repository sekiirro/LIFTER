# Client Notes — Data Model (proposal)

This document describes a future schema only. It adds no SQL or migration file. Exact schema remains subject to the implementation-time scan of all origin refs. CN-MCQ-01..07 and CN-MCQ-09..12 are resolved by the PO (spec.md Clarifications); CN-MCQ-08, CN-MCQ-13 and CN-MCQ-14 remain PENDING-PO.

## Existing model reused

- Staff roles are `platform_owner | workspace_owner | trainer | sales` in `public.staff_profiles`.
- `public.workspace_memberships` represents active workspace membership using `revoked_at IS NULL`; revoked membership is not authorization.
- `app_private.has_workspace_access(workspace_id, capability)` provides the established database workspace boundary. Its Platform Owner branch covers all workspaces; non-PO access requires current active membership and role capability.
- The existing client entity is `public.clients`, keyed by `id` and `workspace_id`, with a composite `(workspace_id,id)` unique key. Client scoped records use same-workspace composite relations.
- Existing app `authorize()` and database role/capability behavior remain the two independent walls.
- Trainer access to notes is workspace-wide and is not restricted by client assignment (CN-MCQ-04, S37-PO-7).

## Proposed entity: ClientNote

One row represents one independent note. Proposed relation name: `public.client_notes` (subject to implementation review).

| Attribute | Proposed type/constraint | Source |
| --- | --- | --- |
| `id` | UUID primary key | Technical shape, subject to implementation review. Also the deterministic list tie-break. |
| `workspace_id` | UUID, required | Tenant isolation requirement. |
| `client_id` | UUID, required; composite FK `(workspace_id, client_id) -> public.clients(workspace_id,id)` | Binds note to one client in one workspace. |
| `author_user_id` | UUID, required; references verified staff identity | PO requires author attribution. Never accepted from untrusted request input. Retained, never nulled or deleted, when the author becomes unavailable (CN-MCQ-06). |
| `body` | Plain text, 1 to 5,000 Unicode code points; blank or whitespace-only rejected | FR-002 (CN-MCQ-02). Stored form (exact or trimmed) is PENDING-PO CN-MCQ-14. |
| `created_at` | Server-assigned timestamp, required; list ordering key, newest first | FR-008 (CN-MCQ-01). Never changed by an edit. |
| `edited_at` | Server-assigned timestamp, nullable; set on each successful edit | FR-003 (CN-MCQ-03). Null until the first edit. No `edited_by`: the PO answer keeps the original author, creation time and an edited time only. |

No version table, soft-delete marker, or history table is proposed. An edit changes the current body in place and sets `edited_at`. A hard delete removes the row. Audit events are separate from this row and carry metadata only (FR-010); their retention is PENDING-PO CN-MCQ-13.

## Invariants

1. Every note belongs to exactly one workspace and one client in that workspace.
2. The authenticated actor determines author identity at creation; callers cannot forge workspace, client, or author scope.
3. Read and create require a current authorized actor in the note's workspace: a Trainer (any client in the workspace), a Workspace Owner, or a Platform Owner under the existing PO scope. Edit requires the original author with current authorization (active membership and a role still authorized), or a Platform Owner in PO scope.
4. Hard delete requires PO role plus workspace access under the existing PO model.
5. Database RLS is enabled and forced, with no anonymous privileges and deny-by-default policies. Mutation grants/RPC design must follow established security patterns at implementation time and be independently checked by RLS tests.
6. `author_user_id` and `created_at` are immutable after creation. An edit changes `body` and `edited_at` only; no content history is kept (CN-MCQ-03).
7. List ordering is `created_at` descending with `id` as the deterministic tie-break; edits do not affect ordering (CN-MCQ-01). Length is counted in Unicode code points (CN-MCQ-02). Concurrent saves resolve as last save wins (CN-MCQ-11). Audit payloads never contain `body` (CN-MCQ-07). Stored body form and audit retention remain PENDING-PO (CN-MCQ-14, CN-MCQ-13). Display copy is PENDING-PO (CN-MCQ-08).

## Planned migration description

A future forward-only migration may add the note relation, composite workspace/client integrity, the `edited_at` column, grants/policies or hardened mutation functions, and any required authorization parity. No migration filename/version is specified in this spec-only PR. At implementation time, rescan every origin ref for the highest migration version and choose a unique version above it; current scan evidence is in the run report.
