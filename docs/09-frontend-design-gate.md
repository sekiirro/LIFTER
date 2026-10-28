# LIFTER — Mandatory Frontend Design Gate

Append this gate to every brief for a unit that changes rendered UI. Binding PO policy
(2026-10-28).

## 0. Authority order (single source of truth)

1. `DESIGN.md` (PO-approved design reference) and the decisions recorded in it (§10 approval log).
2. `specs/002-design-system/` (spec, plan, research) and the implemented tokens/components:
   `lib/design/tokens.ts` + `lib/design/tokens-css.ts` (token source), `app/globals.css`,
   `components/ui/BrandScope.tsx` (workspace brand override), the `app/(dev)/showcase` reference
   page, `components/ui/*`, `components/shell/*`, `components/preferences/*`,
   `components/icons/*`, and i18n in `lib/i18n/`.
3. The feature's own Spec Kit artifacts and PO decisions in `docs/SESSION_HANDOFF.md`.
4. The environment-local design-skills catalog (not in the repo; advisory). A skill never overrides
   1–3, never adds tokens, colors, fonts, components, motion, or dependencies on its own authority.

## 1. Skill selection (record it in the REPORT)

- Read the whole catalog. For each skill, mark APPLIES / NOT APPLICABLE with a one-line reason
  (e.g. Swift/Expo-native skills are not applicable to this Next.js web app).
- Load and apply every APPLIES skill during design, implementation, and self-review. Typical web
  set: frontend-design, impeccable, better-ui, better-typography, better-colors, better-layout,
  better-accessibility, better-writing, better-interface/interface-review, emil-design-eng,
  baseline-ui, design-taste-frontend, ui-ux-pro-max; motion skills only if the spec calls for
  motion.
- Conflict between a skill and the Design System → the Design System wins; note the conflict in the
  REPORT.
- `ui-ux-pro-max`: lookup/search only. NEVER run `--design-system --persist` or write its output
  (MASTER.md, generated design systems, palettes) into any repo; its generated design system is not
  an authority. Quarantined skills (`design-taste-frontend`, `anti-koshary`) are not installed — do
  not fetch or use them.

## 2. Design-gap escalation (STOP rule)

If a needed UI decision is not in the approved Design System — a component, interaction,
color/token value, typography rule, breakpoint, touch size, layout pattern, motion, icon, or
empty/error copy pattern — or it touches an item listed in `DESIGN.md` §11 (unresolved):

- Do NOT invent or finalize it. Do NOT edit `DESIGN.md`, tokens, or shared components to fill it.
- Stop that part, and in the REPORT give: the exact gap, where it is needed (file/screen), 2–3
  options with trade-offs, and your recommendation. The architect takes it to the PO. Continue only
  with work that does not depend on the gap.

## 3. Quality bar

Premium, distinctive, cohesive with the existing LIFTER UI — no generic AI SaaS styling (no stock
gradients/glows, card soup, emoji icons, or filler copy). No animation, effect, dependency, or
complexity added just because a skill suggests it; motion only when purposeful and respectful of
`prefers-reduced-motion`.

## 4. Verification checklist

For each item, record PASS/FAIL and evidence in the REPORT.

- [ ] Tokens only (no hard-coded colors/spacing/radii/fonts); workspace brand override does not
  alter success/warning/error.
- [ ] Typography: Geist (EN) / IBM Plex Sans Arabic (AR), scale and hierarchy per `DESIGN.md` §3;
  mixed-direction content (numbers, codes, Latin) via `Bidi` not mirrored.
- [ ] Spacing, alignment, layout, and component consistency with existing `components/ui`.
- [ ] Contrast (text, borders, focus, interactive states) in light and dark, including with sample
  workspace brand colors.
- [ ] Accessibility: keyboard path, visible focus, screen-reader names/roles/live regions, touch
  targets, reduced motion; axe clean.
- [ ] States: loading, empty, error, success, disabled, pending, interaction (hover/active/focus).
- [ ] Copy: bilingual AR/EN from `lib/i18n/messages`, no hard-coded strings; generic security copy
  kept verbatim where specified.
- [ ] Matrix rendered and screenshotted (Playwright, real rendered screens): {AR-RTL, EN-LTR} ×
  {light, dark} × {mobile 390px, desktop 1440px} (+ tablet when layout changes). Screenshots saved
  under the run's OS temp dir; list paths. Reviewed by you against `DESIGN.md` §12; findings fixed
  and re-shot.
- [ ] Tests: unit/e2e/axe for the changed UI; no new dependency; `npm run size` within budget.
