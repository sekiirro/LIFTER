# T020 — Client intake UI report

Date: 2026-10-30
Branch/base: `015-forms-intake` / `3242665529047498ec0117ba801d8a1a7f6ace47`

## Scope and decisions

Implemented a single-question flow with a memory-only adapter, branch-aware draft answers, stale-revision conflict recovery, required-answer submission checks, correction entry while the relationship is active, and a read-only history view. Inapplicable answers are removed from current answers and filtered from every displayed history version. Corrections are unavailable after relationship end. A showcase-gated preview route renders the mock for screenshots; no API route, database, production assignment data, navigation, staff builder, or redirect behavior was added.

Existing `TextAnswerField`, shared progression/validation, UI primitives, semantic design tokens, `Bidi`, and bilingual messages are used. The preview runs inside the existing `BrandScope` with sample workspace color `#7C3AED` so both themes exercise the brand override while status colors remain the shared semantic tokens. No design gap was encountered. No animation or new dependency was added.

## Design skills catalog review

The design-skills catalog available to the author contained 55 skills. Selection and reason for each:

| Skill                          | Status         | Reason                                                                                                                  |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apple-design`                 | NOT APPLICABLE | No motion or Apple-platform behavior is in scope.                                                                       |
| `ui-ux-pro-max`                | APPLIES        | Lookup only; searched form UX guidance without persisting generated design output.                                      |
| `impeccable`                   | APPLIES        | Used Operate-mode and craft-floor principles; launcher was unavailable, so project context was read directly.           |
| `frontend-design`              | APPLIES        | Applied production-quality implementation within the approved LIFTER visual system.                                     |
| `baseline-ui`                  | APPLIES        | Reviewed hierarchy, spacing, wrapping, and responsive controls.                                                         |
| `design-dna`                   | NOT APPLICABLE | The task uses the existing token system and does not define design DNA.                                                 |
| `genjutsu`                     | NOT APPLICABLE | No creative coding, effects, or multi-agent design work is needed.                                                      |
| `emil-design-eng`              | APPLIES        | Applied restraint and reviewed visible UI details; no extra effects were warranted.                                     |
| `animate`                      | NOT APPLICABLE | The feature spec does not call for motion.                                                                              |
| `animate-expo`                 | NOT APPLICABLE | This is a Next.js web UI, not Expo.                                                                                     |
| `review-animations`            | NOT APPLICABLE | No animation code changed.                                                                                              |
| `improve-animations`           | NOT APPLICABLE | No animation code changed.                                                                                              |
| `find-animation-opportunities` | NOT APPLICABLE | Motion is not called for by the spec.                                                                                   |
| `animation-vocabulary`         | NOT APPLICABLE | No motion decisions are needed.                                                                                         |
| `animation-performance`        | NOT APPLICABLE | No animation code changed.                                                                                              |
| `prototype`                    | NOT APPLICABLE | The request is for one approved flow, not visual alternatives.                                                          |
| `mobile-native`                | NOT APPLICABLE | No PWA/native browser behavior or metadata is changing.                                                                 |
| `pick-ui-library`              | NOT APPLICABLE | Existing native controls and project primitives cover the flow; no library selection is needed.                         |
| `ask-sonner`                   | NOT APPLICABLE | The flow uses inline status feedback, not Sonner.                                                                       |
| `write-swift`                  | NOT APPLICABLE | No Swift code is involved.                                                                                              |
| `break-ui`                     | NOT APPLICABLE | The task requests targeted mutations, not a worst-case-data toggle audit.                                               |
| `better-ui`                    | APPLIES        | Used for component consistency, controls, and restraint.                                                                |
| `better-typography`            | APPLIES        | Checked English/Arabic hierarchy, wrapping, counters, and bidi isolation.                                               |
| `better-colors`                | APPLIES        | Reused semantic theme tokens and checked the sample brand override in both themes.                                      |
| `better-accessibility`         | APPLIES        | Applied native labels, keyboard paths, visible focus conventions, and announcements; axe run in all requested variants. |
| `better-layout`                | APPLIES        | Checked logical alignment and mobile/desktop reflow.                                                                    |
| `better-interface`             | APPLIES        | Consolidated the design-domain self-review against the full flow.                                                       |
| `better-writing`               | APPLIES        | Added calm, action-oriented bilingual state copy.                                                                       |
| `interface-review`             | APPLIES        | Reviewed the change scope and direct rendered consumer; generated output and unrelated files were excluded.             |
| `visual-style-presets`         | NOT APPLICABLE | `DESIGN.md` already fixes the visual direction.                                                                         |
| `glass-dark-ui`                | NOT APPLICABLE | Glass surfaces conflict with the approved product language and are not requested.                                       |
| `progressive-blur`             | NOT APPLICABLE | No blur effect is needed.                                                                                               |
| `motion-design`                | NOT APPLICABLE | The feature spec does not call for motion.                                                                              |
| `css-animation`                | NOT APPLICABLE | No animation is requested.                                                                                              |
| `remotion-motion-graphics`     | NOT APPLICABLE | No video composition is involved.                                                                                       |
| `gsap-core`                    | NOT APPLICABLE | No animation is requested.                                                                                              |
| `threejs-fundamentals`         | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-animation`            | NOT APPLICABLE | No 3D or animation is involved.                                                                                         |
| `threejs-geometry`             | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-interaction`          | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-lighting`             | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-loaders`              | NOT APPLICABLE | No 3D assets are involved.                                                                                              |
| `threejs-materials`            | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-postprocessing`       | NOT APPLICABLE | No 3D scene is involved.                                                                                                |
| `threejs-shaders`              | NOT APPLICABLE | No shader effects are involved.                                                                                         |
| `threejs-textures`             | NOT APPLICABLE | No 3D textures are involved.                                                                                            |
| `gsap-frameworks`              | NOT APPLICABLE | No GSAP animation is requested.                                                                                         |
| `gsap-performance`             | NOT APPLICABLE | No GSAP animation is requested.                                                                                         |
| `gsap-plugins`                 | NOT APPLICABLE | No GSAP plugin is needed.                                                                                               |
| `gsap-react`                   | NOT APPLICABLE | No React animation is requested.                                                                                        |
| `gsap-scrolltrigger`           | NOT APPLICABLE | No scroll animation is requested.                                                                                       |
| `gsap-timeline`                | NOT APPLICABLE | No animation sequencing is requested.                                                                                   |
| `gsap-utils`                   | NOT APPLICABLE | No GSAP utilities are needed.                                                                                           |
| `lottie`                       | NOT APPLICABLE | No Lottie asset is involved.                                                                                            |
| `remotion-to-hyperframes`      | NOT APPLICABLE | No Remotion or HyperFrames work is involved.                                                                            |

