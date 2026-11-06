# S31 h9 verification — working report

## Entry gate

- Spec FRs/SCs/scenarios: PASS for the touched existing PR scope (`specs/015-forms-intake/spec.md` FR-012, FR-006, FR-030, FR-034, FR-037; measurable SC and Given/When/Then acceptance scenarios are present).
- Clarifications: PASS for the existing PR fix scope; binding PO decisions are cited in the spec and S30-PO-1 Q2. No open ambiguity is assumed. S31-Q1 and S31-Q2 remain explicit PO decisions below.
- Plan/tasks: PASS; existing tasks T006, T008, T023, T024, T037 and T053 cover the touched scope in `plan.md` and `tasks.md`. This is the S29-PO-3 Q6 existing-open-PR remediation exception.
- Analyze: checklist exists at `checklists/analyze.md`, dated 2026-10-30, reports zero open CRITICAL/HIGH. It predates later doc edits; no spec/plan/tasks content is changed in this round.
- Overall: PASS under existing PR exception; no new product task is started.

## Baseline and thread inventory

- Branch `015-forms-intake`, baseline `23d769bfcff8ee6577af1a8968485b93d6385703`; PR #44 base `main`.
- Paginated GraphQL query: `reviewThreads(first:100)` with `pageInfo.hasNextPage` loop. 46 total threads; 12 unresolved.
- Current unresolved IDs are listed in the final review section below.

## Work log

- Corrected the retention open-question in `S14-terms-draft.md` by removing only the superseded bullet; the approved Terms text is unchanged.
- Applied client assignment label normalization, Telegram claim-RPC retry path, validated harness DB URL, Cairo-relative DOB fixture, UTF-8 Arabic E2E fixtures, and client controls. Focused unit gate currently passes 3 files / 26 tests before the new UI regression cases.
- Working on forward-only SQL fixes and RED/GREEN evidence.

## S31-R1 and PO boundary

- Removed only the superseded retention question at `S14-terms-draft.md:63`; the approved 30-day sentence is byte-identical to the baseline. The open-question is superseded by S30-PO-1 Q2, scoped to `015-forms-intake@5084916`. RET-3 remains the production gate for all-copy legal/technical feasibility.
- `PRRT_kwDOVYgYQ86zPo-l` is eligible for reply/resolve after commit: cite S30-PO-1 Q2 and S31-R1.
- PO-pending: `PRRT_kwDOVYgYQ86zTsYt` (Arabic consent paragraph; S31-Q1) and the middle-label required/optional part of `PRRT_kwDOVYgYQ86zTsYy` (S31-Q2). Both replies must say `awaiting PO decision (S31-Q1/Q2)`; neither is to be resolved.

## Fix inventory and evidence

| Thread | Change | RED / regression evidence | GREEN evidence |
|---|---|---|---|
| TsZD | First Save (`expected_revision=0`) creates forms + version 1 in forward migration 07010000 | Pre-migration Stack D test returned `missing`; 15-test persistence suite includes committed missing-row mutant | Focused persistence suite 15/15; exact first-save row/version assertions |
| TsZL | Approval reconcile materializes policy facts, frozen occurrence, Cairo D+3 deadline and `client_late` schedule | Pre-fix focused assignment consumer suite failed at SQL variable/column ambiguity; acceptance assertions pin policy/configurer/deadline/schedule | Assignment consumer test passed in focused Stack D run after corrective migration 07020000 |
| TsZT | Null-safe recurrence interval validation in configure + core materializer | Regression covers omitted and explicit JSON null on both paths | Cohort assignment test passed in focused Stack D run |
| TsYy (technical parity) | SQL validator rejects choices on non-choice types and `contains` unless its source is multiChoice; TypeScript validates optionLabels count/shape | Pre-migration validator accepted boolean choices; migration mutant suite kills choices and contains regressions | Persistence suite 15/15; unit focused UI/type tests passed |
| TsZd | Restored Arabic E2E fixture strings to actual UTF-8 | Byte review of fixture diff | Focused tests compiled and passed |
| TsZi | DOB test date derives from `calculateAgeInCairo(..., new Date())` | Baseline fixture used fixed 2027 date; test now asserts against Cairo test clock | Focused unit test suite passed |
| TsZs | Integration uses validated `loadEnv().dbUrl` | Previous integration used raw `process.env.DB_URL` | Focused integration suites run through the validated harness wrapper |
| TsYV | Staff `label` localized copy normalized into required `title` field | Unit regression added | Focused unit tests passed |
| TsYq | Claim RPC errors call `jobs_fail` with `permanent:false` | Unit regression exercises retryable claim failure | Focused unit tests passed |
| TsYR | Client controls for approved slider, imageChoice, mealCount, derivedChoice, displayOnly; localized choice labels | SSR regressions cover displayOnly, labels, slider feedback; initial UI RED showed `optionLabels` rejected by client parser | Focused UI unit suite passed; full rendered matrix pending final Playwright gate |
| Po-l | Removed superseded open-question only | N/A (decision was previously approved) | Terms bytes unchanged; report cites S30-PO-1 Q2 + S31-R1 |

