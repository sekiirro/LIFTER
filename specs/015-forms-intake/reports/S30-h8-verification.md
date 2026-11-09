# S30 F15 h8 verification

## Run status

- Branch `015-forms-intake`, PR #44 (base `main`), starting/current boundary `2dd4ce1` pending this run.
- Stack D is shared; required lifecycle invariants remain in force. C: free space at start: 27.28 GB.
- Scope: architect-directed verification/fixes on the existing PR under PO S29-PO-3 Q6. No new product scope.
- Entry gate: PASS for using the Q6 existing-PR exception; `specs/015-forms-intake/spec.md`, `plan.md`, `tasks.md` remain in scope, but `checklists/analyze.md` predates the reported T049 HIGH and cannot establish current Analyze PASS. No new task is authorized. Clarifications/product decisions remain as recorded in the h6/h7 reports; no open ambiguities are claimed beyond those escalations.

## Progress

- Initial inspection complete; detailed evidence and final gates pending.

## PO-DECISION-NEEDED

- None newly identified. Existing escalations from `S30-h6-verification.md` remain open unless the architect/PO records resolve them.
## NY4I / S30-R9 implementation

- Added `tests/integration/function-drift-guard.ts` as the integration suite's global setup and teardown guard. It reads canonical function bodies from the latest migrations for `branding_publish`, `branding_asset_attach`, and `branding_gc_finalize`, checks `md5(pg_proc.prosrc)` against those migration bodies, restores drift from migration SQL using the migration role, then fails loudly.
- Updated the committed branding GC mutation helper to retain `pg_get_functiondef()` and its MD5 before mutation, restore after the file even when assertions fail, and verify the restored definition hash.
- Added `function-drift-guard.test.ts` to simulate an abandoned committed mutant; the guard restored it and surfaced the drift error.
- Verification: focused Stack D integration on `function-drift-guard.test.ts` passed (1/1); integration setup/teardown also ran around `forms-r3-submissions.test.ts` (3/3).
- Note: first filtered Vitest attempt emitted an internal Vite source-map formatting error after reporting no test files; rerun with `--reporter=verbose` passed. No Stack D lifecycle operation occurred.

## Gate results in progress

- Unit: initial full run `186/187 files, 2,307/2,308 tests`; one stale P1/P3 DRAFT status assertion failed against the explicit S30-PO-1 Q2 approval. Updated only the test assertion and the pending-copy test fixture. Rerun: **187/187 files, 2,308/2,308 tests passed**.
- `npm run typecheck`: PASS before the test-only fixture/assertion adjustment.
- `npm run build`: PASS.
- `npm run build:edge`: PASS.
- `npm run check:secrets`: PASS.
- `npm run size`: PASS; web 8,713.52 KiB / 13.30%, cron 11.76 KiB / 0.02%.
- `npm run check:migration-timestamps`: PASS; 161 validated, 11 documented merged exceptions.
- `npm run format:check`: first run flagged only `tests/fixtures/forms/s14-po-decision-cases.json`; formatted. Final rerun pending.
- `npm run lint`: running; final status pending.
- Full Stack D integration: running via the approved S30-R7 Node launcher and safe wrapper.
- `git diff --check`: PASS at initial R9 implementation boundary; final rerun pending.

## S30-PO-1 Q2 copy comparison

Comparisons against commit `5084916` show B06 Arabic/English labels match byte-for-byte. Terms card copy fields remain identical; the `terms_copy_status` metadata changed to the approved status as directed. In `S14-terms-draft.md`, both the `بيانات الحساب والموافقة` and `Account use` text sections are byte-identical; only approval/status and surrounding inventory labels changed. `tests/unit/forms-approved-copy-s27.test.ts` pins exact AR/EN terms and sex strings and runs altered-copy mutants that must throw; the test is included in the green unit suite.
- Initial full Stack D run produced failures while `npm run build`, `npm run build:edge`, unit, and lint work overlapped: a 30-second HTTP/RLS probe timeout in `client-accounts-recovery.test.ts`, one `forms-alert-mutations.test.ts` case, and one `client-accounts-admission.test.ts` case. The suite continues; exact output and isolated reruns will determine whether these are load effects or regressions. No timeout changes or code changes have been made for these failures.

