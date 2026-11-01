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
