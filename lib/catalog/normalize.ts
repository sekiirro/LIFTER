export type CatalogLocale = 'ar' | 'en';

export type WeighingState = 'raw' | 'cooked' | 'not_applicable';

export const WEIGHING_STATES: readonly WeighingState[] = [
  'raw',
  'cooked',
  'not_applicable',
];

export type FoodBasis = 'g' | 'ml';

export type FoodIdentityDimensions = {
  lang: CatalogLocale;
  name: string;
  basis: FoodBasis;
  productIdentity: string;
  preparationIdentity: string;
  weighingState: WeighingState;
};

export type NormalizedFoodIdentity = {
  lang: CatalogLocale;
  name: string;
  basis: FoodBasis;
  productIdentity: string;
  preparationIdentity: string;
  weighingState: WeighingState;
};

const ALEF_HAMZA_PATTERN = /[أإآٱ]/g;
const TA_MARBUTA_PATTERN = /ة/g;
const ALEF_MAQSURA_PATTERN = /ى/g;
const TATWEEL_PATTERN = /\u0640/g;
const ARABIC_DIACRITICS_PATTERN = /[\u064B-\u065F\u0670]/g;

export function normalizeArEnV1(input: string): string {
  if (typeof input !== 'string') {
    throw new TypeError('normalizeArEnV1 expects a string');
  }

  let text = input.normalize('NFC');

  // Alef / hamza variants -> alef.
  text = text.replace(ALEF_HAMZA_PATTERN, 'ا');

  // Ta marbuta -> ha.
  text = text.replace(TA_MARBUTA_PATTERN, 'ه');

  // Alef maqsura -> ya.
  text = text.replace(ALEF_MAQSURA_PATTERN, 'ي');

  // Remove tatweel (kashida).
  text = text.replace(TATWEEL_PATTERN, '');

  // Strip Arabic diacritics (tashkeel).
  text = text.replace(ARABIC_DIACRITICS_PATTERN, '');

  // Locale-independent case folding for Latin.
  text = text.toLowerCase();

  return text;
}

export function normalizeFoodIdentity(
  input: FoodIdentityDimensions,
): NormalizedFoodIdentity {
  return {
    lang: input.lang,
    name: normalizeArEnV1(input.name),
    basis: input.basis,
    productIdentity: normalizeArEnV1(input.productIdentity),
    preparationIdentity: normalizeArEnV1(input.preparationIdentity),
    weighingState: input.weighingState,
  };
}

export function foodExactKey(input: FoodIdentityDimensions): string {
  const normalized = normalizeFoodIdentity(input);
  return [
    normalized.lang,
    normalized.name,
    normalized.basis,
    normalized.productIdentity,
    normalized.preparationIdentity,
    normalized.weighingState,
  ].join('\u001f');
}

// Compatibility aliases.
export const normalizeArEn = normalizeArEnV1;
export const normalizeCatalogText = normalizeArEnV1;
export const normalize_ar_en_v1 = normalizeArEnV1;
export const normalizeArabicEnglish = normalizeArEnV1;
export const normalize = normalizeArEnV1;
