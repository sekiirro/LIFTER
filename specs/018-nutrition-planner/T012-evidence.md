# T012 — Nutrition template manager evidence

**Status:** Complete — unit, mutation, rendered matrix, axe, and final gates passed.

## RED / GREEN

- **RED, before the manager implementation:** `npx vitest run tests/unit/NutritionTemplateManager.test.tsx` failed the assertion `expect(html).not.toContain('Make it Global')` at `tests/unit/NutritionTemplateManager.test.tsx:12`. The deliberate baseline rendered `<button>Make it Global</button>` for `role: 'trainer'`; Vitest reported the forbidden label in the received HTML.
- **GREEN:** focused template manager unit suite passes, 9 tests. It covers role governance, workspace filtering, read-only global versions, origin masking, Sales denial, retired history, explicit version selection and copy isolation, loading/empty/error states, and a 50-row pagination cap.
- **GREEN:** `npx playwright test --config playwright.f18.config.ts` passes 8 locale/theme cases. Editor: 390/1440 px. Manager: 390/768/1440 px. The template load action works from the keyboard and announces the copied version. Axe reports 0 violations across all 20 rendered viewports.
- **Mutation — expose Make it Global to staff:** PASS. After the implementation commit, temporarily changed the role guard to include `staff`. `npx vitest run tests/unit/NutritionTemplateManager.test.tsx` failed `never exposes Make it Global to workspace staff` at test line 89, with the forbidden label present in the staff markup. Restored from `%TEMP%/NutritionTemplateManager.tsx.t012-backup`; `git diff --exit-code` confirmed an empty diff.
- **Mutation — remove the pagination cap:** PASS. Temporarily changed `paginateNutritionTemplates` to use the requested page size without the 50-row maximum. The same unit suite failed `caps every template page at 50 rows` at line 184 (`expected 500 to be 50`). Restored from `%TEMP%/NutritionTemplateManagerModel.ts.t012-backup`; `git diff --exit-code` confirmed an empty diff.

## Mock projection and governance

`NutritionTemplateManager` accepts only projected template data and callbacks. No database, Supabase, migration, or Docker access was added. Workspace entries are filtered against `selectedWorkspaceId` before pagination. Global templates are visible to readers and only writable by PO; `Make it Global` renders only for PO on eligible workspace templates. Non-PO views omit origin metadata. Retired templates and their version history remain visible, and loading them is disabled. Loading names an explicit version and deep-clones its document, preserving the selected source version without sharing mutable draft state. The page-size request is clamped to 50 rows.

## Screenshot matrix

Full-page captures are in `%TEMP%/lifter-s26-f18-templates` and `%TEMP%/lifter-s26-f18-editor-r2`:

| Locale / theme | Templates 390 | Templates 768 | Templates 1440 | Editor 390 | Editor 1440 |
| --- | --- | --- | --- | --- | --- |
| AR-RTL / dark | `f18-templates-ar-dark-390.png` | `f18-templates-ar-dark-768.png` | `f18-templates-ar-dark-1440.png` | `f18-editor-ar-dark-390.png` | `f18-editor-ar-dark-1440.png` |
| AR-RTL / light | `f18-templates-ar-light-390.png` | `f18-templates-ar-light-768.png` | `f18-templates-ar-light-1440.png` | `f18-editor-ar-light-390.png` | `f18-editor-ar-light-1440.png` |
| EN-LTR / dark | `f18-templates-en-dark-390.png` | `f18-templates-en-dark-768.png` | `f18-templates-en-dark-1440.png` | `f18-editor-en-dark-390.png` | `f18-editor-en-dark-1440.png` |
| EN-LTR / light | `f18-templates-en-light-390.png` | `f18-templates-en-light-768.png` | `f18-templates-en-light-1440.png` | `f18-editor-en-light-390.png` | `f18-editor-en-light-1440.png` |

Template captures run inside the existing `BrandScope` sample (`#2563EB`) and are reviewed against DESIGN.md §12. There are 12 manager captures because the new responsive layout also includes the 768 px tablet width; the eight requested mobile/desktop captures are included. The editor screenshots include per-meal totals, per-day totals, and its live region. The workspace form uses a content-sized quantity field, a label-sized day-type select, and centered row alignment. No horizontal overflow was found.

## Mandatory frontend design gate

| Check | Result and evidence |
| --- | --- |
| Tokens and brand | PASS — component styles use existing CSS variables, shared `Card`/`Button`/`Alert`/`Bidi`, and the established `BrandScope`. The sample workspace brand does not replace semantic success/error colors. |
| Typography and bidi | PASS — Geist / IBM Plex Sans Arabic inherited; digit display uses `lib/i18n/format-digits.ts`; version, pagination, and origin values use `Bidi`. |
| Spacing and components | PASS — token spacing and existing controls; responsive rows wrap without adding a breakpoint or new shared primitive. |
| Contrast and themes | PASS — axe clean at each AR/EN × light/dark × 390/1440 render with workspace brand sample. |
| Accessibility | PASS — native keyboard-operable actions, visible shared focus, named controls, disabled retired-version load, stable polite load status, and axe 0. |
| States | PASS — loading, empty, error/retry, pending load, successful copy, retired/disabled, pagination, and interaction are represented. |
| Bilingual copy | PASS — all T012 copy is in the AR/EN message catalogs as DRAFT; no new hard-coded UI copy. |
| Rendered matrix | PASS — eight manager captures and eight editor captures above; full-page and visually reviewed. |
| Tests and size | PASS — full unit suite and requested gates passed; no dependency added. |

