# F14 Hero Banner design gate — DECIDED — PO s15 Q1 C (2:1, 8–18rem, max 288px)

**Status:** Prototype complete; PO Session 15 selected candidate C. The prototype route remains available only when `LIFTER_SHOWCASE=1`; with the flag set to `0`, it returned HTTP 404.

**PO decision (Session 15, verbatim):**

> * Q1 C: F14 banner 2:1, max-height 288px.

This selects the existing C candidate's 2:1 aspect ratio and 18rem/288px cap. The production registration component uses this decision; the candidate research and screenshot measurements below are retained as evidence.

**Model / effort for this implementation session:** Runtime metadata is unavailable; no model or effort tier is claimed.

**Authority used:** `DESIGN.md` §§3, 10–12; F14 DG-F14-1..3; the feature spec and the supplied design gate. The preview is a Registration Premium Centered Card with image-only hero, logo placeholder, then a vertically separate form. No banner copy or text overlay is rendered. Its responsive measurements are candidate values for PO comparison, not product decisions.

**Prototype route:** `/showcase/f14-banner`. A/B/C, theme, language, sample workspace brand, and missing-image fallback controls are available on the route. The sample registration form validates and reports a local-only success; it sends no data.

## Candidate geometry and measured heights

Candidate CSS min/max values are deliberately confined to this prototype. The other colors, spacing, radii, typography, focus, surfaces, and controls use existing tokens/components. Width is the rendered inner banner width.

| Candidate | Prototype settings | 390×844 mobile | 768×1024 tablet | 1440×900 desktop | Tradeoff |
| --- | --- | ---: | ---: | ---: | --- |
| A — wide | 3:1; min 6rem / 96px, max 22rem / 352px | 324×108px | 702×234px | 1046×348.66px | Most compact. Tall subjects and vertically stacked identity marks have the greatest crop risk. |
| B — 16:9 | 16:9; min 9rem / 144px, max 38rem / 608px | 324×182.25px | 702×394.88px | 1046×588.38px | Familiar source shape and least crop for 16:9 uploads; the desktop banner takes the most vertical space. |
| C — capped | 2:1; min 8rem / 128px, max 18rem / 288px | 324×162px | 702×288px | 1046×288px | Mid-sized on mobile and held to 288px at tablet/desktop; the cap increases crop on tall source images. |

Every candidate uses `object-fit: cover` and centered focal position. Heights were read from the rendered image box in Chromium at the listed viewport sizes. The same dimensions held in AR/EN and light/dark. The full measurement record, including every screenshot's bytes, is in [`render-metrics.json`](../../../tests/integration/evidence/f14-banner/render-metrics.json).

### Crop and upload guidance

- **A — 3:1:** Lowest vertical footprint, but it removes substantial top/bottom content from standard 16:9 sources. Faces, vertically composed subjects, and tall logos need generous center-safe space. Logos near the horizontal edges remain at risk when a taller source is forced into the wide frame.
- **B — 16:9:** A matching source needs no crop. Center cropping a panoramic or portrait source can still remove edge logos or faces; keep the identity subject within the central safe area.
- **C — 2:1 with 18rem cap:** The 2:1 frame crops less from a 16:9 source before the cap applies. At the 288px tablet/desktop cap, the displayed frame is approximately 3.63:1 at desktop width; top/bottom content is then at high risk, including faces and tall marks.
- **Candidate upload source:** approximately 2100px wide (2× the measured 1046px desktop content width), in an accepted PNG or WebP, with the essential identity centered. Ratio-matched examples: A 2100×700px; B 2100×1181px; C 2100×1050px. C needs extra center-safe margin because its desktop cap changes the visible crop. These are prototype viewing recommendations, not final upload limits or server validation rules.

### Layout and stability

- The image is in normal document flow; the form follows the image and identity block. A Playwright geometry assertion verified `form.top >= banner.bottom` across all 38 screenshots. No overlap occurred.
- `aspect-ratio` reserves the image box before decode. Cumulative Layout Shift measured **0.0000** in all screenshot cases. No layout animation or new dependency was added.
- No horizontal overflow and no serious/critical axe findings at 320px and 720px CSS width. The 720px check is a narrow-layout check, not a browser-zoom simulation.
- Missing-image preview uses only `--color-card-raised`; it contains no visible text and exposes a localized accessible name. The sample PNG is a locally generated neutral grayscale gradient (1600×600px, 4,982 bytes), with no external or YBS assets.

## Rendered evidence and accessibility

