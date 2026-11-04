# S14 Design Gate and Spec/Plan/Tasks Consistency Review

**Scope:** documentation/specification and approved reference assets only. No rendered UI, application code, database, Docker, Supabase, tests, or `.env*` files were accessed or changed. The skills catalog at `C:/Users/NEW LAP/.lifter/design-skills-catalog.md` was read in full. Authority order is DESIGN.md → design-system artifacts/tokens/components → feature specs/decisions → advisory skills. No skill overrides the Design System.

## Skill applicability for this docs/spec-only unit

`APPLIES (downstream)` means the skill is relevant when T032/T033/T035/T039 implement or review rendered UI. Those skills were not used to finalize a visual design in this unit because DESIGN.md §11 leaves required decisions open and its STOP rule applies. No design skill added tokens, components, colors, motion, dependencies, or a UI decision. `NOT APPLICABLE (this unit)` means the requested work has no relevant rendered surface or technology.

| Skill | Status and reason |
| --- | --- |
| apple-design | APPLIES (downstream): optional visual/motion guidance only; no visual decision finalized. |
| ui-ux-pro-max | APPLIES (downstream, lookup/search only): no lookup run because a lookup cannot resolve the explicit PO design gap. Never persist generated systems. |
| impeccable | APPLIES (downstream): interface critique is relevant after the PO resolves layout/consent gaps. |
| frontend-design | APPLIES (downstream): relevant to Terms/Welcome/Builder rendered UI; deferred at the §11 STOP. |
| baseline-ui | APPLIES (downstream): rendered-screen review only; no UI changed. |
| design-dna | NOT APPLICABLE (this unit): no tokens/style/effect system is being defined. |
| genjutsu | NOT APPLICABLE (this unit): no creative-coded or motion system is requested. |
| animate | APPLIES (downstream): N11 requests score feedback; exact motion is not finalized and reduced motion is required. |
| animate-expo | NOT APPLICABLE (this unit): LIFTER is a Next.js web app, not Expo. |
| review-animations | APPLIES (downstream): N11 motion review belongs to the rendered implementation gate. |
| improve-animations | NOT APPLICABLE (this unit): no existing animation code is under review. |
| find-animation-opportunities | NOT APPLICABLE (this unit): no rendered screens are being changed. |
| animation-vocabulary | NOT APPLICABLE (this unit): no animation vocabulary decision is needed now. |
| animation-performance | APPLIES (downstream): only if N11 motion is implemented; no performance claim is made here. |
| prototype | NOT APPLICABLE (this unit): no visual alternatives are authorized while the design gap is open. |
| mobile-native | APPLIES (downstream): mobile browser behavior will be reviewed for the future web flow. |
| pick-ui-library | NOT APPLICABLE (this unit): no library selection is requested or authorized. |
| ask-sonner | NOT APPLICABLE (this unit): no toast implementation is in scope. |
| write-swift | NOT APPLICABLE (this unit): no Swift/native code. |
| break-ui | APPLIES (downstream): worst-case rendered UI review belongs to T039/T024. |
| better-ui | APPLIES (downstream): visual polish guidance; DESIGN.md remains authoritative. |
| better-typography | APPLIES (downstream): future Arabic/English rendered copy review; current font authority is DESIGN.md. |
| better-colors | APPLIES (downstream): future contrast/theming review; token values remain system-owned. |
| better-accessibility | APPLIES (downstream): keyboard, screen reader and input review in the rendered UI gate. |
| better-layout | APPLIES (downstream): layout review is blocked on the card-pattern gap. |
| better-interface | APPLIES (downstream): integrated screen/flow review after implementation. |
| better-writing | APPLIES (downstream): use for UX chrome review; binding Arabic source remains verbatim. |
| interface-review | APPLIES (downstream): review the final rendered change and matrix. |
| emil-design-eng | APPLIES (downstream): craft/motion advice only; no motion values added. |
| visual-style-presets | NOT APPLICABLE (this unit): no new visual direction/preset is allowed. |
| glass-dark-ui | NOT APPLICABLE (this unit): no glass treatment is approved or requested. |
| progressive-blur | NOT APPLICABLE (this unit): no blur effect is approved or requested. |
| motion-design | APPLIES (downstream): motion guidance for N11 only, subordinate to DESIGN.md and reduced-motion preference. |
| css-animation | NOT APPLICABLE (this unit): no self-contained animation demo is requested. |
| remotion-motion-graphics | NOT APPLICABLE (this unit): no video/motion-graphics work. |
| gsap-core | NOT APPLICABLE (this unit): no GSAP motion implementation requested. |
| threejs-fundamentals | NOT APPLICABLE (this unit): no 3D scene. |
| threejs-animation | NOT APPLICABLE (this unit): no 3D animation. |
| threejs-geometry | NOT APPLICABLE (this unit): no generated geometry. |
| threejs-interaction | NOT APPLICABLE (this unit): no 3D interaction. |
| threejs-lighting | NOT APPLICABLE (this unit): no 3D lighting. |
| threejs-loaders | NOT APPLICABLE (this unit): static reference images only; no 3D asset loading. |
| threejs-materials | NOT APPLICABLE (this unit): no 3D materials. |
| threejs-postprocessing | NOT APPLICABLE (this unit): no 3D post-processing. |
| threejs-shaders | NOT APPLICABLE (this unit): no shaders. |
| threejs-textures | NOT APPLICABLE (this unit): no WebGL textures. |
| gsap-frameworks | NOT APPLICABLE (this unit): no Vue/Svelte/GSAP implementation. |
| gsap-performance | NOT APPLICABLE (this unit): no GSAP implementation/performance work. |
| gsap-plugins | NOT APPLICABLE (this unit): no GSAP plugin selection. |
| gsap-react | NOT APPLICABLE (this unit): no GSAP React implementation. |
| gsap-scrolltrigger | NOT APPLICABLE (this unit): no scroll-linked motion. |
| gsap-timeline | NOT APPLICABLE (this unit): no GSAP timeline. |
| gsap-utils | NOT APPLICABLE (this unit): no GSAP utility usage. |
| lottie | NOT APPLICABLE (this unit): no HyperFrames/Lottie embed. |
| remotion-to-hyperframes | NOT APPLICABLE (this unit): no Remotion-to-HyperFrames migration. |

