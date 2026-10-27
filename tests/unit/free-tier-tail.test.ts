import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { main, parseTail } from '../../scripts/free-tier/parse-tail.mjs';

const fixture = 'scripts/free-tier/fixtures/tail-sample.jsonl';
it('aggregates the fixture and keeps absent timings distinct from zero', () => {
  const result = parseTail(readFileSync(fixture, 'utf8'));
  expect(result.invalid_lines).toBe(1);
  expect(result.routes[0]).toMatchObject({
    route: 'GET /api/jobs/:id',
    count: 2,
    cpu_p50_ms: 7,
    cpu_p95_ms: 11,
    cpu_max_ms: 11,
    wall_p50_ms: 20,
    wall_p95_ms: 30,
    verdict: 'over',
    outcomes: { ok: 1, exceededCpu: 1 },
  });
  expect(result.routes[1]).toMatchObject({ cpu_max_ms: null, verdict: null });
  expect(parseTail(readFileSync(fixture, 'utf8'), 15).routes[0]?.verdict).toBe(
    'warn',
  );
});
it('never prints fixture headers, queries, logs or exceptions', async () => {
  const table = vi.spyOn(console, 'table').mockImplementation(() => {});
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  let text;
  try {
    await main([fixture]);
    text = JSON.stringify([table.mock.calls, log.mock.calls]);
  } finally {
    table.mockRestore();
    log.mockRestore();
  }
  for (const secret of [
    'fixture-header-secret',
    'fixture-query-secret',
    'fixture-log-secret',
    'fixture-exception-secret',
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain('GET /api/jobs/:id');
});
