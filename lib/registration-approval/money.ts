const BIGINT_MAX = 9223372036854775807n;

/** Parses a positive canonical decimal string within the database bigint range. */
export function parseMinorUnits(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const amount = BigInt(value);
  return amount <= BIGINT_MAX ? value : null;
}

export function calculateCommissionMinor(
  amountMinor: string,
  commissionRateBp: number,
): string {
  const amount = parseMinorUnits(amountMinor);
  if (
    amount === null ||
    !Number.isInteger(commissionRateBp) ||
    commissionRateBp < 0 ||
    commissionRateBp > 10000
  )
    throw new RangeError('invalid_input');

  return String((BigInt(amount) * BigInt(commissionRateBp) + 5000n) / 10000n);
}

/** Groups an exact minor-unit integer for display without currency assumptions. */
export function formatMinorUnits(value: string): string {
  const amount = parseMinorUnits(value);
  if (amount === null) throw new RangeError('invalid_input');
  return amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