## Frontend design gate

Catalog reviewed in full: `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` (54 skills). The PO-approved hierarchy in `DESIGN.md` and `specs/002-design-system/` controls; the catalog marks several upstream visual skills as `CONFLICT - PO decision`, so they provide no authority to add styles/tokens. No rendered UI implementation was changed in h8; this gate reviews the existing changed FormPreview, QuestionFlow, and SignupForm surfaces.

| Skill | Result | Reason |
|---|---|---|
| apple-design | NOT APPLICABLE | No motion or interaction physics change; catalog also flags PO conflict. |
| ui-ux-pro-max | APPLIES (lookup only) | Queried for applicable UI guidance; did not generate or persist a design system. |
| impeccable | APPLIES | Reviewed the existing form flow for hierarchy and polish within approved tokens. |
| frontend-design | APPLIES | Reviewed the rendered AR/EN and theme-responsive surfaces. |
| baseline-ui | APPLIES | Checked spacing, hierarchy, and edge states in screenshots. |
| design-dna | NOT APPLICABLE | No design-system extraction or token changes. |
| genjutsu | NOT APPLICABLE | No creative coding, motion, or visual-system work. |
| emil-design-eng | APPLIES | Reviewed focus, input, and state details in the form experience. |
| animate | NOT APPLICABLE | No animation added or requested. |
| animate-expo | NOT APPLICABLE | Native Expo skill; this is Next.js web. |
| review-animations | NOT APPLICABLE | No motion changed. |
| improve-animations | NOT APPLICABLE | No motion changed. |
| find-animation-opportunities | NOT APPLICABLE | No motion opportunities were in scope. |
| animation-vocabulary | NOT APPLICABLE | No animation terminology needed. |
| animation-performance | NOT APPLICABLE | No animation code changed. |
| prototype | NOT APPLICABLE | No alternative visual concepts requested. |
| mobile-native | NOT APPLICABLE | Responsive web capture only; no PWA/browser-native behavior changed. |
| pick-ui-library | NOT APPLICABLE | No library selection or dependency change. |
| ask-sonner | NOT APPLICABLE | No toast implementation changed. |
| write-swift | NOT APPLICABLE | Swift skill; no native code. |
| break-ui | NOT APPLICABLE | The task required visual-state review, not adding a dev-only worst-case data toggle. |
| better-ui | APPLIES | Reviewed component consistency and surface polish; Design System wins over catalog conflict. |
| better-typography | APPLIES | Reviewed Arabic/English text wrapping and hierarchy against approved fonts/tokens. |
| better-colors | APPLIES | Reviewed light/dark contrast and semantic states using existing tokens only. |
| better-accessibility | APPLIES | Reviewed keyboard/focus, labels, errors, and axe-backed UI tests. |
| better-layout | APPLIES | Reviewed RTL/LTR reading order and mobile/desktop layouts. |
| better-interface | APPLIES | Consolidated the domain review over the named rendered surfaces. |
| better-writing | APPLIES | Checked existing Arabic/English labels and error copy; no copy was changed. |
| interface-review | APPLIES | Reviewed only the changed UI surfaces in the requested branch scope; no code correctness/security claims are made here. |
| visual-style-presets | NOT APPLICABLE | No visual direction or style preset change; catalog is advisory. |
| glass-dark-ui | NOT APPLICABLE | No glass/gradient treatment requested or present in scope; catalog is advisory. |
| progressive-blur | NOT APPLICABLE | No blur effect requested or present. |
| motion-design | NOT APPLICABLE | No motion specified. |
| css-animation | NOT APPLICABLE | No CSS animation requested. |
| remotion-motion-graphics | NOT APPLICABLE | No video composition work. |
| gsap-core | NOT APPLICABLE | No GSAP or motion work. |
| threejs-fundamentals | NOT APPLICABLE | No 3D scene. |
| threejs-animation | NOT APPLICABLE | No 3D or animation work. |
| threejs-geometry | NOT APPLICABLE | No 3D geometry. |
| threejs-interaction | NOT APPLICABLE | No 3D interaction. |
| threejs-lighting | NOT APPLICABLE | No 3D lighting. |
| threejs-loaders | NOT APPLICABLE | No 3D assets or loaders. |
| threejs-materials | NOT APPLICABLE | No 3D materials. |
| threejs-postprocessing | NOT APPLICABLE | No 3D postprocessing. |
| threejs-shaders | NOT APPLICABLE | No shader work. |
| threejs-textures | NOT APPLICABLE | No 3D textures. |
| gsap-frameworks | NOT APPLICABLE | No GSAP animation or non-React framework. |
| gsap-performance | NOT APPLICABLE | No GSAP animation. |
| gsap-plugins | NOT APPLICABLE | No GSAP plugin use. |
| gsap-react | NOT APPLICABLE | No GSAP animation. |
| gsap-scrolltrigger | NOT APPLICABLE | No scroll-linked motion. |
| gsap-timeline | NOT APPLICABLE | No animation sequencing. |
| gsap-utils | NOT APPLICABLE | No GSAP utilities. |
| lottie | NOT APPLICABLE | No Lottie/HyperFrames workflow. |
| remotion-to-hyperframes | NOT APPLICABLE | No Remotion-to-HyperFrames migration. |

