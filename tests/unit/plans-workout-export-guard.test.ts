import { describe, expect, it } from 'vitest';
import {
  isFormulaInjection,
  toSafeExportCellValue,
} from '../../lib/plans/workout/export-guard';

describe('F17 export formula-injection guard', () => {
  it('flags values with a leading formula character as injections', () => {
    expect(isFormulaInjection('=SUM(A1:A5)')).toBe(true);
    expect(isFormulaInjection('+SUM(A1:A5)')).toBe(true);
    expect(isFormulaInjection("-2+cmd|'/C calc'!A0")).toBe(true);
    expect(isFormulaInjection('@SUM(A1:A5)')).toBe(true);
  });

  it('flags formula characters hidden after a leading tab or carriage return', () => {
    expect(isFormulaInjection('\t=SUM(A1:A5)')).toBe(true);
    expect(isFormulaInjection('\r\n@SUM(A1:A5)')).toBe(true);
  });

  it('does not flag ordinary, numeric or Arabic text', () => {
    expect(isFormulaInjection('Bench press 3x10')).toBe(false);
    expect(isFormulaInjection('12 reps')).toBe(false);
    expect(isFormulaInjection('')).toBe(false);
    expect(isFormulaInjection('Ø§ÙØ³ÙØ§Ø³Ø© Ø¹ÙÙ Ø§ÙØ¨Ø¯ÙØ©')).toBe(false);
    expect(isFormulaInjection('Ø®Ø± Ø§ÙØ£ÙØ© @ Ø§ÙØ©ÙÙØ§ØªÙØ©')).toBe(false);
  });

  it('writes coach-authored formula strings as strings, never as formulas', () => {
    expect(toSafeExportCellValue('=SUM(A1:A5)')).toBe("'=SUM(A1:A5)");
    expect(toSafeExportCellValue('+SUM(A1:A5)')).toBe("'+SUM(A1:A5)");
    expect(toSafeExportCellValue("-2+cmd|'/C calc'!A0")).toBe(
      "'-2+cmd|'/C calc'!A0",
    );
    expect(toSafeExportCellValue('@SUM(A1:A5)')).toBe("'@SUM(A1:A5)");
  });

  it('neutralizes formula characters hidden after a leading tab or carriage return', () => {
    expect(toSafeExportCellValue('\t=SUM(A1:A5)')).toBe("'\t=SUM(A1:A5)");
    expect(toSafeExportCellValue('\r\n@SUM(A1:A5)')).toBe("'\r\n@SUM(A1:A5)");
  });

  it('leaves ordinary coach-authored strings unchanged', () => {
    expect(toSafeExportCellValue('Bench press 3x10')).toBe('Bench press 3x10');
    expect(toSafeExportCellValue('')).toBe('');
  });

  it('keeps legitimate numbers as numbers', () => {
    expect(toSafeExportCellValue(5)).toBe(5);
    expect(toSafeExportCellValue(2.5)).toBe(2.5);
  });

  it('keeps Arabic and mixed-direction text unchanged', () => {
    const arabic = 'Ø§ÙØ³ÙØ§Ø³Ø©';
    expect(toSafeExportCellValue(arabic)).toBe(arabic);
    const mixed = 'Ø®Ø± Ø§ÙØ£ÙØ© @ Ø§ÙØ©ÙÙØ§ØªÙØ©';
    expect(toSafeExportCellValue(mixed)).toBe(mixed);
  });
});
