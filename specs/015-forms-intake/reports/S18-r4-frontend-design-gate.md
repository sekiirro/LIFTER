# F15 S18 r4 — Frontend design gate

## Authority and review

This was a narrow extension of the existing Forms Builder and client question flow. DESIGN.md, implemented design tokens/components, and the patched F15 spec/PO decisions were treated as authority. No token, font, color, shared component, dependency, or motion system was changed. The visual-direction prompts in advisory skills conflict with the PO-approved design system; the design system took precedence.

The default form screen uses the existing staff Builder, field, button, card, and spacing patterns. Contextual health guidance uses the approved bilingual label in the existing question surface only when the current question is health-related. The standalone notice surface was removed.

## Verification checklist

- Tokens only — PASS. Reused existing form controls and CSS tokens; no hard-coded color, spacing, radius, or font values were introduced.
- Typography — PASS. Arabic uses the existing Arabic face and RTL direction; English uses the existing English face. The approved title and mixed-direction fields rendered correctly.
- Layout — PASS. Existing Builder hierarchy and question layout retained; RTL and LTR reviewed at mobile, tablet, and desktop widths.
- Contrast — PASS. Light/dark and sample brand health-question states passed axe; screenshots were visually reviewed. Semantic success colors remain on existing tokens.
- Accessibility — PASS. Native buttons and labeled fields, selected state exposure, keyboard focus, reduced-motion state, and axe checks passed in Playwright.
- States — PASS for changed behavior. Default draft, editable controls, selected onboarding state, role-denied controls, and health-question context were covered by unit/e2e checks. No new loading, success, error, or animation pattern was introduced.
- Copy — PASS with one DRAFT item. Approved title and health label are in i18n; new selection-action labels remain explicitly marked DRAFT in English and Arabic. No standalone consent or acknowledgment copy was added.
- Rendered matrix — PASS. Playwright saved AR/EN × light/dark × 390/768/1440 captures for onboarding Builder and health context. Terms and Welcome states were also captured. Axe was clean on every matrix capture.
- Tests and size — PASS. Full unit suite: 1,743/1,743. Focused Playwright: 1 passed; axe clean. Worker size gate passed.

Screenshots are in `reports/evidence/s18-r4/`; the repository-local `INDEX.md` lists all 50 captures. Matrix filename patterns: onboarding-builder-{ar,en}-{light,dark}-{mobile,tablet,desktop}.png and health-context-{ar,en}-{light,dark}-{mobile,tablet,desktop}.png. Terms, Welcome, keyboard-focus and reduced-motion captures use s14-_, welcome-_, keyboard-focus and reduced-motion names. Reviewed Arabic/English light/dark mobile/desktop samples against DESIGN §12; no findings remained.

## Skill selection

The complete local design-skill catalog was read. Each entry is classified below. ui-ux-pro-max was used for lookup only; no generated system or repository artifact was created.

| Skill                        | Status         | Reason                                                                                                                          |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| apple-design                 | NOT APPLICABLE | No new visual direction or alternate concept was requested; the PO-approved design system governs.                              |
| ui-ux-pro-max                | APPLIES        | Lookup only: searched contextual form helper and accessibility guidance; no generated artifacts.                                |
| impeccable                   | APPLIES        | Loaded project context and craft floor, reviewed the finished surface, and ran the detector with no findings.                   |
| frontend-design              | APPLIES        | Reviewed the extension against the existing LIFTER identity; open-ended direction advice yielded to the approved design system. |
| baseline-ui                  | APPLIES        | Checked spacing, hierarchy, component reuse, and empty/default form states.                                                     |
| design-dna                   | NOT APPLICABLE | No new design system, creative-code system, UI library, or toast library was introduced.                                        |
| genjutsu                     | NOT APPLICABLE | No new design system, creative-code system, UI library, or toast library was introduced.                                        |
| emil-design-eng              | APPLIES        | Self-reviewed hierarchy and control alignment against the incumbent visual implementation.                                      |
| animate                      | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| animate-expo                 | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| review-animations            | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| improve-animations           | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| find-animation-opportunities | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| animation-vocabulary         | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| animation-performance        | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| prototype                    | NOT APPLICABLE | No new visual direction or alternate concept was requested; the PO-approved design system governs.                              |
| mobile-native                | NOT APPLICABLE | The task changes responsive web UI, not installed/PWA browser behavior.                                                         |
| pick-ui-library              | NOT APPLICABLE | No new design system, creative-code system, UI library, or toast library was introduced.                                        |
| ask-sonner                   | NOT APPLICABLE | No new design system, creative-code system, UI library, or toast library was introduced.                                        |
| write-swift                  | NOT APPLICABLE | No Swift code is involved.                                                                                                      |
| break-ui                     | NOT APPLICABLE | The brief required a design-matrix review, not the adversarial worst-case fixture and toggle workflow.                          |
| better-ui                    | APPLIES        | Reviewed existing controls and interaction details; no new effects or primitives were added.                                    |
| better-typography            | APPLIES        | Reviewed Arabic/English fonts, wrapping, and mixed-direction titles in rendered screenshots.                                    |
| better-colors                | APPLIES        | Reviewed light/dark and sample workspace brand states; axe reported no contrast violations.                                     |
| better-accessibility         | APPLIES        | Checked keyboard path, visible focus, state semantics, touch layout, reduced motion, and axe.                                   |
| better-layout                | APPLIES        | Reviewed RTL/LTR layout and mobile/tablet/desktop reflow.                                                                       |
| better-interface             | APPLIES        | Ran the cross-discipline interface review across behavior, copy, layout, and accessibility.                                     |
| better-writing               | APPLIES        | Kept PO-approved copy verbatim; marked the new builder selection labels DRAFT.                                                  |
| interface-review             | APPLIES        | Reviewed the changed surface and verified rendered states.                                                                      |
| visual-style-presets         | NOT APPLICABLE | No new visual direction or alternate concept was requested; the PO-approved design system governs.                              |
| glass-dark-ui                | NOT APPLICABLE | No new visual direction or alternate concept was requested; the PO-approved design system governs.                              |
| progressive-blur             | NOT APPLICABLE | No new visual direction or alternate concept was requested; the PO-approved design system governs.                              |
| motion-design                | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| css-animation                | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| remotion-motion-graphics     | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-core                    | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-fundamentals         | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-animation            | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-geometry             | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-interaction          | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-lighting             | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-loaders              | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-materials            | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-postprocessing       | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-shaders              | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| threejs-textures             | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-frameworks              | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-performance             | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-plugins                 | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-react                   | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-scrolltrigger           | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-timeline                | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| gsap-utils                   | NOT APPLICABLE | The skill targets a different framework or artifact than this focused Next.js form UI change.                                   |
| lottie                       | NOT APPLICABLE | No Remotion/HyperFrames composition or Lottie asset is involved.                                                                |
| remotion-to-hyperframes      | NOT APPLICABLE | No Remotion/HyperFrames composition or Lottie asset is involved.                                                                |
