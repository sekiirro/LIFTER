import { expect, it } from 'vitest';
import { projectUsage } from '../../scripts/free-tier/lib/projection.mjs';

const usage = {
  tables: [
    { table: 'public.jobs', total_bytes: 100, reltuples: 10 },
    { table: 'public.workspaces', total_bytes: 20, reltuples: -1 },
  ],
};
it('uses measured bytes per row, clamping unknown estimates to one', () => {
  const result = projectUsage(
    usage,
    { 'public.jobs': 5, 'public.workspaces': 2 },
    0.0001,
  );
  expect(result).toMatchObject({
    total_bytes: 90,
    pct: 90,
    verdict: 'warn',
    complete: true,
    missing: [],
  });
  expect(result.tables.map((row) => row.bytes_per_row)).toEqual([10, 20]);
});
it('reports absent and null volumes as MISSING while accepting explicit zero', () => {
  const result = projectUsage(usage, { 'public.jobs': 0 });
  expect(result.missing).toEqual(['public.workspaces']);
  expect(result.complete).toBe(false);
  expect(result.tables[1]).toMatchObject({
    status: 'MISSING',
    projected_bytes: null,
  });
  expect(projectUsage(usage, { 'public.jobs': null }).missing).toHaveLength(2);
});
it.each([-1, 1.5, '5', Infinity])('rejects invalid volume %s', (value) => {
  expect(() => projectUsage(usage, { 'public.jobs': value })).toThrow();
});
