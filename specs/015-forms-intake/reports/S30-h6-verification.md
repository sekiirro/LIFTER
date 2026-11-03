# S30 F15 h6 verification

## Scope and entry gate

- Branch `015-forms-intake`, PR #44, base `015-forms-assets`; reviewed commit: `5084916469414ca743afe980e31c69cf593587fe`; correction commit: `ba357f4b34edc5b757919d0b5e925f92564b1810`.
- This round is restricted to the approved PO S29-PO-3 Q6 exception: CodeRabbit/CI corrections on this existing open PR. No new feature tasks are started.
- Spec Kit Analyze: **FAIL for this round** per architect handoff: one HIGH finding, T049 missing FR tag, is being repaired by compliance lane `sk-015-r3`. The checked-in `specs/015-forms-intake/checklists/analyze.md` is dated 2026-10-30 and says zero HIGH findings, so it does not reflect that newer report. The Q6 review-fix exception is the only basis for continuing. Product decisions remain escalated.
- Existing spec contract has FRs/SCs/scenarios for affected intake, correction, submission, validation, retention, and builder behavior; no changes to spec/plan/tasks are planned.

## CodeRabbit review on 5084916

GraphQL returned 17 threads, all unresolved and all anchored to `5084916469414ca743afe980e31c69cf593587fe`; two reviews are `CHANGES_REQUESTED` (04:07:53Z, 04:09:00Z). The full thread payload is preserved at the run directory's `review-threads.json`.

| Thread | Path:line | Class | Disposition | Reply / resolution |
|---|---|---|---|
| PRRT_kwDOVYgYQ86y-b4x | `app/register/[token]/SignupForm.tsx:234` | ACTIONABLE-in-scope | Fix local name error association and clear/refresh on edit. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b42 | `components/forms/FormPreview.tsx:61` | ACTIONABLE-in-scope | Match preview `contains` evaluation to runtime array membership. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b4_ | `components/forms/QuestionFlow.tsx:231` | ACTIONABLE-in-scope | Keep correction writes on explicit submit only. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5E | `components/forms/QuestionFlow.tsx:453` | ACTIONABLE-in-scope | Sync revision ref after successful submit/correction. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5I | `lib/forms/submissions.ts:35` | ACTIONABLE-in-scope | Strip localized `title`/`description` before shared validator. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5N | `lib/forms/submissions.ts:56` | ACTIONABLE-in-scope; DB portion blocked | FR-006 rejects the three-section requirement. TS and SQL changes must land atomically; a new valid-timestamp migration cannot be allocated because current date is 2026-11-03 and branch latest migration is 20261107000000. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5Q | `lib/forms/telegram-delivery.ts:18` | PO-DECISION-NEEDED | Missing inbox route; adding a staff destination/surface exceeds this review-only correction and needs product/UX scope. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5X | `specs/015-forms-intake/spec.md:342` | PO-DECISION-NEEDED | English prompt for N07 training timing needs approved copy; do not invent/commit the suggested translation. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5h | `supabase/migrations/20261104013000_f15_immutable_answer_corrections.sql:75` | ACTIONABLE-in-scope; migration blocked | New validation requires a forward migration; cannot edit pushed migration or allocate a valid later timestamp today. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5o | `supabase/migrations/20261104015000_f15_immutable_answer_revisions.sql:8` | ACTIONABLE-in-scope; migration blocked | Security-definer trigger authorization fix requires a forward migration; same timestamp blocker. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b5y | `supabase/migrations/20261104030900_f15_alert_evaluation_scope.sql:31` | ACTIONABLE-in-scope; migration blocked | Alert starvation fix requires forward SQL; same timestamp blocker. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b58 | `supabase/migrations/20261104032300_f15_purge_owner_consumer.sql:44` | ACTIONABLE-in-scope; migration blocked | Purge draft-intent hashes via forward SQL; same timestamp blocker. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b6B | `supabase/migrations/20261104032300_f15_purge_owner_consumer.sql:72` | ACTIONABLE-in-scope; migration blocked | Purge runner starvation/status accounting fix requires forward SQL; same timestamp blocker. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b6D | `tests/e2e/forms-builder-s14.spec.ts:308` | NOT-APPLICABLE | UTF-8 byte inspection confirms the fixture already contains the intended Arabic strings. Apparent mojibake was terminal decoding only; no blob change. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b6H | `tests/integration/forms-telegram-links.test.ts:43` | ACTIONABLE-in-scope | Make the revocation precondition and row assertions mandatory. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-b6N | `tests/unit/optimize-body-fat-assets.test.ts:47` | ACTIONABLE-in-scope | Provision and assert required ffmpeg/WebP/AV1 encoders in CI; do not skip the tests. | Replied on PR #44 with fix/reason; thread resolved. |
| PRRT_kwDOVYgYQ86y-c1u | `lib/forms/client-answer-state.ts:56` | ACTIONABLE-in-scope | Preserve answers on validation failure and remove empty numeric inputs instead of storing zero. | Replied on PR #44 with fix/reason; thread resolved. |
### PO-DECISION-NEEDED

