import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_NUMBER_GROUP_DIRECTION,
  PHONE_NUMBER_GROUP_GAP,
  HERO_CARD_FILL_ALPHA,
  MAX_ADAPTIVE_DIMMING,
  adaptiveDimmingFromBackdropLuminances,
  adaptiveDimmingFromLuminance,
  conservativeBackdropLuminance,
  photoToneFromLuminance,
  selectHeroLayoutMode,
} from '../../components/branding/registration-hero';

const signupFormSource = readFileSync(
  'app/register/[token]/SignupForm.tsx',
  'utf8',
);
const signupStylesSource = readFileSync(
  'app/register/[token]/signup.module.css',
  'utf8',
);
const heroStylesSource = readFileSync(
  'components/branding/registration-hero.module.css',
  'utf8',
);
const heroComponentSource = readFileSync(
  'components/branding/RegistrationHero.tsx',
  'utf8',
);

describe('production registration hero layout', () => {
  it('selects split art layout for a desktop banner', () => {
    expect(selectHeroLayoutMode({ hasBanner: true, viewport: 'desktop' })).toBe(
      'split',
    );
  });

  it('selects stacked art layout for a mobile banner', () => {
    expect(selectHeroLayoutMode({ hasBanner: true, viewport: 'mobile' })).toBe(
      'stacked',
    );
  });

  it('centers the card when no banner is published', () => {
    expect(
      selectHeroLayoutMode({ hasBanner: false, viewport: 'desktop' }),
    ).toBe('centered');
    expect(selectHeroLayoutMode({ hasBanner: false, viewport: 'mobile' })).toBe(
      'centered',
    );
  });
});

describe('production registration hero adaptive dimming', () => {
  it.each([0, 0.1, 0.183, 0.3, 0.5, 0.7, 0.9, 1])(
    'keeps white text at 4.5:1 or better for artwork luminance %s',
    (luminance) => {
      const dimming = adaptiveDimmingFromLuminance(luminance);
      const backdropLuminance =
        (1 - HERO_CARD_FILL_ALPHA) * luminance * (1 - dimming) +
        HERO_CARD_FILL_ALPHA;
      const contrast = 1.05 / (backdropLuminance + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps dark artwork undimmed', () => {
    expect(adaptiveDimmingFromLuminance(0.05)).toBe(0);
    expect(photoToneFromLuminance(0.05)).toBe('dim');
  });

  it('dims bright artwork using the contrast-safe curve', () => {
    expect(adaptiveDimmingFromLuminance(0.5)).toBeCloseTo(0.6498, 4);
    expect(photoToneFromLuminance(0.5)).toBe('mid');
    expect(photoToneFromLuminance(0.9)).toBe('bright');
  });

  it('clamps invalid and extreme luminance inputs', () => {
    expect(adaptiveDimmingFromLuminance(-1)).toBe(0);
    expect(adaptiveDimmingFromLuminance(1)).toBe(MAX_ADAPTIVE_DIMMING);
    expect(MAX_ADAPTIVE_DIMMING).toBeCloseTo(245 / 297, 12);
    expect(adaptiveDimmingFromLuminance(Number.NaN)).toBe(0);
  });
});

describe('production registration hero conservative backdrop sampling', () => {
  // Dark artwork with a bright local patch behind the hero text.
  const DARK_BACKDROP_LUMINANCE = 0.0129;
  const BRIGHT_PATCH_LUMINANCE = 0.9131;
  const sampledLuminances = [
    ...Array.from({ length: 75 }, () => DARK_BACKDROP_LUMINANCE),
    ...Array.from({ length: 25 }, () => BRIGHT_PATCH_LUMINANCE),
  ];
  const averageLuminance =
    sampledLuminances.reduce((sum, value) => sum + value, 0) /
    sampledLuminances.length;

  it('dims from the conservative upper bound behind the text', () => {
    const conservative = conservativeBackdropLuminance(sampledLuminances);
    expect(conservative).toBeCloseTo(BRIGHT_PATCH_LUMINANCE, 6);
    expect(conservative).toBeGreaterThan(averageLuminance);

    const dimming = adaptiveDimmingFromBackdropLuminances(sampledLuminances);
    expect(dimming).toBeCloseTo(0.80825, 4);
    const backdrop =
      (1 - HERO_CARD_FILL_ALPHA) * conservative * (1 - dimming) +
      HERO_CARD_FILL_ALPHA;
    expect(1.05 / (backdrop + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves the bright patch below 4.5:1 when the average drives the dimming', () => {
    const dimming = adaptiveDimmingFromLuminance(averageLuminance);
    const backdrop =
      (1 - HERO_CARD_FILL_ALPHA) * BRIGHT_PATCH_LUMINANCE * (1 - dimming) +
      HERO_CARD_FILL_ALPHA;
    expect(1.05 / (backdrop + 0.05)).toBeLessThan(4.5);
  });

  it('samples the card content box through the shared conservative bound', () => {
    expect(heroComponentSource).toContain(
      'adaptiveDimmingFromBackdropLuminances(',
    );
    expect(heroComponentSource).toContain('conservativeBackdropLuminance(');
    expect(heroComponentSource).toContain('data-hero-text-area');
  });
});

describe('production registration phone grouping', () => {
  it('keeps the calling code and national digits in one LTR group', () => {
    expect(PHONE_NUMBER_GROUP_DIRECTION).toBe('ltr');
    expect(PHONE_NUMBER_GROUP_GAP).toBe('var(--space-2)');
    expect(signupFormSource).toContain('dir={PHONE_NUMBER_GROUP_DIRECTION}');
    expect(signupFormSource).toContain('dir="ltr"');
  });

  it('uses exactly one space-2 gap for the phone group', () => {
    const phoneRule = signupStylesSource.match(
      /\.phoneNumber\s*\{(?<body>[^}]*)\}/s,
    )?.groups?.body;
    expect(phoneRule).toBeDefined();
    expect(phoneRule).toMatch(/gap:\s*var\(--space-2\)/);
  });
});
