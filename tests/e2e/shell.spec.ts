import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

// Both navigation variants and role selection must work without client JavaScript.
test.use({ javaScriptEnabled: false });
const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const trainerKeys = [
  'home',
  'clients',
  'workout',
  'nutrition',
  'more',
] as const;
const clientKeys = [
  'home',
  'workout',
  'nutrition',
  'progress',
  'more',
] as const;

for (const locale of ['ar', 'en'] as const) {
  test.describe(locale, () => {
    const m = getMessages(locale);
    test.beforeEach(async ({ context }) => {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
        { name: THEME_COOKIE, value: 'light', url: origin },
      ]);
    });

    test('desktop navigation preserves the content lane across responsive widths', async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'Desktop rail assertions use chromium.',
      );
      const response = await page.goto('/showcase/shell?role=trainer');
      expect(response?.status()).toBe(200);
      const rail = page.getByTestId('nav-rail');
      await expect(page.getByRole('navigation')).toHaveCount(1);
      await expect(rail).toHaveAccessibleName(m['nav.label']);
      const links = rail.getByRole('link');
      await expect(links).toHaveCount(5);
      for (const [index, key] of trainerKeys.entries()) {
        await expect(links.nth(index)).toHaveAttribute('data-nav-key', key);
        await expect(links.nth(index)).toHaveAccessibleName(m[`nav.${key}`]);
        await expect(links.nth(index)).toHaveAttribute(
          'href',
          `?role=trainer#${key}`,
        );
      }
      await expect(links.first()).toHaveAttribute('aria-current', 'page');

      for (const width of [1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const main = page.locator('main');
        const mainBox = await main.boundingBox();
        if (!mainBox) throw new Error('Expected visible main content');
        expect(mainBox.x).toBe(0);
        expect(mainBox.width).toBe(width);

        if (width === 1024) {
          await expect(rail).toBeHidden();
          await expect(page.getByTestId('bottom-bar')).toBeVisible();
          continue;
        }

        await expect(rail).toBeVisible();
        await expect(page.getByTestId('bottom-bar')).toBeHidden();
        const box = await rail.boundingBox();
        if (!box) throw new Error('Expected visible desktop dock');
        expect(box.height).toBeLessThan(900 / 2);

        // The unchanged 64rem content lane is centered. The floating dock
        // must remain entirely in its outer gutter on the logical start side.
        const laneStart = (width - 1024) / 2;
        const laneEnd = laneStart + 1024;
        if (locale === 'ar') expect(box.x).toBeGreaterThanOrEqual(laneEnd);
        else expect(box.x + box.width).toBeLessThanOrEqual(laneStart);
      }
    });

    test('desktop keyboard tooltip is described and does not move the dock', async ({
      browser,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'Desktop tooltip assertions use chromium.',
      );
      const context = await browser.newContext({
        javaScriptEnabled: true,
        viewport: { width: 1280, height: 900 },
      });
      try {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: 'light', url: origin },
        ]);
        const page = await context.newPage();
        const response = await page.goto(
          new URL('/showcase/shell?role=trainer', origin).toString(),
        );
        expect(response?.status()).toBe(200);
        const rail = page.getByTestId('nav-rail');
        const home = rail.getByRole('link', { name: m['nav.home'] });
        const tooltip = rail.getByTestId('tooltip-home');
        await expect(tooltip).toBeHidden();
        const before = await rail.boundingBox();
        if (!before) throw new Error('Expected visible desktop dock');

        await page.keyboard.press('Tab');
        await expect(home).toBeFocused();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveText(m['nav.home']);
        await expect(tooltip).toHaveAttribute('aria-hidden', 'false');
        const tooltipId = await tooltip.getAttribute('id');
        const describedBy = (await home.getAttribute('aria-describedby'))
          ?.split(/\s+/)
          .filter(Boolean);
        expect(tooltipId).toBeTruthy();
        expect(describedBy).toContain(tooltipId);

        const after = await rail.boundingBox();
        const tooltipBox = await tooltip.boundingBox();
        if (!after || !tooltipBox)
          throw new Error('Expected focused tooltip and unchanged dock');
        expect(after).toEqual(before);
        if (locale === 'ar')
          expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(
            after.x,
          );
        else
          expect(tooltipBox.x).toBeGreaterThanOrEqual(
            after.x + after.width,
          );
      } finally {
        await context.close();
      }
    });

    for (const role of ['trainer', 'client'] as const) {
      test(`mobile ${role} bottom bar has ordered visible labels and 44px targets`, async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name !== 'mobile-chromium',
          'Bottom bar assertions use Pixel 7.',
        );
        await page.goto(`/showcase/shell?role=${role}`);
        const bottom = page.getByTestId('bottom-bar');
        await expect(bottom).toBeVisible();
        await expect(page.getByTestId('nav-rail')).toBeHidden();
        await expect(page.getByRole('navigation')).toHaveCount(1);
        await expect(bottom).toHaveAccessibleName(m['nav.label']);
        const keys = role === 'trainer' ? trainerKeys : clientKeys;
        const labels = bottom.getByTestId('bottom-label');
        await expect(labels).toHaveText(keys.map((key) => m[`nav.${key}`]));
        const links = bottom.getByRole('link');
        await expect(links).toHaveCount(5);
        for (const [index, key] of keys.entries()) {
          await expect(labels.nth(index)).toBeVisible();
          await expect(links.nth(index)).toHaveAccessibleName(m[`nav.${key}`]);
          await expect(links.nth(index)).not.toHaveAttribute('aria-label');
          await expect(links.nth(index)).toHaveAttribute('data-nav-key', key);
          const box = await links.nth(index).boundingBox();
          if (!box) throw new Error('Expected visible navigation target');
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await expect(links.first()).toHaveAttribute('aria-current', 'page');
        const bottomBox = await bottom.boundingBox();
        if (!bottomBox) throw new Error('Expected visible bottom bar');
        const viewport = page.viewportSize();
        if (!viewport) throw new Error('Expected mobile viewport');
        expect(bottomBox.x).toBeGreaterThan(0);
        expect(bottomBox.y + bottomBox.height).toBeLessThan(viewport.height);
        const padding = await page
          .locator('main')
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).paddingBlockEnd),
          );
        expect(padding).toBeGreaterThanOrEqual(bottomBox.height);
      });
    }

    test('sales shows the localized pending-decision notice with no navigation', async ({
      page,
    }) => {
      await page.goto('/showcase/shell?role=sales');
      await expect(page.locator('nav')).toHaveCount(0);
      await expect(page.getByTestId('nav-needs-decision')).toHaveText(
        m['needsDecision.notice'],
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        m['showcase.shell'],
      );
    });

    test('missing and unknown demo roles default to trainer', async ({
      page,
    }, testInfo) => {
      for (const suffix of ['', '?role=unknown']) {
        await page.goto(`/showcase/shell${suffix}`);
        const nav = page.getByTestId(
          testInfo.project.name === 'chromium' ? 'nav-rail' : 'bottom-bar',
        );
        await expect(nav).toBeVisible();
        await expect(nav.locator('[data-nav-key="clients"]')).toHaveCount(1);
        await expect(page.getByTestId('role-trainer')).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
    });

    test('showcase previews roles and links to all full-size demos', async ({
      page,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'chromium',
        'Showcase preview assertions use desktop.',
      );
      await page.goto('/showcase?role=client#shell');
      const section = page.locator('#shell');
      await expect(section.getByRole('heading', { level: 2 })).toHaveText(
        m['showcase.shell'],
      );
      await expect(
        section.getByTestId('nav-rail').locator('[data-nav-key="progress"]'),
      ).toBeVisible();
      for (const role of ['trainer', 'client', 'sales'])
        await expect(
          section.locator(`a[href="/showcase/shell?role=${role}"]`),
        ).toBeVisible();
      await section.getByTestId('role-sales').click();
      await expect(section.getByTestId('nav-needs-decision')).toHaveText(
        m['needsDecision.notice'],
      );
      await expect(section.locator('nav')).toHaveCount(0);
    });
  });
}
