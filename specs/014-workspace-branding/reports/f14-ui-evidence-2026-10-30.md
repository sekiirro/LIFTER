# F14 Q1 T027/T030–T035 UI evidence — 2026-10-30

## Status

T027, T030 and T031 have green implementation evidence for the published-only registration projection, registration-brand surface and local-only editor presentation. The available RED evidence has limits: T027's recorded unit RED was not a Stack-B integration RED; T030/T031's observed initial RED was module/import resolution while new components were absent, not a behavioral assertion failure. These limitations are recorded below. T032, T033 and T034 remain unchecked because the application has no actual staff published-brand surface, no authorized private draft read/save adapter and no request path to cancel. T035 is partial and remains unchecked: the design-gate render matrix and fallback measurements are recorded, but staff/editor product surfaces and loaded-image geometry are unavailable. No migration, `DESIGN.md`, shared token or shared component was changed.

## Stack B and test environment

Before each database-backed Playwright run, the read-only ownership command was run from the LFTR-014 worktree:

```text
node scripts/supabase-status-safe.mjs --workdir C:\Users\NEW LAP\Desktop\LFTR-014\supabase-stack-b --expected-project-id lifter-stack-b --expected-api-port 25421 --expected-db-port 25422
```

It returned `projectId=lifter-stack-b`, `apiUrl=http://127.0.0.1:25421`, and `dbPort=25422`. The Stack-B selector was `b`; its checked-in config enables Storage. No fresh reset was run for this UI work. The full Stack-B integration run from the preceding F14 checkpoint, after the approved unmodified Vault provisioner, reported 49 passing suites / 1 skipped suite and 1,201 passing tests / 2 skipped / 0 failed. The provisioner was not modified here.

The first Playwright launch exposed an environment-loader gap: its integration fixture had Stack-B aliases, but the Next server did not have `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_ORIGIN`, which `readServerEnv()` requires. The page consequently stayed in the generic invalid state. The corrected launch loaded only the selected Stack-B values in memory, mapped the existing API/key aliases to the app's expected names, and set the app origin to loopback port 3014. No key or raw status/environment output was printed or saved.

## T027 public projection and security-state assertion

The Stack-B fixture published `Published Club` / `#2563EB`, then changed only the draft to `Unpublished Draft` / `#8B5CF6`. Before navigation, the anonymous `registration_link_open` RPC assertion checks that `branding` has exactly the `banner`, `bannerAlt`, `color`, `logo`, and `name` keys; `name` has exactly `ar` and `en`; the returned English name/color and banner-alt values are the published values; and both asset-presence flags are false. The rendered page then asserts it contains no `Unpublished Draft`. This is the version-isolation security-state mutation and its direct Stack-B assertion.

Existing related regression contracts are:

- `tests/integration/registration-links-open.test.ts > all unusable states return identical exact JSON and no opened audit`: malformed, unknown, expired, past-grace and consumed tokens all return `{status:'invalid'}` and create no open audit.
- `tests/integration/branding-render-handle.test.ts > T045 invalid output is byte-identical and publication replacement produces a new binding`: malformed and null tokens serialize exactly as `{"status":"invalid"}`.
- `tests/integration/branding-proxy-resolution.test.ts > T046 Q-M21/22 missing authority/context and swapped token/handle/slot/path deny`: swapped token/handle/slot and a foreign-workspace object path are denied. This test does not assert byte-identical JSON.
- `registration_link_open` accepts only a token, not a workspace selector. Its existing `valid anonymous/concurrent/repeated opens...` test explicitly verifies that a user from workspace B may open a valid workspace A token and receives the same valid result. There is no cross-workspace invalid-output equality case for this token-only RPC; no such coverage is claimed here.

The recorded unit RED for T027 was `npx vitest run tests/unit/branding-registration-page.test.tsx`: before the registration component was wired, 2 tests failed because the page lacked the Premium Centered Card/brand surface; the generic invalid-page contract was also asserted. This is unit RED, not Stack-B integration RED. The B-backed published-vs-draft state mutation and exact anonymous RPC assertion are green. The first B-backed E2E launch later had 12 registration failures from the missing Next server environment described above; this is harness failure, not valid RED evidence. For T030 and T031, the observed initial RED was missing-module/import resolution while the new components were absent; this is an import-resolution RED, not a behavioral assertion RED. The exact initial CLI invocation was not preserved, so none is claimed. The final green command `node_modules/@playwright/test/cli.js test --project chromium --workers=1 tests/e2e/branding-registration.spec.ts tests/e2e/branding-editor.spec.ts` passed 25/25 after the in-memory environment mapping. No database function mutation was performed: Stack B denied `CREATE OR REPLACE` to the `postgres` session with `must be owner of function registration_link_open` because the function owner is `branding_definer`. No grants were changed or elevated.

