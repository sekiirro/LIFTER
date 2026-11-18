# T055 — browser / theme / locale / viewport / a11y / contrast / performance evidence

**Implementation head:** `f6a25888893fca053620d6d214659ae90d988784` (fresh `origin/main`, contains PR #231 branding merge `7eaf619d`). Before push this branch merged `origin/main` at `c101617d9735660ff0db23ba78b96e832a8120c4`; the only added implementation delta is a 5-line spec-015 `app/register/[token]/SignupForm.tsx` pending-submit blur guard, which does not touch any branding component, design token, i18n message, middleware or branding route. All branding rendered sources are unchanged between the executed head and the PR head.
**Environment:** `PLAYWRIGHT_PORT=3000` (owned by lane s64-hy4-f14); Stack A environment injected through `C:/Users/NEW LAP/.lifter/tools/supabase-safe.mjs` (`LIFTER_SUPABASE_STACK=a`, `--allow-stack-a`). Production build (`npm run build`) served by `scripts/branding/start-playwright-server.mjs`.

## Source-continuity proof (prior evidence → this head)

`git diff --stat e593d880a33a912c97498c5a946bb00bc64c154e..origin/main -- components/branding app/globals.css app/api/branding middleware.ts next.config.ts lib/i18n messages tests/e2e` reports only three changed files, all tests: `tests/e2e/client-signup.spec.ts`, `tests/e2e/f17-design-gate.spec.ts`, `tests/e2e/f17-ui-matrix.spec.ts`. No branding component, design token, i18n message, middleware, or route source changed, so the rendered output covered by the S63 evidence is unchanged. Fresh captures were nevertheless re-executed on this head, below.

## Executed suites on this head

| Suite                                                                                                                                                                                    | Result                                                                     | Evidence                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `client-signup-username-screenshots.spec.ts`, `registration-hero-glisse-screenshots.spec.ts`, `registration-links.spec.ts`, `branding-registration.spec.ts`, `a11y.spec.ts` (single run) | **86 passed / 0 failed** (2.6 m)                                           | `C:/Users/NEW LAP/.lifter/runs/s64-hy4-f14/e2e-run1.log`   |
| `registration-hero-glisse.spec.ts` (theme/print/translucency/contrast)                                                                                                                   | **55 passed / 0 failed**, including all 48 `Glisse contrast` cases (5.9 m) | `C:/Users/NEW LAP/.lifter/runs/s64-hy4-f14/e2e-glisse.log` |
| `health.spec.ts` (server readiness probe)                                                                                                                                                | 4 passed                                                                   | console run                                                |

All runs used the unmodified test harness and unmodified assertions. The `> log 2>&1` PowerShell redirection made the wrapper report exit 1 while Playwright itself reported all-passed; a non-redirected health run exited 0, confirming the artifact. No test was weakened or skipped.

## Rendered screenshot matrix (real captures, this head)

- **Username error border** — 8 captures `{AR/RTL, EN/LTR} × {light, dark} × {390px, 1440px}`; measured rendered border/input contrast **8.31:1 light** (`rgb(153,27,27)` on `rgb(255,255,255)`) and **7.90:1 dark** (`rgb(252,165,165)` on `rgb(36,39,43)`); **axe 0 violations per capture**. Index: `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s35-hero-r24/INDEX.md`.
- **Registration hero (Glisse)** — 32 captures `{AR, EN} × {Light, Dark, Follow OS light, Follow OS dark} × {390, 1440}` plus `prefers-reduced-transparency: reduce` and print media; **axe 0 per capture**. Index: `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-hero-r3/INDEX.md` (generated 2026-11-18T00:55:54Z during this run).
- `branding-registration.spec.ts` additionally asserts `html[lang]`/`html[dir]` (rtl for ar, ltr for en), `data-theme`, centered no-banner geometry, prefilled card/pill geometry at 360/390/768/1440, and print theme-token behaviour for both locales.

## Accessibility

- `a11y.spec.ts` executed in the 86-test run (no serious/critical violations).
- `registration-links.spec.ts` executed keyboard, accessible-name, generic-invalid and exact-route-only assertions in AR and EN.
- Every screenshot capture asserted axe-clean (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa tags).
- Focus/reduced-motion: reduced-transparency captures executed; `prefers-reduced-motion` behaviour unchanged by this lane.

## Contrast

- 48/48 `Glisse contrast` cases across theme × locale × viewport × artwork passed (`e2e-glisse.log`).
- Rendered error-border contrast 8.31:1 light / 7.90:1 dark (above 3:1 and 4.5:1 thresholds) measured from the browser, not from tokens alone.
- Semantic tokens unchanged by brand override (unit boundary: `tests/unit/branding-validation.test.ts`), with rendered verification in the captures above.

## Performance

- `tests/e2e/branding-registration.spec.ts:250` asserts cumulative layout shift `< 0.001` via a `PerformanceObserver('layout-shift', { buffered: true })` installed before navigation; executed and passed in the 86-test run on the production build.
- `npm run size` bundle budget: **not run locally** — `npm run build:edge` failed on this Windows host with `EPERM` on a `symlink` into `.open-next/...` (`build-edge.log`), so `.open-next/worker.js` was not generated and Wrangler's dry-run had no entry point. No source file was changed by this lane, so the bundle is unchanged; the executed CLS assertion above is the rendered performance evidence. Recorded, not masked.

## CI / review evidence

- Pull-request CI run IDs on the PR head (merge of `c101617d...`) are recorded in `C:/Users/NEW LAP/.lifter/runs/s64-hy4-f14/report.md` and the PR body (not in this file, to keep the tested head stable).
- CodeRabbit / AI review: **not run - optional under constitution 1.19.0** (`.specify/memory/constitution.md` line 171: "AI PR reviews are optional and provider-independent"; this lane did not request one).
- Independent architect full-diff review: not requested by this lane; the architect reviews the exact SHA before merge under standing approval.
