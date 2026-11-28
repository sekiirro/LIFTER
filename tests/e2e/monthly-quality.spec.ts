import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';

const locales = ['ar', 'en'] as const;
const themes = ['light', 'dark'] as const;
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const brands = [
  { name: 'default', query: '' },
  { name: 'sample', query: '?brand=%232563EB' },
] as const;
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function gateDir() {
  const dir =
    process.env.S73_QUALITY_GATE_DIR ??
    join(tmpdir(), 'lifter-s73-hungerg-qualityui');
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function open(
  page: Page,
  context: BrowserContext,
  locale: (typeof locales)[number],
  theme: (typeof themes)[number],
  width: number,
  height: number,
  brandQuery = '',
) {
  await page.setViewportSize({ width, height });
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value: locale,
      url: process.env.PLAYWRIGHT_BASE_URL!,
    },
    { name: THEME_COOKIE, value: theme, url: process.env.PLAYWRIGHT_BASE_URL! },
  ]);
  await page.goto(`/showcase/monthly-quality${brandQuery}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    locale === 'ar' ? 'rtl' : 'ltr',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByTestId('monthly-quality-view')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  expect(results.violations).toEqual([]);
  return results;
}

for (const locale of locales) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      for (const brand of brands) {
        test(`quality ${locale}/${theme}/${viewport.name}/${brand.name}: axe + screenshot`, async ({
          page,
          context,
        }) => {
          await open(
            page,
            context,
            locale,
            theme,
            viewport.width,
            viewport.height,
            brand.query,
          );
          const messages = getMessages(locale);
          await expect(
            page.getByRole('heading', {
              name: messages['workforce.quality.title'],
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByLabel(messages['workforce.quality.positiveCount']),
          ).toBeVisible();
          await expect(
            page.getByLabel(messages['workforce.quality.negativeCount']),
          ).toBeVisible();
          await expect(
            page.getByLabel(messages['workforce.quality.positiveWeight']),
          ).toBeVisible();
          await expect(
            page.getByLabel(messages['workforce.quality.negativeWeight']),
          ).toBeVisible();

          const font = await page
            .getByTestId('monthly-quality-view')
            .evaluate((element) => getComputedStyle(element).fontFamily);
          expect(font).toMatch(locale === 'ar' ? /plex/i : /geist/i);
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow).toBeLessThanOrEqual(0);
          const smallTargets = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('button,input,select')]
              .filter((element) => element.getClientRects().length > 0)
              .filter((element) => element.getBoundingClientRect().height < 44)
              .map(
                (element) =>
                  element.id || element.dataset.testid || element.tagName,
              ),
          );
          expect(smallTargets).toEqual([]);

          if (brand.name === 'sample') {
            const tokens = await page.evaluate(() => {
              const root = getComputedStyle(document.documentElement);
              const scope = getComputedStyle(
                document.querySelector<HTMLElement>('[data-brand-scope]')!,
              );
              return {
                rootBrand: root.getPropertyValue('--brand-fill'),
                scopeBrand: scope.getPropertyValue('--brand-fill'),
                rootError: root.getPropertyValue('--color-error-fg'),
                scopeError: scope.getPropertyValue('--color-error-fg'),
              };
            });
            expect(tokens.scopeBrand).not.toBe(tokens.rootBrand);
            expect(tokens.scopeError).toBe(tokens.rootError);
          }

          const axe = await axeClean(page);
          const dir = gateDir();
          const stem = `monthly-quality-${locale}-${theme}-${viewport.name}-${brand.name}`;
          writeFileSync(
            join(dir, `${stem}-axe.json`),
            JSON.stringify(
              {
                locale,
                theme,
                viewport,
                brand: brand.name,
                violations: axe.violations.length,
                passes: axe.passes.length,
              },
              null,
              2,
            ),
          );
          await page.screenshot({
            path: join(dir, `${stem}.png`),
            fullPage: true,
          });
        });
      }
    }
  }
}

test('quality feedback validation, zero confirmation, keyboard and reduced motion', async ({
  page,
  context,
}) => {
  await open(page, context, 'en', 'light', 1440, 900);
  const messages = getMessages('en');
  const weight = page.getByLabel(messages['workforce.quality.positiveWeight']);
  await weight.fill('1.234');
  await weight.blur();
  await expect(
    page.getByText(messages['workforce.quality.weight.decimalError']),
  ).toBeVisible();
  await weight.fill('1.25');
  await expect(
    page.getByText(messages['workforce.quality.weight.decimalError']),
  ).not.toBeVisible();

  await page.getByLabel(messages['workforce.quality.positiveCount']).fill('0');
  await page.getByTestId('quality-save').click();
  const dialog = page.getByRole('dialog', {
    name: messages['workforce.quality.zeroConfirmTitle'],
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(messages['workforce.quality.zeroConfirmBody']),
  ).toBeVisible();
  await axeClean(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('quality-save')).toBeFocused();

  await page.getByTestId('quality-save').click();
  await dialog.getByTestId('dialog-confirm').click();
  await expect(
    page.getByText(messages['workforce.quality.saved']),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page
    .getByTestId('quality-save')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration).toContain('1e-05s');
});