### Design skill catalog

The full catalog at `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was read. The exhaustive per-skill APPLIES / NOT APPLICABLE inventory is in [T011 evidence](T011-evidence.md#design-skill-catalog-review); it is reused for this matching Next.js editor/manager work. For T012, the applicable skills were `frontend-design` (extend the incumbent product surface), `impeccable` (context, craft floor, and detector), `baseline-ui` (existing controls and spacing), `better-ui` (component states), `better-typography` (approved scale and bidi), `better-colors` (semantic contrast), `better-layout` (responsive RTL/LTR), `better-accessibility` (keyboard and status), `better-writing` (plain bilingual actions and errors), `better-interface` and `interface-review` (cross-state rendered review), `emil-design-eng` (no unnecessary motion), and `ui-ux-pro-max` (lookup only; no output persisted). Native, 3D, video, and animation skills were NOT APPLICABLE because this is a static Next.js interface with no requested motion. Other non-web visual systems were NOT APPLICABLE because the approved component system already governs this surface.

`frontend-design`'s general direction toward bespoke fonts/effects and `emil-design-eng`'s generic animation advice conflict with DESIGN.md's approved typography, token, and motion restraint; the design system won. `better-ui` is marked PO-conflicted in the catalog and was advisory only. The `ui-ux-pro-max` form/accessibility lookup was not persisted and did not introduce a new design rule.

## DRAFT copy keys (AR / EN)

| Key | Arabic | English |
| --- | --- | --- |
| `nutritionTemplates.title` | قوالب التغذية | Nutrition templates |
| `nutritionTemplates.intro` | تصفّح الإصدارات المعتمدة وحمّل نسخة إلى مسودة خطة جديدة. | Browse approved versions and load one into a new plan draft. |
| `nutritionTemplates.global` | قوالب عامة | Global templates |
| `nutritionTemplates.workspace` | قوالب مساحة العمل | Workspace templates |
| `nutritionTemplates.create` | إنشاء قالب | Create template |
| `nutritionTemplates.createGlobal` | إنشاء قالب عام | Create global template |
| `nutritionTemplates.createVersion` | إنشاء إصدار | Create version |
| `nutritionTemplates.retire` | إيقاف القالب | Retire template |
| `nutritionTemplates.makeGlobal` | جعله عامًا | Make it Global |
| `nutritionTemplates.retired` | متوقف | Retired |
| `nutritionTemplates.origin` | المصدر | Origin |
| `nutritionTemplates.platform` | المنصة | Platform |
| `nutritionTemplates.versions` | إصدارات القالب | Template versions |
| `nutritionTemplates.version` | الإصدار | Version |
| `nutritionTemplates.loadVersion` | تحميل الإصدار إلى مسودة | Load version into draft |
| `nutritionTemplates.loaded` | أصبحت نسخة من هذا الإصدار جاهزة في المسودة. | A copy of this version is ready in the draft. |
| `nutritionTemplates.actionError` | تعذر تحميل هذا القالب. حاول مرة أخرى. | This template could not be loaded. Try again. |
| `nutritionTemplates.empty` | لا توجد قوالب في هذا القسم بعد. | No templates in this section yet. |
| `nutritionTemplates.previous` | الصفحة السابقة | Previous page |
| `nutritionTemplates.next` | الصفحة التالية | Next page |
| `nutritionTemplates.page` | الصفحة | Page |
| `nutritionTemplates.of` | من | of |
| `nutritionTemplates.loading` | جارٍ تحميل قوالب التغذية… | Loading nutrition templates… |
| `nutritionTemplates.errorTitle` | تعذر تحميل القوالب | Unable to load templates |
| `nutritionTemplates.errorDescription` | حاول تحميل قائمة القوالب مرة أخرى. | Try loading the template list again. |
| `nutritionTemplates.retry` | إعادة المحاولة | Retry |
| `nutritionTemplates.noAccess` | ليس لديك صلاحية الوصول إلى قوالب التغذية. | You do not have access to nutrition templates. |
| `nutritionTemplates.previewTitle` | إدارة قوالب التغذية | Nutrition template manager |
| `nutritionTemplates.previewIntro` | راجع قوالب مساحة العمل والقوالب العامة ببيانات تجريبية. | Review workspace and global templates using sample data. |
| `nutritionTemplates.previewNotice` | للعرض فقط. القوالب وهمية ولا يُحفظ أي شيء. | Showcase only. Templates are mocked; nothing is saved. |

## Final gates

| Gate | Result |
| --- | --- |
| `npm test` | PASS — clean environment; API/DB/anon/service-role/Supabase stack variables unset; 112 files, 1,786 tests. |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run format:check` | PASS |
| `npm run build` | PASS |
| `npm run check:secrets` | PASS |
| `npm run size` | PASS — web 8,009.35 KiB uncompressed / 1,641.60 KiB gzip; cron 6.05 KiB / 2.06 KiB gzip. |
| `git diff --check` | PASS |
| Showcase Playwright + axe | PASS — 8 cases; 20 editor/manager viewport renders; 0 axe violations. |
