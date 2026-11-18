# F15 Forms/Intake Verification Report (T029 & T024)

- **Date (UTC):** 2026-11-18
- **Lane:** `s65-hyd-f15purge`
- **Base `origin/main`:** `605b30b3a27cf2b6aae1b4d2e1e2e563ea1e1c56`
- **Stack:** Stack D (`lifter-stack-d`, API `127.0.0.1:45421`, DB `127.0.0.1:45422`, `PLAYWRIGHT_PORT=3104`) via `supabase-safe.mjs`
- **Toolchain:** Node `v24.19.0`, Vitest `5.1.0`, Playwright `1.64.1`, Next.js `16.4.6`

## 1. T029 — D1 Privacy Erasure Migration & Mutation Evidence

- **Migration:** `supabase/migrations/20261215030000_f15_d1_privacy_erasure.sql` (forward-only, no UTF-8 BOM, scheduler inactive).
- **Unit contract (`tests/unit/forms-d1-erasure-migration.test.ts`):** RED (`2 failed` before migration) -> GREEN (`2/2 passed`); `tests/unit/forms-erasure-targets.test.ts` (`11/11 passed`).
- **Stack D integration (`tests/integration/forms-d1-erasure.test.ts`):** `3/3 passed`, verifying:
  - `audit_events_select_scoped` preserved; 0 `DELETE` policies or grants on `public.audit_events`; `UPDATE`/`DELETE`/`TRUNCATE` and caller-settable GUC alone rejected even as `postgres`.
  - `anon`, `authenticated`, and `service_role` denied `EXECUTE` on all `app_private` D1 functions; `owner = postgres`, `search_path = ""`.
  - Erasure strips only currently inapplicable answer keys across all `public.form_answer_revisions` and `public.form_answer_drafts` while keeping applicable keys intact; deletes only matching `answer_change` (`form.answer_corrected`, `form.draft_saved` on `form_answer_drafts`) and `access_view` (`form.answer_viewed` current/draft/history) audit rows while preserving `form.submitted`, builder `form.draft_saved`, clean-revision views, financial, auth, and foreign-tenant audit rows.
  - Counts-only zero-ID control record (`app_private.form_d1_erasure_controls`, append-only) and atomic rollback on control-table trigger failure.
  - Active `app_private.form_legal_holds` defers erasure, records deduplicated `app_private.form_d1_erasure_hold_alerts` + IDs-only `form.erasure_deferred` audit event, and resumes via `app_private.f15_d1_erasure_run_batch` after hold release without a new branch change.
  - Cross-tenant calls fail closed (`not_found`); idempotent rerun returns `no_targets` with zero changes.

### Live SQL Mutation Probes (savepoint-isolated, rolled back, `git diff` clean)

| Probe | Target                                                 | Mutant                                                                                                  | Detector                                                                   | Result                                                                                                       |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| M1    | `app_private.audit_events_immutable()`                 | Switch `SECURITY INVOKER` to `SECURITY DEFINER` with `GRANT SELECT, DELETE` + RLS disabled in savepoint | `tests/integration/forms-d1-erasure.test.ts` (`auditGuardMutantKilled`)    | **KILLED** (`service_role` deleted row under mutant; blocked on real function)                               |
| M2    | `app_private.d1_erase_inapplicable_answers(uuid,uuid)` | Bypass `h.released_at is null` (`and false`) in legal-hold guard                                        | `tests/integration/forms-d1-erasure.test.ts` (`holdMutantKilled`)          | **KILLED** (mutated call returned `erased` during active hold; real function returned `deferred_legal_hold`) |
| M3    | `app_private.d1_erase_inapplicable_answers(uuid,uuid)` | Invert applicability predicate (`and app_private.f15_question_applies(...)`)                            | `tests/integration/forms-d1-erasure.test.ts` (`applicabilityMutantKilled`) | **KILLED** (mutated call erased still-applicable Tenant B answer; real function preserved it)                |

## 2. T024 — Full Stack D Synthetic Acceptance

