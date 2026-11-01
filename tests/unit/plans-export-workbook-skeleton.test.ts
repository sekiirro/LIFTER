import { describe, expect, it } from 'vitest';
import { toCoachTextCell } from '../../lib/plans/workout/export-guard';
import {
  createWorkbookSheet,
  createWorkbookSkeleton,
  WorkbookSkeletonError,
} from '../../lib/plans/export/workbook-skeleton';
import { PrintLayoutError } from '../../lib/plans/export/print-layout';

const ARABIC_NOTE =
  '\u062a\u0645\u0631\u064a\u0646 \u0627\u0644\u0633\u0642\u0648';

const columns = [
  { key: 'exercise', header: 'Exercise' },
  { key: 'reps', header: 'Reps' },
  { key: 'notes', header: 'Notes' },
] as const;

const rows = [
  {
    exercise: 'Bench press',
    reps: '3x10',
    notes: '=SUM(A1:A5)',
  },
  {
    exercise: ARABIC_NOTE,
    reps: '5',
    notes: '+1',
  },
] as const;

describe('F17 export workbook skeleton', () => {
  it('marks Arabic workbooks right-to-left and keeps header order', () => {
    const sheet = createWorkbookSheet('ar', {
      name: 'Push A',
      columns,
      rows,
    });

    expect(sheet.name).toBe('Push A');
    expect(sheet.rightToLeft).toBe(true);
    expect(sheet.columns).toEqual(columns);
    expect(sheet.columns.map((column) => column.key)).toEqual([
      'exercise',
      'reps',
      'notes',
    ]);
  });

  it('marks English workbooks left-to-right', () => {
    const sheet = createWorkbookSheet('en', {
      name: 'Push A',
      columns,
      rows,
    });

    expect(sheet.rightToLeft).toBe(false);
  });

  it('builds tabular rows whose cells come from toCoachTextCell', () => {
    const sheet = createWorkbookSheet('ar', {
      name: 'Push A',
      columns,
      rows,
    });

    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]!.cells).toEqual({
      exercise: toCoachTextCell('Bench press'),
      reps: toCoachTextCell('3x10'),
      notes: toCoachTextCell('=SUM(A1:A5)'),
    });
    expect(sheet.rows[1]!.cells.notes).toEqual(toCoachTextCell('+1'));
    expect(sheet.rows[1]!.cells.exercise).toEqual(toCoachTextCell(ARABIC_NOTE));
    for (const row of sheet.rows) {
      for (const cell of Object.values(row.cells)) {
        expect(cell.type).toBe('string');
      }
    }
  });

  it('fills missing cells with guarded empty strings', () => {
    const sheet = createWorkbookSheet('en', {
      name: 'Push A',
      columns,
      rows: [{ exercise: 'Bench press' }],
    });

    expect(sheet.rows[0]!.cells).toEqual({
      exercise: toCoachTextCell('Bench press'),
      reps: toCoachTextCell(''),
      notes: toCoachTextCell(''),
    });
  });

  it('builds a workbook from sheets in input order', () => {
    const workbook = createWorkbookSkeleton('ar', [
      { name: 'Push A', columns, rows },
      { name: 'Pull A', columns, rows: [] },
    ]);

    expect(workbook.locale).toBe('ar');
    expect(workbook.rightToLeft).toBe(true);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'Push A',
      'Pull A',
    ]);
    expect(workbook.sheets.every((sheet) => sheet.rightToLeft)).toBe(true);
  });

  it('rejects duplicate sheet names case-insensitively within a workbook', () => {
    expect(() =>
      createWorkbookSkeleton('en', [
        { name: 'Push A', columns, rows },
        { name: 'Push A', columns, rows: [] },
      ]),
    ).toThrow(WorkbookSkeletonError);
    expect(() =>
      createWorkbookSkeleton('ar', [
        { name: 'Push A', columns, rows },
        { name: 'push a', columns, rows: [] },
      ]),
    ).toThrow(WorkbookSkeletonError);
    expect(() =>
      createWorkbookSkeleton('en', [
        { name: 'Push A', columns, rows },
        { name: 'PULL A', columns, rows },
        { name: 'pull a', columns, rows },
      ]),
    ).toThrow(WorkbookSkeletonError);
  });

  it('rejects unsupported locales with the print-layout error', () => {
    expect(() =>
      createWorkbookSheet('fr', { name: 'Push A', columns, rows }),
    ).toThrow(PrintLayoutError);
    expect(() =>
      createWorkbookSkeleton('en-US', [{ name: 'Push A', columns, rows }]),
    ).toThrow(PrintLayoutError);
  });

  it('rejects invalid sheet names', () => {
    const invalidNames = [
      '',
      '   ',
      'a'.repeat(32),
      'Bad:name',
      'Bad\\name',
      'Bad/name',
      'Bad?name',
      'Bad*name',
      'Bad[name]',
      'Bad]name',
      "'Push A",
      "Push A'",
      "'Push A'",
    ];

    for (const name of invalidNames) {
      expect(
        () => createWorkbookSheet('en', { name, columns, rows }),
        name,
      ).toThrow(WorkbookSkeletonError);
    }
  });

  it('accepts a 31-character sheet name', () => {
    const name = 'a'.repeat(31);
    const sheet = createWorkbookSheet('en', { name, columns, rows });

    expect(sheet.name).toBe(name);
  });

  it('rejects unknown row keys and non-string cell values', () => {
    expect(() =>
      createWorkbookSheet('en', {
        name: 'Push A',
        columns,
        rows: [{ unknown: 'value' }],
      }),
    ).toThrow(WorkbookSkeletonError);

    expect(() =>
      createWorkbookSheet('en', {
        name: 'Push A',
        columns,
        rows: [{ exercise: 42 } as unknown as { exercise: string }],
      }),
    ).toThrow(WorkbookSkeletonError);
  });
});
