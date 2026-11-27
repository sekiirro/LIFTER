import { describe, expect, it } from 'vitest';
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
  isAllowedCurrencyForMarket,
} from '../../lib/workforce/payroll-money';

describe('Payroll Money: decimal and minor unit calculations', () => {
  it('converts valid decimal strings to minor units without float arithmetic', () => {
    expect(decimalToMinorUnits('0')).toBe(0n);
    expect(decimalToMinorUnits('0.00')).toBe(0n);
    expect(decimalToMinorUnits('1')).toBe(100n);
    expect(decimalToMinorUnits('1.0')).toBe(100n);
    expect(decimalToMinorUnits('1.00')).toBe(100n);
    expect(decimalToMinorUnits('100.5')).toBe(10050n);
    expect(decimalToMinorUnits('100.50')).toBe(10050n);
    expect(decimalToMinorUnits('123456789.99')).toBe(12345678999n);
    expect(decimalToMinorUnits('92233720368547700.00')).toBe(
      9223372036854770000n,
    );
  });

  it('handles negative amounts for corrections', () => {
    expect(decimalToMinorUnits('-50')).toBe(-5000n);
    expect(decimalToMinorUnits('-50.25')).toBe(-5025n);
    expect(decimalToMinorUnits('-0.50')).toBe(-50n);
  });

  it('rejects invalid inputs or precision beyond 2 decimal places', () => {
    expect(decimalToMinorUnits('')).toBeNull();
    expect(decimalToMinorUnits('   ')).toBeNull();
    expect(decimalToMinorUnits('abc')).toBeNull();
    expect(decimalToMinorUnits('12.345')).toBeNull();
    expect(decimalToMinorUnits('12.34.56')).toBeNull();
    expect(decimalToMinorUnits('100,50')).toBeNull();
  });

  it('converts minor units back to canonical 2-decimal string', () => {
    expect(minorUnitsToDecimal(0n)).toBe('0.00');
    expect(minorUnitsToDecimal('0')).toBe('0.00');
    expect(minorUnitsToDecimal(100n)).toBe('1.00');
    expect(minorUnitsToDecimal(10050n)).toBe('100.50');
    expect(minorUnitsToDecimal(5n)).toBe('0.05');
    expect(minorUnitsToDecimal(-5025n)).toBe('-50.25');
    expect(minorUnitsToDecimal('-50')).toBe('-0.50');
  });

  it('enforces market allowed currencies', () => {
    // Egypt allows only EGP
    expect(isAllowedCurrencyForMarket('Egypt', 'EGP')).toBe(true);
    expect(isAllowedCurrencyForMarket('Egypt', 'USD')).toBe(false);
    expect(isAllowedCurrencyForMarket('Egypt', 'SAR')).toBe(false);
    expect(isAllowedCurrencyForMarket('Egypt', 'EUR')).toBe(false);

    // International allows EGP, USD, SAR
    expect(isAllowedCurrencyForMarket('International', 'EGP')).toBe(true);
    expect(isAllowedCurrencyForMarket('International', 'USD')).toBe(true);
    expect(isAllowedCurrencyForMarket('International', 'SAR')).toBe(true);
    expect(isAllowedCurrencyForMarket('International', 'EUR')).toBe(false);
    expect(isAllowedCurrencyForMarket('International', 'GBP')).toBe(false);
  });
});
