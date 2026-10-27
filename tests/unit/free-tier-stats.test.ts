import { expect, it } from 'vitest';
import {
  pct,
  percentile,
  verdict,
} from '../../scripts/free-tier/lib/stats.mjs';
import { usageReport } from '../../scripts/free-tier/lib/usage.mjs';

it('uses nearest-rank without mutating samples, including endpoints', () => {
  const values = [40, 10, 30, 20];
  expect([0, 50, 95, 100].map((p) => percentile(values, p))).toEqual([
    10, 20, 40, 40,
  ]);
  expect(values).toEqual([40, 10, 30, 20]);
  for (const p of [-1, 101, NaN])
    expect(() => percentile(values, p)).toThrow(RangeError);
  expect(() => percentile([], 50)).toThrow(RangeError);
});

it.each([
  [69.99, 'ok'],
  [70, 'warn'],
  [100, 'warn'],
  [100.01, 'over'],
] as const)('classifies %s percent as %s', (value, result) => {
  expect(pct(value, 100)).toBe(value);
  expect(verdict(value, 100)).toBe(result);
});

it('rejects invalid metrics and formats only database measurement fields', () => {
  expect(() => pct(1, 0)).toThrow(RangeError);
  const report = usageReport(
    '350000000',
    [{ table: 'public.jobs', total_bytes: '1000', reltuples: '-1' }],
    { 'public.jobs': '2' },
  );
  expect(report).toMatchObject({
    pct: 70,
    verdict: 'warn',
    counts: { 'public.jobs': 2 },
  });
  expect(report.tables[0]).toMatchObject({
    total_bytes: 1000,
    reltuples: -1,
    exact_count: 2,
  });
});
