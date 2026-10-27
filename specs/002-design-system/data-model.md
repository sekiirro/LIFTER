# Data Model: P0-F2 (client/config only; no database)

| Entity | Shape | Rules |
|---|---|---|
| `ThemePreference` | `'dark' \| 'light' \| 'system'` | Cookie `lifter_theme` holds `dark` or `light`. `system` = cookie absent. Any other value → `system`. |
| `Locale` | `'ar' \| 'en'` | Cookie `lifter_locale`. Missing or invalid → `ar`. `dir = ar ? 'rtl' : 'ltr'`. |
| `Hex` | `#RRGGBB` (case-insensitive; `#RGB` accepted and expanded) | Anything else is invalid → default brand `#059669` |
| `BrandVariants` | `{ light: ModeBrand, dark: ModeBrand, source: Hex, adjusted: boolean }` | Pure output of `deriveBrand(hex, surfaces)` |
| `ModeBrand` | `{ fill, onFill, text, ring, fillHover }` | contrast(fill, onFill) ≥ 4.5; contrast(text, bg) and contrast(text, card) ≥ 4.5; contrast(ring, bg) ≥ 3. `fillHover` differs visibly and keeps contrast(fillHover, onFill) ≥ 4.5. |
| `ModeTokens` | `{ bg, card, cardRaised, border, borderStrong, text, textMuted, textDisabled?, overlay, success{fg,bg,border}, warning{…}, error{…}, info{…} }` | text and textMuted ≥ 4.5 on bg and card. Semantic fg ≥ 4.5 on its bg and on card. borderStrong (input borders) ≥ 3 on card. textDisabled is exempt (disabled controls; WCAG 1.4.3 exception). |
| `ScaleTokens` | radius `{ sm 6, button 8–10, card 12–16, full }`, spacing 4-px scale, font sizes, line heights, shadows (low intensity), motion `{150,200,250}ms` | Mode-independent |
| `Role` | `'platform_owner' \| 'workspace_owner' \| 'trainer' \| 'sales' \| 'client'` | Naming only; not authorization |
| `NavItem` | `{ key, labelKey, icon }` | Trainer: `home, clients, workout, nutrition, more`. Client: `home, workout, nutrition, progress, more`. |
| `NavigationResult` | `{ status: 'defined', items: NavItem[] } \| { status: 'needs-decision', role }` | Every role other than trainer and client → `needs-decision` |
| `Messages` | `Record<MessageKey, string>` per locale | Key sets for AR and EN are identical |
