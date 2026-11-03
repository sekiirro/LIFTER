# Production registration hero — implementation plan (chunk 1)

## Spec and PO traceability

This plan implements only the F14 Hero requirements FR-026-FR-030 and SC-018-SC-022 in `spec.md`, under S29-PO-3 Q7. The approved visual source is prototype `97debaf`; S20 approval preserves Emerald `#059669`, layout, Apple Liquid Glass treatment, mobile behavior and tokens. S27-PO-1 governs Light/Dark/Follow Device and print theme. S28-PO-4 governs registration fields and age calculation; F15 owns Intake prefill. S21-PO-1 and S28-PO-5 govern approved Glisse use and preservation constraints; S29-PO-1 authorizes continuation of remaining Glisse work. S23-PO-5 governs the no-banner mobile preferences pill.

Every Hero implementation task must carry the matching FR IDs. Existing work without an asserting test remains open; this plan does not treat evidence artifacts or unexecuted suites as completed tasks.

## Scope and production entry point

- Route: `app/register/[token]/page.tsx` (`/register/:token`), valid-link branch only.
- Keep the existing server action, `SignupForm`, F11/F12 validation/submission states,
  public invalid-token response, and `/showcase` production 404 gate unchanged.
- Add a client-side hero leaf component under `components/branding/`; the route
  remains a server component.

## Prototype-to-production map

| Approved prototype (`97debaf`) | Production destination | Treatment |
| --- | --- | --- |
| `app/(dev)/showcase/f14-hero-glass/HeroStage.tsx` | `components/branding/RegistrationHero.tsx` | Port stage, published-banner sampling, resize handling, and CSS variables. |
| `app/(dev)/showcase/f14-hero-glass/HeroGlassCard.tsx` | `components/branding/RegistrationHero.tsx` | Port the physical-right desktop glass card and centered no-banner card. |
| `app/(dev)/showcase/f14-hero-glass/liquid-glass.module.css` | `components/branding/liquid-glass.module.css` | Keep the exact three-class API: `.liquidGlass`, `.liquidGlassStrong`, `.liquidGlassEdge`. |
| `app/(dev)/showcase/f14-hero-glass/page.module.css` | `components/branding/registration-hero.module.css` | Port approved stage/card/fade/dimming rules; adapt selectors to the real form. |
| `app/(dev)/showcase/f14-hero-glass/HeroSignupPreview.tsx` | `app/register/[token]/SignupForm.tsx` + `signup.module.css` | Do not copy the preview. Style the real form only; retain native fields and behavior. |
| `components/branding/RegistrationBrand.tsx` and its CSS module | same production files | Retain the newer locale-name fallback. Let the hero render the published banner once; keep logo/name identity in the card. |
| prototype `BrandEditor.tsx` and `f14Hero.*` i18n keys | none | Guidance/editor fixture copy remains dev-only and is not required by production. |

## Published art and luminance

- When the public projection has a published banner and render handle, the route
  builds the existing opaque `/api/branding/:token/banner?handle=...` URL and
  passes it to the hero. No new storage, database, route, signed URL, or asset is
  introduced.
- The hero samples that same-origin proxy image in the browser with the prototype's
  canvas algorithm. Artwork luminance may adjust the banner scrim and other
  treatments drawn over the artwork to keep them legible; it never selects or
  inverts the registration card theme.
- The card surface, text, and controls follow the resolved theme: Light uses the
  light design tokens, Dark uses the dark tokens, and Follow Device follows
  `prefers-color-scheme`. Print keeps the selected theme, including dark output.
- Sampling is diagnostic and supports the existing legibility fallback when
  artwork cannot be measured. Server-side pixel decoding would require new image
  infrastructure, so it is out of scope.
- Desktop crops the banner toward the left subject; the card remains physically
  right in both AR and EN. Mobile uses the same banner above the card and applies
  the approved 35% bottom fade.

## Layout and no-banner behavior

- `selectHeroLayoutMode` is the tested source of truth:
  banner + desktop => split; banner + mobile => stacked; no banner => centered.
- No published banner: omit art/fallback imagery and center the glass card on
  desktop and tablet; mobile keeps a neutral, non-image card in normal flow.
- Desktop targets 1280x800, 1366x768, 1440x900, and 1536x864 without page scroll.
- The calling-code prefix and national-number input remain one LTR group with one
  `--space-2` gap, including in Arabic.

## Tests and dev-only boundaries

- Unit-first: layout-mode selection, theme-token card contract independent of
  artwork luminance, sampling fallback, and LTR phone-group contract; record RED
  then GREEN. Playwright covers light and dark print output.
- Port production Playwright assertions only where an existing valid-link fixture
  can run without database changes; otherwise list them for chunk 2.
- Prototype showcase routes, generated fixture art, artwork route, fixture files,
  guidance page, and prototype-only i18n remain dev-only.
