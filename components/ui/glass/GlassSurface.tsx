'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
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

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: {
      didTimeout: boolean;
      timeRemaining: () => number;
    }) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function afterInitialPaintAndLcp(
  callback: () => void,
  isVisible: () => boolean,
) {
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let loaded = document.readyState === 'complete';
  let sawLcp = false;
  let lastLcpAt = performance.now();
  let retryTimer: number | undefined;
  let idleHandle: number | undefined;
  let fallbackTimer: number | undefined;
  let queued = false;
  let observer: PerformanceObserver | undefined;

  const check = () => {
    if (cancelled || queued || !loaded || !isVisible()) return;
    const now = performance.now();
    if ((sawLcp && now - lastLcpAt < 300) || (!sawLcp && now < 1500)) {
      retryTimer = window.setTimeout(check, 50);
      return;
    }
    queued = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !isVisible()) {
          queued = false;
          check();
          return;
        }
        const run = () => {
          if (cancelled || !isVisible()) return;
          if (sawLcp && performance.now() - lastLcpAt < 300) {
            queued = false;
            check();
            return;
          }
          callback();
        };
        if (idleWindow.requestIdleCallback) {
          idleHandle = idleWindow.requestIdleCallback(run, { timeout: 1200 });
        } else {
          fallbackTimer = window.setTimeout(run, 250);
        }
      }),
    );
  };

  const onLoad = () => {
    loaded = true;
    check();
  };
  const onLcp = () => {
    sawLcp = true;
    lastLcpAt = performance.now();
    check();
  };
  if (!loaded) window.addEventListener('load', onLoad, { once: true });
  if (
    PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')
  ) {
    observer = new PerformanceObserver(onLcp);
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  }
  window.addEventListener('resize', check);
  check();

  return () => {
    cancelled = true;
    observer?.disconnect();
    window.removeEventListener('load', onLoad);
    window.removeEventListener('resize', check);
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
  };
}

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
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const queries = [
      matchMedia('(prefers-reduced-transparency: reduce)'),
      matchMedia('(prefers-contrast: more)'),
      matchMedia('(forced-colors: active)'),
      matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    let cancelled = false;
    let enabled = false;
    let cancelSchedule: (() => void) | undefined;
    let loading = false;

    const isVisible = () =>
      Boolean(surfaceRef.current?.getClientRects().length);
    surfaceRef.current?.setAttribute('data-glass-scheduler-ready', '');

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
        cancelSchedule?.();
        cancelSchedule = undefined;
        loading = false;
        setGlass(null);
        return;
      }
      cancelSchedule = afterInitialPaintAndLcp(() => {
        if (loading) return;
        loading = true;
        void import('glisse').then(
          ({ Glass: GlisseGlass }) => {
            if (!cancelled && enabled) setGlass(() => GlisseGlass);
          },
          () => {
            // Keep the server-rendered token surface if the optional effect fails.
          },
        );
      }, isVisible);
    };

    for (const query of queries) query.addEventListener('change', refresh);
    refresh();
    return () => {
      cancelled = true;
      cancelSchedule?.();
      for (const query of queries) query.removeEventListener('change', refresh);
    };
  }, [fallback]);

  const surfaceProps = {
    ...props,
    ref: surfaceRef,
    className: getGlassSurfaceClassName({ variant, fallback, className }),
    'data-glass-surface': '',
    'data-glass-variant': variant,
    'data-glass-fallback': fallback,
    'data-glass-enhanced': Glass ? '' : undefined,
  };

  return Glass ? (
    <Glass {...surfaceProps}>{children}</Glass>
  ) : (
    <div {...surfaceProps}>{children}</div>
  );
}
