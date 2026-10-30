# F14 s16 implementation and design-gate evidence — 2026-10-30

## Scope and result

This evidence covers architect rulings R1–R8 for T027 and T030–T035 on Stack B. The F14 banner decision remains PO s15 Q1 C: image-only 2:1, minimum 8rem (128px), maximum 18rem (288px), centered crop, reserved space before decode, form below, neutral card-raised fallback. The decision stays in `banner-prototype.md`; `DESIGN.md` and shared tokens were not edited. All new user-facing strings listed below remain DRAFT.

T027 and T030–T035 have complete implementation and verification evidence. T030/T031's original pre-component REDs were import-resolution only; the additional behavioral mutation REDs recorded below now test the required assertions directly. The R1 scoped-reader mutations were applied only to the live Stack B function under its existing definer owner, each was killed by an integration assertion, and the checked-in function body was restored after each mutation. No migration file was modified for mutation testing.

## R1 and T027 — persisted DTO, adapter and scoped reader

`lib/branding/repository.ts` uses the caller's authenticated Supabase session client and only the existing `branding_draft_read`, `branding_draft_save`, `branding_upload_begin`, `branding_asset_attach`, and `branding_publish` RPCs. It never uses `service_role`. `rpc-contract.ts` explicitly maps the domain fields `names` / `bannerAltText` to the persisted SQL keys `name` / `bannerAlt`, and back; contract tests detect key drift in either direction. Save and publish send the expected revision, so SQL CAS errors become stale-draft feedback. Empty persisted banner-alt locales are handled as the existing SQL contract permits.

No authorized draft reader existed. The only new migration is `20261102137000_branding_scoped_draft_read.sql`, after F14's previously accepted 136000 migration. It checks the authenticated caller, `manage_branding`, active membership in the requested workspace, and selects only that workspace's current draft/publication. The publication reader returns only current published `name` and `color` to an active member. SECURITY DEFINER ownership, empty search paths, self-only membership policy, restricted execution grants, and PUBLIC invoker wrappers follow the existing lane rules. Architect R1 explicitly approved a new forward reader migration at or after 137000; no prior migration was edited.

The B-backed test `branding-draft-read.test.ts` passes 3/3 after restoring the checked-in definition. It seeds distinct drafts in two workspaces using owner JWT RPCs and proves the requested workspace's draft is returned. Mutations were performed with temporary Stack B-only `CREATE OR REPLACE` calls as `branding_definer`; temporary grants to run the mutations were reverted in the same transaction:

| R1 mutation | RED evidence |
| --- | --- |
| Remove `role_has_capability(..., 'manage_branding')` | 1 test failed: a caller without `manage_branding` unexpectedly read the draft. |
| Remove the active membership check | 2 tests failed: foreign-workspace and revoked-membership reads unexpectedly succeeded. |
| Return a draft from another workspace | 1 test failed: the expected `Draft A`/`Banner A` response contained another workspace's `Elite Center`/`Blue banner` draft. |

The function was restored from the new migration's original definition after each mutation; the normal 3-test suite then passed. Stack B remained the only database target.

## T027 — published-only registration identity

The existing F10 open projection now exposes only the current published identity. The Stack B fixture publishes a brand, changes the draft, then verifies the anonymous open result's exact branding keys and published values; the rendered registration page never contains the unpublished draft identity. Generic invalid states remain byte-identical and form/package snapshots remain untouched. Existing B-backed invalid, consumed, expired and token/version-binding contracts remain green. The original recorded pre-implementation RED was unit-level, not a Stack-B integration RED; this limitation remains explicit.

## T030/T031 and R6 — behavioral RED → GREEN and mutations

The full Playwright suite exposed an actual regression: the workspace brand name was a second semantic heading, breaking the existing AR/EN generic registration-heading contract. Both locale cases failed. Rendering the brand name as styled, non-heading text fixed the issue; the duplicate-signup cases then passed 2/2 and the final full suite passed.

Six required mutations were also run and reverted individually. Each mutation made its targeted assertion fail:

| Mutation | RED evidence before restore |
| --- | --- |
| (a) Put the banner over/inside the form | Loaded-banner E2E failed `form.top >= banner.bottom` (actual form top 394.58px, expected at least 695px). |
| (b) Render unpublished draft identity on registration | Registration unit assertion failed: expected published `Elite Club`, received draft identity. |
| (c) Replace token-proxy `src` with a public storage URL | Registration unit assertions failed because both image URLs no longer used `/api/branding/`. |
| (d) Override semantic success color in `BrandScope` | Registration unit assertion failed because semantic `--color-success` became brand-tinted. |
| (e) Add a History control | Production editor E2E failed the zero-history-controls assertion. |
| (f) Remove stale-revision feedback | Persisted editor E2E failed because the stale alert was absent. |

