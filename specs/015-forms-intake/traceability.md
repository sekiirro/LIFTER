# F15 traceability addendum Ã¢â‚¬â€ S31 h10

This addendum records the approved S31-PO-1 fixes only. Existing task checkboxes in `tasks.md` were not changed by this round.

| Requirement | Existing task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026, FR-036, FR-037 Ã¢â‚¬â€ approved Terms copy stays exact | T033 | `tests/unit/forms-approved-copy-s27.test.ts` Ã¢â‚¬â€ pinned Q1 Terms paragraph and superseded-copy mutant, 4/4 targeted tests passed; `specs/015-forms-intake/reports/S14-terms-draft.md` byte diff is one Arabic paragraph line vs h9. | `89c89ac` |
| FR-004, FR-006, FR-007 Ã¢â‚¬â€ slider label validation parity | T034 | `tests/unit/forms-s14-validation.test.ts`; `tests/integration/forms-builder-persistence.test.ts` Ã¢â‚¬â€ SQL omission case and crash-safe missing-middle mutant; `tests/integration/function-drift-guard.ts` Ã¢â‚¬â€ migration drift guard. Focused Stack D suites passed 18/18. | `89c89ac` |

The authorized-route screenshot matrix and the shared client-recovery probe-batching adjustment remain partial integration/evidence work and do not complete T006/T009 or authorize marking those tasks complete.

## S32 h12 PO-8 traceability

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ record Q5/Q6 decisions, update the approved scope, and refresh Analyze | T058 | `specs/015-forms-intake/checklists/analyze.md` dated 2026-11-04; 0 Critical / 0 High; Clarifications cite S32-PO-8 and state no open ambiguities for authorized work. | `6e6dd4b` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ implement exact approved English controls and behavior | T059 | `tests/unit/forms-s32-approved-intake.test.ts`; focused seven-file unit run passed 47/47; remaining English rows and T03 Arabic labels are still pending. | `6aebb8d` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ verify control order, conditions, assets, rendered matrix, and accessibility | T060 | `tests/e2e/forms-authorized-route.spec.ts::approved F15 controls render in both locales, themes, and widths`; `tests/e2e/forms-authorized-route.spec.ts::renders recorded new client controls across AR/EN, theme, and viewport matrix`; focused unit run 47/47; screenshots under `%TEMP%/lifter-s32-f15-h12`. | `6aebb8d` |

## S35 round-4 traceability

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-024 / FR-025 Ã¢â‚¬â€ scheduler cleanup owns only its run-created fixtures | T107 | `tests/unit/forms-scheduler-cleanup-contract.test.ts` Ã¢â‚¬â€ 1/1 passed on current A head after the bounded-ID cleanup was committed. | `c1ca621` |

### T060 final-head evidence refresh (2026-11-04)

- Implementation head: `8183064`.
- `tests/e2e/forms-authorized-route.spec.ts::approved F15 controls render in both locales, themes, and widths`: PASS, all 12 AR/EN x light/dark x 360/390/1024 cells; axe clean; explicit viewport-width check.
- `tests/e2e/forms-authorized-route.spec.ts::renders recorded new client controls across AR/EN, theme, and viewport matrix`: PASS, 1/1.
- `tests/e2e/forms-authorized-route.spec.ts::submitted answer edits wait for explicit correction and use the latest revision`: PASS, 1/1.
- Final `npm run test`: 189 files / 2,326 passed. Full-suite integration and unrelated Playwright failures are detailed in the S32 h12 run report. No changed F15 assertion failed.
- N12 overflow regression: RED at 390px (document scrollWidth 431px, viewport 390px); GREEN after min-inline-size and flex shrink constraints; final Arabic screenshot shows percentage labels and radio controls within the viewport.
- Rendered evidence: `%TEMP%/lifter-s32-f15-h12/INDEX.md` (210 screenshots).

