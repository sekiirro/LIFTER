# F14 Hero — Traceability (S30 Glisse option 1a, branch `014-hero-glisse`)

**Branch:** `014-hero-glisse` · **Spec commit:** `b6b5553a33d17e33db8a79ff91058c6f0270bd9c` · **Code commit:** `1ba237432e22377d4ad74e2d49aa8b69aebe2dc1` · **Feature:** `specs/014-workspace-branding/`

This register covers the Hero scope that the S30 lane touches (T052). The workspace-branding rows FR-001..FR-018 / SC-001..SC-011 are unchanged by this lane and remain tracked by the accepted F14 review artifacts (`e0a012f`, `2e69d5a`, `a23c00f`) on the registration implementation lane; no row below re-states them.

`VERIFIED` = executed passing evidence on the code head `1ba2374`; `PARTIAL` = asserted but one named gap remains; `OPEN` = owned by another task or lane.

| Requirement | Task(s) | Asserting test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-026 | T052, T055 | `tests/unit/registration-hero.test.ts::selects split art layout for a desktop banner`; `::selects stacked art layout for a mobile banner`; `::renders the card through the theme-tinted Glisse surface`; `tests/e2e/registration-hero-glisse.spec.ts` (`expectHeroMaterialContract`) | `1ba2374`; 32/32 unit, 54/54 dev matrix, 54/54 production matrix, 32/32 screenshots | PARTIAL — layout, token, material, contrast and axe assertions pass; the direct comparison with approved prototype `97debaf` is a PO visual review of the regenerated screenshot matrix (Analyze A3) and is not an executed test |
| FR-027 | T052, T055 | `tests/unit/registration-hero.test.ts::resolves the dark field surface to the existing card token`; `::keeps the reduced-capability fallbacks on the existing surfaces`; `::keeps the print reset for the Glisse blur`; `tests/e2e/registration-hero-glisse.spec.ts` (48-row theme × locale × viewport × artwork matrix) | `1ba2374` — `dev-matrix.json` 54 expected / 0 unexpected; `prod-matrix.json` 54 expected / 0 unexpected; `dev-computed.json` + `prod-computed.json` (identical computed field background in all four theme scenarios) | VERIFIED |
| FR-029 | T052, T055, T056 | `tests/unit/registration-hero.test.ts::tints the dense form region with the existing card token`; `::outranks the shared liquid glass edge recipe with a Hero-scoped selector`; `::introduces no new custom property`; `tests/e2e/registration-hero-glisse.spec.ts`; `tests/e2e/registration-hero-glisse-screenshots.spec.ts` (axe per capture) | `1ba2374` — 54/54 production matrix (48 contrast rows, all ≥ 3:1 focus ring and CTA fill edge), 32/32 screenshots with 0 axe violations, executed mutations killing both fixes (see below) | VERIFIED |
| FR-028 | T053, T056 | Not touched by this lane (signup profile fields) | — | OPEN — owned by T053 on the registration implementation lane |
| FR-030 | T054, T055 | Not touched by this lane (floating preferences pill / 390 px offset) | — | OPEN — owned by T054 |
| SC-018 | T052, T055 | `tests/unit/registration-hero.test.ts::selects split art layout for a desktop banner`; `::selects stacked art layout for a mobile banner`; `tests/e2e/registration-hero-glisse-screenshots.spec.ts` | `1ba2374`; 32/32 screenshots at 390/1440 in AR/EN, light/dark, follow-OS | PARTIAL — as FR-026 (prototype visual review pending) |
| SC-019 | T052, T055 | `tests/unit/registration-hero.test.ts::resolves the dark field surface to the existing card token`; `tests/e2e/registration-hero-glisse.spec.ts` (Dark + Follow OS dark rows) | `1ba2374` — computed dark field `rgb(27, 29, 32)` = `--color-card` in dev **and** production; 24/24 dark contrast rows pass in both builds | VERIFIED |
| SC-020 | T053, T056 | Not touched by this lane | — | OPEN — owned by T053 |
| SC-021 | T052, T055 | `tests/e2e/registration-hero-glisse.spec.ts` (focus ring ≥ 3:1, CTA fill edge ≥ 3:1, text ≥ 4.5:1 per row); `tests/e2e/registration-hero-glisse-screenshots.spec.ts` (axe per capture) | `1ba2374` — 48/48 contrast rows pass in dev and production; 32/32 captures axe-clean | VERIFIED |
| SC-022 | T054, T055 | Not touched by this lane | — | OPEN — owned by T054 |

