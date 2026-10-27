# Tasks: Design System Foundation (P0-F2)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md)
**Tests**: Requested by the spec (SC-001..SC-005). Pure logic → Vitest (node). UI → Playwright + axe on the showcase.
**Rules for coders**: Use logical CSS properties only; tokens only (no raw colors in components); no new dependencies beyond the 3 listed; don't touch `LIFTER_Claude_Files/`, `DESIGN.md`, `docs/`, `.specify/` or `specs/` (except checking tasks off).

## Phase 1: Setup

- [x] T001 Add exact-pinned deps `geist@1.8.2` and `@fontsource/ibm-plex-sans-arabic@5.3.0`, and devDep `@axe-core/playwright@4.14.0`, in `package.json` / `package-lock.json`. Confirm each package's LICENSE file is OFL-1.1 or MIT, and list them in the review notes.
- [x] T002 Update `playwright.config.ts`: `webServer.env = { LIFTER_SHOWCASE: '1' }`, and change `webServer.url` to `/api/health` (unchanged). Add a second project `mobile-chromium` using `devices['Pixel 7']` that runs only `shell.spec.ts`. Keep the existing `chromium` project.
- [x] T003 [P] Add `components/**` and `lib/**` to Vitest/TS coverage as needed. Vitest stays `environment: 'node'` with `include: ['tests/unit/**/*.test.ts']`.

## Phase 2: Foundational (blocks all stories)

