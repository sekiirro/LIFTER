import { describe, expect, it } from 'vitest';
import type {
  MeasurementBaselineRow,
  MeasurementHistoryRow,
  WeeklyAdherenceRow,
} from '../../lib/progress-coaching/contract';
import {
  F15_STARTER_WEIGHT_QUESTION_ID,
  bodyWeightBaseline,
  goalProgress,
} from '../../lib/leaderboard/goals';
import { rankLeaderboard } from '../../lib/leaderboard/ranking';
import {
  cairoEndOfDay,
  lastScoringInput,
  productionLeaderboardResolvers,
  registrationOrderCode,
  type ClientProgressData,
  type LeaderboardClientFacts,
  type LeaderboardResolverInput,
} from '../../lib/leaderboard/resolvers';
import type { LeaderboardScoreInputs } from '../../lib/leaderboard/score-inputs';

// PO decision 2026-11-14 (FR-018 option A; FR-021 last scoring input and
// registration order). Synthetic values only.
const window = { from: '2026-11-01', to: '2026-11-14' };
const assignment = '55555555-5555-4555-8555-555555555555';

function baseline(
  patch: Partial<MeasurementBaselineRow> = {},
): MeasurementBaselineRow {
  return {
    clientId: 'c1',
    measurementType: 'bodyWeight',
    baselineValue: 100,
    baselineUnitEn: 'kg',
    baselineUnitAr: 'كجم',
    baselineRecordedOn: '2026-09-01',
    latestValue: 95,
    latestUnitEn: 'kg',
    latestUnitAr: 'كجم',
    latestRecordedOn: '2026-11-07',
    measurementCount: 4,
    ...patch,
  };
}

function checkin(
  submittedAt: string,
  patch: Partial<WeeklyAdherenceRow> = {},
): WeeklyAdherenceRow {
  return {
    clientId: 'c1',
    assignmentId: assignment,
    checkinDate: submittedAt.slice(0, 10),
    submittedAt,
    workoutAdherence: 8,
    dietAdherence: 6,
    ...patch,
  };
}

function measurement(
  patch: Partial<MeasurementHistoryRow> = {},
): MeasurementHistoryRow {
  return {
    clientId: 'c1',
    measurementId: '77777777-7777-4777-8777-777777777777',
    measurementType: 'bodyWeight',
    value: 95,
    unitEn: 'kg',
    unitAr: 'كجم',
    recordedOn: '2026-11-07',
    sourceKind: 'manual',
    sourceAssignmentId: null,
    ...patch,
  };
}

function client(patch: Partial<ClientProgressData> = {}): ClientProgressData {
  return {
    clientId: 'c1',
    adherence: [checkin('2026-11-07T08:00:00.000Z')],
    measurements: [measurement()],
    baselines: [baseline()],
    ...patch,
  };
}

const input = (clients: ClientProgressData[]): LeaderboardResolverInput => ({
  workspaceId: 'ws',
  periodMonth: '2026-11-01',
  window,
  clients,
});

describe('FR-018 goal formula boundaries', () => {
  it('fat loss: % lost / 10%, capped at 1, floored at 0', () => {
    expect(goalProgress('fat_loss', 100, 95)).toBeCloseTo(0.5, 12);
    expect(goalProgress('fat_loss', 100, 90)).toBe(1);
    expect(goalProgress('fat_loss', 100, 80)).toBe(1);
    expect(goalProgress('fat_loss', 100, 100)).toBe(0);
    expect(goalProgress('fat_loss', 100, 104)).toBe(0);
  });

  it('muscle gain: % gained / 5%, capped at 1, floored at 0', () => {
    expect(goalProgress('muscle_gain', 100, 102.5)).toBeCloseTo(0.5, 12);
    expect(goalProgress('muscle_gain', 100, 105)).toBeCloseTo(1, 12);
    expect(goalProgress('muscle_gain', 100, 112)).toBe(1);
    expect(goalProgress('muscle_gain', 100, 100)).toBe(0);
    expect(goalProgress('muscle_gain', 100, 97)).toBe(0);
  });

  it('maintenance: 1 - |% change| / 3%, floored at 0', () => {
    expect(goalProgress('maintenance', 100, 100)).toBe(1);
    expect(goalProgress('maintenance', 100, 101.5)).toBeCloseTo(0.5, 12);
    expect(goalProgress('maintenance', 100, 98.5)).toBeCloseTo(0.5, 12);
    expect(goalProgress('maintenance', 100, 103)).toBeCloseTo(0, 12);
    expect(goalProgress('maintenance', 100, 97)).toBeCloseTo(0, 12);
    expect(goalProgress('maintenance', 100, 110)).toBe(0);
    expect(goalProgress('maintenance', 100, 90)).toBe(0);
  });

  it('returns no value for a non-positive or non-finite weight', () => {
    for (const [first, latest] of [
      [0, 90],
      [-5, 90],
      [100, 0],
      [Number.NaN, 90],
      [100, Number.POSITIVE_INFINITY],
    ] as const)
      expect(goalProgress('fat_loss', first, latest)).toBeNull();
  });
});

