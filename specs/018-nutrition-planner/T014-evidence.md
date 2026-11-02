# F18 T014 + T022 — Nutrition plan editor UI

## RED / GREEN

- **Sequence note:** T014/T022 did not capture a pre-implementation RED run. The failing RED evidence below comes from the requested post-commit mutation checks; the implementation was already present when the focused UI tests were added.
- T014 RED: disabling the meal-down operation left the first quantity at `160`; the Playwright keyboard-reorder assertion failed because it expected the displayed first item to change. Replacing locale direction with `ltr` failed the `dir="rtl"` assertion.
- T014 GREEN: the editor unit suite passed **4/4**; the model suite passed **4/4**. Single-day and seven-day structures, day-type assignment, conditional meal visibility, exact quantity editing, reorder/duplicate ID mapping, and `macros.ts` totals are covered.
- T022 RED: changing the live region from `polite` to `off` failed the `aria-live="polite"` assertion. Disabling the move operation failed the browser keyboard-reorder assertion.
- T022 GREEN: all four rendered locale/theme cases passed Playwright, keyboard reorder, responsive overflow checks, and axe. The state matrix unit cases pass for loading, empty, error, conflict, and ready states.

## Mutation table

| Task | Mutant | Test and failing assertion | Restored result |
| --- | --- | --- | --- |
| T014 | Make meal-down operation a no-op | Playwright `ar dark` / `en light`: first meal quantity remained `160`; expected the first row to change after keyboard activation | Restored `moveMeal`; Playwright passed |
| T014 | Force editor direction to LTR | `renders Arabic RTL and English LTR labels and exact localized totals` — expected `dir="rtl"`, received `dir="ltr"` | Restored `dirFor(locale)`; unit test passed |
| T022 | Change `aria-live="polite"` to `off` | `renders Arabic RTL and English LTR labels and exact localized totals` — expected `aria-live="polite"` | Restored polite announcement; focused suite passed |

Every mutation used a temporary file backup and was restored from that backup. `git diff --check` is clean after restoration.

## DRAFT copy keys for the PO batch

The following 30 new `nutritionPlan.*` keys are present in both message files. T011 follow-up adds `nutritionAlternatives.milliliters`; that makes **31 new keys / 62 locale strings** across T011 follow-up and T014/T022.

| Key | Arabic (AR) | English (EN) |
| --- | --- | --- |
| `nutritionAlternatives.milliliters` | مل | ml |
| `nutritionPlan.title` | محرر خطة التغذية | Nutrition plan editor |
| `nutritionPlan.structure` | بنية الخطة | Plan structure |
| `nutritionPlan.singleDay` | يوم واحد متكرر | Repeating single day |
| `nutritionPlan.sevenDay` | سبعة أيام | Seven days |
| `nutritionPlan.day` | اليوم | Day |
| `nutritionPlan.dayType` | نوع اليوم | Day type |
| `nutritionPlan.trainingDay` | يوم تدريب | Training day |
| `nutritionPlan.restDay` | يوم راحة | Rest day |
| `nutritionPlan.meals` | الوجبات | Meals |
| `nutritionPlan.meal` | وجبة | Meal |
| `nutritionPlan.addMeal` | إضافة وجبة | Add meal |
| `nutritionPlan.moveUp` | نقل الوجبة لأعلى | Move meal up |
| `nutritionPlan.moveDown` | نقل الوجبة لأسفل | Move meal down |
| `nutritionPlan.duplicate` | تكرار الوجبة | Duplicate meal |
| `nutritionPlan.quantity` | الكمية | Quantity |
| `nutritionPlan.mealTotals` | إجمالي الوجبة | Meal totals |
| `nutritionPlan.dayTotals` | إجمالي اليوم | Day totals |
| `nutritionPlan.loading` | جارٍ تحميل الخطة… | Loading plan… |
| `nutritionPlan.emptyTitle` | لا توجد وجبات بعد | No meals yet |
| `nutritionPlan.emptyDescription` | أضف وجبة لبدء إعداد الخطة. | Add a meal to start building this plan. |
| `nutritionPlan.errorTitle` | تعذر تحميل الخطة | Unable to load plan |
| `nutritionPlan.errorDescription` | حاول تحميل الخطة مرة أخرى. | Try loading the plan again. |
| `nutritionPlan.conflictTitle` | تغيّرت الخطة في مكان آخر | Plan changed elsewhere |
| `nutritionPlan.conflictDescription` | حدّث المسودة قبل متابعة التعديلات. | Refresh the draft before continuing edits. |
| `nutritionPlan.retry` | إعادة المحاولة | Retry |
| `nutritionPlan.previewTitle` | محرر خطة التغذية | Nutrition plan editor |
| `nutritionPlan.previewIntro` | معاينة للمحرر ببيانات تجريبية. لا تُحفظ التغييرات. | Editor preview with sample data. Changes are not saved. |
| `nutritionPlan.previewNotice` | للعرض فقط. الخطة والأغذية وهمية ولا يُحفظ أي شيء. | Showcase only. Plan and foods are mocked; nothing is saved. |
| `nutritionPlan.totalsAnnouncement` | إجمالي اليوم المحدد | Selected day totals |
| `nutritionPlan.totalsUnavailable` | تعذر حساب الإجماليات | Totals could not be calculated |