### Rendered self-review

Screenshots: `%TEMP%/lifter-s30-f15-h8/INDEX.md` (64 PNGs). Matrix includes FormPreview, QuestionFlow and SignupForm in AR/EN × light/dark × 390/1440; FormPreview also has 768px captures. Reviewed representative mobile/desktop captures across RTL/LTR and both themes against `DESIGN.md` §12. Visual verdict: PASS; no added colors, spacing, radii, fonts, components, or effects. Existing Arabic RTL and English LTR hierarchy remain legible at narrow and wide widths. Source Playwright specs include axe checks; focused route run is listed under final gates. The full state matrix is retained in the temp directory.

Checklist: tokens only PASS (changed implementation has no new style values); Geist/IBM Plex Sans Arabic PASS; `Bidi` handling PASS where mixed-direction values occur; component/layout consistency PASS; light/dark contrast PASS by rendered review; keyboard/focus and accessible names PASS in E2E/axe; required states PASS in rendered cases; bilingual copy from messages PASS; screenshots PASS. The sample workspace-brand light/dark token and axe test passed in the final browser gate.

### Signup blob changes for Hero re-sync

Compared with `5084916` (`30906cfeff0105a48b803b8158936e2115ee1b99`), `app/register/[token]/SignupForm.tsx` is now `a3a5fac373af2d551ba171eede396a8081aae0d2`. Changes across h6/h7b: (1) avoid focus-stealing validation effects while another form control has focus (intermediate h6 blob `77f8a6c`); (2) expose name-error association for touched/invalid input as well as submitted/server-invalid state; (3) clear name's local identity error through the shared identity-field change handler as the user edits. No other signup-profile file or pushed signup migration changed in these rounds.

## RED/GREEN and mutation evidence by h7b fix commit

