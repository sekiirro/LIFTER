/**
 * Exact numeric parsing and formatting for monetary minor units.
 * Never uses JavaScript floating point arithmetic.
 */

const DECIMAL_REGEX = /^(-?\d+)(?:\.(\d+))?$/;

/**
 * Converts a decimal string (up to 2 fractional digits) into minor units (bigint).
 * Returns null if the string is not a valid decimal or has more than 2 decimal places.
 */
export function decimalToMinorUnits(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = DECIMAL_REGEX.exec(trimmed);
  if (!match) return null;

  const integerStr = match[1]!;
  const fractionStr = match[2] ?? '';

  if (fractionStr.length > 2) {
    return null;
  }

  const isNegative = integerStr.startsWith('-');
  const absIntegerStr = isNegative ? integerStr.slice(1) : integerStr;

  const integerPart = BigInt(absIntegerStr);
  const fractionPart = BigInt(fractionStr.padEnd(2, '0'));

  const totalMinor = integerPart * 100n + fractionPart;
  return isNegative ? -totalMinor : totalMinor;
}

/**
 * Converts minor units (bigint or string) to a canonical 2-decimal string.
 */
export function minorUnitsToDecimal(minor: bigint | string): string {
  const amount = typeof minor === 'string' ? BigInt(minor) : minor;
  const isNegative = amount < 0n;
  const absAmount = isNegative ? -amount : amount;

  const integerPart = (absAmount / 100n).toString();
  const fractionPart = (absAmount % 100n).toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${integerPart}.${fractionPart}`;
}

/**
 * Validates whether a currency is valid for a given market.
 * Egypt: EGP only.
 * International: EGP, USD, SAR.
 */
export function isAllowedCurrencyForMarket(
  market: 'Egypt' | 'International',
  currency: string,
): boolean {
  if (market === 'Egypt') {
    return currency === 'EGP';
  }
  if (market === 'International') {
    return ['EGP', 'USD', 'SAR'].includes(currency);
  }
  return false;
}
