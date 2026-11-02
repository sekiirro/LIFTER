'use client';

import { parseWorkoutDocumentForRender } from '../workout/schema-registry';
import type {
  WorkoutDocument,
  WorkoutExerciseReference,
  WorkoutLoad,
  WorkoutReps,
} from '../workout/schema';
import { toCoachTextCell } from '../workout/export-guard';
import {
  createWorkbookSkeleton,
  type WorkbookRowInput,
} from './workbook-skeleton';
import type { Workbook } from 'exceljs';

export type PublishedWorkoutVersionApiResponse = Readonly<{
  status: 'published';
  planId: string;
  version: number;
  sourceRevision: number;
  schemaVersion: number;
  document: WorkoutDocument;
}>;

export class WorkoutExcelExportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorkoutExcelExportError';
    this.code = code;
  }
}

type ExcelLocale = 'ar' | 'en';
type WorkbookColumn = { key: string; header: string };

const HEADERS: Record<ExcelLocale, readonly WorkbookColumn[]> = {
  en: [
    { key: 'day', header: 'Day' },
    { key: 'exercise', header: 'Exercise' },
    { key: 'set', header: 'Set' },
    { key: 'type', header: 'Type' },
    { key: 'reps', header: 'Reps' },
    { key: 'load', header: 'Load' },
    { key: 'rest', header: 'Rest (sec)' },
    { key: 'rir', header: 'RIR' },
    { key: 'alternatives', header: 'Alternatives' },
    { key: 'notes', header: 'Notes' },
  ],
  ar: [
    { key: 'day', header: 'اليوم' },
    { key: 'exercise', header: 'التمرين' },
    { key: 'set', header: 'المجموعة' },
    { key: 'type', header: 'النوع' },
    { key: 'reps', header: 'التكرارات' },
    { key: 'load', header: 'الحمل' },
    { key: 'rest', header: 'الراحة (ثانية)' },
    { key: 'rir', header: 'RIR' },
    { key: 'alternatives', header: 'البدائل' },
    { key: 'notes', header: 'ملاحظات' },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requirePublishedResponse(
  input: unknown,
): PublishedWorkoutVersionApiResponse & { document: WorkoutDocument } {
  if (!isRecord(input) || input.status !== 'published') {
    throw new WorkoutExcelExportError(
      'published_version_required',
      'published workout version required',
    );
  }
  if (
    typeof input.planId !== 'string' ||
    !input.planId.trim() ||
    typeof input.version !== 'number' ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    typeof input.sourceRevision !== 'number' ||
    !Number.isSafeInteger(input.sourceRevision) ||
    input.sourceRevision < 1 ||
    typeof input.schemaVersion !== 'number'
  ) {
    throw new WorkoutExcelExportError(
      'invalid_published_version',
      'invalid published workout version',
    );
  }
  return {
    status: 'published',
    planId: input.planId,
    version: input.version,
    sourceRevision: input.sourceRevision,
    schemaVersion: input.schemaVersion,
    document: parseWorkoutDocumentForRender(
      input.schemaVersion,
      input.document,
    ),
  };
}

function formatReference(reference: WorkoutExerciseReference): string {
  const base = `${reference.source}:${reference.id} v${reference.version}`;
  return reference.variation
    ? `${base}; variation ${reference.variation.id} v${reference.variation.version}`
    : base;
}

function dayLabel(
  day: WorkoutDocument['days'][number],
  index: number,
  locale: ExcelLocale,
) {
  return (
    day.title ?? (locale === 'ar' ? `اليوم ${index + 1}` : `Day ${index + 1}`)
  );
}

function formatReps(reps: WorkoutReps): string {
  return 'value' in reps ? String(reps.value) : `${reps.min}–${reps.max}`;
}

function formatLoad(load: WorkoutLoad, locale: ExcelLocale): string {
  if (load.mode === 'bodyweight')
    return locale === 'ar' ? 'وزن الجسم' : 'Bodyweight';
  return `${load.value} ${load.unit}`;
}

function notesFor(
  dayNotes?: string,
  itemNotes?: string,
  setNotes?: string,
): string {
  return [dayNotes, itemNotes, setNotes]
    .filter(
      (note): note is string => typeof note === 'string' && note.length > 0,
    )
    .join('\n');
}

function workbookRows(
  document: WorkoutDocument,
  locale: ExcelLocale,
): WorkbookRowInput[] {
  const rows: WorkbookRowInput[] = [];
  const emptyRow = (
    day: string,
    exercise = '',
    notes = '',
  ): WorkbookRowInput => ({
    day,
    exercise,
    set: '',
    type: '',
    reps: '',
    load: '',
    rest: '',
    rir: '',
    alternatives: '',
    notes,
  });

  if (document.notes) {
    rows.push(
      emptyRow(
        locale === 'ar' ? 'ملاحظات البرنامج' : 'Plan notes',
        '',
        document.notes,
      ),
    );
  }

  document.days.forEach((day, dayIndex) => {
    const label = dayLabel(day, dayIndex, locale);
    if (day.kind === 'rest') {
      rows.push(
        emptyRow(label, locale === 'ar' ? 'راحة' : 'Rest', notesFor(day.notes)),
      );
      return;
    }
    if (!day.items?.length) {
      rows.push(emptyRow(label, '', notesFor(day.notes)));
      return;
    }
    for (const item of day.items) {
      const exercise = formatReference(item.exercise);
      const alternatives = (item.alternatives ?? [])
        .map(formatReference)
        .join('; ');
      if (!item.sets.length) {
        rows.push({
          ...emptyRow(label, exercise, notesFor(day.notes, item.notes)),
          alternatives,
        });
        continue;
      }
      item.sets.forEach((set, setIndex) => {
        rows.push({
          day: label,
          exercise,
          set: String(setIndex + 1),
          type:
            locale === 'ar'
              ? set.type === 'warmup'
                ? 'إحماء'
                : 'أساسية'
              : set.type === 'warmup'
                ? 'Warm-up'
                : 'Working',
          reps: formatReps(set.reps),
          load: formatLoad(set.load, locale),
          rest: set.restSec === undefined ? '' : String(set.restSec),
          rir: set.rir === undefined ? '' : String(set.rir),
          alternatives,
          notes: notesFor(day.notes, item.notes, set.notes),
        });
      });
    }
  });
  return rows;
}

/** Client-only export action. ExcelJS is loaded only when an export is requested. */
export async function buildWorkoutWorkbook(
  input: PublishedWorkoutVersionApiResponse,
  locale: ExcelLocale,
): Promise<Workbook> {
  const response = requirePublishedResponse(input);
  if (locale !== 'ar' && locale !== 'en') {
    throw new WorkoutExcelExportError(
      'invalid_locale',
      'unsupported export locale',
    );
  }
  const sheetName = locale === 'ar' ? 'التمرين' : 'Workout';
  const skeleton = createWorkbookSkeleton(locale, [
    {
      name: sheetName,
      columns: HEADERS[locale],
      rows: workbookRows(response.document, locale),
    },
  ]);

  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Lifter';
  workbook.subject = `Workout plan ${response.planId} version ${response.version}`;

  for (const sheet of skeleton.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ rightToLeft: sheet.rightToLeft }],
    });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: Math.max(14, Math.min(column.header.length + 4, 36)),
      style: { numFmt: '@' },
    }));
    worksheet.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      const excelRow = worksheet.addRow([]);
      sheet.columns.forEach((column, index) => {
        const cell = toCoachTextCell(row.cells[column.key]!.value);
        const excelCell = excelRow.getCell(index + 1);
        excelCell.value = cell.value;
        excelCell.numFmt = '@';
      });
    }
  }
  return workbook;
}

export async function exportWorkoutWorkbook(
  input: PublishedWorkoutVersionApiResponse,
  locale: ExcelLocale,
): Promise<Uint8Array> {
  const workbook = await buildWorkoutWorkbook(input, locale);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
