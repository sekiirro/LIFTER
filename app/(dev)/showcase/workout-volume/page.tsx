import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LanguageSwitcher } from '../../../../components/preferences/LanguageSwitcher';
import { ThemeSwitcher } from '../../../../components/preferences/ThemeSwitcher';
import { WorkoutVolumeSummary } from '../../../../components/plans/workout/WorkoutVolumeSummary';
import {
  LOCALE_COOKIE,
  parseLocale,
  parseTheme,
  THEME_COOKIE,
} from '../../../../lib/design/preferences';
import { isShowcaseEnabled } from '../../../../lib/design/showcase';
import { getMessages } from '../../../../lib/i18n';
import type {
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from '../../../../lib/plans/workout/schema';
import {
  calculateWorkoutVolume,
  type WorkoutVolumeExerciseSnapshot,
} from '../../../../lib/plans/workout/volume';
import styles from './page.module.css';

const BENCH_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'bench-press',
  version: 1,
};
const SHOULDER_PRESS: WorkoutExerciseReference = {
  source: 'global',
  id: 'shoulder-press',
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
const LEG_CURL: WorkoutExerciseReference = {
  source: 'global',
  id: 'leg-curl',
  version: 1,
};

function set(id: string, type: 'warmup' | 'working'): WorkoutSet {
  return {
    id,
    type,
    reps: { value: 8 },
    load: { mode: 'bodyweight' },
  };
}

function item(
  id: string,
  exercise: WorkoutExerciseReference,
  workingSets: number,
  warmupSets = 0,
): WorkoutItem {
  return {
    id,
    exercise,
    sets: [
      ...Array.from({ length: warmupSets }, (_, index) =>
        set(`${id}-warmup-${index + 1}`, 'warmup'),
      ),
      ...Array.from({ length: workingSets }, (_, index) =>
        set(`${id}-working-${index + 1}`, 'working'),
      ),
    ],
  };
}

function sampleDocument(m: ReturnType<typeof getMessages>): WorkoutDocument {
  return {
    days: [
      {
        id: 'sample-push',
        kind: 'session',
        title: m['volume.samplePush'],
        items: [
          item('sample-bench', BENCH_PRESS, 3, 1),
          item('sample-shoulder', SHOULDER_PRESS, 2),
        ],
      },
      {
        id: 'sample-pull',
        kind: 'session',
        title: m['volume.samplePull'],
        items: [item('sample-row', ROW, 3)],
      },
      {
        id: 'sample-legs',
        kind: 'session',
        title: m['volume.sampleLegs'],
        items: [
          item('sample-squat', SQUAT, 4),
          item('sample-curl', LEG_CURL, 3),
        ],
      },
      {
        id: 'sample-recovery',
        kind: 'session',
        title: m['volume.sampleRecovery'],
        items: [item('sample-recovery-bench', BENCH_PRESS, 0, 2)],
      },
      { id: 'sample-rest', kind: 'rest' },
    ],
  };
}

const snapshots: readonly WorkoutVolumeExerciseSnapshot[] = [
  {
    exercise: BENCH_PRESS,
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
  },
  {
    exercise: SHOULDER_PRESS,
    primaryMuscles: ['shoulders'],
    secondaryMuscles: ['triceps'],
  },
  {
    exercise: ROW,
    primaryMuscles: ['back'],
    secondaryMuscles: ['biceps'],
  },
  {
    exercise: SQUAT,
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes'],
  },
  {
    exercise: LEG_CURL,
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['calves'],
  },
];

export default async function WorkoutVolumePreviewPage() {
  if (!isShowcaseEnabled(process.env)) notFound();
  const preferences = await cookies();
  const locale = parseLocale(preferences.get(LOCALE_COOKIE)?.value);
  const theme = parseTheme(preferences.get(THEME_COOKIE)?.value);
  const m = getMessages(locale);
  const muscleLabels = {
    chest: m['volume.muscle.chest'],
    back: m['volume.muscle.back'],
    shoulders: m['volume.muscle.shoulders'],
    biceps: m['volume.muscle.biceps'],
    triceps: m['volume.muscle.triceps'],
    quads: m['volume.muscle.quads'],
    glutes: m['volume.muscle.glutes'],
    hamstrings: m['volume.muscle.hamstrings'],
    calves: m['volume.muscle.calves'],
  };
  const report = calculateWorkoutVolume(sampleDocument(m), snapshots);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{m['volume.showcaseTitle']}</h1>
        <p>{m['volume.showcaseIntro']}</p>
      </header>
      <div className={styles.controls}>
        <ThemeSwitcher
          key={theme}
          value={theme}
          label={m['theme.label']}
          labels={{
            system: m['theme.system'],
            dark: m['theme.dark'],
            light: m['theme.light'],
          }}
        />
        <LanguageSwitcher
          value={locale}
          label={m['language.label']}
          labels={{ ar: m['language.ar'], en: m['language.en'] }}
        />
        <a className={styles.back} href="/showcase">
          {m['showcase.backToShowcase']}
        </a>
      </div>
      <WorkoutVolumeSummary
        report={report}
        locale={locale}
        muscleLabels={muscleLabels}
      />
    </main>
  );
}
