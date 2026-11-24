/** The fixed retention period approved for the S70 purge clocks. */
export const RETENTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns whether data tied to a closed account has completed the full
 * retention period. A missing closure timestamp represents an active account.
 */
export function isClosureRetentionEligible(
  closedAt: Date | null,
  sampledAt: Date,
): boolean {
  if (!closedAt) return false;
  return hasElapsedRetentionPeriod(closedAt, sampledAt);
}

/** Returns whether an audit event has completed the clock from its creation. */
export function isAuditRetentionEligible(
  createdAt: Date,
  sampledAt: Date,
): boolean {
  return hasElapsedRetentionPeriod(createdAt, sampledAt);
}

function hasElapsedRetentionPeriod(startedAt: Date, sampledAt: Date): boolean {
  const start = startedAt.getTime();
  const sample = sampledAt.getTime();

  return (
    Number.isFinite(start) &&
    Number.isFinite(sample) &&
    sample - start >= RETENTION_PERIOD_MS
  );
}
