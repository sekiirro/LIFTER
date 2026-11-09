# Implementation Plan: F20 Client Notes

**Spec**: [spec.md](spec.md) | **Status**: Proposed; CN-MCQ-01..14 resolved by the PO (CN-MCQ-08 by S38-PO-2); CN-MCQ-16 resolved by S38-PO-10 and S38-PO-11 (exit-protection copy rows 30-33; no Save Draft); CN-MCQ-17 resolved by S39-PO-8 (Discard leaves; no cancellation claim for an in-flight save); CN-MCQ-18 resolved by S39-PO-9 (idempotent save/retry with DB-level duplicate prevention); CN-MCQ-19 resolved by S40-PO-3 (in-flight exit-warning body row 34, key `clientNotes.exitWarning.bodyInFlight`); CN-MCQ-20 and CN-MCQ-21 resolved by S40-PO-6 (content-free idempotency record survives a hard delete; note field read-only while a save is in flight); CN-MCQ-22 ruled by architect ruling S40-R9 (same-key retry with a different body is a key/body mismatch); CN-MCQ-15 removed by S38-R9; no open F20 PO question and no open behavioural ambiguity in the approved behaviour; implementation is not authorized by this spec-only PR.

## Summary

Add independent plain-text notes to Client Details with a workspace/client composite scope and two authorization walls. Trainers (for any client in their workspace, regardless of assignment), Workspace Owners and Platform Owners may view and create within current authorized scope; only the note author with current active membership or the Platform Owner may edit; only the Platform Owner may hard-delete. Sales and Clients are denied. Creates are idempotent per client-generated key, edits are last save wins, audit is metadata only, and no version-history behavior is added.

## Technical context

- Next.js App Router, server-verified identity and existing application `authorize()`.
- Supabase Postgres with RLS enabled and forced; signed identity and active workspace membership are authoritative.
- Reuse F3 `public.staff_profiles`, `public.workspace_memberships`, `app_private.has_workspace_access()`, approved `coaching_work` capability, and F11 `public.clients`.
- Follow current hardened database access patterns and keep app/database decisions in parity. Do not introduce a new role or weaken RLS.
- Historical origin scan (round 3, run report): highest `20261108021002` across 91 fetched origin refs. This figure is NOT relied upon. Any future migration requires a fresh scan of all origin refs immediately before selecting a unique forward-only version above the then-highest version, again immediately before the commit, and again before push. This proposal names no version and adds no SQL.

## Design

### Authorization and data

- Tenant entity proposal is in [data-model.md](data-model.md): a note row keyed to both `workspace_id` and `client_id`, with verified author, plain-text body, server creation timestamp, nullable `edited_at` and a client-generated `idempotency_key` unique with the workspace/client scope (FR-011).
- Read/create require a Trainer, Workspace Owner or Platform Owner with current authorization for the workspace. Trainers are not limited to assigned clients (CN-MCQ-04, S37-PO-6, S37-PO-7). PO follows the existing all-workspace policy.
- Author edit checks the original `author_user_id`, current authorization in the workspace (active membership and a role still authorized) and current scope. PO edit is also scoped through the existing PO access helper.
- Delete checks PO role and workspace scope at the database boundary. Non-PO delete is refused even when actor authored the note.
- RLS is deny-by-default. No anonymous grants. Define tests for allowed role × action pairs, Sales/Client/anonymous denial, non-PO revoked membership denial, and foreign-workspace denial.
- Body: all leading and trailing whitespace is removed, the result must be 1 to 5,000 Unicode code points, and the trimmed text is stored; interior formatting is preserved. A body blank after trimming is rejected (CN-MCQ-02, CN-MCQ-14; S37-PO-16).
- Create idempotency (CN-MCQ-18; S39-PO-9; CN-MCQ-20; S40-PO-6; CN-MCQ-22; S40-R9; architect mapping/ruling, not PO words): the client generates one idempotency key per note create and re-sends the same key and the same body on every retry of that create. The database enforces uniqueness of `(workspace_id, client_id, idempotency_key)` in a content-free create-idempotency record that survives a note hard delete and holds no body or note text; a one-way body fingerprint may be used to detect a body mismatch. A duplicate create that reuses the key with the same body returns the existing note row instead of inserting a second note; the created note keeps exactly one create audit event under FR-010. A same-key create with a different body is rejected as a key/body mismatch with no second note, no body change and no create audit event. After a hard delete, a same-key retry returns a deleted/not-found outcome and never recreates the note. The key is not an authorization factor and never substitutes for the verified actor or the workspace/client scope. This PR adds no migration file or version.
- No version table/history. Edits are last save wins (CN-MCQ-11): the winner is the write the database commits last, and `edited_at` is set (CN-MCQ-03). `id`, `workspace_id`, `client_id`, `author_user_id` and `created_at` are immutable; a direct UPDATE changing any of them is refused.
- Audit: one metadata-only event per successful create, edit or hard delete (actor, workspace, client/note IDs, action, timestamp). Audit never stores note text, and no generic row-snapshot capture may store body content (CN-MCQ-07). Retention is the existing `public.audit_events` policy, inherited unchanged (CN-MCQ-13). The note mutation and its audit event share one database transaction (a failed audit write rolls the mutation back). Rejected or denied operations emit no successful note-mutation event (`specs/005-audit-log` US1 scenario 2).
- Ordering: `created_at` descending with `id` tie-break; edits do not reorder (CN-MCQ-01).
- Migration is described only: future additive/forward-only schema + indexes/constraints/policies or safe mutation functions, chosen after fresh all-origin-ref scan. No concrete version or SQL is authorized here.

