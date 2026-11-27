import { describe, expect, it } from 'vitest';
import {
  calculateQualityPoints,
  formatExactDecimal,
  validateQualityWeights,
  validateMonthFormat,
} from '../../lib/workforce/quality';

describe('P7 Workforce Quality Math (Unit)', () => {
  describe('formatExactDecimal', () => {
    it('formats numbers and strings into canonical two-decimal scale strings', () => {
      expect(formatExactDecimal(1)).toBe('1.00');
      expect(formatExactDecimal(1.5)).toBe('1.50');
      expect(formatExactDecimal(-1)).toBe('-1.00');
      expect(formatExactDecimal(0)).toBe('0.00');
      expect(formatExactDecimal('2.75')).toBe('2.75');
      expect(formatExactDecimal('-0.50')).toBe('-0.50');
    });

    it('rejects values with more than two decimal places', () => {
      expect(() => formatExactDecimal('1.234')).toThrow(/two decimal places/);
      expect(() => formatExactDecimal(1.234)).toThrow(/two decimal places/);
    });
  });

  describe('validateQualityWeights', () => {
    it('accepts weights with at most two decimal places', () => {
      expect(() =>
        validateQualityWeights({
          positiveWeight: '1.00',
          negativeWeight: '-1.00',
        }),
      ).not.toThrow();
      expect(() =>
        validateQualityWeights({ positiveWeight: '2.5', negativeWeight: '0' }),
      ).not.toThrow();
    });

    it('rejects weights with more than two decimal places', () => {
      expect(() => validateQualityWeights({ positiveWeight: '1.125' })).toThrow(
        /at most two decimal places/,
      );
      expect(() =>
        validateQualityWeights({ negativeWeight: '-0.333' }),
      ).toThrow(/at most two decimal places/);
    });
  });

  describe('validateMonthFormat', () => {
    it('accepts valid YYYY-MM Cairo months', () => {
      expect(validateMonthFormat('2026-11')).toBe(true);
      expect(validateMonthFormat('2026-01')).toBe(true);
      expect(validateMonthFormat('2026-12')).toBe(true);
    });

    it('rejects invalid month formats', () => {
      expect(validateMonthFormat('2026-13')).toBe(false);
      expect(validateMonthFormat('2026-00')).toBe(false);
      expect(validateMonthFormat('2026/11')).toBe(false);
      expect(validateMonthFormat('2026-1')).toBe(false);
      expect(validateMonthFormat('invalid')).toBe(false);
    });
  });

  describe('calculateQualityPoints', () => {
    it('calculates transformation points with default +1.00 weight', () => {
      const result = calculateQualityPoints({
        category: 'transformation',
        positiveCount: 4,
      });
      expect(result.positiveCount).toBe(4);
      expect(result.negativeCount).toBe(0);
      expect(result.positiveWeight).toBe('1.00');
      expect(result.negativeWeight).toBe('0.00');
      expect(result.netPoints).toBe('4.00');
    });

    it('calculates transformation points with custom weight (e.g. 2.50)', () => {
      const result = calculateQualityPoints({
        category: 'transformation',
        positiveCount: 3,
        positiveWeight: '2.50',
      });
      expect(result.netPoints).toBe('7.50');
    });

    it('calculates feedback points with default +1.00/-1.00 weights', () => {
      const result = calculateQualityPoints({
        category: 'feedback',
        positiveCount: 8,
        negativeCount: 3,
      });
      expect(result.positiveCount).toBe(8);
      expect(result.negativeCount).toBe(3);
      expect(result.positiveWeight).toBe('1.00');
      expect(result.negativeWeight).toBe('-1.00');
      // 8 * 1.00 + 3 * (-1.00) = 5.00
      expect(result.netPoints).toBe('5.00');
    });

    it('supports negative net points when negative feedback exceeds positive feedback', () => {
      const result = calculateQualityPoints({
        category: 'feedback',
        positiveCount: 2,
        negativeCount: 5,
      });
      // 2 * 1.00 + 5 * (-1.00) = -3.00
      expect(result.netPoints).toBe('-3.00');
    });

    it('calculates feedback points with custom per-Trainer weights (e.g. +1.50 / -0.50)', () => {
      const result = calculateQualityPoints({
        category: 'feedback',
        positiveCount: 4,
        negativeCount: 2,
        positiveWeight: '1.50',
        negativeWeight: '-0.50',
      });
      // 4 * 1.50 + 2 * (-0.50) = 6.00 - 1.00 = 5.00
      expect(result.netPoints).toBe('5.00');
    });

    it('supports zeroing a Trainer quality entry (0 counts -> 0.00 net points)', () => {
      const result = calculateQualityPoints({
        category: 'transformation',
        positiveCount: 0,
      });
      expect(result.netPoints).toBe('0.00');

      const feedbackZero = calculateQualityPoints({
        category: 'feedback',
        positiveCount: 0,
        negativeCount: 0,
      });
      expect(feedbackZero.netPoints).toBe('0.00');
    });

    it('rejects negative counts', () => {
      expect(() =>
        calculateQualityPoints({
          category: 'transformation',
          positiveCount: -1,
        }),
      ).toThrow(/non-negative/);

      expect(() =>
        calculateQualityPoints({
          category: 'feedback',
          positiveCount: 2,
          negativeCount: -3,
        }),
      ).toThrow(/non-negative/);
    });

    it('rejects negative count for transformation', () => {
      expect(() =>
        calculateQualityPoints({
          category: 'transformation',
          positiveCount: 3,
          negativeCount: 1,
        }),
      ).toThrow(/transformation does not support negative count/);
    });

    it('334-B9: uses exact BigInt arithmetic when large terms cancel', () => {
      const result = calculateQualityPoints({
        category: 'feedback',
        positiveCount: 1_000_000_001,
        negativeCount: 1_000_000_000,
        positiveWeight: '99999999.99',
        negativeWeight: '-99999999.99',
      });
      expect(result.netPoints).toBe('99999999.99');
    });

    it('334-B9: accepts numeric(10,2) boundaries and canonicalizes zero', () => {
      expect(
        calculateQualityPoints({
          category: 'feedback',
          positiveCount: 1,
          positiveWeight: '99999999.99',
          negativeWeight: '0',
        }).netPoints,
      ).toBe('99999999.99');
      expect(
        calculateQualityPoints({
          category: 'feedback',
          positiveCount: 0,
          negativeCount: 1,
          positiveWeight: '0',
          negativeWeight: '-99999999.99',
        }).netPoints,
      ).toBe('-99999999.99');
      expect(
        calculateQualityPoints({
          category: 'feedback',
          positiveCount: 1,
          negativeCount: 1,
          positiveWeight: '-0.00',
          negativeWeight: '-0.00',
        }).netPoints,
      ).toBe('0.00');
    });

    it('334-B9: rejects out-of-range weights, counts, and final net points', () => {
      for (const weight of ['100000000.00', '-100000000.00']) {
        expect(() =>
          calculateQualityPoints({
            category: 'feedback',
            positiveCount: 1,
            positiveWeight: weight,
          }),
        ).toThrow(/range/);
      }
      expect(() =>
        calculateQualityPoints({
          category: 'feedback',
          positiveCount: 2,
          positiveWeight: '99999999.99',
        }),
      ).toThrow(/range/);
      expect(() =>
        calculateQualityPoints({
          category: 'transformation',
          positiveCount: 2_147_483_648,
          positiveWeight: '0',
        }),
      ).toThrow(/non-negative integer/);
      expect(() =>
        calculateQualityPoints({
          category: 'transformation',
          positiveCount: Number.MAX_SAFE_INTEGER + 1,
          positiveWeight: '0',
        }),
      ).toThrow(/non-negative integer/);
    });

    it('334-B9/B11: rejects malformed and non-finite weight strings', () => {
      for (const weight of [
        'abc',
        'Infinity',
        '-Infinity',
        'NaN',
        '0x10',
        '1e3',
        '',
        '1,000',
        '+',
        '1.234',
      ]) {
        expect(() =>
          calculateQualityPoints({
            category: 'feedback',
            positiveCount: 1,
            positiveWeight: weight,
          }),
        ).toThrow();
      }
    });
  });
});
