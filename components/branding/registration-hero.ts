export type HeroViewport = 'desktop' | 'mobile';
export type HeroLayoutMode = 'split' | 'stacked' | 'centered';
export type HeroPhotoTone = 'bright' | 'mid' | 'dim';

export const PHONE_NUMBER_GROUP_DIRECTION = 'ltr' as const;
export const PHONE_NUMBER_GROUP_GAP = 'var(--space-2)' as const;

export function selectHeroLayoutMode({
  hasBanner,
  viewport,
}: {
  hasBanner: boolean;
  viewport: HeroViewport;
}): HeroLayoutMode {
  if (!hasBanner) return 'centered';
  return viewport === 'desktop' ? 'split' : 'stacked';
}

export function photoToneFromLuminance(luminance: number): HeroPhotoTone {
  if (!Number.isFinite(luminance)) return 'dim';
  if (luminance > 0.58) return 'bright';
  if (luminance > 0.34) return 'mid';
  return 'dim';
}

/**
 * Brightest sampled cell in the card region, retained for artwork diagnostics.
 */
export function conservativeBackdropLuminance(
  luminances: readonly number[],
): number {
  let peak = 0;
  for (const value of luminances) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, Math.min(1, Math.max(0, value)));
  }
  return peak;
}

/**
 * Darkest sampled luminance in the card region, retained for artwork diagnostics.
 */
export function darkestBackdropLuminance(
  luminances: readonly number[],
): number {
  let darkest = 1;
  for (const value of luminances) {
    if (!Number.isFinite(value)) continue;
    darkest = Math.min(darkest, Math.min(1, Math.max(0, value)));
  }
  return darkest;
}

export type HeroSamplingTarget = {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
};

/**
 * Sampling fallback state.
 *
 * Every failed artwork sample clears the previously sampled diagnostics and
 * image-derived substrate values so stale measurements are not retained.
 */
export function applyHeroSamplingFallback(stage: HeroSamplingTarget): void {
  delete stage.dataset.photoTone;
  delete stage.dataset.photoAverageLuminance;
  delete stage.dataset.photoDarkestLuminance;
  stage.dataset.photoStatsReady = 'false';
  stage.dataset.photoSampling = 'fallback';
  stage.style.removeProperty('--hero-photo-luminance');
  stage.style.removeProperty('--hero-photo-average-luminance');
  stage.style.removeProperty('--hero-bottom-average');
  stage.style.removeProperty('--hero-mobile-mid');
}

/**
 * Enter the opaque sampling fallback.
 *
 * The cleared sample and the rendered fallback state are committed together,
 * so the card can never keep the glass treatment over artwork that was never
 * measured. Every failure path and every artwork change goes through this
 * one entry point.
 */
export function enterHeroSamplingFallback(
  stage: HeroSamplingTarget,
  setFallback: (fallback: boolean) => void,
): void {
  setFallback(true);
  applyHeroSamplingFallback(stage);
}

/** The artwork element contract the hero sampler relies on. */
export type HeroArtworkImage = {
  complete: boolean;
  naturalWidth: number;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export type HeroArtworkState = 'loaded' | 'failed' | 'pending';

/**
 * The load state of the hero artwork.
 *
 * A complete image without any natural width is a broken image: the request
 * failed before the hero could attach its listener.
 */
export function heroArtworkState(image: {
  complete: boolean;
  naturalWidth: number;
}): HeroArtworkState {
  if (!image.complete) return 'pending';
  return image.naturalWidth > 0 ? 'loaded' : 'failed';
}

/**
 * Subscribe to the hero artwork events.
 *
 * A failed request has to reach the opaque fallback as well, and a listener
 * attached after the request already failed would never fire. The load
 * state is therefore checked first, and both listeners are removed again
 * when the artwork changes or the hero unmounts.
 */
export function subscribeToHeroArtwork(
  image: HeroArtworkImage,
  handlers: {
    onLoaded: () => void;
    onFailed: () => void;
    onPending?: () => void;
  },
): () => void {
  const state = heroArtworkState(image);
  if (state === 'loaded') {
    handlers.onLoaded();
    return () => {};
  }
  if (state === 'failed') {
    handlers.onFailed();
    return () => {};
  }
  handlers.onPending?.();
  const handleLoad = () => handlers.onLoaded();
  const handleError = () => handlers.onFailed();
  image.addEventListener('load', handleLoad);
  image.addEventListener('error', handleError);
  return () => {
    image.removeEventListener('load', handleLoad);
    image.removeEventListener('error', handleError);
  };
}

/** The resize entry contract the hero sampler relies on. */
export type HeroResizeEntry = {
  contentRect: { width: number; height: number };
};

export type HeroResizeObserver = {
  observe: (target: Element) => void;
  disconnect: () => void;
};

/**
 * Resample the hero artwork when the sampled text region changes size.
 *
 * The card text region is exactly the region the contrast sample is
 * measured from, so a geometry change (a reflow, a longer form, a
 * different viewport) invalidates that sample. The resample is coalesced
 * into a single animation frame and entries whose rounded size did not
 * change are ignored, so the observer can never loop. The returned cleanup
 * disconnects the observer; browsers without a ResizeObserver keep the
 * window resize path in charge.
 */
export function observeHeroTextRegion(
  target: Element,
  onResize: () => void,
): (() => void) | null {
  const Observer = (
    globalThis as {
      ResizeObserver?: new (
        callback: (entries: HeroResizeEntry[]) => void,
      ) => HeroResizeObserver;
    }
  ).ResizeObserver;
  if (!Observer) return null;
  let lastWidth: number | null = null;
  let lastHeight: number | null = null;
  let frame: number | null = null;
  const observer = new Observer((entries) => {
    for (const entry of entries) {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      const changed =
        lastWidth !== null &&
        lastHeight !== null &&
        (width !== lastWidth || height !== lastHeight);
      lastWidth = width;
      lastHeight = height;
      if (!changed || frame !== null) continue;
      frame = requestAnimationFrame(() => {
        frame = null;
        onResize();
      });
    }
  });
  observer.observe(target);
  return () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    observer.disconnect();
  };
}