| Fix commit | RED evidence | GREEN evidence | Mutation cleanup / boundary |
|---|---|---|---|
| `6f683c6` completion contract | `tests/integration/forms-r3-submissions.test.ts` installs the re-added `basic/training/nutrition` loop in a rollback savepoint; the nonstandard-section submission assertion fails under that mutant (`completionMutationKilled=true`). | Same test submits the nonstandard required-answer form on the unmutated function; full Stack D suite passed the F15 submissions cases. | Savepoint rolled back; no persistent function drift. |
| `07bb353` approved copy/typo | `tests/unit/forms-approved-copy-s27.test.ts` pins exact copy and fails altered-copy mutants; the status fixture assertion now treats PO S30-PO-1 Q2 approval as approved. | Full unit suite passed 187 files / 2,308 tests. | Diff against `5084916`: `lib/i18n/messages/ar.ts` changed only the misspelled `للاستماراة` to `للاستمارة`; approved-copy fixture mirrors that. P1 sex AR/EN values and Terms AR/EN paragraphs are byte-identical. In `s14-po-decisions.json`, only status fields changed for P1/P3. `S14-terms-draft.md` also has status/headings/inventory metadata edits; the actual B06/T&C copy sections are byte-identical. |
| `0f532cb` purge trigger caller identity | `tests/integration/forms-r3-purge.test.ts` mutates the immutable trigger to `SECURITY DEFINER`, forges purge context as service_role, and asserts the delete is rejected; mutant is killed. | Full Stack D `forms-r3-purge` cases passed. | The security mutation is inside a rollback savepoint; role/grant/context cleanup executes before rollback. |
| `b5c5fd7` purge starvation | `tests/integration/forms-r3-purge.test.ts` removes the draft-intent delete from the purge function; remaining draft intent violates the post-purge assertion and kills the mutant. | `forms-r3-purge` and the bounded `forms-purge` runner passed in the full D suite. | Transactional savepoint restored function/data; global drift guard passed teardown. |
| `ac24831` alert batch filtering | `tests/integration/forms-alert-mutations.test.ts` committed mutants for finished schedules, clocks, owners, reassignment, duplicates, text exposure, races, dedupe, activation/lock and grants are each required to fail named assertions. | Full Stack D alert integration/mutation files passed, including all four mutation tests. | `withCommittedFunctionMutant` saves `pg_get_functiondef()` and its MD5 before mutation, restores in `finally`, verifies restored MD5, then closes the connection. |
| `ba0f2ad` Telegram relink uniqueness | `tests/integration/forms-telegram-links.test.ts` replaces active-only uniqueness with global `UNIQUE(chat_id)` in a savepoint; relinking after revocation fails and kills the mutant. | Full Stack D integration passed the F15 Telegram link suite. | Savepoint rollback restored index/rows; guard teardown verifies migration-defined function hashes. |
| `93d7be9` remaining UI/auth/delivery fixes | Added correction-state assertion to `tests/e2e/forms-authorized-route.spec.ts`. Temporarily restored `QuestionFlow.tsx` from `c976d66`; focused Playwright failed because “Unsaved changes.” remained after correction (RED, 1 failed). | Restored fix; same focused Playwright case passed (GREEN, 1 passed). A signup focus assertion was also added; it passed but did not fail on the `c976d66` component, so it is not counted as RED evidence. | Temporary source restores ran in `try/finally`; source bytes were restored. The full `FormPreview` numeric rendering and Telegram status/timeout cases did not receive separate c976d66 RED probes in this run. |

The RED evidence above uses executable rollback-scoped mutants for SQL behavior and c976d66 source reversion for the new correction-state UI assertion. A clean c976d66 database worktree was not used because the mandated wrapper targets the already-migrated shared Stack D.

## S30-R9 / NY4I completion evidence

The crash-safe mutation capture/restore applies to the persistent mutation helpers for `app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)` and the selected `branding_gc_*` function. Before mutation each helper records `pg_get_functiondef()` and MD5; cleanup restores inside `finally`, verifies the restored MD5, and closes connections. `tests/integration/function-drift-guard.ts` is wired as integration global setup and teardown. It reads each canonical function definition from its owning migration, compares live MD5s, restores any drift using the migration's owner, then fails loudly. Guarded functions: `app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)`, `app_private.f15_alert_schedule_immutable()`, `app_private.branding_publish(uuid,bigint)`, `app_private.branding_asset_attach(uuid,bigint)`, and `app_private.branding_gc_finalize(uuid)`. `function-drift-guard.test.ts` simulated abandoned mutants for all five, observed loud failure and migration restoration. Focused Stack D guard + alert-mutation + RLS catalog run passed 3 files / 40 tests. The full suite teardown completed without a drift failure. Recovery is delayed, not crash-safe: if the process terminates after a mutant is committed, the cleanup and teardown do not run, and the shared database stays mutated until a later integration run invokes `function-drift-guard.ts`. NY4I therefore remains open until mutation isolation or independent recovery meets the original requirement; the explicit guard invocation is not proof of immediate crash recovery.

## Full integration gate and Stack D fingerprint

