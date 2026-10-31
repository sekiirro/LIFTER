# F14 s17 r3 implementation evidence

## Merge and branch

- Fetched `origin/main` and verified target `87f9b407431f69e358f41f91517c785e510cc871`.
- Merged normally with `--no-ff`; merge commit: `d9cbfe28e01f3ed329b0a57d19d0988579846627` (`merge: main 87f9b40 into 014-workspace-branding (s17)`). No conflicts. `origin/014-workspace-branding` matched this SHA after the merge push.
- Implementation commits: `2d508e379f44206ca5aae531c9bb9e92adc8d824` (R9/R11 DB and integration tests), `bd050e29ccff50efae11c1fad35ac14f2ded1d8c` (Storage CI/zero-skip guard), `5056258c0938e74430771e9085c6f0c78e5083dd` (portal preview UI and browser coverage), and `b0d910dd55e52031a7d06ece051ab090154aa6ea` (touch-dimension reporting without a product threshold).
- The evidence/tracker commit is the final feature commit; its exact SHA and matching pushed ref are reported in the completion message.
- `npm ci`: passed, 670 packages, 0 vulnerabilities.
- Merge baseline after fresh Stack B reset: integration 1,207 passed / 0 failed / 2 skipped; unit 1,648 passed.

## Stack ownership, reset, migration order

Before the Stack B reset/provisioner/integration commands, the read-only ownership proof established `project_id=lifter-stack-b`, API 25421, DB 25422, the 25421–25426 port profile, Storage enabled, and `LIFTER_SUPABASE_STACK=b`. All Supabase CLI commands used the explicit workdir `<worktree>/supabase-stack-b`; no raw status or environment output was printed. Stack A and the protected LFTR checkout were not targeted. The unmodified `tests/integration/client-accounts-provision.mjs` ran with the explicit B selector after ownership verification.

The final fresh Stack B reset exited successfully and applied every migration in the following sorted inventory (60 files, through `20261102150000`):

```text
20261027120000  20261027130000  20261027140000  20261027150000
20261027150100  20261027160000  20261027160100  20261028120000
20261029120000  20261030120000  20261031120000  20261031121000
20261031122000  20261031123000  20261031123500  20261031123600
20261031123700  20261031124000  20261031125000  20261031130000
20261101120000  20261101121000  20261101122000  20261101123000
20261101125000  20261101130000  20261101131000  20261101132000
20261102120000  20261102121000  20261102122000  20261102123000
20261102124000  20261102125000  20261102130000  20261102131000
20261102132000  20261102132100  20261102132200  20261102132300
20261102132400  20261102132500  20261102132600  20261102132700
20261102132800  20261102132900  20261102133000  20261102134000
20261102135000  20261102136000  20261102137000  20261102138000
20261102139000  20261102140000  20261102141000  20261102142000
20261102143000  20261102144000  20261102145000  20261102150000
```

Order verdict: all 28 main migrations end at `20261101132000`; F14 has 32 migrations: 22 through `20261102136000` and 10 forward migrations from `20261102137000` through `20261102150000`. There are 60 unique timestamps, no duplicate or out-of-lane feature migration, and every F14 migration sorts after main.

## RED → GREEN and architecture rulings

### R9 — read path has no writes

- RED: the two new integration cases failed against the old reader: empty read inserted a draft/default fields, and a subsequent initial save did not accept the returned revision.
- GREEN: `20261102138000_branding_draft_read_without_write.sql` returns revision 0 and null fields for an absent draft without inserting. The first save after that read succeeds. Final fresh Stack B integration passed.
- The existing capability, membership, and cross-workspace reader mutations remain green/red as previously accepted by the architect; the migration retains those guards.

### R11 — serialized publish and permanent audit

- RED: T020 compatibility test exposed the absent F14 mapping in the live mapper (expected 1, observed 0); new publish/audit behavior tests were added before the implementation migration.
- GREEN: `20261102139000_workspace_branding_audit_extension.sql` preserves the final F11/F12 mappings, takes a workspace lock, checks expected revision, makes unchanged publish a no-op, and emits one sequence-only event for changed publish. The transaction rolls back if the audit insert fails. Audit rows have no FK to collected versions/assets and contain no bytes, asset URLs, tokens, or authored text.
- Focused regression run: 5 files, 25 passed, 0 failed. It included the F10/F11 audit compatibility tests; no F11-owned file was changed.
- Reversible behavioral mutations, each run separately and restored before continuing:

