'use client';

import type { HTMLAttributes, Ref } from 'react';
import { useEffect, useRef, useState } from 'react';
import styles from './GlassSurface.module.css';

export type GlassVariant = 'regular' | 'strong' | 'edge' | 'solid';
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

type GlisseMount = {
  cancelled: boolean;
  isCurrent: () => boolean;
  mount: () => Promise<boolean> | boolean;
  settle: (duration: number) => void;
};

const glisseMountQueue: GlisseMount[] = [];
let drainingGlisseMounts = false;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function waitForEnhancementSlot(): Promise<void> {
  const idleWindow = window as IdleWindow;
  if (!idleWindow.requestIdleCallback)
    return new Promise((resolve) => window.setTimeout(resolve, 32));
  return new Promise((resolve) => {
    const schedule = () =>
      idleWindow.requestIdleCallback!(
        (deadline) => {
          if (!deadline.didTimeout && deadline.timeRemaining() < 12) {
            window.setTimeout(schedule, 48);
            return;
          }
          resolve();
        },
        { timeout: 1000 },
      );
    schedule();
  });
}

async function drainGlisseMounts() {
  if (drainingGlisseMounts) return;
  drainingGlisseMounts = true;
  while (glisseMountQueue.length) {
    const task = glisseMountQueue.shift()!;
    if (task.cancelled || !task.isCurrent()) continue;
    await waitForEnhancementSlot();
    if (task.cancelled || !task.isCurrent()) continue;
    const startedAt = performance.now();
    const mounted = await task.mount();
    if (!mounted) continue;
    await nextPaint();
    const duration = performance.now() - startedAt;
    task.settle(duration);
    // Each mount gets two paint opportunities before another surface begins.
    await nextPaint();
  }
  drainingGlisseMounts = false;
}

function queueGlisseMount(task: GlisseMount) {
  glisseMountQueue.push(task);
  void drainGlisseMounts();
  return () => {
    task.cancelled = true;
    const index = glisseMountQueue.indexOf(task);
    if (index >= 0) glisseMountQueue.splice(index, 1);
  };
}

function setStaticBackdrop(surface: HTMLDivElement, isStatic: boolean) {
  if (isStatic) {
    surface.style.setProperty('backdrop-filter', 'none', 'important');
    surface.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    return;
  }
  surface.style.removeProperty('backdrop-filter');
  surface.style.removeProperty('-webkit-backdrop-filter');
}

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
  const runtimeModeRef = useRef<string | null>(null);
  const initStartRef = useRef<string | null>(null);
  const assignSurfaceRef = (node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    if (node && runtimeModeRef.current)
      node.setAttribute('data-glass-runtime', runtimeModeRef.current);
    if (node && initStartRef.current)
      node.setAttribute('data-glass-init-start', initStartRef.current);
    if (node && runtimeModeRef.current === 'static')
      setStaticBackdrop(node, true);
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef)
      (forwardedRef as { current: HTMLDivElement | null }).current = node;
  };
  const setRuntimeMode = (mode: string) => {
    runtimeModeRef.current = mode;
    surfaceRef.current?.setAttribute('data-glass-runtime', mode);
    if (surfaceRef.current)
      setStaticBackdrop(surfaceRef.current, mode === 'static');
  };

  useEffect(() => {
    // The server-rendered material already matches the approved capsule. On
    // constrained devices, skip observers, listeners, and idle timers entirely.
    if (isConstrainedDevice()) {
      setRuntimeMode('static');
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
        setRuntimeMode('static');
        cancelSchedule?.();
        cancelSchedule = undefined;
        loading = false;
        setGlass(null);
        return;
      }
      setRuntimeMode('waiting');
      cancelSchedule = afterInitialPaintAndLcp(() => {
        if (loading) return;
        loading = true;
        cancelSchedule?.();
        cancelSchedule = undefined;
        cancelSchedule = queueGlisseMount({
          cancelled: false,
          isCurrent: () => !cancelled && Boolean(enabled),
          mount: () => {
            initStartRef.current = String(performance.now());
            surfaceRef.current?.setAttribute(
              'data-glass-init-start',
              initStartRef.current,
            );
            return import('glisse').then(
              ({ Glass: GlisseGlass }) => {
                if (!cancelled && enabled) {
                  setGlass(() => GlisseGlass);
                  return true;
                }
                return false;
              },
              () => {
                setRuntimeMode('static');
                return false;
              },
            );
          },
          settle: (duration) => {
            const surface = surfaceRef.current;
            if (!surface || cancelled || !enabled) return;
            surface.setAttribute('data-glass-init-ms', String(duration));
            surface.setAttribute(
              'data-glass-init-end',
              String(performance.now()),
            );
            if (duration > 100) {
              setRuntimeMode('static');
              surface.setAttribute('data-glass-over-budget', '');
              setGlass(null);
              return;
            }
            setRuntimeMode('enhanced');
          },
        });
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
    style:
      fallback === 'solid'
        ? {
            ...props.style,
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }
        : props.style,
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
