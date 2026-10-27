# UI Contract: P0-F2

Public API that later features build on. Names are binding; internals are not.

## Pure libraries

```ts
// lib/design/color.ts
parseHex(input: string): Hex | null
contrastRatio(a: Hex, b: Hex): number            // WCAG 2.x, 1..21
deriveBrand(input: string | null | undefined): BrandVariants   // invalid → default #059669
export const DEFAULT_BRAND: Hex                   // '#059669'

// lib/design/tokens-css.ts
tokensToCss(): string                             // :root light, @media dark for :root:not([data-theme=light]), [data-theme=dark]; incl. [data-brand-scope] mapping
brandToCssVars(v: BrandVariants): Record<`--${string}`, string>

// lib/design/preferences.ts
THEME_COOKIE = 'lifter_theme'; LOCALE_COOKIE = 'lifter_locale'
parseTheme(v?: string): ThemePreference; parseLocale(v?: string): Locale; dirFor(l: Locale): 'rtl'|'ltr'

// lib/design/navigation.ts
getNavigation(role: Role): NavigationResult

// lib/design/showcase.ts
isShowcaseEnabled(env: Record<string, string | undefined>): boolean

// lib/i18n
getMessages(locale: Locale): Messages
```

## CSS variables (consumed by components; tokens only)

`--color-bg --color-card --color-card-raised --color-border --color-border-strong --color-text --color-text-muted --color-text-disabled --color-overlay`
`--color-{success|warning|error|info}-{fg|bg|border}`
`--brand-fill --brand-fill-hover --brand-on-fill --brand-text --brand-ring` (resolved per mode, overridable per `[data-brand-scope]`)
`--radius-{sm|button|card|full} --space-{1..10} --font-sans --text-{xs..2xl} --shadow-{sm|md} --motion-{fast|base|slow} --touch-min`

## Components

| Component | Props (key) | Behavior guarantees |
|---|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'destructive'`, `loading?`, `disabled?`, native button props | Min height `--touch-min`. Visible `:focus-visible` ring. `loading` → `aria-busy="true"`, `aria-disabled`, click ignored, spinner + label kept. |
| `Field` | `label`, `hint?`, `error?`, `children` (input) or `inputProps` | Label above, linked by `htmlFor`/`id`. `aria-describedby` → hint and error. `aria-invalid` when there's an error. Error text has an icon and is never color-only. |
| `Card` | `as?`, `elevated?` | Token radius/border/shadow |
| `ConfirmDialog` | `open`, `title`, `description?`, `confirmLabel`, `cancelLabel`, `tone?: 'default'\|'destructive'`, `onConfirm`, `onCancel` | Native modal dialog. Focus goes to cancel on open. Escape → `onCancel`. Focus returns to the previously focused element. `aria-labelledby` set. |
| `Skeleton` | `shape`, `lines?` | `aria-hidden`; the parent region has `aria-busy` |
| `EmptyState` / `NoResults` / `ErrorState` | `title`, `description?`; `ErrorState.onRetry` | Distinct icon and copy each. `ErrorState` renders a Retry button and `role="alert"`. |
| `ToastProvider` + `useToast().success(msg)` | — | One polite live region. Auto-dismiss ~5 s, paused on hover/focus. Has a dismiss button. Does not move focus. |
| `Alert` | `tone: 'info'\|'success'\|'warning'\|'error'`, `title`, children | Persistent. `role="alert"` for error/warning, `role="status"` otherwise. |
| `BrandScope` | `color?: string`, children | Renders `div[data-brand-scope]` with `brandToCssVars(deriveBrand(color))` |
| `Bidi` | `children`, `dir?: 'ltr'\|'rtl'\|'auto'` | `<bdi>` isolation for numbers, codes and Latin data |
| `Icon` | `name`, `label?` | Decorative → `aria-hidden`. With `label` → `role="img"` + `aria-label`. Directional icons flip under `[dir=rtl]`. |
| `ThemeSwitcher` / `LanguageSwitcher` | — | Labeled controls. Theme applies immediately without a reload. Locale writes the cookie and refreshes. |
| `AppShell` | `role`, `activeKey`, `hrefFor?`, `messages`, children | Wide: inline-start rail with tooltips on hover and focus, `aria-current="page"` on the active item. Narrow: bottom bar with visible labels. `needs-decision` → no nav, plus a visible notice in the showcase only. |

## Routes

| Route | Availability | Content |
|---|---|---|
| `/showcase` | Only with `LIFTER_SHOWCASE=1`, otherwise 404 | All tokens, components, states, sample brands (≥ 8 including `#059669`), shell demos (trainer, client, sales → needs-decision) |
| `/print-sample` | Same gate | Bilingual print sample |
| `/api/health` | Unchanged | Unchanged |
