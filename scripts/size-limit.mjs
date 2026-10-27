/**
 * @param {number} sizeKiB
 * @param {number} limitKiB
 */
export function evaluate(sizeKiB, limitKiB) {
  if (!Number.isFinite(sizeKiB) || sizeKiB < 0) {
    throw new RangeError('sizeKiB must be a finite non-negative number');
  }
  if (!Number.isFinite(limitKiB) || limitKiB <= 0) {
    throw new RangeError('limitKiB must be a finite positive number');
  }

  return { pct: (sizeKiB / limitKiB) * 100, over: sizeKiB > limitKiB };
}
