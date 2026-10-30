import { expect, test } from '@playwright/test';

test('real registration banner fixture is unavailable in production', async ({
  page,
}) => {
  const response = await page.goto('/showcase/f14-banner?real=1');
  expect(response?.status()).toBe(404);
});
