# Implementation Plan: Design System Foundation (P0-F2)

**Branch**: `002-design-system` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-design-system/spec.md`

## Summary

This feature adds the first UI layer on top of F1:

- **Tokens.** Typed design tokens are the single source of truth. They are rendered on the server as CSS custom properties for light mode, dark mode and the device default.
- **Brand colors.** A pure color library derives contrast-safe brand variants for the LIFTER emerald and for any workspace color.
- **Preferences.** Theme and language are read from cookies on the server, so the correct theme and direction are set on the first paint without an inline script.
- **Fonts.** Self-hosted Geist and IBM Plex Sans Arabic.
- **Components.** Accessible base components built with CSS Modules and logical properties.
- **App shell.** A responsive shell with role navigation for Trainer and Client only.
- **Dev-only pages.** A showcase and an Arabic print sample, available only when an environment flag is set.
- **Tests.** Playwright with axe covers 4 combinations (AR/EN × dark/light).

Decisions are in [research.md](research.md). Open PO items are listed under **NEEDS DECISION** below.

## Technical Context

**Language/Version**: TypeScript 6.0.3 strict, Node 24, React 19.3, Next.js 16.4 App Router (unchanged from F1)
**Primary Dependencies (new)**: `geist@1.8.2` (OFL), `@fontsource/ibm-plex-sans-arabic@5.3.0` (OFL-1.1), dev `@axe-core/playwright@4.14.0`. No CSS framework, i18n library or icon library.
**Storage**: Browser cookies only: `lifter_theme` (`dark`|`light`; absent means follow device) and `lifter_locale` (`ar`|`en`; absent means `ar`)
**Testing**: Vitest unit tests for the pure libraries (color, tokens, messages, navigation, preferences, showcase gate, CSS lint); Playwright and axe e2e tests for the showcase, shell and print sample
**Target Platform**: Cloudflare Workers via OpenNext; evergreen browsers
**Project Type**: Single web app (repo root)
**Performance Goals**: No client JS needed for the first paint's theme and direction. The worker stays within 64 MiB. Fonts are subset WOFF2 files, preloaded for the active locale only where possible.
**Constraints**: $0. No external font CDN at runtime. Logical CSS properties only. Brand derivation is deterministic and pure.
**Scale/Scope**: About 10 components, 1 shell, 2 dev-only routes, no business data

## Constitution Check

| Principle | Status |
|---|---|
| I Isolation | No tenant data. `BrandScope` takes a color value only. The shell has no authorization logic and is not a security boundary (FR-022). ✅ |
| II–III, V–VI, IX | N/A ✅ |
| IV Approved scope | Traces to D-07 (P0 includes the Design System) and DESIGN.md. Excluded items are not built (calculator, planners, booklet, display fonts, other roles' tabs). Unknowns are listed as NEEDS DECISION. ✅ |
| VII Privacy | Cookies hold only preferences, with no PII. Nothing is logged. ✅ |
| VIII Design-System UI | **Conflict**: v1.0.0 says "lime accent", but the PO-approved DESIGN.md (2026-10-27) says emerald `#059669`, explicitly not lime. **Resolution**: amend to v1.1.0 (MINOR, materially changes a principle's requirement), add register entry D-18, and update the Architecture UI row. PO approval is required at merge (Governance). Arabic-first RTL, EN LTR, loading/empty/error states and accessibility are all delivered. ✅ after amendment |
| Platform | Same stack. Fonts are bundled static assets. No paid services. ✅ |
| Workflow | Spec → Plan → Tasks → Analyze before code. Codex implements; Claude reviews and re-runs gates. ✅ |

Post-design re-check: no new violations. The amendment is the only deviation, and it is tracked below.

## Merged PR #28 Design System delta

This documentation delta records only the merged Glisse Liquid Glass surfaces approved in S21-PO-1/2/6 and accepted for merge by S27-PO-1, S28-PO-1 and S28-PO-2. PR #28 shipped the floating mobile navigation capsule, desktop dock, floating action controls, accessible popover menu, deferred refraction on capable devices, and static fallbacks for unsupported/preferences/constrained/over-budget cases. Dense data, forms and financial content remain mostly solid (S21-PO-1; PR #28 body). The merged commit is `12bcad944c9366f17afc00a36bd14586c5f2e77a`.