- [x] T004 [P] Write `tests/unit/color.test.ts`: `parseHex` accepts `#RRGGBB`/`#RGB` (any case) and rejects everything else; `contrastRatio('#FFFFFF','#000000')` ≈ 21; `contrastRatio('#FFFFFF','#059669')` ≈ 3.77 (±0.02); `deriveBrand` is deterministic; invalid/null/undefined → source `#059669`; `#059669` keeps `fill === '#059669'` in both modes, with `onFill` dark.
- [x] T005 Implement `lib/design/color.ts` per the contract and research ("Brand derivation"): sRGB↔OKLCH conversion, gamut clamp, binary search on L. `ModeBrand = { fill, onFill, text, ring, fillHover }`. Constraints: contrast(fill,onFill) ≥ 4.5; contrast(text,bg) and contrast(text,card) ≥ 4.5; contrast(ring,bg) ≥ 3; contrast(fillHover,onFill) ≥ 4.5. `onFill` ∈ {`#FFFFFF`, `#0B0C0E`}, choosing the one needing the smallest fill change. Export `DEFAULT_BRAND = '#059669'`.
- [x] T006 Implement `lib/design/tokens.ts`. Mode tokens per data-model `ModeTokens`. Dark surfaces: bg `#101113`, card `#1B1D20`, border `#303237`. Light: bg `#F6F7F8`, card `#FFFFFF`, border `#E5E7EB`. Choose text, textMuted, borderStrong and semantic {fg,bg,border} values that pass the T007 contrast rules. Scale tokens: radius sm 6, button 8, card 14, full 9999 (px); spacing 4-px scale `--space-1..10`; motion 150/200/250 ms; `--touch-min: 44px` (provisional ND-4); low-intensity shadows.
- [x] T007 [P] Write `tests/unit/tokens-contrast.test.ts`. In both modes: text and textMuted ≥ 4.5 on bg and card; each semantic fg ≥ 4.5 on its own bg and on card; borderStrong ≥ 3 on card. Also, for the default brand plus 8 samples (`#059669`, `#FFFF00`, `#FFFFFF`, `#000000`, `#E11D48`, `#2563EB`, `#7C3AED`, `#F59E0B`, `#14B8A6`), every `deriveBrand` constraint from T005 holds against that mode's bg and card.
- [x] T008 Implement `lib/design/tokens-css.ts`. `tokensToCss()` emits: light vars on `:root`; dark vars under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and on `:root[data-theme="dark"]`. Brand mapping: `--brand-fill: var(--brand-fill-light)` and its counterparts are declared on `:root, [data-brand-scope]`, with the dark mapping repeated for `[data-brand-scope]` under each dark selector. `brandToCssVars(v)` returns `--brand-{fill|fill-hover|on-fill|text|ring}-{light|dark}`. Add `tests/unit/tokens-css.test.ts`: the output contains every contract variable and every selector above.
- [x] T009 [P] Implement `lib/design/preferences.ts` (cookie names `lifter_theme` and `lifter_locale`; `parseTheme`: only `dark`/`light`, anything else → `system`; `parseLocale`: only `ar`/`en`, else `ar`; `dirFor`; `serializePreferenceCookie(name, value)` → `Path=/; Max-Age=31536000; SameSite=Lax`) plus `tests/unit/preferences.test.ts`.
- [x] T010 [P] Implement `lib/i18n/messages/ar.ts` (source; Arabic copy for every UI string used in F2: nav labels, buttons, states, switchers, showcase headings, needs-decision notice), `lib/i18n/messages/en.ts` typed `Record<keyof typeof ar, string>`, and `lib/i18n/index.ts` (`getMessages(locale)`), plus `tests/unit/messages.test.ts` (identical key sets, no empty strings). Arabic nav labels follow DESIGN.md: الرئيسية، العملاء، التمرين، التغذية، التقدم، المزيد.
- [x] T011 Implement `app/layout.tsx` and `app/globals.css`. The root layout reads both cookies via `cookies()` and renders `<html lang dir data-theme?>`, setting `data-theme` only when the cookie is `dark` or `light`. It injects `<style>{tokensToCss()}</style>` and applies the font variables from `next/font/local`: Geist Sans variable WOFF2 from the `geist` package, and IBM Plex Sans Arabic 400/500/600/700 WOFF2 (arabic + latin subsets) from `@fontsource/ibm-plex-sans-arabic`, `display: 'swap'`. Metadata title is "LIFTER". `globals.css` holds: a minimal reset, `body` using tokens, `:lang(ar)` and `:lang(en)` font stacks per research, the `:focus-visible` ring using `--brand-ring` (2 px plus offset), and `@media (prefers-reduced-motion: reduce)` reducing all animation and transition durations to `0.01ms`. `color-scheme` follows the mode.
- [x] T012 [P] Implement `components/icons/Icon.tsx`: outline 24-px icons, stroke `currentColor`, width 1.75, round caps/joins. Names: home, users, dumbbell, utensils, chart, more, check, alert-triangle, x-circle, info, search, inbox, refresh, chevron-start, chevron-end, sun, moon, monitor, globe, x. Only chevron-start/end mirror under `[dir="rtl"]`. Decorative → `aria-hidden`; with `label` → `role="img"` and `aria-label`.
- [x] T013 [P] Write `tests/unit/logical-css.test.ts`. It scans `app/**/*.css` and `components/**/*.css` and fails on `margin-left|margin-right|padding-left|padding-right|border-left|border-right|text-align:\s*(left|right)|float:\s*(left|right)` and on positioning `left:`/`right:` (allow `inset-inline-*`).
- [x] T014 [P] Implement `lib/design/showcase.ts` (`isShowcaseEnabled(env)` is true only for `env.LIFTER_SHOWCASE === '1'`) plus `tests/unit/showcase-gate.test.ts`.

**Review B1 (Claude):** typecheck, lint, format, unit tests; contrast table output; no physical CSS.

## Phase 3: US1: Themed bilingual foundation (P1)

**Independent test**: `/showcase` honors the device theme, persists the manual theme and language, and has the correct `lang`/`dir` on first paint.

- [x] T015 [US1] Implement `components/preferences/ThemeSwitcher.tsx` (client). It's a labeled radio group: follow device / dark / light. Dark or light sets the cookie and `document.documentElement.dataset.theme` immediately. Follow device deletes the cookie (`Max-Age=0`) and removes the attribute.
- [x] T016 [US1] Implement `components/preferences/LanguageSwitcher.tsx` (client): labeled AR/EN control that sets the cookie, then `router.refresh()`.
- [x] T017 [US1] Implement `components/ui/Bidi.tsx` (`<bdi>`, optional `dir`).
- [x] T018 [US1] Implement the gated `app/(dev)/showcase/page.tsx` (`notFound()` unless `isShowcaseEnabled(process.env)`; server component with messages from the locale cookie) with sections for: switchers, a token swatch grid (each swatch labeled with its variable name), typography in AR and EN, an Arabic sentence with an inline number, measurement and code wrapped in `Bidi` (e.g. `الوزن 82.5 kg`, `ID LFT-0042`), and an "authored content" sample shown as authored.
- [x] T019 [US1] Write `tests/e2e/theme-locale.spec.ts`. Cases: (a) no cookies + `colorScheme: 'dark'` → computed body background = dark bg; with `'light'` → light bg. (b) Choosing dark in the switcher, then reloading under `colorScheme: 'light'`, stays dark; follow device restores device behavior. (c) Default `html[lang=ar][dir=rtl]`; switching to EN and reloading gives `lang=en dir=ltr`. (d) With JS disabled (`javaScriptEnabled: false`) and a theme or locale cookie preset, the first response HTML already has the right attributes. (e) Without the showcase flag the gate is covered by the unit test; in e2e, assert that `/showcase` returns 200 with the flag.