## S33 F15 split-fix traceability

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ record S33-PO-3 verbatim and refresh Analyze | T061 | `spec.md`, `plan.md`, `checklists/analyze.md`; entry review PASS with 0 Critical / 0 High and no open ambiguity for authorized work. | `c044f51` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ exact Arabic T03/N07 copy; English unchanged | T062 | RED: `tests/unit/forms-s32-approved-intake.test.ts` failed on empty T03 Arabic labels and the old N07 Arabic template. GREEN: `uses the PO-approved exact T03 labels in both locales` and `uses the exact Arabic meal-number template from S33-PO-3`; canonical-byte fixture refreshed; final unit suite 189 files / 2,333 passed. | `14ac577`, `8fb3202` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ rendered AR/EN, theme, viewport, Bidi, axe and screenshots | T063 | `tests/e2e/forms-authorized-route.spec.ts::approved F15 controls render in both locales, themes, and widths`; Playwright 7/7 passed, axe clean for each captured state; reviewed 390px Arabic T03 and 1024px Arabic N07 light/dark screenshots. `%TEMP%/lifter-s33-f15-r1/INDEX.md`. | `c6406fd` |
| FR-008 / FR-013 Ã¢â‚¬â€ ignore presentation-only label snapshot fields at server validation | T064 | `tests/unit/forms-submissions.test.ts::validates immutable snapshots after removing localized render copy`; full unit suite 189 files / 2,333 passed. | `2925ee7` |
| FR-004 / FR-006 / FR-008 Ã¢â‚¬â€ SQL accepts approved B06 selector | T065 | Stack D `tests/integration/forms-builder-persistence.test.ts::accepts the approved B06 identifier for the N12 series selector`; 5 integration files / 82 passed; drift guard pins latest validator migration. | `3b19409`, `ea96a4e` |
| FR-017 / FR-020 / FR-024 Ã¢â‚¬â€ active Telegram chat collision uses established invalid-link result | T066 | Stack D `tests/integration/forms-telegram-links.test.ts::rejects an active chat owned by another staff user without retrying the update`; 5 integration files / 82 passed. | `8359b88` |
| FR-017 / FR-019 / FR-024 / FR-025 Ã¢â‚¬â€ stale Telegram delivery recovery and dead-lettering | T067 | Stack D `tests/integration/forms-alert-inbox.test.ts::recovers a stale Telegram delivery claim and dead-letters it when its job is exhausted`; fixture uses transaction time; 5 integration files / 82 passed. | `e49e1a2`, `a9d72fe` |
| FR-024 / FR-025 Ã¢â‚¬â€ checked integration harness and caller-seeded pending-client RLS probe | T068 | Stack D `tests/integration/client-accounts-catalog.test.ts::pending synthetic JWT denies has_workspace_access and every catalog RLS table even with safe fixture grants`; 4 harness integration files / 36 passed. | `dfd3e65`, `57d38dc` |
| FR-017 / FR-018 / FR-024 Ã¢â‚¬â€ evaluate revocation query under lock | T069 | Stack D `tests/integration/forms-alerts.test.ts::waits for a concurrent membership revocation and excludes the recipient at enqueue`; included in 5 integration files / 82 passed. | `e31fced` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ repair review evidence separators without changing decisions | T070 | `traceability.md` reviewed against S32 h12 evidence; change limited to damaged separators. | `8067bdb` |
| FR-008 / FR-013 / FR-020 Ã¢â‚¬â€ authorized client-or-staff correction assignment context | T071 | RED: Stack D RPC missing before migration. GREEN: `tests/integration/forms-correction-context.test.ts::authorizes client and read-capable staff correction context without exposing foreign assignments` passed 1/1; `tests/unit/forms-submission-routes.test.ts` now mocks the authorized correction-context RPC and focused tests passed. | `a73ea80`, `552928d`, `35dda1b` |
| FR-002 / FR-003 / FR-031 Ã¢â‚¬â€ per-client initial occurrences and active audiences | T072 | RED: `tests/integration/forms-r3-assignment-consumer.test.ts::T008 reconciles real F12 approval and F15 selection facts in either order, once` observed shared `initial` key. GREEN: same test passed 2/2; `tests/integration/forms-cohort-assignment.test.ts::excludes a deactivated client from an all-active audience snapshot` passed; cohort suite 9/9. | `0c56c79`, `35dda1b` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ serialize retirement with default selection | T073 | RED: `tests/integration/forms-default-onboarding.test.ts::serializes default retirement with workspace default selection` found no workspace default lock. GREEN: lock contract and selected-default regressions passed; Stack D default-onboarding suite 18/18. | `bdcbc58`, `35dda1b` |
| FR-008 / FR-013 Ã¢â‚¬â€ strip render-only labels before progression validation | T074 | RED: `tests/unit/forms-client-answer-state.test.ts::removes render-only labels before evaluating conditional questions` retained a hidden answer. GREEN: focused two-file unit run 6/6. | `a10be0b` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ reject malformed media optimizer format lists | T075 | RED: empty `--formats` list was accepted. GREEN: `tests/unit/optimize-body-fat-assets.test.ts::rejects empty and repeated format names`; focused two-file unit run 6/6. | `8c48e9f` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ align copy status and evidence separators with PO decisions | T076 | `spec.md`, `plan.md`, `data-model.md`, `checklists/requirements.md` cite S30-PO-1 Q2; byte-level verification confirmed the invalid S27 separator byte and T021 question-mark separator are absent; approved copy text is unchanged. Historical report repairs verified with `git diff --check`. | `7fb34d4`, `6016ab9` |
| FR-024 / FR-025 Ã¢â‚¬â€ document fresh-checkout Stack D junction creation | T077 | `docs/11-second-local-stack.md` includes an existence guard and exact `New-Item -ItemType Junction` command targeting the root migrations directory. | `c9b00eb` |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ reconcile Arabic T03/N07 pending-copy inventory with S33-PO-3 | T078 | `specs/015-forms-intake/reports/S14-terms-draft.md` now lists exact Arabic approvals and keeps unrelated English intake copy pending. | `fb18c1a` |
| FR-025 Ã¢â‚¬â€ map unapproved job diagnostics before persistence and dead-letter audit | T079 | RED on Stack D before migration: T005 stored `forms-private-canary-provider-token` verbatim in `jobs.last_error`. GREEN on A: `tests/integration/jobs.test.ts::T005 persists only the allow-listed F15 transport code in a dead job and audit` passed 11/11; `tests/unit/forms-safe-error-sinks.test.ts::T005 maps unapproved job diagnostics to handler_error before persistence` passed 12/12, and its raw `error_code` sink mutant was rejected. | `cf5ca5f` |

