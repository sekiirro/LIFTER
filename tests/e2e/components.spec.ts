import { testOrigin } from './test-origin.mjs';
import { expect, test, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contrastRatio, type Hex } from '../../lib/design/color';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

async function colors(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { bg: style.backgroundColor, fg: style.color };
  });
}
function toHex(rgb: string): Hex {
  const channels = rgb.match(/[\d.]+/g);
  if (!channels || channels.length !== 3)
    throw new Error(`Expected opaque RGB: ${rgb}`);
  return `#${channels.map((channel) => Number(channel).toString(16).padStart(2, '0')).join('')}`;
}

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test.describe(`${locale} / ${theme}`, () => {
      const m = getMessages(locale);
      test.beforeEach(async ({ context, page }) => {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: testOrigin },
          { name: THEME_COOKIE, value: theme, url: testOrigin },
        ]);
        await page.goto('/showcase');
      });

      test('workspace brand buttons pass contrast and preserve semantic colors', async ({
        page,
      }) => {
        const outside = await colors(page.getByTestId('outside-error'));
        for (const sample of ['FFFF00', '000000']) {
          const scope = page.getByTestId(`brand-${sample}`);
          const button = await colors(scope.getByTestId('brand-button'));
          expect(
            contrastRatio(toHex(button.bg), toHex(button.fg)),
          ).toBeGreaterThanOrEqual(4.5);
          expect(await colors(scope.getByTestId('brand-error'))).toEqual(
            outside,
          );
        }
        const violations = (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations;
        expect(
          violations.filter((violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
          ),
        ).toEqual([]);
        const scope = page.getByTestId('brand-FFFF00');
        const screenshots = join(tmpdir(), 'lifter-f12-u9');
        await mkdir(screenshots, { recursive: true });
        const screenshot = join(
          screenshots,
          `workspace-brand-${locale}-${theme}.png`,
        );
        await scope.screenshot({ path: screenshot });
        const evidenceDirectory = join(
          process.cwd(),
          'tests/integration/evidence/f12-u9',
        );
        await mkdir(evidenceDirectory, { recursive: true });
        await copyFile(
          screenshot,
          join(evidenceDirectory, `workspace-brand-${locale}-${theme}.png`),
        );
      });

      test('Tab reaches the primary button with a visible focus indicator', async ({
        page,
      }) => {
        const primary = page.getByTestId('primary-button');
        // Traverse the actual tab order, including preference and brand controls.
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press('Tab');
          if (
            await primary.evaluate(
              (element) => element === document.activeElement,
            )
          )
            break;
        }
        await expect(primary).toBeFocused();
        const ring = await primary.evaluate((element) => {
          const style = getComputedStyle(element);
          return (
            (style.outlineStyle !== 'none' &&
              parseFloat(style.outlineWidth) > 0) ||
            style.boxShadow !== 'none'
          );
        });
        expect(ring).toBe(true);
      });

      test('loading buttons ignore pointer and keyboard activation', async ({
        page,
      }) => {
        const loading = page.getByTestId('loading-primary');
        await expect(loading).toHaveAttribute('aria-busy', 'true');
        await expect(loading).toHaveAttribute('aria-disabled', 'true');
        await loading.click({ force: true });
        await loading.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await expect(page.getByTestId('click-count')).toHaveText('0');
        await page.getByTestId('primary-button').click();
        await expect(page.getByTestId('click-count')).toHaveText('1');
      });

      test('invalid fields reference the visible error and hint', async ({
        page,
      }) => {
        const field = page.getByTestId('invalid-field');
        await expect(field).toHaveAttribute('aria-invalid', 'true');
        await expect(field).toHaveAccessibleName(m['showcase.fieldLabel']);
        const ids =
          (await field.getAttribute('aria-describedby'))?.split(/\s+/) ?? [];
        expect(ids).toHaveLength(2);
        for (const id of ids)
          await expect(page.locator(`[id="${id}"]`)).toBeVisible();
        await expect(field).toHaveAccessibleDescription(
          `${m['showcase.fieldHint']} ${m['showcase.fieldError']}`,
        );
      });

      test('dialog focuses cancel, contains focus, and restores the trigger after Escape', async ({
        page,
      }) => {
        const trigger = page.getByTestId('dialog-trigger');
        const dialog = page.getByTestId('confirm-dialog');
        await trigger.click();
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleName(m['dialog.title']);
        await expect(page.getByTestId('dialog-cancel')).toBeFocused();
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press('Tab');
          await expect
            .poll(() =>
              dialog.evaluate((element) =>
                element.contains(document.activeElement),
              ),
            )
            .toBe(true);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        // A second opening exercises the controlled native-dialog lifecycle.
        await trigger.click();
        await page.getByTestId('dialog-cancel').click();
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.getByTestId('dialog-confirm').click();
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
      });

      test('toast uses the pre-existing polite region without moving focus, and dismisses', async ({
        page,
      }) => {
        const region = page.getByTestId('toast-region');
        await expect(region).toHaveCount(1);
        await expect(region).toBeEmpty();
        await expect(region).toHaveAttribute('role', 'status');
        await expect(region).toHaveAttribute('aria-live', 'polite');
        const trigger = page.getByTestId('toast-trigger');
        await trigger.click();
        await expect(region).toHaveText(m['toast.success']);
        await expect(trigger).toBeFocused();
        await page.getByTestId('toast-dismiss').click();
        await expect(region).toBeEmpty();
        await expect(region).toHaveCount(1);
      });

      test('Retry increments the demonstration counter', async ({ page }) => {
        await expect(page.getByTestId('retry-count')).toHaveText('0');
        await page.getByTestId('retry-button').click();
        await expect(page.getByTestId('retry-count')).toHaveText('1');
      });
    });
  }
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('reduces button transitions and disables skeleton shimmer', async ({
    page,
  }) => {
    await page.goto('/showcase');
    const durations = await page
      .getByTestId('primary-button')
      .evaluate((element) =>
        getComputedStyle(element)
          .transitionDuration.split(',')
          .map((value) => parseFloat(value)),
      );
    for (const seconds of durations) expect(seconds).toBeLessThanOrEqual(0.01);
    const skeleton = page
      .getByTestId('skeleton-demo')
      .locator('[aria-hidden="true"] span')
      .first();
    await expect(skeleton).toHaveCSS('animation-name', 'none');
  });
});

test.describe('toast lifetime', () => {
  test('auto-dismisses after five active seconds and pauses for hover and focus', async ({
    page,
  }) => {
    await page.clock.install();
    await page.goto('/showcase');
    const region = page.getByTestId('toast-region');
    const trigger = page.getByTestId('toast-trigger');
    await trigger.click();
    await expect(region).not.toBeEmpty();
    await region.hover();
    await page.clock.runFor(6000);
    await expect(region).not.toBeEmpty();
    await page.getByTestId('toast-dismiss').focus();
    await trigger.hover();
    await page.clock.runFor(6000);
    await expect(region).not.toBeEmpty();
    await trigger.focus();
    await page.clock.runFor(5001);
    await expect(region).toBeEmpty();
  });
});
