# S27 Exercise Library implementation evidence

## Delivery status

| Task | Status | Evidence |
| --- | --- | --- |
| T037 | Implemented | Production list/search route, bounded pagination, filters, no-seed empty state; focused route tests and Stack C catalog server integration pass. |
| T038 | Implemented in S28 | S27-R2a migration creates the two privacy-safe views and `catalog_exercise_detail`; integration and route tests cover roles, denial equivalence, alias resolution, Removed state, variation isolation, and view grants. |
| T039 | Implemented in S28 | Edit route prefills the current immutable version and uses the existing version RPC with expected-version CAS and idempotency key. |
| T040 | Partially verified | Role tests, no-seed integration, Playwright matrix, copy approval, and repository gates recorded in the run report. Full Stack C integration has existing Vault-dependent failures. |

## Copy approval

All **186 F16 rows** from the S26 approved copy batch are checked byte-for-byte in Arabic and English by `tests/unit/catalog-approved-copy.test.ts` against `tests/fixtures/approved-f16-copy.json`. A mutant changing `catalog.exerciseTitle` failed at `tests/unit/catalog-approved-copy.test.ts:14`.

These seven S27 strings were added after the approved batch and remain DRAFT in both message catalogs:

- `catalog.addExercise`
- `catalog.nextPage`
- `catalog.paginationLabel`
- `catalog.editorScope`
- `catalog.editorGlobalScope`
- `catalog.editorWorkspaceScope`
- `catalog.editorWorkspace`
- `catalog.detailTitle`
- `catalog.detailVersion`
- `catalog.detailWorkspace`
- `catalog.detailVideo`
- `catalog.detailOpenVideo`
- `catalog.detailNoVideo`
- `catalog.detailMergedTo`
- `catalog.editAsNewVersion`
- `catalog.editorErrorTextTooLong`
- `catalog.foodErrorTooLong`
- `catalog.editorSecondaryMuscles`

## Design gate

The design skills catalog was read in full. DESIGN.md and the implemented design tokens/components remain authoritative; no tokens, colors, fonts, dependencies, or motion were introduced. Applied web skills: `frontend-design`, `impeccable`, `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-accessibility`, `better-writing`, `better-interface`, `interface-review`, `emil-design-eng`, and `baseline-ui`. `ui-ux-pro-max` was limited to lookup guidance and did not generate or persist a design system. Other catalog entries were marked not applicable in the S27 run report because they target native apps, animation not requested by the spec, 3D/video, or unrelated product surfaces.

## Visual evidence

Playwright full-page screenshots: `%TEMP%/lifter-s27-f16-library` (16 PNGs: AR/EN × light/dark × 390/1440, list and Add). Axe reported zero violations in those eight runs; keyboard focus was checked on list search and the Add editor.

## RED and mutation evidence

| Check | RED or mutant failure |
| --- | --- |
| T037 route missing before implementation | `tests/unit/exercise-library-page.test.tsx:4` could not resolve the production route module. |
| T039 action missing before implementation | `tests/unit/exercise-library-actions.test.ts:2` could not resolve the server action module. |
| Remove Add role gate | `tests/unit/exercise-library-actions.test.ts:108` failed the generic denial assertion (the malformed client role reached authorization and threw). |
| Allow Trainer global write | `tests/unit/exercise-library-actions.test.ts:88` received `ok` instead of `not_permitted`. |
| Render fixture row in the empty production list | `tests/unit/exercise-library-page.test.tsx:97` found the injected “Barbell Bench Press” fixture. |
| Mark Removed active / three S27-R2 RPC mutants | Not executable: T038 has no RPC because the binding S27-R2 safe-view requirement cannot be met by the merged exercise schema. |
