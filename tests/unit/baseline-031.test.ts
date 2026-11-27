import { describe, expect, it } from 'vitest';
import {
  assertAllHttpSamplesAre200,
  cookieHeaderForRoute,
  NonSuccessfulHttpResponsesError,
  requestWithSyntheticCookies,
} from '../../scripts/free-tier/lib/authenticated-http.mjs';

describe('031 authenticated HTTP baseline helpers', () => {
  it('sends the PO session to staff routes and the client session to welcome', () => {
    const cookies = {
      po: 'sb-local-auth-token=synthetic-po-session',
      client: 'sb-local-auth-token=synthetic-client-session',
    };

    expect(cookieHeaderForRoute('/clients', cookies)).toBe(cookies.po);
    expect(cookieHeaderForRoute('/workspaces', cookies)).toBe(cookies.po);
    expect(cookieHeaderForRoute('/reports', cookies)).toBe(cookies.po);
    expect(cookieHeaderForRoute('/welcome', cookies)).toBe(cookies.client);
    expect(cookieHeaderForRoute('/login', cookies)).toBeUndefined();
  });

  it('fails closed when an authenticated route has no session cookie', () => {
    expect(() => cookieHeaderForRoute('/reports', {})).toThrow(
      'Missing synthetic po session for /reports',
    );
    expect(() =>
      cookieHeaderForRoute('/welcome', { po: 'po=session' }),
    ).toThrow('Missing synthetic client session for /welcome');
  });

  it('forwards the selected cookie on the request without adding one to public routes', async () => {
    const sent: Headers[] = [];
    const request = requestWithSyntheticCookies(
      {
        po: 'sb-local-auth-token=synthetic-po-session',
        client: 'sb-local-auth-token=synthetic-client-session',
      },
      async (_target, init = {}) => {
        sent.push(new Headers(init.headers));
        return new Response(null, { status: 200 });
      },
    );

    await request(new URL('http://127.0.0.1:3000/reports'), {
      method: 'GET',
    });
    await request(new URL('http://127.0.0.1:3000/welcome'), {
      method: 'GET',
    });
    await request(new URL('http://127.0.0.1:3000/login'), {
      method: 'GET',
    });

    expect(sent.map((headers) => headers.get('cookie'))).toEqual([
      'sb-local-auth-token=synthetic-po-session',
      'sb-local-auth-token=synthetic-client-session',
      null,
    ]);
  });

  it('accepts only complete per-sample HTTP 200 results', () => {
    expect(() =>
      assertAllHttpSamplesAre200({
        http_routes: [
          { route: 'GET /clients', count: 2, status_samples: [200, 200] },
        ],
      }),
    ).not.toThrow();

    const report = {
      http_routes: [
        {
          route: 'GET /clients',
          count: 3,
          status_samples: [200, 307, 500],
        },
      ],
    };
    expect(() => assertAllHttpSamplesAre200(report)).toThrow(
      NonSuccessfulHttpResponsesError,
    );
    try {
      assertAllHttpSamplesAre200(report);
    } catch (error) {
      expect(error).toBeInstanceOf(NonSuccessfulHttpResponsesError);
      expect((error as NonSuccessfulHttpResponsesError).report).toBe(report);
      expect((error as Error).message).toContain('GET /clients=200,307,500');
    }
  });

  it('fails when one or more sample statuses were omitted', () => {
    expect(() =>
      assertAllHttpSamplesAre200({
        http_routes: [
          { route: 'GET /welcome', count: 2, status_samples: [200] },
        ],
      }),
    ).toThrow(NonSuccessfulHttpResponsesError);
  });
});
