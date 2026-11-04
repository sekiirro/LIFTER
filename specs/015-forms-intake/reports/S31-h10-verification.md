# S31 h10 verification

Date: 2026-11-04

Branch/PR: `015-forms-intake`, #44 (`main`)

Starting code head: `3365f510f8dd60fd2283c41b5b2dfc911075bee8`

Implementation commit: `89c89ac` (Task: T033, T034; FR: FR-004, FR-006, FR-007, FR-026, FR-036, FR-037)

## Scope and decision record

Applied S31-PO-1 Q1 and Q2 and S31-R2/R3 to the existing PR under S29-PO-3 Q6. No product decision was inferred. No non-F15 SQL function was changed. D remains the selected Stack D; no Stack D lifecycle command was run.

### Spec Kit entry check

| Check | Result | Evidence |
| --- | --- | --- |
| Numbered FRs, measurable SCs, Given/When/Then scenarios for touched scope | PASS | `specs/015-forms-intake/spec.md`, FR-004/006/007/026/036/037, SC section and acceptance scenarios (including lines 92–112 and the client intake flow). |
| Clarifications/decision source and explicit ambiguity state | PASS | Existing F15 decisions and S31-PO-1 Q1/Q2; no additional product ambiguity introduced by these changes. No open ambiguity for the approved copy or middle-label requirement. |
| Plan and task IDs tagged to FRs | PASS | `specs/015-forms-intake/plan.md`; `tasks.md`, T033 [FR-026/036/037] and T034 [FR-004/006/007]. Existing task checkboxes were not changed. |
| Analyze after final spec/plan/tasks changes, zero open CRITICAL/HIGH | FAIL chronology; continued under existing-PR exception | `specs/015-forms-intake/checklists/analyze.md` is dated 2026-10-30; `tasks.md` last changed 2026-11-03. S29-PO-3 Q6 permits approved CodeRabbit/CI fixes on an existing open PR; no new task or requirement was added. |

No requirements, plan, task, constitution, DESIGN.md, or PO-decision record was changed. No task checkbox was newly ticked. Existing checkboxes remain as authored.

## S31-PO-1 Q1 — Arabic Terms paragraph

Replaced only the approved sentence in the Arabic Terms paragraph in `specs/015-forms-intake/reports/S14-terms-draft.md` with the Q1 wording. No matching paragraph existed in Arabic i18n messages. Added the exact approved paragraph to `tests/fixtures/forms/approved-terms-copy.json` and a pinned-copy test that rejects the superseded sentence and a one-byte appended-space mutant.

The UTF-8 diff against `3365f51` is exactly one changed Arabic paragraph line; the surrounding Arabic text is byte-identical. Against `5084916`, the actual EN Terms paragraph and every other sentence in the AR Terms paragraph are unchanged; the only Terms-copy sentence difference is the Q1 replacement. Earlier S30 PO approval/status metadata and headings in the report are not copy changes. The B06 locale copy and B06 decision fixture did not change in this commit. `tests/unit/forms-approved-copy-s27.test.ts`: 4/4 passed; the superseded-sentence copy mutant is rejected.

## S31-PO-1 Q2 — required slider middle label

Changed `FormQuestion.labels.middle` to required and added forward migration `20261107030000_f15_slider_middle_label_required.sql`, which tightens the SQL validator. Updated the function drift-guard inventory to the new migration. The timestamp is unique and later than the highest migration across fetched origin refs (`20261107020000`). The migration was applied to Stack D, then its `schema_migrations` history was repaired to `applied` using the validated Stack D database URL; this was required because the first full integration run correctly detected the missing history row. The Stack D readiness test passed 1/1 after the history repair.

| Evidence | Result |
| --- | --- |
| TypeScript/runtime omission check (`forms-s14-validation.test.ts`) | PASS; included in targeted 10/10 unit run before final Q1-only test was added. |
| SQL missing-middle validator check (`forms-builder-persistence.test.ts`) | PASS on Stack D. |
| Crash-safe SQL mutant removing the required-middle predicate | KILLED; function body/MD5 captured and restored; drift guard passed. |
| Focused builder persistence + function drift guard | 18/18 PASS on Stack D. |

## S31-R3 — integration comparison

The baseline checkout was clean origin/main `d04ef52eb93df68b9361106a5ee4fd4fcaebb108`, run through the same safe wrapper/launcher against explicit Stack D. Suite source files identified as equal to main were compared before the runs. No schema reset/restart or data deletion outside test-owned cleanup occurred.