## Rendered evidence and axe

Saved under `%TEMP%\lifter-s26-f18-editor` (`C:\Users\NEW LAP\AppData\Local\Temp\lifter-s26-f18-editor`). The eight screenshots cover AR-RTL and EN-LTR × light and dark × 390px and 1440px. Each browser case also activates meal reorder by keyboard and checks for horizontal overflow. Axe reported **0 violations** in all four locale/theme cases.

| Locale / theme | 390px | 1440px |
| --- | --- | --- |
| AR-RTL / dark | `f18-editor-ar-dark-390.png` | `f18-editor-ar-dark-1440.png` |
| AR-RTL / light | `f18-editor-ar-light-390.png` | `f18-editor-ar-light-1440.png` |
| EN-LTR / dark | `f18-editor-en-dark-390.png` | `f18-editor-en-dark-1440.png` |
| EN-LTR / light | `f18-editor-en-light-390.png` | `f18-editor-en-light-1440.png` |

Rendered review: no horizontal overflow; Arabic day types and units display in Arabic; quantity and macro digits are localized and mixed-direction values are isolated. The responsive item grid follows the existing showcase `auto-fit/minmax` pattern and adds no fixed breakpoint.

## Mandatory design checklist

- **Tokens and brand:** PASS — component surfaces, spacing, radii, and colors use existing tokens and shared `Card`, `Button`, `Alert`, and `Bidi`. No changes to tokens, shared components, or success/warning/error colors. Workspace override contrast remains covered by the repository brand contrast suite.
- **Typography and bidi:** PASS — inherited Geist / IBM Plex Sans Arabic; Arabic quantity and total digits localized; values and units use `Bidi` with LTR isolation.
- **Spacing and component consistency:** PASS — shared controls and token spacing; responsive `auto-fit` layout follows the showcase pattern.
- **Contrast:** PASS — axe has zero violations for light and dark in AR and EN. Existing semantic tokens remain unchanged under workspace branding.
- **Accessibility:** PASS — native buttons provide keyboard move/duplicate alternatives, disabled boundaries, visible shared focus, labelled controls, status/error roles, polite total announcements, and touch-min sizing. No motion was added. Axe clean.
- **States:** PASS — ready, loading, empty, error, conflict, and disabled boundary controls are covered. Pending/saved states do not apply to this mocked, non-persisting editor.
- **Copy:** PASS — all new labels and states are in `lib/i18n/messages/{ar,en}.ts` as DRAFT; Arabic digits are localized.
- **Responsive screenshots:** PASS — eight real rendered captures listed above; no overflow; captures reviewed and no re-shot was needed.
- **Tests and size:** PASS — final gates: `npm test` 111 files / 1,777 tests, lint, typecheck, format:check, build, check:secrets, `git diff --check`, and size all passed. No dependency added.

## Final gate record

- Unit tests ran with `API_URL`, `DB_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `LIFTER_SUPABASE_STACK`, `SUPABASE_SAFE_CLI`, and all `SUPABASE_*` variables unset.
- `npm run build`, `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run check:secrets`, `npm run size`, and `git diff --check`: PASS.
- Showcase Playwright: 4/4 locale/theme cases passed; keyboard move and mobile/desktop overflow checks passed; axe: 0 violations in all four locale/theme cases.

## Design skill catalog review

## Screenshot review follow-up (2026-11-02)

The quantity field now sizes to its content (`8ch`), selects use their intrinsic width within the parent, and each food/quantity row aligns at the center. Digit display uses the shared `lib/i18n/format-digits.ts` helper. Playwright captures full pages so meal totals, day totals, and the live region are included. The eight AR/EN × light/dark × 390/1440 captures are in `%TEMP%/lifter-s26-f18-editor-r2`. The editor Playwright suite passed (4 locale/theme cases, both viewports each); axe reported zero violations at each viewport. I visually reviewed the 1440 EN/light and 390 AR/dark renders; the controls remain compact, totals are visible, and there is no horizontal overflow.

The full `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was read. The complete APPLIES / NOT APPLICABLE matrix is in [T011 evidence](T011-evidence.md) and is reused for this editor. Applied here: `frontend-design` (implemented within the approved system), `impeccable` (detector clean), `baseline-ui` (existing primitives and responsive sizing), `better-ui` (component polish), `better-typography` (hierarchy and tabular values), `better-colors` (semantic token contrast), `better-layout` (fluid RTL/LTR grouping), `better-accessibility` (keyboard, live regions, state semantics), `better-writing` (bilingual copy), `better-interface` and `interface-review` (state and rendered review), `emil-design-eng` (motion restraint), and `ui-ux-pro-max` (lookup only; no persisted output). No skill recommendation overrode `DESIGN.md`; its generic bespoke font/effect guidance conflicts with the approved typography and restrained token system.

