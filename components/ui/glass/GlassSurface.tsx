'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import styles from './GlassSurface.module.css';

export type GlassVariant = 'regular' | 'strong' | 'edge';
export type GlassFallback = 'auto' | 'solid';

export type GlassSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: GlassVariant;
  fallback?: GlassFallback;
};

export type GlassPreferences = {
  supportsBackdropFilter: boolean;
  reducedTransparency: boolean;
  increasedContrast: boolean;
  forcedColors: boolean;
  reducedMotion: boolean;
};

export function shouldEnableGlisseRefraction(
  preferences: GlassPreferences,
  fallback: GlassFallback = 'auto',
) {
  return (
    fallback !== 'solid' &&
    preferences.supportsBackdropFilter &&
    !preferences.reducedTransparency &&
    !preferences.increasedContrast &&
    !preferences.forcedColors &&
    !preferences.reducedMotion
  );
}

export function getGlassSurfaceClassName({
  variant = 'regular',
  fallback = 'auto',
  className,
}: Pick<GlassSurfaceProps, 'variant' | 'fallback' | 'className'> = {}) {
  return [
    styles.surface,
    'lg-glass',
    styles[variant],
    fallback === 'solid' ? styles.solid : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function GlassSurface({
  variant = 'regular',
  fallback = 'auto',
  className,
  children,
  ...props
}: GlassSurfaceProps) {
  const [Glass, setGlass] = useState<typeof import('glisse').Glass | null>(
    null,
  );

  useEffect(() => {
    const queries = [
      matchMedia('(prefers-reduced-transparency: reduce)'),
      matchMedia('(prefers-contrast: more)'),
      matchMedia('(forced-colors: active)'),
      matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    let cancelled = false;
    let enabled = false;

    const refresh = () => {
      const next = shouldEnableGlisseRefraction(
        {
          supportsBackdropFilter: CSS.supports(
            '(backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))',
          ),
          reducedTransparency: queries[0]!.matches,
          increasedContrast: queries[1]!.matches,
          forcedColors: queries[2]!.matches,
          reducedMotion: queries[3]!.matches,
        },
        fallback,
      );
      if (enabled === next) return;
      enabled = next;
      if (!next) {
        setGlass(null);
        return;
      }
      void import('glisse').then(
        ({ Glass: GlisseGlass }) => {
          if (!cancelled && enabled) setGlass(() => GlisseGlass);
        },
        () => {
          // Keep the server-rendered token surface if the optional effect fails.
        },
      );
    };

    for (const query of queries) query.addEventListener('change', refresh);
    refresh();
    return () => {
      cancelled = true;
      for (const query of queries) query.removeEventListener('change', refresh);
    };
  }, [fallback]);

  const surfaceProps = {
    ...props,
    className: getGlassSurfaceClassName({ variant, fallback, className }),
    'data-glass-surface': '',
    'data-glass-variant': variant,
    'data-glass-fallback': fallback,
  };

  return Glass ? (
    <Glass {...surfaceProps}>{children}</Glass>
  ) : (
    <div {...surfaceProps}>{children}</div>
  );
}