### SQL mutation evidence

| Function / invariant | Mutant | Cleanup |
|---|---|---|
| `app_private.f15_valid_builder_definition(jsonb,boolean)` | Choices-on-boolean and `contains`-from-shortText mutants are executed; named parity assertions kill both | `withCrashSafeFunctionMutant` stores full function + MD5, restores in `finally`, verifies MD5; persistent crash guard includes the new function |
| `app_private.save_workspace_form_draft(...)` | First-save missing-row mutant is executed against the persistence invariant | Same full-definition/MD5 restore helper |
| `app_private.reconcile_f15_form_assignment(uuid,uuid)` | D+3 deadline changed to D+4; approval-consumer expectation kills mutant | Full definition + MD5 capture/restore in `finally`; guard inventory includes the function |
| `public.configure_intake_assignment_policy(...)` / `app_private.materialize_intake_assignment_occurrence_core(...)` | Remove the missing/null interval guards; configuration and materialization assertions kill both mutants | Full definitions and MD5s are captured/restored with `withCrashSafeFunctionMutant`; focused cohort assignment suite passed 8/8 |
| All functions in `guardedFunctions` | Simulated abandoned mutant per identity; guard restores from defining migration and fails loudly | `function-drift-guard.test.ts` passed 1 test over the complete inventory; per-mutant captured MD5 is checked after restore |
## Forward migrations

- `20261107010000_f15_review_fixes.sql` — first-save, validator parity, recurrence checks and assignment reconciliation.
- `20261107020000_f15_approval_assignment_facts_fix.sql` — forward correction for PL/pgSQL name ambiguity found by Stack D test.
- Remote scan: `git ls-remote --heads origin` enumerated 76 refs; highest existing remote version is `20261107005000`; both new versions are greater and absent on all origin refs. `git log --all -- supabase/migrations` reviewed. Migration timestamp checker: 163 migrations, 11 documented merged exceptions.
- Both migrations applied to Stack D through the approved Node launcher. No pushed migration was edited.

## Integration triage (h8 reproducible non-F15 failures)

| Failure | Live function MD5 vs defining migration | Main comparison | Classification / evidence |
|---|---|---|---|
| branding-owner-gc stale attached upload | `app_private.branding_gc_finalize(uuid)` matches `20261102134000_branding_upload_recovery.sql`: `0f1dcfbc3f0b5a98170a0f79dafb9802`; `public.branding_gc_finalize(uuid)` matches `20261102133000_branding_gc_service_role_isolation.sql`: `a8c69cc15fdfd8ede73c1c40012dfcbf` | Defining migrations are unchanged vs origin/main; this suite has branch-only test changes | Branch-only failure surface; Stack D drift ruled out by exact MD5. No non-F15 function changed. |
| branding-upload-recovery ×2 | Same installed private/public GC function hashes above | Defining migrations shared with main; recovery test file is common in the branch comparison | Shared-with-main database implementation; no Stack D drift. Failures are h8's stale-status/stale-GC expectations; do not change outside F15. |
| catalog-server taxonomy search | `public.catalog_search(text,text,jsonb,text,uuid)` matches `20261106121000_catalog_food_defaults_and_search.sql`: `927a0d0371d0d5b4563c785bc1d0794c` | Migration unchanged vs origin/main; catalog test unchanged vs origin/main | Shared with main; Stack D drift ruled out. |
| client-accounts-recovery timeouts | `public.recovery_link_authorize(uuid)` matches 20261028120000: `c0edfee5d0fd01527ad0a9e852ca843e`; `public.recovery_link_record(uuid)` matches same migration: `7e8f934b9162041544eb163d7af88a58` | Migration shared with main; recovery test differs on branch | Branch-only timeout reproduction surface; installed function drift ruled out. No recovery code changed. |

