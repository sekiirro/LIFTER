import {
  compareCandidates,
  compareScores,
  scoreCandidate,
  type ScoredCandidate,
} from './scoring';
import type { LeaderboardScoreInputs } from './score-inputs';

export const LEADERBOARD_SIZE = 5;

export type RankedCandidate = { rank: number; clientId: string };

/**
 * FR-002, FR-019, S55-PO-6 Q12. Every input row is an eligible client scored
 * on current-month data, incumbents included. A past winner (an entry of the
 * currently approved list that is still eligible) keeps a slot until a new
 * candidate's current score is strictly higher; equal scores never displace
 * a past winner. Selected clients are then ordered by the full FR-021 order.
 *
 * Only `{ rank, clientId }` leaves this function: scores stay server-side.
 */
export function rankLeaderboard(
  inputs: readonly LeaderboardScoreInputs[],
  incumbentClientIds: readonly string[],
): RankedCandidate[] {
  const scored = inputs.map(scoreCandidate);
  const ids = new Set<string>();
  for (const candidate of scored) {
    if (ids.has(candidate.clientId))
      throw new RangeError('Duplicate leaderboard candidate');
    ids.add(candidate.clientId);
  }
  const incumbents = new Set(incumbentClientIds);
  const ordered = [...scored].sort(compareCandidates);

  const selected: ScoredCandidate[] = ordered
    .filter((candidate) => incumbents.has(candidate.clientId))
    .slice(0, LEADERBOARD_SIZE);
  const challengers = ordered.filter(
    (candidate) => !incumbents.has(candidate.clientId),
  );

  for (const challenger of challengers) {
    if (selected.length < LEADERBOARD_SIZE) {
      selected.push(challenger);
      continue;
    }
    const weakestIncumbent = selected
      .filter((candidate) => incumbents.has(candidate.clientId))
      .sort(compareCandidates)
      .at(-1);
    // Challengers arrive best-first, so once one cannot displace, none can.
    if (!weakestIncumbent || compareScores(challenger, weakestIncumbent) >= 0)
      break;
    selected.splice(selected.indexOf(weakestIncumbent), 1, challenger);
  }

  return selected.sort(compareCandidates).map((candidate, index) => ({
    rank: index + 1,
    clientId: candidate.clientId,
  }));
}
