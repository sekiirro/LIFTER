# Implementation Plan: F20 Client Notes

**Spec**: [spec.md](spec.md) | **Status**: Proposed; CN-MCQ-01..12 PENDING-PO; implementation is not authorized by this spec-only PR.

## Summary

Add independent plain-text notes to Client Details with a workspace/client composite scope and two authorization walls. Trainers, Workspace Owners and Platform Owners may view/create within current authorized scope; only the note author or Platform Owner may edit; only Platform Owner may hard-delete. Sales and Clients are denied. No version-history behavior is added.

## Technical context

- Next.js App Router, server-verified identity and existing application `authorize()`.
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership are authoritative.
- Reuse F3 `public.staff_profiles`, `public.workspace_memberships`, `app_private.has_workspace_access()`, approved `coaching_work` capability, and F11 `public.clients`.
- Follow current hardened database access patterns and keep app/database decisions in parity. Do not introduce a new role or weaken RLS.
- Current origin migration scan highest: `20261108021002` across 91 fetched origin refs (see run report). A future implementation must rescan all origin refs immediately before selecting a unique forward-only migration version greater than the then-highest version. This proposal names no version and adds no SQL.

## Design

### Authorization and data

- Tenant entity proposal is in [data-model.md](data-model.md): a note row keyed to both `workspace_id` and `client_id`, with verified author, plain-text body and server timestamp.
- Read/create require one of the PO-approved roles and current authorization for the client and workspace. PO follows the existing all-workspace policy. Author edit checks both original `author_user_id` and current authorized scope; PO edit is also scoped through the existing PO access helper.
- Delete checks PO role and workspace scope at the database boundary. Non-PO delete is refused even when actor authored the note.
- RLS is deny-by-default. No anonymous grants. Define tests for allowed role × action pairs, Sales/Client/anonymous denial, revoked membership denial, and foreign-workspace denial.
- Body length is capped at 5,000 chars. Exact count unit and empty-input treatment remain CN-MCQ-02.
- No version table/history. No audit contract is selected; CN-MCQ-07 remains open.
- Migration is described only: future additive/forward-only schema + indexes/constraints/policies or safe mutation functions, chosen after fresh all-origin-ref scan. No concrete version or SQL is authorized here.

### UI

- Surface: Client Details > separate Client Notes tab, independent of Exercise Library and Workout Planner.
- Follow DESIGN.md §3–6, §11–12 and existing design tokens/components: Geist for English, IBM Plex Sans Arabic for Arabic; support EN LTR and AR RTL; existing client-profile mobile pattern is horizontally scrollable tabs.
- Do not invent colors, layout details, responsive breakpoints, icon, navigation order, or strings. DESIGN.md §11 gaps and feature-specific details stay as CN-MCQ-08..10. Any design choice needed to render a later implementation must be approved first.
- No motion is required or proposed.
- The required “Add New Note” English action wording is preserved; all other feature-specific copy is pending CN-MCQ-08.

## Implementation phases (future, after MCQ decisions)

1. Close PO decisions and update spec/plan/contracts; rerun Analyze.
2. Confirm authorization integration against current client detail permissions; define app/database capability parity and write contract.
3. Implement forward-only schema and RLS with a version chosen after required all-origin migration rescan.
4. Implement server actions/reads with verified actor and current client/workspace scope.
5. Implement bilingual Client Notes tab using approved Design System components and approved copy.
6. Add integration/negative tests: every role × action, Sales/Client/anonymous, revoked membership, forged IDs, cross-workspace reads/writes, length boundary, author/PO edit, PO-only hard delete, and no version-history persistence.
7. Run feature implementation gates from the applicable brief after Analyze revalidation.

## Risks and mitigations

- **Cross-workspace exposure**: composite client/workspace integrity plus two authorization walls and direct RLS negative coverage.
- **Role drift**: reuse the existing role matrix and assert app/database parity.
- **Attribution ambiguity**: preserve verified author and creation timestamp; additional edited metadata awaits CN-MCQ-03.
- **Unapproved interaction/copy**: keep UI specifics as MCQs and bind implementation to DESIGN.md.
- **Audit/content duplication**: no audit payload/retention behavior is invented; resolve CN-MCQ-07 before implementation.

## PO decisions required

CN-MCQ-01..12 in [spec.md](spec.md). Implementation tasks dependent on those decisions must remain blocked. No open ambiguities are represented as settled.
