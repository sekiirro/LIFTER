# F14 Hero — Traceability (S30 Glisse option 1a, branch `014-hero-glisse`)

**Branch:** `014-hero-glisse` · **Base reviewed:** `abda24cb9ef585c6edfe22d2e82f6c8318b4b250` (S29 Hero Glisse work, reviewed ACCEPTED-PARTIAL) · **Feature:** `specs/014-workspace-branding/`

This register covers the Hero scope that the S30 lane touches (T052). The workspace-branding rows FR-001..FR-018 / SC-001..SC-011 are unchanged by this lane and remain tracked by the accepted F14 review artifacts (`e0a012f`, `2e69d5a`, `a23c00f`) on the registration implementation lane; no row below re-states them.

Statuses use `PENDING` while the asserting test has not yet executed on the final head, `VERIFIED` only for executed passing evidence, and `OPEN` for work owned by another task or lane.

| Requirement | Task(s) | Asserting test(s) | Evidence | Status |
|---|---|---|---|---|
| FR-026 | T052, T055 | `tests/unit/registration-hero.test.ts::selects split art layout for a desktop banner`; `::selects stacked art layout for a mobile banner`; `::renders the card through the theme-tinted Glisse surface` | `abda24c` (S29 head) | PARTIAL — layout/token assertions exist; no pixel-level comparison against approved prototype `97debaf` (open under T055) |
| FR-027 | T052, T055 | `tests/unit/registration-hero.test.ts::resolves the dark field surface to the existing card token`; `::keeps the reduced-capability fallbacks on the existing surfaces`; `tests/e2e/registration-hero-glisse.spec.ts` (48-row theme × locale × artwork matrix) | PENDING — recorded below after execution | PENDING |
| FR-029 | T052, T055, T056 | `tests/unit/registration-hero.test.ts::tints the dense form region with the existing card token`; `::outranks the shared liquid glass edge recipe with a Hero-scoped selector`; `::introduces no new custom property`; `tests/e2e/registration-hero-glisse.spec.ts`; `tests/e2e/registration-hero-glisse-screenshots.spec.ts` | PENDING — recorded below after execution | PENDING |
| FR-028 | T053, T056 | Not touched by this lane (signup profile fields) | — | OPEN — owned by T053 on the registration implementation lane |
| FR-030 | T054, T055 | Not touched by this lane (floating preferences pill / 390 px offset) | — | OPEN — owned by T054 |
| SC-018 | T052, T055 | `tests/unit/registration-hero.test.ts::selects split art layout for a desktop banner`; `::selects stacked art layout for a mobile banner`; `tests/e2e/registration-hero-glisse-screenshots.spec.ts` | `abda24c`; PENDING for the regenerated matrix | PARTIAL |
| SC-019 | T052, T055 | `tests/unit/registration-hero.test.ts::resolves the dark field surface to the existing card token`; `tests/e2e/registration-hero-glisse.spec.ts` (Dark + Follow OS dark rows) | PENDING | PENDING |
| SC-020 | T053, T056 | Not touched by this lane | — | OPEN — owned by T053 |
| SC-021 | T052, T055 | `tests/e2e/registration-hero-glisse.spec.ts` (focus ring ≥ 3:1 and filled CTA boundary per row); `tests/e2e/registration-hero-glisse-screenshots.spec.ts` (axe per capture) | PENDING | PENDING |
| SC-022 | T054, T055 | Not touched by this lane | — | OPEN — owned by T054 |

## Decision sources for this lane

- S30-PO-2 (verbatim answer "1a Dense form + tint (Recommended)"): dark-theme Hero fields use `--color-card`; a card tint sits behind the form/CTA; exact brand ring; production renders the same as dev; Hero only; no token or `DESIGN.md` change.
- S30-PO-6 (verbatim answer "90% (Recommended)"): the dark-theme form tint is 90% of `--color-card`.
- Recorded in `spec.md` (`## Clarifications`), `plan.md` (Hero scope mapping) and `hero-implementation-plan.md` (Spec and PO traceability).

## Execution evidence (filled after the asserting tests run on the final head)

| Step | Command / artifact | Result | Commit |
|---|---|---|---|
| Unit source test | `npx vitest run tests/unit/registration-hero.test.ts` | PENDING | — |
| DEV 48-row matrix | `PLAYWRIGHT_BASE_URL=http://localhost:3439 HERO_GLISSE_CONTRAST_DIR=… npx playwright test tests/e2e/registration-hero-glisse.spec.ts --reporter=json` | PENDING | — |
| PROD 48-row matrix | same command against the production build on port 3439 | PENDING | — |
| Mutation (i) remove tint | executed mutation + restore | PENDING | — |
| Mutation (ii) revert dark field selector | executed mutation + restore | PENDING | — |
| Screenshot matrix | `PLAYWRIGHT_BASE_URL=http://localhost:3439 HERO_EVIDENCE_DIR=… npx playwright test tests/e2e/registration-hero-glisse-screenshots.spec.ts --project=chromium` | PENDING | — |
| Gates | `npm run test`, `lint`, `typecheck`, `format:check`, `build`, `build:edge`, `build:cron`, `check:secrets`, `size`, `git diff --check` | PENDING | — |

T052 stays unchecked until the rows above carry executed passing evidence for this final head.
