import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test('keyboard users can select, confirm, upload, replace, and remove a banner', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto('/showcase/f14-upload');

  const card = page.locator('[data-upload-interactive-card]');
  const fileInput = card.locator('[data-upload-file-input="banner"]');
  const confirmation = card.getByRole('checkbox');
  const replace = card.getByRole('button', { name: 'Replace image' });
  const remove = card.getByRole('button', { name: 'Remove image' });

  await page.keyboard.press('Tab');
  await expect(fileInput).toBeFocused();
  await fileInput.setInputFiles({
    name: 'banner.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  await page.keyboard.press('Tab');
  await expect(confirmation).toBeFocused();
  await page.keyboard.press('Space');
  await expect(replace).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(fileInput).toBeFocused();
});

test('another in-flight branding action disables the other card with a reason', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto('/showcase/f14-upload');

  const manager = page.locator('[data-upload-manager-showcase]');
  await manager.locator('[data-upload-file-input="logo"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  const banner = manager.locator('[data-upload-card="banner"]');
  await expect(banner).toHaveAttribute('data-upload-state', 'disabled');
  await expect(banner).toContainText(
    getMessages('en')['branding.uploadInProgress'],
  );
  await expect(
    banner.getByRole('button', {
      name: getMessages('en')['branding.replaceImage'],
    }),
  ).toBeDisabled();
  await expect(
    banner.getByRole('button', {
      name: getMessages('en')['branding.removeImage'],
    }),
  ).toBeDisabled();
});

test('client validation blocks bad files and an interruption preserves the prior asset', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: LOCALE_COOKIE, value: 'en', url: origin }]);
  await page.goto('/showcase/f14-upload');

  const wrapper = page.locator('[data-upload-interrupted-card]');
  const card = wrapper.locator('[data-upload-card="logo"]');
  const fileInput = card.locator('[data-upload-file-input="logo"]');

  await fileInput.setInputFiles({
    name: 'logo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not-an-image'),
  });
  await expect(card).toHaveAttribute('data-upload-state', 'error');
  await expect(card).toContainText(getMessages('en')['branding.uploadFailed']);
  await expect(wrapper).toHaveAttribute(
    'data-upload-interrupted-attempts',
    '0',
  );

  await fileInput.setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(card).toHaveAttribute('data-upload-state', 'error');
  await expect(wrapper).toHaveAttribute(
    'data-upload-interrupted-attempts',
    '0',
  );

  await fileInput.setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(card).toHaveAttribute('data-upload-state', 'interrupted');
  await expect(wrapper).toHaveAttribute(
    'data-upload-interrupted-attempts',
    '1',
  );
  await expect(card.locator('[data-upload-thumbnail="logo"]')).toBeVisible();
  await expect(
    card.getByRole('button', {
      name: getMessages('en')['branding.retryImage'],
    }),
  ).toBeVisible();
});
