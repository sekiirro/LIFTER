# T037 — Workout template management UI (evidence)

- **Branch:** `017-t037-templates` (pushed to `origin/017-t037-templates`, no PR)
- **Worktree:** `C:/Users/NEW LAP/Desktop/LFTR-017t037`
- **Base:** `d86e70b` (`origin/017-workout-planner`)
- **Scope:** mock projections only — no DB, no stack, no migrations, no Docker, no new dependency
- **Showcase:** `/showcase/workout-templates` (actor switch: `?actor=staff` | `?actor=po`)
- **Components:** `components/plans/workout/WorkoutTemplateManager.tsx`, `lib/plans/workout/template-management.ts`, `lib/plans/workout/template-fixtures.ts`

## 1. Commit trail (all pushed, no amend, no force)

| SHA | Message |
|-----|---------|
| `4c97dac` | test(f17): add RED template management coverage |
| `a91fe0a` | feat(f17): add template management domain rules |
| `7b03740` | feat(f17): add workout template management UI |
| `f5d5555` | test(f17): add template showcase browser coverage |
| `bf62c4e` | fix(f17): preserve template editor input events |
| `f5a59e3` | feat(f17): localize template errors and pending states |
| `ecc018d` | chore(f17): format template management files and clear lint warnings |
| `8d3d545` | chore(f17): capture template screenshots in the s27 evidence folder |
| _(this commit)_ | docs(f17): add T037 evidence and tick the task |

## 2. RED (recorded before the implementation commit `a91fe0a`)

`npx vitest run tests/unit/workout-template-management.test.ts` at `4c97dac` → **2 failed**

```
× shows only visible scopes and caps a template page at twenty rows
  AssertionError: expected +0 to be 24
× does not expose another workspace template even when pagination is requested
  AssertionError: expected [] to deeply equal [ 'local' ]
```

The stub shipped with the RED commit exposed no visible templates, so both scope
visibility and the twenty-row page cap failed before any production code existed.

## 3. GREEN

| Check | Command | Result |
|-------|---------|--------|
| Domain + UI unit | `npx vitest run tests/unit/workout-template-management.test.ts tests/unit/workout-template-manager.test.tsx` | **2 files / 12 tests passed** |
| Browser (showcase) | `PLAYWRIGHT_BASE_URL=http://localhost:3427 npx playwright test tests/e2e/workout-templates.spec.ts --project=chromium --workers=1` | **4 passed (20.6 s)** at `8d3d545` |
| axe | `new AxeBuilder({ page }).analyze()` on 8 matrix pages | **0 violations** on every page |
| Full unit gate | `npm test` (clean env) | **123 files / 1892 tests passed** |

Playwright specs (`tests/e2e/workout-templates.spec.ts`):

1. workspace staff see scoped templates and can operate the editor **by keyboard** (focus → `Enter` → edit → save)
2. loading copies a template into the draft; a later template edit never changes the draft; a retired template is **not loadable**
3. the platform owner receives global governance controls (create global / retire / Make it Global)
4. bilingual + responsive matrix with `lang`/`dir` assertions, no horizontal overflow, axe, and full-page screenshots

## 4. Mutation proof (fix committed first, file backup, never `git checkout --`)

Both mutants were applied to the committed code, the focused unit test was run,
and the file was restored from the `/tmp` backup. After each restore,
`git diff --exit-code` returned clean and `git status` showed only the untracked
`AGENTS.md` (never committed).

| # | Mutant (removed behaviour) | File mutated | Test | Failing assertion (file:line) |
|---|---------------------------|--------------|------|-------------------------------|
| 1 | **Scope gating** — `isVisibleTemplate()` returns `true` for every workspace template | `lib/plans/workout/template-management.ts` | `tests/unit/workout-template-management.test.ts` — *does not expose another workspace template even when pagination is requested* | `tests/unit/workout-template-management.test.ts:122:50` → `AssertionError: expected [ 'local', 'foreign' ] to deeply equal [ 'local' ]` |
| 2 | **Load-copy semantics** — `loadTemplateIntoDraft()` appends `template.document.days` by reference instead of a cloned, id-remapped copy | `lib/plans/workout/template-management.ts` | `tests/unit/workout-template-management.test.ts` — *loads an independent copy and remaps every document id* | `tests/unit/workout-template-management.test.ts:174:30` → `AssertionError: expected '10000000-0000-4000-8000-000000000001' not to be '10000000-0000-4000-8000-000000000001' // Object.is equality` |

