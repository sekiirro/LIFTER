import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { main, parseTail } from '../../scripts/free-tier/parse-tail.mjs';

const fixture = 'scripts/free-tier/fixtures/tail-sample.jsonl';
it('aggregates the fixture and keeps absent timings distinct from zero', () => {
  const result = parseTail(readFileSync(fixture, 'utf8'));
  expect(result.invalid_lines).toBe(2);
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
it('collects pretty-printed events despite braces and escapes inside strings', () => {
  const result = parseTail(readFileSync(fixture, 'utf8'));
  expect(result.invalid_lines).toBe(2);
  expect(
    result.routes.find((row) => row.route === 'GET /api/pretty/:id'),
  ).toMatchObject({
    count: 1,
    cpu_p50_ms: 4,
    cpu_p95_ms: 4,
    cpu_max_ms: 4,
    wall_p50_ms: 12,
    outcomes: { ok: 1 },
  });
});

it.each(['\n', '\r\n'])(
  'recovers the event after a truncated record with %j newlines',
  (newline) => {
    const text = readFileSync(fixture, 'utf8').replace(/\r?\n/g, newline);
    const result = parseTail(text);
    expect(result.invalid_lines).toBe(2);
    expect(
      result.routes.find((row) => row.route === 'GET /api/recovered/:id'),
    ).toMatchObject({
      count: 1,
      cpu_p50_ms: 6,
      cpu_p95_ms: 6,
      cpu_max_ms: 6,
      wall_p50_ms: 18,
      outcomes: { ok: 1 },
    });
  },
);

it.each(['\n', '\r\n'])(
  'recovers pretty and compact events after a record truncated inside a string with %j newlines',
  (newline) => {
    const prettyEvent = {
      event: { request: { method: 'GET', url: 'https://x/api/pretty' } },
    };
    const compactEvent = {
      event: { request: { method: 'GET', url: 'https://x/api/compact' } },
    };
    const text =
      `{"event":{"request":{"method":"GET","url":"https://x/api/a${newline}` +
      `${JSON.stringify(prettyEvent, null, 2)}${newline}${JSON.stringify(compactEvent)}`;
    const result = parseTail(text);

    expect(result.invalid_lines).toBe(1);
    expect(result.routes.reduce((count, row) => count + row.count, 0)).toBe(2);
    expect(result.routes.map((row) => row.route)).toEqual([
      'GET /api/pretty',
      'GET /api/compact',
    ]);
  },
);

it('recovers after a record is truncated with an escaped backslash inside a string', () => {
  const event = {
    event: {
      request: { method: 'GET', url: 'https://x/api/recovered-escaped' },
    },
  };
  const truncated =
    '{"event":{"request":{"method":"GET","url":"https://x/api/a\\';
  const result = parseTail(`${truncated}\n${JSON.stringify(event)}`);

  expect(result.invalid_lines).toBe(1);
  expect(result.routes).toMatchObject([
    { route: 'GET /api/recovered-escaped', count: 1 },
  ]);
});

it('parses valid strings with escaped quotes, backslashes, braces, and newline text', () => {
  const event = {
    event: { request: { method: 'GET', url: 'https://x/api/escaped' } },
    logs: [{ message: 'quote: " slash: \\ braces: { } newline: \\n' }],
  };
  const result = parseTail(JSON.stringify(event));

  expect(result.invalid_lines).toBe(0);
  expect(result.routes).toMatchObject([
    { route: 'GET /api/escaped', count: 1 },
  ]);
});

it('handles concatenated objects and counts malformed or incomplete objects', () => {
  const event = {
    event: {
      request: { method: 'GET', url: 'https://example.invalid/stream' },
    },
    cpuTime: 2,
    logs: [{ message: ['} escaped quote " then { and backslash \\'] }],
  };
  const text =
    JSON.stringify(event) +
    '{"invalid":}' +
    JSON.stringify(event, null, 2) +
    '{}\nnot-json\n{"unfinished":';
  const result = parseTail(text);
  expect(result.invalid_lines).toBe(4);
  expect(result.routes).toHaveLength(1);
  expect(result.routes[0]).toMatchObject({
    route: 'GET /stream',
    count: 2,
    cpu_max_ms: 2,
  });
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
    'fixture-pretty-query-secret',
    'fixture-pretty-header-secret',
    'fixture-pretty-log-secret',
  ])
    expect(text).not.toContain(secret);
  expect(text).toContain('GET /api/jobs/:id');
});
