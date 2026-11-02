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

// Maximum composited backdrop luminance for 4.5:1 contrast against white text.
export const MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT = 1.05 / 4.5 - 0.05;

// The glass card mixes its white 1% fill with the dimmed black fill.
export const HERO_CARD_FILL_ALPHA = 0.01;

// The cap reaches the contrast limit after the card fill is composited.
export const MAX_ADAPTIVE_DIMMING =
  1 -
  (MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT - HERO_CARD_FILL_ALPHA) /
    (1 - HERO_CARD_FILL_ALPHA) +
  Number.EPSILON;

export function adaptiveDimmingFromLuminance(luminance: number): number {
  if (!Number.isFinite(luminance)) return 0;
  const boundedLuminance = Math.min(1, Math.max(0, luminance));
  const existingCurve = Math.min(
    0.72,
    Math.max(0, (boundedLuminance - 0.18) * 1.33),
  );
  const contrastRequiredDimming =
    boundedLuminance > 0
      ? 1 -
        (MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT - HERO_CARD_FILL_ALPHA) /
          ((1 - HERO_CARD_FILL_ALPHA) * boundedLuminance) +
        Number.EPSILON
      : 0;
  return Math.min(
    MAX_ADAPTIVE_DIMMING,
    Math.max(0, Math.max(existingCurve, contrastRequiredDimming)),
  );
}

/**
 * Conservative upper bound of the artwork luminance behind the hero text.
 *
 * The glass card paints one dimming value across the whole surface, so the
 * contrast-critical input is the brightest backdrop under the text rather
 * than the average of the sampled region: a bright local patch behind a
 * label can sit well above the full-overlap average. The maximum of the
 * sampled cell luminances is the tightest conservative bound the same canvas
 * sample can provide.
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

/** Adaptive dimming derived from the conservative backdrop bound. */
export function adaptiveDimmingFromBackdropLuminances(
  luminances: readonly number[],
): number {
  return adaptiveDimmingFromLuminance(
    conservativeBackdropLuminance(luminances),
  );
}

export type HeroSamplingTarget = {
  dataset: DOMStringMap;
  style: CSSStyleDeclaration;
};

/**
 * Sampling fallback state.
 *
 * Every failed artwork sample clears the previously sampled tone, luminance
 * and dimming so the card can fall back to the opaque token surface instead
 * of keeping a stale treatment over artwork that was never measured.
 */
export function applyHeroSamplingFallback(stage: HeroSamplingTarget): void {
  delete stage.dataset.photoTone;
  delete stage.dataset.photoAverageLuminance;
  stage.dataset.photoStatsReady = 'false';
  stage.dataset.photoSampling = 'fallback';
  stage.style.removeProperty('--hero-photo-luminance');
  stage.style.removeProperty('--hero-photo-average-luminance');
  stage.style.setProperty('--hero-adaptive-dimming', '0');
  stage.style.setProperty('--hero-adaptive-dimming-percent', '0%');
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
