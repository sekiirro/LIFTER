export type LinkTimes = {
  expiresAt: string | number;
  openedAt: string | number | null;
  consumedAt: string | number | null;
};
const instant = (v: string | number) =>
  typeof v === 'number' ? v : Date.parse(v);
export function registrationLinkValidity(times: LinkTimes, now: number) {
  const expiry = instant(times.expiresAt),
    opened = times.openedAt === null ? null : instant(times.openedAt);
  const validUntil =
    opened !== null && opened < expiry
      ? Math.max(expiry, opened + 30 * 60 * 1000)
      : expiry;
  return {
    valid:
      times.consumedAt === null &&
      Number.isFinite(now) &&
      Number.isFinite(expiry) &&
      (opened === null || Number.isFinite(opened)) &&
      now < validUntil,
    validUntil,
  };
}
export function registrationLinkStatus(times: LinkTimes, now: number) {
  if (times.consumedAt !== null) return 'consumed';
  if (!registrationLinkValidity(times, now).valid) return 'expired';
  return times.openedAt === null ? 'valid' : 'opened';
}
