# F18 T011 — Coach manual nutrition alternatives UI

## Follow-up: Arabic unit labels

- RED: `tests/unit/NutritionPlanAlternativesEditor.test.tsx` failed because `nutritionAlternatives.milliliters` was missing and the rendered Arabic unit remained Latin `ml`.
- GREEN: added DRAFT Arabic/English keys for milliliters and mapped canonical `g`/`ml` display labels through locale messages. Focused unit test passed.
- Mutation: restoring raw `g`/`ml` display made the focused test fail at the Arabic milliliter label assertion (`expected ... to contain 'مل'`). Restored localization; focused test passed.
- Additional DRAFT copy key: `nutritionAlternatives.milliliters` (AR `مل`, EN `ml`).

**Result:** Complete on branch `018-nutrition-planner`. The F16 service is not merged; all catalog data and projections in this UI and showcase are mocked.

## Inherited partial

- Kept the Arabic and English `nutritionAlternatives.*` messages, the new editor, its unit tests, and the F18 showcase from the prior partial.
- Corrected the partial by adding locale-aware Arabic-Indic display digits and canonicalizing Arabic-Indic/Persian digits and the Arabic decimal separator on input; resolving chained catalog aliases to a terminal current food version; and suppressing macro output when a target is removed.
- Expanded the fixtures to cover a two-hop alias and a removed target. The showcase shows both, and its three alternatives put the add action in the maxed-out disabled state.
- No SQL, migration, dependency, token, or shared component changes.

## RED, GREEN, and mutation evidence

The focused suite began with **2 failing, 11 passing**: Arabic text contained Latin digits and the editor did not render an alias/unavailable projection. After implementation it passed **13/13**. The full Vitest run passed **1,768/1,768 tests across 109 files**.

Focused test list:

1. Renders one unified original-first list.
2. Calculates each alternative from its own food snapshot and portion.
3. Requires a validated positive portion before showing macros.
4. Never adjusts quantities automatically or offers AI/auto-adjust controls.
5. Shows no delta-versus-original comparison.
6. Caps alternatives at three and explains the disabled add action.
7. Reorders and removes alternatives without changing retained IDs/quantities.
8. Updates a quantity in place and changes IDs on food replacement.
9. Renders Arabic RTL and English LTR copy with isolated numbers.
10. Renders Arabic UI digits using Arabic-Indic numerals.
11. Resolves chained frozen references and renders removed targets unavailable.
12. Provides keyboard move/remove actions with boundary controls disabled.
13. Formats macro display integers without changing exact macro calculation.

| Temporary mutant | Assertion that failed | Result after restoration |
| --- | --- | --- |
| Disabled the max-three guard | `caps the list at three alternatives…` — expected `max_alternatives_exceeded`, received no error | Guard restored; full suite passed |
| Added `data-ai-auto-adjust` to the editor | `never adjusts quantities automatically…` — found the auto-adjust hook | Removed; full suite passed |
| Added a delta label and `data-delta` marker | `shows no delta-versus-original comparison` — found `data-delta` | Removed; full suite passed |

## Screenshots and rendered review

Saved under `%TEMP%\lifter-s26-f18-t011` (`C:\Users\NEW LAP\AppData\Local\Temp\lifter-s26-f18-t011`). The 12 full-page captures cover AR/EN × dark/light × 390/768/1440 px. Each shows three alternatives, the disabled max-three action, and the unavailable state. The alias target resolves to its terminal food and current macros.

| Locale | Theme | 390 px | 768 px | 1440 px |
| --- | --- | --- | --- | --- |
| AR-RTL | dark | `f18-t011-ar-dark-390.png` | `f18-t011-ar-dark-768.png` | `f18-t011-ar-dark-1440.png` |
| AR-RTL | light | `f18-t011-ar-light-390.png` | `f18-t011-ar-light-768.png` | `f18-t011-ar-light-1440.png` |
| EN-LTR | dark | `f18-t011-en-dark-390.png` | `f18-t011-en-dark-768.png` | `f18-t011-en-dark-1440.png` |
| EN-LTR | light | `f18-t011-en-light-390.png` | `f18-t011-en-light-768.png` | `f18-t011-en-light-1440.png` |

Rendered review found no horizontal overflow at any size. Arabic editor text contains no Latin digits. Axe reported **0 violations in all 12 renders**. The browser interaction check entered `٢٠٠٫٥`, retained localized digits in the field, and recalculated the rice calories to `٢٦١`. Keyboard focus remained visible.