Several applicable design skills have “CONFLICT — PO decision” or locally modified status in the catalog. For any downstream UI conflict, DESIGN.md and the implemented design system win; the PO gap below must be resolved before finalizing the affected UI. No quarantined skill was fetched or used.

## Frontend Design Gate checklist

All checks below are marked **PASS (scope boundary)** because this amendment changes specs/assets and does not add or change rendered UI. Each is a mandatory downstream implementation check in T039/T024; no visual/accessibility pass is claimed.

| Gate | Status and evidence |
| --- | --- |
| Tokens only; workspace brand cannot alter success/warning/error | PASS (scope boundary): no rendered UI or token changes. T039/T024 must prove this. |
| Geist EN / IBM Plex Sans Arabic; hierarchy and Bidi for mixed direction | PASS (scope boundary): no typography/code changed; carry forward DESIGN.md and Bidi requirements. |
| Spacing, layout and existing components | PASS (scope boundary): no layout specified beyond semantics; layout gap is escalated below. |
| Contrast light/dark and workspace brand colors | PASS (scope boundary): no colors selected; rendered contrast matrix remains required. |
| Keyboard, focus, screen reader, touch, reduced motion, axe | PASS (scope boundary): semantics required by spec; actual checks remain T039/T024. |
| Loading, empty, error, success, disabled, pending, interaction states | PASS (scope boundary): no UI state implementation in this unit. |
| Bilingual AR/EN copy and generic security copy | PASS: Arabic fixture bytes equal the canonical extract; English is separately labelled PO review; shared chrome remains for T035. |
| Rendered screenshot matrix | PASS (scope boundary): intentionally not rendered in a docs-only unit; T039/T024 require AR/EN × light/dark × 390/1440px and tablet if layout changes. |
| Tests, axe and `npm run size` | PASS (scope boundary): no UI implementation/tests run; T030/T039/T024 own future test/evidence gates. |

