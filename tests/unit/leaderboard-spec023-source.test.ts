import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeeklyAdherenceRow } from '../../lib/progress-coaching/contract';
import { buildLeaderboardCandidate } from '../../lib/leaderboard/candidate';
import {
  LEADERBOARD_RESOLVERS,
  missingResolvers,
  type LeaderboardInputResolver,
  type LeaderboardResolverInput,
  type LeaderboardResolvers,
} from '../../lib/leaderboard/resolvers';
import {
  LeaderboardInputsUnresolvedError,
  LeaderboardSourceUnavailableError,
  aggregateMonthlyAdherence,
  createSpec023ScoreInputSource,
  resultMonthWindow,
} from '../../lib/leaderboard/spec023-source';

const ws = '11111111-1111-4111-8111-111111111111';
const c1 = '22222222-2222-4222-8222-222222222222';
const c2 = '33333333-3333-4333-8333-333333333333';
const foreign = '44444444-4444-4444-8444-444444444444';
const assignment = '55555555-5555-4555-8555-555555555555';
const measurement = '77777777-7777-4777-8777-777777777777';

function row(
  clientId: string,
  workout: number | null,
  diet: number | null,
  checkinDate = '2026-11-07',
): WeeklyAdherenceRow {
  return {
    clientId,
    assignmentId: assignment,
    checkinDate,
    submittedAt: `${checkinDate}T10:00:00Z`,
    workoutAdherence: workout,
    dietAdherence: diet,
  };
}

type RpcResult = { data: unknown; error: { code?: string } | null };
const ok = (data: unknown): RpcResult => ({ data, error: null });

const responses = (): Record<string, RpcResult> => ({
  progress_weekly_adherence: ok([
    {
      client_id: c1,
      assignment_id: assignment,
      checkin_date: '2026-11-07',
      submitted_at: '2026-11-07T10:00:00Z',
      workoutAdherence: 9,
      dietAdherence: 7,
    },
    {
      client_id: c2,
      assignment_id: assignment,
      checkin_date: '2026-11-07',
      submitted_at: '2026-11-07T10:00:00Z',
      workoutAdherence: 5,
      dietAdherence: 5,
    },
  ]),
  progress_measurement_history: ok([
    {
      client_id: c1,
      measurement_id: measurement,
      measurement_type: 'q-weight',
      value: 80,
      recorded_on: '2026-11-07',
      source_kind: 'checkin',
      source_assignment_id: assignment,
    },
  ]),
  progress_measurement_baselines: ok([
    {
      client_id: c1,
      measurement_type: 'q-weight',
      baseline_value: 84,
      baseline_recorded_on: '2026-10-01',
      latest_value: 80,
      latest_recorded_on: '2026-11-07',
      measurement_count: 3,
    },
  ]),
});