## Phase 4: US2: Brand and workspace colors (P1)

**Independent test**: Sample brands render in BrandScopes with passing contrast; semantic colors are unchanged.

- [x] T020 [US2] Implement `components/ui/BrandScope.tsx` (`div[data-brand-scope]`, inline style from `brandToCssVars(deriveBrand(color))`).
- [x] T021 [US2] Showcase section "Workspace brands": one BrandScope per sample color from T007, each with a primary button, a link, an active nav chip, and a success/warning/error alert. It also shows the derived hex values and contrast ratios as text, wrapped in `Bidi`.
- [x] T022 [US2] Add to `tests/e2e/components.spec.ts`: inside the `#FFFF00` and `#000000` scopes, the computed primary-button bg/fg contrast is ≥ 4.5 in both modes. The computed error-alert color is identical inside and outside a brand scope.

## Phase 5: US3: Accessible components and states (P1)

**Independent test**: keyboard-only and axe runs across the 4 combinations.

- [x] T023 [P] [US3] `components/ui/Button.tsx` + `Button.module.css` per contract: variants primary/secondary/destructive; hover, `:focus-visible`, disabled and loading (spinner via token motion, `aria-busy`, `aria-disabled`, clicks ignored); min-block-size `--touch-min`; radius `--radius-button`.
- [x] T024 [P] [US3] `components/ui/Field.tsx` + CSS per contract (label above, `useId`, `aria-describedby` for hint and error, `aria-invalid`, error with an icon plus text).
- [x] T025 [P] [US3] `components/ui/Card.tsx` + CSS.
- [x] T026 [P] [US3] `components/ui/ConfirmDialog.tsx` (client) per contract: native `<dialog>.showModal()`, initial focus on cancel, Escape → `onCancel`, focus restore, `aria-labelledby`/`aria-describedby`, destructive tone uses the error tokens.
- [x] T027 [P] [US3] `components/ui/States.tsx` + CSS: `Skeleton` (aria-hidden, shimmer disabled under reduced motion), `EmptyState` (inbox icon), `NoResults` (search icon), `ErrorState` (`role="alert"`, x-circle icon, Retry button calling `onRetry`).
- [x] T028 [P] [US3] `components/ui/Toast.tsx` (client): `ToastProvider`, `useToast().success(msg)`, a single `role="status"` `aria-live="polite"` region at the inline-end/bottom, auto-dismiss after 5000 ms (paused on hover and focus-within), dismiss button, focus never moved.
- [x] T029 [P] [US3] `components/ui/Alert.tsx` + CSS: tones info/success/warning/error; error uses `role="alert"`, the others `role="status"` (caller may override); icon plus title; semantic tokens only.
- [x] T030 [US3] Showcase sections for every component and state, both enabled and disabled/loading variants, a form with one invalid field, a "Delete sample" button that opens ConfirmDialog (destructive), a toast trigger, and the three empty/no-results/error states with a working Retry (the demo counter increments).
- [x] T031 [US3] `tests/e2e/a11y.spec.ts`: for each of AR/EN × dark/light (set via cookies), run axe with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` and assert 0 violations of impact `serious` or `critical`.
- [x] T032 [US3] Add to `tests/e2e/components.spec.ts`: Tab reaches the primary button and the focus ring is visible (non-`none` outline or box-shadow); a loading button ignores clicks and has `aria-busy`; the invalid field has `aria-invalid` and its `aria-describedby` points to the error text; the dialog opens, focus is inside, Escape closes it and focus returns to the trigger; the toast appears in the `role=status` region without moving focus; Retry works; with `reducedMotion: 'reduce'` the button transition duration is ≤ 0.01 s.

## Phase 6: US4: Responsive app shell (P2)

**Independent test**: shell demos at desktop and Pixel 7 widths, in AR and EN.

- [x] T033 [US4] `lib/design/navigation.ts` + `tests/unit/navigation.test.ts`. `NAV_CONFIG` trainer = `home(home), clients(users), workout(dumbbell), nutrition(utensils), more(more)`; client = `home, workout, nutrition, progress(chart), more`. `getNavigation(role)` returns `{status:'needs-decision', role}` for `platform_owner`, `workspace_owner` and `sales`. Test the exact orders and the needs-decision cases.
- [x] T034 [US4] `components/shell/AppShell.tsx`, `NavRail.tsx`, `BottomBar.tsx` + CSS modules per contract. Wide layout (`min-width: 48rem`, provisional ND-3): fixed inline-start rail with icon links (`aria-label` = label), a tooltip shown on `:hover` and `:focus-visible` (CSS only, positioned with `inset-inline-start`), and `aria-current="page"` on the active item using `--brand-text`/`--brand-ring`. Narrow layout: fixed bottom `<nav>` with icon + visible label, each item ≥ `--touch-min`, safe-area padding. Hide the inactive variant with `display:none`. Both use `<nav aria-label>`. `needs-decision` → render children with no nav.
- [x] T035 [US4] Showcase section "Shell": an iframe-free demo with a role selector (trainer/client/sales) via `?role=` and a scaled container. The real shell is used on the dedicated route `app/(dev)/showcase/shell/page.tsx` (gated) with `?role=`; sales shows the localized needs-decision notice.
- [x] T036 [US4] `tests/e2e/shell.spec.ts`. Desktop: the trainer rail has 5 items in order, focusing an item shows its tooltip text, and in AR the rail's bounding box is on the right half (in EN, on the left). Mobile (`mobile-chromium`): the trainer bottom bar labels are visible in order Home, Clients, Workout, Nutrition, More (EN) and the Arabic equivalents in AR; the client order is Home, Workout, Nutrition, Progress, More; sales shows no nav plus the notice; every item's box is ≥ 44 × 44.

## Phase 7: US5: Arabic print spike (P3)

- [x] T037 [US5] `app/(dev)/print-sample/page.tsx` + `print.module.css` (gated): an Arabic title, a paragraph with mixed Arabic/Latin/numbers (`Bidi`), a 3-column table (exercise, sets, reps) with 25 rows so it spans 2 pages, and an English paragraph. `@media print`: hide `[data-screen-only]` (switchers, shell), `@page { size: A4; margin: 15mm }` (provisional), `thead { display: table-header-group }`, `tr { break-inside: avoid }`, white background and black text.
- [x] T038 [US5] `tests/e2e/print.spec.ts`: with the `ar` cookie, open `/print-sample`, `page.emulateMedia({ media: 'print' })`, assert the switchers are hidden, then `page.pdf({ format: 'A4', printBackground: true, path: testInfo.outputPath('print-sample.pdf') })` and assert the file size is > 0.
- [x] T039 [US5] (Claude) Inspect the PDF and write `specs/002-design-system/print-spike.md` (shaping, direction, mixed runs, table header repeat, hidden chrome: pass/fail with evidence; leftovers for the P3 booklet).

## Phase 8: Polish

- [x] T040 README "Design system" section in `README.md`: token usage, logical-CSS rule, adding messages, the `LIFTER_SHOWCASE=1` showcase, BrandScope, and the open NEEDS DECISION items (with a link to the plan).
- [x] T041 (Claude) Constitution v1.1.0 amendment (Principle VIII lime → emerald `#059669` with workspace-customizable brand colors and contrast guard), decision register D-18, and the Architecture UI row. These are docs only.
- [x] T042 (Claude) Full gate re-run: typecheck, lint, format:check, test, build, e2e (both projects); edge build and size on CI.

## Dependencies

Setup → Foundational (T004–T014) → US1 → US2/US3 (parallel after US1's showcase page exists) → US4 → US5 → Polish. Within each phase, [P] tasks touch different files.

## Implementation strategy

Batch 1 = Phases 1–2 (review). Batch 2 = US1–US3, the MVP (review). Batch 3 = US4–US5 + T040 (review). Claude does T039, T041 and T042.
