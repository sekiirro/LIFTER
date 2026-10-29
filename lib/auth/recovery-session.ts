// PO ND-F4-3 (2026-10-29): a recovery session may set a password for 15 minutes after link verification, in all environments; independent of the 60-minute link expiry.
export const RECOVERY_SESSION_MAX_AGE_SECONDS = 900;

export function isRecoverySession(amr: unknown, nowSeconds: number): boolean {
  if (
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 0 ||
    !Array.isArray(amr) ||
    amr.length === 0
  )
    return false;
  let latestTimestamp = -1;
  let recovery = false;
  let ambiguous = false;
  for (const entry of amr) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.method !== 'string' ||
      entry.method.length === 0 ||
      !Number.isSafeInteger(entry.timestamp) ||
      entry.timestamp < 0
    )
      return false;
    if (entry.timestamp > latestTimestamp) {
      latestTimestamp = entry.timestamp;
      recovery = entry.method === 'otp' || entry.method === 'recovery';
      ambiguous = false;
    } else if (entry.timestamp === latestTimestamp) {
      // An ambiguous latest method cannot establish recovery authorization.
      ambiguous = true;
    }
  }
  const age = nowSeconds - latestTimestamp;
  return (
    recovery &&
    !ambiguous &&
    age >= -60 &&
    age <= RECOVERY_SESSION_MAX_AGE_SECONDS
  );
}
