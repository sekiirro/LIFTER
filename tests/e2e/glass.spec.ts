import { testOrigin } from './test-origin.mjs';
import { expect, test } from '@playwright/test';
import { expectTooltipBesideTrigger } from './tooltip-geometry';

const origin = testOrigin;

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

test.describe('desktop rail viewport access', () => {
  test('keeps rail links reachable and tooltips outside the scrollport at short and normal heights', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Desktop rail viewport checks use Chromium.',
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

    for (const viewport of [
      { width: 1280, height: 600 },
      { width: 1440, height: 900 },
      { width: 1280, height: 200 },
    ]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.goto(
          new URL('/showcase/shell?role=trainer', origin).toString(),
        );

        const rail = page.getByTestId('nav-rail');
        const scrollport = rail.locator('[data-nav-scroll]');
        const links = scrollport.getByRole('link');
        await expect(rail).toBeVisible();
        await expect(links).toHaveCount(4);
        await expect(scrollport).toHaveCSS('overflow-y', 'auto');
        const railLinks = await links.all();
        for (const link of railLinks) await expect(link).toBeVisible();

        if (viewport.height === 600) {
          for (const link of railLinks) {
            await link.focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('Shift+Tab');
            await expect(link).toBeFocused();
            const ring = await link.evaluate((element) => {
              const box = element.getBoundingClientRect();
              const clip = element
                .closest('[data-nav-scroll]')!
                .getBoundingClientRect();
              const style = getComputedStyle(element);
              const extra =
                Number.parseFloat(style.outlineWidth) +
                Number.parseFloat(style.outlineOffset);
              return {
                clipLeft: clip.left,
                clipRight: clip.right,
                clipTop: clip.top,
                clipBottom: clip.bottom,
                left: box.left - extra,
                right: box.right + extra,
                top: box.top - extra,
                bottom: box.bottom + extra,
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
              };
            });
            expect(ring.outlineStyle).not.toBe('none');
            expect(Number.parseFloat(ring.outlineWidth)).toBeGreaterThan(0);
            expect(ring.left).toBeGreaterThanOrEqual(ring.clipLeft);
            expect(ring.right).toBeLessThanOrEqual(ring.clipRight);
            expect(ring.top).toBeGreaterThanOrEqual(ring.clipTop);
            expect(ring.bottom).toBeLessThanOrEqual(ring.clipBottom);
          }
        }

        if (viewport.height !== 200)
          await page.screenshot({
            path: testInfo.outputPath(
              `dock-${colorScheme}-${viewport.width}x${viewport.height}.png`,
            ),
          });

        const focusedLink =
          viewport.height === 200 ? links.last() : links.first();
        await focusedLink.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(focusedLink).toBeFocused();
        if (viewport.height === 200)
          await expect
            .poll(() => scrollport.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
        const navKey = await focusedLink.getAttribute('data-nav-key');
        const tooltip = page.getByTestId(`tooltip-${navKey}`);
        await expect(tooltip).toHaveAttribute('data-visible', 'true');
        const isRtl =
          (await rail.evaluate(
            (element) => getComputedStyle(element).direction,
          )) === 'rtl';
        await expectTooltipBesideTrigger(
          tooltip,
          focusedLink,
          isRtl ? 'rtl' : 'ltr',
        );
        expect(
          await tooltip.evaluate(
            (element) =>
              element.parentElement === document.body &&
              element.closest('[data-nav-scroll]') === null,
          ),
        ).toBe(true);
        const [railBox, tooltipBox] = await Promise.all([
          rail.boundingBox(),
          tooltip.boundingBox(),
        ]);
        expect(railBox).not.toBeNull();
        expect(tooltipBox).not.toBeNull();
        if (isRtl)
          expect(tooltipBox!.x + tooltipBox!.width).toBeLessThan(railBox!.x);
        else expect(tooltipBox!.x).toBeGreaterThan(railBox!.x + railBox!.width);
        expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
        expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(
          viewport.height,
        );
      }
    }
  });
});
