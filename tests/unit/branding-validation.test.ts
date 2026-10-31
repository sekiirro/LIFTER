import { describe, expect, it } from 'vitest';
import {
  MAX_BRANDING_LOCALIZED_TEXT_LENGTH,
  normalizeBrandDraft,
} from '../../lib/branding/validation';

describe('branding draft validation', () => {
  it('trims fields and fills the missing name locale from the required locale', () => {
    expect(
      normalizeBrandDraft({
        names: { ar: '  نادي النخبة  ' },
        color: '#059669',
      }),
    ).toEqual({
      names: { ar: 'نادي النخبة', en: 'نادي النخبة' },
      color: '#059669',
    });
  });

  it('preserves both supplied names and canonicalizes six-digit hex', () => {
    expect(
      normalizeBrandDraft({
        names: { ar: 'النخبة', en: ' Elite Gym ' },
        color: '#aBc123',
      }),
    ).toEqual({
      names: { ar: 'النخبة', en: 'Elite Gym' },
      color: '#ABC123',
    });
  });

  it('requires at least one nonblank locale name', () => {
    expect(() => normalizeBrandDraft({ names: {}, color: '#059669' })).toThrow(
      /name/i,
    );
    expect(() =>
      normalizeBrandDraft({
        names: { ar: ' ', en: '\t' },
        color: '#059669',
      }),
    ).toThrow(/name/i);
  });

  it('bounds localized names and banner alt text by Unicode characters', () => {
    const withinLimit = '😀'.repeat(MAX_BRANDING_LOCALIZED_TEXT_LENGTH);
    expect(
      normalizeBrandDraft({
        names: { en: withinLimit },
        color: '#059669',
        bannerAltText: { en: withinLimit },
      }).names.en,
    ).toBe(withinLimit);
    expect(() =>
      normalizeBrandDraft({
        names: { en: `${withinLimit}😀` },
        color: '#059669',
      }),
    ).toThrow(/1000 characters/i);
    expect(() =>
      normalizeBrandDraft({
        names: { en: 'Studio' },
        color: '#059669',
        bannerAltText: { en: `${withinLimit}😀` },
      }),
    ).toThrow(/1000 characters/i);
  });

  it.each(['#123', '123456', '#12345G', '#1234567', 'red'])(
    'rejects invalid brand color %s',
    (color) => {
      expect(() =>
        normalizeBrandDraft({ names: { en: 'Studio' }, color }),
      ).toThrow(/color/i);
    },
  );

  it('requires one banner alt locale and fills the other when a banner is attached', () => {
    expect(
      normalizeBrandDraft({
        names: { en: 'Studio' },
        color: '#059669',
        bannerAssetId: 'asset-banner',
        bannerAltText: { en: 'Studio entrance' },
      }),
    ).toMatchObject({
      bannerAssetId: 'asset-banner',
      bannerAltText: {
        ar: 'Studio entrance',
        en: 'Studio entrance',
      },
    });
    expect(() =>
      normalizeBrandDraft({
        names: { en: 'Studio' },
        color: '#059669',
        bannerAssetId: 'asset-banner',
      }),
    ).toThrow(/alt/i);
  });

  it('rejects semantic-token edits and unknown editable fields', () => {
    expect(() =>
      normalizeBrandDraft({
        names: { en: 'Studio' },
        color: '#059669',
        semanticTokens: { success: '#ff0000' },
      }),
    ).toThrow(/field|semantic/i);
  });
});