### Advisory conflicts

- `frontend-design` suggests choosing novel fonts, palettes, and effects; the approved `DESIGN.md` and tokens take precedence, so none were introduced.
- `baseline-ui` assumes Tailwind; this repository uses CSS Modules and semantic tokens, which were retained.
- The UI Pro Max lookup recommended Server Actions. That conflicts with the explicit mock-only, no-API scope, so persistence remains an injected in-memory adapter.

## Frontend design gate

| Check                      | Result | Evidence                                                                                                                                                                     |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and workspace brand | PASS   | Component styles use existing semantic color, spacing, radius, type, motion, and touch tokens. Preview uses `BrandScope`; success/warning/error tokens remain semantic.      |
| Typography and bidi        | PASS   | Root Geist / IBM Plex Sans Arabic; logical layout; progress/version numbers, timestamps, and question IDs isolated with `Bidi`.                                              |
| Layout and UI consistency  | PASS   | Existing `Button`, `Alert`, and `TextAnswerField`; 34rem content measure follows the existing registration form convention; mobile controls wrap.                            |
| Contrast and themes        | PASS   | Axe clean in light and dark; sample workspace color `#7C3AED` is active in the preview matrix.                                                                               |
| Accessibility              | PASS   | Native labelled controls, keyboard progression, disabled conflict state with reload action, visible focus from shared controls, status/error semantics; axe zero violations. |
| Flow states                | PASS   | Loading, empty history, invalid answer, save pending/success/error, conflict/reload, submission pending/success/error, correction, and ended relationship are implemented.   |
| Bilingual copy             | PASS   | New client-flow copy is in Arabic and English message catalogs; no visible strings are hard-coded in the flow.                                                               |
| Screenshot matrix          | PASS   | Real Playwright renders at 390px and 1440px, AR-RTL/EN-LTR, light/dark; reviewed after fixes.                                                                                |
| Tests and size             | PASS   | Unit, e2e, axe, typecheck, lint, formatting, diff check, size, and edge build passed; no dependency added.                                                                   |

Screenshots saved under `%TEMP%`:

- `lifter-f15-ar-light-390.png`, `lifter-f15-ar-light-1440.png`
- `lifter-f15-ar-dark-390.png`, `lifter-f15-ar-dark-1440.png`
- `lifter-f15-en-light-390.png`, `lifter-f15-en-light-1440.png`
- `lifter-f15-en-dark-390.png`, `lifter-f15-en-dark-1440.png`

## Test-first and mutation evidence

- Component tests first: RED because `QuestionFlow` was not present; GREEN after implementation.
- Inapplicable-answer mutant (retain all answers): 1 component test failed; restored branch filtering, test passed.
- UTF-16 mutant (`value.length`): 2 counter tests failed on emoji; restored code-point spread counting, tests passed.
- Requiredness mutant (skip `progression.complete` guard): the Playwright incomplete-submission assertion failed; restored validation guard.

## Verification record

- Full unit suite: `npm test -- --reporter=dot` — 70 files, 1,444 passed, 0 failed, 0 skipped.
- Browser suite: `npm run e2e -- tests/e2e/forms-client.spec.ts` — 11/11 passed; eight matrix renders each ran axe with 0 violations.
- `npm run typecheck`, `npm run lint`, `npx prettier --check` on all changed source and report files, and `git diff --check` passed on the final files.
- `npm run build:edge` passed. OpenNext emitted its Windows compatibility advisory and Next emitted the existing middleware deprecation notice; build completed successfully.
- `npm run size` passed: web worker 6,833.10 KiB uncompressed / 1,415.18 KiB gzip (65,536 KiB limit); cron worker 2.85 KiB / 1.25 KiB gzip (65,536 KiB limit).