## Design review

| Before | After | Why |
| --- | --- | --- |
| Arabic quantities and macro figures rendered Latin digits | Arabic-Indic digits via `Intl.NumberFormat('ar', { numberingSystem: 'arab' })`; typed digits normalize to canonical values | Keeps the Arabic UI localized without changing persisted quantity format |
| Frozen source references were looked up as if they were current catalog versions | Mocked source-to-alias projection follows to the terminal current version; removed targets stay visible as unavailable | Applies S26-R1 without silently substituting food |
| Max-three state and original-first unified list already existed in the inherited component | Preserved and verified them; no AI adjustment or delta comparison is rendered | Retains the T011 contract and the existing component language |

### Mandatory design checklist

- **Tokens and brand:** PASS — component styles use existing CSS variables and shared UI controls; no raw color, spacing, radius, or font values were added. The current default brand color `#059669` is covered by the existing derived-brand contrast tests. Semantic warning/error tokens remain independent of brand values.
- **Typography and bidi:** PASS — existing Geist/IBM Plex Sans Arabic stack; tabular macro numerals; numbers are isolated with `Bidi`; food names use `Bidi`; 12 captures checked in AR and EN.
- **Spacing and component consistency:** PASS — uses existing `Card`, `Button`, `Field`, `Alert`, and `ConfirmDialog`; responsive grid uses token spacing and the established touch minimum.
- **Contrast and themes:** PASS — axe returned zero violations in light/dark; semantic unavailable warning stays on warning tokens. No palette or token modifications.
- **Accessibility:** PASS — labelled fields and actions, keyboard move/remove controls, focus visible, error and warning semantics, `aria-invalid`, max-limit explanation; axe clean in 12 renders.
- **States:** PASS — empty, invalid quantity, unavailable, maxed/disabled, pending removal, and normal macro states are represented. Loading and save-success states are not applicable: this editor performs no asynchronous save.
- **Bilingual copy:** PASS — all editor/showcase copy is in `lib/i18n/messages`; no Latin numerals are hard-coded in Arabic messages.
- **Responsive matrix:** PASS — screenshots saved and reviewed at 390, 768, and 1440 px across both locales and themes; no overflow. No findings required a re-shot.
- **Tests and size:** PASS — full Vitest, axe review, and size gate passed; no dependency added.

No unresolved §11 design decision was required for this editor. `frontend-design` encourages bespoke fonts and visual effects in its general guidance; those conflict with the approved Geist/IBM Plex Arabic typography and token-based restrained component language, so `DESIGN.md` and the existing components/tokens won. The catalog also marks several `better-*` skills as PO-conflicted; none introduced a palette, font, component, or effect change.

## Design skill catalog review

