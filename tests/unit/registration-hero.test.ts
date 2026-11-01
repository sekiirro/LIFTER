import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_NUMBER_GROUP_DIRECTION,
  PHONE_NUMBER_GROUP_GAP,
  MAX_ADAPTIVE_DIMMING,
  adaptiveDimmingFromLuminance,
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
      const backdropLuminance = luminance * (1 - dimming);
      const contrast = 1.05 / (backdropLuminance + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps dark artwork undimmed', () => {
    expect(adaptiveDimmingFromLuminance(0.05)).toBe(0);
    expect(photoToneFromLuminance(0.05)).toBe('dim');
  });

  it('retains the existing curve where it exceeds the contrast minimum', () => {
    expect(adaptiveDimmingFromLuminance(0.183)).toBeCloseTo(0.00399, 5);
  });

  it('dims bright artwork using the contrast-safe curve', () => {
    expect(adaptiveDimmingFromLuminance(0.5)).toBeCloseTo(0.6333, 4);
    expect(photoToneFromLuminance(0.5)).toBe('mid');
    expect(photoToneFromLuminance(0.9)).toBe('bright');
  });

  it('clamps invalid and extreme luminance inputs', () => {
    expect(adaptiveDimmingFromLuminance(-1)).toBe(0);
    expect(adaptiveDimmingFromLuminance(1)).toBe(MAX_ADAPTIVE_DIMMING);
    expect(MAX_ADAPTIVE_DIMMING).toBeCloseTo(49 / 60, 12);
    expect(adaptiveDimmingFromLuminance(Number.NaN)).toBe(0);
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
