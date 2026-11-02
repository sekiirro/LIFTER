import { describe, expect, it } from 'vitest';
import { formatMinorUnits, formatCommission } from '../../lib/packages/money';
describe('exact money', () => {
  // ISO currency codes below exercise runtime metadata only; no catalog currency is approved.
  it.each(['en', 'ar'] as const)(
    'keeps exact digits and code in %s',
    (locale) => {
      const value = formatMinorUnits('9223372036854775807', 'USD', locale);
      expect(value).toContain('USD');
      const digits = value
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660))
        .replace(/[^0-9]/g, '');
      expect(digits).toBe('9223372036854775807');
    },
  );
  it('uses zero and three decimal metadata', () => {
    expect(formatMinorUnits('1234', 'JPY', 'en')).toContain('1,234');
    expect(formatMinorUnits('12345', 'JPY', 'ar')).toContain('١٢٬٣٤٥');
    expect(formatMinorUnits('1234', 'KWD', 'en')).toContain('1.234');
    expect(formatMinorUnits('9007199254740993', 'USD', 'en')).toContain(
      '90,071,992,547,409.93',
    );
  });
  it('does not guess exponent for unknown codes', () =>
    expect(formatMinorUnits('12345', 'ZZZ', 'en')).toBe(
      '12,345 minor units ZZZ',
    ));
  it.each(['0', '-1', '1.1', '9223372036854775808', 'x'])(
    'rejects price %s',
    (price) => expect(() => formatMinorUnits(price, 'XTS', 'en')).toThrow(),
  );
  it('rejects invalid currency and exact commission', () => {
    expect(() => formatMinorUnits('1', 'xts', 'en')).toThrow();
    expect(formatCommission(1, 'en')).toBe('0.01%');
    expect(formatCommission(10000, 'en')).toBe('100.00%');
    expect(() => formatCommission(1.1, 'en')).toThrow();
  });
});
