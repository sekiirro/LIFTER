# F16 UI gate and handoff (T033 + T036)

Branch: `016-catalog-ui`, baseline `d81b36d70c35ab95d8acca9700b1d4981424ffb0`.

## T033 browser fixtures

`tests/e2e/catalog-ui.spec.ts` drives the existing showcase surfaces with synthetic data. `LIFTER_SHOWCASE=1` is the only feature flag; fixture routes do not call the catalog server wall or a database. The fixture-only Playwright server mode uses `tests/e2e/start-server-capture.mjs` so local branding credential setup does not require a Supabase stack selection.

The browser matrix covers Arabic RTL and English LTR, light and dark, 390×844 and 1440×900, with default tokens and the existing sample blue workspace brand (`#2563EB`). Each cell covers catalog list/search, PO exercise governance, trainer workspace editing, food editor, exact duplicate selection, near duplicate confirmation, and video variation. There are 16 matrix cells and 112 component screenshots. Keyboard coverage includes Enter search, Enter exact-match selection, Space confirmation, visible focus, and the 44px search target. Axe scans run on each rendered surface; brand checks verify the sample changes brand tokens while leaving success, warning, and error tokens unchanged.

| Surface | Fixture route / state | Evidence |
|---|---|---|
| List and search | `/showcase/catalog?kind=food&view=list` | Search by keyboard, no-results heading, accessible name, `dir`/`lang`, axe |
| Exercise edit, PO | `/showcase/catalog?view=editor&role=po&scope=global` | No governance, Remove, Restore, or Merge controls; axe |
| Exercise edit, trainer | `/showcase/catalog?view=editor&role=trainer&scope=workspace&coachingWork=true` | Workspace save available; global governance absent; axe |
| Exercise Detail | `/exercise-library/{exerciseId}` with explicit global or workspace scope | Render saved Description and Notes from the authorized effective detail values for Global, workspace-shared, and workspace-private exercises. Use the existing `catalog.editorDescription` / `catalog.editorNotes` labels byte-exact and the current `catalog.editorNone` empty convention. Preserve existing read authorization and workspace resolution. Remove is offered on Exercise Detail after confirmation to authorized roles; no Restore or Merge control. See T044, T096, `tests/unit/exercise-detail-page.test.tsx`, and `tests/e2e/exercise-library-production.spec.ts`. |
| Food add/edit component | `/showcase/catalog-foods` | Bilingual identity fields, keyboard alternative add; axe |
| Exact duplicate | `/showcase/catalog-foods?state=exact` | Existing item selection by keyboard; status announcement; axe |
| Near duplicate confirmation | `/showcase/catalog-foods?state=near` | Disabled until checkbox confirmation, keyboard Space, axe |
| Video variation | `/showcase/catalog-foods?state=video` | Selected workspace and fixture URL; axe |

Mutation checks used temporary assertion edits. Each mutant failed on the named assertion and was restored:

| Mutation | Expected failure observed |
|---|---|
| Add an unexpected governance or lifecycle control to the PO Exercise Edit surface | `tests/e2e/catalog-ui.spec.ts` assertions around lines 205–214 fail when governance, Remove, Restore, or Merge controls appear |
| Replace search accessible name with a missing name | Searchbox locator was not found; accessible-name assertion failed |
| Change list direction expectation from locale direction to LTR | Arabic fixture received `rtl`; direction assertion failed |