- **Full unit suite (`$env:TZ='America/Los_Angeles'; npm test -- --maxWorkers=4`):** `309/309` files, `3,549/3,549` tests passed, `0` failed, `0` skipped.
- **Stack D integration suites (`supabase-safe.mjs --stack D exec -- ...`):**
  - `tests/integration/forms-*.test.ts` (32 files) + `audit.test.ts` + `matrix-parity.test.ts` + `password-policy-parity.test.ts`: **`35/35` files, `682/682` tests passed, `0` failed, `0` skipped** (includes `forms-purge.test.ts` Stack-D-only suite, `forms-r3-purge.test.ts`, `forms-r3-corrections.test.ts`, `forms-r3-correction-matrix.test.ts`, `forms-r3-reader.test.ts`, `forms-s14-privacy.test.ts`, `forms-d1-erasure.test.ts`, `forms-audit-compatibility.test.ts`).
  - `tests/integration/rls-catalog.test.ts` + `client-accounts-schema.test.ts` + `terms-consent.test.ts` + `client-signup-transaction.test.ts`: **`4/4` files, `113/113` tests passed** (94/94 excluding `forms-d1-erasure` in the earlier combined run + `forms-d1-erasure` 3/3).
- **Stack D Playwright E2E (`PLAYWRIGHT_PORT=3104`):**
  - `forms-client.spec.ts`, `forms-staff.spec.ts`, `forms-builder-s14.spec.ts`, `forms-default-starter-s18.spec.ts`, `forms-authorized-route.spec.ts`, `forms-production-route.spec.ts`: **`79/79` passed, `0` failed, `0` skipped**; `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`): **0 violations**.
- **Static & build checks:**
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS (`--max-warnings=0`)
  - `npm run check:migration-timestamps`: PASS (305 migrations)
  - `npm run build`: PASS
  - `npm run build:cron`: PASS (`12.31 KiB` / gzip `3.63 KiB`)
  - `npm run check:secrets`: PASS
  - `npm run build:edge` / `npm run size`: blocked locally on Windows (`EPERM: operation not permitted, symlink` in `@opennextjs/aws/dist/build/copyTracedFiles.js`); verified in exact-head Linux CI `validate` job.

## 3. T024 — Frontend Design Gate & `DESIGN.md` §12 Screenshot Review

- **Retained UI matrix path:** `specs/015-forms-intake/reports/evidence/t024-acceptance/` (`INDEX.md` + 18 full-page PNGs across `AR-RTL`/`EN-LTR` × `light`/`dark` × `390`/`1440` px for client intake & staff console, plus `ar-dark-390-N07-timing.png` and `en-light-1440-T03.png` samples inspected against `DESIGN.md` §12).

| Frontend Design Gate Item               | Verdict       | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design tokens & light/dark themes       | **PASS**      | Inspected `lifter-f15-ar-dark-390.png`, `lifter-f15-en-light-1440.png`, `lifter-f15-t021-staff-ar-dark-390.png`, `lifter-f15-t021-staff-en-light-1440.png`; semantic surfaces/borders/actions render cleanly in light & dark; brand scoping test passed.                                                                                                                      |
| Typography, Arabic RTL & mixed Bidi     | **PASS**      | `ar-dark-390-N07-timing.png` and `lifter-f15-ar-dark-390.png` render `IBM Plex Sans Arabic` RTL with Western digits (`1`, `2`, `150`, `2026-10-29T10:00:00Z`) properly isolated.                                                                                                                                                                                              |
| Contrast, touch targets, keyboard & axe | **PASS**      | `@axe-core/playwright` 0 violations across all 79 E2E tests; keyboard progression (`Space`/`Tab`/`Enter`) passed in `forms-client.spec.ts`, `forms-staff.spec.ts`, `forms-authorized-route.spec.ts`, `forms-production-route.spec.ts`.                                                                                                                                        |
| Mobile/desktop layout & reflow          | **PASS**      | 390px and 1440px (plus 768px in `forms-builder-s14.spec.ts` and 1024px in `forms-authorized-route.spec.ts`) show zero overflow or crowding.                                                                                                                                                                                                                                   |
| Honest save/submit & role boundaries    | **PASS**      | Draft saved status only after server ack (`p50=57ms p95=73ms`); Sales/anon denied in `forms-staff.spec.ts` & `forms-production-route.spec.ts`.                                                                                                                                                                                                                                |
| Retained matrix & `npm run size`        | **PASS (CI)** | Retained matrix stored at `specs/015-forms-intake/reports/evidence/t024-acceptance/`; `build:cron` `12.31 KiB` PASS locally; `build:edge` and `npm run size` PASS in exact-head CI run `44255217468` (`validate` job, steps "Run npm run build:edge" / "Run npm run size"; head `0970a5f5bb9d3252d2c587acfe6ce561a7b88890`), which removes the Windows `EPERM` symlink limit. |