| Suite | Clean origin/main on D | Branch on D | Cause/evidence |
| --- | --- | --- | --- |
| `branding-owner-gc.test.ts` | Stale attached-upload assertion fails. | Two failures: stale `attached` status and missing expected old claim. | Main and branch share the stale attached failure; installed F14 function behavior is shared. Branch test delta is only crash-safe mutation capture/restore. The second branch failure is accumulated synthetic GC state; main/branch table counts recorded below. No non-F15 SQL change. |
| `client-accounts-recovery.test.ts` | BeforeAll committed recovery fixture fails. | 13/13 PASS after batching the same safe-column/RPC/HTTP probes in groups of six. | Branch delta was probe timeouts and a separate work-order target. Serial checks across all public RLS tables and RPCs caused the timeout; bounded batches retain the same assertions. Isolated reset case passed 70.5s; full branch suite passed 146.63s. |
| `branding-upload-recovery.test.ts` | Two failures: installed F14 attachment function contains the static stale-status update; stale GC row remains attached. | Same shared failures plus one GC batch result remains after expected cleanup. | Test file is identical to main and main CI passed it; clean main run reproduced the two failures on this accumulated D. The function body matches its defining migration; do not relax test or edit non-F15 SQL. |
| `catalog-server` taxonomy | PASS. | Taxonomy result absent in branch common run. | Suite files equal main; branch result occurred after synthetic catalog data had accumulated. Counts before/after are below; main run passed. Environmental data contamination is supported by sequence and counts, not asserted as a code fix. |
| `audit.test.ts` visibility | Statement timeout. | SQLSTATE `57014` instead of expected `42501` (timeout). | Suite file equal to main. Large audit table grew from 204,576 to 208,254 rows during branch common run; clean main also hit statement timeout. |
| Registration-link issue/open/integrity/flexible suites | PASS. | PASS. | 7-file common batch: all registration-link suites passed on both; no branch delta in those files. |

Common-suite evidence: clean main 7 files, 106 passed / 3 failed (two branding-upload, one audit); branch 7 files, 104 passed / 5 failed (same shared failures plus one stale GC timeout and one catalog taxonomy result). Logs: `C:/Users/NEW LAP/.lifter/runs/s31-luna-f15-h10/main-suite.log`, `main-branch-diff-suite.log`, `branch-diff-suite.log`, `branch-client-recovery-final.log`, `branch-common-suites.log`.

Relevant row counts immediately before → after the branch common run:

| Schema/table | Before | After |
| --- | ---: | ---: |
| `public.audit_events` | 204,576 | 208,254 |
| `public.catalog_addition_limits` | 1,312 | 1,314 |
| `public.catalog_food_name_keys` | 2,756 | 2,760 |
| `public.food_default_alternatives` | 66 | 66 |
| `public.food_lifecycle_events` | 132 | 132 |
| `public.food_serving_units` | 1,402 | 1,402 |
| `public.food_versions` | 1,402 | 1,402 |
| `public.foods` | 1,314 | 1,314 |
| `app_private.branding_credential_events` | 1,194 | 1,194 |
| `app_private.branding_credentials` | 575 | 575 |
| `app_private.branding_current_publications` | 739 | 739 |
| `app_private.branding_drafts` | 887 | 888 |
| `app_private.branding_gc_claims` | 106 | 70 |
| `app_private.branding_published_assets` | 335 | 335 |
| `app_private.branding_published_versions` | 807 | 807 |
| `app_private.branding_render_handles` | 874 | 874 |
| `app_private.branding_uploads` | 583 | 585 |
| `app_private.branding_validation_receipts` | 332 | 332 |

Full Stack D integration on the final implementation code before report commit: 123 files, 117 passed, 2 skipped, 4 files with 7 failures (1,599 passed / 2 skipped / 7 failed). Failures: `audit.test.ts` visibility timeout; `branding-owner-gc.test.ts` stale claim + stale attached upload; `branding-upload-recovery.test.ts` installed F14 status-update source, nonempty final GC batch, and validated draft attachment cleanup; `f13-stack-readiness.test.ts` did not yet see migration 07030000 in history. The missing migration-history entry was repaired and readiness then passed 1/1. The full integration suite was not rerun; the other six failures are shared/non-F15 issues listed above. No non-F15 SQL function was changed.

## S31-R2 — authorized-route matrix

The new-control fixture uses recorded source strings only. EN labels come from `spec.md`’s “EN translation — PO review” table and are marked in the test fixture as draft awaiting PO review; Arabic comes from `fixtures/mandatory-intake-copy-ar.md` or an existing approved contextual phrase. No new product string was authored.

The requested screenshots were not captured. On Stack D, the existing authorized AR route test reached `/forms/<assignment>` after the login redirect but rendered the generic unavailable alert; no question or control rendered. The new controls test hit the same state. The focused final Playwright batch on port 3315 ran 55 tests: 46 passed, 4 failed, 5 did not run. Failures were the existing authorized form route, the AR and EN registration-links authenticated acceptance checks, and the late-issuance/workspace-switch case. Thus no new-control axe scan can be claimed. Evidence: `test-results/forms-authorized-route-rea-d6c6f-N-theme-and-viewport-matrix-chromium/error-context.md` and the focused Playwright run output.