Playwright rendered **36** matrix cases (A/B/C × AR/EN × light/dark × mobile/tablet/desktop), plus one B desktop workspace-brand override and one C mobile missing-image fallback: **38 screenshots** total. Axe reported **0 serious, 0 critical, and 0 moderate violations** across those cases. The route was checked both with the showcase flag disabled (404) and enabled (200). The local-only form success state and fallback text absence were also asserted.

All screenshots are exact viewport captures; the Next.js development badge was hidden only in screenshot capture. The evidence files are committed under `tests/integration/evidence/f14-banner/`.

| Screenshot | Viewport | Locale / theme | Size |
| --- | --- | --- | ---: |
| variant-a--ar--light--mobile-390x844.png | 390x844 | AR / light | 29246 B |
| variant-a--ar--light--tablet-768x1024.png | 768x1024 | AR / light | 37608 B |
| variant-a--ar--light--desktop-1440x900.png | 1440x900 | AR / light | 33905 B |
| variant-a--ar--dark--mobile-390x844.png | 390x844 | AR / dark | 28479 B |
| variant-a--ar--dark--tablet-768x1024.png | 768x1024 | AR / dark | 37003 B |
| variant-a--ar--dark--desktop-1440x900.png | 1440x900 | AR / dark | 33196 B |
| variant-a--en--light--mobile-390x844.png | 390x844 | EN / light | 48363 B |
| variant-a--en--light--tablet-768x1024.png | 768x1024 | EN / light | 59331 B |
| variant-a--en--light--desktop-1440x900.png | 1440x900 | EN / light | 51817 B |
| variant-a--en--dark--mobile-390x844.png | 390x844 | EN / dark | 48091 B |
| variant-a--en--dark--tablet-768x1024.png | 768x1024 | EN / dark | 58790 B |
| variant-a--en--dark--desktop-1440x900.png | 1440x900 | EN / dark | 51256 B |
| variant-b--ar--light--mobile-390x844.png | 390x844 | AR / light | 28267 B |
| variant-b--ar--light--tablet-768x1024.png | 768x1024 | AR / light | 35642 B |
| variant-b--ar--light--desktop-1440x900.png | 1440x900 | AR / light | 33058 B |
| variant-b--ar--dark--mobile-390x844.png | 390x844 | AR / dark | 27476 B |
| variant-b--ar--dark--tablet-768x1024.png | 768x1024 | AR / dark | 34941 B |
| variant-b--ar--dark--desktop-1440x900.png | 1440x900 | AR / dark | 32290 B |
| variant-b--en--light--mobile-390x844.png | 390x844 | EN / light | 48497 B |
| variant-b--en--light--tablet-768x1024.png | 768x1024 | EN / light | 53763 B |
| variant-b--en--light--desktop-1440x900.png | 1440x900 | EN / light | 50933 B |
| variant-b--en--dark--mobile-390x844.png | 390x844 | EN / dark | 48272 B |
| variant-b--en--dark--tablet-768x1024.png | 768x1024 | EN / dark | 53192 B |
| variant-b--en--dark--desktop-1440x900.png | 1440x900 | EN / dark | 50431 B |
| variant-c--ar--light--mobile-390x844.png | 390x844 | AR / light | 28479 B |
| variant-c--ar--light--tablet-768x1024.png | 768x1024 | AR / light | 36442 B |
| variant-c--ar--light--desktop-1440x900.png | 1440x900 | AR / light | 36339 B |
| variant-c--ar--dark--mobile-390x844.png | 390x844 | AR / dark | 27589 B |
| variant-c--ar--dark--tablet-768x1024.png | 768x1024 | AR / dark | 35680 B |
| variant-c--ar--dark--desktop-1440x900.png | 1440x900 | AR / dark | 35351 B |
| variant-c--en--light--mobile-390x844.png | 390x844 | EN / light | 48160 B |
| variant-c--en--light--tablet-768x1024.png | 768x1024 | EN / light | 58290 B |
| variant-c--en--light--desktop-1440x900.png | 1440x900 | EN / light | 55373 B |
| variant-c--en--dark--mobile-390x844.png | 390x844 | EN / dark | 47958 B |
| variant-c--en--dark--tablet-768x1024.png | 768x1024 | EN / dark | 57928 B |
| variant-c--en--dark--desktop-1440x900.png | 1440x900 | EN / dark | 54849 B |
| workspace-brand-override--en--light--desktop-1440x900.png | 1440x900 | EN / light | 52901 B |
| variant-c--ar--light--mobile-390x844--missing-image.png | 390x844 | AR / light | 28630 B |

## Design gate self-review