## DESIGN.md §11 defaults recorded by the architect

The architect resolved the design defaults for this implementation plan: Terms Card uses a premium card with existing card/checkbox components; N11 motion uses 150-250ms with `prefers-reduced-motion`; reserved usernames cover platform/system/role words and workspace identifiers. PO S30-PO-1 Q2 approved the T&C wording verbatim; S31-PO-1 Q1 later approved one Arabic consent-sentence replacement. Apply the existing frontend design system; implementation still runs the full Frontend Design Gate.

## Spec ↔ plan ↔ tasks consistency results

- FR-001–FR-039 now have task coverage in `tasks.md`; SC-013 and SC-021 were updated from deferred copy to S14 inventory/byte-equality obligations.
- Plan describes the canonical fixture, all editable question/branch rules, signup extension, consent/Welcome journey, migration floor and Stack D dependency. Tasks T030-T048 map those requirements to disjoint files and DB-free/Stack D lanes.
- T009 no longer waits for the question inventory. T029 and all F15 DB task labels use Stack D; F15 timestamps are `20261104000000+` and must still follow the latest merged F12/F14 migrations.
- Preserved all existing 20/60, 150/1,000 code-point, 4 KiB UTF-8 answer and 256 KiB payload limits; Builder edits always create immutable versions and snapshots.
- S14 flow keeps invitation-only signup and F11 transactional/pending-approval rules; no pre-approval health collection. D-S14-4's Training T01 short text overrides the canonical source's older unsupported-card wording.
- This worktree merges `origin/main` before S14 changes, so F12 registration-approval specifications are present. F13/F14 latest runtime contracts and Stack D still require verification at implementation time; this docs-only rework does not access the database stack.
- **Byte comparison (v2):** extracted canonical range `SECTION 01` through immediately before `FORM BUILDER`, excluding exactly the single Markdown separator newline, was 6,275 bytes; committed fixture was 6,275 bytes; byte-buffer equality returned true and `git diff --no-index --exit-code` returned 0. The unchanged canonical fixture is compared independently of documented P4. P4 is separately recorded as a PO-approved deviation in `fixtures/s14-po-decisions.json`. No original image binaries are committed in v2. PROVENANCE.md retains source paths and SHA-256 values for all 40 originals; derivative generation is a future media task. No YBS T&C assets or design were copied.

## Session-14 PO answers applied

- Body-fat: add sex to Basic; use standard `male` and `female` N12 series, leave `male-cinematic` unused. The AR/EN selector copy is DRAFT pending PO approval.
- Health guidance: S17 supersedes the separate pre-question notice. Use minimal contextual guidance only where genuinely useful; do not add an acknowledgment or consent record.
- Consent point: post-Nutrition Terms Card with unchecked required T&C checkbox, policy version and timestamp; separate optional marketing consent. Signup creates the pending account without T&C consent.
- Maximum meals: 5. N7 is an explicit PO-approved deviation; remove six-plus and exact-number entry while keeping the canonical Arabic source unchanged.
- Reserved usernames and design defaults follow the Architect interpretation appended to the PO decision record.

No decision on goals/options is requested: D-S14-4 settles T01 as short text without choice cards. The 256 KiB submission cap and F11/F12 authorization boundaries are not reopened.

### S17 supersession note (2026-10-30)

Your First Step is the default ordinary editable onboarding form in Forms; previously supplied intake questions are optional editable starter content, not a fixed catalog. Workspace Owners may edit, replace, or select another onboarding form; per-form audience and timing follow Q3=D. The standalone health notice is superseded. Use «عن بياناتك الصحية» / “About your health data” only as minimal contextual guidance where useful. This note corrects forward-looking recommendations and does not alter the historical review evidence.
