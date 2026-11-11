# S29 F15 h5 verification

## Commit and PR state

- Worktree: `015-forms-intake`; report authored against code head `4fe273f1c23f1bf638669e6b56770bfa5271e129`.
- Assets-only PR #46: head `38d2493ac183b2f69a88595960c034f2dc8079af`; base `main`; 96 files. It contains the exact 96 binary blobs from `015-forms-intake@aa75ee5`: 50 body-fat images and 46 integration evidence images. No code. It remains unmerged pending PO exact-SHA approval.
- #44 is stacked on #46 (`baseRefName=015-forms-assets`). At code head `4fe273f`, GitHub reported 280 changed files. This report adds one file, leaving 281 (below CodeRabbit's 300-file cap). The PR body says to retarget to main before the CI window / after the assets PR merges. No CI window was opened.
- Asset merge commit: `33e887a09e32d31956c8cf67a8a7be33739ece99`; `git diff aa75ee5 HEAD --stat` was empty immediately after the stack merge. Later code commits: profile-prefill implementation `3ca48b9`, fixture typing `29faf35`, authored-order fix `628a909`, unit-file consolidation `84cc3bb`, axe coverage `4fe273f`.
- No pushed migration or signup-profile file was edited in h5. The one new forward migration is `20261108230044_f15_client_profile_prefill.sql`.

## Shared package and registration failures

I reran the same package and registration specs on both branch code and detached `ed88574` against the same Stack D. The five failures reproduce on main; they are not branch-only. The package route/read files and registration route/read files are byte-identical to `ed88574`. The branch changes to the two specs only make their origin/cookies honor `PLAYWRIGHT_BASE_URL` and use the exact signup-name label.

| Failure                             | Observed root                                                                                                                                                                             | Classification / fix / SHA                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PO packages, Arabic                 | The unchanged `/packages` server page renders its generic unavailable state instead of the empty-offers state; the read path returns unavailable on this Stack D fixture/session context. | Reproduces on `ed88574`; shared Stack D/test-fixture data-read issue, not a branch regression. No branch fix/SHA. No assertions changed. |
| PO packages, English                | Same unavailable state and same failing empty-offers assertion as Arabic.                                                                                                                 | Same shared Stack D/test-fixture issue; no branch fix/SHA.                                                                               |
| PO registration management, Arabic  | The unchanged `/registration-links` route returns 404 for the fixture workspace; its server-visible/authorized workspace list does not admit the requested fixture workspace.             | Reproduces on `ed88574`; shared Stack D session/workspace fixture mismatch, not a branch route/capability change. No branch fix/SHA.     |
| PO registration management, English | Same 404 and same selected workspace guard as Arabic.                                                                                                                                     | Same shared Stack D session/workspace fixture mismatch; no branch fix/SHA.                                                               |
| Late issuance / missing Issue link  | The test cannot find the action because the same registration-management route is already 404; it fails before issuing a request.                                                         | Downstream of the shared registration 404 on `ed88574`; not a separate branch regression. No branch fix/SHA.                             |

The browser-visible error page is intentionally generic. This run did not add diagnostics that expose server or database error details. The compared route/read/auth files are unchanged, and the exact five observations reproduce on main, which is sufficient to classify them as pre-existing Stack D/test-fixture failures rather than patch unrelated feature code.

## Full Playwright reconciliation

Both full suites ran on this machine against Stack D. Branch used port 3315; main `ed88574` used port 3000 after `Get-NetTCPConnection -LocalPort 3000 -State Listen` was empty. Main's temporary detached worktree required only its non-secret Stack D `config.toml` and a scratch-only Turbopack root to use the shared dependency junction. The main run did not set `PLAYWRIGHT_BASE_URL`.

| Suite            | Passed | Failed | Skipped | Total |
| ---------------- | -----: | -----: | ------: | ----: |
| Branch `4fe273f` |    288 |      5 |      15 |   308 |
| Main `ed88574`   |    182 |     21 |      15 |   218 |

**Branch-only failures: 0.** All five branch failures are in the main failure set. The branch also fixes main's English Sales registration-links timeout, and includes 90 additional tests absent from the baseline. The five shared failures are listed above.

Main's 16 additional failures (all pre-existing on `ed88574`):

