# T022 real client assignment route — S26 F15 round F3

## Implementation

- Replaced the showcase-gated assignment page with a dynamic, no-store server route. It loads the signed-in client's own assignment snapshot through the session-only `read_form_assignment_context`, `read_client_form_draft`, and audited `read_form_answer` readers. Foreign and nonexistent assignments share the same `not_found` outcome and Next.js 404 rendering.
- Added a session-cookie adapter for the existing draft, submit, and correction endpoints. The form saves once before submit; no autosave/debounce behavior was added. Raw provider errors stay server-side and route responses remain private/no-store.
- Added the exact canonical UUID destination to the F12 client route allowlist. After approval, status polling redirects only when the reader finds exactly one unsubmitted assignment; otherwise it stays on the existing `/` destination. The status page remains the manual recovery path.
- Kept `/showcase/forms` behind its existing flag. Added localized loading and unavailable states using existing message keys/components.
- Stack D additions: forward migrations `20261108230040_f15_client_assignment_route.sql` and `20261108230041_f15_client_route_destination_ambiguity_fix.sql`; no reset or production migration occurred.

## Mutation evidence

| Mutant | Assertion that rejects it |
| --- | --- |
| Drop assignment ownership predicate | Stack D route test returns no context for a foreign client's assignment; named ownership source mutant fails. |
| Use a service-role client in the server adapter | Unit source assertion requires the session client and rejects service-role construction. |
| Remove the F12 route allowlist entry | Unit allowlist test rejects non-allowlisted and malformed destinations; status navigation falls back to `/`. |
| Distinguish foreign from nonexistent IDs | Integration and unit tests require the same `not_found` result and rendered 404. |
| Return raw provider diagnostics | Unit adapter and route tests require a generic unavailable response without provider details. |

## Verification

| Gate | Result |
| --- | --- |
| Stack D integration | 96 files passed, 1 skipped; 1,484 tests passed, 1 skipped. Includes the T013 race and T022 authorized-route integration tests. |
| Clean-environment unit | 164 files passed; 2,112 tests passed. |
| Focused F15 Playwright | 58 passed, 0 failed, 1 worker. Covers existing F15 client/staff views plus the real route. |
| `npm run lint` | Pass. |
| `npm run typecheck` | Pass. |
| `npm run format:check` | Pass. |
| `npm run build` | Pass; `/forms/[assignmentId]` is dynamically rendered. |
| `npm run build:edge` | Pass. |
| `npm run size` | Pass; web worker 8,477.38 KiB uncompressed (12.94% of limit), cron worker 11.76 KiB (0.02%). |
| `npm run check:secrets` | Pass. |
| `git diff --check` | Pass. |

Stack D container `StartedAt` at round start, immediately before the final gates, and after the final gates: `2026-11-02T02:49:43.191849795Z` at all three checks. No reset occurred.

The first whole-repository Playwright attempt was not clean (46 passed, 9 skipped, 4 did not run, with unrelated suite failures and a server-log global-teardown error). The required scoped F15 Playwright run above passed after using one worker.

## Rendered evidence

Screenshots were saved under the OS temp directory and reviewed against `DESIGN.md` §12:

- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/ar-light-390.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/ar-dark-390.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/ar-light-1440.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/ar-dark-1440.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/en-light-390.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/en-dark-390.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/en-light-1440.png`
- `C:/Users/NEW LAP/AppData/Local/Temp/lifter-s26-f15-t022/en-dark-1440.png`

### Design checklist

- **Tokens only — PASS:** reuses the existing `QuestionFlow`, `Button`, `Alert`, loading styles, spacing, and CSS variables. No shared token/component changes. Sample `#0F766E` brand scope preserves success/warning/error variables and passes axe in light and dark.
- **Typography and direction — PASS:** existing Geist/IBM Plex Sans Arabic stack; Arabic renders RTL and English LTR. Question counts and mixed-direction values keep the existing `Bidi` handling.
- **Layout and component consistency — PASS:** all eight screenshots use the approved QuestionFlow structure at 390px and 1440px, without new visual patterns.
- **Contrast — PASS:** axe is clean across the rendered route matrix and with the sample workspace brand in both themes. The first brand check caught an in-flight existing button color transition; the test now moves the pointer away and waits for that existing transition to finish before axe.
- **Accessibility — PASS:** Playwright covers keyboard progression, form labels/regions, safe not-found, and axe. Existing buttons keep their token-sized hit area and visible focus style; the route adds no motion, so existing reduced-motion handling remains in force.
- **States — PASS:** the route renders its existing loading state and the localized unavailable state; the new-assignment form covers empty answers and interaction, while draft/save/submit/conflict/invalid/submitted states use the existing `QuestionFlow` and route contracts.
- **Bilingual copy — PASS:** no new product strings; all visible copy comes from existing `lib/i18n/messages` keys and form-version labels. Existing generic security wording is unchanged.
- **Matrix — PASS:** AR-RTL and EN-LTR × light and dark × 390px and 1440px; all screenshots reviewed and no visual defect required a re-shot.
- **Tests and size — PASS:** focused F15 Playwright 58/58; clean unit and Stack D gates above; no new dependency; size stays within budget.

