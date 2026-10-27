import { expect, it, vi } from 'vitest';
import {
  assertSafeBaseUrl,
  normalizeRoute,
} from '../../scripts/free-tier/lib/routes.mjs';
import { probe } from '../../scripts/free-tier/http-probe.mjs';

it('collapses full numeric and UUID segments and strips query and hash', () => {
  expect(
    normalizeRoute(
      'get',
      'https://example.invalid/jobs/123/ABCDEF12-1234-5678-9abc-123456789012?token=secret#secret',
    ),
  ).toBe('GET /jobs/:id/:id');
  expect(normalizeRoute('POST', '/v1/a12/0')).toBe('POST /v1/a12/:id');
});

it.each([
  'https://example.invalid',
  'http://localhost:3000',
  'http://127.0.0.1',
  'http://[::1]:3000',
])('allows %s', (url) => {
  expect(assertSafeBaseUrl(url)).toBeInstanceOf(URL);
});
it.each([
  'http://example.invalid',
  'http://localhost.evil',
  'ftp://localhost',
  'https://user:pass@example.invalid',
  'garbage',
])('refuses %s', (url) => {
  expect(() => assertSafeBaseUrl(url)).toThrow();
});

it('probes in bounded batches, counts bytes and statuses without retaining content', async () => {
  let active = 0;
  let peak = 0;
  const request = vi.fn<typeof fetch>(async (_url, options) => {
    expect(options).toMatchObject({
      redirect: 'manual',
      credentials: 'omit',
      method: 'GET',
    });
    expect(options?.headers).toBeUndefined();
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return new Response('body-secret', {
      status: 200,
      headers: { 'set-cookie': 'cookie-secret' },
    });
  });
  const report = await probe(
    'https://example.invalid',
    [{ path: '/login?token=query-secret' }],
    5,
    2,
    request,
  );
  expect(request).toHaveBeenCalledTimes(5);
  expect(peak).toBe(2);
  expect(report[0]).toMatchObject({
    route: 'GET /login',
    count: 5,
    statuses: { 200: 5 },
    median_bytes: 11,
  });
  expect(JSON.stringify(report)).not.toMatch(
    /body-secret|cookie-secret|query-secret/,
  );
  for (const path of ['//elsewhere.invalid', '/\\elsewhere.invalid'])
    await expect(
      probe('https://example.invalid', [{ path }], 1, 1, request),
    ).rejects.toThrow();
  await expect(
    probe('https://example.invalid', [{ path: '/' }], 201, 1, request),
  ).rejects.toThrow();
});
