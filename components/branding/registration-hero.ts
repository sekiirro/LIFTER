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

// Maximum backdrop luminance for 4.5:1 contrast against white text.
export const MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT = 1.05 / 4.5 - 0.05;

// The cap reaches exactly the contrast limit when the artwork reaches white.
export const MAX_ADAPTIVE_DIMMING = 1 - MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT;

export function adaptiveDimmingFromLuminance(luminance: number): number {
  if (!Number.isFinite(luminance)) return 0;
  const boundedLuminance = Math.min(1, Math.max(0, luminance));
  const existingCurve = Math.min(
    0.72,
    Math.max(0, (boundedLuminance - 0.18) * 1.33),
  );
  const contrastRequiredDimming =
    boundedLuminance > 0
      ? 1 - MAX_BACKDROP_LUMINANCE_FOR_WHITE_TEXT / boundedLuminance
      : 0;
  return Math.min(
    MAX_ADAPTIVE_DIMMING,
    Math.max(0, Math.max(existingCurve, contrastRequiredDimming)),
  );
}
