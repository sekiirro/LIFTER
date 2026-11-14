/**
 * Typed boundary between F24 ranking and spec 023 progress/check-in data.
 *
 * Spec 023 owns the data; F24 is read-only with respect to it (FR-031). The
 * adapter is `spec023-source.ts`; it fails closed while the goal-progress
 * normalization, achievement date and client code remain undefined.
 *
 * These values are server-only. They never cross into a client DTO, an audit
 * payload or a log line (FR-023, FR-024, FR-040).
 */
export type LeaderboardScoreInputs = {
  clientId: string;
  /** Final FR-021 tie-break key. Source pending (no client code exists on main). */
  clientCode: string;
  /**
   * Spec 023 FR-037 `workoutAdherence`, current month, on the 0-10 scale
   * (mean of the month's answered 0-10 integer values; see spec023-source.ts).
   */
  workoutAdherence: number;
  /** Spec 023 FR-037 `dietAdherence`, current month, same scale and aggregation. */
  dietAdherence: number;
  /**
   * Goal-relative progress: improvement versus baseline normalized per goal
   * type (FR-018), on the closed interval [0, 1], current month.
   */
  normalizedProgress: number;
  /** FR-021 "achievement date" as a Cairo calendar date (YYYY-MM-DD). */
  achievedOn: string;
};

export type LeaderboardScoreRequest = {
  workspaceId: string;
  /** First day of the result month (YYYY-MM-01, Africa/Cairo). */
  periodMonth: string;
  /** Eligible clients only; the source must not widen this set. */
  clientIds: readonly string[];
};

export interface LeaderboardScoreInputSource {
  /**
   * Returns current-month inputs for the requested clients of one workspace.
   * A client without complete current-month inputs is omitted, never guessed.
   */
  loadScoreInputs(
    request: LeaderboardScoreRequest,
  ): Promise<readonly LeaderboardScoreInputs[]>;
}

const cairoDate = /^\d{4}-\d{2}-\d{2}$/u;

function isAdherence(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

/** Rejects any malformed input instead of coercing it. */
export function assertScoreInputs(
  inputs: LeaderboardScoreInputs,
): LeaderboardScoreInputs {
  if (
    typeof inputs.clientId !== 'string' ||
    inputs.clientId.length === 0 ||
    typeof inputs.clientCode !== 'string' ||
    inputs.clientCode.length === 0 ||
    !isAdherence(inputs.workoutAdherence) ||
    !isAdherence(inputs.dietAdherence) ||
    typeof inputs.normalizedProgress !== 'number' ||
    !Number.isFinite(inputs.normalizedProgress) ||
    inputs.normalizedProgress < 0 ||
    inputs.normalizedProgress > 1 ||
    typeof inputs.achievedOn !== 'string' ||
    !cairoDate.test(inputs.achievedOn)
  )
    throw new RangeError('Invalid leaderboard score inputs');
  return inputs;
}