## Geometry, screenshots and design review

`tests/e2e/branding-registration.spec.ts` records each measured fallback geometry row in [`registration-geometry.json`](../../../tests/integration/evidence/f14-ui/registration-geometry.json). The 12 AR/EN × light/dark × viewport rows measured:

| Viewport | Banner width × height | Form top | Banner bottom | CLS |
| --- | ---: | ---: | ---: | ---: |
| 390 px | 316 × 158 px | 568.58 px | 423.19 px | 0 |
| 768 px | 630 × 288 px | 706.58 px | 561.19 px | 0 |
| 1440 px | 630 × 288 px | 706.58 px | 561.19 px | 0 |

At mobile the measured fallback is exactly 2:1. At tablet and desktop the 288px cap applies to the 630px content width, yielding 2.1875:1. The form remains below the banner in all 12 cases. The screenshot suite verifies the reserved neutral fallback and its localized accessible name; it does **not** verify a decoded image's layout shift. Loaded-image geometry remains blocked because there is no authorized validated-asset fixture or upload adapter. Do not create privileged assets or bypass U03/U04. Recommendation: plan a fixture through the approved upload/validation path before claiming image-specific T030/T035 acceptance.

The focused matrix ran as one Chromium worker at port 3014 with explicit Stack-B environment mapping:

```text
node_modules/@playwright/test/cli.js test --project chromium --workers=1 tests/e2e/branding-registration.spec.ts tests/e2e/branding-editor.spec.ts
```

The final post-fix run passed 25/25 with no skips. It covers 12 real registration-page cases, 12 local-only editor cases and one generic-invalid case. The run generated 29 PNGs under `tests/integration/evidence/f14-ui/` (12 valid registration, 1 invalid registration, 12 editor, 4 mobile preview-state captures) plus `registration-geometry.json`; temporary Playwright artifacts are under `test-results/`. The unrelated full Playwright suite was not run.

Reviewed representatives: `registration-ar-dark-mobile-390.png`, `registration-en-light-tablet-768.png`, `registration-en-dark-desktop-1440.png`, `registration-invalid-en-light-mobile-390.png`, `editor-ar-dark-mobile-390.png`, `editor-ar-light-desktop-1440.png`, `editor-en-light-tablet-768.png`, and `editor-en-dark-mobile-390.png`. The review found the neutral fallback holds its reserved space, the form starts below it, the invalid page stays generic and form-free, the mobile AR sample is localized and right-aligned, inline codes remain readable, and the editor layout changes to its mobile tabs without clipping the sample fields. Axe ran on each editor case, each valid registration case and the invalid registration page with no reported violations. Keyboard assertions cover the mobile Editor/Preview tabs and the preview-surface tabs. No authored motion was added; reduced-motion preference was not separately toggled. No explicit touch-target measurement is claimed.

## Frontend Design Gate checklist

Overall result: **PARTIAL**. The implemented public registration and sample-editor surfaces pass the checks below; missing actual staff/editor product surfaces and loaded-image evidence keep T032–T035 open.

