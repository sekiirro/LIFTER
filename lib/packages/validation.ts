export const PRESET_MONTHS = [1, 3, 6, 8, 12] as const;
export const TIER_RANKS = [1, 2, 3] as const;
export const BIGINT_MAX = 9223372036854775807n;
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function parseCode(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
    ? value
    : null;
}
export function parseInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value === 'string') {
    if (!/^[0-9]+$/.test(value)) return null;
    value = Number(value);
  }
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}
export function parsePrice(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    value = String(value);
  }
  if (typeof value === 'bigint') value = String(value);
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const amount = BigInt(value);
  return amount > 0n && amount <= BIGINT_MAX ? String(amount) : null;
}
function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    [...value].length >= 1 &&
    [...value].length <= 120 &&
    /\S/u.test(value)
  );
}
export type PackageTerms = {
  tierRank: (typeof TIER_RANKS)[number];
  durationMonths: number | null;
  durationDays: number;
  nameAr: string;
  nameEn: string;
  priceMinor: string;
  currency: string;
  commissionRateBp: number;
};
export function parseTerms(
  input: Record<string, unknown>,
): PackageTerms | null {
  const tierRank = parseInteger(input.tierRank, 1, 3);
  const durationDays = parseInteger(input.durationDays, 1, 2147483647);
  const durationMonths =
    input.durationMonths === null
      ? null
      : parseInteger(input.durationMonths, 1, 12);
  const priceMinor = parsePrice(input.priceMinor);
  const commissionRateBp = parseInteger(input.commissionRateBp, 0, 10000);
  if (
    tierRank === null ||
    durationDays === null ||
    (input.durationMonths !== null && durationMonths === null) ||
    (durationMonths !== null &&
      (!PRESET_MONTHS.some((m) => m === durationMonths) ||
        durationDays !== durationMonths * 30)) ||
    !isName(input.nameAr) ||
    !isName(input.nameEn) ||
    priceMinor === null ||
    typeof input.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    commissionRateBp === null
  )
    return null;
  return {
    tierRank: tierRank as (typeof TIER_RANKS)[number],
    durationDays,
    durationMonths,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    priceMinor,
    currency: input.currency,
    commissionRateBp,
  };
}
export function inputRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}