### DRAFT strings

None introduced. The route uses approved existing `forms.title`, `forms.invalidForm`, `forms.loading`, and save/submit/history message keys. Existing PO-pending legal or welcome copy was not changed.

### Skill catalog assessment

The full catalog at `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was reviewed. Applicable advisory skills never override `DESIGN.md`, the design-system spec/tokens, or existing product decisions. See the per-skill APPLIES / NOT APPLICABLE table below.

## Carry-forward

T012's client autosave debounce/max-unsaved behavior remains open. The route now exists for its later implementation under S26-R2; this unit intentionally does not add autosave.

| Skill | Assessment |
| --- | --- |
| `apple-design` | NOT APPLICABLE: no new visual direction, effects, or variants are needed; the approved QuestionFlow is reused. |
| `ui-ux-pro-max` | APPLIES: lookup/search only for form feedback, labels and keyboard guidance; no generated design system was written. |
| `impeccable` | APPLIES: ran context and the detector; treated the page as a narrow extension of the incumbent UI, not a redesign. |
| `frontend-design` | APPLIES: assessed the rendered route while preserving the approved visual identity; new direction, font, palette and motion suggestions were constrained by the design-system authority. |
| `baseline-ui` | APPLIES: checked hierarchy, components and states; existing CSS modules and project primitives take precedence over its Tailwind defaults. |
| `design-dna` | NOT APPLICABLE: no new design system, tokens, visual effects or creative coding is in scope. |
| `genjutsu` | NOT APPLICABLE: no new design system, tokens, visual effects or creative coding is in scope. |
| `emil-design-eng` | APPLIES: preserved existing interaction feedback and added no animation or unnecessary motion. |
| `animate` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `animate-expo` | NOT APPLICABLE: this targets native/Swift/Expo implementation; the surface is a Next.js web route. |
| `review-animations` | NOT APPLICABLE: this task does not add a new component or motion surface for that specialized review; existing QuestionFlow coverage and the required route matrix cover the change. |
| `improve-animations` | NOT APPLICABLE: this task does not add a new component or motion surface for that specialized review; existing QuestionFlow coverage and the required route matrix cover the change. |
| `find-animation-opportunities` | NOT APPLICABLE: this task does not add a new component or motion surface for that specialized review; existing QuestionFlow coverage and the required route matrix cover the change. |
| `animation-vocabulary` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `animation-performance` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `prototype` | NOT APPLICABLE: no new visual direction, effects, or variants are needed; the approved QuestionFlow is reused. |
| `mobile-native` | NOT APPLICABLE: this targets native/Swift/Expo implementation; the surface is a Next.js web route. |
| `pick-ui-library` | NOT APPLICABLE: no UI library or dependency is being selected or added. |
| `ask-sonner` | NOT APPLICABLE: this route does not introduce Sonner or new toast behavior. |
| `write-swift` | NOT APPLICABLE: this targets native/Swift/Expo implementation; the surface is a Next.js web route. |
| `break-ui` | NOT APPLICABLE: this task does not add a new component or motion surface for that specialized review; existing QuestionFlow coverage and the required route matrix cover the change. |
| `better-ui` | APPLIES: preserved existing components/tokens and reviewed the rendered states. |
| `better-typography` | APPLIES: verified the existing Geist/IBM Plex Arabic stack, scale and bidi rendering. |
| `better-colors` | APPLIES: checked light/dark contrast, brand override contrast, and semantic status token invariance. |
| `better-accessibility` | APPLIES: applied keyboard, semantic, focus and axe checks to the real route. |
| `better-layout` | APPLIES: checked responsive alignment/reading order in RTL/LTR at 390px and 1440px. |
| `better-interface` | APPLIES: reviewed the changed route across layout, color, typography, writing and accessibility domains. |
| `better-writing` | APPLIES: verified bilingual existing message keys and security copy; added no product copy. |
| `interface-review` | APPLIES: reviewed the changed route and adjacent navigation/API consumers against its base behavior. |
| `visual-style-presets` | NOT APPLICABLE: no new visual direction, effects, or variants are needed; the approved QuestionFlow is reused. |
| `glass-dark-ui` | NOT APPLICABLE: no new visual direction, effects, or variants are needed; the approved QuestionFlow is reused. |
| `progressive-blur` | NOT APPLICABLE: no new visual direction, effects, or variants are needed; the approved QuestionFlow is reused. |
| `motion-design` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `css-animation` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `remotion-motion-graphics` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-core` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `threejs-fundamentals` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-animation` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-geometry` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-interaction` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-lighting` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-loaders` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-materials` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-postprocessing` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-shaders` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `threejs-textures` | NOT APPLICABLE: no 3D, WebGL scene, shader or model is part of this route. |
| `gsap-frameworks` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-performance` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-plugins` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-react` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-scrolltrigger` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-timeline` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `gsap-utils` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `lottie` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
| `remotion-to-hyperframes` | NOT APPLICABLE: the spec requests no motion work and the route adds no animation or motion dependency. |