Each mutation was restored before proceeding. Focused assertion suite evidence is in `branding-registration-ui.test.tsx`, `branding-production-ui.spec.ts`, and `branding-banner-loaded.spec.ts`.

## R2–R5 — actual surfaces, cancellation and approved image fixture

- **T032 / R3:** the current published `name`/`color` is resolved per request on the authenticated staff shell and applied through existing `BrandScope` / `deriveBrand`. No scope gives neutral defaults. Semantic success, warning and error tokens stay unchanged.
- **T033 / R2:** `/branding` is a capability-gated dashboard editor. Server actions call the concrete repository under caller JWT; denied access uses generic denial. The private preview is local, publication display is current-only, and there are no banner text fields or history/restore controls. Save, publish and stale-revision journeys pass on Stack B.
- **T034 / R4:** the draft read route uses an abort signal and request identity. The real-adapter delayed-response E2E switches workspace while the first response is held, then confirms the previous workspace response is discarded and a later explicit switch back remains possible.
- **T030/T035 / R5:** each loaded-image case creates its own banner through the existing registration flow, owner `branding_upload_begin`, JWT staging upload, validator role pipeline (`branding_validation_prepare` → approved test credential → validated bytes upload → `branding_validation_complete`), owner `branding_asset_attach`, save and publish. The fixture uses no privileged asset insert or validation bypass. The unchanged integration provisioner was invoked with `LIFTER_SUPABASE_STACK=b`; Vault material stayed in memory and was never printed.

## Decoded banner geometry

The approved fixture image decodes to **316 × 158px**. Across AR/EN × light/dark, the 12 loaded-image cases produced identical dimensions per viewport, zero CLS and a form below the banner:

| Locale | Theme | Viewport | Rendered banner | Banner bottom | Form top | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| AR | Light | 390px | 316 × 158px | 423.19px | 556.58px | 0 |
| AR | Dark | 390px | 316 × 158px | 423.19px | 556.58px | 0 |
| EN | Light | 390px | 316 × 158px | 423.19px | 556.58px | 0 |
| EN | Dark | 390px | 316 × 158px | 423.19px | 556.58px | 0 |
| AR | Light | 768px | 630 × 288px | 561.19px | 694.58px | 0 |
| AR | Dark | 768px | 630 × 288px | 561.19px | 694.58px | 0 |
| EN | Light | 768px | 630 × 288px | 561.19px | 694.58px | 0 |
| EN | Dark | 768px | 630 × 288px | 561.19px | 694.58px | 0 |
| AR | Light | 1440px | 630 × 288px | 561.19px | 694.58px | 0 |
| AR | Dark | 1440px | 630 × 288px | 561.19px | 694.58px | 0 |
| EN | Light | 1440px | 630 × 288px | 561.19px | 694.58px | 0 |
| EN | Dark | 1440px | 630 × 288px | 561.19px | 694.58px | 0 |

The 390px case renders at 2:1. At 768/1440px the 630px content width reaches the 288px height cap, so the visible ratio is 2.1875:1. The image reserves its box before decode. Geometry output is `tests/integration/evidence/f14-ui/loaded-banner-geometry.json`; proxy assertions record booleans only and do not store or print opaque render URLs.

## Frontend Design Gate

