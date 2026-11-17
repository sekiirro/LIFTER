import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

/**
 * S30-PO-8 Q16 / S31-PO-7 Q5 verification for the responsive shell:
 * vertical Liquid Glass sidebar at >= 1024px (inline-start, icons only,
 * hover + keyboard-focus tooltips), bottom bar below 1024px, and content
 * clearance across 1024-1199px. FR-021/FR-027/FR-028, SC-009/010/011.
 */
const origin = process.env.PLAYWRIGHT_BASE_URL!;
const shotDir = process.env.SHELL_SCREENSHOT_DIR;
const desktopWidths = [1024, 1440] as const;
const clearanceWidths = [1024, 1080, 1199, 1200, 1280, 1440] as const;

async function openShell(
  page: import('@playwright/test').Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
  width: number,
) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
  const rail = page.getByTestId('nav-rail');
  await expect(rail).toBeVisible();
  return rail;
}

for (const locale of ['ar', 'en'] as const) {
  const m = getMessages(locale);
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`Q16 shell ${locale} ${theme}`, () => {
      test.use({ javaScriptEnabled: true });

      test.beforeEach(async ({ context }) => {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
      });

      test('sidebar variant, inline-start placement and icons-only default at 1024 and 1440', async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'chromium',
          'Desktop Q16 assertions use chromium.',
        );
        for (const width of desktopWidths) {
          const rail = await openShell(page, locale, theme, width);
          await expect(page.getByTestId('bottom-bar')).toBeHidden();
          await expect(page.getByRole('navigation')).toHaveCount(1);
          await expect(rail).toHaveAccessibleName(m['nav.label']);

          const links = rail.getByRole('link');
          await expect(links).toHaveCount(4);
          await expect(rail.locator('[data-nav-key="more"]')).toHaveCount(0);
          for (const key of [
            'home',
            'clients',
            'workout',
            'nutrition',
          ] as const) {
            const link = rail.locator(`[data-nav-key="${key}"]`);
            await expect(link).toHaveAccessibleName(m[`nav.${key}`]);
            // Icons only: the link renders exactly one svg and no text label.
            expect(await link.locator('svg').count()).toBe(1);
            expect((await link.textContent())?.trim()).toBe('');
            await expect(page.getByTestId(`tooltip-${key}`)).toHaveAttribute(
              'data-visible',
              'false',
            );
          }
          await expect(links.first()).toHaveAttribute('aria-current', 'page');

          const box = await rail.boundingBox();
          if (!box) throw new Error('Expected visible vertical sidebar');
          // Vertical, compact: shorter than half the viewport height.
          expect(box.height).toBeLessThan(900 / 2);
          // Inline-start: left in LTR, right in RTL (mirrors with direction).
          if (locale === 'en')
            expect(box.x + box.width).toBeLessThan(width / 3);
          else expect(box.x).toBeGreaterThan((2 * width) / 3);

          if (shotDir) {
            await page.screenshot({
              path: join(shotDir, `shell-${locale}-${theme}-${width}.png`),
              fullPage: true,
            });
          }
        }
      });

      test('content clears the fixed rail at 1024-1440', async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'chromium',
          'Desktop clearance assertions use chromium.',
        );
        for (const width of clearanceWidths) {
          const rail = await openShell(page, locale, theme, width);
          const railBox = await rail.boundingBox();
          const headingBox = await page
            .getByRole('heading', { level: 1 })
            .boundingBox();
          if (!railBox || !headingBox)
            throw new Error('Expected visible rail and content heading');
          if (locale === 'en') {
            expect(headingBox.x).toBeGreaterThanOrEqual(
              railBox.x + railBox.width,
            );
          } else {
            expect(railBox.x).toBeGreaterThanOrEqual(
              headingBox.x + headingBox.width,
            );
          }
        }
      });

      test('1024px sidebar has no serious or critical axe violations', async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'chromium',
          'Desktop axe assertions use chromium.',
        );
        await openShell(page, locale, theme, 1024);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.filter(
            (item) => item.impact === 'serious' || item.impact === 'critical',
          ),
        ).toEqual([]);
      });

      test('each icon name is shown on pointer hover and keyboard focus at 1024 and 1440', async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'chromium',
          'Desktop tooltip assertions use chromium.',
        );
        for (const width of desktopWidths) {
          const rail = await openShell(page, locale, theme, width);
          const trigger = rail.locator('[data-nav-key="home"]');
          const tooltip = page.getByTestId('tooltip-home');

          await expect(tooltip).toBeHidden();
          await trigger.hover();
          await expect(tooltip).toBeVisible();
          await expect(tooltip).toHaveText(m['nav.home']);
          await expect(tooltip).toHaveAttribute('aria-hidden', 'false');

          await page.mouse.move(0, 0);
          await expect(tooltip).toBeHidden();
          await page.keyboard.press('Tab');
          await expect(trigger).toBeFocused();
          await expect(tooltip).toBeVisible();
          await expect(tooltip).toHaveText(m['nav.home']);
        }
      });
    });
  }
}

test.describe('Q16 glass fallback retains keyboard operation', () => {
  test.use({ javaScriptEnabled: true });

  test('static fallback keeps the focused rail link as the identical node', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop glass assertions use chromium.',
    );
    await page.setViewportSize({ width: 1024, height: 900 });
    await context_addCookies(page, 'en', 'light');
    await page.addInitScript(() => {
      const nativeNow = Performance.prototype.now;
      Performance.prototype.now = function () {
        const elapsed = nativeNow.call(this);
        const hasStartedGlassInit = Boolean(
          document.querySelector('[data-glass-init-start]'),
        );
        return elapsed + (hasStartedGlassInit ? 200 : 0);
      };
    });
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const rail = page.getByTestId('nav-rail');
    const link = rail.getByRole('link').first();
    const originalNode = await link.elementHandle();
    if (!originalNode) throw new Error('Expected a rail link');

    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(rail).toHaveAttribute('data-glass-runtime', 'static', {
      timeout: 15_000,
    });
    expect(
      await originalNode.evaluate((el) => el === document.activeElement),
    ).toBe(true);
    await expect(link).toBeFocused();
  });
});

async function context_addCookies(
  page: import('@playwright/test').Page,
  locale: 'ar' | 'en',
  theme: 'light' | 'dark',
) {
  await page.context().addCookies([
    { name: LOCALE_COOKIE, value: locale, url: origin },
    { name: THEME_COOKIE, value: theme, url: origin },
  ]);
}
