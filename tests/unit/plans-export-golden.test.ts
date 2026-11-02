import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildWorkoutWorkbook } from '../../lib/plans/export/excel';
import { WorkoutPrintDocument } from '../../components/plans/export/WorkoutPrintDocument';
import { normalizeWorkoutPrintDom } from '../../lib/plans/export/workout-print-dom';
import type { PublishedWorkoutVersionApiResponse } from '../../lib/plans/export/excel';

function fixture(locale: 'ar' | 'en'): PublishedWorkoutVersionApiResponse {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        `tests/fixtures/workout/published-version-${locale}.json`,
      ),
      'utf8',
    ),
  ) as PublishedWorkoutVersionApiResponse;
}

async function workbookGolden(locale: 'ar' | 'en') {
  const workbook = await buildWorkoutWorkbook(fixture(locale), locale);
  return workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    rightToLeft: sheet.views[0]?.rightToLeft ?? false,
    cells: sheet
      .getSheetValues()
      .slice(1)
      .map((row) =>
        (row as ExcelJS.CellValue[]).slice(1).map((cell) => {
          expect(typeof cell).toBe('string');
          return cell;
        }),
      ),
  }));
}

describe('F17 AR/EN export goldens', () => {
  it.each(['ar', 'en'] as const)(
    'keeps workbook version N exact in %s',
    async (locale) => {
      await expect(workbookGolden(locale)).resolves.toMatchSnapshot();
    },
  );

  it.each(['ar', 'en'] as const)(
    'keeps print DOM version N exact in %s',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(WorkoutPrintDocument, {
          version: fixture(locale),
          locale,
        }),
      );
      expect(normalizeWorkoutPrintDom(html)).toMatchSnapshot();
    },
  );
});