- `client-accounts-storage.spec.ts`: a real pending-client JWT cannot read/write Storage.
- `client-accounts.spec.ts`: Arabic and English completion capture; pending submission; Arabic and English invalid-field correction; Arabic and English unavailable/retry; committed-signup retry; Arabic and English consumed-link retry; identity collision wording; Arabic and English duplicate response equality; lost committed response.
- `registration-links.spec.ts`: English Sales exact-terms/keyboard/schedule/copy/scope/themes.

The branch's 15 skips match the expected suite skips (desktop/mobile shell project-specific cases and the storage-profile condition); no test was added to or moved into a skip.

## Runtime signup-profile prefill

- Spec contract: `specs/015-forms-intake/spec.md:256-257` defines B01 as read-only signup full name and B02 as read-only age calculated against the Africa/Cairo calendar date. Signup source columns are `clients.name` and `clients.date_of_birth` from `20261104001000_f15_signup_profile.sql`.
- Before h5, the client route ignored these values and `QuestionFlow` did not render `profileText`/`computedAge`. A pre-implementation RED was recorded in the focused unit and Stack D integration tests.
- `supabase/migrations/20261108230044_f15_client_profile_prefill.sql:8-20` extends the authenticated assignment-context RPC with `{full_name,date_of_birth}` and constrains it by assignment ID, `c.auth_user_id=auth.uid()`, and approved status. `lib/forms/client-assignment.ts:74` reads this owner-scoped RPC result. A foreign-client integration test receives null context/no profile.
- `lib/forms/profile-prefill.ts:9-33` binds only authored profileText/fullName and computedAge/dateOfBirth fields and uses `calculateAgeInCairo`. Unit coverage checks the Cairo birthday-today and day-before boundary. Mutant (a) adding one to age was killed by both boundary assertions; mutant (b) sourcing name from DOB was killed by all three helper assertions. Each mutation was restored and `git diff --exit-code` was clean.
- `components/forms/QuestionFlow.tsx:163-171` now initializes the visible step to the first applicable authored question. A RED UI regression had previously shown that required-question-first validation skipped optional B01/B02; the authored-order fix is `628a909`. Profile outputs are read-only semantic `<output>` elements; ordinary authored short text remains editable. The test fixture uses the already approved B01/B02 English and Arabic labels.
- No signup-policy, signup migration, `SignupForm`, schema, or registration action file was changed. No new/changed application string was added; DRAFT strings: none.

### Rendered evidence and design review

Screenshots and `INDEX.md`: `%TEMP%/lifter-s29-f15-h5/`. The index links the 24 B01/B02/Goal matrix screenshots for AR/EN × light/dark × 390/1440 and the additional autosave-state screenshots. The final matrix E2E run checked axe on B01, B02, and Goal in all eight variants. Reviewed representatives across both locales, themes, and sizes: labels/values remain legible, Arabic remains RTL, age digits are isolated LTR, and the read-only output fits the existing form layout. No visual defect was found.

| Frontend Design Gate item      | Result and evidence                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens only / workspace brand  | PASS. `QuestionFlow.module.css` uses existing color, space, touch-min, and radius tokens. Existing brand-scope E2E verifies success/warning/error tokens remain stable in light and dark. |
| Typography / bidi              | PASS. Existing Geist EN / IBM Plex Sans Arabic AR; profile values use `Bidi` (`dir=auto` for names, `ltr` for age).                                                                       |
| Layout / component consistency | PASS. Existing QuestionFlow and tokenized input-like output treatment; no new shared component. Reviewed screenshots in the index.                                                        |
| Contrast                       | PASS. Axe scans passed on the 8-way matrix; sample brand scope also passed axe in light/dark and preserved semantic status colors.                                                        |
| Accessibility                  | PASS. Keyboard progression/autosave tests pass; `<output>` has the localized question name; axe has zero violations on B01/B02/Goal across the matrix.                                    |
| States                         | PASS. Existing authorized-route tests cover loading/recovery, save, retry, conflict, and pending behavior; profile null/missing DOB is unit-covered.                                      |
| Copy                           | PASS. No new application strings; reused approved bilingual question labels and Bidi isolation.                                                                                           |
| Matrix / screenshots           | PASS. Eight AR/EN × light/dark × 390/1440 combinations with B01/B02/Goal, indexed under the requested temp directory and reviewed.                                                        |
| Tests / dependencies / size    | Unit, focused D integration and route E2E passed; final full D integration has two timeouts (see gate table). No dependency added; web bundle is within budget (13.29%).                  |

### Design skills assessment