/** Per-RPC canned responses; any unlisted RPC fails the test. */
function spec023(overrides: Record<string, RpcResult> = {}) {
  const table = { ...responses(), ...overrides };
  const rpc = vi.fn(async (name: string) => {
    const response = table[name];
    if (!response) throw new Error(`unexpected rpc ${name}`);
    return response;
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

/** Test doubles only: fixed values, not a product formula. */
function fixed<T>(
  values: Record<string, T>,
): LeaderboardInputResolver<T> & { calls: LeaderboardResolverInput[] } {
  const calls: LeaderboardResolverInput[] = [];
  return {
    calls,
    resolve: async (input) => {
      calls.push(input);
      return new Map(Object.entries(values));
    },
  };
}

const resolved = () => ({
  goalProgress: fixed({ [c1]: 0.5 }),
  achievementDate: fixed({ [c1]: '2026-11-10', [c2]: '2026-11-11' }),
  clientCode: fixed({ [c1]: 'code-1', [c2]: 'code-2' }),
});
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
  it('keeps every production resolver unregistered until the PO decides', () => {
    expect(LEADERBOARD_RESOLVERS).toEqual({
      goalProgress: null,
      achievementDate: null,
      clientCode: null,
    });
    expect(Object.isFrozen(LEADERBOARD_RESOLVERS)).toBe(true);
    expect(missingResolvers(LEADERBOARD_RESOLVERS)).toEqual([
      'goal_progress_normalization',
      'achievement_date',
      'client_code',
    ]);
  });

  it('throws before reading any spec 023 data while any resolver is missing', async () => {
    const full: LeaderboardResolvers = resolved();
    const cases: Array<[LeaderboardResolvers, string[]]> = [
      [
        LEADERBOARD_RESOLVERS,
        ['goal_progress_normalization', 'achievement_date', 'client_code'],
      ],
      [{ ...full, goalProgress: null }, ['goal_progress_normalization']],
      [{ ...full, achievementDate: null }, ['achievement_date']],
      [{ ...full, clientCode: null }, ['client_code']],
    ];
    for (const [resolvers, missing] of cases) {
      const { client, rpc } = spec023();
      const error = await createSpec023ScoreInputSource({
        client,
        resolvers,
        now,
      })
        .loadScoreInputs(request)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(LeaderboardInputsUnresolvedError);
      expect((error as LeaderboardInputsUnresolvedError).missing).toEqual(
        missing,
      );
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('generates no candidate through the pipeline with the production registry', async () => {
    const { client, rpc } = spec023();
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
          resolvers: LEADERBOARD_RESOLVERS,
        }),
      }),
    ).rejects.toBeInstanceOf(LeaderboardInputsUnresolvedError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('adapter with injected resolvers (contract plumbing only)', () => {
  it('reads the three 023 contracts for the month window and gives each client only its own rows', async () => {
    const { client, rpc } = spec023();
    const resolvers = resolved();
    const inputs = await createSpec023ScoreInputSource({
      client,
      resolvers,
      now,
    }).loadScoreInputs(request);
    const window = {
      p_workspace_id: ws,
      p_from: '2026-11-01',
      p_to: '2026-11-14',
    };
    expect(rpc).toHaveBeenCalledWith('progress_weekly_adherence', window);
    expect(rpc).toHaveBeenCalledWith('progress_measurement_history', window);
    expect(rpc).toHaveBeenCalledWith('progress_measurement_baselines', {
      p_workspace_id: ws,
      p_as_of: '2026-11-14',
    });
    for (const resolver of Object.values(resolvers))
      expect(resolver.calls).toHaveLength(1);
    const [call] = resolvers.goalProgress.calls;
    expect(call).toMatchObject({
      workspaceId: ws,
      periodMonth: '2026-11-01',
      window: { from: '2026-11-01', to: '2026-11-14' },
    });
    expect(call!.clients.map((client) => client.clientId)).toEqual([c1, c2]);
    const own = call!.clients[0]!;
    expect(own.adherence).toHaveLength(1);
    expect(own.measurements.map((value) => value.value)).toEqual([80]);
    expect(own.baselines.map((value) => value.baselineValue)).toEqual([84]);
    expect(call!.clients[1]).toMatchObject({ measurements: [], baselines: [] });
    // c2 has no resolved progress value, so it is omitted, never guessed.
    expect(inputs).toEqual([
      {
        clientId: c1,
        clientCode: 'code-1',
        workoutAdherence: 9,
        dietAdherence: 7,
        normalizedProgress: 0.5,
        achievedOn: '2026-11-10',
      },
    ]);
  });

  it('rejects a resolver that widens the client set or returns a malformed value', async () => {
    const cases: LeaderboardResolvers[] = [
      { ...resolved(), clientCode: fixed({ [c1]: 'a', [foreign]: 'b' }) },
      { ...resolved(), goalProgress: fixed({ [c1]: 1.5 }) },
      { ...resolved(), goalProgress: fixed({ [c1]: -0.1 }) },
      { ...resolved(), goalProgress: fixed({ [c1]: Number.NaN }) },
      { ...resolved(), achievementDate: fixed({ [c1]: '10/11/2026' }) },
      { ...resolved(), clientCode: fixed({ [c1]: '' }) },
    ];
    for (const resolvers of cases) {
      const { client } = spec023();
      await expect(
        createSpec023ScoreInputSource({
          client,
          resolvers,
          now,
        }).loadScoreInputs(request),
      ).rejects.toBeInstanceOf(RangeError);
    }
  });

  it('maps 42501/22023/drifted rows on any 023 reader to an unavailable source (fail closed)', async () => {
    for (const name of [
      'progress_weekly_adherence',
      'progress_measurement_history',
      'progress_measurement_baselines',
    ])
      for (const broken of [
        { data: null, error: { code: '42501' } },
        { data: null, error: { code: '22023' } },
        ok([{ client_id: 'not-a-uuid' }]),
      ]) {
        const { client } = spec023({ [name]: broken });
        await expect(
          createSpec023ScoreInputSource({
            client,
            resolvers: resolved(),
            now,
          }).loadScoreInputs(request),
        ).rejects.toBeInstanceOf(LeaderboardSourceUnavailableError);
      }
  });
});