| Criterion | Result | Evidence / limit |
| --- | --- | --- |
| Design authority and tokens | PASS | Registration Premium Centered Card follows `DESIGN.md`; styling uses existing tokens and component-scoped CSS. No shared token, `DESIGN.md`, or shared component changed. `BrandScope` scopes `#2563EB` and preserves semantic success, warning, and error colors. |
| Typography and direction | PASS | Existing Geist / IBM Plex Sans Arabic and type scale; document language/direction is asserted in the AR/EN matrix. Arabic labels and sample names are localized; Latin hex/dimension values use `Bidi` isolation. |
| Layout and responsive geometry | PASS for captured fallback/sample UI; PARTIAL for loaded image | 12 registration geometry rows measure the reserved 2:1 fallback, capped banner and form separation with CLS 0; editor and registration render at 390/768/1440. A decoded, approved banner asset was unavailable, so loaded-image crop/CLS is unverified. |
| Sample brand and contrast | PASS for sample brand/token treatment | Sample brand `#2563EB` is scoped; its light/dark treatments and semantic token preservation are asserted. This does not establish contrast for arbitrary persisted customer brand values. |
| Accessibility, motion and touch | PARTIAL | Axe reported no violations in all 25 E2E cases; keyboard tab assertions and localized accessible names pass. No authored motion exists. Reduced-motion preference was not separately toggled, and touch-target dimensions were not measured. |
| States and surface coverage | PARTIAL | Published-versus-draft isolation, neutral missing-banner fallback and generic invalid-link states pass. Editor controls are local-only samples; the “staff” view is a preview rather than a staff product surface, and no persisted editor or upload flow is implemented. |
| Copy and upload guidance | PASS as DRAFT | New messages are bilingual and marked DRAFT; option C guidance appears only as informational copy. No upload control, persistence, publish action, or final approved copy is claimed. |
| Locale/theme/viewport matrix and screenshots | PASS for recorded matrix | 24 core cases cover AR/EN × light/dark × 390/768/1440 for registration/editor, with four additional mobile preview states and one generic-invalid case. 29 committed PNGs were captured; representative variants spanning each locale, theme, and viewport were reviewed. |
| Tests and size | PASS | Unit: 91 files / 1,641 passed. Focused E2E: 25/25 passed. Lint, typecheck, build, Prettier and diff checks passed. Web bundle: 7,164.98 KiB (1,481.18 KiB gzip); cron: 5.58 KiB (1.96 KiB gzip). The unrelated full Playwright suite was not run. |

## Temporary Playwright screenshot paths

These are the 29 screenshot paths from the final focused run under `test-results/`; `.last-run.json` is test-run metadata, not a screenshot.

```text
test-results/branding-editor-ar-dark-desktop-1440-editor-and-live-preview-chromium/editor-ar-dark-desktop-1440.png
test-results/branding-editor-ar-dark-mobile-390-editor-and-live-preview-chromium/editor-ar-dark-mobile-390.png
test-results/branding-editor-ar-dark-mobile-390-editor-and-live-preview-chromium/editor-preview-ar-dark-mobile-390.png
test-results/branding-editor-ar-dark-tablet-768-editor-and-live-preview-chromium/editor-ar-dark-tablet-768.png
test-results/branding-editor-ar-light-d-5e9da-440-editor-and-live-preview-chromium/editor-ar-light-desktop-1440.png
test-results/branding-editor-ar-light-mobile-390-editor-and-live-preview-chromium/editor-ar-light-mobile-390.png
test-results/branding-editor-ar-light-mobile-390-editor-and-live-preview-chromium/editor-preview-ar-light-mobile-390.png
test-results/branding-editor-ar-light-tablet-768-editor-and-live-preview-chromium/editor-ar-light-tablet-768.png
test-results/branding-editor-en-dark-desktop-1440-editor-and-live-preview-chromium/editor-en-dark-desktop-1440.png
test-results/branding-editor-en-dark-mobile-390-editor-and-live-preview-chromium/editor-en-dark-mobile-390.png
test-results/branding-editor-en-dark-mobile-390-editor-and-live-preview-chromium/editor-preview-en-dark-mobile-390.png
test-results/branding-editor-en-dark-tablet-768-editor-and-live-preview-chromium/editor-en-dark-tablet-768.png
test-results/branding-editor-en-light-d-521f0-440-editor-and-live-preview-chromium/editor-en-light-desktop-1440.png
test-results/branding-editor-en-light-mobile-390-editor-and-live-preview-chromium/editor-en-light-mobile-390.png
test-results/branding-editor-en-light-mobile-390-editor-and-live-preview-chromium/editor-preview-en-light-mobile-390.png
test-results/branding-editor-en-light-tablet-768-editor-and-live-preview-chromium/editor-en-light-tablet-768.png
test-results/branding-registration-ar-d-361bc-ublished-registration-brand-chromium/registration-ar-dark-tablet-768.png
test-results/branding-registration-ar-d-6e5d3-ublished-registration-brand-chromium/registration-ar-dark-mobile-390.png
test-results/branding-registration-ar-d-a9533-ublished-registration-brand-chromium/registration-ar-dark-desktop-1440.png
test-results/branding-registration-ar-l-411c9-ublished-registration-brand-chromium/registration-ar-light-desktop-1440.png
test-results/branding-registration-ar-l-52e71-ublished-registration-brand-chromium/registration-ar-light-tablet-768.png
test-results/branding-registration-ar-l-aa1bd-ublished-registration-brand-chromium/registration-ar-light-mobile-390.png
test-results/branding-registration-en-d-07c77-ublished-registration-brand-chromium/registration-en-dark-mobile-390.png
test-results/branding-registration-en-d-493a5-ublished-registration-brand-chromium/registration-en-dark-desktop-1440.png
test-results/branding-registration-en-d-c6628-ublished-registration-brand-chromium/registration-en-dark-tablet-768.png
test-results/branding-registration-en-l-98366-ublished-registration-brand-chromium/registration-en-light-tablet-768.png
test-results/branding-registration-en-l-a9f4f-ublished-registration-brand-chromium/registration-en-light-desktop-1440.png
test-results/branding-registration-en-l-c5a6b-ublished-registration-brand-chromium/registration-en-light-mobile-390.png
test-results/branding-registration-inva-fbf88-neric-neutral-and-form-free-chromium/registration-invalid-en-light-mobile-390.png
```

