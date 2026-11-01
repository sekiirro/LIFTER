import { expect, test } from '@playwright/test';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test.describe('glass runtime focus behavior', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Glass enhancement focus checks use desktop Chromium.',
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        value: 8,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        configurable: true,
        value: 8,
      });
    });
  });

  test('keeps the dock link node focused when enhancement completes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const rail = page.getByTestId('nav-rail');
    const link = rail.getByRole('link').first();
    const originalNode = await link.elementHandle();
    if (!originalNode) throw new Error('Expected a dock link');

    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(rail).toHaveAttribute('data-glass-runtime', 'enhanced', {
      timeout: 15_000,
    });
    expect(
      await originalNode.evaluate((el) => el === document.activeElement),
    ).toBe(true);
  });

  test('keeps the dock link node focused when over-budget enhancement falls back', async ({
    page,
  }) => {
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
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL('/showcase/shell?role=trainer', origin).toString());
    const rail = page.getByTestId('nav-rail');
    const link = rail.getByRole('link').first();
    const originalNode = await link.elementHandle();
    if (!originalNode) throw new Error('Expected a dock link');

    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(rail).toHaveAttribute('data-glass-over-budget', '', {
      timeout: 15_000,
    });
    await expect(rail).toHaveAttribute('data-glass-runtime', 'static');
    expect(
      await originalNode.evaluate((el) => el === document.activeElement),
    ).toBe(true);
  });

  test('popover ArrowDown navigation works after enhancement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(new URL('/showcase', origin).toString());
    await page.getByRole('button', { name: 'Open showcase actions' }).click();
    const menu = page.getByRole('menu', { name: 'Showcase actions' });
    const first = menu.getByRole('menuitem', { name: 'First action' });
    const second = menu.getByRole('menuitem', { name: 'Second action' });
    await expect(first).toBeFocused();
    await expect(menu).toHaveAttribute('data-glass-runtime', 'enhanced', {
      timeout: 15_000,
    });

    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
  });
});
