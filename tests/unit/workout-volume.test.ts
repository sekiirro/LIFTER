import { describe, expect, it } from 'vitest';
import {
  computeVolume,
  type MuscleMembership,
  type VolumeDay,
} from '../../lib/workout-planner/volume';

// T006-note: FR-016 volume pure function (SC-007). Working sets only,
// primary 1.0, secondary 0.5, warm-up 0. Week = program-day blocks 1-7,
// 8-14, ...; rest days included; final partial block counts; no calendar.

const MUSCLES: Record<string, MuscleMembership> = {
  bench: { primary: 'Chest', secondaries: ['Triceps', 'Front Delts'] },
  squat: { primary: 'Quads', secondaries: ['Glutes'] },
};

function sessionDay(
  dayIndex: number,
  sets: { type: 'warmup' | 'working'; exerciseId: string }[],
): VolumeDay {
  return {
    dayIndex,
    kind: 'session',
    items: [{ exerciseId: sets[0]?.exerciseId ?? 'bench', sets }],
  };
}

describe('F17 volume pure function (FR-016, SC-007)', () => {
  it('credits working sets only: primary 1.0, secondary 0.5, warm-up 0 (A3-6)', () => {
    const days: VolumeDay[] = [
      {
        dayIndex: 1,
        kind: 'session',
        items: [
          {
            exerciseId: 'bench',
            sets: [
              { type: 'working', exerciseId: 'bench' },
              { type: 'working', exerciseId: 'bench' },
              { type: 'working', exerciseId: 'bench' },
              { type: 'warmup', exerciseId: 'bench' },
              { type: 'warmup', exerciseId: 'bench' },
            ],
          },
        ],
      },
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perSession).toHaveLength(1);
    expect(result.perSession[0]!).toEqual({
      dayIndex: 1,
      totals: { Chest: 3, Triceps: 1.5, 'Front Delts': 1.5 },
    });
    expect(result.perWeek).toHaveLength(1);
    expect(result.perWeek[0]!).toEqual({
      week: 1,
      days: [1],
      totals: { Chest: 3, Triceps: 1.5, 'Front Delts': 1.5 },
    });
  });

  it('groups program-day blocks 1-7 and 8-14 with rest days included', () => {
    const days: VolumeDay[] = [
      sessionDay(1, [{ type: 'working', exerciseId: 'bench' }]),
      { dayIndex: 2, kind: 'rest', items: [] },
      sessionDay(8, [{ type: 'working', exerciseId: 'squat' }]),
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perWeek).toHaveLength(2);
    expect(result.perWeek[0]!.week).toBe(1);
    expect(result.perWeek[0]!.days).toEqual([1, 2]);
    expect(result.perWeek[0]!.totals).toEqual({
      Chest: 1,
      Triceps: 0.5,
      'Front Delts': 0.5,
    });
    expect(result.perWeek[1]!.week).toBe(2);
    expect(result.perWeek[1]!.days).toEqual([8]);
    expect(result.perWeek[1]!.totals).toEqual({ Quads: 1, Glutes: 0.5 });
    // Rest day contributes zero and appears in its session row as empty.
    expect(result.perSession.find((s) => s.dayIndex === 2)?.totals).toEqual({});
  });

  it('counts the final partial block as a week with no calendar date', () => {
    const days: VolumeDay[] = [
      sessionDay(9, [{ type: 'working', exerciseId: 'bench' }]),
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perWeek).toHaveLength(1);
    expect(result.perWeek[0]!.week).toBe(2);
    expect(result.perWeek[0]!.days).toEqual([9]);
    expect(result.perWeek[0]!.totals).toEqual({
      Chest: 1,
      Triceps: 0.5,
      'Front Delts': 0.5,
    });
  });

  it('accumulates multiple exercises and sessions per week', () => {
    const days: VolumeDay[] = [
      {
        dayIndex: 3,
        kind: 'session',
        items: [
          {
            exerciseId: 'bench',
            sets: [{ type: 'working', exerciseId: 'bench' }],
          },
          {
            exerciseId: 'squat',
            sets: [
              { type: 'working', exerciseId: 'squat' },
              { type: 'working', exerciseId: 'squat' },
            ],
          },
        ],
      },
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perSession[0]!.totals).toEqual({
      Chest: 1,
      Triceps: 0.5,
      'Front Delts': 0.5,
      Quads: 2,
      Glutes: 1,
    });
  });
});

describe('F17 volume rest-day-only and empty-session (FR-016, SC-007)', () => {
  it('handles a rest-day-only week with zero totals', () => {
    const days: VolumeDay[] = [
      { dayIndex: 1, kind: 'rest', items: [] },
      { dayIndex: 2, kind: 'rest', items: [] },
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perWeek).toEqual([
      { week: 1, days: [1, 2], totals: {} },
    ]);
  });

  it('handles an empty session with zero totals', () => {
    const days: VolumeDay[] = [
      { dayIndex: 1, kind: 'session', items: [] },
    ];
    const result = computeVolume(days, MUSCLES);
    expect(result.perSession).toEqual([{ dayIndex: 1, totals: {} }]);
  });
});