| Check | Result | Evidence |
| --- | --- | --- |
| Approved design authority | PASS | Registration Premium Centered Card retained; PO s15 Q1 C is applied. No edit to `DESIGN.md`, tokens, or shared components. |
| Token use and workspace brand scope | PASS | Existing tokens/components used for all visual styling; `BrandScope` sample is `#2563EB`. Render checks confirmed success/warning/error semantic foreground tokens were unchanged. |
| Typography and direction | PASS | Existing Geist / IBM Plex Sans Arabic and token scale; localized UI messages; ratio/bounds use `Bidi` LTR isolation. HTML language/direction asserted for all matrix cases. |
| Spacing, alignment, responsive behavior | PASS | CSS modules follow showcase/card idioms and logical properties; wrap-based controls, tested at requested viewports plus 320px and 720px width. |
| Contrast and focus | PASS | Existing theme/brand/focus tokens and components; axe found no violations in tested light/dark and brand cases. Candidate selector and preference controls are keyboard-accessible native links/inputs. |
| Accessibility names and states | PASS | Bilingual localized image alt fallback, no text on imagery, labeled form controls, polite local status, visible focus token, reduced-motion setting used for captures. Normal, missing-image, and local-success states verified. No asynchronous upload exists in this prototype, so loading/pending/server-error states are not applicable. |
| Copy and localization | PASS | New user-facing copy is in `lib/i18n/messages/ar.ts` and `en.ts`; form preview explicitly says no registration data is sent. |
| Axe | PASS | 38 screenshot cases and 2 additional narrow-width checks; 0 serious/critical and 0 moderate findings. |
| Screenshot review against DESIGN.md §12 | PASS | Reviewed AR mobile light, EN mobile light, AR tablet dark, EN desktop dark, workspace-brand desktop, and missing-image mobile. No actionable visual findings. |
| Reduced motion / animation | PASS | No authored motion; capture used reduced-motion preference. |
| Dependencies | PASS | No dependency added. |
| `npm run size` | PASS | OpenNext/Wrangler dry-run: web 7,164.98 KiB uncompressed (1,481.18 KiB gzip); cron 5.58 KiB uncompressed (1.96 KiB gzip), each below the 65,536 KiB limit. |

### Repository gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Lint | PASS | `npm run lint`, zero warnings/errors. |
| Typecheck | PASS | `npm run typecheck`, no diagnostics. |
| Unit | PASS | 77 test files; 1,524 passed, 0 failed, 0 skipped. |
| Prettier | PASS | `prettier --check` on all touched text/JSON files. |
| Edge build | PASS | `npm run build:edge`; environment-file reads were blocked by the local preload guard. |
| `git diff --check` | PASS | `git diff --cached --check` on all staged paths; no whitespace errors. |

## Skill catalog review

The full `design-skills-catalog.md` was read. Skills remain advisory; DESIGN.md and the approved F14 decisions win. Conflict notes: `frontend-design` encourages a new bold visual direction; `prototype` specifies a hard-coded dark picker; `baseline-ui` mandates Tailwind; and `better-ui` includes a raw-color image outline. Those prescriptions conflict with this brief's existing-token/component constraint and were not used. The approved design system uses CSS modules. The UI-UX Pro Max lookup was read-only (responsive image scaling, no persistence); its WebP optimization suggestion does not replace the requested local PNG placeholder or add a dependency.

