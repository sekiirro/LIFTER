import { expect, test } from '@playwright/test';
import packageJson from '../../package.json';

test('GET /api/health returns the public health contract', async ({
  request,
}) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toBe('no-store');

  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(['status', 'version']);
  expect(body.status).toBe('ok');
  expect(body.version).toBe(packageJson.version);
});

test('POST /api/health returns method not allowed', async ({ request }) => {
  const response = await request.post('/api/health');

  expect(response.status()).toBe(405);
});

test('OPTIONS /api/health returns method not allowed', async ({ request }) => {
  const response = await request.fetch('/api/health', { method: 'OPTIONS' });

  expect(response.status()).toBe(405);
  expect(response.headers()['allow']).toBe('GET, HEAD');
});

test('HEAD /api/health returns success', async ({ request }) => {
  const response = await request.head('/api/health');

  expect(response.status()).toBe(200);
});
