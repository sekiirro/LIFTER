import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkoutVolumeSummary } from '../../components/plans/workout/WorkoutVolumeSummary';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type {
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutItem,
  WorkoutSet,
} from '../../lib/plans/workout/schema';
import {
  calculateWorkoutVolume,
  type WorkoutVolumeExerciseSnapshot,
} from '../../lib/plans/workout/volume';

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
  sets: WorkoutSet[],
): WorkoutItem {
  return { id, exercise, sets };
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
];

const document: WorkoutDocument = {
  days: [
    {
      id: 'day-push',
      kind: 'session',
      title: 'Push',
      items: [
        item('push-bench', BENCH_PRESS, [
          set('push-bench-warmup', 'warmup'),
          set('push-bench-working-1', 'working'),
          set('push-bench-working-2', 'working'),
        ]),
        item('push-shoulder', SHOULDER_PRESS, [
          set('push-shoulder-working-1', 'working'),
        ]),
      ],
    },
    {
      id: 'day-pull',
      kind: 'session',
      title: 'Pull',
      items: [item('pull-row', ROW, [set('pull-row-working-1', 'working')])],
    },
    {
      id: 'day-mobility',
      kind: 'session',
      items: [
        item('mobility-bench', BENCH_PRESS, [
          set('mobility-bench-warmup', 'warmup'),
        ]),
      ],
    },
    { id: 'day-rest', kind: 'rest' },
  ],
};

function report() {
  return calculateWorkoutVolume(document, snapshots);
}

function muscleLabels(locale: Locale, omit?: string) {
  const m = getMessages(locale);
  const labels: Record<string, string> = {
    chest: m['volume.muscle.chest'],
    back: m['volume.muscle.back'],
    shoulders: m['volume.muscle.shoulders'],
    biceps: m['volume.muscle.biceps'],
    triceps: m['volume.muscle.triceps'],
  };
  if (omit !== undefined) delete labels[omit];
  return labels;
}

function render(locale: Locale, omitLabel?: string) {
  return renderToStaticMarkup(
    createElement(WorkoutVolumeSummary, {
      report: report(),
      locale,
      muscleLabels: muscleLabels(locale, omitLabel),
    }),
  );
}

function row(html: string, testId: string): string {
  const match = new RegExp(
    `<tr[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</tr>`,
  ).exec(html);
  return match?.[1] ?? '';
}

describe('WorkoutVolumeSummary', () => {
  it('renders weekly totals from the report and excludes warm-up sets', () => {
    const html = render('en');

    expect(html).toContain('data-testid="volume-week"');
    expect(row(html, 'volume-week-chest')).toContain('data-credit="2"');
    expect(row(html, 'volume-week-chest')).toContain('>2<');
    expect(row(html, 'volume-week-chest')).toContain('Chest');
    expect(row(html, 'volume-week-core')).toBe('');

    // Bench prescribes one warm-up set; only its two working sets count.
    expect(row(html, 'volume-week-chest')).not.toContain('data-credit="3"');
  });

  it('credits secondary muscles at half per working set and keeps per-session totals separate from the week', () => {
    const html = render('en');

    expect(row(html, 'volume-session-day-push-chest')).toContain(
      'data-credit="2"',
    );
    expect(row(html, 'volume-session-day-push-triceps')).toContain(
      'data-credit="1.5"',
    );
    expect(row(html, 'volume-session-day-push-shoulders')).toContain(
      'data-credit="1"',
    );
    expect(row(html, 'volume-session-day-pull-back')).toContain(
      'data-credit="1"',
    );
    expect(row(html, 'volume-session-day-pull-biceps')).toContain(
      'data-credit="0.5"',
    );
    expect(row(html, 'volume-session-day-pull-chest')).toBe('');

    expect(row(html, 'volume-week-triceps')).toContain('data-credit="1.5"');
    expect(row(html, 'volume-week-biceps')).toContain('data-credit="0.5"');
  });

  it('shows an empty state for a session with no working sets and for a plan with no volume', () => {
    const html = render('en');
    const m = getMessages('en');
    expect(html).toContain(m['volume.untitledSession']);
    expect(html).toContain(m['volume.noWorkingSets']);

    const empty = renderToStaticMarkup(
      createElement(WorkoutVolumeSummary, {
        report: calculateWorkoutVolume(
          {
            days: [
              {
                id: 'day-warmup-only',
                kind: 'session',
                title: 'Prep',
                items: [
                  item('prep-bench', BENCH_PRESS, [
                    set('prep-bench-warmup', 'warmup'),
                  ]),
                ],
              },
            ],
          },
          snapshots,
        ),
        locale: 'en',
        muscleLabels: muscleLabels('en'),
      }),
    );
    expect(empty).toContain(m['volume.empty']);
    expect(empty).not.toContain('<table');
  });

  it('formats credits per locale and isolates numbers from the surrounding direction', () => {
    const en = render('en');
    const ar = render('ar');
    const arCredit = new Intl.NumberFormat('ar', {
      maximumFractionDigits: 1,
    }).format(1.5);

    expect(row(en, 'volume-week-triceps')).toContain('>1.5<');
    expect(row(en, 'volume-week-biceps')).toContain('>0.5<');
    expect(en).toContain('dir="ltr"');

    expect(ar).toContain(getMessages('ar')['volume.muscle.triceps']);
    expect(row(ar, 'volume-week-triceps')).toContain(`>${arCredit}<`);
    expect(row(ar, 'volume-week-triceps')).toContain('dir="ltr"');
  });

  it('exposes table captions and row/column header scopes', () => {
    const html = render('en');
    const m = getMessages('en');

    expect(html).toContain(`<caption`);
    expect(html).toContain(m['volume.weekCaption']);
    expect(html).toContain(m['volume.sessionCaption']);
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });

  it('falls back to the muscle code when no label is supplied', () => {
    const html = render('en', 'chest');
    expect(row(html, 'volume-week-chest')).toContain('>chest<');
  });
});