The full `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was read. `APPLIES` items informed the implementation or rendered review; suggestions that conflict with the approved Design System were not used. All other catalog skills are explicitly marked `NOT APPLICABLE`.

| Skill | Status and reason |
| --- | --- |
| `animate` | NOT APPLICABLE — no motion requested or needed. |
| `animate-expo` | NOT APPLICABLE — this is a Next.js web UI, not Expo. |
| `animation-performance` | NOT APPLICABLE — no animation added. |
| `animation-vocabulary` | NOT APPLICABLE — no motion design decision needed. |
| `apple-design` | NOT APPLICABLE — native Apple interaction patterns are outside this web task. |
| `ask-sonner` | NOT APPLICABLE — no toast system change; existing inline feedback is used. |
| `baseline-ui` | APPLIES — checked component primitives, touch sizing, tabular numbers, wrapping, and existing tokens. |
| `better-accessibility` | APPLIES — keyboard actions, labels, validation feedback, focus, direction, and axe review. |
| `better-colors` | APPLIES — preserved semantic tokens and reviewed light/dark contrast. |
| `better-interface` | APPLIES — consolidated the complete editor state and responsive review. |
| `better-layout` | APPLIES — reviewed RTL/LTR grouping and adaptive grids. |
| `better-typography` | APPLIES — preserved approved fonts and type scale; reviewed bidi and real copy wrapping. |
| `better-ui` | APPLIES — reused existing components, surfaces, and interaction states. |
| `better-writing` | APPLIES — reviewed Arabic and English labels, limit, error, and unavailable copy. |
| `break-ui` | NOT APPLICABLE — no adversarial-data campaign or dev-only worst-case toggle was requested; representative maxed, alias, unavailable, and narrow-width states were still reviewed. |
| `css-animation` | NOT APPLICABLE — no CSS animation authored. |
| `design-dna` | NOT APPLICABLE — no design-system extraction or visual effects requested. |
| `emil-design-eng` | APPLIES — applied restraint and reviewed interaction details; no motion added. |
| `find-animation-opportunities` | NOT APPLICABLE — motion is not needed for this task. |
| `frontend-design` | APPLIES — refined the working editor within the approved product visual system. |
| `genjutsu` | NOT APPLICABLE — no creative coding or visual effects needed. |
| `glass-dark-ui` | NOT APPLICABLE — glass styling conflicts with the approved component language. |
| `gsap-core` | NOT APPLICABLE — no GSAP animation. |
| `gsap-frameworks` | NOT APPLICABLE — no GSAP/non-React integration. |
| `gsap-performance` | NOT APPLICABLE — no GSAP code. |
| `gsap-plugins` | NOT APPLICABLE — no GSAP plugins. |
| `gsap-react` | NOT APPLICABLE — no animation code. |
| `gsap-scrolltrigger` | NOT APPLICABLE — no scroll-linked motion. |
| `gsap-timeline` | NOT APPLICABLE — no animation sequence. |
| `gsap-utils` | NOT APPLICABLE — no GSAP utilities. |
| `impeccable` | APPLIES — loaded project context and craft floor; ran the required detector (no findings). |
| `improve-animations` | NOT APPLICABLE — no animation exists in this surface. |
| `interface-review` | APPLIES — reviewed the changed editor and its showcase consumers. |
| `lottie` | NOT APPLICABLE — no Lottie asset or player. |
| `mobile-native` | NOT APPLICABLE — no PWA/native-browser behavior changes. |
| `motion-design` | NOT APPLICABLE — no motion requested. |
| `pick-ui-library` | NOT APPLICABLE — existing primitives cover all interactions; no library selection. |
| `progressive-blur` | NOT APPLICABLE — no blur effect needed or authorized by the design. |
| `prototype` | NOT APPLICABLE — task is implementation of one specified editor, not visual direction exploration. |
| `remotion-motion-graphics` | NOT APPLICABLE — no video composition. |
| `remotion-to-hyperframes` | NOT APPLICABLE — no Remotion/HyperFrames migration. |
| `review-animations` | NOT APPLICABLE — no animation code to review. |
| `threejs-animation` | NOT APPLICABLE — no 3D animation. |
| `threejs-fundamentals` | NOT APPLICABLE — no Three.js scene. |
| `threejs-geometry` | NOT APPLICABLE — no 3D geometry. |
| `threejs-interaction` | NOT APPLICABLE — no 3D interaction. |
| `threejs-lighting` | NOT APPLICABLE — no 3D lighting. |
| `threejs-loaders` | NOT APPLICABLE — no 3D assets. |
| `threejs-materials` | NOT APPLICABLE — no 3D materials. |
| `threejs-postprocessing` | NOT APPLICABLE — no 3D postprocessing. |
| `threejs-shaders` | NOT APPLICABLE — no shaders. |
| `threejs-textures` | NOT APPLICABLE — no 3D textures. |
| `ui-ux-pro-max` | APPLIES — lookup only; queried form validation and mobile touch guidance; no generated system persisted. |
| `visual-style-presets` | NOT APPLICABLE — existing approved visual direction is binding. |
| `write-swift` | NOT APPLICABLE — no Swift code. |

## Draft strings

| Key | Arabic | English |
| --- | --- | --- |
| `nutritionAlternatives.title` | البدائل اليدوية | Manual alternatives |
| `nutritionAlternatives.intro` | أضف حتى ثلاثة بدائل معتمدة من المدرب. لكل بديل غذاؤه وكمية حصته وماكروزه المحسوبة. | Add up to three coach-approved alternatives. Each alternative uses its own food, portion quantity, and calculated macros. |
| `nutritionAlternatives.original` | الأصلي | Original |
| `nutritionAlternatives.alternative` | بديل | Alternative |
| `nutritionAlternatives.add` | إضافة بديل | Add alternative |
| `nutritionAlternatives.limitHelp` | يمكنك إضافة ثلاثة بدائل كحد أقصى لهذا العنصر. | You can add up to three alternatives for this item. |
| `nutritionAlternatives.addDisabledLimit` | الحد الأقصى ثلاثة بدائل. احذف بديلًا لإضافة بديل آخر. | Three alternatives is the maximum. Remove one to add another. |
| `nutritionAlternatives.food` | الغذاء | Food |
| `nutritionAlternatives.quantity` | كمية الحصة | Portion quantity |
| `nutritionAlternatives.unit` | الوحدة | Unit |
| `nutritionAlternatives.quantityHint` | تُحسب الماكروز من هذه الكمية. | Macros are calculated from this quantity. |
| `nutritionAlternatives.calculatedMacros` | الماكروز المحسوبة | Calculated macros |
| `nutritionAlternatives.calories` | السعرات | Calories |
| `nutritionAlternatives.protein` | البروتين | Protein |
| `nutritionAlternatives.carbs` | الكربوهيدرات | Carbs |
| `nutritionAlternatives.fat` | الدهون | Fat |
| `nutritionAlternatives.kilocalories` | سعرة | kcal |
| `nutritionAlternatives.grams` | غ | g |
| `nutritionAlternatives.moveUp` | نقل لأعلى | Move up |
| `nutritionAlternatives.moveDown` | نقل لأسفل | Move down |
| `nutritionAlternatives.remove` | حذف | Remove |
| `nutritionAlternatives.unifiedListLabel` | البدائل، العنصر الأصلي أولًا | Alternatives, original item first |
| `nutritionAlternatives.manualOnly` | تُدخل الكميات يدويًا، وتُحسب الماكروز من الغذاء والكمية. لا تُعدّل الكميات تلقائيًا، ولا تُنشأ اقتراحات. | Quantities are entered manually, and macros are calculated from the food and portion. Quantities are never changed automatically, and no suggestions are generated. |
| `nutritionAlternatives.invalidQuantity` | أدخل كمية أكبر من صفر بحد أقصى ثلاث خانات عشرية. | Enter a quantity greater than 0 with at most three decimal places. |
| `nutritionAlternatives.unavailableFood` | هذا الغذاء غير موجود في القائمة الحالية، لذلك لا يمكن إعادة حساب ماكروزه هنا. | This food is not in the current list, so its macros cannot be recalculated here. |
| `nutritionAlternatives.macrosUnavailable` | أدخل كمية صحيحة لعرض الماكروز المحسوبة. | Enter a valid quantity to see calculated macros. |
| `nutritionAlternatives.errorTitle` | تعذر تحديث البدائل | Could not update alternatives |
| `nutritionAlternatives.removeTitle` | حذف البديل؟ | Remove alternative? |
| `nutritionAlternatives.removeDescription` | سيُحذف هذا البديل وكميته وماكروزه المحسوبة من المسودة. | This alternative, its portion, and its calculated macros will be removed from the draft. |
| `nutritionAlternatives.removeConfirm` | حذف البديل | Remove alternative |
| `nutritionAlternatives.removeCancel` | إبقاء البديل | Keep alternative |
| `nutritionAlternatives.empty` | لا توجد بدائل يدوية بعد. | No manual alternatives yet. |
| `nutritionAlternatives.actionsLabel` | إجراءات البديل | Alternative actions |
| `nutritionAlternatives.previewTitle` | محرر بدائل التغذية | Nutrition alternatives editor |
| `nutritionAlternatives.previewIntro` | معاينة تطويرية لمحرر البدائل اليدوية الذي يضبطه المدرب، ببيانات أغذية وخطط وهمية. | Developer preview of the coach-configured manual alternatives editor with mocked catalog and plan data. |
| `nutritionAlternatives.previewNotice` | للعرض فقط. الأغذية وقيم الخطة وهمية، ولا يُحفظ أي شيء. | Showcase only. Foods and plan values are mocked; nothing is saved. |

## Gates

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 109 files, 1,768 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run build:edge` | PASS (Windows OpenNext compatibility warning only) |
| `npm run size` | PASS — web worker 8,009.35 KiB / 65,536 KiB; cron 6.05 KiB / 65,536 KiB |
| `npm run format:check` | PASS |
| `git diff --check` | PASS |
| `npm run check:secrets` | PASS |
| Impeccable detector | PASS — empty findings list |

No stack/profile commands, SQL, migrations, or secrets-file reads were used. No dependencies were added.
