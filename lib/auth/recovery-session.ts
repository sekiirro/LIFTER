// Technical default: a recovery session may set a password only shortly after the link was verified.
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
