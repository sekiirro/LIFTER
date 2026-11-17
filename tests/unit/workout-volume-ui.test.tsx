import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VolumePanel } from '../../components/workout-planner/VolumePanel';
import { formatUiNumber } from '../../lib/i18n/format-digits';
import { ar } from '../../lib/i18n/messages/ar';
import { en } from '../../lib/i18n/messages/en';
import type {
  MuscleMembership,
  VolumeDay,
} from '../../lib/workout-planner/volume';

const MUSCLES: Record<string, MuscleMembership> = {
  bench: { primary: 'chest', secondaries: ['triceps', 'front_delts'] },
  squat: { primary: 'quads', secondaries: ['glutes'] },
};

const A3_6_DAYS: VolumeDay[] = [
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

const A3_7_DAYS: VolumeDay[] = [
  {
    dayIndex: 1,
    kind: 'session',
    items: [
      {
        exerciseId: 'bench',
        sets: [{ type: 'working', exerciseId: 'bench' }],
      },
    ],
  },
  {
    dayIndex: 2,
    kind: 'rest',
    items: [],
  },
  {
    dayIndex: 8,
    kind: 'session',
    items: [
      {
        exerciseId: 'squat',
        sets: [
          { type: 'working', exerciseId: 'squat' },
          { type: 'working', exerciseId: 'squat' },
        ],
      },
    ],
  },
  {
    dayIndex: 9,
    kind: 'session',
    items: [
      {
        exerciseId: 'squat',
        sets: [{ type: 'working', exerciseId: 'squat' }],
      },
    ],
  },
];

function render(
  locale: 'ar' | 'en',
  days: VolumeDay[],
  muscles: Record<string, MuscleMembership> = MUSCLES,
) {
  return renderToStaticMarkup(
    createElement(VolumePanel, { locale, days, muscles }),
  );
}

describe('F17 T036 VolumePanel UI (FR-016, SC-007)', () => {
  it('renders A3-6 working sets only (primary 1.0, secondary 0.5, warm-up 0)', () => {
    const html = render('en', A3_6_DAYS);

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
    expect(html).toContain(en['workout.volume.title']);
    expect(html).toContain(en['workout.volume.muscle']);
    expect(html).toContain(en['workout.volume.session']);
    expect(html).toContain(en['workout.volume.workingSets']);
    expect(html).toContain(en['workout.volume.total']);
    expect(html).toContain(en['workout.volume.primary']);
    expect(html).toContain(en['workout.volume.secondary']);
    expect(html).toContain(en['workout.volume.warmupNotCounted']);

    // Muscle names from F16 catalog i18n
    expect(html).toContain(en['catalog.taxonomy.muscle.chest']);
    expect(html).toContain(en['catalog.taxonomy.muscle.triceps']);
    expect(html).toContain(en['catalog.taxonomy.muscle.front_delts']);

    // Exact A3-6 totals: Chest 3, Triceps 1.5, Front Delts 1.5 (warm-up 2 excluded)
    expect(html).toContain('<bdi dir="ltr">3</bdi>');
    expect(html).toContain('<bdi dir="ltr">1.5</bdi>');
    expect(html).not.toContain('<bdi dir="ltr">5</bdi>');
    expect(html).not.toContain('<bdi dir="ltr">2.5</bdi>');
  });

  it('renders A3-7 per-week blocks (1-7 incl. rest days, partial final week) and per-session columns', () => {
    const html = render('en', A3_7_DAYS);

    // Week 1 and partial Week 2
    expect(html).toContain('Week <bdi dir="ltr">1</bdi>');
    expect(html).toContain('Week <bdi dir="ltr">2</bdi>');

    // Per-session day headers including rest day
    expect(html).toContain(
      `${en['workout.export.day']} <bdi dir="ltr">1</bdi>`,
    );
    expect(html).toContain(
      `${en['workout.export.day']} <bdi dir="ltr">2</bdi>`,
    );
    expect(html).toContain(en['workout.export.restDay']);
    expect(html).toContain(
      `${en['workout.export.day']} <bdi dir="ltr">8</bdi>`,
    );
    expect(html).toContain(
      `${en['workout.export.day']} <bdi dir="ltr">9</bdi>`,
    );

    // Quads: 2 in Day 8 + 1 in Day 9 = 3 in Week 2
    expect(html).toContain(en['catalog.taxonomy.muscle.quads']);
    expect(html).toContain(en['catalog.taxonomy.muscle.glutes']);
    expect(html).toContain('<bdi dir="ltr">3</bdi>');
    expect(html).toContain('<bdi dir="ltr">1.5</bdi>');
    expect(html).toContain('<bdi dir="ltr">0.5</bdi>');
  });

  it('renders empty state when there are no working sets (empty plan, rest-only, or warmup-only)', () => {
    for (const days of [
      [],
      [{ dayIndex: 1, kind: 'rest' as const, items: [] }],
      [
        {
          dayIndex: 1,
          kind: 'session' as const,
          items: [
            {
              exerciseId: 'bench',
              sets: [{ type: 'warmup' as const, exerciseId: 'bench' }],
            },
          ],
        },
      ],
    ]) {
      const enHtml = render('en', days);
      expect(enHtml).toContain(en['workout.volume.empty']);
      expect(enHtml).not.toContain('<table');

      const arHtml = render('ar', days);
      expect(arHtml).toContain(ar['workout.volume.empty']);
      expect(arHtml).not.toContain('<table');
    }
  });

  it('renders Arabic RTL with PO-approved labels and numbers in LTR isolates', () => {
    const html = render('ar', A3_6_DAYS);

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain(ar['workout.volume.title']);
    expect(html).toContain(ar['workout.volume.muscle']);
    expect(html).toContain(ar['workout.volume.session']);
    expect(html).toContain(ar['workout.volume.workingSets']);
    expect(html).toContain(ar['workout.volume.total']);
    expect(html).toContain(ar['workout.volume.primary']);
    expect(html).toContain(ar['workout.volume.secondary']);
    expect(html).toContain(ar['workout.volume.warmupNotCounted']);

    // Arabic muscle names from F16 catalog
    expect(html).toContain(ar['catalog.taxonomy.muscle.chest']);
    expect(html).toContain(ar['catalog.taxonomy.muscle.triceps']);
    expect(html).toContain(ar['catalog.taxonomy.muscle.front_delts']);

    // Week 1 with Arabic digit in LTR isolate
    const oneAr = formatUiNumber(1, 'ar');
    const threeAr = formatUiNumber(3, 'ar');
    const onePointFiveAr = formatUiNumber(1.5, 'ar');
    expect(html).toContain(`<bdi dir="ltr">${oneAr}</bdi>`);
    expect(html).toContain(`<bdi dir="ltr">${threeAr}</bdi>`);
    expect(html).toContain(`<bdi dir="ltr">${onePointFiveAr}</bdi>`);
  });

  it('matches the PO-approved EN and AR strings exactly', () => {
    expect(en['workout.volume.title']).toBe('Volume');
    expect(en['workout.volume.muscle']).toBe('Muscle');
    expect(en['workout.volume.session']).toBe('Session');
    expect(en['workout.volume.week']).toBe('Week {n}');
    expect(en['workout.volume.workingSets']).toBe('Working sets');
    expect(en['workout.volume.total']).toBe('Total');
    expect(en['workout.volume.primary']).toBe('Primary');
    expect(en['workout.volume.secondary']).toBe('Secondary (×0.5)');
    expect(en['workout.volume.warmupNotCounted']).toBe(
      'Warm-up sets not counted',
    );
    expect(en['workout.volume.empty']).toBe('No working sets yet');

    expect(ar['workout.volume.title']).toBe('الحجم');
    expect(ar['workout.volume.muscle']).toBe('العضلة');
    expect(ar['workout.volume.session']).toBe('الجلسة');
    expect(ar['workout.volume.week']).toBe('الأسبوع {n}');
    expect(ar['workout.volume.workingSets']).toBe('المجموعات الأساسية');
    expect(ar['workout.volume.total']).toBe('الإجمالي');
    expect(ar['workout.volume.primary']).toBe('أساسية');
    expect(ar['workout.volume.secondary']).toBe('ثانوية (×0.5)');
    expect(ar['workout.volume.warmupNotCounted']).toBe(
      'مجموعات الإحماء مش بتتحسب',
    );
    expect(ar['workout.volume.empty']).toBe('لسه مفيش مجموعات أساسية');
  });
});