| Mutation | Failing assertion observed |
| --- | --- |
| Remove workspace publish lock | concurrent publish serialization assertion |
| Skip expected-revision check | stale publish was incorrectly accepted |
| Emit audit for unchanged draft | no-op audit-count assertion |
| Swallow audit insert failure | publish unexpectedly committed instead of rejecting/rolling back |
| Drop an F11 `public.packages` mapping | complete mapping enumeration assertion |
| Add an asset URL to event metadata | audit privacy assertion found the URL |

All six mutations were restored; the unmutated suite passed.

### R12/R13 — F11 coordination and Storage CI

- Added only F14-owned CI contract test/runner paths; existing F11 tests, runners, and migrations are unchanged. Contract tests require the existing pending-client Storage denial test and its result runner. The absence case was recorded RED before the Storage lane was configured; contract tests now pass.
- `.github/workflows/ci.yml` adds a Storage-enabled Stack B job using the existing main workflow pattern and already-used pinned action refs. It checks the B project ID, enables the Storage profile, waits for Storage readiness, runs isolated fixtures and the existing F11 denial test, and rejects any result other than one pass and zero skips.
- Local zero-skip mutation: forced a Storage Playwright case to skip; result parser reported `skipped=1`, `acceptable=false`, and the guard failed as required. The test mutation was restored.
- Hosted CI was not run because the repository is private; repository visibility was not changed.

### R14 — contract and static portal preview

- Contract/placeholder test was RED while the preview module was absent, then GREEN after implementing the static preview.
- The dashboard renders only the published brand contract. The preview has no links, forms, buttons, client behavior, or draft data. It uses existing `Card`, `BrandScope`, `Bidi`, and design tokens.
- Screenshot reviewed: `<temp>/lifter-f14-ui-6052/production-editor-ar-dark-mobile-390.png` (real editor surface with the published-only preview).

## Final gates

| Gate | Result |
| --- | --- |
| `npm ci` | PASS; 670 packages, 0 vulnerabilities |
| Fresh Stack B reset | PASS; 60 migrations applied from scratch |
| Stack B integration | PASS; 54 files passed, 1 skipped; 1,217 passed / 0 failed / 2 skipped |
| Unit | PASS; 95 files passed; 1,654 passed / 0 failed |
| Full Playwright | PASS; 201 tests; 192 passed / 0 failed / 9 skipped |
| Axe | PASS; included in the full Playwright run, no axe violations |
| Lint | PASS |
| Typecheck | PASS |
| Build | PASS |
| Size | PASS; web 7,164.98 KiB uncompressed, 1,481.18 KiB gzip (10.93% of 65,536 KiB); cron 5.58 KiB (0.01%) |
| Prettier | PASS on all touched Prettier-supported files; SQL migrations excluded because Prettier has no SQL parser configured |
| `git diff --check` | PASS |

The integration baseline was 1,207/0/2 and unit baseline was 1,648. Final counts are +10 integration passes and +6 unit passes with no new failures or skips. The 2 integration skips and 9 Playwright skips are unchanged suite skips; the required Storage CI lane separately has a hard zero-skip guard.

## UI and design gate

- Real rendered matrix: Arabic RTL and English LTR × light and dark × 390, 768, and 1440 px, on the production editor, production staff surface, and portal preview. Loaded banner matrix includes all 12 locale/theme/viewport combinations. All screenshots are in OS temp directory `<temp>/lifter-f14-ui-6052`; patterns include `production-editor-*`, `production-staff-*`, `banner-loaded-*`, and `editor-*`. No new PNG was committed. The real production editor Arabic dark mobile screenshot and English light mobile screenshot were visually reviewed; no follow-up visual change was needed.
- Touch measurements for the 8 visible editor controls are written to `<temp>/lifter-f14-ui-6052/touch-targets-{ar,en}-{light,dark}-{mobile-390,tablet-768,desktop-1440}.json`. At all three widths and both themes, observed minimum width was 123.25 px in Arabic and 76 px in English; minimum height was 44 px in both locales. These are reported against a 44×44 CSS px reference only. `DESIGN.md §11 item 4` leaves exact minimum touch size unresolved; no 44 px product rule is encoded in the test.
- Geometry evidence is retained as JSON at `tests/integration/evidence/f14-ui/loaded-banner-geometry.json`: 390 px gives 316×158 (2:1); 768/1440 px gives 630×288 at cap; form starts below banner; CLS is 0. The 12 observations cover AR/EN × light/dark × all three widths.

