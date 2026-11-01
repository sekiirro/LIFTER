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

export function adaptiveDimmingFromLuminance(luminance: number): number {
  if (!Number.isFinite(luminance)) return 0;
  return Math.min(0.72, Math.max(0, (luminance - 0.18) * 1.33));
}