| Check | Result | Evidence |
| --- | --- | --- |
| Design authority / tokens | PASS | Existing tokens and components retained; banner geometry is component-scoped per the explicit Q1 C ruling. No `DESIGN.md`, shared token, or shared component changes. Workspace brand values do not override semantic status colors. |
| Typography / direction | PASS | Geist EN and IBM Plex Sans Arabic AR remain in use; real surfaces assert language/direction. Mixed codes and values use existing `Bidi` isolation. |
| Spacing / alignment / consistency | PASS | Responsive registration, editor and staff screens use existing component patterns; form remains below image. |
| Contrast | PASS | Existing `#2563EB` sample brand is exercised in real light/dark screens. Unit matrix checks `#FFFF00`, `#111111`, `#2563EB`, `#FF00FF` across light/dark text, controls, hover and focus against existing contrast thresholds. |
| Accessibility / keyboard / focus / names | PASS | Axe runs on 24 editor/staff and 12 loaded-banner combinations; keyboard focus assertions pass. Editor controls measure at least 44 × 44 CSS px, the WCAG 2.5.5 reference. |
| Reduced motion | PASS | `prefers-reduced-motion: reduce` is emulated; touched editor and staff descendants have zero animation and transition durations. |
| States | PASS | Editor covers loading, no-workspace, save/publish success, stale, generic denial/error, disabled/pending and interaction states; staff fallback and published states are rendered. |
| Copy | PASS | All six new keys exist in AR/EN message catalogs and locale parity passes. All six additions below are explicitly DRAFT. Generic invalid/security text remains unchanged. |
| Matrix / screenshots | PASS | Real surfaces: AR-RTL/EN-LTR × light/dark × 390/768/1440. 24 editor/staff screenshots and 12 loaded-banner screenshots; representative locale/theme/viewport samples were visually checked after fixing the Arabic fixture. OS-temp examples: `C:\Users\NEW LAP\AppData\Local\Temp\lifter-f14-ui-38196\banner-loaded-ar-dark-desktop-1440.png`, `C:\Users\NEW LAP\AppData\Local\Temp\lifter-f14-ui-38196\production-editor-ar-dark-mobile-390.png`, and `C:\Users\NEW LAP\AppData\Local\Temp\lifter-f14-ui-38196\production-staff-en-light-tablet-768.png`. Committed captures are under `tests/integration/evidence/f14-ui/` (65 PNGs). |
| Tests / dependencies / size | PASS | Full unit, full Playwright and axe pass; no dependency added. Web bundle is 7,164.98 KiB (1,481.18 KiB gzip), 10.93% of the 65,536 KiB cap; cron bundle 5.58 KiB (1.96 KiB gzip). |

The 65 committed screenshots cover the full real-surface matrix; representative AR/EN, light/dark, mobile/tablet/desktop screenshots were visually reviewed against `DESIGN.md` §12. That review caught and fixed mojibake in the Arabic test fixture before the final 38-case F14 matrix. The reviewed set showed no clipping, overlap, unintended direction mirroring, unreserved image space, or brand override of semantic status tokens. No motion effect or new component system was added.

## DRAFT copy additions (new keys only)

| Key | EN — DRAFT | AR — DRAFT |
| --- | --- | --- |
| `branding.saveDraft` | DRAFT: Save draft | مسودة: حفظ المسودة |
| `branding.publishCurrent` | DRAFT: Publish current draft | مسودة: نشر المسودة الحالية |
| `branding.savedDraft` | DRAFT: Draft saved. | مسودة: تم حفظ المسودة. |
| `branding.publishedNotice` | DRAFT: Current branding published. | مسودة: تم نشر العلامة الحالية. |
| `branding.noPublished` | DRAFT: Nothing published yet | مسودة: لم يتم نشر شيء بعد |
| `branding.genericUnavailable` | DRAFT: Branding is unavailable. Try again. | مسودة: العلامة غير متاحة. حاول مرة أخرى. |

No existing Arabic line was rewritten. Locale parity passes.

## Proposed `DESIGN.md` addition (report only; no edit made)

`2:1, min 8rem (128px), max 18rem (288px)`

This is the min-bound addition from architect R8, mapped from PO s15 Q1 C.

## Migration ordering and overlap

All 51 timestamps are sorted below. Main has 28 migrations through 20261101132000; F14 has its lane files 20261102120000–20261102136000 and the architect-approved R1 reader extension at 20261102137000. No duplicate timestamp or non-F14 out-of-lane migration exists. The reader extension is explicitly permitted by the later R1 ruling.

```text
20261027120000 20261027130000 20261027140000 20261027150000 20261027150100 20261027160000 20261027160100
20261028120000 20261029120000 20261030120000
20261031120000 20261031121000 20261031122000 20261031123000 20261031123500 20261031123600 20261031123700 20261031124000 20261031125000 20261031130000
20261101120000 20261101121000 20261101122000 20261101123000 20261101125000 20261101130000 20261101131000 20261101132000
20261102120000 20261102121000 20261102122000 20261102123000 20261102124000 20261102125000 20261102130000 20261102131000 20261102132000 20261102132100 20261102132200 20261102132300 20261102132400 20261102132500 20261102132600 20261102132700 20261102132800 20261102132900 20261102133000 20261102134000 20261102135000 20261102136000 20261102137000
```

Architect's accepted overlap review remains valid: the later F14 `role_has_capability` keeps F12 mappings and adds `manage_branding`; F14's `registration_link_open` wrapper layers 121000 → 135000, while F12 stage 2 replaces neither. No existing migration was edited.

