import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Workbook, ValueType, type Worksheet } from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildWorkoutExportPayload,
  type WorkoutExportLibrary,
} from '../../lib/workout-planner/export-payload';
import {
  EXCEL_COLUMNS,
  buildWorkoutWorkbook,
} from '../../lib/workout-planner/excel-export';
import { EXPORT_FIELDS } from '../../lib/workout-planner/export-guards';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';
import type { MessageKey } from '../../lib/i18n';

// T038-note: FR-017/FR-018/SC-008 Excel workbook. The workbook is built from
// the same authorized payload as the PDF and Copy AI Prompt outputs. Every
// coach-authored cell is stored as text (formula injection neutralised) and
// the AR/EN headings are the S58-PO-5 approved bytes.

const uuid = (tail: string) =>
  `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
const ref = (tail: string) => ({
  source: 'global' as const,
  identity_id: uuid(tail),
  version: 1,
});

const BENCH = ref('1');
const DIP = ref('2');
const ALT_ONE = ref('3');
const ALT_TWO = ref('4');
const ALT_GONE = ref('5');

const EXERCISE_NAME = 'Bench Press';
const DESCRIPTION = 'Grip just outside shoulders';
const ITEM_NOTES = 'Pause on chest';
const DIP_NOTES = 'Slow eccentric';
const PLAN_TITLE = 'Strength Block A';
const PLAN_IDENTITY = 'Client LFT-0042';
const PLAN_NOTES = 'Plan note: deload week 4.';
const DOCUMENT_NOTES = 'Workout note: keep tempo steady.';
const DAY_TITLE = 'Push';
const DAY_NOTES = 'Shoulder prehab first.';
const REST_NOTES = 'Walk 20 minutes.';
const BENCH_VIDEO = 'https://video.example/bench';
const DIP_VIDEO = 'https://video.example/dip';
const ALT_ONE_VIDEO = 'https://video.example/db-press';
const ALT_ONE_NAME = 'Dumbbell Press';
const ALT_TWO_NAME = 'Machine Press';

type FixtureSet = {
  id: string;
  type: 'warmup' | 'working';
  load: unknown;
};

type FixtureItem = {
  id: string;
  exercise: ReturnType<typeof ref>;
  name: string;
  description?: string;
  reps?: { value: number } | { min: number; max: number };
  restSec?: number;
  rir?: number;
  notes?: string;
  alternatives: ReturnType<typeof ref>[];
  sets: FixtureSet[];
};

type FixtureDocument = {
  schema_version: 1;
  notes?: string;
  days: {
    id: string;
    kind: 'session' | 'rest';
    title?: string;
    notes?: string;
    items: FixtureItem[];
  }[];
};

function fixtureDocument(): FixtureDocument {
  return {
    schema_version: 1,
    notes: DOCUMENT_NOTES,
    days: [
      {
        id: uuid('11'),
        kind: 'session',
        title: DAY_TITLE,
        notes: DAY_NOTES,
        items: [
          {
            id: uuid('13'),
            exercise: BENCH,
            name: EXERCISE_NAME,
            description: DESCRIPTION,
            reps: { min: 8, max: 12 },
            restSec: 90,
            rir: 2,
            notes: ITEM_NOTES,
            alternatives: [ALT_ONE, ALT_TWO, ALT_GONE],
            sets: [
              {
                id: uuid('21'),
                type: 'warmup',
                load: { mode: 'added_weight', value: '20', unit: 'kg' },
              },
              {
                id: uuid('22'),
                type: 'working',
                load: { mode: 'added_weight', value: '60', unit: 'kg' },
              },
              {
                id: uuid('23'),
                type: 'working',
                load: { mode: 'bodyweight' },
              },
              {
                id: uuid('24'),
                type: 'working',
                load: { mode: 'assisted', value: '15', unit: 'lb' },
              },
            ],
          },
          {
            id: uuid('14'),
            exercise: DIP,
            name: 'Dip',
            description: 'Triceps bias',
            reps: { value: 10 },
            restSec: 60,
            rir: 1,
            notes: DIP_NOTES,
            alternatives: [],
            sets: [],
          },
        ],
      },
      {
        id: uuid('31'),
        kind: 'rest',
        notes: REST_NOTES,
        items: [],
      },
    ],
  };
}

function library(video = BENCH_VIDEO): WorkoutExportLibrary {
  const entries: Record<string, { name: string; videoUrl?: string }> = {
    [BENCH.identity_id]: {
      name: EXERCISE_NAME,
      videoUrl: video,
    },
    [DIP.identity_id]: { name: 'Dip', videoUrl: DIP_VIDEO },
    [ALT_ONE.identity_id]: {
      name: ALT_ONE_NAME,
      videoUrl: ALT_ONE_VIDEO,
    },
    [ALT_TWO.identity_id]: { name: ALT_TWO_NAME },
  };
  return {
    resolve: (reference) => {
      if (reference.identity_id === ALT_GONE.identity_id) return null;
      const entry = entries[reference.identity_id];
      return entry === undefined ? null : entry;
    },
  };
}

function payload() {
  return buildWorkoutExportPayload({
    plan: {
      title: PLAN_TITLE,
      identity: PLAN_IDENTITY,
      notes: PLAN_NOTES,
    },
    document: fixtureDocument(),
    library: library(),
  });
}

async function roundTrip(workbook: Workbook): Promise<Worksheet> {
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new Workbook();
  await loaded.xlsx.load(buffer);
  return loaded.worksheets[0]!;
}

function textRows(sheet: Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = typeof cell.value === 'string' ? cell.value : '';
    });
    rows.push(values);
  });
  return rows;
}

function cellsOf(sheet: Worksheet): string[] {
  return textRows(sheet)
    .flat()
    .filter((value) => value.length > 0);
}

/** Cell texts plus every newline-separated value inside a multi-line cell. */
function atomsOf(sheet: Worksheet): string[] {
  const cells = cellsOf(sheet);
  return [...cells, ...cells.flatMap((cell) => cell.split('\n'))];
}

const approved = readFileSync(
  join(process.cwd(), 'tests/fixtures/f17/export-headings.approved.txt'),
  'utf8',
)
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => {
    const [english, arabic] = line.split('\t');
    return { english: english!, arabic: arabic! };
  });

const APPROVED_KEYS: { key: MessageKey; english: string }[] = [
  { key: 'workout.export.plan', english: 'Plan' },
  { key: 'workout.export.day', english: 'Day' },
  { key: 'workout.export.restDay', english: 'Rest day' },
  { key: 'print.exercise', english: 'Exercise' },
  { key: 'workout.export.description', english: 'Description' },
  { key: 'print.sets', english: 'Sets' },
  { key: 'workout.export.setType', english: 'Set type' },
  { key: 'workout.export.warmUp', english: 'Warm-up' },
  { key: 'workout.export.working', english: 'Working' },
  { key: 'print.reps', english: 'Repetitions' },
  { key: 'workout.export.load', english: 'Load' },
  { key: 'workout.export.bodyweight', english: 'Bodyweight' },
  { key: 'workout.export.addedWeight', english: 'Added weight' },
  { key: 'workout.export.assisted', english: 'Assisted' },
  { key: 'workout.export.restSec', english: 'Rest (sec)' },
  { key: 'workout.export.rir', english: 'RIR' },
  { key: 'workout.export.notes', english: 'Notes' },
  { key: 'workout.export.alternatives', english: 'Alternatives' },
  { key: 'workout.export.video', english: 'Video' },
  { key: 'workout.export.loadUnit', english: 'kg / lb' },
];

const HEADING_LABELS = [
  'Plan',
  'Day',
  'Exercise',
  'Description',
  'Sets',
  'Set type',
  'Repetitions',
  'Load',
  'Rest (sec)',
  'RIR',
  'Notes',
  'Alternatives',
  'Video',
];

const HEADING_KEYS: MessageKey[] = EXCEL_COLUMNS.map(
  (column) => column.heading,
);

describe('F17 Excel workbook (T038; FR-017, FR-018, SC-008)', () => {
  it('exports every FR-018 field with authored text preserved', async () => {
    const sheet = await roundTrip(buildWorkoutWorkbook(payload(), 'en'));
    const cells = atomsOf(sheet);
    const expected: Record<(typeof EXPORT_FIELDS)[number], string> = {
      planTitle: PLAN_TITLE,
      planIdentity: PLAN_IDENTITY,
      documentNotes: DOCUMENT_NOTES,
      dayTitles: DAY_TITLE,
      restDays: en['workout.export.restDay'],
      exerciseNames: 'Dip',
      exerciseDescriptions: DESCRIPTION,
      setOrder: '4',
      setTypes: en['workout.export.working'],
      reps: '8-12',
      load: `Added weight 20 kg`,
      loadUnits: 'Assisted 15 lb',
      loadModes: en['workout.export.bodyweight'],
      rest: '90',
      rir: '2',
      planNotes: PLAN_NOTES,
      dayNotes: REST_NOTES,
      exerciseNotes: ITEM_NOTES,
      alternatives: ALT_TWO_NAME,
      videoLinks: BENCH_VIDEO,
    };
    expect(Object.keys(expected).sort()).toEqual([...EXPORT_FIELDS].sort());
    for (const [field, value] of Object.entries(expected)) {
      expect(cells, `field ${field}`).toContain(value);
    }
    // Authored text and English exercise names are preserved byte-exact.
    expect(cells).toContain(EXERCISE_NAME);
    expect(cells).toContain(DAY_NOTES);
    expect(cells).toContain(DIP_NOTES);
    expect(cells).toContain(DIP_VIDEO);
    expect(cells).toContain(ALT_ONE_NAME);
    const bench = textRows(sheet).find((row) => row[2] === EXERCISE_NAME)!;
    expect(bench[11]).toBe(`${ALT_ONE_NAME}\n${ALT_TWO_NAME}`);
  });

  it('uses the approved AR/EN headings byte-exactly', async () => {
    const headingRow = (sheet: Worksheet, planLabel: string) => {
      const rows = textRows(sheet);
      const index = rows.findIndex(
        (row) => row[0] === planLabel && row.length === 13,
      );
      return rows[index]!;
    };
    const english = headingRow(
      await roundTrip(buildWorkoutWorkbook(payload(), 'en')),
      en['workout.export.plan'],
    );
    const arabic = headingRow(
      await roundTrip(buildWorkoutWorkbook(payload(), 'ar')),
      ar['workout.export.plan'],
    );
    expect(APPROVED_KEYS.map((entry) => entry.english)).toEqual(
      approved.map((entry) => entry.english),
    );
    const expectedHeadings = HEADING_LABELS.map((label) =>
      approved.find((entry) => entry.english === label)!,
    );
    expect(english.slice(0, HEADING_KEYS.length)).toEqual(
      expectedHeadings.map((entry) => entry.english),
    );
    expect(arabic.slice(0, HEADING_KEYS.length)).toEqual(
      expectedHeadings.map((entry) => entry.arabic),
    );
    APPROVED_KEYS.forEach((entry, index) => {
      expect(en[entry.key]).toBe(approved[index]!.english);
      expect(ar[entry.key]).toBe(approved[index]!.arabic);
    });
    expect(EXCEL_COLUMNS.map((column) => column.heading)).toEqual(HEADING_KEYS);
  });

  it('labels the sheet and direction in the UI locale', async () => {
    const english = await roundTrip(buildWorkoutWorkbook(payload(), 'en'));
    const arabic = await roundTrip(buildWorkoutWorkbook(payload(), 'ar'));
    expect(english.name).toBe(en['workout.export.plan']);
    expect(arabic.name).toBe(ar['workout.export.plan']);
    expect(arabic.views[0]?.rightToLeft).toBe(true);
    expect(english.views[0]?.rightToLeft).toBe(false);
  });

  it('stores every cell as text and never as a formula', async () => {
    const sheet = await roundTrip(buildWorkoutWorkbook(payload(), 'en'));
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value === null || cell.value === '') return;
        expect(typeof cell.value, `cell ${cell.address}`).toBe('string');
        expect(cell.type, `cell ${cell.address}`).toBe(ValueType.String);
        expect(cell.numFmt, `cell ${cell.address}`).toBe('@');
      });
    });
  });

  it('neutralises formula injection from every coach-authored cell', async () => {
    const attacks = ['=1+1', '+1', '-1', '@SUM(A1)', '  =2+2', '\t=cmd'];
    const document = fixtureDocument();
    document.days[0]!.title = attacks[0]!;
    document.days[0]!.notes = attacks[1]!;
    document.days[0]!.items[0]!.name = attacks[2]!;
    document.days[0]!.items[0]!.description = attacks[3]!;
    document.days[0]!.items[0]!.notes = attacks[4]!;
    document.notes = attacks[5]!;
    const exported = buildWorkoutExportPayload({
      plan: { title: attacks[0]!, identity: attacks[1]! },
      document,
      library: library(),
    });
    const sheet = await roundTrip(buildWorkoutWorkbook(exported, 'en'));
    const cells = atomsOf(sheet);
    for (const attack of attacks) expect(cells).toContain(attack);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        expect(cell.formula, `cell ${cell.address}`).toBeUndefined();
        expect(cell.type, `cell ${cell.address}`).not.toBe(ValueType.Formula);
      });
    });
  });

  it('repeats entry prescriptions beside each set and keeps zero-set entries', async () => {
    const rows = textRows(
      await roundTrip(buildWorkoutWorkbook(payload(), 'en')),
    );
    const bench = rows.filter((row) => row[2] === EXERCISE_NAME);
    expect(bench.map((row) => row[4])).toEqual(['1', '2', '3', '4']);
    expect(new Set(bench.map((row) => row[6]))).toEqual(new Set(['8-12']));
    expect(new Set(bench.map((row) => row[8]))).toEqual(new Set(['90']));
    const dip = rows.filter((row) => row[2] === 'Dip');
    expect(dip).toHaveLength(1);
    expect([dip[0]![4], dip[0]![6], dip[0]![8], dip[0]![9]]).toEqual([
      '',
      '10',
      '60',
      '1',
    ]);
    const rest = rows.find((row) => row[1] === en['workout.export.restDay']);
    expect(rest?.[10]).toBe(REST_NOTES);
  });

  it('resolves video URLs live from the current library', async () => {
    const changed = 'https://video.example/bench-v2';
    const input = {
      plan: { title: PLAN_TITLE, identity: PLAN_IDENTITY },
      document: fixtureDocument(),
    };
    const before = await roundTrip(
      buildWorkoutWorkbook(
        buildWorkoutExportPayload({ ...input, library: library() }),
        'en',
      ),
    );
    const after = await roundTrip(
      buildWorkoutWorkbook(
        buildWorkoutExportPayload({ ...input, library: library(changed) }),
        'en',
      ),
    );
    expect(atomsOf(before)).toContain(BENCH_VIDEO);
    expect(atomsOf(after)).toContain(changed);
    expect(atomsOf(after)).not.toContain(BENCH_VIDEO);
  });

  it('rejects an invalid document and a missing plan identity', () => {
    expect(() =>
      buildWorkoutExportPayload({
        plan: { title: PLAN_TITLE, identity: PLAN_IDENTITY },
        document: { schema_version: 1, days: [{ kind: 'rest', items: [{}] }] },
        library: library(),
      }),
    ).toThrowError('invalid_document');
    expect(() =>
      buildWorkoutExportPayload({
        plan: { title: PLAN_TITLE, identity: ' ' },
        document: fixtureDocument(),
        library: library(),
      }),
    ).toThrowError('invalid_document');
  });
});
