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
| All functions in `guardedFunctions` | Simulated abandoned mutant per identity; guard restores from defining migration and fails loudly | `function-drift-guard.test.ts` passed 1 test over the complete inventory; per-mutant captured MD5 is checked after restore |
| Recurrence and assignment policy functions | Functional missing/null and policy-fact regressions execute on Stack D; dedicated line-kill mutants are not yet recorded | Guard inventory includes configure/materialize/reconcile definitions |

## Forward migrations

- `20261107010000_f15_review_fixes.sql` — first-save, validator parity, recurrence checks and assignment reconciliation.
- `20261107020000_f15_approval_assignment_facts_fix.sql` — forward correction for PL/pgSQL name ambiguity found by Stack D test.
- Remote scan: `git ls-remote --heads origin` enumerated 76 refs; highest existing remote version is `20261107005000`; both new versions are greater and absent on all origin refs. `git log --all -- supabase/migrations` reviewed. Migration timestamp checker: 163 migrations, 11 documented merged exceptions.
- Both migrations applied to Stack D through the approved Node launcher. No pushed migration was edited.

## Integration triage (h8 reproducible non-F15 failures)

| Failure | Live function MD5 vs defining migration | Main comparison | Classification / evidence |
|---|---|---|---|
| branding-owner-gc stale attached upload | `app_private.branding_gc_finalize(uuid)` matches 070? `20261102134000_branding_upload_recovery.sql`: `0f1dcfbc3f0b5a98170a0f79dafb9802`; `public.branding_gc_finalize(uuid)` matches `20261102133000_branding_gc_service_role_isolation.sql`: `a8c69cc15fdfd8ede73c1c40012dfcbf` | Defining migrations are unchanged vs origin/main; this suite has branch-only test changes | Branch-only failure surface; Stack D drift ruled out by exact MD5. No non-F15 function changed. |
| branding-upload-recovery ×2 | Same installed private/public GC function hashes above | Defining migrations shared with main; recovery test file is common in the branch comparison | Shared-with-main database implementation; no Stack D drift. Failures are h8's stale-status/stale-GC expectations; do not change outside F15. |
| catalog-server taxonomy search | `public.catalog_search(text,text,jsonb,text,uuid)` matches `20261106121000_catalog_food_defaults_and_search.sql`: `927a0d0371d0d5b4563c785bc1d0794c` | Migration unchanged vs origin/main; catalog test unchanged vs origin/main | Shared with main; Stack D drift ruled out. |
| client-accounts-recovery timeouts | `public.recovery_link_authorize(uuid)` matches 20261028120000: `c0edfee5d0fd01527ad0a9e852ca843e`; `public.recovery_link_record(uuid)` matches same migration: `7e8f934b9162041544eb163d7af88a58` | Migration shared with main; recovery test differs on branch | Branch-only timeout reproduction surface; installed function drift ruled out. No recovery code changed. |

The MD5 comparison used `md5(pg_proc.prosrc)` on Stack D and the body extracted from each named defining migration. This is evidence about SQL function bodies only; it does not identify an infrastructure cause for timeouts. Triage is provided for architect ruling.

## Frontend Design Gate

- Authority: `DESIGN.md` and Design System tokens/components remain authoritative; no token, shared component, color, spacing, radii, font or animation was added. CSS uses existing token references. Design-system/skill conflicts resolve in favor of PO-approved Design System.
- Skill catalog reviewed in full (54 catalog entries; see h8 table for entry-by-entry NOT APPLICABLE/APPLIES decisions). Applied `frontend-design`, `impeccable`, `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-accessibility`, `better-writing`, `interface-review`, `emil-design-eng`, `baseline-ui`; `ui-ux-pro-max` lookup-only. Motion skills do not apply: no motion behavior was added. Native, video, 3D and unrelated tool skills are not applicable. `DESIGN.md` overrides skills that conflict with its authority. No design-gap beyond S31-Q2 middle-label decision.
- Implemented controls use existing FormPreview patterns, form copy/messages and N11/type fixtures. No new visible copy was invented. Slider middle-label requirement remains pending S31-Q2.
- Visual matrix, screenshot paths, axe results, and detailed contrast/focus/state review will be recorded from final 3315 Playwright run below.

## Signup blob delta

Signup-profile files are unchanged from `5084916` and `55736fa` in this round. No Hero re-sync or S30-R1 signup source edits were made. The only new non-F15 integration test change in this round is `client-signup-transaction.test.ts` harness URL validation; it is not a signup-profile blob change.

## Final gates and review

Final implementation commit, trailers, complete gates, D fingerprint, screenshot index, CodeRabbit review/poll, paginated final unresolved IDs and exact commit will be appended after the final-head run.

## PO-DECISION-NEEDED

- **S31-Q1 / TsYt** — Arabic consent paragraph differs from English/signup contract. Options: PO approves revised Arabic wording; PO approves an aligned EN/AR wording; PO explicitly accepts current approved copy despite discrepancy. Recommendation: PO supplies/approves aligned text. Implication: changing text or legal consent meaning is blocked; thread stays open.
- **S31-Q2 / TsYy** — Is the slider middle label required or optional? Options: require it in both TypeScript/SQL; allow omission in both; define type-specific rules. Recommendation: PO chooses the contract consistent with N11. Implication: parity for this field and resolving TsYy are blocked; other parity items are fixed.
