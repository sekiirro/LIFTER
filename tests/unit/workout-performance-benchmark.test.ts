import { describe, expect, it } from 'vitest';
import { assertPerformanceMeasurements } from '../../lib/workout-planner/performance-benchmark';

const passing = {
  typicalP95Ms: 40,
  maximumP95Ms: 90,
  maximumBytes: 512 * 1024,
  capBytes: 512 * 1024,
  overCapRejected: true,
};
const mutations: Array<[string, Partial<typeof passing>]> = [
  ['7-day/40-exercise p95', { typicalP95Ms: 301 }],
  ['maximum-document p95', { maximumP95Ms: 301 }],
  ['largest accepted stored bytes', { maximumBytes: 512 * 1024 - 1 }],
  ['one-byte-over-cap rejection', { overCapRejected: false }],
];

describe('F17 T050 benchmark assertions', () => {
  it.each(mutations)(
    'fails when the %s measurement violates its assertion',
    (_label, mutation) => {
      expect(() =>
        assertPerformanceMeasurements({ ...passing, ...mutation }),
      ).toThrow();
    },
  );

  it('accepts measurements that meet the 300 ms target and current cap', () => {
    expect(() => assertPerformanceMeasurements(passing)).not.toThrow();
  });
});
