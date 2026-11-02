# F17 T036 evidence — workout plan builder

**Branch:** `017-workout-planner`  
**Scope:** mocked local projection only; no database, migration, stack, Docker, or new dependency.  
**Handoff slice:** `9e153f6` (`feat(f17): stage workout builder copy and fixture`).  
**Implementation commit:** recorded in the release summary after this evidence is committed.

## RED / GREEN

- **RED, before implementation commit:** `tests/unit/workout-builder-actions.test.ts` initially failed to load `lib/plans/workout/builder-actions` because the keyboard action layer did not exist. Before the implementation commit, the mutation pass then forced `moveBuilderItemBy` to return the unchanged document; the test assertion at `tests/unit/workout-builder-actions.test.ts:19` failed because it expected `[ROW_ITEM_ID, BENCH_ITEM_ID]` and received `[BENCH_ITEM_ID, ROW_ITEM_ID]`.
- **GREEN:** restored the implementation from an OS-temp backup and verified its SHA-256 matched. The focused unit test passed after implementation. `tests/e2e/workout-builder.spec.ts:30` verifies keyboard movement and stable item/set ids; `:67` verifies duplicate id remapping and copied notes; `:98` verifies cross-day pointer drag with item/set ID preservation; `:125` verifies the locale/theme/viewport matrix and axe.
- **Mutation result:** removing the keyboard move behavior caused the focused assertion to fail (1 failed); the original implementation was restored and the hash matched. The final Playwright run passed 4/4.

## DRAFT builder copy keys

All 75 keys below exist in both `lib/i18n/messages/ar.ts` and `lib/i18n/messages/en.ts`, marked `DRAFT (F17 T036)`. Arabic and English message values are in those files. The two locale files have matching key sets.

```text
builder.showcaseTitle, builder.showcaseIntro, builder.projectionNotice, builder.plan, builder.planNotes, builder.days, builder.dayTitle, builder.restDayTitle, builder.addSession, builder.addRestDay, builder.addExercise, builder.exercise, builder.chooseExercise, builder.noExerciseSelected, builder.sets, builder.setType, builder.addSet, builder.removeSet, builder.warmup, builder.working, builder.moveDayUp, builder.moveDayDown, builder.setNumber, builder.reps, builder.repsMode, builder.fixedReps, builder.repRange, builder.min, builder.max, builder.load, builder.loadMode, builder.bodyweight, builder.assisted, builder.loadValue, builder.unit, builder.kg, builder.lb, builder.restHint, builder.rirHint, builder.setNotes, builder.exerciseNotes, builder.dayNotes, builder.alternatives, builder.addAlternative, builder.alternativeExercise, builder.noAlternatives, builder.removeAlternative, builder.videoRef, builder.videoRefHint, builder.moveUp, builder.moveDown, builder.moveToDay, builder.move, builder.duplicateExercise, builder.duplicateDay, builder.removeExercise, builder.removeDay, builder.dragExercise, builder.dragDay, builder.emptySession, builder.emptyRest, builder.dayPosition, builder.itemPosition, builder.moveUpNamed, builder.moveDownNamed, builder.moveToDayNamed, builder.duplicateExerciseNamed, builder.removeExerciseNamed, builder.dragExerciseNamed, builder.duplicateDayNamed, builder.removeDayNamed, builder.dragDayNamed, builder.updated, builder.invalidReps, builder.invalidLoad
```

## Browser evidence

- **Playwright:** `PLAYWRIGHT_BASE_URL=http://localhost:3417 npx playwright test tests/e2e/workout-builder.spec.ts --reporter=line` — **4 passed**. The drag interaction test uses a tall viewport so both day targets remain visible during the pointer drag; the screenshot/axe matrix remains at the requested 390px and 1440px widths.
- **Axe:** **0 violations** for AR RTL and EN LTR in light and dark at 390px and 1440px.
- **Screenshots:** full-page captures saved to `%TEMP%/lifter-s26-f17-builder/`:
  - `ar-dark-mobile.png`, `ar-dark-desktop.png`
  - `ar-light-mobile.png`, `ar-light-desktop.png`
  - `en-dark-mobile.png`, `en-dark-desktop.png`
  - `en-light-mobile.png`, `en-light-desktop.png`
- **Visual review:** reviewed AR dark mobile and desktop and EN light mobile and desktop. No overflow or hierarchy issue remained. Native browser controls, shared field/button styles, and established 40rem responsive breakpoint are retained.

