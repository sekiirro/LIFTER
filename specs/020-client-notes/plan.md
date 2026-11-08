# Implementation Plan: F20 Client Notes

**Spec**: [spec.md](spec.md) | **Status**: Proposed; CN-MCQ-01..07 and CN-MCQ-09..12 resolved by the PO; CN-MCQ-08, CN-MCQ-13, CN-MCQ-14 PENDING-PO; implementation is not authorized by this spec-only PR.

## Summary

Add independent plain-text notes to Client Details with a workspace/client composite scope and two authorization walls. Trainers (for any client in their workspace, regardless of assignment), Workspace Owners and Platform Owners may view and create within current authorized scope; only the note author with current active membership or the Platform Owner may edit; only the Platform Owner may hard-delete. Sales and Clients are denied. Edits are last save wins, audit is metadata only, and no version-history behavior is added.

## Technical context

- Next.js App Router, server-verified identity and existing application `authorize()`.
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership are authoritative.
- Reuse F3 `public.staff_profiles`, `public.workspace_memberships`, `app_private.has_workspace_access()`, approved `coaching_work` capability, and F11 `public.clients`.
- Follow current hardened database access patterns and keep app/database decisions in parity. Do not introduce a new role or weaken RLS.
- Current origin migration scan highest: `20261108021002` across 91 fetched origin refs (see run report). A future implementation must rescan all origin refs immediately before selecting a unique forward-only migration version greater than the then-highest version. This proposal names no version and adds no SQL.

## Design

### Authorization and data

- Tenant entity proposal is in [data-model.md](data-model.md): a note row keyed to both `workspace_id` and `client_id`, with verified author, plain-text body, server creation timestamp and nullable `edited_at`.
- Read/create require a Trainer, Workspace Owner or Platform Owner with current authorization for the workspace. Trainers are not limited to assigned clients (CN-MCQ-04, S37-PO-6, S37-PO-7). PO follows the existing all-workspace policy.
- Author edit checks the original `author_user_id`, current active membership in the workspace and current scope. PO edit is also scoped through the existing PO access helper.
- Delete checks PO role and workspace scope at the database boundary. Non-PO delete is refused even when actor authored the note.
- RLS is deny-by-default. No anonymous grants. Define tests for allowed role × action pairs, Sales/Client/anonymous denial, revoked membership denial, and foreign-workspace denial.
- Body is 1 to 5,000 Unicode code points; blank and whitespace-only bodies are rejected (CN-MCQ-02). Stored form (exact or trimmed) is pending CN-MCQ-14.
- No version table/history. Edits are last save wins (CN-MCQ-11) and set `edited_at` (CN-MCQ-03).
- Audit: one metadata-only event per successful create, edit or hard delete (actor, workspace, client/note IDs, action, timestamp). Audit never stores note text, and no generic row-snapshot capture may store body content (CN-MCQ-07). Retention is pending CN-MCQ-13.
- Ordering: `created_at` descending with `id` tie-break; edits do not reorder (CN-MCQ-01).
- Migration is described only: future additive/forward-only schema + indexes/constraints/policies or safe mutation functions, chosen after fresh all-origin-ref scan. No concrete version or SQL is authorized here.

### UI

- Surface: Client Details > separate Client Notes tab, independent of Exercise Library and Workout Planner.
- Tab placement: horizontal tab alongside the existing client profile tabs (CN-MCQ-09). Text-only, no icon (CN-MCQ-10).
- Follow DESIGN.md §3–6, §11–12 and existing design tokens/components: Geist for English, IBM Plex Sans Arabic for Arabic; support EN LTR and AR RTL; existing client-profile mobile pattern is horizontally scrollable tabs.
- Timestamps use the viewer's local time zone (CN-MCQ-12); display format is part of CN-MCQ-08.
- Do not invent colors, layout details, responsive breakpoints, or strings. Tab label, state messages, Arabic strings, “edited” and “Unavailable author” labels and timestamp format are PENDING-PO CN-MCQ-08. DESIGN.md §11 gaps stay blocked until approved.
- No motion is required or proposed.
- The required “Add New Note” English action wording is preserved; all other feature-specific copy is pending CN-MCQ-08.

## Implementation phases (future, after MCQ decisions)

1. Close PO decisions CN-MCQ-08, -13 and -14 and update spec/plan/contracts; rerun Analyze.
2. Confirm authorization integration against current client detail permissions; define app/database capability parity and write contract.
3. Implement forward-only schema and RLS with a version chosen after required all-origin migration rescan.
4. Implement server actions/reads with verified actor and current client/workspace scope, last-save-wins edits and metadata-only audit.
5. Implement bilingual Client Notes tab using approved Design System components and approved copy.
6. Add integration/negative tests: every role × action, Sales/Client/anonymous, revoked membership and restored membership, forged IDs, cross-workspace reads/writes, Trainer cross-client allow, length and blank boundaries, ordering, last save wins, author/PO edit, PO-only hard delete, no version-history persistence, and audit payload without body text.
7. Run feature implementation gates from the applicable brief after Analyze revalidation.

## Risks and mitigations

- **Cross-workspace exposure**: composite client/workspace integrity plus two authorization walls and direct RLS negative coverage.
- **Role drift**: reuse the existing role matrix and assert app/database parity.
- **Attribution**: original author and creation timestamp are kept; edits set `edited_at` only.
- **Unapproved interaction/copy**: keep UI copy bound to CN-MCQ-08 and DESIGN.md; no icon is used.
- **Audit/content duplication**: audit payload is metadata only (CN-MCQ-07); a generic row-snapshot audit must not store body text. Retention is pending CN-MCQ-13.

## PO decisions

- Resolved: CN-MCQ-01..07 and CN-MCQ-09..12 (spec.md Clarifications, S37-PO-6 and S37-PO-7).
- Open: CN-MCQ-08 (copy approval), CN-MCQ-13 (audit retention), CN-MCQ-14 (stored body form). Implementation tasks that depend on them remain blocked, as named in tasks.md.