## Stack and test counts

- Ownership was checked before every reset/provisioner/integration/mutation/browser-fixture DB operation. Sanitized proof: Stack `b`, project `lifter-stack-b`, API `127.0.0.1:25421`, DB port `25422`, Storage API running, workdir `C:\Users\NEW LAP\Desktop\LFTR-014\supabase-stack-b`.
- One mistaken read-only `supabase status` probe from the repository root resolved the default Stack A and reported optional stopped services. It performed no start, reset or write; all actual provisioning, resets, mutation tests and integration/browser fixture DB operations were verified on Stack B from its assigned workdir.
- Fresh reset: 51/51 migrations applied, no errors. The unchanged provisioner ran after a separate ownership check from the repository root with `LIFTER_SUPABASE_STACK=b`; the approved Vault fixture printed no credential material.
- Full integration: 52 files passed / 1 skipped; **1,207 passed / 0 failed / 2 skipped**, versus baseline **1,201 / 0 / 2** (+6 tests). The added scoped-reader foreign-draft assertion also passed in the focused 3/3 suite after all mutants were restored.
- Full unit: 93 files passed; **1,648 passed / 0 failed**, versus baseline **1,641** (+7).
- Full Playwright, final clean reset and final test code: **192 passed / 0 failed / 9 skipped** of 201. The nine skips are existing project/test skips; all F14 UI cases ran.
- F14 browser/axe matrix after the Arabic fixture and OS-temp screenshot corrections: **38 passed / 0 failed** (24 real editor/staff cases + 12 decoded-banner cases + two journey tests).
- `npm ci`: PASS (669 packages installed; no dependency declaration or lockfile change). `npm run lint`: PASS; `npm run typecheck`: PASS; `npm test`: 1,648 passed; `npm run build`: PASS; `npm run size`: PASS; touched-file Prettier: PASS; `git diff --check`: PASS.

## Skill catalog review

The whole `C:\Users\NEW LAP\.lifter\design-skills-catalog.md` was read. The Design System/PO Q1 C decision remained authoritative. Skills did not introduce tokens, colors, fonts, motion, dependencies or alternate components.