Run logs: `C:/Users/NEW LAP/.lifter/runs/s26-mm-f17-builder-r/mutation-scope-gating.log`
and `.../mutation-load-copy.log`.

## 5. Requirement → evidence map

| Requirement | Implementation | Evidence |
|-------------|----------------|----------|
| List global + workspace templates | `listVisibleTemplates()` + list with scope/status badges (`data-template-scope`, `data-template-status`) | unit *shows only visible scopes…*, e2e #1/#3 |
| Load into a draft with **copy** semantics | `loadTemplateIntoDraft()` deep-clones and remaps every day/item/set id | unit *loads an independent copy…* + mutation #2 |
| Later template edits never change the draft | draft holds its own copy; template edits bump `version` only | unit *keeps the draft unchanged when the source template is later edited*, e2e #2 |
| Create/edit workspace templates | `createWorkspaceTemplate()` / `editTemplate()` + editor form (`templates.name`, `templates.description`) | e2e #1 (keyboard edit + save), unit *creates and edits workspace templates only in the selected workspace* |
| PO-only global governance | `canManageGlobalTemplates()` → `role === 'platform_owner'`; create global, retire, Make it Global | unit *allows only PO to create global templates…*, SSR unit test, e2e #3 |
| Staff never see global governance | controls are rendered only when `po` is true | unit `workout-template-manager.test.tsx` (staff: 0 global controls), e2e #1 |
| Global templates read-only for non-PO | `canEditTemplate()` false for global scope; “Read only” badge | e2e #1 (no Edit button on the global row) |
| Retired templates shown retired, not loadable | `status: 'retired'`, load button disabled, load throws `retired_template_not_loadable` | e2e #2, unit *shows retired templates but never allows loading them* |
| Pagination cap per spec | `TEMPLATE_PAGE_SIZE = 20` (hard cap, page clamping) — matches DESIGN.md “large lists: server pagination, 20 rows by default” | unit *shows only visible scopes and caps a template page at twenty rows* |
| Errors are localized, not raw domain strings | `WorkoutTemplateManagementError.code` → i18n key map | unit *exposes stable reason codes for governed failures* |

## 6. DRAFT copy (still DRAFT per S27-PO-2)

64 `templates.*` keys were added **after** the approved DRAFT batch, so they stay
DRAFT. They live in one contiguous block immediately before the first `volume.*`
key in both `lib/i18n/messages/ar.ts` and `lib/i18n/messages/en.ts`, marked
`// DRAFT (F17 T037): template-management copy pending PO review.`
AR and EN key sets are identical (`en.ts` is typed `Record<keyof typeof ar, string>`).