No implementation change is planned. Existing requirements and NEEDS DECISION rows remain in force; the new FR-027..FR-029 and SC-008..SC-009 cover only the merged PR #28 behavior. The exact measurable TBT gate comes from S21-PO-6: median delta no greater than +50 ms against baseline, using 15 interleaved paired samples per arm; PR #28 reports desktop −4 ms [−22,+6] and mobile −3 ms [−12,+6]. The raw report outputs are absent from this checkout, T046 remains open, and SC-008 is PARTIAL; these PR-reported medians are not locally verified evidence.

## NEEDS DECISION (PO open items, DESIGN.md §11; provisional values only, not presented as approved)

| # | Item | F2 handling |
|---|---|---|
| ND-1 | Secondary/interactive token values | Derived algorithmically and verified by contrast tests. Recorded as **F2-proposed** in `research.md` for PO review. |
| ND-2 | Final icon library | About 14 hand-drawn outline SVG icons behind an `Icon` API, replaceable later |
| ND-3 | Breakpoint numbers | One provisional nav switch at `48rem` (768 px), kept in one constant/CSS location |
| ND-4 | Minimum touch-target size | Provisional 44 × 44 CSS px for nav items and buttons (above the WCAG 2.2 AA minimum of 24 px) |
| ND-5 | PO / WO / Sales mobile tabs | Not defined. `getNavigation()` returns `needs-decision`, and the showcase shows that state. |
| ND-6 | Arabic-Indic vs Western digits | No conversion: numbers are shown as stored. No number-formatting helper in F2. |
| ND-7 | Display fonts licensing | Excluded from F2 |

## Project Structure

### Documentation (this feature)

```text
specs/002-design-system/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md
├── contracts/ui-contract.md
├── print-spike.md        # findings report (written by reviewer after running the spike)
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── layout.tsx                    # root: reads prefs cookies → <html lang dir data-theme?>, font vars, <style> tokens
├── globals.css                   # reset, base typography (:lang(ar)/:lang(en) font stacks), focus, reduced motion
├── (dev)/showcase/page.tsx       # gated by isShowcaseEnabled(); else notFound()
├── (dev)/showcase/*.tsx          # client demo controls (theme/lang/brand/role switchers)
└── (dev)/print-sample/page.tsx   # gated; RTL print sample
lib/design/
├── color.ts        # parse/validate hex, relative luminance, contrast, OKLCH adjust, deriveBrand()
├── tokens.ts       # token definitions (light/dark), semantic colors, radii, spacing, motion
├── tokens-css.ts   # tokensToCss(), brandToCssVars()
├── preferences.ts  # cookie names, parse/serialize theme & locale, defaults, dir for locale
├── navigation.ts   # NAV_CONFIG (trainer, client), getNavigation(role)
└── showcase.ts     # isShowcaseEnabled(env)
lib/i18n/
├── messages/ar.ts  messages/en.ts   # en typed against ar keys
└── index.ts        # getMessages(locale), t() helper (server + client provider)
components/
├── icons/Icon.tsx (+ outline paths)
├── ui/Button  Field  Card  ConfirmDialog  States (Skeleton, EmptyState, NoResults, ErrorState)  Toast (provider + region)  Alert  BrandScope  Bidi
├── preferences/ThemeSwitcher  LanguageSwitcher  (client; set cookie, update <html>, router.refresh for locale)
└── shell/AppShell  NavRail  BottomBar   (+ *.module.css)
public/ (none needed; fonts come from packages via next/font/local)
tests/unit/  color.test.ts tokens-contrast.test.ts messages.test.ts navigation.test.ts preferences.test.ts showcase-gate.test.ts logical-css.test.ts
tests/e2e/   theme-locale.spec.ts a11y.spec.ts components.spec.ts shell.spec.ts print.spec.ts (+ existing health.spec.ts)
```

Other edits: `playwright.config.ts` (webServer env `LIFTER_SHOWCASE=1`; mobile project), `package.json`/lock (3 deps), README (design-system section), docs amendment files (Claude).

**Structure Decision**: Components live in a top-level `components/`, pure logic lives in `lib/design` and `lib/i18n`, and the dev pages sit in a `(dev)` route group. This keeps the pure logic unit-testable in Node Vitest. Components are verified through e2e tests on the showcase, so no DOM test environment is added.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Constitution VIII amendment (lime → emerald) | DESIGN.md is the PO-approved design source and supersedes it | Building lime would violate the PO decision. Building emerald without amending leaves the Constitution contradicting the code. |
| Root layout reads cookies, so all pages render dynamically | First paint must have the correct `dir`, `lang` and theme with no flash, including when JS is off | An inline pre-paint script fails with JS off and with a strict CSP. Static rendering can't know the user's preference. |