| Checklist | Result and evidence |
| --- | --- |
| Tokens only; semantic status colors unchanged | PASS — preview uses existing token variables, `BrandScope`/`deriveBrand`; status contrast matrix remains green. |
| Typography and direction | PASS — existing Geist/IBM Plex Sans Arabic; `Bidi` wraps workspace name; AR/EN matrix passes. |
| Spacing, alignment, layout, component consistency | PASS — existing Card and token-based layout; reviewed screenshots at 390/768/1440. |
| Contrast, including sample brand colors in both themes | PASS — existing contrast matrix covers `#FFFF00`, `#111111`, `#2563EB`, `#FF00FF`, light and dark; unit suite passes. |
| Accessibility, keyboard, focus, names, touch, reduced motion, axe | PASS — axe/full Playwright pass; existing controls retain names/focus behavior; reduced-motion emulation is covered; dimensions are recorded at each viewport and compared to 44×44 CSS px as a reference only (minimum observed 76×44 px at English, 123.25×44 px at Arabic); placeholder adds no interactive target. Exact minimum touch size remains unresolved in DESIGN.md §11 item 4. |
| Required states | PASS — existing editor states remain covered; placeholder handles neutral and published-brand values without introducing an interactive flow. |
| Bilingual DRAFT copy and generic security copy | PASS — locale parity and generic security output checks pass; new copy is only in i18n files. |
| Screenshot matrix | PASS — paths listed above; no committed screenshots; visual review completed. |
| Tests, dependencies, bundle budget | PASS — unit, full Playwright, axe, and size pass; no dependency added. |

No unresolved design gap was identified for the static placeholder. No DESIGN.md, token, or shared component changes were made. Proposed DESIGN.md addition for the architect's docs PR: **“2:1, min 8rem (128px), max 18rem (288px)”** per PO Q1 C.

### DRAFT copy additions

- EN `branding.portalPreviewNotice`: “DRAFT: This preview shows published branding only. Client Portal behavior is not included.”
- AR `branding.portalPreviewNotice`: “مسودة: تعرض هذه المعاينة العلامة المنشورة فقط. وظائف بوابة العميل غير متاحة هنا.”
- Existing EN/AR `branding.portalSurface` label is marked DRAFT in both locales. All new UI copy remains DRAFT pending separate approval.

### Design skill catalog

The complete 55-skill catalog was read. Applicable web design skills were used during implementation/self-review; DS/PO authority supersedes any advisory skill suggestion that would add visual effects, tokens, motion, or dependencies. `ui-ux-pro-max` was lookup-only; no generated design system was persisted. The motion skills below were not applicable because the approved UI calls for no motion. The remaining skills do not apply to this Next.js web UI or this static placeholder.