| # | Key | AR (draft) | EN (draft) |
|---|------|-----------|-----------|
| 1 | `templates.showcaseTitle` | إدارة قوالب التمرين | Workout template management |
| 2 | `templates.showcaseIntro` | معاينة تفاعلية للقوالب العامة وقوالب مساحة العمل ونسخها إلى مسودة. | An interactive preview of global and workspace templates and independent draft copies. |
| 3 | `templates.projectionNotice` | معاينة محلية · لا يتم الحفظ | Local preview · Nothing is saved |
| 4 | `templates.selectedWorkspace` | مساحة العمل المختارة | Selected workspace |
| 5 | `templates.staffView` | عرض فريق مساحة العمل | Workspace staff view |
| 6 | `templates.poView` | عرض مالك المنصة | Platform owner view |
| 7 | `templates.listTitle` | القوالب المتاحة | Available templates |
| 8 | `templates.globalScope` | عام | Global |
| 9 | `templates.workspaceScope` | مساحة العمل | Workspace |
| 10 | `templates.active` | نشط | Active |
| 11 | `templates.retired` | متقاعد | Retired |
| 12 | `templates.readOnly` | للقراءة فقط | Read only |
| 13 | `templates.version` | الإصدار | Version |
| 14 | `templates.load` | تحميل في مسودة | Load into draft |
| 15 | `templates.loadNamed` | تحميل في مسودة: {name} | Load into draft: {name} |
| 16 | `templates.edit` | تعديل | Edit |
| 17 | `templates.editNamed` | تعديل: {name} | Edit: {name} |
| 18 | `templates.retire` | تقاعد | Retire |
| 19 | `templates.retireNamed` | تقاعد: {name} | Retire: {name} |
| 20 | `templates.makeGlobal` | جعله عامًا | Make it Global |
| 21 | `templates.makeGlobalNamed` | جعله عامًا: {name} | Make it Global: {name} |
| 22 | `templates.createWorkspace` | إنشاء قالب لمساحة العمل | Create workspace template |
| 23 | `templates.createGlobal` | إنشاء قالب عام | Create global template |
| 24 | `templates.globalGovernance` | إدارة القوالب العامة | Global template governance |
| 25 | `templates.editorTitleWorkspace` | قالب مساحة العمل | Workspace template |
| 26 | `templates.editorTitleGlobal` | قالب عام | Global template |
| 27 | `templates.name` | اسم القالب | Template name |
| 28 | `templates.nameHint` | استخدم اسمًا واضحًا يعرفه فريق مساحة العمل. | Use a clear name that the workspace team will recognize. |
| 29 | `templates.description` | الوصف | Description |
| 30 | `templates.save` | حفظ القالب | Save template |
| 31 | `templates.cancel` | إلغاء | Cancel |
| 32 | `templates.empty` | لا توجد قوالب متاحة. | No templates are available. |
| 33 | `templates.previous` | الصفحة السابقة | Previous page |
| 34 | `templates.next` | الصفحة التالية | Next page |
| 35 | `templates.pageOf` | الصفحة {page} من {total} | Page {page} of {total} |
| 36 | `templates.draftTitle` | المسودة المستقلة | Independent draft |
| 37 | `templates.draftEmpty` | المسودة فارغة.حمّل قالبًا لبدء نسخته. | The draft is empty. Load a template to create a copy. |
| 38 | `templates.draftDay` | يوم: {name} | Day: {name} |
| 39 | `templates.draftDays` | {count} أيام منسوخة | {count} copied days |
| 40 | `templates.copyNotice` | التحميل ينشئ نسخة مستقلة ويعيد تعيين كل المعرّفات؛ لا تتأثر المسودة بتعديلات القالب لاحقًا. | Loading creates an independent copy and remaps every id; later template edits never change the draft. |
| 41 | `templates.created` | تم إنشاء القالب في المعاينة المحلية. | The template was created in the local preview. |
| 42 | `templates.updated` | تم تحديث القالب في المعاينة المحلية. | The template was updated in the local preview. |
| 43 | `templates.loaded` | تم تحميل نسخة مستقلة في المسودة. | An independent copy was loaded into the draft. |
| 44 | `templates.retiredMessage` | تقاعد القالب في المعاينة المحلية. | The template was retired in the local preview. |
| 45 | `templates.promoted` | أصبح القالب عامًا في المعاينة المحلية. | The template was made Global in the local preview. |
| 46 | `templates.invalidName` | أدخل اسمًا للقالب. | Enter a template name. |
| 47 | `templates.notEligible` | هذا القالب غير مؤهل ليصبح عامًا. | This template is not eligible to become Global. |
| 48 | `templates.confirmRetireTitle` | تقاعد القالب؟ | Retire the template? |
| 49 | `templates.confirmRetireDescription` | لن يمكن تحميل القالب في مسودات جديدة بعد التقاعد. | The template cannot be loaded into new drafts after it is retired. |
| 50 | `templates.confirmRetire` | تقاعد القالب | Retire template |
| 51 | `templates.templateCount` | {count} قوالب | {count} templates |
| 52 | `templates.saving` | جارٍ الحفظ… | Saving… |
| 53 | `templates.loadingIntoDraft` | جارٍ تحميل نسخة… | Loading a copy… |
| 54 | `templates.retiring` | جارٍ التقاعد… | Retiring… |
| 55 | `templates.promoting` | جارٍ النشر عالميًا… | Publishing globally… |
| 56 | `templates.errorRetired` | لا يمكن تحميل قالب متقاعد في مسودة. | Retired templates cannot be loaded into a draft. |
| 57 | `templates.errorNotAuthorized` | لا تملك صلاحية إدارة هذه القوالب. | You are not allowed to manage these templates. |
| 58 | `templates.errorWorkspaceMismatch` | هذا الإجراء يستهدف مساحة عمل أخرى. | This action targets another workspace. |
| 59 | `templates.errorGlobalGovernance` | إدارة القوالب العامة متاحة لمالك المنصة فقط. | Only the platform owner can govern global templates. |
| 60 | `templates.errorEditNotAllowed` | لا يمكنك تعديل هذا القالب. | You cannot edit this template. |
| 61 | `templates.errorRetireNotAllowed` | لا يمكنك تقاعد هذا القالب. | You cannot retire this template. |
| 62 | `templates.errorPromotionNotAllowed` | لا يمكنك جعل هذا القالب عامًا. | You cannot promote this template. |
| 63 | `templates.errorTemplateNotFound` | لم يعد هذا القالب متاحًا في المعاينة. | This template is no longer available in the preview. |
| 64 | `templates.errorUnknown` | تعذّر إتمام الإجراء في هذه المعاينة. | The action could not be completed in this preview. |