describe('body-weight identification in the 023 contract (fail closed)', () => {
  it('uses the single kg measurement type', () => {
    expect(
      bodyWeightBaseline([
        baseline({
          measurementType: 'waist',
          baselineUnitEn: 'cm',
          latestUnitEn: 'cm',
        }),
        baseline(),
      ])?.measurementType,
    ).toBe('bodyWeight');
    expect(
      bodyWeightBaseline([
        baseline({ baselineUnitEn: ' KG ', latestUnitEn: 'Kg' }),
      ]),
    ).not.toBeNull();
  });

  it('prefers the F15 starter weight question when several kg types exist', () => {
    expect(
      bodyWeightBaseline([
        baseline({ measurementType: 'leanMass' }),
        baseline({ measurementType: F15_STARTER_WEIGHT_QUESTION_ID }),
      ])?.measurementType,
    ).toBe('B04');
  });

  it('is ambiguous (null) with no kg type, two non-starter kg types, or mixed units', () => {
    expect(bodyWeightBaseline([])).toBeNull();
    expect(
      bodyWeightBaseline([
        baseline({ baselineUnitEn: 'lb', latestUnitEn: 'lb' }),
      ]),
    ).toBeNull();
    expect(
      bodyWeightBaseline([
        baseline({ measurementType: 'a' }),
        baseline({ measurementType: 'b' }),
      ]),
    ).toBeNull();
    expect(bodyWeightBaseline([baseline({ latestUnitEn: 'lb' })])).toBeNull();
    expect(bodyWeightBaseline([baseline({ baselineUnitEn: null })])).toBeNull();
  });
});