## S34 F15 split-fix traceability

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ portable synthetic PO source metadata | T089 | RED: `tests/unit/forms-s14-decision-fixture.test.ts::keeps PO source metadata portable and free of machine-local paths` failed on developer-local source; GREEN: focused file 6/6. A synthetic absolute-path mutation failed the same regression and was restored. | `36aea03` |
| FR-008 / FR-013 Ã¢â‚¬â€ localized boolean correction-history labels | T092 | RED: `tests/unit/forms-correction-history.test.tsx::localizes boolean values and preserves existing string values` rendered literal `true`; GREEN: focused test 1/1, including false and unchanged string answer. | `d1c61de` |
| FR-004 / FR-006 / FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ Bidi derived meal template in FormPreview | T093 | `tests/unit/forms-builder-s14.test.tsx::formats derived meal numbers with the approved template and Bidi isolation`; full focused file 8/8 for AR/EN and Western digits. | `72f4016` |
| FR-004 / FR-006 / FR-007 Ã¢â‚¬â€ remap copied conditional and derived references | T094 | RED: `tests/unit/forms-builder-s14.test.tsx::remaps conditional and derived question references when copying a form` retained the source ID; GREEN: focused file 7/7, with source references unchanged. | `7e356c4` |
| FR-008 / FR-013 / FR-020 Ã¢â‚¬â€ correction-history GET authorization and current-snapshot filtering | T090 | RED: focused `tests/unit/forms-submission-routes.test.ts` initially failed because the authorized correction-history GET route was absent on A. GREEN: `tests/unit/forms-submission-routes.test.ts::filters correction-history keys to the current assignment snapshot`; focused file 9/9. T090 scope was narrowed so correction-write revision validation remains owned by T082. | `da31455`, `508fedf`, `cf79fa7` |
## S34 direct-RPC draft key validation

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-008 — autosave accepts only keys in the immutable assignment snapshot | T012 | `tests/integration/forms-r3-drafts.test.ts` passed 1/1 on a clean Stack D replay; full F15 integration batch passed 9 files / 64 tests. The 220-answer payload case uses 60 in-snapshot keys; the 4,096-byte case uses in-snapshot q2 without a character limit. | `be7ac9a`, `d9655f9` |

## S34 final-head task evidence

