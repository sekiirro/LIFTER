# Implementation Plan: F20 Client Notes

**Spec**: [spec.md](spec.md) | **Status**: Proposed; CN-MCQ-01..14 resolved by the PO (CN-MCQ-08 by S38-PO-2); CN-MCQ-15 removed by S38-R9; **no open ambiguities**; implementation is not authorized by this spec-only PR.

## Summary

Add independent plain-text notes to Client Details with a workspace/client composite scope and two authorization walls. Trainers (for any client in their workspace, regardless of assignment), Workspace Owners and Platform Owners may view and create within current authorized scope; only the note author with current active membership or the Platform Owner may edit; only the Platform Owner may hard-delete. Sales and Clients are denied. Edits are last save wins, audit is metadata only, and no version-history behavior is added.

## Technical context

- Next.js App Router, server-verified identity and existing application `authorize()`.
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership are authoritative.
- Reuse F3 `public.staff_profiles`, `public.workspace_memberships`, `app_private.has_workspace_access()`, approved `coaching_work` capability, and F11 `public.clients`.
- Follow current hardened database access patterns and keep app/database decisions in parity. Do not introduce a new role or weaken RLS.
- Historical origin scan (round 3, run report): highest `20261108021002` across 91 fetched origin refs. This figure is NOT relied upon. Any future migration requires a fresh scan of all origin refs immediately before selecting a unique forward-only version above the then-highest version, again immediately before the commit, and again before push. This proposal names no version and adds no SQL.

## Design

### Authorization and data

- Tenant entity proposal is in [data-model.md](data-model.md): a note row keyed to both `workspace_id` and `client_id`, with verified author, plain-text body, server creation timestamp and nullable `edited_at`.
- Read/create require a Trainer, Workspace Owner or Platform Owner with current authorization for the workspace. Trainers are not limited to assigned clients (CN-MCQ-04, S37-PO-6, S37-PO-7). PO follows the existing all-workspace policy.
- Author edit checks the original `author_user_id`, current authorization in the workspace (active membership and a role still authorized) and current scope. PO edit is also scoped through the existing PO access helper.
- Delete checks PO role and workspace scope at the database boundary. Non-PO delete is refused even when actor authored the note.
- RLS is deny-by-default. No anonymous grants. Define tests for allowed role × action pairs, Sales/Client/anonymous denial, revoked membership denial, and foreign-workspace denial.
- Body: all leading and trailing whitespace is removed, the result must be 1 to 5,000 Unicode code points, and the trimmed text is stored; interior formatting is preserved. A body blank after trimming is rejected (CN-MCQ-02, CN-MCQ-14; S37-PO-16).
- No version table/history. Edits are last save wins (CN-MCQ-11): the winner is the write the database commits last, and `edited_at` is set (CN-MCQ-03). `id`, `workspace_id`, `client_id`, `author_user_id` and `created_at` are immutable; a direct UPDATE changing any of them is refused.
- Audit: one metadata-only event per successful create, edit or hard delete (actor, workspace, client/note IDs, action, timestamp). Audit never stores note text, and no generic row-snapshot capture may store body content (CN-MCQ-07). Retention is the existing `public.audit_events` policy, inherited unchanged (CN-MCQ-13). The note mutation and its audit event share one database transaction (a failed audit write rolls the mutation back). Rejected or denied operations emit no successful note-mutation event (`specs/005-audit-log` US1 scenario 2).
- Ordering: `created_at` descending with `id` tie-break; edits do not reorder (CN-MCQ-01).
- Migration is described only: future additive/forward-only schema + indexes/constraints/policies or safe mutation functions, chosen after fresh all-origin-ref scan. No concrete version or SQL is authorized here.

### UI

- Surface: Client Details > separate Client Notes tab, independent of Exercise Library and Workout Planner.
- Tab placement: horizontal tab alongside the existing client profile tabs (CN-MCQ-09). Text-only, no icon (CN-MCQ-10).
- Follow DESIGN.md §3–6, §11–12 and existing design tokens/components: Geist for English, IBM Plex Sans Arabic for Arabic; support EN LTR and AR RTL; existing client-profile mobile pattern is horizontally scrollable tabs.
- Timestamps use the viewer's local time zone (CN-MCQ-12) in the CN-MCQ-08 row 29 format.
- Strings: only the approved CN-MCQ-08 table in spec.md (rows 1–29) is used; no other copy is added. Mixed-direction text uses the existing `Bidi` component (README.md).
- Do not invent colors, layout details, responsive breakpoints or token values. The Client Notes UI reuses existing Design System components and their existing values (S38-R9): the DESIGN.md §6 tabs pattern; the existing textarea, button, dialog, toast and States components; existing tokens and breakpoints. It introduces no new breakpoint, touch-size, focus or token value. A value that exists neither in DESIGN.md nor in an existing component becomes a PO question only when implementation needs it, under the frontend design gate.
- No motion is required or proposed.

## Implementation phases (future, after MCQ decisions)

1. Confirm zero open ambiguities by re-running Analyze before any implementation task (CN-MCQ-15 was removed by S38-R9; no open ambiguities remain).
2. Confirm authorization integration against current client detail permissions; define app/database capability parity and write contract.
3. Implement forward-only schema and RLS with a version chosen after required all-origin migration rescan.
4. Implement server actions/reads with verified actor and current client/workspace scope, last-save-wins edits and metadata-only audit.
5. Implement bilingual Client Notes tab using approved Design System components and approved copy.
6. Add integration/negative tests: every role × action, Sales/Client/anonymous, revoked membership and restored membership, forged IDs, immutable-column UPDATE refusal, cross-workspace reads/writes, Trainer cross-client allow, length and blank boundaries, ordering, overlapping saves with last committed write winning, author/PO edit, PO-only hard delete, audit rollback on audit failure, no version-history persistence, and audit payload without body text.
7. Run feature implementation gates from the applicable brief after Analyze revalidation.

## Risks and mitigations

- **Cross-workspace exposure**: composite client/workspace integrity plus two authorization walls and direct RLS negative coverage.
- **Role drift**: reuse the existing role matrix and assert app/database parity.
- **Attribution**: original author and creation timestamp are kept; edits set `edited_at` only.
- **Unapproved interaction/copy**: UI copy is only the approved CN-MCQ-08 table; design values come only from the reused Design System components (S38-R9); no icon is used.
- **Audit/content duplication**: audit payload is metadata only (CN-MCQ-07); a generic row-snapshot audit must not store body text. Retention is inherited from `public.audit_events` (CN-MCQ-13); the existing period stays open as DP-02.

## PO decisions

- Resolved: CN-MCQ-01..14 (spec.md Clarifications; S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 and S38-PO-2).
- Open: none. CN-MCQ-15 (DESIGN.md §11 UI values) was removed by architect ruling S38-R9; the design-system reuse rule is recorded in spec.md FR-006 and FR-007.
