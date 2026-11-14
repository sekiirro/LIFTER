import { describe, expect, it } from 'vitest';
import { rankLeaderboard } from '../../lib/leaderboard/ranking';
import type { LeaderboardScoreInputs } from '../../lib/leaderboard/score-inputs';
import {
  compareCandidates,
  scoreCandidate,
} from '../../lib/leaderboard/scoring';

function inputs(
  clientId: string,
  patch: Partial<LeaderboardScoreInputs> = {},
): LeaderboardScoreInputs {
  return {
    clientId,
    clientCode: clientId,
    workoutAdherence: 5,
    dietAdherence: 5,
    normalizedProgress: 0.5,
    achievedOn: '2026-11-10',
    ...patch,
  };
}

describe('T017/T019 50/50 composite (FR-015-FR-017)', () => {
  it('weights the adherence mean and goal-relative progress equally', () => {
    expect(
      scoreCandidate(
        inputs('a', {
          workoutAdherence: 10,
          dietAdherence: 10,
          normalizedProgress: 0,
        }),
      ).composite,
    ).toBe(0.5);
    expect(
      scoreCandidate(
        inputs('a', {
          workoutAdherence: 0,
          dietAdherence: 0,
          normalizedProgress: 1,
        }),
      ).composite,
    ).toBe(0.5);
    const mixed = scoreCandidate(
      inputs('a', {
        workoutAdherence: 8,
        dietAdherence: 6,
        normalizedProgress: 0.4,
      }),
    );
    expect(mixed.adherence).toBe(7);
    expect(mixed.composite).toBeCloseTo(0.5 * 0.7 + 0.5 * 0.4, 12);
  });

  it('rejects inputs outside the spec 023 0-10 integer contract or [0,1] progress', () => {
    for (const patch of [
      { workoutAdherence: 11 },
      { dietAdherence: -1 },
      { workoutAdherence: 7.5 },
      { normalizedProgress: 1.01 },
      { normalizedProgress: Number.NaN },
      { achievedOn: '10/11/2026' },
      { clientCode: '' },
    ])
      expect(() => scoreCandidate(inputs('a', patch))).toThrow(RangeError);
  });
});

describe('T017 FR-021 tie-breaks', () => {
  it('orders equal scores by higher adherence, then earlier achievement date, then client code', () => {
    // Equal composite (0.5): adherence 10/progress 0 vs adherence 0/progress 1.
    const highAdherence = scoreCandidate(
      inputs('high', {
        workoutAdherence: 10,
        dietAdherence: 10,
        normalizedProgress: 0,
      }),
    );
    const lowAdherence = scoreCandidate(
      inputs('low', {
        workoutAdherence: 0,
        dietAdherence: 0,
        normalizedProgress: 1,
      }),
    );
    expect(compareCandidates(highAdherence, lowAdherence)).toBeLessThan(0);

    const earlier = scoreCandidate(inputs('x', { achievedOn: '2026-11-01' }));
    const later = scoreCandidate(inputs('y', { achievedOn: '2026-11-20' }));
    expect(compareCandidates(earlier, later)).toBeLessThan(0);

    const codeA = scoreCandidate(inputs('id-2', { clientCode: 'C-001' }));
    const codeB = scoreCandidate(inputs('id-1', { clientCode: 'C-002' }));
    expect(compareCandidates(codeA, codeB)).toBeLessThan(0);
  });
});

describe('T020 current-month ranking with incumbents (S55-PO-6 Q12)', () => {
  it('returns at most five rank/client rows and nothing else (FR-002, FR-024)', () => {
    const ranked = rankLeaderboard(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, index) =>
        inputs(id, { normalizedProgress: index / 10 }),
      ),
      [],
    );
    expect(ranked).toHaveLength(5);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(ranked.map((row) => row.clientId)).toEqual([
      'g',
      'f',
      'e',
      'd',
      'c',
    ]);
    for (const row of ranked)
      expect(Object.keys(row).sort()).toEqual(['clientId', 'rank']);
  });

  it('lists only the eligible clients when fewer than five exist', () => {
    expect(rankLeaderboard([inputs('a'), inputs('b')], [])).toHaveLength(2);
    expect(rankLeaderboard([], ['a'])).toEqual([]);
  });

  it('keeps a past winner until a new candidate scores strictly higher', () => {
    const incumbents = ['w1', 'w2', 'w3', 'w4', 'w5'];
    const winners = incumbents.map((id) =>
      inputs(id, { normalizedProgress: 0.5 }),
    );
    // Equal score with better tie-break data still does not displace.
    const equal = inputs('new-equal', {
      normalizedProgress: 0.5,
      achievedOn: '2026-11-01',
      clientCode: '0000',
    });
    const keep = rankLeaderboard([...winners, equal], incumbents);
    expect(keep.map((row) => row.clientId).sort()).toEqual(
      [...incumbents].sort(),
    );

    const higher = inputs('new-higher', { normalizedProgress: 0.9 });
    const weaker = winners.map((row, index) =>
      index === 4 ? { ...row, normalizedProgress: 0.1 } : row,
    );
    const replaced = rankLeaderboard([...weaker, higher], incumbents);
    expect(replaced[0]).toEqual({ rank: 1, clientId: 'new-higher' });
    expect(replaced.map((row) => row.clientId)).not.toContain('w5');
    expect(replaced).toHaveLength(5);
  });

  it('re-scores incumbents on current-month data and re-orders them', () => {
    const ranked = rankLeaderboard(
      [
        inputs('w1', { normalizedProgress: 0.1 }),
        inputs('w2', { normalizedProgress: 0.9 }),
      ],
      ['w1', 'w2'],
    );
    expect(ranked).toEqual([
      { rank: 1, clientId: 'w2' },
      { rank: 2, clientId: 'w1' },
    ]);
  });

  it('rejects duplicate candidates instead of double-ranking a client', () => {
    expect(() => rankLeaderboard([inputs('a'), inputs('a')], [])).toThrow(
      RangeError,
    );
  });
});
