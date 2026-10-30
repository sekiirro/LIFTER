import { describe, expect, it } from 'vitest';
import {
  calculateCommissionMinor,
  formatMinorUnits,
  parseMinorUnits,
} from '../../lib/registration-approval/money';

describe('registration approval exact money', () => {
  it('calculates 0% and 100% without changing the amount', () => {
    expect(calculateCommissionMinor('1', 0)).toBe('0');
    expect(calculateCommissionMinor('9223372036854775807', 10000)).toBe(
      '9223372036854775807',
    );
  });

  it('rounds half-minor ties up using integer arithmetic', () => {
    expect(calculateCommissionMinor('1', 5000)).toBe('1');
    expect(calculateCommissionMinor('3', 5000)).toBe('2');
    expect(calculateCommissionMinor('5', 5000)).toBe('3');
    expect(calculateCommissionMinor('1', 4999)).toBe('0');
  });

  it('supports bigint extremes and rejects values outside signed bigint bounds', () => {
    expect(parseMinorUnits('9223372036854775807')).toBe('9223372036854775807');
    expect(calculateCommissionMinor('9223372036854775807', 1)).toBe(
      '922337203685478',
    );
    for (const value of [
      '9223372036854775808',
      '0',
      '-1',
      '+1',
      '1.0',
      '1e3',
      ' 1',
      '',
      1,
      1n,
    ])
      expect(parseMinorUnits(value)).toBeNull();
    expect(() =>
      calculateCommissionMinor('9223372036854775808', 10000),
    ).toThrow(RangeError);
  });

  it('rejects invalid commission rates and numeric money rather than coercing', () => {
    for (const rate of [-1, 10001, 1.5, NaN, Infinity])
      expect(() => calculateCommissionMinor('100', rate)).toThrow(RangeError);
    expect(() => calculateCommissionMinor(100 as never, 5000)).toThrow(
      RangeError,
    );
  });

  it('transforms display strings exactly without converting money to number', () => {
    expect(formatMinorUnits('9223372036854775807')).toBe(
      '9,223,372,036,854,775,807',
    );
    expect(formatMinorUnits('10000000000000001')).toBe(
      '10,000,000,000,000,001',
    );
    expect(() => formatMinorUnits('9007199254740993.00')).toThrow(RangeError);
  });
});
