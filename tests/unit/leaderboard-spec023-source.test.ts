import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeeklyAdherenceRow } from '../../lib/progress-coaching/contract';
import { buildLeaderboardCandidate } from '../../lib/leaderboard/candidate';
import {
  LeaderboardInputsUnresolvedError,
  LeaderboardSourceUnavailableError,
  aggregateMonthlyAdherence,
  createSpec023ScoreInputSource,
  resultMonthWindow,
  type ClientCodeResolver,
  type GoalProgressResolver,
} from '../../lib/leaderboard/spec023-source';

const ws = '11111111-1111-4111-8111-111111111111';
const c1 = '22222222-2222-4222-8222-222222222222';
const c2 = '33333333-3333-4333-8333-333333333333';
const foreign = '44444444-4444-4444-8444-444444444444';

function row(
  clientId: string,
  workout: number | null,
  diet: number | null,
  checkinDate = '2026-11-07',
): WeeklyAdherenceRow {
  return {
    clientId,
    assignmentId: '55555555-5555-4555-8555-555555555555',
    checkinDate,
    submittedAt: `${checkinDate}T10:00:00Z`,
    workoutAdherence: workout,
    dietAdherence: diet,
  };
}

function rpcClient(data: unknown, error: { code?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const resolvedProgress: GoalProgressResolver = {
  loadBaselines: vi.fn(async () => []),
  resolve: ({ clientId }) =>
    clientId === c1
      ? { normalizedProgress: 0.5, achievedOn: '2026-11-10' }
      : null,
};
const codes: ClientCodeResolver = {
  codesFor: async (_ws, ids) => new Map(ids.map((id) => [id, `code-${id}`])),
};
const request = {
  workspaceId: ws,
  periodMonth: '2026-11-01',
  clientIds: [c1, c2],
};
const now = () => new Date('2026-11-14T12:00:00Z');

describe('spec 023 adherence component', () => {
  it('averages the month’s complete check-ins per client and never zero-fills', () => {
    expect(
      aggregateMonthlyAdherence(
        [
          row(c1, 8, 6),
          row(c1, 6, 4, '2026-11-14'),
          row(c1, null, 9, '2026-11-21'),
          row(c2, null, null),
          row(foreign, 10, 10),
        ],
        [c1, c2],
      ),
    ).toEqual([
      { clientId: c1, workoutAdherence: 7, dietAdherence: 5, checkins: 2 },
    ]);
  });

  it('windows the current result month, clipped to today', () => {
    expect(resultMonthWindow('2026-11-01', '2026-11-14')).toEqual({
      from: '2026-11-01',
      to: '2026-11-14',
    });
    expect(resultMonthWindow('2026-02-01', '2026-03-05')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(() => resultMonthWindow('2026-12-01', '2026-11-14')).toThrow(
      RangeError,
    );
  });
});

describe('fail-closed adapter (PO-DECISION-NEEDED inputs)', () => {
  it('throws before reading any spec 023 data while progress or client code is unresolved', async () => {
    for (const options of [
      { goalProgress: null, clientCodes: null },
      { goalProgress: resolvedProgress, clientCodes: null },
      { goalProgress: null, clientCodes: codes },
    ]) {
      const { client, rpc } = rpcClient([]);
      const source = createSpec023ScoreInputSource({ client, now, ...options });
      await expect(source.loadScoreInputs(request)).rejects.toBeInstanceOf(
        LeaderboardInputsUnresolvedError,
      );
      expect(rpc).not.toHaveBeenCalled();
    }
    const { client } = rpcClient([]);
    await createSpec023ScoreInputSource({
      client,
      goalProgress: null,
      clientCodes: null,
    })
      .loadScoreInputs(request)
      .catch((error: LeaderboardInputsUnresolvedError) =>
        expect(error.missing).toEqual([
          'goal_progress_normalization',
          'achievement_date',
          'client_code',
        ]),
      );
  });

  it('generates no candidate through the pipeline when inputs are unresolved', async () => {
    const { client } = rpcClient([]);
    await expect(
      buildLeaderboardCandidate({
        workspaceId: ws,
        periodMonth: '2026-11-01',
        pool: [
          {
            clientId: c1,
            entitlementStatus: 'active',
            activeDays: 20,
            optedOut: false,
            hasUsername: true,
          },
        ],
        incumbentClientIds: [],
        source: createSpec023ScoreInputSource({
          client,
          goalProgress: null,
          clientCodes: null,
        }),
      }),
    ).rejects.toBeInstanceOf(LeaderboardInputsUnresolvedError);
  });
});

describe('adapter with injected resolvers (contract plumbing only)', () => {
  it('reads progress_weekly_adherence for the month window and omits unresolved clients', async () => {
    const { client, rpc } = rpcClient([
      {
        client_id: c1,
        assignment_id: '55555555-5555-4555-8555-555555555555',
        checkin_date: '2026-11-07',
        submitted_at: '2026-11-07T10:00:00Z',
        workoutAdherence: 9,
        dietAdherence: 7,
      },
      {
        client_id: c2,
        assignment_id: '66666666-6666-4666-8666-666666666666',
        checkin_date: '2026-11-07',
        submitted_at: '2026-11-07T10:00:00Z',
        workoutAdherence: 5,
        dietAdherence: 5,
      },
    ]);
    const inputs = await createSpec023ScoreInputSource({
      client,
      goalProgress: resolvedProgress,
      clientCodes: codes,
      now,
    }).loadScoreInputs(request);
    expect(rpc).toHaveBeenCalledWith('progress_weekly_adherence', {
      p_workspace_id: ws,
      p_from: '2026-11-01',
      p_to: '2026-11-14',
    });
    expect(inputs).toEqual([
      {
        clientId: c1,
        clientCode: `code-${c1}`,
        workoutAdherence: 9,
        dietAdherence: 7,
        normalizedProgress: 0.5,
        achievedOn: '2026-11-10',
      },
    ]);
  });

  it('maps 42501/22023/drifted rows to an unavailable source (fail closed)', async () => {
    for (const [data, error] of [
      [null, { code: '42501' }],
      [null, { code: '22023' }],
      [[{ client_id: 'not-a-uuid' }], null],
    ] as const) {
      const { client } = rpcClient(data, error);
      await expect(
        createSpec023ScoreInputSource({
          client,
          goalProgress: resolvedProgress,
          clientCodes: codes,
          now,
        }).loadScoreInputs(request),
      ).rejects.toBeInstanceOf(LeaderboardSourceUnavailableError);
    }
  });
});
