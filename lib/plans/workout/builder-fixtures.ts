import type { Locale } from '../../design/preferences';
import type {
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutSet,
} from './schema';

export type WorkoutBuilderCatalogEntry = {
  id: string;
  name: Readonly<Record<Locale, string>>;
  reference: WorkoutExerciseReference;
  defaults: readonly Omit<WorkoutSet, 'id'>[];
};

export type WorkoutBuilderFixture = {
  document: WorkoutDocument;
  catalog: readonly WorkoutBuilderCatalogEntry[];
  videoReferences: Readonly<Record<string, string>>;
};

const PUSH_DAY_ID = '10000000-0000-4000-8000-000000000001';
const PULL_DAY_ID = '10000000-0000-4000-8000-000000000002';
const REST_DAY_ID = '10000000-0000-4000-8000-000000000003';
const BENCH_ITEM_ID = '20000000-0000-4000-8000-000000000001';
const ROW_ITEM_ID = '20000000-0000-4000-8000-000000000002';
const SQUAT_ITEM_ID = '20000000-0000-4000-8000-000000000003';
const BENCH_WARMUP_SET_ID = '30000000-0000-4000-8000-000000000001';
const BENCH_WORKING_SET_ID = '30000000-0000-4000-8000-000000000002';
const ROW_SET_ID = '30000000-0000-4000-8000-000000000003';
const SQUAT_SET_ID = '30000000-0000-4000-8000-000000000004';

const BENCH: WorkoutExerciseReference = {
  source: 'global',
  id: 'bench-press',
  version: 1,
};
const ROW: WorkoutExerciseReference = {
  source: 'global',
  id: 'row',
  version: 1,
};
const SQUAT: WorkoutExerciseReference = {
  source: 'global',
  id: 'squat',
  version: 1,
};
const DEADLIFT: WorkoutExerciseReference = {
  source: 'global',
  id: 'deadlift',
  version: 1,
};
const INCLINE_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'incline-press',
  version: 1,
};
const DB_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'db-press',
  version: 1,
};

const workingDefaults: Omit<WorkoutSet, 'id'> = {
  type: 'working',
  reps: { min: 8, max: 10 },
  load: { mode: 'added_weight', value: '20', unit: 'kg' },
  restSec: 90,
  rir: 2,
};

export function createWorkoutBuilderFixture(
  locale: Locale,
): WorkoutBuilderFixture {
  const names = {
    bench: locale === 'ar' ? 'ضغط البار' : 'Bench press',
    row: locale === 'ar' ? ' تجديف' : 'Row',
    squat: locale === 'ar' ? 'القرفصاء' : 'Squat',
    deadlift: locale === 'ar' ? 'الرفعة الميتة' : 'Deadlift',
    incline: locale === 'ar' ? 'ضغط مائل' : 'Incline press',
    db: locale === 'ar' ? 'ضغط Dumbbell' : 'Dumbbell press',
  } as const;

  return {
    document: {
      days: [
        {
          id: PUSH_DAY_ID,
          kind: 'session',
          title: locale === 'ar' ? 'يوم الدفع' : 'Push day',
          notes:
            locale === 'ar'
              ? 'ركّز على جودة التكرار.'
              : 'Focus on repeatable reps.',
          items: [
            {
              id: BENCH_ITEM_ID,
              exercise: BENCH,
              notes: locale === 'ar' ? 'توقّف عند الأسفل.' : 'Pause at the bottom.',
              alternatives: [DB_PRESS],
              sets: [
                {
                  id: BENCH_WARMUP_SET_ID,
                  type: 'warmup',
                  reps: { value: 10 },
                  load: { mode: 'bodyweight' },
                  restSec: 45,
                  notes:
                    locale === 'ar'
                      ? 'مجموعة تحضير بدون حمل.'
                      : 'Preparation set without load.',
                },
                {
                  id: BENCH_WORKING_SET_ID,
                  type: 'working',
                  reps: { min: 8, max: 10 },
                  load: { mode: 'added_weight', value: '22.5', unit: 'kg' },
                  restSec: 120,
                  rir: 2,
                  notes:
                    locale === 'ar'
                      ? 'إيقاع متحكم.'
                      : 'Controlled tempo.',
                },
              ],
            },
            {
              id: ROW_ITEM_ID,
              exercise: ROW,
              notes:
                locale === 'ar' ? 'ظهر مستقيم.' : 'Keep the torso upright.',
              sets: [
                {
                  id: ROW_SET_ID,
                  type: 'working',
                  reps: { value: 10 },
                  load: { mode: 'added_weight', value: '35', unit: 'kg' },
                  restSec: 75,
                  rir: 1,
                },
              ],
            },
          ],
        },
        {
          id: PULL_DAY_ID,
          kind: 'session',
          title: locale === 'ar' ? 'يوم السحب' : 'Pull day',
          notes:
            locale === 'ar'
              ? 'استخدم وزنًا يمكن التحكم فيه.'
              : 'Use a load you can control.',
          items: [
            {
              id: SQUAT_ITEM_ID,
              exercise: SQUAT,
              sets: [
                {
                  id: SQUAT_SET_ID,
                  type: 'working',
                  reps: { value: 5 },
                  load: { mode: 'added_weight', value: '60', unit: 'kg' },
                  restSec: 150,
                  rir: 2,
                },
              ],
            },
          ],
        },
        {
          id: REST_DAY_ID,
          kind: 'rest',
          title: locale === 'ar' ? 'راحة' : 'Recovery',
          notes:
            locale === 'ar'
              ? 'النوم والتعافي جزء من الخطة.'
              : 'Sleep and recovery are part of the plan.',
        },
      ],
      notes:
        locale === 'ar'
          ? 'تدرج الحمل أسبوعيًا مع الحفاظ على جودة الحركة.'
          : 'Progress load weekly while preserving movement quality.',
    },
    catalog: [
      {
        id: 'bench-press',
        name: names.bench,
        reference: BENCH,
        defaults: [
          {
            type: 'warmup',
            reps: { value: 10 },
            load: { mode: 'bodyweight' },
            restSec: 45,
          },
          workingDefaults,
        ],
      },
      {
        id: 'row',
        name: names.row,
        reference: ROW,
        defaults: [workingDefaults],
      },
      {
        id: 'squat',
        name: names.squat,
        reference: SQUAT,
        defaults: [workingDefaults],
      },
      {
        id: 'deadlift',
        name: names.deadlift,
        reference: DEADLIFT,
        defaults: [workingDefaults],
      },
      {
        id: 'incline-press',
        name: names.incline,
        reference: INCLINE_PRESS,
        defaults: [workingDefaults],
      },
      {
        id: 'db-press',
        name: names.db,
        reference: DB_PRESS,
        defaults: [workingDefaults],
      },
    ],
    videoReferences: {
      [BENCH_ITEM_ID]: 'https://video.example.test/bench-press',
      [ROW_ITEM_ID]: 'https://video.example.test/row',
      [SQUAT_ITEM_ID]: 'https://video.example.test/squat',
    },
  };
}
