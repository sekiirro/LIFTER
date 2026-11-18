// Synthetic closed result of `client_portal_workout_plan` (F16/F17 client
// projection). Shared by the client workout unit tests. Synthetic data only.
export const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;

export const PLAN_ID = uuid('a1');
export const REVISION_ID = uuid('a2');
export const WORKSPACE_ID = uuid('a3');
export const BENCH_ID = uuid('b1');
export const ALT_ID = uuid('b2');
export const PRIVATE_ID = uuid('b3');

export const BENCH_URL = 'https://youtu.be/bench-live';
export const PRIVATE_URL = 'https://youtu.be/private-live';

export function rawDocument() {
  return {
    schema_version: 1,
    notes: 'Plan note',
    days: [
      {
        id: uuid('d1'),
        kind: 'session',
        title: 'Push',
        notes: 'Warm up',
        items: [
          {
            id: uuid('c1'),
            name: 'Bench Press',
            description: 'Grip just outside shoulders',
            notes: 'Pause on chest',
            reps: { min: 6, max: 8 },
            restSec: 120,
            rir: 2,
            exercise: { source: 'global', identity_id: BENCH_ID, version: 1 },
            alternatives: [
              { source: 'global', identity_id: ALT_ID, version: 1 },
              {
                source: 'workspace_private',
                identity_id: PRIVATE_ID,
                workspace_id: WORKSPACE_ID,
                version: 1,
              },
            ],
            sets: [
              {
                id: uuid('e1'),
                type: 'working',
                load: { mode: 'added_weight', value: '60', unit: 'kg' },
              },
              { id: uuid('e2'), type: 'warmup', load: { mode: 'bodyweight' } },
            ],
          },
        ],
      },
      { id: uuid('d2'), kind: 'rest', title: 'Rest', items: [] },
    ],
  };
}

export function rawExercises() {
  return [
    {
      source: 'global',
      identity_id: BENCH_ID,
      name: 'Bench Press',
      video_url: BENCH_URL,
    },
    { source: 'global', identity_id: ALT_ID, name: 'Dumbbell Press' },
    {
      source: 'workspace_private',
      identity_id: PRIVATE_ID,
      workspace_id: WORKSPACE_ID,
      name: 'Coach Private Press',
      video_url: PRIVATE_URL,
    },
  ];
}

export function rawOk(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    subscription: { status: 'active', effective_end_exclusive: '2027-01-01' },
    plan: {
      plan_id: PLAN_ID,
      workspace_id: WORKSPACE_ID,
      revision_id: REVISION_ID,
      revision_number: 2,
      published_at: '2026-11-18T10:00:00Z',
    },
    document: rawDocument(),
    exercises: rawExercises(),
    ...overrides,
  };
}
