import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const temporaryDir = join(tmpdir(), `lifter-f14-ui-${process.pid}`);

async function expectAxeClean(page: Page) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(report.violations).toEqual([]);
}

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: 'mobile-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'desktop-1440', width: 1440, height: 900 },
    ]) {
      test(`${locale}/${theme}/${viewport.name}: editor and live preview`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.goto('/showcase/f14-branding');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          page.locator('[data-editor-layout="split"]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-unsaved-sample-editor]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-upload-guidance-draft]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-source-color="#2563EB"]'),
        ).toBeVisible();
        await expect(
          page.locator('[data-source-color="#2563EB"] bdi'),
        ).toHaveAttribute('dir', 'ltr');
        await expect(page.locator('[data-adjusted-color] bdi')).toHaveAttribute(
          'dir',
          'ltr',
        );
        await expect(
          page.locator('[data-upload-guidance-draft] bdi'),
        ).toHaveCount(3);
        await expect(
          page.locator('[data-upload-guidance-draft] bdi').first(),
        ).toHaveAttribute('dir', 'ltr');
        await expect(page.locator('[data-adjusted-color]')).toBeVisible();
        await expect(page.locator('[data-adjusted-color-dark]')).toBeVisible();
        await expect(
          page.locator('[data-color-accessibility-explanation]'),
        ).toBeVisible();
        await expect(page.locator('[data-current-published]')).toBeVisible();
        await expect(page.locator('#brand-name-ar')).toBeVisible();
        await expect(page.locator('#brand-name-en')).toBeVisible();
        await expect(page.locator('#brand-name-ar')).toHaveAttribute(
          'dir',
          'rtl',
        );
        await expect(page.locator('#brand-name-en')).toHaveAttribute(
          'dir',
          'ltr',
        );
        await expect(page.locator('#banner-alt-ar')).toBeVisible();
        await expect(page.locator('#banner-alt-en')).toBeVisible();
        await expect(page.locator('#brand-color')).toBeVisible();
        await expect(
          page.locator('[data-preview-surface="staff"]'),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-preview-surface="portal-placeholder"]'),
        ).toHaveCount(1);
        await expect(
          page.getByRole('button', { name: /history|restore/i }),
        ).toHaveCount(0);

        const split = await page
          .locator('[data-editor-columns]')
          .first()
          .evaluate((element) => getComputedStyle(element).gridTemplateColumns)
          .catch(() => '');
        if (viewport.width > 640) {
          expect(split).not.toBe('');
          await expect(
            page.locator('[data-preview-surface="registration"]'),
          ).toBeVisible();
          await page.locator('[data-preview-tab="portal-placeholder"]').click();
          const portal = page.locator(
            '[data-preview-surface="portal-placeholder"]',
          );
          await expect(portal).toBeVisible();
          await expect(
            portal.locator('[data-portal-preview-notice]'),
          ).toContainText(locale === 'ar' ? 'مسودة:' : 'DRAFT:');
          await expect(portal.locator('button, a, form, input')).toHaveCount(0);
          await expectAxeClean(page);
          const portalScreenshot = join(
            temporaryDir,
            `portal-preview-${locale}-${theme}-${viewport.name}.png`,
          );
          await mkdir(temporaryDir, { recursive: true });
          await page.screenshot({ path: portalScreenshot, fullPage: true });
        }
        if (viewport.width <= 640) {
          await expect(page.locator('[data-mobile-editor-tabs]')).toBeVisible();
          await expect(
            page.locator('[data-preview-surface="registration"]'),
          ).toBeHidden();
          const localName = page.locator(
            locale === 'ar' ? '#brand-name-ar' : '#brand-name-en',
          );
          const localDraftName =
            locale === 'ar'
              ? '\u0646\u0627\u062f\u064a \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0645\u062d\u0644\u064a'
              : 'Local Draft Club';
          await localName.fill(localDraftName);
          await expectAxeClean(page);
          await page.locator('#branding-mobile-tab-editor').focus();
          await page.keyboard.press(
            locale === 'ar' ? 'ArrowLeft' : 'ArrowRight',
          );
          await expect(
            page.locator('#branding-mobile-tab-preview'),
          ).toBeFocused();
          await expect(
            page.locator('[data-preview-surface="registration"]'),
          ).toBeVisible();
          await expect(
            page.locator('[data-preview-surface="registration"] h3'),
          ).toHaveText(localDraftName);
          await expect(page.locator('[data-current-published]')).toContainText(
            locale === 'ar' ? 'النادي المنشور' : 'Published Club',
          );
          await expectAxeClean(page);
          const previewTemporary = join(
            temporaryDir,
            `editor-preview-${locale}-${theme}-${viewport.name}.png`,
          );
          await mkdir(temporaryDir, { recursive: true });
          await page.screenshot({ path: previewTemporary, fullPage: true });
          const staffTab = page.locator('[data-preview-tab="staff"]');
          await staffTab.click();
          await expect(
            page.locator('[data-preview-surface="staff"]'),
          ).toBeVisible();
          await page.keyboard.press(
            locale === 'ar' ? 'ArrowLeft' : 'ArrowRight',
          );
          await expect(
            page.locator('[data-preview-tab="portal-placeholder"]'),
          ).toBeFocused();
          await expect(
            page.locator('[data-preview-surface="portal-placeholder"]'),
          ).toBeVisible();
          const portal = page.locator(
            '[data-preview-surface="portal-placeholder"]',
          );
          await expect(
            portal.locator('[data-portal-preview-notice]'),
          ).toContainText(locale === 'ar' ? 'مسودة:' : 'DRAFT:');
          await expect(portal.locator('button, a, form, input')).toHaveCount(0);
          await expectAxeClean(page);
          const portalScreenshot = join(
            temporaryDir,
            `portal-preview-${locale}-${theme}-${viewport.name}.png`,
          );
          await mkdir(temporaryDir, { recursive: true });
          await page.screenshot({ path: portalScreenshot, fullPage: true });
          await page.locator('#branding-mobile-tab-editor').click();
          await expect(localName).toHaveValue(localDraftName);
        }
        await expectAxeClean(page);

        const temporary = join(
          temporaryDir,
          `editor-${locale}-${theme}-${viewport.name}.png`,
        );
        await mkdir(temporaryDir, { recursive: true });
        await page.screenshot({ path: temporary, fullPage: true });
      });
    }
  }
}
