import { describe, expect, it } from 'vitest';
import {
  isFormulaInjection,
  toCoachTextCell,
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

  it('writes coach-authored cells as string cells with the text unchanged', () => {
    expect(toCoachTextCell('=SUM(A1:A5)')).toEqual({
      type: 'string',
      value: '=SUM(A1:A5)',
    });
    expect(toCoachTextCell('+1')).toEqual({ type: 'string', value: '+1' });
    expect(toCoachTextCell('-1')).toEqual({ type: 'string', value: '-1' });
    expect(toCoachTextCell('@x')).toEqual({ type: 'string', value: '@x' });
    expect(toCoachTextCell('\t=1')).toEqual({ type: 'string', value: '\t=1' });
  });

  it('writes ordinary coach-authored strings to string cells unchanged', () => {
    expect(toCoachTextCell('Bench press 3x10')).toEqual({
      type: 'string',
      value: 'Bench press 3x10',
    });
    expect(toCoachTextCell('')).toEqual({ type: 'string', value: '' });
  });

  it('keeps Arabic and mixed-direction text unchanged', () => {
    const arabic = 'Ø§ÙØ³ÙØ§Ø³Ø©';
    expect(toCoachTextCell(arabic)).toEqual({ type: 'string', value: arabic });
    const mixed = 'Ø®Ø± Ø§ÙØ£ÙØ© @ Ø§ÙØ©ÙÙØ§ØªÙØ©';
    expect(toCoachTextCell(mixed)).toEqual({ type: 'string', value: mixed });
  });
});