## Design checklist

| Check | Result and evidence |
|---|---|
| Tokens and brand override | **PASS.** Feature CSS uses shared color, spacing, radius, type, and touch-size tokens; no local palette or font values. `BrandScope` remaps brand slots through the shared brand helper; this UI does not override semantic success/warning/error tokens. No branded workspace screenshot was requested by the Playwright fixture. |
| Typography and mixed direction | **PASS.** Root styles select Geist for English and IBM Plex Sans Arabic for Arabic. Catalog names use `Bidi`; the video-reference field is explicitly LTR. `lib/i18n/format-digits.ts` is absent on this branch, so the existing locale-native `Intl.NumberFormat(locale, { useGrouping: false })` path formats positions. |
| Components and layout | **PASS.** Uses shared `Button` and `Field`, logical CSS properties, tokenized surfaces, RTL-aware layout, and the project’s existing 40rem breakpoint. |
| Contrast and themes | **PASS.** Axe passed in light and dark for both locales; shared `BrandScope` sample mappings are covered by `tests/unit/branding-contrast-matrix.test.ts` in the full unit run; no local colors bypass design tokens. |
| Accessibility | **PASS.** Every drag action has keyboard/single-pointer controls: day up/down, exercise up/down, and a move-to-day select. Focus-visible comes from the shared global rule; controls use shared touch sizing; live updates use a stable polite status region. |
| States | **PASS for this local projection.** Empty session/rest/alternatives, disabled boundary movement, focus and updated states are present. Loading, network error, and pending-save states do not apply because this preview performs no asynchronous or persistent operation. |
| Copy | **PASS.** All visible copy comes from bilingual messages or bilingual fixture values; draft strings are listed above. Video references are local preview state and are not written into the plan document. |
| Motion | **PASS.** No motion or animation was added; reduced-motion behavior remains inherited from the global system. |
| Responsive matrix | **PASS.** AR RTL + EN LTR × light + dark × 390px + 1440px rendered and screenshotted. |
| Tests and bundle | **PASS.** Unit suite 1,881/1,881; Playwright 3/3; axe 0; no new dependency; web worker 8,034.83 KiB uncompressed (12.26% of 65,536 KiB limit). |

## Design-skill selection (catalog: 55 entries)

