// F17 Excel workbook writer (T038; FR-017, FR-018, SC-008).
//
// The workbook is built in the browser from the same authorized payload as the
// PDF and Copy AI Prompt outputs. Headings are the PO-approved S58-PO-5
// strings in the UI language; exercise names stay English and coach-authored
// text is stored unchanged. Every cell is written as text (`numFmt: '@'`), so
// values starting `=`, `+`, `-`, `@` or a control character can never execute
// as a formula (FR-017, SC-008).

import { Workbook, type Cell, type Worksheet } from 'exceljs';
import type { Locale } from '../design/preferences';
import { getMessages, type MessageKey } from '../i18n';
import { toSafeCell } from './export-guards';
import type {
  WorkoutExportDay,
  WorkoutExportItem,
  WorkoutExportPayload,
  WorkoutExportSet,
} from './export-payload';

/** Column order and heading messages (S58-PO-5 approved bytes). */
export const EXCEL_COLUMNS = [
  { key: 'plan', heading: 'workout.export.plan', width: 24 },
  { key: 'day', heading: 'workout.export.day', width: 20 },
  { key: 'exercise', heading: 'print.exercise', width: 26 },
  { key: 'description', heading: 'workout.export.description', width: 32 },
  { key: 'sets', heading: 'print.sets', width: 8 },
  { key: 'setType', heading: 'workout.export.setType', width: 16 },
  { key: 'reps', heading: 'print.reps', width: 14 },
  { key: 'load', heading: 'workout.export.load', width: 20 },
  { key: 'restSec', heading: 'workout.export.restSec', width: 14 },
  { key: 'rir', heading: 'workout.export.rir', width: 16 },
  { key: 'notes', heading: 'workout.export.notes', width: 32 },
  { key: 'alternatives', heading: 'workout.export.alternatives', width: 24 },
  { key: 'video', heading: 'workout.export.video', width: 32 },
] as const satisfies readonly {
  key: string;
  heading: MessageKey;
  width: number;
}[];

/** Columns rendered within the printable item table (excludes document/day-level columns 'plan' and 'day'). */
export const PRINT_TABLE_COLUMNS = EXCEL_COLUMNS.filter(
  (col) => col.key !== 'plan' && col.key !== 'day',
);

type ColumnKey = (typeof EXCEL_COLUMNS)[number]['key'];
type ExportRow = Partial<Record<ColumnKey, string>>;

function writeCell(cell: Cell, value: string): void {
  cell.value = toSafeCell(value).value;
  cell.numFmt = '@';
  cell.alignment = { vertical: 'top', wrapText: true };
}

function writeRow(sheet: Worksheet, values: string[]): void {
  const row = sheet.addRow([]);
  values.forEach((value, index) => writeCell(row.getCell(index + 1), value));
}

export function formatWorkoutExportReps(item: WorkoutExportItem): string {
  if (!item.reps) return '';
  return 'value' in item.reps
    ? String(item.reps.value)
    : `${item.reps.min}-${item.reps.max}`;
}

export function formatWorkoutExportSetType(
  set: WorkoutExportSet,
  labels: WorkoutExportLabels,
): string {
  return set.type === 'warmup' ? labels.warmUp : labels.working;
}

export type WorkoutExportLabels = {
  plan: string;
  restDay: string;
  bodyweight: string;
  addedWeight: string;
  assisted: string;
  warmUp: string;
  working: string;
};

export function getWorkoutExportLabels(locale: Locale): WorkoutExportLabels {
  const messages = getMessages(locale);
  return {
    plan: messages['workout.export.plan'],
    restDay: messages['workout.export.restDay'],
    bodyweight: messages['workout.export.bodyweight'],
    addedWeight: messages['workout.export.addedWeight'],
    assisted: messages['workout.export.assisted'],
    warmUp: messages['workout.export.warmUp'],
    working: messages['workout.export.working'],
  };
}

export function formatWorkoutExportLoad(
  set: WorkoutExportSet,
  labels: WorkoutExportLabels,
): string {
  if (set.load.mode === 'bodyweight') return labels.bodyweight;
  const mode =
    set.load.mode === 'added_weight' ? labels.addedWeight : labels.assisted;
  return `${mode} ${set.load.value} ${set.load.unit}`;
}

function itemRows(
  item: WorkoutExportItem,
  labels: WorkoutExportLabels,
): ExportRow[] {
  const shared = {
    exercise: item.name,
    description: item.description ?? '',
    reps: formatWorkoutExportReps(item),
    restSec: item.restSec === undefined ? '' : String(item.restSec),
    rir: item.rir === undefined ? '' : String(item.rir),
    notes: item.notes ?? '',
    alternatives: item.alternatives.map((entry) => entry.name).join('\n'),
    video: [
      ...(item.videoUrl === undefined ? [] : [item.videoUrl]),
      ...item.alternatives.flatMap((entry) =>
        entry.videoUrl === undefined ? [] : [entry.videoUrl],
      ),
    ].join('\n'),
  };
  if (item.sets.length === 0) return [{ ...shared }];
  return item.sets.map((set, index) => ({
    ...shared,
    sets: String(index + 1),
    setType: formatWorkoutExportSetType(set, labels),
    load: formatWorkoutExportLoad(set, labels),
  }));
}

function dayRows(
  day: WorkoutExportDay,
  index: number,
  labels: WorkoutExportLabels,
): ExportRow[] {
  const dayLabel = day.title ?? String(index + 1);
  if (day.kind === 'rest') {
    return [{ day: labels.restDay, notes: day.notes ?? '' }];
  }
  const items = day.items.flatMap((item) =>
    itemRows(item, labels).map((row) => ({ day: dayLabel, ...row })),
  );
  if (day.notes === undefined) return items;
  return [{ day: dayLabel, notes: day.notes }, ...items];
}

function toValues(row: ExportRow): string[] {
  return EXCEL_COLUMNS.map((column) => row[column.key] ?? '');
}

/**
 * Build the Excel workbook for one authorized published revision. The caller
 * writes the returned workbook to an `.xlsx` buffer.
 */
export function buildWorkoutWorkbook(
  payload: WorkoutExportPayload,
  locale: Locale,
): Workbook {
  const messages = getMessages(locale);
  const labels = getWorkoutExportLabels(locale);
  const workbook = new Workbook();
  workbook.creator = 'LIFTER';
  const metaRows: string[][] = [
    [labels.plan, payload.planTitle],
    [labels.plan, payload.planIdentity],
  ];
  if (payload.planNotes !== undefined)
    metaRows.push([messages['workout.export.notes'], payload.planNotes]);
  if (payload.documentNotes !== undefined)
    metaRows.push([messages['workout.export.notes'], payload.documentNotes]);
  const headerRow = metaRows.length + 1;
  const sheet = workbook.addWorksheet(messages['workout.export.plan'], {
    views: [
      { state: 'frozen', ySplit: headerRow, rightToLeft: locale === 'ar' },
    ],
  });
  sheet.columns = EXCEL_COLUMNS.map((column) => ({ width: column.width }));

  for (const row of metaRows) writeRow(sheet, row);

  writeRow(
    sheet,
    EXCEL_COLUMNS.map((column) => messages[column.heading]),
  );
  sheet.getRow(headerRow).font = { bold: true };

  for (const [index, day] of payload.days.entries()) {
    for (const row of dayRows(day, index, labels)) {
      writeRow(sheet, toValues(row));
    }
  }
  return workbook;
}
