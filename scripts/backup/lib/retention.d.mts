/** Returns retained epoch-millisecond timestamps. Current UTC day/week/month count as bucket one. */
export function selectRetained(dates: Date[], now?: Date): Set<number>;
export function shouldPrune(
  idDate: Date,
  retained: boolean,
  complete: boolean,
  now?: Date,
): boolean;
