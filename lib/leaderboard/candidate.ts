import {
  deriveLeaderboardEligibility,
  type LeaderboardEligibilityFacts,
} from './eligibility';
import { rankLeaderboard, type RankedCandidate } from './ranking';
import type { LeaderboardScoreInputSource } from './score-inputs';

/**
 * Server-side candidate pipeline: eligibility (F13 facts) -> current-month
 * inputs (spec 023 via the injected source) -> ranking. Opted-out and
 * ineligible clients are filtered before any score input is requested.
 */
export async function buildLeaderboardCandidate(input: {
  workspaceId: string;
  periodMonth: string;
  pool: readonly LeaderboardEligibilityFacts[];
  incumbentClientIds: readonly string[];
  source: LeaderboardScoreInputSource;
}): Promise<RankedCandidate[]> {
  const eligible = input.pool
    .filter((facts) => deriveLeaderboardEligibility(facts).eligible)
    .map((facts) => facts.clientId);
  if (eligible.length === 0) return [];
  const allowed = new Set(eligible);
  const inputs = await input.source.loadScoreInputs({
    workspaceId: input.workspaceId,
    periodMonth: input.periodMonth,
    clientIds: eligible,
  });
  if (inputs.some((row) => !allowed.has(row.clientId)))
    throw new RangeError('Score source returned a client outside the pool');
  return rankLeaderboard(
    inputs,
    input.incumbentClientIds.filter((id) => allowed.has(id)),
  );
}
