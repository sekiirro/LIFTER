# Client Notes — Data Model (proposal)

This document describes a future schema only. It adds no SQL or migration file. Exact schema remains subject to the implementation-time scan of all origin refs. CN-MCQ-01..14 are resolved by the PO (spec.md Clarifications, including S37-PO-14, S37-PO-16 and the S38-PO-2 copy table). CN-MCQ-15 (DESIGN.md §11 UI values) was removed by S38-R9. CN-MCQ-16 (exit-protection copy, not a data-model item) is RESOLVED by S38-PO-10 and S38-PO-11 (rows 30–33). CN-MCQ-17 (Discard with an in-flight save) is RESOLVED by S39-PO-8. CN-MCQ-18 (idempotent create with DB-level duplicate prevention) is RESOLVED by S39-PO-9. CN-MCQ-19 (in-flight warning copy) is RESOLVED by S40-PO-3, option Variant 1 (Recommended), and is a copy row (spec.md row 34), not a data-model item.

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
| `body` | Plain text, stored trimmed of all leading and trailing whitespace; 1 to 5,000 Unicode code points after trimming; blank after trimming rejected | FR-002 (CN-MCQ-02, CN-MCQ-14; S37-PO-16). Interior formatting is preserved. |
| `created_at` | Server-assigned timestamp, required; list ordering key, newest first | FR-008 (CN-MCQ-01). Never changed by an edit. |
| `edited_at` | Server-assigned timestamp, nullable; set on each successful edit | FR-003 (CN-MCQ-03). Null until the first edit. No `edited_by`: the PO answer keeps the original author, creation time and an edited time only. |
| `idempotency_key` | Client-generated key, required; unique together with `workspace_id` and `client_id` | FR-011 (CN-MCQ-18; S39-PO-9). Generated once per create and re-sent unchanged on every retry. A duplicate create in the same workspace/client scope returns the existing note row instead of inserting a second one. Never accepted as actor or scope proof. |

No version table, soft-delete marker, or history table is proposed. An edit changes the current body in place and sets `edited_at`. A hard delete removes the row. Audit events are separate from this row and carry metadata only (FR-010); their retention is the existing `public.audit_events` policy, inherited unchanged (CN-MCQ-13).

## Invariants

1. Every note belongs to exactly one workspace and one client in that workspace.
2. The authenticated actor determines author identity at creation; callers cannot forge workspace, client, or author scope.
3. Read and create require a current authorized actor in the note's workspace: a Trainer (any client in the workspace), a Workspace Owner, or a Platform Owner under the existing PO scope. Edit requires the original author with current authorization (active membership and a role still authorized), or a Platform Owner in PO scope.
4. Hard delete requires PO role plus workspace access under the existing PO model.
5. Database RLS is enabled and forced, with no anonymous privileges and deny-by-default policies. Mutation grants/RPC design must follow established security patterns at implementation time and be independently checked by RLS tests.
6. `id`, `workspace_id`, `client_id`, `author_user_id` and `created_at` are immutable after creation. An edit changes `body` and `edited_at` only; a direct UPDATE that changes any immutable column is refused by the database. No content history is kept (CN-MCQ-03).
7. List ordering is `created_at` descending with `id` as the deterministic tie-break; edits do not affect ordering (CN-MCQ-01). Length is counted in Unicode code points after trimming (CN-MCQ-02, CN-MCQ-14). Concurrent saves resolve as last save wins, where the winner is the write the database commits last (CN-MCQ-11). Audit payloads never contain `body` (CN-MCQ-07). Audit retention is inherited unchanged (CN-MCQ-13). Display copy is the approved CN-MCQ-08 table (S38-PO-2).
8. The stored `body` never has leading or trailing whitespace. Trimming happens before the length count, so a body of 5,000 code points with surrounding whitespace is accepted and stored as those 5,000 code points (CN-MCQ-14; S37-PO-16).
9. Every create carries a client-generated `idempotency_key`, and `(workspace_id, client_id, idempotency_key)` is unique. A duplicate create that reuses the key returns the existing note row and creates no second note or second create audit event (CN-MCQ-18; FR-011). The same key in a different workspace/client scope is a different key space.

## Planned migration description

A future forward-only migration may add the note relation, composite workspace/client integrity, the `edited_at` column, the `idempotency_key` column with its `(workspace_id, client_id, idempotency_key)` unique constraint, grants/policies or hardened mutation functions, and any required authorization parity. No migration filename/version is specified in this spec-only PR. At implementation time, rescan every origin ref for the highest migration version and choose a unique version above it; current scan evidence is in the run report.