| Skill | Result | Reason |
| --- | --- | --- |
| `frontend-design` | APPLIES | Implemented the real registration, editor and staff surfaces. |
| `impeccable` | APPLIES | Reviewed hierarchy, responsive details and polish under the approved system. |
| `better-ui` | APPLIES | Applied interaction and state quality to the editor journey. |
| `better-typography` | APPLIES | Preserved approved fonts, hierarchy and Arabic/Latin handling. |
| `better-colors` | APPLIES | Reviewed derived brand treatment and contrast in both modes. |
| `better-layout` | APPLIES | Reviewed responsive banner/form and editor/staff layout. |
| `better-accessibility` | APPLIES | Added keyboard, names, touch, reduced-motion and axe evidence. |
| `better-writing` | APPLIES | Kept all new bilingual copy in explicit DRAFT state. |
| `better-interface` | APPLIES | Reviewed the interaction across product surfaces. |
| `interface-review` | APPLIES | Self-reviewed code changes against rendered real screens. |
| `emil-design-eng` | APPLIES | Reviewed component polish and avoided purposeless motion. |
| `baseline-ui` | APPLIES | Checked hierarchy, spacing and responsive details. |
| `ui-ux-pro-max` | APPLIES — lookup only | Search returned Server Actions for mutations, responsive image fill and root-layout font guidance. Server Actions and existing root typography are used; image fill advice conflicts with Q1 C's reserved 2:1 box, so the PO decision controls. No generated system was written. |
| `apple-design` | NOT APPLICABLE | No Apple platform surface; Design System controls web decisions. |
| `design-dna` | NOT APPLICABLE | No new system tokens or visual effects are authorized. |
| `genjutsu` | NOT APPLICABLE | No creative-code effects are specified. |
| `animate` | NOT APPLICABLE | No animation is specified; reduced-motion behavior was checked. |
| `animate-expo` | NOT APPLICABLE | Native Expo only; this is Next.js web. |
| `review-animations` | NOT APPLICABLE | No authored animations were added. |
| `improve-animations` | NOT APPLICABLE | No motion system is in scope. |
| `find-animation-opportunities` | NOT APPLICABLE | No new motion is called for by the spec or PO. |
| `animation-vocabulary` | NOT APPLICABLE | No motion pattern was requested. |
| `animation-performance` | NOT APPLICABLE | No animation implementation exists to tune. |
| `prototype` | NOT APPLICABLE | PO already selected option C; no alternative picker is needed. |
| `mobile-native` | NOT APPLICABLE | No PWA/native-browser behavior change is specified. |
| `pick-ui-library` | NOT APPLICABLE | Existing components cover the UI; no library choice is needed. |
| `ask-sonner` | NOT APPLICABLE | No Sonner integration is requested. |
| `write-swift` | NOT APPLICABLE | Swift only. |
| `break-ui` | NOT APPLICABLE | Scope is the specified feature contracts and dimensions, with adversarial cases covered by explicit mutations. |
| `visual-style-presets` | NOT APPLICABLE | Existing Design System and PO decision define the style. |
| `glass-dark-ui` | NOT APPLICABLE | Glass treatment is not approved or specified. |
| `progressive-blur` | NOT APPLICABLE | Blur is not part of the approved banner/editor design. |
| `motion-design` | NOT APPLICABLE | No motion is specified. |
| `css-animation` | NOT APPLICABLE | No CSS animation is specified. |
| `remotion-motion-graphics` | NOT APPLICABLE | Video graphics workflow only. |
| `gsap-core` | NOT APPLICABLE | GSAP is not used or needed. |
| `threejs-fundamentals` | NOT APPLICABLE | No Three.js scene is specified. |
| `threejs-animation` | NOT APPLICABLE | No Three.js scene or animation. |
| `threejs-geometry` | NOT APPLICABLE | No custom 3D geometry. |
| `threejs-interaction` | NOT APPLICABLE | No 3D interaction. |
| `threejs-lighting` | NOT APPLICABLE | No 3D lighting. |
| `threejs-loaders` | NOT APPLICABLE | Banner image uses the existing validated proxy, not a 3D loader. |
| `threejs-materials` | NOT APPLICABLE | No 3D material system. |
| `threejs-postprocessing` | NOT APPLICABLE | No postprocessing. |
| `threejs-shaders` | NOT APPLICABLE | No shader effects. |
| `threejs-textures` | NOT APPLICABLE | No Three.js textures. |
| `gsap-frameworks` | NOT APPLICABLE | No GSAP or non-React framework. |
| `gsap-performance` | NOT APPLICABLE | No GSAP animation. |
| `gsap-plugins` | NOT APPLICABLE | No GSAP plugins. |
| `gsap-react` | NOT APPLICABLE | No GSAP animation. |
| `gsap-scrolltrigger` | NOT APPLICABLE | No scroll-linked motion. |
| `gsap-timeline` | NOT APPLICABLE | No animation timeline. |
| `gsap-utils` | NOT APPLICABLE | No GSAP utilities. |
| `lottie` | NOT APPLICABLE | No Lottie or HyperFrames use. |
| `remotion-to-hyperframes` | NOT APPLICABLE | No Remotion migration or HyperFrames composition. |

The `ui-ux-pro-max` lookup did not override the approved banner sizing: Q1 C requires a reserved 2:1 box before image decode, so component CSS and intrinsic dimensions remain the implementation.

## Remaining unchecked F14 tasks

| Task | Blocker |
| --- | --- |
| T004 | Requires coordination with F11 owners on runner restoration and pending-client Storage denials. |
| T019 | F14 publication audit transaction depends on the final merged F11 audit function in T022. |
| T020 | Audit compatibility test depends on T022's final F11 audit mapping. |
| T021 | Permanent audit-retention behavior depends on T022's publication/audit implementation. |
| T022 | F11's final audit function and review fixes are not yet in the merged base; must extend after every F11 migration. |
| T023 | Serialized publish/audit transaction depends on T022. |
| T037 | F11-owned pending-client Storage denials and isolated-runner assumptions need owner coordination. |
| T038 | Required Storage CI lane and T037 F11 denial coverage are not complete. |
| T039 | Verified Storage allowance and benchmark/capacity evidence are still absent. |
| T040 | Approved Storage backup/restore evidence path and successful recovery proof are absent. |
| T041 | Complete Q-M01–Q-M30 isolated Stack B matrix, zero skipped Storage checks and CI run IDs remain outstanding. |
| T042 | UI placeholder is deferred to U08; no P4/client-portal behavior is authorized. |
| T043 | Final F11 reconciliation and T037–T041 release evidence remain prerequisites. |

No design gap in T027/T030–T035 required escalation. The feature remains blocked from production approval by the independent F11 audit, Storage CI, capacity and recovery tasks above.