### UI

- Surface: Client Details > separate Client Notes tab, independent of Exercise Library and Workout Planner.
- Tab placement: horizontal tab alongside the existing client profile tabs (CN-MCQ-09). Text-only, no icon (CN-MCQ-10).
- Follow DESIGN.md §3–6, §11–12 and existing design tokens/components: Geist for English, IBM Plex Sans Arabic for Arabic; support EN LTR and AR RTL; existing client-profile mobile pattern is horizontally scrollable tabs.
- Timestamps use the viewer's local time zone (CN-MCQ-12) in the CN-MCQ-08 row 29 format.
- Strings: only the approved CN-MCQ-08 table in spec.md (rows 1–29), the approved CN-MCQ-16 table (rows 30–33) and the approved CN-MCQ-19 row 34 are used; no other copy is added. Mixed-direction text uses the existing `Bidi` component (README.md).
- Do not invent colors, layout details, responsive breakpoints or token values. The Client Notes UI reuses existing Design System components and their existing values (S38-R9): the DESIGN.md §6 tabs pattern; the existing textarea, button, dialog, toast and States components; existing tokens and breakpoints. It introduces no new breakpoint, touch-size, focus or token value. A value that exists neither in DESIGN.md nor in an existing component becomes a PO question only when implementation needs it, under the frontend design gate.
- Exit protection (DESIGN.md §5, Q54; spec.md FR-007): an editor with unsaved create or edit text shows a Stay/Discard warning on exit, using the CN-MCQ-16 strings (rows 30-33) and no Save Draft. Discard leaves the editor and discards only text that has not been submitted. A save already submitted is not cancelled: the server commits or refuses it, and a committed save keeps its row and its one audit event (CN-MCQ-17; S39-PO-8). Browser close/reload uses the browser's built-in warning (its text cannot be customized).
- In-flight warning body (CN-MCQ-19; S40-PO-3, option Variant 1 (Recommended)): when a create or edit save is already in flight, the warning body uses CN-MCQ-19 row 34, i18n key `clientNotes.exitWarning.bodyInFlight`, approved byte-exact: EN “Your note is being saved. Leaving now won't cancel the save.” / AR “ملاحظتك بتتحفظ. لو خرجت دلوقتي، الحفظ مش هيتلغي.”. It states that leaving cannot cancel the save already sent. Rows 30-33 are unchanged: row 31 (body) applies only to text that has not been submitted, while rows 30, 32 and 33 (title, Stay, Discard) also label the in-flight warning. While a save is in flight the note field is read-only, so only row 34 applies in that state and no combined warning state exists (CN-MCQ-21; S40-PO-6 option A).
- No motion is required or proposed.

## Implementation phases (future, after MCQ decisions)