describe('production resolvers (PO 2026-11-14)', () => {
  const facts = (
    patch: Partial<LeaderboardClientFacts> = {},
  ): ReadonlyMap<string, LeaderboardClientFacts> =>
    new Map([
      [
        'c1',
        {
          goalType: 'fat_loss',
          registrationApprovedAt: '2026-10-01T10:00:00+03:00',
          ...patch,
        },
      ],
    ]);

  it('computes progress from the first weight vs this month’s latest', async () => {
    const resolvers = productionLeaderboardResolvers(facts());
    const progress = await resolvers.goalProgress!.resolve(input([client()]));
    expect(progress.get('c1')).toBeCloseTo(0.5, 12);
  });

  it('omits a client with no goal set (not eligible)', async () => {
    const resolvers = productionLeaderboardResolvers(facts({ goalType: null }));
    expect(
      (await resolvers.goalProgress!.resolve(input([client()]))).size,
    ).toBe(0);
    const unknown = productionLeaderboardResolvers(new Map());
    expect((await unknown.goalProgress!.resolve(input([client()]))).size).toBe(
      0,
    );
  });

  it('omits a client with no weight this month, or an ambiguous weight', async () => {
    const resolvers = productionLeaderboardResolvers(facts());
    for (const data of [
      client({ baselines: [] }),
      client({ baselines: [baseline({ latestRecordedOn: '2026-10-30' })] }),
      client({
        baselines: [
          baseline({ measurementType: 'a' }),
          baseline({ measurementType: 'b' }),
        ],
      }),
    ]) {
      expect((await resolvers.goalProgress!.resolve(input([data]))).size).toBe(
        0,
      );
      expect(
        (await resolvers.achievementDate!.resolve(input([data]))).size,
      ).toBe(0);
    }
  });

  it('achievement = latest counted check-in or weight; a dated manual weight sits at the end of its Cairo day', () => {
    // Manual weight on 11-07 (end of Cairo day, UTC+2 in November) beats the 08:00Z check-in.
    expect(lastScoringInput(client(), window)).toBe('2026-11-07T21:59:59.999Z');
    // A later counted check-in wins.
    expect(
      lastScoringInput(
        client({
          adherence: [
            checkin('2026-11-07T08:00:00.000Z'),
            checkin('2026-11-12T09:30:00.000Z', {
              assignmentId: '66666666-6666-4666-8666-666666666666',
            }),
          ],
        }),
        window,
      ),
    ).toBe('2026-11-12T09:30:00.000Z');
    // A check-in with an unanswered adherence question is not counted.
    expect(
      lastScoringInput(
        client({
          adherence: [
            checkin('2026-11-07T08:00:00.000Z'),
            checkin('2026-11-13T09:30:00.000Z', {
              assignmentId: '66666666-6666-4666-8666-666666666666',
              dietAdherence: null,
            }),
          ],
        }),
        window,
      ),
    ).toBe('2026-11-07T21:59:59.999Z');
    // A check-in-sourced weight takes its check-in's submission instant.
    expect(
      lastScoringInput(
        client({
          measurements: [
            measurement({
              sourceKind: 'checkin',
              sourceAssignmentId: assignment,
            }),
          ],
        }),
        window,
      ),
    ).toBe('2026-11-07T08:00:00.000Z');
  });

  it('places a Cairo day end correctly in summer (UTC+3) and winter (UTC+2)', () => {
    expect(new Date(cairoEndOfDay('2026-07-15')).toISOString()).toBe(
      '2026-07-15T20:59:59.999Z',
    );
    expect(new Date(cairoEndOfDay('2026-01-15')).toISOString()).toBe(
      '2026-01-15T21:59:59.999Z',
    );
    expect(() => cairoEndOfDay('15/01/2026')).toThrow(RangeError);
  });

  it('client code = registration order, normalized to UTC so text order is time order', async () => {
    expect(registrationOrderCode('c1', '2026-10-01T10:00:00+03:00')).toBe(
      '2026-10-01T07:00:00.000Z#c1',
    );
    expect(registrationOrderCode('c1', null)).toBeNull();
    expect(registrationOrderCode('c1', 'garbage')).toBeNull();
    const codes = await productionLeaderboardResolvers(
      facts({ registrationApprovedAt: null }),
    ).clientCode!.resolve(input([client()]));
    expect(codes.size).toBe(0);
  });
});

describe('FR-021 tie-break order with the production keys', () => {
  const tied = (
    clientId: string,
    patch: Partial<LeaderboardScoreInputs>,
  ): LeaderboardScoreInputs => ({
    clientId,
    clientCode: registrationOrderCode(clientId, '2026-10-01T10:00:00.000Z')!,
    workoutAdherence: 6,
    dietAdherence: 6,
    normalizedProgress: 0.5,
    achievedAt: '2026-11-10T10:00:00.000Z',
    ...patch,
  });

  it('orders equal scores by higher adherence, then earlier last scoring input, then earlier registration', () => {
    const ranked = rankLeaderboard(
      [
        // Same composite (0.5*0.6 + 0.5*0.5 = 0.55) for a, b, c and d.
        tied('d-late-registration', {
          clientCode: registrationOrderCode(
            'd-late-registration',
            '2026-10-05T10:00:00.000Z',
          )!,
        }),
        tied('c-later-input', { achievedAt: '2026-11-12T10:00:00.000Z' }),
        tied('a-higher-adherence', {
          workoutAdherence: 8,
          dietAdherence: 8,
          normalizedProgress: 0.3,
        }),
        tied('b-early-registration', {}),
      ],
      [],
    );
    expect(ranked.map((row) => row.clientId)).toEqual([
      'a-higher-adherence',
      'b-early-registration',
      'd-late-registration',
      'c-later-input',
    ]);
  });
});
