/**
 * F24 eligibility (FR-010-FR-014) over facts owned by other features. The F13
 * entitlement projection supplies the status and the accrued active-day count
 * (frozen days are not active days, so a freeze pauses accrual); this module
 * never re-derives subscription, freeze or renewal lifecycles. A delivered
 * plan is deliberately not an input (FR-014).
 */
export const LEADERBOARD_MIN_ACTIVE_DAYS = 14;

export const F13_ENTITLEMENT_STATUSES = [
  'awaiting_activation',
  'future',
  'active',
  'frozen',
  'expired',
  'refunded',
] as const;
export type F13EntitlementStatus = (typeof F13_ENTITLEMENT_STATUSES)[number];

export type LeaderboardEligibilityFacts = {
  clientId: string;
  /** F13 projection for the evaluation day; null when no initial subscription exists. */
  entitlementStatus: F13EntitlementStatus | null;
  /** Days on which the F13 projection was `active`, capped by the source at the minimum. */
  activeDays: number;
  optedOut: boolean;
  /** Display identity is the username only (FR-022); none means nothing to display. */
  hasUsername: boolean;
};

export type LeaderboardIneligibleReason =
  | 'opted_out'
  | 'no_subscription'
  | 'not_active'
  | 'insufficient_active_days'
  | 'no_username';

export type LeaderboardEligibility =
  { eligible: true } | { eligible: false; reason: LeaderboardIneligibleReason };

export function deriveLeaderboardEligibility(
  facts: LeaderboardEligibilityFacts,
): LeaderboardEligibility {
  if (!Number.isSafeInteger(facts.activeDays) || facts.activeDays < 0)
    throw new RangeError('Active days must be a non-negative safe integer');
  if (facts.optedOut) return { eligible: false, reason: 'opted_out' };
  if (facts.entitlementStatus === null)
    return { eligible: false, reason: 'no_subscription' };
  // FR-012: a frozen subscription is not eligible during the freeze.
  if (facts.entitlementStatus !== 'active')
    return { eligible: false, reason: 'not_active' };
  if (facts.activeDays < LEADERBOARD_MIN_ACTIVE_DAYS)
    return { eligible: false, reason: 'insufficient_active_days' };
  if (!facts.hasUsername) return { eligible: false, reason: 'no_username' };
  return { eligible: true };
}

/** Strict parser for the PO-only `leaderboard_candidate_pool` RPC rows. */
export function parseEligibilityPool(
  value: unknown,
): LeaderboardEligibilityFacts[] | null {
  if (!Array.isArray(value)) return null;
  const rows: LeaderboardEligibilityFacts[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    const status = record.entitlement_status;
    if (
      typeof record.client_id !== 'string' ||
      !(
        status === null ||
        (F13_ENTITLEMENT_STATUSES as readonly unknown[]).includes(status)
      ) ||
      typeof record.active_days !== 'number' ||
      !Number.isSafeInteger(record.active_days) ||
      record.active_days < 0 ||
      typeof record.opted_out !== 'boolean' ||
      typeof record.has_username !== 'boolean'
    )
      return null;
    rows.push({
      clientId: record.client_id,
      entitlementStatus: status as F13EntitlementStatus | null,
      activeDays: record.active_days,
      optedOut: record.opted_out,
      hasUsername: record.has_username,
    });
  }
  return rows;
}