| Skill | Selection | Reason |
|---|---|---|
| `apple-design` | NOT APPLICABLE | Native/physical motion direction conflicts with the approved LIFTER visual system and this task adds no motion. |
| `ui-ux-pro-max` | APPLIES — lookup only | Searched UX guidance for keyboard drag alternatives; confirmed non-drag controls and keyboard paths. No generated design system was persisted. |
| `impeccable` | APPLIES | Loaded incumbent context, craft floor, and Operate guidance; ran its one mechanical detector pass. The user explicitly prohibited questions, so the supplied brief and DESIGN.md replaced its intake interview. |
| `frontend-design` | APPLIES, constrained | Used for a working, polished frontend; its open-ended visual direction yields to DESIGN.md and the approved LIFTER components/tokens. |
| `baseline-ui` | APPLIES | Reviewed visual hierarchy, density, spacing, and responsive states against the incumbent components and screenshots. |
| `design-dna` | NOT APPLICABLE | No design-token extraction or shared-system changes were needed. |
| `genjutsu` | NOT APPLICABLE | No creative-coding effects or new design system were needed. |
| `emil-design-eng` | APPLIES, constrained | Applied restraint and clear interaction feedback; any motion or stylistic departures yield to DESIGN.md. |
| `animate` | NOT APPLICABLE | The task does not call for authored motion. |
| `animate-expo` | NOT APPLICABLE | Expo/native animation is outside this Next.js web task. |
| `review-animations` | NOT APPLICABLE | No feature animation was added. |
| `improve-animations` | NOT APPLICABLE | No animation code changed. |
| `find-animation-opportunities` | NOT APPLICABLE | Motion is not needed for the editor workflow and is not part of the feature brief. |
| `animation-vocabulary` | NOT APPLICABLE | No motion concept needed naming. |
| `animation-performance` | NOT APPLICABLE | No authored animation to optimize. |
| `prototype` | NOT APPLICABLE | The visual direction is already approved; the task requests one builder. |
| `mobile-native` | NOT APPLICABLE | PWA/browser-install behavior is outside this responsive editor scope. |
| `pick-ui-library` | NOT APPLICABLE | Existing shared controls and native drag/drop/select controls suffice; no library was selected. |
| `ask-sonner` | NOT APPLICABLE | No toast or asynchronous save flow is present. |
| `write-swift` | NOT APPLICABLE | The feature is a Next.js web interface, not Swift. |
| `break-ui` | NOT APPLICABLE | This task’s acceptance fixture is the specified plan sample; no separate adversarial-content mode was requested or added. |
| `better-ui` | APPLIES, constrained | Applied component consistency and visible interaction states; the catalog marks the skill as conflicting, so DESIGN.md controls styling. |
| `better-typography` | APPLIES, constrained | Applied wrapping and hierarchy checks across Arabic and English; fonts and scale remain those in DESIGN.md. |
| `better-colors` | APPLIES, constrained | Verified token and theme use; its palette/token suggestions cannot supersede approved tokens. |
| `better-accessibility` | APPLIES, constrained | Applied labels, keyboard operation, focus, live status, reduced motion, and axe checks; DESIGN.md and the feature brief control details. |
| `better-layout` | APPLIES, constrained | Applied structural reflow and RTL/LTR checks; existing breakpoint/layout conventions remain authoritative. |
| `better-interface` | APPLIES, constrained | Used as a cross-discipline review of the changed screen; the catalog conflict makes DESIGN.md the style authority. |
| `better-writing` | APPLIES, constrained | Reviewed bilingual field labels, action names, and empty states; DRAFT copy remains exactly in the i18n catalogs for PO review. |
| `interface-review` | APPLIES | Reviewed the changed route, focus path, screen captures, and axe findings. |
| `visual-style-presets` | NOT APPLICABLE | No replacement visual direction or palette was requested. |
| `glass-dark-ui` | NOT APPLICABLE | Glass, glow, and gradient-border treatments are not part of the approved LIFTER system. |
| `progressive-blur` | NOT APPLICABLE | No blur effect is needed or approved for this workflow. |
| `motion-design` | NOT APPLICABLE | No feature motion requested. |
| `css-animation` | NOT APPLICABLE | No animation artifact requested. |
| `remotion-motion-graphics` | NOT APPLICABLE | This is not a video composition task. |
| `gsap-core` | NOT APPLICABLE | No GSAP animation requested. |
| `threejs-fundamentals` | NOT APPLICABLE | No 3D scene. |
| `threejs-animation` | NOT APPLICABLE | No Three.js animation. |
| `threejs-geometry` | NOT APPLICABLE | No Three.js geometry. |
| `threejs-interaction` | NOT APPLICABLE | No Three.js interaction. |
| `threejs-lighting` | NOT APPLICABLE | No Three.js lighting. |
| `threejs-loaders` | NOT APPLICABLE | No Three.js assets or loaders. |
| `threejs-materials` | NOT APPLICABLE | No Three.js materials. |
| `threejs-postprocessing` | NOT APPLICABLE | No WebGL post-processing. |
| `threejs-shaders` | NOT APPLICABLE | No shaders or WebGPU. |
| `threejs-textures` | NOT APPLICABLE | No texture mapping. |
| `gsap-frameworks` | NOT APPLICABLE | This is React/Next.js, not Vue or Svelte. |
| `gsap-performance` | NOT APPLICABLE | No GSAP code to optimize. |
| `gsap-plugins` | NOT APPLICABLE | No GSAP plugin required. |
| `gsap-react` | NOT APPLICABLE | No React animation requested. |
| `gsap-scrolltrigger` | NOT APPLICABLE | No scroll-linked animation. |
| `gsap-timeline` | NOT APPLICABLE | No animation sequence. |
| `gsap-utils` | NOT APPLICABLE | No GSAP utility usage. |
| `lottie` | NOT APPLICABLE | No HyperFrames/Lottie asset is used. |
| `remotion-to-hyperframes` | NOT APPLICABLE | No Remotion-to-HyperFrames conversion. |

**Skill/design-system conflicts:** creative-direction, palette, font, token, and motion suggestions from advisory skills were not adopted where they conflict with `DESIGN.md`, approved tokens/components, or the user’s “no invented design decisions” gate. No unresolved design gap remains in this screen; the responsive threshold reuses the existing 40rem convention.
