import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildWorkoutWorkbook } from '../../lib/plans/export/excel';
import type { PublishedWorkoutVersionApiResponse } from '../../lib/plans/export/excel';

const english = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'tests/fixtures/workout/published-version-en.json'),
    'utf8',
  ),
) as PublishedWorkoutVersionApiResponse;
const arabic = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'tests/fixtures/workout/published-version-ar.json'),
    'utf8',
  ),
) as PublishedWorkoutVersionApiResponse;

async function readBack(
  input: PublishedWorkoutVersionApiResponse,
  locale: 'ar' | 'en',
) {
  const built = await buildWorkoutWorkbook(input, locale);
  const buffer = await built.xlsx.writeBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe('F17 ExcelJS published workout export', () => {
  it('builds an English workbook with the expected sheet, headers, and string cells', async () => {
    const workbook = await readBack(english, 'en');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Workout']);
    const sheet = workbook.getWorksheet('Workout');
    expect(sheet).toBeDefined();
    expect(sheet!.views[0]?.rightToLeft).toBe(false);
    expect(sheet!.getRow(1).values).toEqual([
      ,
      'Day',
      'Exercise',
      'Set',
      'Type',
      'Reps',
      'Load',
      'Rest (sec)',
      'RIR',
      'Alternatives',
      'Notes',
    ]);
    expect(sheet!.getCell('I2').value).toBe('');
    expect(sheet!.getCell('I2').type).toBe(ExcelJS.ValueType.String);

    for (let row = 2; row <= sheet!.rowCount; row += 1) {
      for (let column = 1; column <= 10; column += 1) {
        const cell = sheet!.getRow(row).getCell(column);
        expect(cell.type, `row ${row}, column ${column}`).toBe(
          ExcelJS.ValueType.String,
        );
        expect(typeof cell.value).toBe('string');
        expect(cell.formula).toBeUndefined();
      }
    }

    expect(['=SUM(A1:A2)', '+1', '-1', '@coach']).toEqual(
      [3, 4, 5, 6].map((row) => sheet!.getCell(`J${row}`).value),
    );
  });

  it('builds an Arabic workbook right-to-left with localized headers and string cells', async () => {
    const workbook = await readBack(arabic, 'ar');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['التمرين']);
    const sheet = workbook.getWorksheet('التمرين');
    expect(sheet).toBeDefined();
    expect(sheet!.views[0]?.rightToLeft).toBe(true);
    expect(sheet!.getRow(1).values).toEqual([
      ,
      'اليوم',
      'التمرين',
      'المجموعة',
      'النوع',
      'التكرارات',
      'الحمل',
      'الراحة (ثانية)',
      'RIR',
      'البدائل',
      'ملاحظات',
    ]);
    for (let row = 2; row <= sheet!.rowCount; row += 1) {
      for (let column = 1; column <= 10; column += 1) {
        const cell = sheet!.getRow(row).getCell(column);
        expect(cell.type, `row ${row}, column ${column}`).toBe(
          ExcelJS.ValueType.String,
        );
        expect(typeof cell.value).toBe('string');
        expect(cell.formula).toBeUndefined();
      }
    }
    expect(sheet!.getCell('A3').value).toBe('يوم الدفع');
    expect(sheet!.getCell('J3').value).toBe('تكرارات منظمة');
  });

  it('rejects a draft response before loading ExcelJS', async () => {
    const draft = { ...english, status: 'draft' };
    await expect(
      buildWorkoutWorkbook(
        draft as unknown as PublishedWorkoutVersionApiResponse,
        'en',
      ),
    ).rejects.toThrow('published workout version required');
  });
});