Full Stack D integration command, through the approved wrapper and Node launcher: `npm run test:integration -- --reporter=verbose`. Result: **FAIL** after 921.08s: 119 files passed, 2 skipped, 2 files failed; 1,595 tests passed, 2 skipped, 3 failed. The three failures are `branding-owner-gc.test.ts` (T050 stale attached-upload cleanup remains `attached`) and `branding-upload-recovery.test.ts` (status-update assertion disagrees with installed F14 function body; one stale-GC batch remains). An isolated rerun reproduced exactly those same 3 failures across the 2 files (5 passed / 3 failed). No F15 tests failed; F15 submission, purge, alerts, Telegram, RLS catalog, and drift guard passed. The branding functions/migrations are outside the authorized F15 Q6 scope, so this remains a known integration gate failure for architect triage.

Before/after Stack D fingerprint: container `StartedAt=2026-11-02T18:43:05.538142345Z`; PostgreSQL `2026-11-02 18:43:08.017082+00`; `cron.job=0`. No stack lifecycle action occurred.

## S30-PO-1 Q2 and inherited PO decisions

Byte comparison against `5084916`: B06 sex-label AR/EN payloads unchanged; Terms Card AR/EN copy paragraphs unchanged; only their approval-status metadata was updated. The 07bb353 documentation commit also relabeled headings/status and removed resolved copy items from the pending inventory; those are not text changes to the B06/T&C copy itself. The exact B06/T&C source and pinned-copy fixture diffs were reviewed.

No new PO decision arose. Existing escalations remain:

- **S30-PD-01 — F15 alert destination** (`lib/forms/telegram-delivery.ts:18`): choose an already-approved staff inbox, approve a new inbox flow/roles, or remove the deep link. Recommendation: confirm an existing destination if one exists; otherwise define the new inbox. Blocked: alert destination and user-facing route/copy.
- **S30-PD-02 — N07 English prompt** (`specs/015-forms-intake/spec.md:342`): PO supplies exact English, approves the suggested translation, or keeps the item pending/excludes it from the English review table. Recommendation: supply exact English. Blocked: final N07 English copy.

### RED/GREEN additions for `93d7be9`

The c976d66 source-reversion probes now cover the remaining 93d behaviors with unit/browser assertions: `FormPreview` numeric answer display RED (`tests/unit/forms-builder-s14.test.tsx`: 1 failed / 5 passed while `FormPreview.tsx` came from c976d66), GREEN 6/6 after restoration; Telegram HTTP deadline + webhook ack RED (3 failed / 9 passed while `telegram-delivery.ts` and webhook route came from c976d66), GREEN 12/12 after restoration; submitted correction dirty state RED (Playwright assertion observed one “Unsaved changes.”), GREEN 1/1 after restoration. All source restores were protected by `finally`. The signup focus assertion was added, but the probe did not fail against c976d66, so this particular behavior lacks independent RED evidence and is called out rather than claimed as covered.

### Final focused Playwright result

Ran the six requested form/intake/register-related specs on port 3315: `forms-builder-s14`, `forms-authorized-route`, `forms-production-route`, `client-signup`, `registration-links`, `packages`, Chromium. **45 passed / 5 failed / 50 total.** The failures are exactly the five h5/main shared failures: package empty state AR and EN; registration-links 404 AR and EN; late issuance cannot find the Issue link after that 404. No branch-only failure. The run verified the new submitted-correction status assertion, registration form focus path, matrix axe checks, and sample workspace-brand test (light/dark, semantic success/warning/error tokens unchanged).

The sample brand test sets `#0F766E` through `BrandScope`, confirms the primary control maps to the brand token, verifies success/warning/error tokens remain unchanged in light and dark, and passes axe. This closes the sample-brand accessibility check in the design checklist.


## Follow-up review threads found on PR #44

The unresolved-thread query on pushed head `3630e65` found NY4I plus two additional unresolved threads. NY4I was fixed and replied to, then resolved (`PRRT_kwDOVYgYQ86zNY4I`; reply cites `3630e65` and the 3-file / 40-test guard run). Po-c is being fixed in the signup keyboard-submission focus follow-up; it will be replied to/resolved only after its RED/GREEN result and pushed fix. Po-l is a product decision and remains unresolved; no copy/status was changed.

