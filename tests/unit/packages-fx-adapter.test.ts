/**
 * T059 [FR-026, FR-027, SC-017, SC-018] - provider-mocked tests for the
 * server-only Frankfurter v2 adapter (`lib/packages/fx.ts`). No live network:
 * every request goes through an injected mock `fetch`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildFxRequestUrl,
  fetchFxSnapshot,
  fxRequestWindow,
  validateFxResponse,
} from '../../lib/packages/fx';

const row = (date: string, rate: unknown, base = 'USD', quote = 'EGP') => ({
  date,
  base,
  quote,
  rate,
});
const json = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), init);
const mockFetch = (
  impl: (url: string, init: RequestInit) => Promise<Response>,
) => vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const AT = '2026-11-10T10:00:00Z';
const WINDOW = { from: '2026-10-01', to: '2026-11-30' };

describe('T059 request construction and data minimization (FR-027, SC-018)', () => {
  it('window is calendar-month aligned and reveals only the month', () => {
    expect(fxRequestWindow('2026-11-10T10:00:00Z')).toEqual({
      from: '2026-10-01',
      to: '2026-11-30',
    });
    // 23:30Z on 2027-01-31 is 01:30 on 2027-02-01 in Cairo: month is February.
    expect(fxRequestWindow('2027-01-31T23:30:00Z')).toEqual({
      from: '2027-01-01',
      to: '2027-02-28',
    });
    expect(fxRequestWindow('2026-01-15T10:00:00Z')).toEqual({
      from: '2025-12-01',
      to: '2026-01-31',
    });
  });

  it('URL pins provider, pair and window and carries nothing else', () => {
    const url = new URL(buildFxRequestUrl('USD', WINDOW));
    expect(url.origin + url.pathname).toBe(
      'https://api.frankfurter.dev/v2/rates',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      base: 'USD',
      quotes: 'EGP',
      providers: 'CBE',
      from: '2026-10-01',
      to: '2026-11-30',
    });
    expect(
      new URL(buildFxRequestUrl('SAR', WINDOW)).searchParams.get('providers'),
    ).toBe('SAMA');
  });

  it('captured request has no body, cookies, auth or client/workspace data', async () => {
    const f = mockFetch(async () => json([row('2026-11-09', 54.2)]));
    await fetchFxSnapshot({ transactionAt: AT, currency: 'USD', fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(url).not.toMatch(/workspace|client|amount|email|phone|token/i);
    expect(url).not.toContain('2026-11-10'); // exact transaction date not sent
  });
});

describe('T059 adapter outcomes', () => {
  it('ready snapshot with pinned provider and publication date', async () => {
    const f = mockFetch(async () =>
      json([row('2026-11-08', 54.1), row('2026-11-09', 54.2)]),
    );
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        fetchImpl: f,
      }),
    ).toEqual({
      status: 'ready',
      rate: '54.2',
      publicationDate: '2026-11-09',
      provider: 'CBE',
    });
  });

  it('SAR uses the SAMA pin and weekend rows', async () => {
    const f = mockFetch(async () =>
      json([
        row('2026-11-07', 14.3802, 'SAR'),
        row('2026-11-08', 14.3803, 'SAR'),
      ]),
    );
    expect(
      await fetchFxSnapshot({
        transactionAt: '2026-11-09T10:00:00Z',
        currency: 'SAR',
        fetchImpl: f,
      }),
    ).toMatchObject({
      rate: '14.3803',
      provider: 'SAMA',
      publicationDate: '2026-11-08',
    });
  });

  it('EGP is identity with no network call', async () => {
    const f = mockFetch(async () => json([]));
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'EGP',
        fetchImpl: f,
      }),
    ).toEqual({
      status: 'ready',
      rate: '1',
      publicationDate: null,
      provider: null,
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('an existing ready snapshot is immutable and makes no network call', async () => {
    const f = mockFetch(async () => json([row('2026-11-09', 99)]));
    const existing = {
      status: 'ready' as const,
      rate: '54.2',
      publicationDate: '2026-11-09',
      provider: 'CBE' as const,
    };
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        existing,
        fetchImpl: f,
      }),
    ).toBe(existing);
    expect(f).not.toHaveBeenCalled();
  });

  it('empty publications -> pending, then ready on a later retry', async () => {
    const empty = mockFetch(async () => json([]));
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        fetchImpl: empty,
      }),
    ).toEqual({ status: 'pending' });
    const later = mockFetch(async () => json([row('2026-11-09', 54.2)]));
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        existing: { status: 'pending' },
        fetchImpl: later,
      }),
    ).toMatchObject({ status: 'ready', rate: '54.2' });
  });

  it.each([
    ['HTTP 500', () => new Response('x', { status: 500 })],
    ['HTTP 404', () => json({ message: 'not found' }, { status: 404 })],
    ['not JSON', () => new Response('<html>', { status: 200 })],
    ['object instead of array', () => json({ rates: [] })],
    [
      'oversize body',
      () => new Response('['.padEnd(300_000, ' '), { status: 200 }),
    ],
    [
      'Friday row (blended/unpinned series)',
      () => json([row('2026-11-06', 54)]),
    ],
    ['wrong base', () => json([row('2026-11-09', 54, 'EUR')])],
    ['wrong quote', () => json([row('2026-11-09', 54, 'USD', 'SAR')])],
    ['extra field', () => json([{ ...row('2026-11-09', 54), provider: 'X' }])],
    ['zero rate', () => json([row('2026-11-09', 0)])],
    ['negative rate', () => json([row('2026-11-09', -1)])],
    ['string rate', () => json([row('2026-11-09', '54.2')])],
    ['null rate', () => json([row('2026-11-09', null)])],
    ['date outside window', () => json([row('2026-12-01', 54)])],
    [
      'duplicate date',
      () => json([row('2026-11-09', 54), row('2026-11-09', 55)]),
    ],
  ])('rejects %s -> pending, never throws', async (_name, make) => {
    const f = mockFetch(async () => make());
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        fetchImpl: f,
      }),
    ).toEqual({ status: 'pending' });
  });

  it('network error -> pending', async () => {
    const f = mockFetch(async () => {
      throw new TypeError('network down');
    });
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        fetchImpl: f,
      }),
    ).toEqual({ status: 'pending' });
  });

  it('times out via abort signal -> pending', async () => {
    const f = mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    expect(
      await fetchFxSnapshot({
        transactionAt: AT,
        currency: 'USD',
        fetchImpl: f,
        timeoutMs: 20,
      }),
    ).toEqual({ status: 'pending' });
  });

  it('invalid transaction instant -> pending without a request', async () => {
    const f = mockFetch(async () => json([]));
    expect(
      await fetchFxSnapshot({
        transactionAt: 'bogus',
        currency: 'USD',
        fetchImpl: f,
      }),
    ).toEqual({ status: 'pending' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('T059 validateFxResponse', () => {
  it('returns normalized publications for a valid pinned response', () => {
    expect(
      validateFxResponse('USD', [row('2026-11-05', 53.9423)], WINDOW),
    ).toEqual([{ date: '2026-11-05', rate: '53.9423' }]);
  });
  it('accepts a carried-in row before the window start but not one far before it or after the end', () => {
    expect(
      validateFxResponse('USD', [row('2026-09-30', 52.1)], WINDOW),
    ).toEqual([{ date: '2026-09-30', rate: '52.1' }]);
    expect(() =>
      validateFxResponse('USD', [row('2026-08-26', 52.1)], WINDOW),
    ).toThrow();
    expect(() =>
      validateFxResponse('USD', [row('2026-12-01', 52.1)], WINDOW),
    ).toThrow();
  });
  it('rejects NaN and Infinity', () => {
    expect(() =>
      validateFxResponse('USD', [row('2026-11-05', Number.NaN)], WINDOW),
    ).toThrow();
    expect(() =>
      validateFxResponse('USD', [row('2026-11-05', Infinity)], WINDOW),
    ).toThrow();
  });
  it('rejects exponent-form numbers rather than guessing', () => {
    expect(() =>
      validateFxResponse('USD', [row('2026-11-05', 1e-7)], WINDOW),
    ).toThrow();
  });
});
