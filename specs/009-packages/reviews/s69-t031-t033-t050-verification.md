# S69 independent verification: T031, T032, T033, T050, T065

**Reviewed baseline:** `origin/main` / `HEAD` `3b869e58f3629583100251986f3b0c2072d0b505` (`s69-009-verify`). Entry tree was clean. This record does not tick tasks or alter implementation, migrations, tests, `tasks.md`, `traceability.md`, or `tests/integration/packages-verification.md`.

## T031 — gates and implementation review

- `npm ci`: completed; 819 packages installed.
- PASS: `npm run typecheck`; `npm run lint`; `npm run format:check` after temporary Stack C CLI helpers were removed; `TZ=Africa/Cairo npm run test:unit` (359 files, 4,048 passed, 24 expected-fail); `npm run build`; `npm run check:secrets`.
- BLOCKED locally: `npm run build:edge` compiled and completed Next.js generation, then OpenNext failed copying a traced dependency because Windows denied a symlink (`EPERM`, `.next/standalone/node_modules/rimraf` to `.open-next/...`). `npm run size` consequently failed because `.open-next/worker.js` was not generated. No source fix was made for this host permission limitation.
- Independent source review: `lib/packages/service.ts` uses `getActor`, a platform-owner check, `authorize(..., 'set_package_pricing', workspaceId)`, and `createSessionClient`; RPC failures map to generic `denied` / `invalid_input` / `unavailable` results. `lib/packages/read.ts` uses the session client, an explicit safe-column projection, and string `price_minor` validation; commission rates are separately fetched only for authorized owner roles. `lib/packages/money.ts` uses `BigInt` for minor-unit formatting and does not round through `Number`. The page and server operations enforce the app wall; database role/RPC/catalog checks passed in the integration campaign. No package implementation finding was identified in this review.

## T032 — disposable Stack C integration

Stack C identity was `lifter-stack-c` at API/DB ports `35421/35422`, with migrations resolving to the repository `supabase/migrations`. Stack C was reset from migrations via `supabase-safe.mjs` under `timeout`. Existing local auth fixtures were provisioned with synthetic keys directly into this disposable database; no `.env*` file was read or written and no key was printed.

The requested package tests, `rls-catalog.test.ts`, and `matrix-parity.test.ts` were run after a fresh reset:

- 15 test files, 720 passed, 0 failed, 0 skipped.
- `packages-c5-teardown.test.ts` (T065): 48/48 passed, including its in-suite rolled-back mutation probes.
- Existing package-suite rollback/mutation controls executed in this run passed. **The separate eight-item §4 reviewer kill campaign (remove each named guard and demonstrate its focused negative test fails) was not independently completed. T032 is therefore not accepted as fully verified by this record.** Stack C was reset before the final UI run; no committed migration or test was changed.

## T033 — authenticated Playwright

`tests/e2e/packages.spec.ts`: 5/5 passed on Stack C. This includes anonymous AR/EN redirects and login axe checks, authenticated non-PO denial without terms/rates, and PO AR/EN journeys. Each PO journey exercised both themes at 390×844 and 1440×900: 8 locale/theme/viewport cells total, with axe reporting zero violations. The browser run used only the API/DB environment injected by the safe wrapper; a temporary preload blocked reads of `.env*` paths. Screenshots were written to the test's temporary directory.

## T050 — currency and version isolation

Static scan covered `lib/packages`, `app/(app)/packages`, registration links/approval, payments/refunds, and the F9 reporting migrations. The package management and registration/payment/refund surfaces contain no exchange-rate, converted-amount, or cross-currency-total projection. The only conversion surface found is the FR-026/FR-031 package reporting path: `package_reporting_fx_snapshots`, `package_monthly_collections`, and `package_commission_report`; it preserves original amount/currency and separately exposes reporting FX/converted EGP aggregates. FX fields do not replace settlement fields.

Migration scan found package-version writes are append inserts; no migration updates or deletes existing `package_versions` rows. Version/snapshot immutability and terms preservation were exercised by the passing package integration suite. This is local synthetic verification, not a query against production data.

## T065 status

The Stack C teardown suite passed 48/48. No teardown was run against real data. Existing D10 four-category initialization/forward-migration work remains an outstanding task condition; this report does not change its status.

## Verdict

T031 is green except the Windows-only edge/size build limitation. T033 and the clean-stack integration suite are green. T050 passed the requested static and synthetic evidence checks. T032 remains **partial** pending an independent eight-mutant kill campaign; no completion tick is claimed.
