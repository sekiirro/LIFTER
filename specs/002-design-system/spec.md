# Feature Specification: Design System Foundation (P0-F2)

**Feature Branch**: `002-design-system`
**Created**: 2026-10-27
**Status**: Draft
**Input**: User description: "P0-F2 Design System foundation: tokens for dark/light modes, emerald brand with accessible variants, semantic colors, workspace brand override with contrast guard, device-first theme with persisted manual choice, AR-first RTL + EN LTR, Geist + IBM Plex Sans Arabic, accessible base components and states, responsive app shell (desktop icon rail, mobile bottom bar) with Trainer/Client nav only, reduced motion, dev-only showcase, Arabic browser print spike. Constitution amendment lime → emerald."

**Merged scope clarification (PR #28)**: The PO-approved Glisse work merged on `main` as PR #28 at `12bcad944c9366f17afc00a36bd14586c5f2e77a`. This spec delta describes only the shipped floating surfaces, Glisse enhancement/fallback behavior, and accessible floating actions/popover menu evidenced by that PR and PO records S21-PO-1/2/6, S26-PO-4, S27-PO-1, and S28-PO-1/2. It does not extend Liquid Glass to dense data, forms, or financial content.

Governing documents: [DESIGN.md](../../DESIGN.md) (PO-approved design reference, 2026-10-27; supersedes earlier design assumptions), Constitution v1.0.0 → v1.1.0 (this feature), [Architecture v3](../../docs/02-architecture.md), [Roadmap P0](../../docs/03-roadmap.md), [Assessment](../../docs/00-assessment.md) (Arabic print spike in P0-F2).

## User Scenarios & Testing *(mandatory)*

Actors: **End user** (any future role viewing LIFTER UI), **Feature implementer** (builds later screens on this system), **Reviewer** (Claude), **Product Owner**.

### User Story 1 - Consistent themed, bilingual foundation (Priority: P1)

Every page renders with LIFTER's design tokens in dark or light mode, in Arabic (RTL, default) or English (LTR), with correct fonts and no flash of the wrong theme or direction.

**Why this priority**: Constitution VIII requires all UI to build on the Design System; every later feature depends on it.

**Independent Test**: Open the showcase in a browser whose device preference is dark, then light; switch theme manually and reload; switch language AR↔EN and reload.

**Acceptance Scenarios**:

1. **Given** a first visit with no saved choice, **When** the device prefers dark (or light), **Then** the page renders in that mode from the first paint.
2. **Given** the user selects a theme manually, **When** the page is reloaded or reopened, **Then** the manual choice is kept regardless of the device setting, and the user can return to "follow device".
3. **Given** no saved language, **When** a page loads, **Then** it renders in Arabic with right-to-left direction and the Arabic font; **When** English is selected, **Then** it renders left-to-right with the English font, and the choice persists.
4. **Given** Arabic mode, **When** numbers, measurements, codes or Latin identifiers appear inline, **Then** they keep their own reading order and are not mirrored.
5. **Given** trainer-authored or other user content, **When** displayed, **Then** it appears exactly as authored, never machine-translated.

---

### User Story 2 - Brand and workspace colors with guaranteed legibility (Priority: P1)

LIFTER's emerald (`#059669`) is the default brand. A workspace brand color can replace it at runtime. Semantic success/warning/error colors stay independent of any brand. Text and controls on brand surfaces always meet contrast requirements.

**Why this priority**: DESIGN.md §2 makes workspace customization and contrast mandatory; P1 workspace branding builds on this.

**Independent Test**: Render the showcase with the default brand and with several sample workspace colors (very light, very dark, saturated, the emerald itself), and check the contrast reports in both modes.

**Acceptance Scenarios**:

1. **Given** the default brand, **When** a primary button renders, **Then** its label contrast is at least 4.5:1 in both modes (the raw `#059669` with small white text, ~3.77:1, is not used for small text).
2. **Given** any valid workspace brand color, **When** applied, **Then** primary actions, active navigation and focus indicators use derived variants that meet the contrast targets in both modes, or fall back to an accessible variant automatically.
3. **Given** any workspace brand color, **When** success, warning or error feedback renders, **Then** its colors are unchanged by the brand.
4. **Given** an invalid brand value, **When** applied, **Then** the default LIFTER brand is used and nothing breaks.

---

### User Story 3 - Accessible base components and feedback states (Priority: P1)

Implementers have shared components: buttons, form fields, cards, confirmation dialog, loading skeleton, empty / no-results / error-with-retry states, transient success toast and persistent alert. They work by keyboard and screen reader in both languages and modes.

**Why this priority**: Prevents per-screen drift and makes accessibility the default (Constitution VIII, DESIGN.md §4).

**Independent Test**: Navigate the showcase by keyboard only and with automated accessibility checks, in AR and EN, dark and light.

**Acceptance Scenarios**:

1. **Given** a button, **When** hovered, focused, disabled or waiting, **Then** each state is visually distinct, focus is visible, a waiting button can't be activated twice and announces that it is busy.
2. **Given** a form field with an error, **When** rendered, **Then** the label sits above the field, the error message is visible in plain language and programmatically tied to the field.
3. **Given** a confirmation dialog, **When** opened, **Then** focus moves into it, stays inside until closed, Escape closes it, and focus returns to the trigger.
4. **Given** the state components, **When** shown, **Then** "no data", "search returned nothing" and "an error occurred" are visibly different, and the error state offers retry.
5. **Given** a non-critical success, **When** reported, **Then** a toast appears and is announced without stealing focus; an important problem uses a persistent alert instead.
6. **Given** the device requests reduced motion, **When** any transition would run, **Then** it is removed or minimized; otherwise transitions take about 150–250 ms and never block interaction.

---

### User Story 4 - Responsive app shell with role navigation (Priority: P2)

On wide screens, a compact vertical icon rail shows each section's name on hover and on keyboard focus. On narrow screens, a bottom bar shows icons with visible labels plus "More". Trainer and Client navigation follow the approved order. The shell mirrors correctly in Arabic.

**Why this priority**: DESIGN.md §5 fixes navigation patterns; later role screens plug into it.

**Independent Test**: View the shell demo at desktop and mobile widths, as Trainer and as Client, in AR and EN.

**Acceptance Scenarios**:

1. **Given** a wide viewport, **When** the vertical Liquid Glass sidebar renders, **Then** it is positioned at inline-start with icons only by default; when an item receives pointer hover or keyboard focus, its name appears in a tooltip, and every item has an accessible name.
2. **Given** a narrow viewport, **When** the Trainer shell renders, **Then** the bottom bar is Home, Clients, Workout, Nutrition, More, with visible labels and nothing that needs hover.
3. **Given** a narrow viewport, **When** the Client shell renders, **Then** the bottom bar is Home, Workout, Nutrition, Progress, More.
4. **Given** Arabic, **When** the shell renders, **Then** the rail sits on the right side, and the bar order and directional icons follow RTL.
5. **Given** Platform Owner, Workspace Owner or Sales, **When** navigation is requested, **Then** no tab set is defined; the system reports it as an open decision instead of inventing one.

---

### User Story 5 - Arabic browser print spike (Priority: P3)

A sample bilingual page printed through the browser to PDF shows correctly shaped Arabic, RTL layout, readable tables and numbers. The result is recorded as a report for the P3 export work.

**Why this priority**: Architecture v3 chose browser-side print-to-PDF; the Assessment schedules this spike in P0-F2.

**Independent Test**: Open the print sample, print to PDF from a Chromium browser, inspect the output, and read the recorded findings.

**Acceptance Scenarios**:

1. **Given** the print sample, **When** printed to PDF, **Then** Arabic letters join correctly, direction is RTL, mixed Arabic/Latin/number runs read correctly, and screen-only chrome (navigation, theme controls) is hidden.
2. **Given** the spike, **When** finished, **Then** a findings report states what worked, what failed and what remains for the booklet design (which is not built here).

---

### User Story 6 - Selective floating Liquid Glass surfaces (Priority: P2)

Users see the approved Glisse Liquid Glass treatment on the floating navigation surfaces and floating action/menu surfaces shipped in PR #28. Dense data, forms and financial content remain mostly solid. Where device capability or display preferences do not support the enhancement, the surfaces remain usable with a static fallback.

**Why this priority**: It records the already merged, PO-approved design-system extension without broadening its approved surface area (S21-PO-1/2/6; PR #28; S28-PO-1/2).

**Independent Test**: Inspect the floating navigation and action/menu surfaces in an eligible browser and in static-fallback conditions; operate the menu with keyboard input and confirm focus remains on the same control when enhancement starts or falls back.

**Acceptance Scenarios**:

1. **Given** the Trainer or Client shell, **When** it renders at a narrow viewport, **Then** the mobile bottom navigation is presented as the shipped floating capsule; when it renders at a wide viewport, **Then** a vertical Liquid Glass sidebar is presented at inline-start, with icons only by default and each icon name available in a tooltip on pointer hover and keyboard focus.
2. **Given** a supported browser and preferences that permit refraction, **When** the deferred enhancement initializes, **Then** the floating surface reports the enhanced runtime while its focused navigation node remains the same node.
3. **Given** unsupported backdrop filtering, reduced transparency, increased contrast, forced colors, reduced motion, constrained-device state, an explicit solid fallback, or an initialization over-budget condition, **When** a glass surface is rendered or initialization is attempted, **Then** it uses the static/solid fallback and remains operable.
4. **Given** a floating action or popover menu, **When** the user opens and navigates the menu by keyboard, **Then** the menu trigger exposes its expanded state, focus follows the supported arrow/Home/End controls, Space activates the focused item, Escape restores trigger focus, and Tab closes the menu without trapping focus.
5. **Given** dense data, forms, or financial content, **When** the approved glass surfaces are used in the feature, **Then** those content areas remain mostly solid.

**Clarifications**

- Decision record: S21-PO-1/2/6, S26-PO-4, S27-PO-1, S28-PO-1/2, S30-PO-8 Q16; implementation evidence: PR #28 body and merged commits, including final approved SHA `12bcad944c9366f17afc00a36bd14586c5f2e77a`; design reference: DESIGN.md §10 log, §12 review criteria, and the approved Liquid Glass addition under “Public Hero.”
- Source quotations: S21-PO-1: “Keep dense data, forms, and financial content mostly solid.” S21-PO-2: “Floating + real refraction” on floating surfaces, with “solid fallback.” S21-PO-6: “before any PR, TBT must be within +50 ms of baseline”; it also approved “Floating action buttons” and “Menus & popovers,” while the “Desktop rail stays solid.” DESIGN.md §10 records the trainer/client mobile navigation order; DESIGN.md §12 requires contrast, focus, screen-reader, and reduced-motion review. The PR #28 body describes “Deferred Glisse refraction” on capable devices and static fallback for constrained, reduced-transparency, increased-contrast, and forced-colors cases. S26-PO-4 says “approve merges separately by exact SHA.” S27-PO-1 requires rerun CI and CodeRabbit and exact-SHA approval if the head changes. S28-PO-1 states “PR #28 Merge Approved from me”; S28-PO-2 pins approval to exact SHA `12bcad9` and requires post-merge checks and main CI.
- Q16 (S30-PO-8, verbatim): "Q16: The intended and approved desktop navigation design is a VERTICAL LIQUID GLASS SIDEBAR, NOT a bottom dock. Requirements: Liquid Glass appearance. Positioned on the side of the screen. Icons only by default, maximizing available navigation items. Show each icon's name in a tooltip on mouse hover and keyboard focus. Preserve the approved glass visual style. Do not interpret my approval of PR #28 as approval of a bottom dock. Record this correction in the specs, identify any implementation deviations, and route necessary fixes through normal review gates. No merges without exact-SHA approval." The existing implementation positions the rail at inline-start (`components/shell/AppShell.module.css:13-20`); that layout rule determines its logical side and mirrors by document direction.
- Zero open ambiguities remain for the PR #28 and Q16 requirements recorded here; the logical side is established by the existing inline-start implementation. Existing plan NEEDS DECISION items remain unchanged and outside this delta.

---

### Edge Cases

- Storage unavailable (private mode, blocked cookies): theme follows the device and language defaults to Arabic; nothing errors.
- Device preference changes while the page is open and no manual choice is saved: the page follows the change.
- Fonts fail to load: fallbacks keep text legible and Arabic shaped.
- Very long Arabic or English labels in buttons, rail tooltips and bottom bar: wrap or truncate with the full name still available to assistive technology.
- Browser zoom to 200%: content stays usable without horizontal page scroll at mobile width.
- Workspace brand equals a semantic color (e.g., red): semantic error remains distinguishable by icon and text, not color alone.
- JavaScript disabled or slow: initial theme and direction are still correct on first paint.

## Requirements *(mandatory)*

### Functional Requirements

**Tokens & theming**

- **FR-001**: The system MUST define a single set of named design tokens (color, surface, border, text, focus, radius, spacing, typography, elevation, motion) with dark and light values; components MUST use tokens, not raw values.
- **FR-002**: Surfaces MUST follow DESIGN.md §2: dark = neutral black/charcoal, light = very light neutral gray with white cards; the sample values there are starting points, and final values are recorded with contrast evidence.
- **FR-003**: The default brand MUST be emerald `#059669`. Brand-dependent uses (primary action fill, active nav, focus ring, links) MUST use derived variants that meet WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text, UI components and focus indicators, in each mode.
- **FR-004**: Success, warning, error and info colors MUST be independent of the brand and meet the same contrast targets in both modes.
- **FR-005**: A workspace brand color MUST be applicable at runtime to a page subtree. The system MUST validate it, derive variants per mode, and automatically use an accessible variant when the raw color fails a target. Invalid input falls back to the default brand.
- **FR-006**: First visit MUST follow the device theme. A manual choice (dark, light, or follow device) MUST persist across reloads, and the correct theme MUST apply before first paint.
- **FR-007**: Radii MUST be in the approved ranges (cards ~12–16 px, buttons ~8–10 px), with surfaces "luxurious and soft": subtle borders and low-intensity shadows.

**Language & direction**

- **FR-008**: Arabic MUST be the default language with right-to-left direction. English MUST be available left-to-right. The document language and direction MUST be correct on first paint, and the user's choice MUST persist.
- **FR-009**: Layout MUST mirror by direction using direction-relative positioning. Inherently directional icons (back/forward, chevrons) MUST mirror; non-directional icons, numbers, charts, codes and Latin data MUST NOT be blindly mirrored.
- **FR-010**: Inline numbers, measurements and Latin identifiers inside Arabic text MUST be isolated so they keep their reading order.
- **FR-011**: UI strings MUST come from per-language message catalogs for AR and EN, with a check that both catalogs contain the same keys. Authored content MUST be rendered as authored.

**Typography & icons**

- **FR-012**: English text MUST use Geist and Arabic text IBM Plex Sans Arabic, self-hosted, with system fallbacks. Display fonts (Inter Black, The Year of the Camel) MUST NOT be included in this feature.
- **FR-013**: Icons MUST be a simple, consistent outline style. Icon-only controls MUST have an accessible name.

**Components & states**

- **FR-014**: Button: primary (brand), secondary (quiet) and destructive variants; hover, focus-visible, disabled and loading states; loading prevents repeat activation and announces busy.
- **FR-015**: Field: persistent label above the input, optional hint, error message tied to the input, invalid state exposed to assistive technology, visible focus.
- **FR-016**: Card and surface primitives using the token radii, borders and elevation.
- **FR-017**: Confirmation dialog with focus trap, Escape to close, focus return and labelled title. It is for confirmations of dangerous actions; plan publishing is explicitly exempt from confirmation (DESIGN.md §4, §7).
- **FR-018**: State components: context-shaped loading skeleton, empty ("no data"), no-results ("search returned nothing"), and error with retry, each with distinct visuals and copy.
- **FR-019**: Toast for non-critical success (announced politely, auto-dismissed, never the only report of a failure) and a persistent alert for important problems.
- **FR-020**: Transitions MUST be about 150–250 ms and MUST be removed or minimized when the device requests reduced motion.

**App shell**

- **FR-021**: Wide layout MUST show a vertical Liquid Glass sidebar at inline-start, with icons only by default and each icon name in a tooltip on pointer hover and keyboard focus. Narrow layout: bottom bar with icons and visible labels, plus "More". Breakpoints adapt to available width; the numeric breakpoint values are provisional and marked as an open item.
- **FR-022**: Navigation configuration MUST be data-driven per role. Only Trainer (Home, Clients, Workout, Nutrition, More) and Client (Home, Workout, Nutrition, Progress, More) are defined. Other roles MUST be left undefined with an explicit open-decision marker. The shell is presentational only: it is not a permission boundary and contains no authorization logic.

**Showcase & spike**

- **FR-023**: A showcase route MUST demonstrate every token group, component, state and the shell in AR/EN and dark/light with sample brand colors. It MUST be unavailable in production builds.
- **FR-024**: A print sample MUST demonstrate RTL print styling (screen chrome hidden, Arabic shaping, a table, mixed-direction numbers). A findings report MUST be committed with the feature.

**Governance**

- **FR-025**: Constitution Principle VIII and Architecture v3's UI row MUST be updated from "lime accent" to the approved emerald brand with workspace-customizable colors, with a decision-register entry and a version bump, pending PO approval at merge.
- **FR-026**: Open items from DESIGN.md §11 touched by this feature (secondary token values beyond what is verified, final icon library, breakpoint numbers, minimum touch-target size, other roles' tabs, Arabic vs. Western digit shapes) MUST be listed as NEEDS DECISION in the plan, with no invented values presented as approved.
- **FR-027**: The design system MUST provide the floating mobile navigation capsule, the vertical Liquid Glass desktop sidebar required by S30-PO-8 Q16, floating action surfaces, and popover menu. Q16 supersedes the prior PR #28 desktop-dock wording; dense data, forms, and financial content remain mostly solid. [S21-PO-1/2/6; PR #28; S28-PO-1/2]
- **FR-028**: Glisse refraction MUST be deferred and MUST use a static/solid fallback when browser capability, user display preferences, constrained-device conditions, explicit fallback selection, or the shipped initialization budget prevents enhancement. The fallback MUST preserve keyboard operation and focused-node identity. [S21-PO-2/6; PR #28]
- **FR-029**: The shipped floating popover menu MUST expose an accessible trigger and support the tested keyboard behavior: ArrowUp/ArrowDown initial focus and movement, Home/End, Space activation, Escape focus restoration, and Tab close without focus trapping. [S21-PO-1/2/6; PR #28]

### Key Entities

- **Design token**: named value with dark and light variants and a category; brand-dependent tokens are derived from a brand color.
- **Brand color**: a validated color (default `#059669`) plus its derived per-mode variants and contrast results.
- **Theme preference**: dark | light | follow-device, stored per browser.
- **Language preference**: ar | en, stored per browser; determines direction.
- **Navigation config**: per-role ordered list of sections (key, label key, icon); defined for Trainer and Client only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of brand, semantic and text token pairs used by components meet their WCAG 2.2 AA contrast target in both modes, verified by an automated test, for the default brand and at least 8 sample workspace colors.
- **SC-002**: 0 automated accessibility violations (serious or critical) on the showcase in each of the 4 combinations: AR/EN × dark/light.
- **SC-003**: Every interactive component in the showcase can be reached and operated by keyboard alone, with visible focus, in both directions.
- **SC-004**: 0 frames with the wrong theme or direction on first load across the 4 combinations, with storage both present and blocked.
- **SC-005**: AR and EN message catalogs have 100% matching keys.
- **SC-006**: The print spike's report covers shaping, direction, mixed numbers, tables and hidden chrome, each marked pass or fail with evidence.
- **SC-007**: The edge build stays within the free-tier size limit, with headroom reported.
- **SC-008**: Across 15 interleaved paired TBT samples per arm, the median desktop and mobile TBT difference for the Glass change is no greater than +50 ms versus baseline. [S21-PO-6; PR #28 body]
- **SC-009**: Automated capability/preference tests reject refraction for every listed unsupported or fallback condition, and a browser test confirms an over-budget initialization falls back without replacing the focused navigation node. [PR #28]
- **SC-010**: At wide viewport, the desktop navigation is a vertical Liquid Glass sidebar at inline-start; icons are the only default visible navigation content; each icon name is exposed in a tooltip on pointer hover and keyboard focus. [S30-PO-8 Q16]

## Assumptions

- No authentication, tenancy or real data exist yet (F3/F4). Role selection in the shell demo is a showcase control, not a security feature.
- Language and theme preferences are stored per browser until user accounts exist; moving them to the account is later work.
- Workspace branding management (preview/publish) is P1; this feature provides only the runtime mechanism and contrast guard.
- Digit shapes: numbers are rendered as stored, with no conversion between Arabic-Indic and Western digits, until the PO decides (open item).
- Print/booklet design, planners, calculator, dashboards, tables/data grids and charts are later features; only the base primitives here.
- The final icon library is open; a small set of outline icons sufficient for the shell and components is used, replaceable later without changing the component API.
