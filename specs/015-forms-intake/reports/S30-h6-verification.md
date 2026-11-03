# S30 F15 h6 verification

## Scope and entry gate

- Branch `015-forms-intake`; PR #44 base `015-forms-assets`; implementation head tested: `c01e9babb8376cdad89ddbedeb4fec2bb3a19208`.
- Scope stayed within PO S29-PO-3 Q6: CodeRabbit/CI corrections on the existing open PR. No feature tasks or spec requirements were added.
- Spec Kit Analyze remains **FAIL** per the architect handoff: T049 is missing an FR tag and is being repaired by compliance lane `sk-015-r3`. The checked-in `specs/015-forms-intake/checklists/analyze.md` is dated 2026-10-30 and does not include that newer finding. Q6 is the sole basis for this review-fix work. No task was newly checked or reworded.
- The affected feature contract already has numbered FRs, measurable SCs, scenarios, and plan coverage. Product ambiguities below remain escalated.

## CodeRabbit threads from 5084916

GraphQL returned 17 unresolved threads anchored to `5084916469414ca743afe980e31c69cf593587fe`; the two reviews were CHANGES_REQUESTED at 04:07:53Z and 04:09:00Z. Every thread received a reply and was resolved after triage. Payload is retained in the run directory as `review-threads.json`. Resolution records this cycle's disposition; it does not mean blocked SQL changes or PO decisions are complete.

| Thread | Path:line | Class | Disposition | Reply / resolution |
|---|---|---|---|---|
| PRRT_kwDOVYgYQ86y-b4x | `app/register/[token]/SignupForm.tsx:234` | ACTIONABLE-in-scope | Associate the local name error and clear/refresh it on edit. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b42 | `components/forms/FormPreview.tsx:61` | ACTIONABLE-in-scope | Match `contains` preview evaluation to runtime array membership. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b4_ | `components/forms/QuestionFlow.tsx:231` | ACTIONABLE-in-scope | Write corrections only on explicit submit. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5E | `components/forms/QuestionFlow.tsx:453` | ACTIONABLE-in-scope | Sync revision state after successful submit/correction. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5I | `lib/forms/submissions.ts:35` | ACTIONABLE-in-scope | Strip localized title/description before shared validation. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5N | `lib/forms/submissions.ts:56` | ACTIONABLE; DB portion blocked | FR-006 three-section contract would need coordinated TS and SQL change. Latest migration is later than today's valid timestamp; no partial TS change. | Blocked pending architect timestamp allocation; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5Q | `lib/forms/telegram-delivery.ts:18` | PO-DECISION-NEEDED | Missing `/forms/alerts` staff destination requires product/UX scope. | Escalated as S30-PD-01; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5X | `specs/015-forms-intake/spec.md:342` | PO-DECISION-NEEDED | N07 English prompt needs approved copy. | Escalated as S30-PD-02; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5h | `supabase/migrations/20261104013000_f15_immutable_answer_corrections.sql:75` | ACTIONABLE; migration blocked | Correction validation needs forward SQL. | No pushed migration edited; valid later timestamp unavailable; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5o | `supabase/migrations/20261104015000_f15_immutable_answer_revisions.sql:8` | ACTIONABLE; migration blocked | Security-definer trigger authorization needs forward SQL. | No pushed migration edited; valid later timestamp unavailable; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b5y | `supabase/migrations/20261104030900_f15_alert_evaluation_scope.sql:31` | ACTIONABLE; migration blocked | Alert starvation needs forward SQL. | No pushed migration edited; valid later timestamp unavailable; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b58 | `supabase/migrations/20261104032300_f15_purge_owner_consumer.sql:44` | ACTIONABLE; migration blocked | Draft-intent hash purge needs forward SQL. | No pushed migration edited; valid later timestamp unavailable; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b6B | `supabase/migrations/20261104032300_f15_purge_owner_consumer.sql:72` | ACTIONABLE; migration blocked | Purge runner starvation/status accounting needs forward SQL. | No pushed migration edited; valid later timestamp unavailable; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b6D | `tests/e2e/forms-builder-s14.spec.ts:308` | NOT-APPLICABLE | Fixture bytes are valid UTF-8; apparent mojibake was terminal rendering. | No blob change; evidence replied; resolved. |
| PRRT_kwDOVYgYQ86y-b6H | `tests/integration/forms-telegram-links.test.ts:43` | ACTIONABLE-in-scope | Require membership and link-row preconditions for revocation coverage. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-b6N | `tests/unit/optimize-body-fat-assets.test.ts:47` | ACTIONABLE-in-scope | Provide required FFmpeg codecs in CI without skipping tests. | Fixed in `ba357f4`; replied; resolved. |
| PRRT_kwDOVYgYQ86y-c1u | `lib/forms/client-answer-state.ts:56` | ACTIONABLE-in-scope | Preserve answers on validation errors and clear empty numeric answers. | Fixed in `ba357f4`; replied; resolved. |

**Thread disposition:** 17/17 replied and resolved; 0 unresolved at last query. Eight findings were fixed in `ba357f4`; six DB findings are blocked; two need PO decisions; one is not applicable.

## RED/GREEN and root causes