All screenshot files are in `%TEMP%\lifter-s26-f16-ui-3\` using `{locale}-{theme}-{viewport}-{brand}-{flow}.png`. The `flow` values are `list-search`, `exercise-edit-po`, `exercise-edit-trainer`, `food-add-edit`, `duplicate-exact`, `duplicate-near-confirmation`, and `variation`. The matrix was visually reviewed against `DESIGN.md` §12. No clipping, horizontal overflow, theme mismatch, or RTL/LTR direction defect was found in the rendered catalog components. The preview controls are excluded from captures; screenshots target the actual catalog component.

### Surface gaps (T033 snapshot; not the current route inventory)

- At the T033 review, this worktree had no catalog detail route or detail component. T038 later added the production exercise detail route under `app/(app)/exercise-library/[exerciseId]/`. Consult `tasks.md` for current implementation status. The T033 test covered the list and the then-existing editor/review/variation surfaces; it did not cover a detail screen.
- Food add and edit reuse `FoodEditor`; the showcase presents the editor fixture and does not provide a separate production edit route.
- The food showcase does not wire a save callback. Browser coverage therefore verifies editing and validation affordances without claiming persistence. Production mutation wiring is tested through the server actions and unit fixtures.
- Food drafts with alternatives remain blocked at save until atomic alternatives persistence lands in PR #34. This known DB-lane dependency is unchanged.

## F17/F18 implementation handoff

The UI must use the server wall in `lib/catalog/server.ts` through server components or server actions. UI components do not query Supabase or issue RPCs directly.

| Wall API | Current UI consumer / contract |
|---|---|
| `search` | Catalog list and workspace variation loading; workspace reads pass an explicit `workspaceId` |
| `authoringWorkspaces` | Variation authoring options; PO can select any workspace, staff are limited to authorized workspaces |
| `foodDuplicateCandidates` | `app/(dashboard)/catalog-foods/actions.ts` duplicate review |
| `createFood`, `versionFood` | Food save action; creator/PO authorization and operation keys remain server enforced |
| `writeVariation`, `transitionVariation` | `app/(dashboard)/catalog-variations/actions.ts`; selected workspace is bound on every write |

The 186 F16 rows included in the approved S26 batch remain byte-exact and approved. Only keys added after that batch are DRAFT; keep copy in these message catalogs and do not bake UI copy into F17/F18 fixtures or route files. Numeral presentation stays centralized in `lib/i18n/format.ts`, with Arabic and Latin numeral systems selected by locale.

## T036 Frontend Design Gate

| Checklist item | Result and evidence |
|---|---|
| Tokens only; workspace brand does not alter status colors | PASS — existing component CSS uses design tokens. The sample-brand browser fixture passes `#2563EB` through `BrandScope`; computed `--brand-fill` changes while success/warning/error foreground tokens match root values. No visual CSS token or shared component changed. |
| Typography and mixed direction | PASS — root layout uses Geist and IBM Plex Sans Arabic; tested catalog components carry the locale `lang` and expected `dir`; mixed-direction content uses existing `Bidi`; numerals remain centralized. |
| Spacing, alignment, layout, components | PASS — existing `components/ui` and catalog CSS modules remain in use; rendered components reflow at both required widths. |
| Contrast in light/dark and sample workspace brand | PASS — axe has no violations in all 112 default/sample-brand surface captures across both themes. Sample-brand tokens are derived by `BrandScope`. |
| Accessibility | PASS — axe scans each surface, PO governance visibility is checked by role, search and confirmation are keyboard operable, search focus is visibly outlined, the search button is at least 44px high, and global reduced-motion rules remain active. |
| Loading, empty, error, success, disabled, pending, interaction states | PASS — existing list/editor unit fixtures cover the states; browser fixtures cover no-results, confirmation disabled/enabled, status announcement, and active keyboard paths. |
| Bilingual copy and security copy | PASS — UI labels come from the AR/EN message catalogs; no security copy was changed. The 186 approved S26 rows are locked by `tests/unit/catalog-approved-copy.test.ts`; only post-batch keys are DRAFT, as listed in [S27-library-evidence.md](S27-library-evidence.md). |
| Rendered screenshot matrix and review | PASS — 16 locale/theme/viewport/brand cells, 112 component screenshots under `%TEMP%\lifter-s26-f16-ui-3\`; visually reviewed at 390×844 and 1440×900 in Arabic/English and both themes. |
| Tests, dependencies, size | PASS with known environment exception — no dependency added; UI Playwright, lint, typecheck, build, edge build, size, formatting, diff, and secret scan passed. Vitest has the three pre-existing F13 Stack C profile failures listed below. |

## Advisory skill assessment

The full 55-entry `C:\Users\NEW LAP\.lifter\design-skills-catalog.md` was read. The approved design system and PO decisions remain authoritative. Conflicts are advisory only and did not change tokens, fonts, copy, motion, or component direction.

| Skill | Status | Applicability / reason |
|---|---|---|
| `apple-design` | NOT APPLICABLE | No Apple platform surface or visual direction change; catalog marks conflict with PO decision. |
| `ui-ux-pro-max` | APPLIES | Lookup only; searched local UX guidance for keyboard, focus, RTL, and contrast. No design-system generation or persisted output. |
| `impeccable` | APPLIES | Loaded context for the existing catalog surface; no new design decisions or shared UI edits. |
| `frontend-design` | APPLIES | Used to review implemented surfaces; its request for a new bold direction conflicts with the fixed PO-approved design and was not followed. |
| `baseline-ui` | APPLIES | Reviewed hierarchy and spacing while preserving the CSS Modules and token system; Tailwind/new animation suggestions do not apply to this repository. |
| `design-dna` | NOT APPLICABLE | No design-system extraction or token changes requested. |
| `genjutsu` | NOT APPLICABLE | No creative coding, visual effects, or new interface direction requested. |
| `emil-design-eng` | APPLIES | Reviewed polish and interaction states; no motion or visual direction was added. Skill catalog marks a PO conflict, so existing system wins. |
| `animate` | NOT APPLICABLE | No new animation requested or specified. |
| `animate-expo` | NOT APPLICABLE | Native Expo skill; this is a Next.js web app. |
| `review-animations` | NOT APPLICABLE | No changed motion code; reduced-motion behavior was checked in the existing global CSS. |
| `improve-animations` | NOT APPLICABLE | No animation optimization task. |
| `find-animation-opportunities` | NOT APPLICABLE | No motion design requested; no animation was added. |
| `animation-vocabulary` | NOT APPLICABLE | No new animation concept to name. |
| `animation-performance` | NOT APPLICABLE | No animation implementation or performance work. |
| `prototype` | NOT APPLICABLE | No visual alternatives or picker requested; design decisions are closed. |
| `mobile-native` | NOT APPLICABLE | Responsive web behavior is covered by layout/a11y skills; no PWA/native-browser changes. |
| `pick-ui-library` | NOT APPLICABLE | No library selection; no dependency added. |
| `ask-sonner` | NOT APPLICABLE | No Sonner usage or toast change. |
| `write-swift` | NOT APPLICABLE | Swift-only skill; repository is Next.js. |
| `break-ui` | NOT APPLICABLE | The task defines a specific AR/EN accessibility fixture matrix, not a worst-case-data campaign or demo toggle. |
| `better-ui` | APPLIES | Reviewed component polish and interaction states; existing tokens/components win over conflicting skill suggestions. |
| `better-typography` | APPLIES | Reviewed Arabic/English font setup, hierarchy, wrapping, and mixed-direction content; approved Geist/Plex system wins. |
| `better-colors` | APPLIES | Reviewed token-based light/dark and sample-brand contrast; approved palette and BrandScope rules win. |
| `better-accessibility` | APPLIES | Applied keyboard, accessible name/role, focus, touch-size, and axe checks. |
| `better-layout` | APPLIES | Reviewed RTL/LTR and mobile/desktop reflow using current layout rules; no breakpoint decision changed. |
| `better-interface` | APPLIES | Consolidated design review across all requested catalog surfaces. |
| `better-writing` | APPLIES | Reviewed existing bilingual copy source and DRAFT status; did not rewrite PO-owned copy. |
| `interface-review` | APPLIES | Reviewed the changed fixture/test surface and downstream screenshot scope. |
| `visual-style-presets` | NOT APPLICABLE | No style preset selection or visual-world change. |
| `glass-dark-ui` | NOT APPLICABLE | Catalog forms are solid surfaces; no glass treatment requested or approved here. |
| `progressive-blur` | NOT APPLICABLE | No blur effect requested or approved. |
| `motion-design` | NOT APPLICABLE | No motion design requested. |
| `css-animation` | NOT APPLICABLE | No CSS animation authored. |
| `remotion-motion-graphics` | NOT APPLICABLE | Video motion-graphics workflow is unrelated to the web catalog UI. |
| `gsap-core` | NOT APPLICABLE | No GSAP animation requested. |
| `threejs-fundamentals` | NOT APPLICABLE | No 3D/WebGL scene. |
| `threejs-animation` | NOT APPLICABLE | No 3D animation. |
| `threejs-geometry` | NOT APPLICABLE | No 3D geometry. |
| `threejs-interaction` | NOT APPLICABLE | No 3D interaction. |
| `threejs-lighting` | NOT APPLICABLE | No 3D lighting. |
| `threejs-loaders` | NOT APPLICABLE | No 3D asset loading. |
| `threejs-materials` | NOT APPLICABLE | No 3D materials. |
| `threejs-postprocessing` | NOT APPLICABLE | No 3D postprocessing. |
| `threejs-shaders` | NOT APPLICABLE | No custom WebGL shaders. |
| `threejs-textures` | NOT APPLICABLE | No 3D textures. |
| `gsap-frameworks` | NOT APPLICABLE | No GSAP or non-React framework animation. |
| `gsap-performance` | NOT APPLICABLE | No GSAP performance work. |
| `gsap-plugins` | NOT APPLICABLE | No GSAP plugin use. |
| `gsap-react` | NOT APPLICABLE | No GSAP React animation. |
| `gsap-scrolltrigger` | NOT APPLICABLE | No scroll-linked animation. |
| `gsap-timeline` | NOT APPLICABLE | No GSAP timeline. |
| `gsap-utils` | NOT APPLICABLE | No GSAP utility use. |
| `lottie` | NOT APPLICABLE | No Lottie or HyperFrames work. |
| `remotion-to-hyperframes` | NOT APPLICABLE | No Remotion-to-HyperFrames port. |

## Final gate results

| Gate | Result |
|---|---|
| `npm test` | 138 test files passed; 1 file has 3 known failures in `tests/unit/f13-stack-readiness.test.ts` because `supabase-stack-c/supabase/config.toml` is absent in this fresh worktree. No stack profile was created. 1,982 tests passed, 3 failed. |
| New Playwright suite | PASS — 16/16 matrix tests on port 4173; 112 screenshots; zero axe violations. Fixture-only mode avoids the stack-dependent branding credential helper; no DB calls. |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run build:edge` | PASS — OpenNext warns that Windows is not its recommended build environment. |
| `npm run size` | PASS — web worker 8,177.82 KiB uncompressed (12.48% of 65,536 KiB budget); cron worker 11.76 KiB. |
| `npm exec prettier -- --check .` | PASS |
| `git diff --check` | PASS |
| `npm run check:secrets` | PASS |
