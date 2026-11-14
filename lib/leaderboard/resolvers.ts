import type {
  MeasurementBaselineRow,
  MeasurementHistoryRow,
  WeeklyAdherenceRow,
} from '../progress-coaching/contract';

/**
 * Plug points for the three F24 score inputs that no approved spec defines
 * yet. Each PO decision is implemented as exactly one resolver and registered
 * in `LEADERBOARD_RESOLVERS` below; nothing else in the pipeline changes.
 *
 * - `goalProgress`    FR-018: improvement versus baseline, normalized per
 *                     goal type, on [0, 1]. Open: goal-type source and the
 *                     per-type formula (no goal-type field exists on main;
 *                     F15 T01 is free text).
 * - `achievementDate` FR-021 second tie-break. Open: what "achievement date"
 *                     means.
 * - `clientCode`      FR-021 final tie-break. Open: no client code exists on
 *                     main.
 *
 * While any resolver is `null` the spec 023 source throws
 * `LeaderboardInputsUnresolvedError` before reading any data, so candidate
 * generation fails closed and stores nothing.
 *
 * Resolvers are server-only. Their inputs and outputs never reach a DTO, an
 * audit payload or a log line (FR-023, FR-024, FR-040).
 */

/** Spec 023 rows for one client, already restricted to that client. */
export type ClientProgressData = {
  clientId: string;
  /** Submitted weekly check-ins due inside the result-month window. */
  adherence: readonly WeeklyAdherenceRow[];
  /** Measurements recorded inside the result-month window. */
  measurements: readonly MeasurementHistoryRow[];
  /** First and latest value per measurement type, as of the window end. */
  baselines: readonly MeasurementBaselineRow[];
};

export type LeaderboardResolverInput = {
  workspaceId: string;
  /** First day of the result month (YYYY-MM-01, Africa/Cairo). */
  periodMonth: string;
  /** Result-month window clipped to today (Cairo dates, inclusive). */
  window: { from: string; to: string };
  /** Only clients that are eligible and have current-month adherence. */
  clients: readonly ClientProgressData[];
};

/**
 * Batch and async so an implementation can load extra facts once (for
 * example a goal type, or a client code column). A client missing from the
 * returned map is omitted from the candidate, never guessed.
 */
export interface LeaderboardInputResolver<T> {
  resolve(input: LeaderboardResolverInput): Promise<ReadonlyMap<string, T>>;
}

export type LeaderboardResolvers = {
  /** FR-018 normalized goal-relative progress, [0, 1]. */
  goalProgress: LeaderboardInputResolver<number> | null;
  /** FR-021 achievement date, Cairo YYYY-MM-DD. */
  achievementDate: LeaderboardInputResolver<string> | null;
  /** FR-021 client code (ordinal comparison). */
  clientCode: LeaderboardInputResolver<string> | null;
};

export type UnresolvedLeaderboardInput =
  'goal_progress_normalization' | 'achievement_date' | 'client_code';

export function missingResolvers(
  resolvers: LeaderboardResolvers,
): UnresolvedLeaderboardInput[] {
  const missing: UnresolvedLeaderboardInput[] = [];
  if (!resolvers.goalProgress) missing.push('goal_progress_normalization');
  if (!resolvers.achievementDate) missing.push('achievement_date');
  if (!resolvers.clientCode) missing.push('client_code');
  return missing;
}

/**
 * Production registry. All three stay `null` until the PO decides them
 * (PO-DECISION-NEEDED: FR-018 normalization per goal type; FR-021 achievement
 * date and client code). Do not register a guessed formula.
 */
export const LEADERBOARD_RESOLVERS: Readonly<LeaderboardResolvers> =
  Object.freeze({
    goalProgress: null,
    achievementDate: null,
    clientCode: null,
  });
