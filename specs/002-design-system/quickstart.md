# Quickstart / Validation: P0-F2

Prereqs: same as F1, plus `npx playwright install chromium`.

| Step | Command | Expected |
|---|---|---|
| Gates | `npm run typecheck && npm run lint && npm run format:check && npm test` | exit 0; unit tests include contrast for the default brand and ≥ 8 sample brands, message parity, navigation, preferences, showcase gate, logical CSS |
| E2E | `npm run e2e` | health + theme-locale + a11y (4 combos, 0 serious/critical) + components + shell + print pass |
| Showcase | `LIFTER_SHOWCASE=1 npm run dev` → `/showcase` | Default Arabic RTL; theme follows device; switchers persist after reload |
| Gate off | `npm run dev` → `/showcase` | 404 |
| Edge build (Linux CI) | `npm run build:edge && npm run size` | within limit, headroom printed |
| Print spike | `npx playwright test print` → `test-results/**/print-sample.pdf` | Reviewer inspects it and records the findings in [print-spike.md](print-spike.md) |

Negative checks: add `margin-left` to any component CSS → `logical-css` test fails. Remove a key from `en.ts` → typecheck and the parity test fail. Use `deriveBrand('#ffff00')` → variants still pass contrast.

Contract: [ui-contract.md](contracts/ui-contract.md). Entities: [data-model.md](data-model.md).