`%TEMP%/lifter-s31-f15-h10/INDEX.md` records the blocked matrix. Cells requested but blocked: slider, mealCount, displayOnly AR/EN × light/dark × 390/1440; derivedChoice AR × light/dark × 390/1440. S31-R2 source skips: imageChoice/N12 (no recorded percentage-specific card labels/values); derivedChoice EN (no recorded EN title). No screenshot paths or axe-zero claim are reported. An origin/main Playwright attempt could not start because Next/Turbopack failed to resolve `next/package.json` from the disposable baseline worktree, so branch-vs-environment causality for the route is unresolved.

## Frontend Design Gate

The full local design-skills catalog was read. This delta adds no rendered product component, token, style, motion, or interaction; it adds a route fixture for reviewing existing controls. `frontend-design`, `impeccable`, `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-accessibility`, `better-writing`, `better-interface`, `interface-review`, `emil-design-eng`, and `baseline-ui` were applied as review lenses only. The catalog marks several as conflicting with prior PO decisions; DESIGN.md and the implemented design system remain authoritative. `ui-ux-pro-max` is lookup-only and was not used because no design-system lookup was needed. Motion, native, Swift, 3D/WebGL, HyperFrames, and motion-review skills do not apply. No dependency was added.

| Checklist | Result |
| --- | --- |
| Tokens only / brand override | Not exercised by this fixture delta; no product styles changed. |
| Geist / IBM Plex Sans Arabic, hierarchy, bidi | Not visually verified because route did not render. |
| Layout/component consistency | No product component changed; screenshot review blocked. |
| Light/dark contrast and brand colors | Not visually verified; no screenshots. |
| Keyboard/focus/semantics/touch/reduced motion/axe | Existing route fixture did not render; not verified by this matrix. |
| Loading/error/success/disabled/pending states | Not fully matrix-verified; route reached generic unavailable state. |
| Bilingual copy | Fixture uses recorded strings only; Q1 approved paragraph pinned. |
| Matrix screenshots and design review | BLOCKED; see matrix INDEX. |
| Tests/dependencies/size | No new dependency. Size: 8,733.06 KiB uncompressed / 1,785.25 KiB gzip (13.33% of 64 MiB web limit); cron 11.76 KiB. |

## Gate results

| Gate | Result |
| --- | --- |
| Unit | 188 files / 2,318 tests passed, plus 6 unhandled errors in unchanged `tests/unit/registration-links-page.test.ts` (`store.getAll is not a function`). That test and `lib/supabase/public-session.ts` are unchanged from origin/main. |
| Lint | PASS, `npm run lint`. |
| Typecheck | PASS, `npm run typecheck`. |
| Format | PASS, `npm run format:check`. |
| Build | PASS, `npm run build`. |
| Edge build | PASS, `npm run build:edge` (Windows/WSL advisory only). |
| Secrets | PASS, `npm run check:secrets`. |
| Size | PASS, see Frontend Design Gate. |
| Migration timestamp checker | PASS, 164 timestamps / 11 documented merged exceptions. |
| `git diff --check` | PASS before commit. |
| Full Stack D integration | PARTIAL; counts and known non-F15 failures above. |
| Focused Playwright port 3315 | PARTIAL; 46 passed, 4 failed, 5 did not run; matrix blocked. |

Stack D fingerprint before/after: database container `StartedAt=2026-11-02T18:43:05.538142345Z` both times; PostgreSQL start time remained `2026-11-02 18:43:08.017082+00`; `cron.job=0`. No reset/restart.

Signup blob changes vs `5084916` and `3365f51`: none. The Q1 Terms paragraph is in `S14-terms-draft.md`, not a signup-profile file.

## PR review and outstanding status

- Pushed implementation commit `89c89ac` to PR #44.
- Replied to `PRRT_kwDOVYgYQ86zTsYt` citing S31-PO-1 Q1 and the exact-copy regression. The thread was already resolved; it remains resolved.
- Replied to and resolved `PRRT_kwDOVYgYQ86zTsYy` citing S31-PO-1 Q2, migration `20261107030000`, focused Stack D tests, and the prior parity fix in `3365f51`.
- Paginated GraphQL review-thread query: 46 total threads, 1 page; before the TsYy resolution the only unresolved ID was TsYy. Final post-review count will be recorded after the required poll.
- Posted the one `@coderabbitai full review` request at 2026-11-04 01:50:11 UTC. The full 40-minute poll ends no earlier than 02:30:11 UTC. Findings and final unresolved IDs remain pending until then.
- Do not merge while Stack D integration remains red.

## PO-DECISION-NEEDED

None. S31-PO-1 Q1/Q2 supply both product decisions. S31-R2 explicitly directs skipping the two cells without recorded source strings; the route evidence failure is technical and does not imply a new product decision.
