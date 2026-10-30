import {
  normalizeBrandDraft,
  type NormalizedBrandingDraft,
} from './validation';

export type PersistedBrandingFields = {
  name: { ar: string; en: string };
  bannerAlt?: { ar: string; en: string };
  color: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

export function toPersistedBrandingFields(
  fields: NormalizedBrandingDraft,
): PersistedBrandingFields {
  if (
    !exactKeys(fields as unknown as Record<string, unknown>, [
      'names',
      'color',
      ...(fields.bannerAltText ? ['bannerAltText'] : []),
      ...(fields.logoAssetId ? ['logoAssetId'] : []),
      ...(fields.bannerAssetId ? ['bannerAssetId'] : []),
    ])
  ) {
    throw new Error('Branding TypeScript contract drift');
  }
  return {
    name: fields.names,
    color: fields.color,
    ...(fields.bannerAltText ? { bannerAlt: fields.bannerAltText } : {}),
  };
}

export function fromPersistedBrandingFields(
  value: unknown,
): NormalizedBrandingDraft {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['name', 'bannerAlt', 'color']) ||
    !isRecord(value.name) ||
    !exactKeys(value.name, ['ar', 'en']) ||
    !isRecord(value.bannerAlt) ||
    !exactKeys(value.bannerAlt, ['ar', 'en']) ||
    typeof value.color !== 'string'
  ) {
    throw new Error('Persisted branding SQL contract drift');
  }
  const hasBannerAlt =
    (typeof value.bannerAlt.ar === 'string' &&
      value.bannerAlt.ar.trim().length > 0) ||
    (typeof value.bannerAlt.en === 'string' &&
      value.bannerAlt.en.trim().length > 0);
  return normalizeBrandDraft({
    names: value.name,
    ...(hasBannerAlt ? { bannerAltText: value.bannerAlt } : {}),
    color: value.color,
  });
}