- **Review fixes:** focused unit RED was 4 failed / 15 passed across preview `contains`, progression answer preservation, empty numeric clearing, and localized snapshot validation. GREEN passed the focused unit files and signup unit suite (27/27 across five files). No security/RLS/RPC/auth behavior fix was implemented, so no security mutation was applicable. The SQL security findings remain blocked as above.
- **Catalog purge timeout:** the first full run on `b42dfb1` timed out at 30 seconds in `client-accounts-catalog.test.ts` (1,594 passed, 2 skipped). The isolated test reproduced. Temporary timing markers showed the purge RPC returned in milliseconds; the test then made one sequential DB query for each of 93,775 existing audit rows. The test already compares the complete ordered pre/post audit snapshot, so the redundant per-row loop was removed in `557088c` without removing an assertion. The isolated test passed in 0.57s; the whole catalog file passed 22/22 in 33.81s.
- **Auth/RLS timeouts:** the full run on `557088c` reported three 30-second timeouts in exhaustive password parity. Isolated ordinary parity reproduced. Markers showed fixture, real sign-ins, and `pendingHttpAccess` completed; the remaining `pendingRlsAccess` scans 45 public RLS tables with sequential safe-column grants/select/update checks. The pre-existing measurement for this helper was 17.99 seconds per scan; the full case takes about 35 seconds. Only these three test timeouts were raised to 60 seconds in `cad09c7`; assertions were unchanged. The auth file passed 8/8 in 114.59s, and the full integration suite passed on this head.
- **Recovery RLS probe:** same `pendingRlsAccess` scan root cause and measured table count. `client-accounts-recovery.test.ts` uses a 60-second timeout for that measured PO safe-column probe; its full file passed 13/13 in 150.11s. Instrumentation was removed.
- **Correction browser test isolation:** the first focused batch and full route rerun showed the correction test inherited the autosave test's draft because both reused one assignment. A fresh form/version/assignment fixture was added in `2602079`; full `forms-authorized-route.spec.ts` then passed 5/5. No assertions were weakened.

## Final gate evidence on implementation head

Non-stack gates and focused Playwright ran on `c01e9babb8376cdad89ddbedeb4fec2bb3a19208`. Full Stack D integration passed on `cad09c759dd5ae981ada90c53f002bb125658531`; the only later source edits were the isolated browser-test fixture and formatting of the auth test, neither changes integration-suite code. The report commit adds documentation only.

| Gate | Result |
|---|---|
| Unit | PASS - 187 files, 2,306 tests. |
| Lint | PASS - `npm run lint`. |
| Typecheck | PASS - `npm run typecheck`. |
| Format | PASS - `npm run format:check`. |
| Build | PASS - `npm run build`. |
| Build edge | PASS - `npm run build:edge`. |
| Secrets | PASS - `npm run check:secrets`. |
| Size | PASS - web 8,713.52 KiB / 13.30%; cron 11.76 KiB / 0.02%. |
| Migration timestamps | PASS - 156 validated; 11 documented merged exceptions. |
| `git diff --check` | PASS. |
| Full Stack D integration | PASS - 120 files passed, 2 skipped; 1,595 passed, 2 skipped, 0 failed (968.90s). |
| Focused Playwright on 3315 | 128 selected tests: 122 passed, 1 skipped, 5 failed. The five are exactly the prior h5/main failures listed below; zero branch-only failures. |

### Five known shared Playwright failures (unchanged from h5/main)

1. PO packages, Arabic: generic unavailable state instead of empty-offers state.
2. PO packages, English: same unavailable state.
3. PO registration links, Arabic: route returns 404 for the fixture workspace.
4. PO registration links, English: same 404.
5. Late issuance case: cannot find Issue link because it reaches the same 404 first.

The same failures were observed on `ed88574` in h5. The correction-flow route now passes 5/5. The historical signup keyboard-focus flake seen in one intermediate batch passed on isolated rerun and did not recur in the final 128-test batch.

## Stack D fingerprint

- Before and after integration: Docker `StartedAt=2026-11-02T18:43:05.538142345Z`; PostgreSQL start `2026-11-02 18:43:08.017082+00`; `cron.job=0`.
- Stack D was not started, stopped, or reset. No scheduler E2E opt-in was set.

## PO-DECISION-NEEDED

- **S30-PD-01 - F15 alert delivery (`lib/forms/telegram-delivery.ts:18`).** Telegram CTA targets `/forms/alerts`, with no authorized inbox page. Options: (1) PO approves a dedicated staff inbox and defines role/workspace states (complete flow, new scope); (2) confirm an already approved staff destination (smallest change, requires destination confirmation); (3) remove the deep link and retain message text (less functionality). Recommendation: option 2 if such a destination exists; otherwise option 1. Blocked: route/copy and UI evidence.
- **S30-PD-02 - N07 English copy (`specs/015-forms-intake/spec.md:342`).** Options: (1) PO supplies exact English copy (approved and consistent); (2) PO approves CodeRabbit's suggested translation (fast, establishes new copy); (3) keep it explicitly pending and exclude it from the English review table (honest, review remains incomplete). Recommendation: option 1. Blocked: spec copy correction.
- Existing PO decisions SK-015-01 for B06 sex label and Terms AR/EN copy remain untouched.

## Migration and signup blob notes

- Latest branch migration is `20261107000000_f15_client_profile_prefill.sql`; environment date is 2026-11-03. No valid later timestamp is available. No pushed migration was edited and no future-dated migration was created. Six database findings remain blocked. No partial TS change was made for the three-section submission requirement.
- Signup-profile blob change required by the accepted in-scope finding: `app/register/[token]/SignupForm.tsx` old `30906cfeff0105a48b803b8158936e2115ee1b99`, new `77f8a6cbc93b28848b5ffac9e833c09823e42471`. Other signup-profile files and the pushed migration were unchanged.
- New or changed user-facing strings: none. DRAFT strings added: none.

## CodeRabbit final-head review

The 17-thread review above was on `5084916` and is fully replied/resolved. The required single `@coderabbitai full review` request and full 40-minute GraphQL/check poll are pending on the final report head. No approval command was sent. Final review status, exact reviewed SHA, and unresolved count will be recorded in the final handoff.