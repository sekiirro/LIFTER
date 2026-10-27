import { BIGINT_MAX } from '../packages/validation';
export { isUuid } from '../packages/validation';
export type Installment = {
  seq: number;
  amountMinor: string;
  dueOffsetDays: number;
};
export function exactAmount(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9]+$/.test(value) &&
    value.replace(/^0+/, '').length <= 19 &&
    BigInt(value) > 0n &&
    BigInt(value) <= BIGINT_MAX
  );
}
export function exactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k))
  );
}
export function parseSchedule(
  value: unknown,
  price?: string,
): Installment[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || !value.length) return undefined;
  let sum = 0n,
    previous = -1;
  const result: Installment[] = [];
  for (const [i, row] of value.entries()) {
    if (
      !exactKeys(row, ['seq', 'amountMinor', 'dueOffsetDays']) ||
      row.seq !== i + 1 ||
      !exactAmount(row.amountMinor) ||
      typeof row.dueOffsetDays !== 'number' ||
      !Number.isSafeInteger(row.dueOffsetDays) ||
      row.dueOffsetDays <= previous ||
      row.dueOffsetDays > 2147483647
    )
      return undefined;
    sum += BigInt(row.amountMinor);
    previous = row.dueOffsetDays;
    result.push({
      seq: i + 1,
      amountMinor: row.amountMinor,
      dueOffsetDays: previous,
    });
  }
  if (price !== undefined && (!exactAmount(price) || sum !== BigInt(price)))
    return undefined;
  return result;
}
