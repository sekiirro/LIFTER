# T021 ? Staff forms UI report

Date: 2026-10-30
Branch/base: 015-forms-intake / e2f2f426a82d47b992b6d89218db0713f157e98d
Execution runtime: GPT-6 Codex; Luna High was not available in this session.

## Scope

Implemented showcase-only staff form builder, synthetic intake list, and separate client-late / Trainer-late SLA views. Components consume FormsStaffAdapter and FormsWorkspaceBrandSource interfaces; only the dev/showcase wrapper imports the in-memory adapter. No API routes, database, browser persistence, or real staff route were added. Forms start empty and do not invent Mandatory Intake content. Limits, draft/publish/copy/retire actions, role preview, status messages, Cairo deadlines and synthetic alerts follow the approved F15 decisions. F14 is unmerged, so brand resolution returns neutral null; its integration remains open. The explicit T022 carry-forward is recorded in tasks.md: the current client assignment route still renders FormsDemo behind isShowcaseEnabled and must receive the real authorized adapter in the DB unit only; it was left unchanged.

T011 pure DB-free modules were checked and already existed: applicability, validation/bounds, deterministic progression and Cairo date helpers. Persisted draft/submission and database enforcement remain open in T012/T013/T029.

## Design skills catalog review

The complete catalog contains 55 skills. Each is classified below; the approved DESIGN.md, system tokens, and existing components remain authoritative.

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

- frontend-design suggestions for novel fonts, palettes, or effects defer to the approved LIFTER design system; none were added.
- baseline-ui examples assume Tailwind; this repository uses CSS Modules and semantic tokens.
- ui-ux-pro-max was used for lookup only. Its generic suggestions did not change the mock-only scope or project authorities.
- impeccable launcher was unavailable; project context and craft-floor guidance were read and applied directly.
- No motion skill applied; no motion was added.

## Frontend design gate

| Check                      | Result      | Evidence                                                                                                                                                                                                                                                     |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens and workspace brand | PASS / OPEN | Feature styling uses existing semantic color, spacing, radius, type, and motion tokens. Brand source is interface-injected and returns neutral null; no success/warning/error colors are changed. Live F14 brand integration is open pending contract merge. |
| Typography and bidi        | PASS        | Geist / IBM Plex Sans Arabic from app roots; logical CSS; dates, IDs, and numeric limits use Bidi.                                                                                                                                                           |
| Layout and UI consistency  | PASS        | Existing Button and TextAnswerField; CSS Modules; responsive layout uses design tokens and existing breakpoints.                                                                                                                                             |
| Contrast and themes        | PASS / OPEN | Neutral fallback passed axe in light and dark. Sample F14 workspace colors cannot be exercised until its approved contract merges; no colors were invented.                                                                                                  |
| Accessibility              | PASS        | Native labels/buttons/select, pressed-state view picker, visible shared focus, status/alert semantics; a Playwright Tab/Enter path reaches intake and alerts; all matrix axe runs report zero violations.                                                    |
| States                     | PASS        | Loading, load error, empty builder/intake, save/publish error/success, disabled Sales, busy actions, role and view interaction covered.                                                                                                                      |
| Bilingual copy             | PASS        | New visible copy is in lib/i18n/messages/ar.ts and en.ts; no view copy is hard-coded.                                                                                                                                                                        |
| Screenshot matrix          | PASS        | Builder, intake, and alerts rendered at AR-RTL/EN-LTR ? light/dark ? 390/1440. Initial dark active-button contrast issue was fixed by using a token-styled secondary selected state; final matrix reviewed.                                                  |
| Tests / dependency / size  | PASS        | Focused unit, complete unit suite, Playwright/axe matrix, typecheck, lint, Prettier, diff check, edge build and size; no new dependency.                                                                                                                     |

Screenshots saved under C:\Users\NEW LAP\AppData\Local\Temp:

- Builder: lifter-f15-t021-staff-ar-light-390.png, lifter-f15-t021-staff-ar-light-1440.png, lifter-f15-t021-staff-ar-dark-390.png, lifter-f15-t021-staff-ar-dark-1440.png, lifter-f15-t021-staff-en-light-390.png, lifter-f15-t021-staff-en-light-1440.png, lifter-f15-t021-staff-en-dark-390.png, lifter-f15-t021-staff-en-dark-1440.png.
- Intake: lifter-f15-t021-intake-ar-light-390.png, lifter-f15-t021-intake-ar-light-1440.png, lifter-f15-t021-intake-ar-dark-390.png, lifter-f15-t021-intake-ar-dark-1440.png, lifter-f15-t021-intake-en-light-390.png, lifter-f15-t021-intake-en-light-1440.png, lifter-f15-t021-intake-en-dark-390.png, lifter-f15-t021-intake-en-dark-1440.png.
- Alerts: lifter-f15-t021-alerts-ar-light-390.png, lifter-f15-t021-alerts-ar-light-1440.png, lifter-f15-t021-alerts-ar-dark-390.png, lifter-f15-t021-alerts-ar-dark-1440.png, lifter-f15-t021-alerts-en-light-390.png, lifter-f15-t021-alerts-en-light-1440.png, lifter-f15-t021-alerts-en-dark-390.png, lifter-f15-t021-alerts-en-dark-1440.png.

## Test-first and mutation evidence

- RED: focused unit import failed because FormBuilder did not exist (0 tests); implementation then passed the focused staff/forms suites.
- Permission mutant: granting Sales access failed both the role unit test and mock adapter lifecycle test; restored.
- Deadline mutant: Mandatory Intake = four days failed the approved three-day assertion; restored.
- Client-alert escalation mutant: using the Trainer +24h schedule for owner escalation failed the +48h assertion; restored.
- A first full view-matrix pass found a dark-theme selected-tab contrast failure. The selected view now uses a secondary button surface, --brand-ring border, and --color-text; final matrix passes.

## Verification record

- Full unit suite: npm test ? 71 files, 1,451 passed, 0 failed, 0 skipped.
- Browser suite: npm run e2e -- tests/e2e/forms-staff.spec.ts ? 20/20 passed; 24 rendered view variants (builder, intake, alerts ? AR-RTL/EN-LTR ? light/dark ? 390/1440) each ran axe with 0 violations.
- npm run typecheck, npm run lint, Prettier check, and git diff --check passed.
- npm run build:edge passed. OpenNext reported its existing Windows compatibility advisory and Next.js reported the middleware deprecation notice; build completed.
- npm run size passed: web worker 6,942.65 KiB uncompressed / 1,436.82 KiB gzip (65,536 KiB limit); cron worker 2.85 KiB / 1.25 KiB gzip (65,536 KiB limit).
- No dependency added. Commit/push SHA will be recorded in the completion report.