- **S30-PD-01 · F15 alert delivery · `lib/forms/telegram-delivery.ts:18`.** The Telegram CTA targets `/forms/alerts`, for which no authorized inbox page exists. Options: (1) approve a new dedicated staff inbox route and define role/workspace states (complete UX, adds feature scope); (2) point to an already approved staff intake/alert destination if one exists (smallest change, requires destination confirmation); (3) remove the deep link and retain message text only (reduces functionality). Recommendation: option 2 if an approved route exists; otherwise PO should approve option 1. Blocked: route/copy change and its UI evidence.
- **S30-PD-02 · F15 Builder copy · `specs/015-forms-intake/spec.md:342`.** N07 training-timing lacks English translation. Options: (1) PO supplies exact EN copy (approved, consistent); (2) PO approves CodeRabbit's proposed “After which meal would you like to train?” (fast, commits a new wording decision); (3) leave the field explicitly pending PO review and exclude it from the EN review table (honest but leaves review incomplete). Recommendation: option 1; do not implement until approved. Blocked: spec copy correction.
- Existing PO decisions SK-015-01 for B06 sex-label and Terms AR/EN copy remain untouched.

## Migration timestamp blocker

Latest branch migration is `20261107000000_f15_client_profile_prefill.sql`; environment date is 2026-11-03. A later valid clock timestamp is unavailable. No pushed migration will be edited and no future-dated migration will be authored. Six review findings that require database changes remain blocked pending a valid migration allocation; the application submission three-section behavior is not partially changed.

## Verified outcomes

## Work and verification
- Focused unit RED/GREEN: pre-fix 4 failed / 15 passed; post-fix 23/23 passed across four files.
- Wrapped Stack D Telegram link integration: 1/1 passed with required membership and link-row assertions.
- Wrapped port-3315 authorized-route Playwright correction case: 1/1 passed; correction edits emitted no draft/correction request until explicit submission; two corrections used sequential revisions.
- Local FFmpeg 9.0.2 codec verification found `libwebp`, `libaom-av1`, and AVIF muxer. CI workflow installs and checks these codecs; no CI window was opened.

### RED/GREEN and root-cause evidence to date

- RED: focused unit run on the pre-fix implementation produced 4 failures / 15 passes across three files: preview multi-choice `contains`, answer retention on progression errors, empty numeric answer removal, and localized snapshot copy validation.
- GREEN: the same focused unit files plus signup unit suite passed 23/23 after implementation.
- GREEN: wrapped Stack D `forms-telegram-links.test.ts` passed 1/1 with the mandatory membership/link assertions.
- GREEN: wrapped port-3315 `forms-authorized-route.spec.ts -g "submitted answer edits"` passed 1/1. It verifies no draft/correction write during edit, visibility/page-hide, or autosave; then two explicit corrections send consecutive expected revisions.
- Signup E2E: focused `client-signup.spec.ts -g "blocks invalid identity locally"` passed 1/1 after rerun. It confirmed Tab moves focus to the date input, the invalid name references `signup-name-error`, and correcting the name clears both invalid/error associations. Two preceding isolated attempts intermittently failed the existing focus assertion; the successful run was repeated with a temporary active-element diagnostic (removed immediately).
- Recovery RLS root cause: the failing PO safe-column test and its `pendingRlsAccess` helper are unchanged from `ed88574`. On current Stack D, the helper scans **45 public RLS tables** for each of two workspaces. Temporary non-sensitive timing instrumentation measured the first scan at 17.99 seconds; the second sequential scan cannot fit in the unchanged 30-second Vitest default. Only this test timeout is now 60 seconds; assertions are unchanged. Full wrapped recovery file passed 13/13 in 150.11 seconds. Instrumentation was removed.
- The prior catalog timeout was already cleared by the focused rerun recorded in S29 h5; this round did not change its assertions or timeout.

Thread follow-up: all 17 GraphQL review threads received a reply and were resolved on PR #44 after commit `ba357f4b34edc5b757919d0b5e925f92564b1810`. Eight findings were addressed in that commit; six database findings remain explicitly blocked pending a valid forward-migration timestamp; two product findings were escalated; one Arabic-fixture finding was not applicable. Resolving those threads records this review-cycle disposition and does not claim the blocked SQL changes or product decisions are complete.\n\nFinal gates, focused forms/intake/register Playwright, final Stack D fingerprint, and the one required final CodeRabbit request/poll remain pending.

## Signup blob changes

- `app/register/[token]/SignupForm.tsx`: old blob `30906cfeff0105a48b803b8158936e2115ee1b99`; new blob `77f8a6cbc93b28848b5ffac9e833c09823e42471`.