| Requirement | Task | Test/evidence | Commit |
| --- | --- | --- | --- |
| FR-004 / FR-006 / FR-007 Ã¢â‚¬â€ require an English draft title | T086 | tests/integration/forms-builder-persistence.test.ts::rejects whitespace English form names before creating a draft; full F15 Stack D integration 9 files / 64 tests. | 2833e19 |
| FR-038 / FR-039 Ã¢â‚¬â€ accessible signup field errors and focus behavior | T091 | tests/unit/client-accounts-form.test.ts::does not run the signup focus effect after a touched identity field edit; tests/e2e/client-welcome.spec.ts; full unit 194 files / 2,357 tests and Playwright 79/79. | 2833e19 |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ rendered intake evidence | T095 | tests/e2e/forms-authorized-route.spec.ts; 60 screenshots, axe clean in all states; INDEX.md enumerates all 126 PNG files in the run directory; reviewed EN dark 1440 N11 capture. | 2833e19 |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ exact S34 English copy | T096 | tests/unit/forms-s32-approved-intake.test.ts; tests/e2e/forms-authorized-route.spec.ts exact assertions for T08.system, N07, and N11. Full unit 2,357/2,357; Playwright 79/79. | 2833e19 |
| FR-008 / FR-013 Ã¢â‚¬â€ correction_note bounds | T097 | tests/integration/forms-r3-corrections.test.ts 2/2; migration 20261108020000_f15_correction_note_bounds.sql applied on clean Stack D replay. | 1ed864e |
| FR-012 / FR-017 / FR-018 / FR-024 Ã¢â‚¬â€ lifecycle-gated alerts and purge cleanup | T098 | tests/integration/forms-alerts.test.ts 7/7; tests/integration/forms-alert-mutations.test.ts 4/4; migration 20261108020100_f15_cancel_alerts_after_lifecycle_end.sql applied on clean Stack D replay. | 1b52aeb |
| FR-007 / FR-008 Ã¢â‚¬â€ S34-PO-6 autosave migration repair | T100 | Authorized CREATE OR REPLACE FUNCTION and max_chars edit in 20261108010200; clean Stack D reset/replay applied migrations through 20261108020600; tests/integration/forms-r3-drafts.test.ts passed. | 1e8f2b0, be7ac9a |
| FR-024 / FR-025 Ã¢â‚¬â€ no-ff restack and merge-tree equivalence | T102 | git merge-tree --write-tree origin/main HEAD = 2c8c978942c5182f88179cd718e3263d64275bfb = HEAD tree. | 2833e19 |
| FR-013 / FR-019 Ã¢â‚¬â€ relationship-ended correction access | T103 | tests/integration/forms-r3-corrections.test.ts; tests/e2e/forms-authorized-route.spec.ts; full Stack D integration 64/64 and Playwright 79/79. | 2833e19 |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ localized slider labels and validator parity | T104 | tests/integration/forms-builder-persistence.test.ts 22/22; tests/unit/forms-s32-approved-intake.test.ts; clean Stack D replay applied 20261108020200_f15_localized_slider_labels.sql. | 62158e1 |
| FR-019 Ã¢â‚¬â€ dedicated purge scheduler lock | T105 | tests/integration/forms-purge.test.ts::uses a dedicated purge scheduler lock without changing alert evaluation locks; file passed 3/3 on Stack D. | 205ecc3 |
| FR-024 Ã¢â‚¬â€ configured-origin Playwright cookies and URLs | T106 | tests/e2e/forms-client.spec.ts, tests/e2e/client-welcome.spec.ts, tests/e2e/packages.spec.ts; complete F15 Playwright run 79/79. | 2833e19 |
| FR-004 / FR-006 Ã¢â‚¬â€ production staff failures use generic messages | T107 | tests/e2e/forms-production-route.spec.ts; complete F15 Playwright run 79/79. | 2833e19 |
| FR-026 / FR-036 / FR-037 Ã¢â‚¬â€ portable S34 PO source citations in plan and Analyze artifacts | T089 | `tests/unit/forms-s14-decision-fixture.test.ts::keeps plan PO citations portable and catches absolute-path regressions` passed 1/1 (focused file 7/7 with B's existing metadata test) on commit `0adb43a` and the merged B tree. | 0adb43a |
| FR-008 / FR-013 / FR-020 Ã¢â‚¬â€ current assignment authorization and snapshot filtering for correction history | T090 | RED: focused `tests/unit/forms-submission-routes.test.ts` initially failed because the authorized correction-history GET route was absent on A. GREEN: `tests/unit/forms-submission-routes.test.ts::filters correction-history keys to the current assignment snapshot`; focused file 9/9. T090 scope was narrowed so correction-write revision validation remains owned by T082. | `da31455`, `508fedf`, `cf79fa7` |
| FR-008 / FR-013 - correction_note Unicode code-point and UTF-8 byte bounds before RPC and in the database | T097 | A commit 1ed864e; tests/unit/forms-corrections.test.ts and tests/unit/forms-submission-routes.test.ts 15/15; clean Stack D migration replay; tests/integration/forms-r3-corrections.test.ts 2/2. | 1ed864e |
| FR-012 / FR-017 / FR-018 / FR-024 ? lifecycle-gated client-late alerts and relationship-end cleanup | T098 | Commit 1b52aeb; Stack D clean replay; tests/integration/forms-alerts.test.ts 7/7 and tests/integration/forms-alert-mutations.test.ts 4/4, including crash-safe function MD5 restore. | 1b52aeb |
| FR-007 / FR-008 - draft intent idempotency and altered-payload conflict | T012 | CodeRabbit z3L1w follow-up on commit 34f30a4; tests/integration/forms-r3-drafts.test.ts 1/1 on Stack D; baseline now replays the already-saved selectionKey value before testing an altered payload. | 34f30a4 |
| FR-026 / FR-036 / FR-037 - portable S34 PO source citations in plan and Analyze artifacts | T089 | `tests/unit/forms-s14-decision-fixture.test.ts::keeps plan PO citations portable and catches absolute-path regressions` passed 1/1 (focused file 6/6) on commit `0adb43a`. | 0adb43a |


## S35 remediation evidence

| FR | Task | Test | Evidence |
|---|---|---|---|
| FR-024/025 | T101 | `tests/unit/ci-local-e2e.test.ts::uses the Vite runner config loader for integration tests`; Stack D `tests/integration/password-policy-parity.test.ts` (58 passed) | Commit `44573b1`; unit 2/2 and Stack D integration 1 file/58 tests passed on commit `44573b1`. Database StartedAt remained `2026-11-06T01:41:22.769866059Z`. |
| FR-024/025 | T111 | `specs/015-forms-intake/traceability.md` T012 row restored from literal escape/control characters to a valid heading, path, and commit IDs; recorded in A-to-B merge `759a1b5`. | `759a1b5` |
| FR-004/006/008 | T102 | `tests/integration/forms-r3-drafts.test.ts` direct-RPC N08 budget/foods regression; full Stack D integration 9 files / 64 passed; `tests/unit/forms-s14-validation.test.ts` 9/9. | `83e32c4` |
| FR-008/013 | T103 | `tests/integration/forms-r3-corrections.test.ts` rejects correction keys outside the immutable assignment snapshot; full Stack D integration 9 files / 64 passed. | `e7bb25e` |
| FR-038/039 | T105 | `tests/integration/client-signup-transaction.test.ts` whitespace name SQL regression, Stack D 11/11; includes leading/trailing tab/newline cases. | `a1782ba` |
| FR-038/039 | T106 | `tests/integration/client-signup-transaction.test.ts` repaired Unicode regex regression, Stack D 11/11. | `f21bae6` |
| FR-008/013 | T108 | `tests/integration/forms-r3-drafts.test.ts` 4 KiB byte-bound baseline uses defined in-snapshot `q2`; full Stack D integration 9 files / 64 passed. | `27ac027` |
| FR-024/025 | T109 | `specs/015-forms-intake/quickstart.md` resolves repository and Stack D paths from current checkout; `format:check` passed. | `f779402` |
| FR-024/025 | T110 | `specs/015-forms-intake/reports/evidence/s18-r4/index.md` lists the 50 verified S18 screenshots and hashes; copied capture hashes matched the review-provided source set. | `722c3a2` |
| FR-024/025 | T111 | Analyze S33 status marked historical; S30 quotation/S31 source label repaired; T012 traceability row restored in B stack merge. `format:check` passed. | `f779402`, `759a1b5`, `c7b9de9` |
| FR-038/039 | T112 | `tests/unit/client-signup-form.test.tsx` pending-state helper coverage (included in current B unit total) and `tests/e2e/client-signup.spec.ts` pending-submit blur test; signup Playwright 4/4. | `9497611` |
| FR-026/036/037 | T113 | `tests/integration/forms-builder-persistence.test.ts` exact localized N11 copy; Stack D F15 integration 9 files / 64 passed after migration 210 and updated drift guard contract. | `aede2cb`, `26a3438`, `4332f2f` |
| FR-039 | T114 | `tests/unit/client-signup-validation.test.ts` future DOB cases passed in focused 27/27 run; `tests/e2e/client-signup.spec.ts` 4/4 on Stack D. | `9e0cb6f` |