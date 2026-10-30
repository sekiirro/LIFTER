import { expect, test } from '@playwright/test';

test('real registration banner fixture is unavailable in production', async ({
  page,
}) => {
  const response = await page.goto('/showcase/f14-banner?real=1');
  expect(response?.status()).toBe(404);
});

test('F14 hero prototype and artwork guidance are unavailable in production', async ({
  page,
}) => {
  for (const path of [
    '/showcase/f14-hero-glass',
    '/showcase/f14-hero-glass/guidance',
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
