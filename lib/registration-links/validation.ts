import { BIGINT_MAX } from '../packages/validation';
import { parseMinorUnits } from '../registration-approval/money';
export { isUuid } from '../packages/validation';
export type Installment = {
  seq: number;
  amountMinor: string;
  dueOffsetDays: number;
};
export type PaymentTerms = {
  upfrontAmountMinor: string;
  totalPaymentCount: number;
  installments: Installment[];
};
export function parsePaymentTerms(
  value: unknown,
  price?: string,
): PaymentTerms | null | undefined {
  if (value === null) return null;
  if (
    !exactKeys(value, [
      'upfrontAmountMinor',
      'totalPaymentCount',
      'installments',
    ]) ||
    parseMinorUnits(value.upfrontAmountMinor) === null ||
    typeof value.totalPaymentCount !== 'number' ||
    !Number.isSafeInteger(value.totalPaymentCount)
  )
    return undefined;
  const rows = parseSchedule(value.installments, price);
  const first = rows?.[0];
  if (
    !rows ||
    !first ||
    value.totalPaymentCount !== rows.length ||
    BigInt(value.upfrontAmountMinor as string) !== BigInt(first.amountMinor)
  )
    return undefined;
  return {
    upfrontAmountMinor: value.upfrontAmountMinor as string,
    totalPaymentCount: value.totalPaymentCount,
    installments: rows,
  };
}
export function createDefaultPaymentTerms(
  price: unknown,
  upfrontAmountMinor: unknown,
): PaymentTerms | undefined {
  const amount = parseMinorUnits(price);
  const upfront = parseMinorUnits(upfrontAmountMinor);
  if (amount === null || upfront === null || BigInt(upfront) > BigInt(amount))
    return undefined;
  const remainder = BigInt(amount) - BigInt(upfront);
  const installments: Installment[] = [
    { seq: 1, amountMinor: upfront, dueOffsetDays: 0 },
  ];
  // Seq 1 is collected at approval. Later offsets are Cairo calendar days
  // from activation, payable through the resulting Cairo day-end. Issuance
  // cannot assign absolute due dates before the P4 activation fact exists.
  if (remainder > 0n)
    installments.push({
      seq: 2,
      amountMinor: String(remainder),
      dueOffsetDays: 30,
    });
  return {
    upfrontAmountMinor: upfront,
    totalPaymentCount: installments.length,
    installments,
  };
}
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