## Decision sources for this lane

- S30-PO-2 (verbatim answer "1a Dense form + tint (Recommended)"): dark-theme Hero fields use `--color-card`; a card tint sits behind the form/CTA; exact brand ring; production renders the same as dev; Hero only; no token or `DESIGN.md` change.
- S30-PO-6 (verbatim answer "90% (Recommended)"): the dark-theme form tint is 90% of `--color-card`.
- Recorded in `spec.md` (`## Clarifications`), `plan.md` (Hero scope mapping) and `hero-implementation-plan.md` (Spec and PO traceability).

## Execution evidence (code head `1ba2374`)

| Step | Command / artifact | Result |
|---|---|---|
| Unit source test | `npx vitest run tests/unit/registration-hero.test.ts` | 32 passed / 32 (`unit-hero-test.log`) |
| DEV 48-row matrix | `PLAYWRIGHT_BASE_URL=http://localhost:3439 HERO_GLISSE_CONTRAST_DIR=…/dev-contrast npx playwright test tests/e2e/registration-hero-glisse.spec.ts --reporter=json` | 54 expected / 0 unexpected (`dev-matrix.json`) |
| PROD 48-row matrix | same command against the production build of `1ba2374` | 54 expected / 0 unexpected, exit 0 (`prod-matrix.json`) |
| dev == prod proof | `node probe-computed.mjs http://localhost:3439 …` against the dev server and the production server | Identical computed field background, form plate, card fill and blur in light, dark, follow-OS light and follow-OS dark (`dev-computed.json`, `prod-computed.json`) |
| Mutation (i) remove the tint | `components/branding/registration-hero.module.css:259-269` deleted | Killed: unit `::tints the dense form region with the existing card token`; matrix rows `Glisse contrast: Dark / Follow OS dark / ar|en / 1440 / bright` fail at `tests/e2e/registration-hero-glisse.spec.ts:380` (focus ring 3.159 → 2.046) and the CTA fill edge of the same rows drops 3.191 → 2.596 (`mutation1-matrix.json`, `mutation1-contrast/`) |
| Mutation (ii) revert the dark field selector | `components/branding/registration-hero.module.css:356-367` deleted | Killed: unit `::resolves the dark field surface to the existing card token` and `::outranks the shared liquid glass edge recipe with a Hero-scoped selector`; 24 matrix rows fail at `tests/e2e/registration-hero-glisse.spec.ts:380` (focus ring 3.159 → 2.902) — Dark and Follow OS dark × ar|en × {390,1440} × {current,bright,dark} (`mutation2-matrix.json`, `mutation2-contrast/`) |
| Restore after each mutation | `git checkout -- components/branding/registration-hero.module.css` + `git diff --exit-code` | Clean after mutation (i) and after mutation (ii) |
| Screenshot matrix | `PLAYWRIGHT_BASE_URL=http://localhost:3439 HERO_EVIDENCE_DIR=%TEMP%/lifter-s30-hero-glisse-1a npx playwright test tests/e2e/registration-hero-glisse-screenshots.spec.ts --project=chromium` | 32 expected / 0 unexpected, exit 0; 32 PNG + `INDEX.md` in `%TEMP%/lifter-s30-hero-glisse-1a`; axe violations 0 on every capture (`screenshots.json`) |
| Gates | `npm run test`, `lint`, `typecheck`, `format:check`, `build`, `build:edge`, `build:cron`, `check:secrets`, `size`, `git diff --check` on the final head | Executed after this documentation commit; results recorded in the run report `C:/Users/NEW LAP/.lifter/runs/s30-mm-hero-glisse-1b/report.md` |

## Task state

`T052` remains **unchecked** in `tasks.md`. Its asserting tests for this lane executed and passed on the code head `1ba2374` (unit 32/32, dev matrix 54/54, production matrix 54/54, screenshots 32/32 with axe 0, both mutations killed and restored), but FR-026 is still PARTIAL: the direct comparison with approved prototype `97debaf` is a PO visual review of the regenerated screenshot matrix, not an executed test. The Spec Kit rule forbids ticking partially verified work, so the tick waits for that review; `T055` (hosted CI / CodeRabbit / performance evidence) and `T056` (final requirement reconciliation) stay open as well.
