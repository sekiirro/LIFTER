import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('showcase form cannot submit personal data before client hydration', async ({
  page,
}) => {
  await page.goto('/showcase/f14-banner');
  const form = page.locator('form').first();
  await expect(form.locator('input')).toHaveCount(3);
  await expect(form.locator('input:disabled')).toHaveCount(3);
  await expect(form.locator('button[type="submit"]')).toBeDisabled();
});
