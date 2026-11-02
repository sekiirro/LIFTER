# F18 S27 — one-decimal macro display evidence

S27-PO-2 decision: "F18: Approved one-decimal display below 10 g, retaining full calculation precision."

## Commit sequence

| Step | SHA | Result |
| --- | --- | --- |
| Spec record | `e738e5e` | D18-4=C amended in `spec.md`/`plan.md`; T014 open question closed; T025 added |
| RED | `064e99e` | 5/5 new formatter tests failed against the temporary integer-only stub |
| GREEN | `e7720ac` | Shared formatter implemented; focused suites 4 files / 27 tests passed |
| Approved copy | `e40bea2` | 67 F18 keys verified against the approved CSV text; four DRAFT copy comments removed |

## RED and GREEN

- **RED:** `tests/unit/nutrition-display.test.ts:14` — `expect(formatMacroGrams('0.4')).toBe('0.4')` failed with received `'0'`. The same run failed at `:16` (`'0.05'` expected `'0.1'`, received `'0'`), `:35` (AR expected `٠.٤`, received `٠`), `:41` (protein `'0.4'`, received `'0'`), and `:106` (Meal totals expected to contain `'0.4'`, rendered `0 g`).
- **GREEN:** `lib/plans/nutrition/display.ts` parses canonical decimal strings into BigInt coefficient/scale pairs and rounds half-up at display time only. Below 10 g the value is rounded to tenths; at or above 10 g it is rounded to an integer; a below-threshold value that rounds to 10.0 renders `10`; zero renders `0`. Calories keep the integer rule. Arabic digits use the existing `formatDigits` helper, so the separator stays the app's existing `.`. Calculation, storage, and golden fixtures are untouched by this task.
- **Formatter call sites:** `NutritionPlanEditor` meal totals, day totals and the polite live-totals announcement; `NutritionPlanAlternativesEditor` `MacroSummary` (item and alternative values). The old `formatNutritionMacroInteger` helper was removed.

## Mutation table

| Mutant | Test and failing assertion | Restore |
| --- | --- | --- |
| `GRAM_DECIMAL_THRESHOLD` changed from `10n` to `1n` | `tests/unit/nutrition-display.test.ts:17:38` — expected `'9.9'`, received `'10'` for `formatMacroGrams('9.94')` | Restored from `%TEMP%/opencode/display.ts.s27bak`; `git diff --exit-code -- lib/plans/nutrition/display.ts` empty |
| Re-added `DRAFT: ` prefix to `nutritionPlan.title` (EN) | `tests/unit/nutrition-copy-approval.test.ts:23:29` — expected `'Nutrition plan editor'`, received `'DRAFT: Nutrition plan editor'` | Restored from `%TEMP%/opencode/en.ts.s27bak`; remaining diff is only the intended DRAFT comment removals |

Both mutations used a file backup, never `git checkout --`. `git diff --check` was clean after restoration.

## Approved copy

- **Un-DRAFTed:** 67 / 67 F18 CSV rows. The fixture `tests/fixtures/f18-approved-copy.ts` stores the approved AR/EN text; `tests/unit/nutrition-copy-approval.test.ts` asserts exact equality (135 assertions) and rejects a `DRAFT` marker in any approved value.
- **Still DRAFT:** 30 `nutritionTemplates.*` keys remain under the existing T012 comment (`// DRAFT (T012 template manager; pending PO copy approval).`):
  `nutritionTemplates.title`, `nutritionTemplates.intro`, `nutritionTemplates.global`, `nutritionTemplates.workspace`, `nutritionTemplates.create`, `nutritionTemplates.createGlobal`, `nutritionTemplates.createVersion`, `nutritionTemplates.retire`, `nutritionTemplates.makeGlobal`, `nutritionTemplates.retired`, `nutritionTemplates.origin`, `nutritionTemplates.platform`, `nutritionTemplates.versions`, `nutritionTemplates.version`, `nutritionTemplates.loadVersion`, `nutritionTemplates.loaded`, `nutritionTemplates.actionError`, `nutritionTemplates.empty`, `nutritionTemplates.previous`, `nutritionTemplates.next`, `nutritionTemplates.page`, `nutritionTemplates.of`, `nutritionTemplates.loading`, `nutritionTemplates.errorTitle`, `nutritionTemplates.errorDescription`, `nutritionTemplates.retry`, `nutritionTemplates.noAccess`, `nutritionTemplates.previewTitle`, `nutritionTemplates.previewIntro`, `nutritionTemplates.previewNotice`.

## Rendered evidence and axe

Playwright ran on the existing F18 showcase routes at `http://localhost:3418` only, with no stack environment variables. Four locale/theme cases (AR-RTL and EN-LTR × light and dark) each ran at 390 px and 1440 px on `/showcase/f18-plan-editor`: **4/4 tests passed**, **8/8 axe scans reported 0 violations**, with no horizontal overflow.

The existing F18 template manager suite also ran on `/showcase/f18-templates` at 390, 768 and 1440 px: **4/4 tests passed**, **12/12 axe scans reported 0 violations**. Its captures are in `%TEMP%/lifter-s27-f18-templates` (`C:\Users\NEW LAP\AppData\Local\Temp\lifter-s27-f18-templates`). Across both F18 showcase suites: **8/8 tests passed** and **20/20 axe scans reported 0 violations**.

Runtime assertions confirm the rendered values, not just unit output:

- EN day totals contain `6.5` g and `0.7` g; the two meal totals contain `2.2` g and `4.3` g.
- AR day totals contain `٦.٥` and `٠.٧`; the two meal totals contain `٢.٢` and `٤.٣`.
- The earlier format printed `4`/`0` and `0`/`0` for these values.

Full-page screenshots are in `%TEMP%/lifter-s27-f18-decimal` (`C:\Users\NEW LAP\AppData\Local\Temp\lifter-s27-f18-decimal`):

| Locale / theme | 390px | 1440px |
| --- | --- | --- |
| AR-RTL / dark | `f18-editor-ar-dark-390.png` | `f18-editor-ar-dark-1440.png` |
| AR-RTL / light | `f18-editor-ar-light-390.png` | `f18-editor-ar-light-1440.png` |
| EN-LTR / dark | `f18-editor-en-dark-390.png` | `f18-editor-en-dark-1440.png` |
| EN-LTR / light | `f18-editor-en-light-390.png` | `f18-editor-en-light-1440.png` |

## Gates

All final gates passed once on the working tree:

- `npm run test` — 114 files / 1,927 tests passed, with stack environment variables unset.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed; includes `/showcase/f18-alternatives`, `/showcase/f18-plan-editor`, and `/showcase/f18-templates`.
- `npm run check:secrets` — passed.
- `npm run size` — web worker 8,009.35 KiB uncompressed (gzip 1,641.60 KiB) of 65,536 KiB; cron worker 6.05 KiB (gzip 2.06 KiB); both within limits. No dependency was added.
- `git diff --check` — clean.