1. (Done in round 6: CN-MCQ-16 resolved by S38-PO-10 and S38-PO-11; spec/plan/tasks updated; Analyze re-run with zero open ambiguities. Round 7: CN-MCQ-17 resolved by S39-PO-8; Discard and in-flight-save wording aligned in spec/plan/tasks/contracts; Analyze re-run. Round 8: CN-MCQ-18 resolved by S39-PO-9 and encoded in spec/plan/tasks/contracts; CN-MCQ-19 direction approved by S39-PO-9. Round 9: CN-MCQ-19 exact copy resolved by S40-PO-3 and encoded byte-exact as spec.md row 34, key `clientNotes.exitWarning.bodyInFlight`, in spec/plan/tasks/contracts; Analyze re-run. Round 10: CN-MCQ-20 and CN-MCQ-21 resolved by S40-PO-6 and CN-MCQ-22 ruled by S40-R9, encoded in spec/plan/tasks/contracts/data-model; Analyze re-run.) Implementation still requires its own approval before any implementation task.
2. Confirm authorization integration against current client detail permissions; define app/database capability parity and write contract.
3. Implement forward-only schema and RLS with a version chosen after required all-origin migration rescan.
4. Implement server actions/reads with verified actor and current client/workspace scope, idempotent create (same-key/same-body returns the existing note; same-key/different-body is a mismatch refusal; a retry after a hard delete returns deleted/not-found and never recreates the note), last-save-wins edits and metadata-only audit.
5. Implement bilingual Client Notes tab using approved Design System components and approved copy.
6. Add integration/negative tests: every role × action, Sales/Client/anonymous, revoked membership and restored membership, forged IDs, immutable-column UPDATE refusal, cross-workspace reads/writes, Trainer cross-client allow, length and blank boundaries, create idempotency (same-key retry/duplicate returns the existing note, no second row or audit event; same-key different-body mismatch refusal; retry after a hard delete returns deleted/not-found and never recreates, with the content-free record surviving), ordering, overlapping saves with last committed write winning, author/PO edit, PO-only hard delete, audit rollback on audit failure, no version-history persistence, and audit payload without body text; plus the read-only-while-in-flight UI test.
7. Run feature implementation gates from the applicable brief after Analyze revalidation.

## Risks and mitigations

- **Cross-workspace exposure**: composite client/workspace integrity plus two authorization walls and direct RLS negative coverage.
- **Role drift**: reuse the existing role matrix and assert app/database parity.
- **Attribution**: original author and creation timestamp are kept; edits set `edited_at` only.
- **Duplicate note on retry**: a client-generated idempotency key plus the `(workspace_id, client_id, idempotency_key)` unique constraint on a content-free record that survives a hard delete returns the existing note on a duplicate create; a same-key different-body retry is a mismatch refusal; a retry after a hard delete returns deleted/not-found and never recreates the note; tests cover retry without an observable result, duplicate-key reuse, mismatch, retry after delete and the same key in another workspace/client scope (CN-MCQ-18, CN-MCQ-20, CN-MCQ-22; FR-011; S40-PO-6; S40-R9).
- **Unapproved interaction/copy**: UI copy is only the approved CN-MCQ-08 table (rows 1-29), CN-MCQ-16 table (rows 30-33) and CN-MCQ-19 row 34; no other string is implemented or guessed; design values come only from the reused Design System components (S38-R9); no icon is used.
- **Overpromised exit outcome**: the exit-protection wording claims only what is decided: unsubmitted text is discarded, and a submitted save is never cancelled but takes the server result (committed or refused) with its audit event (CN-MCQ-17; S39-PO-8). The note field is read-only while a save is in flight, so no combined pending/unsubmitted warning state is promised (CN-MCQ-21; S40-PO-6).
- **Audit/content duplication**: audit payload is metadata only (CN-MCQ-07); a generic row-snapshot audit must not store body text. Retention is inherited from `public.audit_events` (CN-MCQ-13); the existing period stays open as DP-02.

## PO decisions

- Resolved: CN-MCQ-01..14 (spec.md Clarifications; S37-PO-6, S37-PO-7, S37-PO-14, S37-PO-16 and S38-PO-2).
- Resolved: CN-MCQ-16 (exit-protection copy rows 30-33; Save Draft not offered) by S38-PO-10 and S38-PO-11.
- Resolved: CN-MCQ-17 (Discard leaves; a submitted save is not cancelled and takes the server result) by S39-PO-8.
- Resolved: CN-MCQ-18 (client-generated idempotency key per create; DB unique constraint makes a duplicate create return the existing note) by S39-PO-9.
- Resolved: CN-MCQ-19 (in-flight exit-warning body must say that leaving cannot cancel a save already sent) by S40-PO-3, option Variant 1 (Recommended); exact EN/Egyptian Arabic strings encoded byte-exact as spec.md row 34, key `clientNotes.exitWarning.bodyInFlight`.
- Resolved: CN-MCQ-20 (a content-free idempotency record survives a hard delete; a same-key retry returns deleted/not-found and never recreates the note) and CN-MCQ-21 (the note field is read-only while a save is in flight; only row 34 applies) by S40-PO-6, options A.
- Ruled: CN-MCQ-22 (a same-key retry carrying a different body is rejected as a key/body mismatch, with no second note, no body change and no create audit event) by architect ruling S40-R9, option A (not a PO question).
- Removed: CN-MCQ-15 (DESIGN.md §11 UI values) by architect ruling S38-R9; the design-system reuse rule is recorded in spec.md FR-006 and FR-007.
