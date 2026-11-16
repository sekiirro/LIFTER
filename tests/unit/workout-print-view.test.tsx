// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkoutPrintView } from '../../components/workout-planner/WorkoutPrintView';
import { getMessages } from '../../lib/i18n';
import {
  EXCEL_COLUMNS,
  PRINT_TABLE_COLUMNS,
  getWorkoutExportLabels,
  formatWorkoutExportLoad,
  formatWorkoutExportReps,
  formatWorkoutExportSetType,
} from '../../lib/workout-planner/excel-export';
import type { WorkoutExportPayload } from '../../lib/workout-planner/export-payload';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderView(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
});

function makeFullPayload(): WorkoutExportPayload {
  return {
    planTitle: 'Hypertrophy Block A — خطة التضخيم أ',
    planIdentity: 'LFT-0042 • Revision 2',
    planNotes: 'Plan note: Keep progressive overload steady. ملاحظة الخطة.',
    documentNotes: 'Document note: Log every working set. ملاحظة المستند.',
    days: [
      {
        kind: 'session',
        title: 'Upper Body Push',
        notes: 'Day 1 note: Warm up shoulders well.',
        items: [
          {
            name: 'Incline Dumbbell Press',
            description: '30-degree bench, controlled eccentric',
            reps: { min: 8, max: 10 },
            restSec: 120,
            rir: 2,
            notes: 'Pause 1s at the bottom',
            alternatives: [
              {
                name: 'Barbell Incline Press',
                videoUrl: 'https://video.example.com/barbell-incline',
              },
              {
                name: 'Machine Chest Press',
              },
            ],
            videoUrl: 'https://video.example.com/incline-db-press',
            sets: [
              { type: 'warmup', load: { mode: 'bodyweight' } },
              {
                type: 'working',
                load: { mode: 'added_weight', value: '32.5', unit: 'kg' },
              },
            ],
          },
          {
            name: 'Assisted Pull-Up',
            reps: { value: 12 },
            restSec: 90,
            rir: 1,
            alternatives: [],
            sets: [
              {
                type: 'working',
                load: { mode: 'assisted', value: '15', unit: 'lb' },
              },
            ],
          },
          {
            name: 'Plank Hold',
            reps: { value: 45 },
            restSec: 60,
            rir: 0,
            notes: 'Zero-set entry still renders prescriptions',
            alternatives: [],
            sets: [],
          },
        ],
      },
      {
        kind: 'rest',
        title: 'Active Recovery',
        notes: 'Rest day note: 20 min light walk.',
        items: [],
      },
    ],
  };
}