The local design-skills catalog was reviewed. Entries marked `CONFLICT - PO decision` are advisory only; the approved Design System and spec win. `ui-ux-pro-max` was used for lookup/search only. No new design direction, tokens, copy, motion, effects, or dependencies were introduced.

| Skill                        | Assessment            | Reason                                                                               |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| apple-design                 | NOT APPLICABLE        | No visual direction or physical motion was introduced.                               |
| ui-ux-pro-max                | APPLIES (lookup only) | Used semantic UX/accessibility lookup; no generated system persisted.                |
| impeccable                   | APPLIES               | Context and craft-floor review constrained the output to the existing design system. |
| frontend-design              | APPLIES               | Reviewed the rendered bilingual intake component and responsive matrix.              |
| baseline-ui                  | APPLIES               | Reviewed hierarchy, spacing, and output treatment in screenshots.                    |
| design-dna                   | NOT APPLICABLE        | No design tokens or visual identity were defined or extracted.                       |
| genjutsu                     | NOT APPLICABLE        | No creative effects or new system were needed.                                       |
| emil-design-eng              | APPLIES               | Applied polish/accessibility review without adding motion.                           |
| animate                      | NOT APPLICABLE        | No animation was added or changed.                                                   |
| animate-expo                 | NOT APPLICABLE        | Native Expo work is outside this Next.js web change.                                 |
| review-animations            | NOT APPLICABLE        | No animation code changed.                                                           |
| improve-animations           | NOT APPLICABLE        | No animation code changed.                                                           |
| find-animation-opportunities | NOT APPLICABLE        | No motion opportunity was in scope.                                                  |
| animation-vocabulary         | NOT APPLICABLE        | No motion treatment was requested.                                                   |
| animation-performance        | NOT APPLICABLE        | No animation was added or tuned.                                                     |
| prototype                    | NOT APPLICABLE        | No alternative visual directions were needed.                                        |
| mobile-native                | NOT APPLICABLE        | No PWA/browser-native behavior was changed.                                          |
| pick-ui-library              | NOT APPLICABLE        | No library selection or dependency was needed.                                       |
| ask-sonner                   | NOT APPLICABLE        | No toast system change was needed.                                                   |
| write-swift                  | NOT APPLICABLE        | This is a Next.js web app, not Swift.                                                |
| break-ui                     | APPLIES               | Reviewed narrow/wide, RTL/LTR, long profile value, and empty-profile edge behavior.  |
| better-ui                    | APPLIES               | Reviewed consistency with existing production form controls.                         |
| better-typography            | APPLIES               | Reviewed Arabic/English hierarchy and mixed-direction values.                        |
| better-colors                | APPLIES               | Reviewed existing semantic tokens in light/dark and brand scope.                     |
| better-accessibility         | APPLIES               | Reviewed output semantics, keyboard path, focus, and axe matrix.                     |
| better-layout                | APPLIES               | Reviewed responsive layout and RTL reading order.                                    |
| better-interface             | APPLIES               | Consolidated the relevant layout, color, type, and accessibility review.             |
| better-writing               | APPLIES               | Confirmed approved bilingual labels and no new copy.                                 |
| interface-review             | APPLIES               | Reviewed the committed UI change and its rendered evidence.                          |
| visual-style-presets         | NOT APPLICABLE        | No style preset or visual system was introduced.                                     |
| glass-dark-ui                | NOT APPLICABLE        | No glassmorphism or gradient surface was introduced.                                 |
| progressive-blur             | NOT APPLICABLE        | No blur effect was introduced.                                                       |
| motion-design                | NOT APPLICABLE        | The spec does not call for motion.                                                   |
| css-animation                | NOT APPLICABLE        | No CSS animation was added.                                                          |
| remotion-motion-graphics     | NOT APPLICABLE        | Video motion graphics are unrelated to this web form change.                         |
| gsap-core                    | NOT APPLICABLE        | No GSAP animation was added.                                                         |
| threejs-fundamentals         | NOT APPLICABLE        | No Three.js scene is involved.                                                       |
| threejs-animation            | NOT APPLICABLE        | No Three.js animation is involved.                                                   |
| threejs-geometry             | NOT APPLICABLE        | No 3D geometry is involved.                                                          |
| threejs-interaction          | NOT APPLICABLE        | No 3D interaction is involved.                                                       |
| threejs-lighting             | NOT APPLICABLE        | No 3D lighting is involved.                                                          |
| threejs-loaders              | NOT APPLICABLE        | No 3D assets are loaded.                                                             |
| threejs-materials            | NOT APPLICABLE        | No 3D materials are involved.                                                        |
| threejs-postprocessing       | NOT APPLICABLE        | No 3D postprocessing is involved.                                                    |
| threejs-shaders              | NOT APPLICABLE        | No shaders are involved.                                                             |
| threejs-textures             | NOT APPLICABLE        | No 3D textures are involved.                                                         |
| gsap-frameworks              | NOT APPLICABLE        | No GSAP framework adapter is involved.                                               |
| gsap-performance             | NOT APPLICABLE        | No GSAP code is involved.                                                            |
| gsap-plugins                 | NOT APPLICABLE        | No GSAP plugin is involved.                                                          |
| gsap-react                   | NOT APPLICABLE        | No GSAP React integration is involved.                                               |
| gsap-scrolltrigger           | NOT APPLICABLE        | No scroll-linked animation is involved.                                              |
| gsap-timeline                | NOT APPLICABLE        | No animation timeline is involved.                                                   |
| gsap-utils                   | NOT APPLICABLE        | No GSAP utility is involved.                                                         |
| lottie                       | NOT APPLICABLE        | No Lottie asset is involved.                                                         |
| remotion-to-hyperframes      | NOT APPLICABLE        | No video composition is involved.                                                    |

