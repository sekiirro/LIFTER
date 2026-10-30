export type BrandLocale = 'ar' | 'en';

export type BrandingDraftInput = {
  names: Partial<Record<BrandLocale, string>>;
  color: string;
  logoAssetId?: string | null;
  bannerAssetId?: string | null;
  bannerAltText?: Partial<Record<BrandLocale, string>>;
};

export type NormalizedBrandingDraft = {
  names: Record<BrandLocale, string>;
  color: `#${string}`;
  logoAssetId?: string;
  bannerAssetId?: string;
  bannerAltText?: Record<BrandLocale, string>;
};

export class BrandingValidationError extends Error {
  readonly code = 'invalid_branding';

  constructor(message: string) {
    super(message);
    this.name = 'BrandingValidationError';
  }
}

const allowedFields = new Set([
  'names',
  'color',
  'logoAssetId',
  'bannerAssetId',
  'bannerAltText',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLocalizedText(
  value: unknown,
  label: string,
): Partial<Record<BrandLocale, string>> {
  if (!isRecord(value)) {
    throw new BrandingValidationError(`${label} must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (key !== 'ar' && key !== 'en') {
      throw new BrandingValidationError(`${label} has an unsupported locale`);
    }
  }

  const result: Partial<Record<BrandLocale, string>> = {};
  for (const locale of ['ar', 'en'] as const) {
    const text = value[locale];
    if (text === undefined || text === null) continue;
    if (typeof text !== 'string') {
      throw new BrandingValidationError(`${label} values must be text`);
    }
    const normalized = text.trim();
    if (normalized) result[locale] = normalized;
  }
  return result;
}

function withLocaleFallback(
  value: Partial<Record<BrandLocale, string>>,
  label: string,
): Record<BrandLocale, string> {
  const fallback = value.ar ?? value.en;
  if (!fallback) {
    throw new BrandingValidationError(
      `At least one ${label} locale is required`,
    );
  }
  return { ar: value.ar ?? fallback, en: value.en ?? fallback };
}

function optionalAssetId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BrandingValidationError(`${label} must be a string`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}

export function normalizeBrandDraft(input: unknown): NormalizedBrandingDraft {
  if (!isRecord(input)) {
    throw new BrandingValidationError('Branding draft must be an object');
  }

  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) {
      throw new BrandingValidationError(`Unsupported branding field: ${key}`);
    }
  }

  const names = withLocaleFallback(
    normalizeLocalizedText(input.names, 'name'),
    'name',
  );
  if (typeof input.color !== 'string' || !/^#[\da-f]{6}$/i.test(input.color)) {
    throw new BrandingValidationError('Brand color must use #RRGGBB format');
  }

  const logoAssetId = optionalAssetId(input.logoAssetId, 'Logo asset id');
  const bannerAssetId = optionalAssetId(input.bannerAssetId, 'Banner asset id');
  let bannerAltText: Record<BrandLocale, string> | undefined;
  if (input.bannerAltText !== undefined) {
    bannerAltText = withLocaleFallback(
      normalizeLocalizedText(input.bannerAltText, 'Banner alt text'),
      'banner alt text',
    );
  } else if (bannerAssetId) {
    throw new BrandingValidationError(
      'Banner alt text requires at least one locale',
    );
  }

  return {
    names,
    color: input.color.toUpperCase() as `#${string}`,
    ...(logoAssetId ? { logoAssetId } : {}),
    ...(bannerAssetId ? { bannerAssetId } : {}),
    ...(bannerAltText ? { bannerAltText } : {}),
  };
}
