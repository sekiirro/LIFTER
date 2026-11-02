import { describe, expect, it } from 'vitest';
import {
  foodExactKey,
  normalizeArEnV1,
  normalizeFoodIdentity,
  WEIGHING_STATES,
} from '../../lib/catalog/normalize';

describe('catalog normalization', () => {
  it.each([
    ['\u0065\u0301', '\u00e9'],
    ['أَحْمَد', 'احمد'],
    ['فاطمة', 'فاطمه'],
    ['موسى', 'موسي'],
    ['سـلام', 'سلام'],
    ['مُحَمَّدٌ', 'محمد'],
    ['Hello World', 'hello world'],
    ['Café', 'café'],
  ])('normalizes %j -> %j', (input, expected) => {
    expect(normalizeArEnV1(input)).toBe(expected);
  });

  it('applies Unicode NFC before folding', () => {
    expect(normalizeArEnV1('e\u0301')).toBe('é');
  });

  it('folds alef and hamza variants', () => {
    expect(normalizeArEnV1('أ إ آ ٱ')).toBe('ا ا ا ا');
  });

  it('folds ta marbuta to ha', () => {
    expect(normalizeArEnV1('ة')).toBe('ه');
  });

  it('folds alef maqsura to ya', () => {
    expect(normalizeArEnV1('ى')).toBe('ي');
  });

  it('strips Arabic diacritics', () => {
    expect(normalizeArEnV1('بِسْمِ')).toBe('بسم');
  });

  it('strips tatweel', () => {
    expect(normalizeArEnV1('سـلام')).toBe('سلام');
  });

  it('applies locale-independent Latin case folding', () => {
    expect(normalizeArEnV1('ABC')).toBe('abc');
  });

  it('keeps weighing state as a separate identity dimension', () => {
    const rawKey = foodExactKey({
      lang: 'ar',
      name: 'rice',
      basis: 'g',
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'raw',
    });
    const cookedKey = foodExactKey({
      lang: 'ar',
      name: 'rice',
      basis: 'g',
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'cooked',
    });
    expect(rawKey).not.toBe(cookedKey);
  });

  it('produces identical keys only when every dimension matches', () => {
    const a = foodExactKey({
      lang: 'en',
      name: 'Rice',
      basis: 'g',
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'cooked',
    });
    const b = foodExactKey({
      lang: 'en',
      name: 'rice',
      basis: 'g',
      productIdentity: 'RICE',
      preparationIdentity: 'BOILED',
      weighingState: 'cooked',
    });
    expect(a).toBe(b);
  });

  it('exposes weighing states', () => {
    expect(WEIGHING_STATES).toContain('raw');
    expect(WEIGHING_STATES).toContain('cooked');
    expect(WEIGHING_STATES).toContain('not_applicable');
  });

  it('normalizes food identity without folding weighing state', () => {
    const result = normalizeFoodIdentity({
      lang: 'ar',
      name: 'أرز',
      basis: 'g',
      productIdentity: 'rice',
      preparationIdentity: 'boiled',
      weighingState: 'raw',
    });
    expect(result.name).toBe('ارز');
    expect(result.weighingState).toBe('raw');
  });
});