describe('WorkoutPrintView (T037)', () => {
  it.each(['en', 'ar'] as const)(
    'renders every FR-018 field and exact PO-approved i18n labels in %s',
    (locale) => {
      const payload = makeFullPayload();
      const m = getMessages(locale);
      const host = renderView(
        <WorkoutPrintView payload={payload} locale={locale} />,
      );

      const article = host.querySelector('article');
      expect(article).not.toBeNull();
      expect(article?.getAttribute('dir')).toBe(
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      expect(article?.getAttribute('lang')).toBe(locale);

      const text = host.textContent ?? '';

      // Plan metadata + authored notes preserved verbatim
      expect(text).toContain(payload.planTitle);
      expect(text).toContain(payload.planIdentity);
      expect(text).toContain(payload.planNotes!);
      expect(text).toContain(payload.documentNotes!);

      // PO-approved i18n labels (S58-PO-5)
      expect(text).toContain(m['workout.export.plan']);
      expect(text).toContain(m['workout.export.day']);
      expect(text).toContain(m['workout.export.restDay']);
      expect(text).toContain(m['print.exercise']);
      expect(text).toContain(m['workout.export.description']);
      expect(text).toContain(m['print.sets']);
      expect(text).toContain(m['workout.export.setType']);
      expect(text).toContain(m['workout.export.warmUp']);
      expect(text).toContain(m['workout.export.working']);
      expect(text).toContain(m['print.reps']);
      expect(text).toContain(m['workout.export.load']);
      expect(text).toContain(m['workout.export.bodyweight']);
      expect(text).toContain(m['workout.export.addedWeight']);
      expect(text).toContain(m['workout.export.assisted']);
      expect(text).toContain(m['workout.export.restSec']);
      expect(text).toContain(m['workout.export.rir']);
      expect(text).toContain(m['workout.export.notes']);
      expect(text).toContain(m['workout.export.alternatives']);
      expect(text).toContain(m['workout.export.video']);

      // Day titles and notes
      expect(text).toContain('Upper Body Push');
      expect(text).toContain('Day 1 note: Warm up shoulders well.');
      expect(text).toContain('Active Recovery');
      expect(text).toContain('Rest day note: 20 min light walk.');

      // Exercise names (kept English), descriptions, reps, rest, RIR, notes
      expect(text).toContain('Incline Dumbbell Press');
      expect(text).toContain('30-degree bench, controlled eccentric');
      expect(text).toContain('8-10');
      expect(text).toContain('120');
      expect(text).toContain('2');
      expect(text).toContain('Pause 1s at the bottom');

      // Load modes + units
      expect(text).toContain('32.5 kg');
      expect(text).toContain('15 lb');

      // Alternatives + live video links
      expect(text).toContain('Barbell Incline Press');
      expect(text).toContain('Machine Chest Press');
      const links = Array.from(host.querySelectorAll('a'));
      expect(
        links.some(
          (a) =>
            a.getAttribute('href') ===
              'https://video.example.com/incline-db-press' &&
            a.textContent === 'https://video.example.com/incline-db-press',
        ),
      ).toBe(true);
      expect(
        links.some(
          (a) =>
            a.getAttribute('href') ===
              'https://video.example.com/barbell-incline' &&
            a.textContent === 'https://video.example.com/barbell-incline',
        ),
      ).toBe(true);

      // Zero-set item still renders its entry-level prescriptions
      expect(text).toContain('Plank Hold');
      expect(text).toContain('Zero-set entry still renders prescriptions');
      expect(text).toContain('45');
    },
  );

  it('preserves warm-up before working sets in order', () => {
    const payload = makeFullPayload();
    const host = renderView(<WorkoutPrintView payload={payload} locale="en" />);
    const m = getMessages('en');
    const html = host.innerHTML;
    const warmUpPos = html.indexOf(m['workout.export.warmUp']);
    const workingPos = html.indexOf(m['workout.export.working']);
    expect(warmUpPos).toBeGreaterThan(-1);
    expect(workingPos).toBeGreaterThan(warmUpPos);
  });

  it('does not render unsafe non-http(s) video URLs as clickable links', () => {
    const payload = makeFullPayload();
    payload.days[0]!.items[0]!.videoUrl = 'javascript:alert(1)';
    const host = renderView(<WorkoutPrintView payload={payload} locale="en" />);
    const links = Array.from(host.querySelectorAll('a'));
    expect(
      links.some((a) => a.getAttribute('href') === 'javascript:alert(1)'),
    ).toBe(false);
  });

  it('defines print CSS that repeats table headers and avoids breaking a set row', () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        'components/workout-planner/WorkoutPrintView.module.css',
      ),
      'utf8',
    );
    expect(css).toContain('@media print');
    expect(css).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/s);
    expect(css).toMatch(/tr\s*\{[^}]*break-inside:\s*avoid/s);
  });

  it.each(['en', 'ar'] as const)(
    'reuses the merged T038 Excel export column headings in exact order (%s)',
    (locale) => {
      const payload = makeFullPayload();
      const m = getMessages(locale);
      const host = renderView(
        <WorkoutPrintView payload={payload} locale={locale} />,
      );

      const thList = Array.from(host.querySelectorAll('thead th')).map(
        (th) => th.textContent?.trim() ?? '',
      );
      const expectedHeadings = PRINT_TABLE_COLUMNS.map((col) => m[col.heading]);

      expect(thList).toEqual(expectedHeadings);
      expect(PRINT_TABLE_COLUMNS.map((c) => c.key)).toEqual([
        'exercise',
        'description',
        'sets',
        'setType',
        'reps',
        'load',
        'restSec',
        'rir',
        'notes',
        'alternatives',
        'video',
      ]);
    },
  );

  it.each(['en', 'ar'] as const)(
    'shares formatting logic with T038 Excel export without duplication (%s)',
    (locale) => {
      const labels = getWorkoutExportLabels(locale);
      const item = makeFullPayload().days[0]!.items[0]!;

      // reps
      expect(formatWorkoutExportReps(item)).toBe('8-10');

      // set types
      expect(formatWorkoutExportSetType(item.sets[0]!, labels)).toBe(
        labels.warmUp,
      );
      expect(formatWorkoutExportSetType(item.sets[1]!, labels)).toBe(
        labels.working,
      );

      // loads
      expect(formatWorkoutExportLoad(item.sets[0]!, labels)).toBe(
        labels.bodyweight,
      );
      expect(formatWorkoutExportLoad(item.sets[1]!, labels)).toBe(
        `${labels.addedWeight} 32.5 kg`,
      );
    },
  );

  it('matches approved S58-PO-5 export headings byte-for-byte in both EN and AR', () => {
    const fixturePath = resolve(
      process.cwd(),
      'tests/fixtures/f17/export-headings.approved.txt',
    );
    const approvedLines = readFileSync(fixturePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.trim().split('\t'));
    const approvedMap = new Map<string, string>(
      approvedLines.map(([enText, arText]) => [enText!, arText!]),
    );

    const mEn = getMessages('en');
    const mAr = getMessages('ar');

    for (const col of EXCEL_COLUMNS) {
      const enHeading = mEn[col.heading];
      const arHeading = mAr[col.heading];
      expect(approvedMap.has(enHeading)).toBe(true);
      expect(approvedMap.get(enHeading)).toBe(arHeading);
    }
  });
});