AR keys: 64 · EN keys: 64

## 7. Screenshots (full page, showcase route)

Directory: `C:\Users\NEW LAP\AppData\Local\Temp\lifter-s27-f17-templates`

| File | Locale | Theme | Viewport |
|------|--------|-------|----------|
| `ar-dark-desktop.png` | AR (RTL) | dark | 1440 |
| `ar-dark-mobile.png` | AR (RTL) | dark | 390 |
| `ar-light-desktop.png` | AR (RTL) | light | 1440 |
| `ar-light-mobile.png` | AR (RTL) | light | 390 |
| `en-dark-desktop.png` | EN (LTR) | dark | 1440 |
| `en-dark-mobile.png` | EN (LTR) | dark | 390 |
| `en-light-desktop.png` | EN (LTR) | light | 1440 |
| `en-light-mobile.png` | EN (LTR) | light | 390 |

Reviewed against DESIGN.md §12 after the first capture; fixes applied and the
matrix re-shot: localized pending/error states (`f5a59e3`), workspace id wrapped
in `Bidi` for mixed direction, AR/EN badge and action alignment, and no
horizontal overflow at 390 px (asserted in the e2e spec).

## 8. Design checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Tokens only (no hard-coded colors/spacing/radii/fonts) | **PASS** | CSS modules use only `--space-*`, `--color-*`, `--radius-*`, `--text-*`, `--touch-min`, `--brand-ring`; the single literal color is the documented `BrandScope color` prop, which derives brand tokens (same pattern as `workout-print`/`f14-banner` showcases) |
| Workspace brand override does not alter success/warning/error | **PASS** | semantic states use `--color-{success,warning,error}-*`; `BrandScope` only writes `--brand-*` |
| Typography: Geist (EN) / IBM Plex Sans Arabic (AR) | **PASS** | inherited from `app/globals.css` `:lang()` stacks; no new font files or `font-family` declarations |
| Mixed direction via `Bidi` (not mirroring) | **PASS** | `Bidi dir="auto"` for template names/descriptions, `Bidi dir="ltr"` for the workspace id; no icon mirroring hacks |
| Spacing/alignment consistent with `components/ui` | **PASS** | reuses `Button`, `Field`, `Alert`, `ConfirmDialog`; same token scale as `WorkoutVolumeSummary` |
| Contrast in light **and** dark, incl. workspace brand colour | **PASS** | axe reports 0 violations on all 8 pages under the workspace brand scope |
| Keyboard path + visible focus | **PASS** | e2e #1 drives the editor from the keyboard (`focus` → `Enter` → save); global `:focus-visible` ring; `ConfirmDialog` traps `Tab` and restores focus |
| Screen-reader names / roles / live regions | **PASS** | named actions (`Load into draft: …`), `role="group"` for governance controls, `role="status"` / `role="alert"` for feedback, `aria-live="polite"` pagination, `aria-busy` on pending buttons |
| Touch targets | **PASS** | buttons and inputs use `--touch-min`; mobile layout verified at 390 px |
| Reduced motion | **PASS** | no custom animation; only the existing `Button` spinner, covered by the global `prefers-reduced-motion` override |
| States: loading / empty / error / success / disabled / pending / hover / active / focus | **PASS** | pending (`Button loading` + `aria-busy` on save/load/retire/promote), empty list + empty draft copy, field error + error `Alert`, success `Alert`, disabled retired load / ineligible promotion / pagination edges, hover row + focus ring |
| Bilingual copy from `lib/i18n/messages`, no hard-coded strings | **PASS** | all visible strings come from the 64 `templates.*` keys; domain error messages are mapped through stable codes |
| Matrix screenshots (AR/EN × light/dark × 390/1440) | **PASS** | 8 full-page PNGs listed above, reviewed and re-shot |
| Unit + e2e + axe, no new dependency | **PASS** | 1892 unit tests, 4 e2e tests, axe 0; `package.json` untouched |
| `npm run size` within budget | **PASS** | web worker 8101.11 KiB uncompressed (gzip 1654.47 KiB) = 12.36 % of the 64 MiB limit; cron 6.05 KiB |