## Editor adapter and remaining task decisions

`components/branding/BrandEditor.tsx` is a local-only sample. Its fields update preview state and never save; its “staff” view is a sample preview and not a staff dashboard surface. `lib/branding/service.ts` defines a `BrandingRepository` interface but this branch has no concrete authorized repository/API route or dashboard editor route. `lib/branding/validation.ts` accepts the TypeScript DTO keys `names` / `bannerAltText`, while the persisted SQL contract uses `name` / `bannerAlt`; no approved adapter currently reconciles that shape.

Options for T033:

1. Add a versioned, explicitly scoped draft read/CAS write adapter with contract tests and canonical DTO mapping. **Recommended for a separately scoped implementation.**
2. First approve one canonical draft DTO and reconcile the TypeScript and SQL representations under that contract.
3. Keep the editor sample-only and defer persistence until the adapter and dashboard route are approved. **Recommended for this task.**

T034 only checks that a supplied response tagged with another workspace is discarded. It does not perform cancellation because there is no request path. Add an `AbortController` workspace-switch test after an authorized read adapter exists, or defer that behavior with T033; recommendation is to defer until the adapter is defined.

## Draft copy and DESIGN.md proposal

All new editor and upload-guidance copy remains DRAFT in both locales. This table records each new localization key; strings are reproduced from the locale files.

| Key | English DRAFT | Arabic DRAFT |
| --- | --- | --- |
| `branding.editorTitle` | Workspace branding | علامة مساحة العمل |
| `branding.draftSnapshot` | Draft preview | معاينة المسودة |
| `branding.previewTitle` | Live preview | معاينة مباشرة |
| `branding.editorTab` | Edit branding | تحرير العلامة |
| `branding.previewTab` | Preview | معاينة |
| `branding.localOnly` | Unsaved sample controls update this preview only. Nothing is saved. | تحدّث عناصر العينة غير المحفوظة هذه المعاينة فقط. لا يتم حفظ أي تغيير. |
| `branding.uploadGuidancePrefix` | Draft upload guidance:  | إرشادات تحميل أولية:  |
| `branding.uploadGuidanceFormats` | PNG or WebP | PNG أو WebP |
| `branding.uploadDimensionPrefix` | about  | نحو  |
| `branding.uploadDimensionSuffix` |  px. Keep important content inside a generous center-safe margin; the desktop banner is capped at about  |  بكسل. أبقِ العناصر المهمة داخل هامش آمن واسع في الوسط؛ ويُحدد عرض اللافتة على سطح المكتب بنسبة تقارب  |
| `branding.uploadGuidanceSuffix` | . | . |
| `branding.nameArabic` | Workspace name in Arabic | اسم مساحة العمل بالعربية |
| `branding.nameEnglish` | Workspace name in English | اسم مساحة العمل بالإنجليزية |
| `branding.bannerAltArabic` | Banner description in Arabic | وصف اللافتة بالعربية |
| `branding.bannerAltEnglish` | Banner description in English | وصف اللافتة بالإنجليزية |
| `branding.colorField` | Brand color | لون العلامة |
| `branding.registrationSurface` | Registration | التسجيل |
| `branding.staffSurface` | Staff dashboard | لوحة الفريق |
| `branding.portalSurface` | Client Portal placeholder | معاينة بوابة العميل |
| `branding.colorSource` | Original brand color | لون العلامة الأصلي |
| `branding.colorAdjusted` | Accessible color treatment | معالجة اللون للوضوح |
| `branding.lightTreatment` | Light theme | المظهر الفاتح |
| `branding.darkTreatment` | Dark theme | المظهر الداكن |
| `branding.colorExplanation` | The original color is retained. The preview uses the closest treatment that meets text and focus contrast in each theme. | يظل اللون الأصلي محفوظًا. تستخدم المعاينة المعالجة الأقرب التي تحقق تباين النص والتركيز في كل وضع. |
| `branding.staleRevision` | This draft changed elsewhere. Reload the latest draft before continuing. | تغيّرت هذه المسودة في مكان آخر. أعد تحميل أحدث مسودة قبل المتابعة. |
| `branding.currentPublished` | Currently published | المنشور حاليًا |
| `branding.showcaseNotice` | Sample preview only. Changes are not saved. All branding copy is awaiting review. | معاينة ببيانات تجريبية فقط. لا تُحفظ التغييرات. جميع نصوص العلامة بانتظار المراجعة. |