| Skill | Status | Reason |
| --- | --- | --- |
| `apple-design` | NOT APPLICABLE | No Apple-specific platform behavior or visual direction is in scope. |
| `ui-ux-pro-max` | APPLIES | Lookup only; checked responsive image scaling guidance without persisting generated systems. |
| `impeccable` | APPLIES | Used its context and craft-floor guidance for a scoped showcase extension. |
| `frontend-design` | APPLIES | Applied craft and finish guidance; its new-world styling advice yielded to DESIGN.md. |
| `baseline-ui` | APPLIES | Applied layout/accessibility review; its Tailwind directive conflicts with this CSS-module project. |
| `design-dna` | NOT APPLICABLE | No token or design-system extraction/change is authorized. |
| `genjutsu` | NOT APPLICABLE | No creative-coding effects or whole-site direction are requested. |
| `emil-design-eng` | APPLIES | Applied restraint, static comparison, and detail review; no animation was needed. |
| `animate` | NOT APPLICABLE | The approved UI has no motion requirement. |
| `animate-expo` | NOT APPLICABLE | This is a Next.js web surface, not Expo. |
| `review-animations` | NOT APPLICABLE | No animation was introduced. |
| `improve-animations` | NOT APPLICABLE | There is no motion system to survey. |
| `find-animation-opportunities` | NOT APPLICABLE | No animation opportunity is needed for a static sizing comparison. |
| `animation-vocabulary` | NOT APPLICABLE | No motion pattern is specified or implemented. |
| `animation-performance` | NOT APPLICABLE | No animation performance work is in scope. |
| `prototype` | APPLIES | Built three selectable aspect/height candidates; the prescribed generic picker styling conflicts with token-only project styling. |
| `mobile-native` | NOT APPLICABLE | No PWA or native-like browser behavior is requested. |
| `pick-ui-library` | NOT APPLICABLE | Existing components suffice and no new dependency is allowed. |
| `ask-sonner` | NOT APPLICABLE | No notification library or toast is needed. |
| `write-swift` | NOT APPLICABLE | This is not a Swift project. |
| `break-ui` | NOT APPLICABLE | The prototype has fixed sample content, not a variable data surface. |
| `better-ui` | APPLIES | Applied project-consistent component and state review; rejected the raw-color outline conflict. |
| `better-typography` | APPLIES | Kept approved typefaces/scale and checked Arabic/English wrapping. |
| `better-colors` | APPLIES | Reused semantic tokens and checked light/dark plus workspace override. |
| `better-accessibility` | APPLIES | Used native semantics, labels, alt text, focus styles, live status, and axe. |
| `better-layout` | APPLIES | Used logical layout, responsive wrapping, and viewport stress checks. |
| `better-interface` | APPLIES | Reviewed the prototype as a complete localized, themed flow and recorded the gate checklist above. |
| `better-writing` | APPLIES | Added concise bilingual controls, preview notice, and accessible copy. |
| `interface-review` | APPLIES | Reviewed this change's rendered surface and the affected shared component usage. |
| `visual-style-presets` | NOT APPLICABLE | No new visual world or styling direction should be selected. |
| `glass-dark-ui` | NOT APPLICABLE | Glass styling is not approved or required. |
| `progressive-blur` | NOT APPLICABLE | No blur effect is required or approved. |
| `motion-design` | NOT APPLICABLE | No motion is requested. |
| `css-animation` | NOT APPLICABLE | No animation is requested. |
| `remotion-motion-graphics` | NOT APPLICABLE | This is not a video task. |
| `gsap-core` | NOT APPLICABLE | GSAP is not used and no motion is needed. |
| `threejs-fundamentals` | NOT APPLICABLE | No 3D scene is involved. |
| `threejs-animation` | NOT APPLICABLE | No 3D animation is involved. |
| `threejs-geometry` | NOT APPLICABLE | No Three.js geometry is needed. |
| `threejs-interaction` | NOT APPLICABLE | No Three.js interaction is needed. |
| `threejs-lighting` | NOT APPLICABLE | No 3D lighting is involved. |
| `threejs-loaders` | NOT APPLICABLE | No 3D asset loader is involved. |
| `threejs-materials` | NOT APPLICABLE | No Three.js materials are involved. |
| `threejs-postprocessing` | NOT APPLICABLE | No 3D post-processing is involved. |
| `threejs-shaders` | NOT APPLICABLE | No shaders are involved. |
| `threejs-textures` | NOT APPLICABLE | No 3D texture pipeline is involved. |
| `gsap-frameworks` | NOT APPLICABLE | No GSAP animation or non-React framework is involved. |
| `gsap-performance` | NOT APPLICABLE | No GSAP performance work is involved. |
| `gsap-plugins` | NOT APPLICABLE | No GSAP plugin is used or needed. |
| `gsap-react` | NOT APPLICABLE | No React animation is requested. |
| `gsap-scrolltrigger` | NOT APPLICABLE | No scroll-linked animation is requested. |
| `gsap-timeline` | NOT APPLICABLE | No animation timeline is requested. |
| `gsap-utils` | NOT APPLICABLE | No GSAP utilities are needed. |
| `lottie` | NOT APPLICABLE | No motion asset is requested. |
| `remotion-to-hyperframes` | NOT APPLICABLE | No video conversion is involved. |

## Superseded PO question

Session 15 resolved this question with Q1 C, quoted verbatim at the top of this report. The original options and recommendation below are retained as historical prototype context; the recommendation is not the selected value.

**Which responsive Hero Banner geometry should F14 carry forward for the Registration Premium Centered Card?**

- **A.** 3:1 wide, 6–22rem bounds — most compact; highest vertical crop risk.
- **B.** 16:9, 9–38rem bounds — closest to common source imagery; tallest desktop result.
- **C.** 2:1, 8–18rem bounds — capped at 18rem; more crop at tablet and desktop.
- **Other.** Specify the aspect ratio and responsive min/max/cap values.

**Historical prototype recommendation (superseded by the decision above):** B, 16:9, because it matches common source imagery and preserves the least crop when the upload is 16:9. Its 588.38px desktop height is the cost; choose C if limiting desktop vertical space outweighs the increased crop risk. This recommendation was not selected.
