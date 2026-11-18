/**
 * FR-036, FR-039, FR-040: F24 audit events are appended to the spec 005
 * `public.audit_events` table inside the same database transaction as the
 * change (see `20261203000000_f24_client_leaderboard.sql` and
 * `20261203000100_f24_client_goal_types.sql`). This module is the
 * reviewed allow-list for those events: actor, time, workspace and target are
 * columns; `details` may carry only the keys listed here. Usernames, scores,
 * score inputs, health values and formula terms are never audit details.
 */
export const LEADERBOARD_AUDIT_EVENTS = {
  'leaderboard.publication_approved': {
    targetTable: 'leaderboard_publications',
    detailKeys: ['period_month', 'entry_count'],
  },
  'leaderboard.publication_rejected': {
    targetTable: 'leaderboard_publications',
    detailKeys: ['period_month', 'entry_count'],
  },
  'leaderboard.client_opted_out': {
    targetTable: 'clients',
    detailKeys: [],
  },
  'client.username_changed': {
    targetTable: 'clients',
    detailKeys: [],
  },
  // FR-018 goal type (PO 2026-11-14): coaching data, so the value is not a detail.
  'client.goal_type_changed': {
    targetTable: 'clients',
    detailKeys: [],
  },
} as const satisfies Record<
  string,
  { targetTable: string; detailKeys: readonly string[] }
>;

export type LeaderboardAuditAction = keyof typeof LEADERBOARD_AUDIT_EVENTS;

export const FORBIDDEN_AUDIT_DETAIL_KEYS = [
  'username',
  'username_normalized',
  'score',
  'composite',
  'adherence',
  'workoutAdherence',
  'dietAdherence',
  'normalizedProgress',
  'progress',
  'weight',
  'measurement',
  'answers',
  'note',
  'goal_type',
] as const;

/** True when a details object contains only the allow-listed keys for the action. */
export function isAllowedAuditDetails(
  action: LeaderboardAuditAction,
  details: Record<string, unknown>,
): boolean {
  const allowed: readonly string[] =
    LEADERBOARD_AUDIT_EVENTS[action].detailKeys;
  return Object.keys(details).every((key) => allowed.includes(key));
}