| Skill | Status | Reason |
| --- | --- | --- |
| apple-design | NOT APPLICABLE | Native Apple platform conventions do not govern this web surface. |
| ui-ux-pro-max | APPLIES — lookup only | Used as advisory lookup; Design System and PO decisions remain authoritative. |
| impeccable | APPLIES | Used for craft and restrained visual self-review within the existing system. |
| frontend-design | APPLIES | Applied to the production web surface and component quality review. |
| baseline-ui | APPLIES | Applied to hierarchy, spacing, and responsive UI review. |
| design-dna | NOT APPLICABLE | No new visual identity or system is being defined. |
| genjutsu | NOT APPLICABLE | No creative motion or visual effect is in scope. |
| emil-design-eng | APPLIES | Applied as an implementation/self-review lens within approved patterns. |
| animate | NOT APPLICABLE | No animation is specified or added. |
| animate-expo | NOT APPLICABLE | This is not an Expo app. |
| review-animations | NOT APPLICABLE | No animation is introduced. |
| improve-animations | NOT APPLICABLE | No animation is introduced. |
| find-animation-opportunities | NOT APPLICABLE | No motion opportunity is authorized by the design decision. |
| animation-vocabulary | NOT APPLICABLE | No animation specification is needed. |
| animation-performance | NOT APPLICABLE | No animation code is added. |
| prototype | NOT APPLICABLE | This is production implementation, not a multi-variant prototype. |
| mobile-native | NOT APPLICABLE | The responsive web UI does not use native mobile interaction patterns. |
| pick-ui-library | NOT APPLICABLE | No UI library is selected or added. |
| ask-sonner | NOT APPLICABLE | No toast behavior is added. |
| write-swift | NOT APPLICABLE | No Swift code is involved. |
| break-ui | NOT APPLICABLE | No new stateful interaction is introduced by the static preview. |
| better-ui | APPLIES | Applied to component and interaction consistency review. |
| better-typography | APPLIES | Applied to Arabic/English typography and hierarchy review. |
| better-colors | APPLIES | Applied within the approved token and brand color system. |
| better-accessibility | APPLIES | Applied to keyboard, names, contrast, reduced-motion, and axe review. |
| better-layout | APPLIES | Applied to responsive layout and banner/form geometry review. |
| better-interface | APPLIES | Applied as a cross-discipline review of the changed surface. |
| better-writing | APPLIES | Applied to bilingual DRAFT preview copy. |
| interface-review | APPLIES | Applied as a change-scoped interface review. |
| visual-style-presets | NOT APPLICABLE | No new style preset is authorized. |
| glass-dark-ui | NOT APPLICABLE | No glass treatment is in the approved design system. |
| progressive-blur | NOT APPLICABLE | No blur treatment is specified. |
| motion-design | NOT APPLICABLE | No motion is specified. |
| css-animation | NOT APPLICABLE | No CSS animation is added. |
| remotion-motion-graphics | NOT APPLICABLE | No video composition is involved. |
| gsap-core | NOT APPLICABLE | No GSAP animation is added. |
| threejs-fundamentals | NOT APPLICABLE | No 3D scene is involved. |
| threejs-animation | NOT APPLICABLE | No 3D animation is involved. |
| threejs-geometry | NOT APPLICABLE | No 3D geometry is involved. |
| threejs-interaction | NOT APPLICABLE | No 3D interaction is involved. |
| threejs-lighting | NOT APPLICABLE | No 3D lighting is involved. |
| threejs-loaders | NOT APPLICABLE | No 3D assets are loaded. |
| threejs-materials | NOT APPLICABLE | No 3D materials are involved. |
| threejs-postprocessing | NOT APPLICABLE | No 3D postprocessing is involved. |
| threejs-shaders | NOT APPLICABLE | No shaders are involved. |
| threejs-textures | NOT APPLICABLE | No 3D textures are involved. |
| gsap-frameworks | NOT APPLICABLE | No GSAP framework integration is used. |
| gsap-performance | NOT APPLICABLE | No GSAP code is used. |
| gsap-plugins | NOT APPLICABLE | No GSAP plugin is used. |
| gsap-react | NOT APPLICABLE | No GSAP React animation is used. |
| gsap-scrolltrigger | NOT APPLICABLE | No scroll-triggered animation is added. |
| gsap-timeline | NOT APPLICABLE | No GSAP timeline is added. |
| gsap-utils | NOT APPLICABLE | No GSAP utility is used. |
| lottie | NOT APPLICABLE | No Lottie asset is used. |
| remotion-to-hyperframes | NOT APPLICABLE | No video migration is involved. |

## Remaining unchecked tasks and blockers

- T039 — verified Storage plan allowance/capacity source and approved evidence path are not available; do not assume values.
- T040 — approved recovery artifact path and verified Stack B Storage backup/restore evidence are not available.
- T041 — complete Q-M01–Q-M30 isolated matrix, zero-skips evidence, full state restoration, and hosted CI run IDs remain outstanding.
- T043 — depends on complete T039–T041 production evidence, final hosted Storage lane evidence, and state restoration. These production-only tasks remain unchecked per PO direction.

## Model and effort

Model: GPT-6 runtime family (the runtime does not expose the exact model variant). Effort setting: not exposed by the runtime.
