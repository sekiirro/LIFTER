'use client';

import type { HTMLAttributes, Ref } from 'react';
import { useEffect, useRef, useState } from 'react';
import styles from './GlassSurface.module.css';

export type GlassVariant = 'regular' | 'strong' | 'edge';
export type GlassFallback = 'auto' | 'solid';

export type GlassSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: GlassVariant;
  fallback?: GlassFallback;
  ref?: Ref<HTMLDivElement>;
};

export type GlassPreferences = {
  supportsBackdropFilter: boolean;
  reducedTransparency: boolean;
  increasedContrast: boolean;
  forcedColors: boolean;
  reducedMotion: boolean;
  constrainedDevice?: boolean;
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
  const loadedAt = performance.now();
  let lastInteractionAt = 0;
  let retryTimer: number | undefined;
  let idleHandle: number | undefined;
  let fallbackTimer: number | undefined;
  let queued = false;
  let idleWaitStartedAt = 0;
  let observer: PerformanceObserver | undefined;

  const check = () => {
    if (cancelled || queued || !loaded || !isVisible()) return;
    const now = performance.now();
    if ((sawLcp && now - lastLcpAt < 300) || (!sawLcp && now < 1500)) {
      retryTimer = window.setTimeout(check, 50);
      return;
    }
    const quietSince = lastInteractionAt || lastLcpAt || loadedAt;
    const waitUntil = lastInteractionAt
      ? quietSince + 2500
      : Math.max(lastLcpAt + 6000, loadedAt + 7000);
    if (now < waitUntil) {
      retryTimer = window.setTimeout(check, Math.min(500, waitUntil - now));
      return;
    }
    queued = true;
    if (!idleWaitStartedAt) idleWaitStartedAt = now;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !isVisible()) {
          queued = false;
          check();
          return;
        }
        const run = () => {
          if (cancelled || !isVisible()) return;
          if (
            (sawLcp && performance.now() - lastLcpAt < 300) ||
            (lastInteractionAt > 0 &&
              performance.now() - lastInteractionAt < 2500)
          ) {
            queued = false;
            check();
            return;
          }
          callback();
        };
        if (idleWindow.requestIdleCallback) {
          idleHandle = idleWindow.requestIdleCallback(
            (deadline) => {
              if (
                !deadline.didTimeout &&
                deadline.timeRemaining() < 32 &&
                performance.now() - idleWaitStartedAt < 3000
              ) {
                queued = false;
                retryTimer = window.setTimeout(check, 400);
                return;
              }
              run();
            },
            { timeout: 3000 },
          );
        } else {
          fallbackTimer = window.setTimeout(run, 500);
        }
      }),
    );
  };

  const onLoad = () => {
    loaded = true;
    check();
  };
  const onInteraction = () => {
    lastInteractionAt = performance.now();
    check();
  };
  const onLcp = () => {
    sawLcp = true;
    lastLcpAt = performance.now();
    check();
  };
  if (!loaded) window.addEventListener('load', onLoad, { once: true });
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'])
    window.addEventListener(type, onInteraction, { passive: true });
  if (
    PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')
  ) {
    observer = new PerformanceObserver(onLcp);
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  }
  check();

  return () => {
    cancelled = true;
    observer?.disconnect();
    window.removeEventListener('load', onLoad);
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'])
      window.removeEventListener(type, onInteraction);
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
    !preferences.reducedMotion &&
    !preferences.constrainedDevice
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

function isConstrainedDevice() {
  const connection = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return (
    navigator.hardwareConcurrency <= 4 ||
    (connection.deviceMemory !== undefined && connection.deviceMemory <= 4) ||
    Boolean(connection.connection?.saveData) ||
    /^(slow-2g|2g|3g)$/.test(connection.connection?.effectiveType ?? '')
  );
}

export function GlassSurface({
  variant = 'regular',
  fallback = 'auto',
  className,
  children,
  ref: forwardedRef,
  ...props
}: GlassSurfaceProps) {
  const [Glass, setGlass] = useState<typeof import('glisse').Glass | null>(
    null,
  );
  const surfaceRef = useRef<HTMLDivElement>(null);
  const assignSurfaceRef = (node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef)
      (forwardedRef as { current: HTMLDivElement | null }).current = node;
  };

  useEffect(() => {
    // The server-rendered material already matches the approved capsule. On
    // constrained devices, skip observers, listeners, and idle timers entirely.
    if (isConstrainedDevice()) {
      surfaceRef.current?.setAttribute('data-glass-runtime', 'static');
      return;
    }

    const queries = [
      matchMedia('(prefers-reduced-transparency: reduce)'),
      matchMedia('(prefers-contrast: more)'),
      matchMedia('(forced-colors: active)'),
      matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    let cancelled = false;
    let enabled: boolean | null = null;
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
          constrainedDevice: false,
        },
        fallback,
      );
      if (enabled === next) return;
      enabled = next;
      if (!next) {
        surfaceRef.current?.setAttribute('data-glass-runtime', 'static');
        cancelSchedule?.();
        cancelSchedule = undefined;
        loading = false;
        setGlass(null);
        return;
      }
      surfaceRef.current?.setAttribute('data-glass-runtime', 'waiting');
      cancelSchedule = afterInitialPaintAndLcp(() => {
        if (loading) return;
        loading = true;
        cancelSchedule?.();
        cancelSchedule = undefined;
        void import('glisse').then(
          ({ Glass: GlisseGlass }) => {
            if (!cancelled && enabled) {
              surfaceRef.current?.setAttribute(
                'data-glass-runtime',
                'enhanced',
              );
              setGlass(() => GlisseGlass);
            }
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
    ref: assignSurfaceRef,
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