The MD5 comparison used `md5(pg_proc.prosrc)` on Stack D and the body extracted from each named defining migration. This is evidence about SQL function bodies only; it does not identify an infrastructure cause for timeouts. Triage is provided for architect ruling.

## Frontend Design Gate

- Authority: `DESIGN.md` and Design System tokens/components remain authoritative; no token, shared component, color, spacing, radii, font or animation was added. CSS uses existing token references. Design-system/skill conflicts resolve in favor of PO-approved Design System.
- Skill catalog reviewed in full (54 entries; the per-skill APPLIES/NOT APPLICABLE table with one-line reasons is in [S30-h8-verification.md](S30-h8-verification.md), retained as the lane's catalog review). Applied `frontend-design`, `impeccable`, `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-accessibility`, `better-writing`, `interface-review`, `emil-design-eng`, `baseline-ui`; `ui-ux-pro-max` lookup-only. Motion skills do not apply: no motion behavior was added. Native, video, 3D and unrelated tool skills are not applicable. `DESIGN.md` overrides skills that conflict with its authority. Remaining design/copy gaps are S31-Q2 and S31-Q3 below.
- Implemented controls use existing FormPreview patterns, form copy/messages and N11/type fixtures. No new visible copy was invented. Slider middle-label requirement remains pending S31-Q2.
- Existing authorized-route matrix screenshots and zero-violation axe results are listed below. They cover B01/B02/goal, not the new control branches. **The new-control rendered matrix is blocked** because the approved browser fixture lacks bilingual control copy/options and some N11 EN strings are explicitly PO-review pending. The control implementation's SSR unit regressions are green; this does not satisfy the visual matrix requirement.
- Verification checklist: tokens/no hard-coded style values PASS; Geist/IBM Plex Sans Arabic and existing Bidi handling PASS; layout consistency PASS by source review; existing-route light/dark contrast and sample-brand semantics PASS; keyboard/screen-reader/axe PASS for existing route only, **new controls blocked**; loading/empty/error/success/disabled/pending/interaction states PASS only for existing route and **new controls blocked**; no new strings or dependencies PASS; screenshots/axe **partial, new-control visual matrix blocked**; UI unit tests and size PASS, **new-control route/axe E2E absent**.

## Signup blob delta

Signup-profile files are unchanged from `5084916` and `55736fa` in this round. No Hero re-sync or S30-R1 signup source edits were made. The only new non-F15 integration test change in this round is `client-signup-transaction.test.ts` harness URL validation; it is not a signup-profile blob change.

## Final gates and review

Implementation commits: `336a379` (Task T006; FR-006/FR-030/FR-034/FR-037), `b76f485` (Task T006; FR-030/FR-037), `a3d652f` (Task T023; FR-034), `a5bd459` (Task T008; FR-034), and `72f3c3a` (Task T010; FR-003/FR-031). Each commit body has Task and FR trailers. Final report commit, full review poll, paginated final unresolved IDs and exact report commit will be appended after the final-head run.

## PO-DECISION-NEEDED

- **S31-Q1 / TsYt** — Arabic consent paragraph differs from English/signup contract. Options: PO approves revised Arabic wording; PO approves an aligned EN/AR wording; PO explicitly accepts current approved copy despite discrepancy. Recommendation: PO supplies/approves aligned text. Implication: changing text or legal consent meaning is blocked; thread stays open.
- **S31-Q2 / TsYy** — Is the slider middle label required or optional? Options: require it in both TypeScript/SQL; allow omission in both; define type-specific rules. Recommendation: PO chooses the contract consistent with N11. Implication: parity for this field and resolving TsYy are blocked; other parity items are fixed.
- **S31-Q3 / client control visual fixture** — `specs/015-forms-intake/spec.md:349-353`, `tests/e2e/forms-authorized-route.spec.ts` matrix. The new controls need an approved bilingual fixture to be rendered in a real assigned client form. Proposed neutral copy for the existing N11 slider: EN “How hungry do you feel, from 0 to 10?” / AR “بتقيّم إحساسك بالجوع كام من 10؟”; keep the canonical Arabic endpoint and feedback labels from `fixtures/mandatory-intake-copy-ar.md`. Options: PO approves these exact English strings and allows them only as a test fixture; PO supplies alternate approved EN/AR fixture copy; defer screenshots until the existing translation review is complete. Recommendation: approve the listed canonical N11 strings for test-only rendering or supply a replacement. Implication: only the new-control screenshot/axe visual sub-gate is blocked; no unapproved copy is added to product or tests.

### Final-head verification update — `72f3c3a`

- **Unit:** PASS, 188 files / 2,315 tests.
- **Lint / typecheck / format check / secrets / size / migration timestamp check / diff check:** PASS. Migration checker: 163 timestamps, 11 documented merged exceptions. Size: web 8,713.88 KiB (13.30%); cron 11.76 KiB (0.02%).
- **Build / edge build:** PASS, sequentially.
- **Full Stack D integration, final `72f3c3a`:** FAIL, 1,052.99s; 114 files passed, 2 skipped, 7 failed; 1,594 tests passed, 2 skipped, 10 failed. F15 suites passed, including null/omitted recurrence mutants, approval deadline mutant, builder parity/first-save mutants and all drift-guard mutants. A targeted rerun of audit, branding-owner-gc, branding-upload-recovery, catalog-server, client-accounts-recovery and registration-links returned 31 passed / 9 failed across five files. The affected suite surfaces from h8 remain: attached-upload GC, attachment-failure status/stale-GC, taxonomy search and two recovery operations. Exact assertions differed under load: the stale-attached-upload test hit serialization conflict `40001` before its cleanup assertion; another branding GC case exceeded the 300,000 ms bound by 433 ms; branding recovery also timed out at 30 seconds. The catalog and two recovery assertions matched the h8 failure descriptions. The audit visibility query also timed out (`57014`). The seventh failure in the full run was a registration-links fixture precondition (`registration_links` insert guard); that suite passed in the targeted rerun. The large catalog benchmark's reported version count grew from 55,142 to 55,331 across repeated full runs; accumulated synthetic data may explain additional latency, but this is an inference, not a proven cause. No non-F15 function or test was changed.
- **Focused Playwright, port 3315:** 45 passed / 5 failed / 50 total. The five are the same h8-known shared failures: package empty state AR and EN, registration-link 404 AR and EN, and dependent late issuance after the 404. F15 route, correction and autosave tests, plus sample-brand axe test passed.
- **Stack D before/after fingerprint:** DB `pg_postmaster_start_time=2026-11-02T18:43:08.017Z`, `cron.job=0`; container `StartedAt=2026-11-02T18:43:05.538142345Z`. No lifecycle operation was used.
- **Screenshots:** `%TEMP%/lifter-s31-f15-h9/INDEX.md` and 24 existing authorized-route screenshots (AR/EN × light/dark × 390/1440, B01/B02/goal). Route axe was zero. These screens do not contain the new client control branches. The approved route fixture lacks their bilingual option/copy records, and some N11 EN copy remains PO-review pending; no copy was invented. **The new-control rendered matrix/axe sub-gate is BLOCKED** until PO-approved fixture data is available. SSR unit regressions cover the new controls.
- **Focused mutation suites:** `forms-assignment-mutations.test.ts` 4/4 passed after its catch-up mutant was aligned to the null-safe recurrence guard. `forms-cohort-assignment.test.ts` 8/8 passed with missing/null interval mutants. `forms-r3-assignment-consumer.test.ts` 2/2 passed with the D+3 deadline mutant. `forms-builder-persistence.test.ts` 15/15 passed with killed choices/contains/first-save mutants. `function-drift-guard.test.ts` 1/1 passed across the current guard inventory, restoring each function and checking MD5.

### CodeRabbit and final review-thread state

- One `@coderabbitai full review` request was posted to PR #44. The full 40-minute poll completed; no new full-review comment or finding appeared. CodeRabbit replied on the already-resolved Terms thread agreeing that S30-PO-1 Q2 approved the text and RET-3 remains separate. No new finding was identified.
- Final paginated GraphQL inventory used `reviewThreads(first:100)` with `pageInfo.hasNextPage` loop: 46 total threads, 2 unresolved. Fixed threads TsZD, TsZL, TsZT and TsZs were replied to with commit/test evidence and resolved. The resolved Po-l Terms thread has the S30-PO-1 Q2 + S31-R1 reply. PO-pending TsYt and TsYy each received `awaiting PO decision (S31-Q1/Q2)` and remain unresolved.
- **Complete unresolved IDs:** `PRRT_kwDOVYgYQ86zTsYt`, `PRRT_kwDOVYgYQ86zTsYy`.

Signup-profile file deltas vs `5084916` and `55736fa`: **none**.