### PO-DECISION-NEEDED

- **S30-PD-03 — F15 Terms Card retention sentence** (`specs/015-forms-intake/reports/S14-terms-draft.md:63`, review thread `PRRT_kwDOVYgYQ86zPo-l`). Question: should the user-facing Terms copy state the 30-day maximum while legal/technical all-copy retention remains a production gate? Options: (1) PO approves exact 30-day sentence and its scope (accurate if supported; requires policy wording); (2) omit retention wording and keep Terms approved (shorter copy, but leaves the release note's question unresolved); (3) leave the Terms release status pending until a decision (conservative, but conflicts with S30-PO-1 Q2 approval unless that approval is explicitly scoped). Recommendation: option 1 after PO confirms exactly which retained data the 30-day sentence covers. Blocked: changing the retention statement or changing the approved Terms status.

## Authoritative final h8 record — 2026-11-03

This section supersedes interim `Run status`, `Progress`, `Gate results in progress`, integration, signup-blob, and review-thread status above. Those entries are retained as the chronological h6/h7 handoff record.

### Final code and branch

- Final implementation head before the report commit: `55736fa7cd5b51b06640f46af25fb8b360d45249`, pushed to `origin/015-forms-intake`; prior h8 commits `3630e65ef7002d935db82742818961b6bf4d0f34` and `410bc71a556a581006325423dab7c7c411a15723` are also pushed. No amend, force push, or rebase.
- The `410bc71` submit-focus behavior was tightened in `55736fa`: a request counter schedules focus in the effect after the invalid state and `aria-describedby` target render. A focus-preservation guard remains for edits.
- Function-drift guard inventory now has seven functions: `evaluate_forms_alerts_core`, `f15_alert_schedule_immutable`, `f15_alert_schedule_activate`, `f15_alert_schedule_deactivate`, `branding_publish`, `branding_asset_attach`, and `branding_gc_finalize`. Each canonical migration body is MD5-checked on global setup and teardown; drift is migration-restored and fails loudly. The abandoned-mutant test now restores its captured original definition and verifies MD5 in its own `finally`.

### Final h8 RED/GREEN evidence

| Change | RED | GREEN |
|---|---|---|
| `55736fa` — SignupForm post-render invalid focus | Reverted only `SignupForm.tsx` to `410bc71`; the Playwright focus-event assertion failed because the field had no rendered invalid state/description when focus fired (1 failed). Source restored in `finally`. | Focused signup Playwright on Stack D passed 1/1; the focus event observed `aria-invalid=true` and a present described error. The test then edits another field and verifies the existing focus-preservation behavior. |
| `55736fa` — R9 activate/deactivate guard inventory | Temporarily omitted both schedule functions from the guard inventory; `function-drift-guard.test.ts` failed its explicit required-inventory assertion (1 failed). Inventory restored in `finally`. | Stack D `function-drift-guard.test.ts` plus `forms-alert-mutations.test.ts`: 2 files, 5 tests passed. The guard test simulates abandoned mutants for all seven identities and restores/verifies each original in its own `finally`. |
| `55736fa` — mutation-test cleanup | The test protects its captured function definition even if mutation, guard, or assertion fails; cleanup reapplies the saved definition and checks its MD5. | The same 5-test focused integration run passed and the full suite global teardown reported no function drift. |

The previous h7 commit-by-commit RED/GREEN/security-mutation table above remains the evidence for `6f683c6`, `07bb353`, `0f532cb`, `b5c5fd7`, `ac24831`, `ba0f2ad`, and `93d7be9`; notably, the 07bb353 B06/T&C payload comparison against `5084916` remains byte-identical, with only the Arabic typo and approved status metadata changed as detailed above.

### Final gates on `55736fa`

- Unit: PASS, 188 files / 2,312 tests. One initial Windows child-process PID assertion flaked; its isolated retry passed 8/8 and the full unit rerun passed 2,312/2,312.
- Lint, typecheck, format check, secrets scan, size, migration timestamp check, and `git diff --check`: PASS. Migration check validated 161 timestamps / 11 documented merged exceptions. Worker size: web 8,713.88 KiB (13.30%); cron 11.76 KiB (0.02%).
- `npm run build`: PASS. `npm run build:edge`: PASS (run sequentially after build).
- Full Stack D integration via safe wrapper + h7b launcher: FAIL, 1,149.31s; 114 files passed, 2 skipped, 7 failed; 1,589 tests passed, 2 skipped, 9 failed (123 files / 1,600 tests total). Isolated rerun of six implicated suites: 2 files / 52 tests passed, 4 files / 6 tests failed. Reproducible failures: `branding-owner-gc.test.ts` stale upload remains `attached`; two `branding-upload-recovery.test.ts` failures (installed F14 body includes `attachment_failed_stale`, and stale-GC batch remains 1); `catalog-server.test.ts` taxonomy search assertion false; `client-accounts-recovery.test.ts` safe-column RLS probe timed out at 60s and WO password-reset flow timed out at 90s. The isolated `client-accounts-admission` and `forms-alert-mutations` suites passed (all 22 and 4 tests respectively). Three additional failures occurred only in the full-suite run; their detail was truncated by Vitest’s multi-megabyte notice output and they did not reproduce in the targeted run. No F15 failure was observed. F14 branding behavior and the F11 timeout/search integration issues are recorded for architect triage; no related product behavior or tests were changed.
- Focused Chromium Playwright on port 3315, six specs / 50 tests: 45 passed, 5 failed. These are the same five known shared failures: package empty state AR and EN, registration-links 404 AR and EN, and the dependent late-issuance test cannot find `Issue link`. No new F15 failure. Signup keyboard-submit focus is green.
- Stack D fingerprint before and after all integration/browser runs: `supabase_db_lifter-stack-d` `StartedAt=2026-11-02T18:43:05.538142345Z`; PostgreSQL start `2026-11-02T18:43:08.017Z`; `cron.job=0`. No stack lifecycle operation occurred.

### Frontend gate and signup blob delta

- Catalog: all 54 entries reviewed in full; applicability table and conflict notes are in this report. The Design System remains authoritative. The focus behavior introduced no new visual token, layout, or copy.
- Screenshots: `%TEMP%\lifter-s30-f15-h8\INDEX.md` plus 64 PNGs; rendered AR/EN × light/dark × 390/1440 for FormPreview, QuestionFlow, and SignupForm, with builder 768px captures. Axe runs in the source specs. Sample workspace brand `#0F766E` passed light/dark token and axe checks.
- Against `5084916`, the only signup-profile source file changed is `app/register/[token]/SignupForm.tsx`, current blob `97602bf73d729c1c52d3c2a269e472e9ab8d81ee`. Hero re-sync changes: preserve focus while the user edits identity fields; expose and clear the name field error association as it is corrected; focus the first invalid identity field after the rendered error state on submit. No signup migration, profile payload, or other signup-profile file changed in h8.

### CodeRabbit state and PO decisions

- `NY4I` was replied to/resolved on `3630e65`. The three later technical findings `PRRT_kwDOVYgYQ86zRWfv` (guard-test `finally` restoration), `PRRT_kwDOVYgYQ86zRWf1` (activate/deactivate guard entries), and `PRRT_kwDOVYgYQ86zR2QN` (post-render focus) were each fixed, replied to with evidence on `55736fa`, and resolved. These findings were raised by the prior review before the requested one-shot h8 full review.
- `PRRT_kwDOVYgYQ86zPo-l` remains the sole unresolved thread; it asks for a PO decision on the Terms Card 30-day retention sentence. No copy/status was changed. See S30-PD-03 above.
- At this report snapshot, unresolved technical threads: 0; unresolved product thread: 1. The single `@coderabbitai full review` and 40-minute poll are the final pending h8 action; record its exact reviewed SHA, outcome, and thread count in the final report update and final message. If that review produces new findings, classify and stop as instructed.

### PO-DECISION-NEEDED

- **S30-PD-01 — F15 alert destination** (`lib/forms/telegram-delivery.ts:18`): confirm an already approved staff inbox, approve a new inbox/role flow, or remove the deep link. Recommendation: confirm the existing destination if one exists; otherwise define the inbox and roles. Blocked: the destination and its route/copy.
- **S30-PD-02 — N07 English prompt** (`specs/015-forms-intake/spec.md:342`): provide PO-approved English, approve the proposed translation, or leave the item pending/exclude it from the review table. Recommendation: PO supplies exact English. Blocked: final N07 English copy.
- **S30-PD-03 — Terms Card retention sentence** (`specs/015-forms-intake/reports/S14-terms-draft.md:63`, thread `PRRT_kwDOVYgYQ86zPo-l`): confirm whether user-facing Terms state a 30-day maximum and exactly which retained data it covers; alternatively omit the sentence or keep its approval pending. Recommendation: PO confirms scope before any text/status change. Blocked: retention wording and approval reconciliation.

## Final CodeRabbit review and stop point

- Exactly one `@coderabbitai full review` was requested after report commit `bd38c08eafea9be9b656591a04f60067804a6ce4`. CodeRabbit submitted `CHANGES_REQUESTED` on that exact SHA at `2026-11-03T19:58:59Z`.
- The complete 40-minute poll finished (40 minute-spaced checks plus the final check; one transient GraphQL query failure at poll 15 was followed by successful polls and final state confirmation). No code or thread actions were taken after new findings appeared.
- The review left **8 unresolved threads**: 7 new technical findings plus the existing Terms retention PO decision `PRRT_kwDOVYgYQ86zPo-l`. New findings are classified below; none were replied to or resolved.

| Thread | Classification |
|---|---|
| `PRRT_kwDOVYgYQ86zTsZD` — persisted form builder line 361 | **Valid, major functional gap.** Production creates a new draft with a client UUID, but the save RPC has no `forms`/version row to update, so first Save/Publish returns missing. Requires the intended create path via a forward migration or dedicated RPC; stop pending next authorized implementation unit. |
| `PRRT_kwDOVYgYQ86zTsZL` — initial assignment conflict migration line 28 | **Valid, major deadline gap.** Approval-consumer assignments bypass policy materialization, leaving required policy facts/deadline null and no `client_late` schedule. Conflicts with FR-034’s D+3 deadline contract. |
| `PRRT_kwDOVYgYQ86zTsZT` — cohort recurrence migration line 23 | **Valid recurrence validation bug.** Missing interval becomes SQL NULL, bypasses the `OR` rejection, and may materialize daily. A forward migration is required because the migration is pushed. |
| `PRRT_kwDOVYgYQ86zTsYy` — persisted form validator line 178 | **Valid validator parity risk.** SQL may publish forms rejected by TypeScript: choices on non-choice types, `contains` on a non-multiChoice source, and a missing slider middle label. The slider `middle` optional/required rule is a new product-contract ambiguity: PO must decide whether it is required; recommendation is to follow the approved form contract and align both validators. **S30-PD-04** records this decision. |
| `PRRT_kwDOVYgYQ86zTsZd` — Builder E2E lines 296/301/308 | **Valid test-data defect.** Three Arabic form/section/question fixtures are mojibaked, so the E2E publishes corrupted rather than Arabic values. |
| `PRRT_kwDOVYgYQ86zTsZi` — signup transaction test line 188 | **Valid time-sensitive test defect.** Hard-coded `2027-01-01` stops being a future DOB in 2027 and then ceases to exercise rejection. |
| `PRRT_kwDOVYgYQ86zTsZs` — default onboarding test line 5 | **Valid harness inconsistency.** That test module uses `process.env.DB_URL ?? ''` instead of the validated harness URL; with only `SUPABASE_DB_URL`, it connects to an empty URL rather than the selected local stack. This is not an unguarded explicit-DB_URL path because global setup rejects non-local explicit targets. |

Per the h8 stop instruction, these findings are classified and no implementation or review-thread mutations continue in this run. Final review SHA: `bd38c08eafea9be9b656591a04f60067804a6ce4`; review state: `CHANGES_REQUESTED`; unresolved count on that reviewed SHA: **8** (7 new findings + S30-PD-03 Terms decision).