**Design-gap escalation:** none required. Every decision came from DESIGN.md and
the existing Design System (tokens, `components/ui`, showcase reference pages).
No DESIGN.md §11 item was touched and no shared token or component was edited.

## 9. Design skills catalog assessment

`C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was read in full. Skills are
advisory only — DESIGN.md and the implemented Design System win. Where a skill
conflicted with an approved PO decision (the catalog marks those rows
“CONFLICT - PO decision”), the DESIGN.md decision was kept.

| Skill | Applies | Reason |
|-------|---------|--------|
| `apple-design` | APPLIES | restraint, focus and material guidance applied to the surface; its “CONFLICT” rows defer to DESIGN.md |
| `ui-ux-pro-max` | APPLIES (lookup only) | used for the a11y/responsive checklist; output was not persisted anywhere in the repo |
| `impeccable` | APPLIES | hierarchy, states, copy and edge-case pass over the manager screen |
| `frontend-design` | APPLIES | surface kept distinctive (scope/status badges, editorial list) instead of generic card soup |
| `baseline-ui` | APPLIES | spacing, hierarchy and typography cleanup of the new module CSS |
| `design-dna` | NOT APPLICABLE | no design-DNA extraction or new token system was requested; LIFTER tokens already exist |
| `genjutsu` | NOT APPLICABLE | multi-agent creative-coding workflow is out of scope for a scoped CRUD preview |
| `emil-design-eng` | APPLIES | micro-detail polish (hover rows, pending affordance, no gratuitous motion) |
| `animate` | NOT APPLICABLE | no animation was requested; motion would violate the “no effect added just because a skill suggests it” rule |
| `animate-expo` | NOT APPLICABLE | React Native only |
| `review-animations` | NOT APPLICABLE | no motion code exists in this change |
| `improve-animations` | NOT APPLICABLE | no motion code exists in this change |
| `find-animation-opportunities` | NOT APPLICABLE | no motion code exists in this change |
| `animation-vocabulary` | NOT APPLICABLE | motion naming is not part of this task |
| `animation-performance` | NOT APPLICABLE | no animations to profile |
| `prototype` | NOT APPLICABLE | no multi-variant picker requested |
| `mobile-native` | APPLIES | 390 px layout, tap targets, no hover-only affordances |
| `pick-ui-library` | NOT APPLICABLE | no new dependency; existing `components/ui` reused |
| `ask-sonner` | NOT APPLICABLE | the repo’s own `Alert`/`Toast` components are used instead of Sonner |
| `write-swift` | NOT APPLICABLE | iOS native only |
| `break-ui` | APPLIES (review) | worst-case pass on long template names, empty list, empty draft and 390 px overflow |
| `better-ui` | APPLIES | polish, icon usage, hover/focus/pressed states |
| `better-typography` | APPLIES | type scale, wrapping and tabular numerals for versions/counts |
| `better-colors` | APPLIES | semantic token usage and light/dark contrast |
| `better-accessibility` | APPLIES | keyboard path, SR names, live regions, focus restoration |
| `better-layout` | APPLIES | grouping, RTL mirroring, responsive collapse to one column |
| `better-interface` | APPLIES | consolidated cross-discipline review of the screen |
| `better-writing` | APPLIES | labels, empty/error/pending copy sourced from i18n |
| `interface-review` | NOT APPLICABLE | branch/diff-level review is out of scope for this tick; the screen-level review is covered by `better-interface` |
| `visual-style-presets` | NOT APPLICABLE | LIFTER’s approved DESIGN.md style is already fixed; no new style direction was introduced |
| `glass-dark-ui` | NOT APPLICABLE | DESIGN.md surfaces are flat cards; no glass/glow treatment |
| `progressive-blur` | NOT APPLICABLE | no blur layers in the design |
| `motion-design` | NOT APPLICABLE | no motion work |
| `css-animation` | NOT APPLICABLE | no CSS keyframe animation |
| `remotion-motion-graphics` | NOT APPLICABLE | video work |
| `gsap-core` | NOT APPLICABLE | no GSAP animation; the surface is token-driven CSS |
| `gsap-frameworks` | NOT APPLICABLE | no GSAP animation |
| `gsap-performance` | NOT APPLICABLE | no GSAP animation |
| `gsap-plugins` | NOT APPLICABLE | no GSAP animation |
| `gsap-react` | NOT APPLICABLE | no GSAP animation |
| `gsap-scrolltrigger` | NOT APPLICABLE | no GSAP animation |
| `gsap-timeline` | NOT APPLICABLE | no GSAP animation |
| `gsap-utils` | NOT APPLICABLE | no GSAP animation |
| `threejs-fundamentals` | NOT APPLICABLE | no 3D scene |
| `threejs-animation` | NOT APPLICABLE | no 3D scene |
| `threejs-geometry` | NOT APPLICABLE | no 3D scene |
| `threejs-interaction` | NOT APPLICABLE | no 3D scene |
| `threejs-lighting` | NOT APPLICABLE | no 3D scene |
| `threejs-loaders` | NOT APPLICABLE | no 3D scene |
| `threejs-materials` | NOT APPLICABLE | no 3D scene |
| `threejs-postprocessing` | NOT APPLICABLE | no 3D scene |
| `threejs-shaders` | NOT APPLICABLE | no 3D scene |
| `threejs-textures` | NOT APPLICABLE | no 3D scene |
| `lottie` | NOT APPLICABLE | HyperFrames workflow, not used by this feature |
| `remotion-to-hyperframes` | NOT APPLICABLE | no composition migration |

## 10. Gates (run once on the final code state `8d3d545`)

| Gate | Result |
|------|--------|
| `npm test` (unit, clean env: no `API_URL`/`DB_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`/stack vars) | **PASS** — 123 files / 1892 tests |
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npm run typecheck` | **PASS** |
| `npm run format:check` | **PASS** |
| `npm run build` | **PASS** — `/showcase/workout-templates` present in the route table |
| `npm run check:secrets` | **PASS** |
| `git diff --check` | **PASS** — clean |
| `npm run size` (after `npm run build:edge`) | **PASS** — 12.36 % of the 64 MiB worker limit |
| Showcase Playwright + axe on port 3427 | **PASS** — 4 passed, axe 0 violations × 8 pages |

Gate logs and run artefacts: `C:/Users/NEW LAP/.lifter/runs/s26-mm-f17-builder-r/`
(`gates-final.log`, `playwright-s27.log`, `mutation-*.log`).

## 11. Notes / out of scope

- Mock projections only: `lib/plans/workout/template-fixtures.ts` supplies the
  global, workspace, retired and promotion-ineligible templates; nothing is
  persisted, and the UI states “Local preview · Nothing is saved”.
- Creating a template in the preview seeds a minimal rest-day document; plan
  authoring itself belongs to the plan-builder task (T036), not T037.
- No DB tables, RPCs, migrations, stack or Docker were touched; `FR-006`
  stack work remains for the stack-assigned tasks.