## Gates, task state, and Stack D

On report commit `2120d6301eea6a71cedb9e92ccef234e20fb8af5`, all non-integration gates passed: unit 2,302; lint; typecheck; format; build; edge build; secrets; size (web 8,712.85 KiB / 13.29%, cron 11.76 KiB / 0.02%); migration timestamp check (156 files, 11 documented merged exceptions); diff check. The prior code-head full integration passed (120 files, 1,595 passed / 2 expected skips), but the final-head full integration rerun did not: 118 files passed, 2 failed and 2 skipped; 1,593 tests passed, 2 failed and 2 skipped. The failures were 30-second timeouts in `client-accounts-recovery.test.ts` (safe-column RLS probes) and `client-accounts-catalog.test.ts` (narrow 30-day purge). A focused rerun passed the catalog file (22/22); the recovery timeout persisted. No application or database changes were made in response. The focused route E2E passed 4/4, including the eight-cell profile matrix and axe scans on all three screens.

| Gate                     | Result                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                     | PASS — 2,302 tests                                                                                                                                         |
| Lint                     | PASS                                                                                                                                                       |
| Typecheck                | PASS                                                                                                                                                       |
| Format check             | PASS                                                                                                                                                       |
| Build                    | PASS                                                                                                                                                       |
| Build:edge               | PASS                                                                                                                                                       |
| Check:secrets            | PASS                                                                                                                                                       |
| Size                     | PASS — web 13.29%, cron 0.02%                                                                                                                              |
| Migration timestamps     | PASS — 156 validated, 11 documented merged exceptions                                                                                                      |
| `git diff --check`       | PASS                                                                                                                                                       |
| Full Stack D integration | FAIL - 118 files passed, 2 timed out, 2 skipped; 1,593 tests passed, 2 failed, 2 skipped. Focused rerun: catalog 22/22 passed; recovery timeout persisted. |
| Full Playwright          | 288 passed, 5 shared pre-existing failures, 15 expected skips; 0 branch-only failures                                                                      |

- T009 is already checked complete in `specs/015-forms-intake/tasks.md`; this round adds runtime profile prefill coverage but changes no task text.
- T024 remains open: full acceptance has five shared package/registration Playwright failures and the final full D integration run has one persistent recovery-test timeout; complete passing acceptance evidence is not present.
- T029 remains open/blocked on its database prerequisites; h5 made no D1 deletion change.
- Stack D was not started, stopped, or reset. Exact recorded `StartedAt` remains `2026-11-02T18:43:05.538142345Z`. Read-only DB fingerprint before and after: `pg_postmaster_start_time=2026-11-02 18:43:08.017082+00`, `cron.job=0`, 156 migration rows. Scheduler E2E opt-in was not set.
- CodeRabbit at this report snapshot: no h5 review request yet. Historical requests on #44 were skipped (one for non-default stacked base; the later run for 326 files over the 300-file cap). After final-head gates, one manual full-review request is required; if the check is skipped, stop and report that state. No review threads are treated as clean until an actual non-skipped review completes.
- Final CodeRabbit state and exact reviewed commit will be stated in the final handoff.
