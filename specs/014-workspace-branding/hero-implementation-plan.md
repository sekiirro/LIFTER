# Production registration hero — implementation plan (chunk 1)

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
  canvas algorithm, measures the luminance behind the card and the bottom edge,
  then writes the existing prototype CSS variables for adaptive dimming/fade.
- Server-side pixel decoding would require new image infrastructure, so it is out
  of scope. The documented fallback is the prototype curve with initial dimming
  `0`; a failed sample leaves the neutral fallback rather than guessing.
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

- Unit-first: layout-mode selection, adaptive-dimming curve/clamping, and LTR
  phone-group contract; record RED then GREEN.
- Port production Playwright assertions only where an existing valid-link fixture
  can run without database changes; otherwise list them for chunk 2.
- Prototype showcase routes, generated fixture art, artwork route, fixture files,
  guidance page, and prototype-only i18n remain dev-only.