The bilingual messages are in `lib/i18n/messages/en.ts` and `lib/i18n/messages/ar.ts`; the locale parity test passed. No file upload control, persistence, publish action, or user-approved final copy was added.

Exact proposed addition to `DESIGN.md` (not applied):

> **F14 registration banner.** The Registration Premium Centered Card may show the published banner without text overlays. Use a 2:1 banner with a maximum height of 288px, centered cover crop, and a neutral `--color-card-raised` fallback that keeps the same reserved space and has a localized accessible name. Keep the registration form below the banner. Brand scope must preserve semantic success, warning and error colors. (PO Session 15, Q1 C.)

The PO selection is recorded verbatim in [`banner-prototype.md`](banner-prototype.md); the CSS comment beside the component geometry also cites `F14 banner 2:1, max-height 288px`. The upload guidance remains DRAFT and is not part of this proposal.

## Repository gates and baselines

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 91 files; 1,641 passed, 0 failed, 0 skipped |
| `npm run lint` | PASS — zero diagnostics |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — Next.js 16.4.3; routes compiled successfully |
| `npm run size` | PASS — web 7,164.98 KiB uncompressed / 1,481.18 KiB gzip; cron 5.58 / 1.96 KiB |
| Focused Playwright matrix | PASS — 25 passed, 0 failed, 0 skipped; final unique-manifest teardown clean |
| Prettier / `git diff --check` | PASS — all touched source, report, and geometry JSON files; zero whitespace errors |

Session 14 baseline recorded 77 unit files / 1,524 passed, full Stack-B integration 48 files (47 passed / 1 skipped), 1,184 passed / 0 failed / 2 skipped, and size 7,164.98 / 1,481.18 KiB web plus 5.58 / 1.96 KiB cron. The post-merge full integration checkpoint was 49 passing suites / 1 skipped and 1,201 passed / 2 skipped. Current unit count is 91 files / 1,641 passed; new UI unit coverage accounts for 3 files / 10 tests over the 88-file / 1,631-test merge checkpoint. Size is unchanged from the recorded merge checkpoint.

The evidence directory contains 29 PNG captures (the 24-case AR/EN × light/dark × 390/768/1440 matrix, four additional mobile preview-surface states, and one invalid-link state) plus geometry JSON. Representative screenshots spanning every locale, theme, and viewport were visually reviewed; Arabic samples and isolated Latin/code values render in the intended direction. The invalid-link capture shows only the generic localized failure state with no branding or form.

The initial 25-case run also passed every editor case but skipped 12 registration cases because the app integration environment was not mapped. The next credentialed run failed those 12 cases in the generic invalid state and 13 cases passed; the sanitized error context and environment-presence check identified the missing Next `SUPABASE_*` aliases. The corrected run passed all 25. A subsequent geometry-artifact run had 25 passing tests but the old shared manifest teardown reported ENOENT. The runner was then changed to a per-run UUID manifest propagated through config, server capture and teardown; the final 25-case run ended cleanly with no teardown error.

The runtime does not expose the actual model name or effort tier; both are reported as unavailable.

## Design skills catalog

The complete APPLIES / NOT APPLICABLE table from the full local catalog review follows.

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

**Recommendation:** B, 16:9, because it matches common source imagery and preserves the least crop when the upload is 16:9. Its 588.38px desktop height is the cost; choose C if limiting desktop vertical space outweighs the increased crop risk. This is a recommendation only. **PENDING PO; no final value has been applied.**