## Architect follow-up (2026-11-02)

### Template source localization

- **RED:** Before implementation, the new Arabic render test in `tests/unit/NutritionTemplateManager.test.tsx` failed at line 121 because its markup contained literal `Platform` (`المصدر: <bdi>Platform</bdi>`).
- **GREEN:** The platform origin now uses the bilingual `nutritionTemplates.platform` message, marked DRAFT in both catalogs. The Arabic showcase uses `مساحة العمل أ` for the sample workspace origin. Focused unit suite: 10 passed. Showcase Playwright: 8 cases passed; axe: 0 violations at tested viewports. Captures reviewed in `C:/Users/NEW LAP/.lifter/runs/s26-luna-f18-followup` (`f18-templates-ar-light-1440.png`, `f18-templates-ar-dark-1440.png`).
- The screenshot test supports `F18_SCREENSHOT_DIR` and `F18_SCREENSHOT_FILTER`, allowing only requested captures while the full showcase checks run.

### Totals display rule — resolved by S27-PO-2

The request's S26-R7 default would show each macro as an integer at or above 10 g and one decimal below 10 g, summing unrounded item values. However, the approved feature specification is not silent: FR-003 and the acceptance scenario at `spec.md:23`, plus `plan.md:27` and `plan.md:73` (D18-4=C), explicitly require calories and macros to display as integers. Under that approved rule the 0.4 g + 0.8 g example can display as meal values 0 g and 1 g at the day level. Applying S26-R7 would override the approved PO decision, so no totals code, 0.4 + 0.8 assertion, or totals mutation was committed.

Options for the architect/PO:

**Resolved by S27-PO-2 (2026-11-02):** option 2 is approved. The PO decision is: "F18: Approved one-decimal display below 10 g, retaining full calculation precision." This open question is closed. Macro gram values (protein, carbohydrate, fat, fiber) below 10 g display exactly one decimal place and values at or above 10 g display as integers, rounded half-up from the exact unrounded value at display time. A value below 10 g that rounds to 10.0 displays as `10`; zero displays as `0`. Calories stay integer. Calculations, storage, and golden fixtures are unchanged. The options below are retained as historical record.

1. Keep D18-4=C integer display everywhere; accept that independently rounded meal displays can sum differently from the day display. This preserves the current approved spec.
2. Replace D18-4=C with S26-R7; exact calculations/storage remain unchanged, while meal/day displays share the >=10 integer / <10 one-decimal rule. This removes the reported small-value contradiction and defines the requested 0.4 + 0.8 fixture outcome.
3. Keep integer display but add an explicit UI rule that reconciles meal displays to the day total. This preserves integer precision but needs a new allocation rule for assigning residual grams to meals.

Recommendation: option 2, because it gives every displayed value the same deterministic precision rule without changing exact calculations or stored totals. The architect/PO must resolve the spec conflict before the totals implementation and requested editor screenshots can be completed.

### Mutation and final gates

- **Localization mutation:** after commit `1d7a4d4`, backed up `NutritionTemplateManager.tsx` to OS temp, temporarily changed the `nutritionTemplates.platform` branch to render `template.origin`, and reran the focused suite. It failed at `tests/unit/NutritionTemplateManager.test.tsx:121` because the AR markup again contained `Platform`. Restored from backup; `git diff --exit-code -- components/plans/NutritionTemplateManager.tsx` passed.
- **Final implementation gates:** unit suite (clean required environment): 112 files / 1,787 tests PASS; lint PASS; typecheck PASS; format:check PASS; build PASS; check:secrets PASS; git diff --check PASS. The UI commit adds no dependency. No database, Supabase stack, migration, or Docker was used.
- **Design review:** only existing components/tokens and the localized message catalog are used; no color, spacing, radius, typography, or shared component changes. Arabic text is in the existing RTL/Bidi flow. Showcase contrast and accessibility remain clear across both themes; Playwright plus axe passed all 8 locale/theme cases (0 axe violations across 20 tested viewport renders). The two 1440px Arabic template captures were reviewed; platform and workspace origins are Arabic.
