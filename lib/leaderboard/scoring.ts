import { assertScoreInputs, type LeaderboardScoreInputs } from './score-inputs';

/**
 * FR-015-FR-017, FR-021: server-only scoring. The composite weights adherence
 * and goal-relative progress equally (S55-PO-3 Q1). Adherence is the mean of
 * the two spec 023 answers (0-10), scaled to [0, 1] so both halves share the
 * progress scale. Nothing here is ever rendered or logged.
 */
export const ADHERENCE_WEIGHT = 0.5;
export const PROGRESS_WEIGHT = 0.5;
const SCORE_EPSILON = 1e-12;

export type ScoredCandidate = {
  clientId: string;
  clientCode: string;
  composite: number;
  /** Mean of the two adherence answers, 0-10. */
  adherence: number;
  achievedOn: string;
};

export function adherenceOf(inputs: LeaderboardScoreInputs): number {
  return (inputs.workoutAdherence + inputs.dietAdherence) / 2;
}

export function scoreCandidate(
  inputs: LeaderboardScoreInputs,
): ScoredCandidate {
  assertScoreInputs(inputs);
  const adherence = adherenceOf(inputs);
  return {
    clientId: inputs.clientId,
    clientCode: inputs.clientCode,
    composite:
      ADHERENCE_WEIGHT * (adherence / 10) +
      PROGRESS_WEIGHT * inputs.normalizedProgress,
    adherence,
    achievedOn: inputs.achievedOn,
  };
}

/** Negative when `left` has the strictly higher composite score. */
export function compareScores(
  left: ScoredCandidate,
  right: ScoredCandidate,
): number {
  const difference = right.composite - left.composite;
  return Math.abs(difference) <= SCORE_EPSILON ? 0 : difference;
}

/**
 * Total order: higher composite, then FR-021 tie-breaks — higher adherence,
 * earlier achievement date, then client code (ordinal, locale-independent).
 */
export function compareCandidates(
  left: ScoredCandidate,
  right: ScoredCandidate,
): number {
  const byScore = compareScores(left, right);
  if (byScore !== 0) return byScore;
  if (left.adherence !== right.adherence)
    return right.adherence - left.adherence;
  if (left.achievedOn !== right.achievedOn)
    return left.achievedOn < right.achievedOn ? -1 : 1;
  if (left.clientCode !== right.clientCode)
    return left.clientCode < right.clientCode ? -1 : 1;
  return 0;
}
