// F17 export workbook skeleton (T010).
// Plain data model only: the ExcelJS binding lands in T033.

import { toCoachTextCell } from '../workout/export-guard';
import {
  resolvePrintLayout,
  type PrintLayout,
  type PrintLocale,
} from './print-layout';

export type WorkbookCell = ReturnType<typeof toCoachTextCell>;

export type WorkbookColumn = Readonly<{
  key: string;
  header: string;
}>;

export type WorkbookRow = Readonly<{
  cells: Readonly<Record<string, WorkbookCell>>;
}>;

export type WorkbookSheet = Readonly<{
  name: string;
  rightToLeft: boolean;
  columns: readonly WorkbookColumn[];
  rows: readonly WorkbookRow[];
}>;

export type WorkbookColumnInput = {
  key: string;
  header: string;
};

export type WorkbookRowInput = Readonly<Record<string, string>>;

export type WorkbookSheetInput = {
  name: string;
  columns: readonly WorkbookColumnInput[];
  rows: readonly WorkbookRowInput[];
};

export type WorkbookSkeleton = Readonly<{
  locale: PrintLocale;
  rightToLeft: boolean;
  sheets: readonly WorkbookSheet[];
}>;

export class WorkbookSkeletonError extends Error {
  readonly code = 'invalid_workbook_skeleton';

  constructor(message: string) {
    super(message);
    this.name = 'WorkbookSkeletonError';
  }
}

const MAX_SHEET_NAME_LENGTH = 31;
const INVALID_SHEET_NAME_CHARACTERS = /[:\\/?*[\]]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSheetName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkbookSkeletonError('Sheet name must be a non-empty string');
  }
  if (value.length > MAX_SHEET_NAME_LENGTH) {
    throw new WorkbookSkeletonError(
      `Sheet name must be at most ${MAX_SHEET_NAME_LENGTH} characters`,
    );
  }
  if (value.startsWith("'") || value.endsWith("'")) {
    throw new WorkbookSkeletonError(
      'Sheet name must not start or end with an apostrophe',
    );
  }
  if (INVALID_SHEET_NAME_CHARACTERS.test(value)) {
    throw new WorkbookSkeletonError(
      'Sheet name must not contain any of: : \\ / ? * [ ]',
    );
  }
  return value;
}

function requireColumns(input: unknown): WorkbookColumn[] {
  if (!Array.isArray(input)) {
    throw new WorkbookSkeletonError('Sheet columns must be an array');
  }

  const keys = new Set<string>();
  return input.map((column, index) => {
    if (!isRecord(column)) {
      throw new WorkbookSkeletonError(`columns[${index}] must be an object`);
    }
    const key = column.key;
    const header = column.header;
    if (typeof key !== 'string' || !key.trim()) {
      throw new WorkbookSkeletonError(
        `columns[${index}].key must be a non-empty string`,
      );
    }
    if (typeof header !== 'string' || !header.trim()) {
      throw new WorkbookSkeletonError(
        `columns[${index}].header must be a non-empty string`,
      );
    }
    if (keys.has(key)) {
      throw new WorkbookSkeletonError(
        `columns[${index}].key must be unique: ${key}`,
      );
    }
    keys.add(key);
    return { key, header };
  });
}

function requireRows(
  input: unknown,
  columns: readonly WorkbookColumn[],
): WorkbookRow[] {
  if (!Array.isArray(input)) {
    throw new WorkbookSkeletonError('Sheet rows must be an array');
  }

  const columnKeys = new Set(columns.map((column) => column.key));
  return input.map((row, rowIndex) => {
    if (!isRecord(row)) {
      throw new WorkbookSkeletonError(`rows[${rowIndex}] must be an object`);
    }
    for (const key of Object.keys(row)) {
      if (!columnKeys.has(key)) {
        throw new WorkbookSkeletonError(
          `rows[${rowIndex}] has unknown column key: ${key}`,
        );
      }
    }

    const cells: Record<string, WorkbookCell> = {};
    for (const column of columns) {
      const value = row[column.key];
      if (value === undefined) {
        cells[column.key] = toCoachTextCell('');
        continue;
      }
      if (typeof value !== 'string') {
        throw new WorkbookSkeletonError(
          `rows[${rowIndex}].${column.key} must be a string`,
        );
      }
      cells[column.key] = toCoachTextCell(value);
    }
    return { cells };
  });
}

function buildSheet(
  layout: PrintLayout,
  input: WorkbookSheetInput,
): WorkbookSheet {
  if (!isRecord(input)) {
    throw new WorkbookSkeletonError('Workbook sheet must be an object');
  }
  const name = requireSheetName(input.name);
  const columns = requireColumns(input.columns);
  const rows = requireRows(input.rows, columns);

  return {
    name,
    rightToLeft: layout.dir === 'rtl',
    columns,
    rows,
  };
}

export function createWorkbookSheet(
  locale: string,
  input: WorkbookSheetInput,
): WorkbookSheet {
  return buildSheet(resolvePrintLayout(locale), input);
}

export function createWorkbookSkeleton(
  locale: string,
  inputs: readonly WorkbookSheetInput[],
): WorkbookSkeleton {
  const layout = resolvePrintLayout(locale);
  if (!Array.isArray(inputs)) {
    throw new WorkbookSkeletonError('Workbook sheets must be an array');
  }

  const seenNames = new Set<string>();
  const sheets = inputs.map((input) => {
    const sheet = buildSheet(layout, input);
    const normalizedName = sheet.name.toLowerCase();
    if (seenNames.has(normalizedName)) {
      throw new WorkbookSkeletonError(
        `Workbook sheet names must be unique: ${sheet.name}`,
      );
    }
    seenNames.add(normalizedName);
    return sheet;
  });

  return {
    locale: layout.lang,
    rightToLeft: layout.dir === 'rtl',
    sheets,
  };
}
