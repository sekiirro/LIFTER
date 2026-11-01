import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type { RegistrationFixture } from '../integration/registration-links-fixture';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let fixture: RegistrationFixture | null = null;
let token = '';
const geometryEvidence: {
  locale: string;
  theme: string;
  viewport: string;
  bannerWidth: number;
  bannerHeight: number;
  formTop: number;
  bannerBottom: number;
  cls: number;
}[] = [];

async function expectAxeClean(page: Page) {
  const report = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(report.violations).toEqual([]);
}

test.beforeAll(async () => {
  if (!local) return;
  const { registrationFixture, checked } =
    await import('../integration/registration-links-fixture');
  fixture = await registrationFixture();
  const draft = checked(
    await fixture.woA.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: 0,
      fields: {
        name: { ar: 'النادي المنشور', en: 'Published Club' },
        color: '#2563EB',
        bannerAlt: { ar: '', en: '' },
      },
    }),
  );
  checked(
    await fixture.woA.client.rpc('branding_publish', {
      workspace_id: fixture.wsA.id,
      expected_revision: draft,
    }),
  );
  checked(
    await fixture.woA.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: draft,
      fields: {
        name: { ar: 'مسودة النادي', en: 'Unpublished Draft' },
        color: '#8B5CF6',
        bannerAlt: { ar: '', en: '' },
      },
    }),
  );
});

test.beforeEach(async () => {
  if (!local) return;
  if (!fixture) throw new Error('Stack-B registration fixture is missing');
  const { secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  const link = secret();
  checked(await issue(fixture, fixture.po.client, { token_hash: link.hash }));
  const projection = await fixture.actors.anon.client.rpc(
    'registration_link_open',
    { token: link.token },
  );
  const branding = projection.data?.branding;
  if (
    projection.error ||
    !branding ||
    JSON.stringify(Object.keys(branding).sort()) !==
      JSON.stringify(['banner', 'bannerAlt', 'color', 'logo', 'name']) ||
    JSON.stringify(Object.keys(branding.name ?? {}).sort()) !==
      JSON.stringify(['ar', 'en']) ||
    branding.name.en !== 'Published Club' ||
    branding.color !== '#2563EB' ||
    branding.bannerAlt.ar !== '' ||
    branding.bannerAlt.en !== '' ||
    branding.logo !== false ||
    branding.banner !== false
  )
    throw new Error(
      'Stack-B registration projection did not return published identity',
    );
  token = link.token;
});

test.afterAll(async () => {
  if (geometryEvidence.length === 0) return;
  const path = join(
    process.cwd(),
    'tests',
    'integration',
    'evidence',
    'f14-ui',
    'registration-geometry.json',
  );
  await writeFile(
    path,
    `${JSON.stringify(geometryEvidence, null, 2)}\n`,
    'utf8',
  );
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: 'mobile-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'desktop-1440', width: 1440, height: 900 },
    ]) {
      test(`${locale}/${theme}/${viewport.name}: published registration brand`, async ({
        page,
        context,
      }, testInfo) => {
        test.skip(!local, 'Requires the selected disposable local database.');
        await page.setViewportSize(viewport);
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, url: origin },
          { name: THEME_COOKIE, value: theme, url: origin },
        ]);
        await page.addInitScript(() => {
          const browserWindow = window as Window & {
            __f14Shifts?: number;
            __f14ShiftObserverInstalled?: boolean;
          };
          browserWindow.__f14Shifts = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
              };
              if (!shift.hadRecentInput)
                browserWindow.__f14Shifts! += shift.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          browserWindow.__f14ShiftObserverInstalled = true;
        });
        await page.goto(`/register/${token}`);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute(
          'dir',
          locale === 'ar' ? 'rtl' : 'ltr',
        );
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(
          page.locator('[data-registration-card="premium-centered"]'),
        ).toBeVisible();
        await expect(page.locator('[data-brand-name]')).toBeVisible();
        await expect(page.locator('[data-brand-name]')).toHaveText(
          locale === 'ar' ? 'النادي المنشور' : 'Published Club',
        );
        await expect(page.locator('main')).not.toContainText(
          'Unpublished Draft',
        );
        await expect(
          page.locator('[data-registration-banner-fallback]'),
        ).toHaveAccessibleName(getMessages(locale)['f14Banner.fallbackAlt']);
        await expect(
          page.locator('[data-registration-card="premium-centered"] form'),
        ).toBeVisible();
        const banner = page.locator('[data-registration-banner-fallback]');
        const bannerBox = await banner.boundingBox();
        const bannerGeometry = await banner.evaluate((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            aspectRatio: style.aspectRatio,
            minBlockSize: style.minBlockSize,
            maxBlockSize: style.maxBlockSize,
          };
        });
        expect(bannerBox).not.toBeNull();
        expect(bannerGeometry.aspectRatio).toBe('2 / 1');
        expect(bannerGeometry.minBlockSize).toBe('128px');
        expect(bannerGeometry.maxBlockSize).toBe('288px');
        expect(bannerGeometry.height).toBeCloseTo(
          Math.min(288, Math.max(128, bannerGeometry.width / 2)),
          1,
        );
        const card = await page
          .locator('[data-registration-card="premium-centered"]')
          .boundingBox();
        const form = await page
          .locator('[data-registration-card="premium-centered"] form')
          .boundingBox();
        expect(card).not.toBeNull();
        expect(form).not.toBeNull();
        expect(form!.y).toBeGreaterThanOrEqual(
          bannerBox!.y + bannerBox!.height,
        );
        expect(
          await page.evaluate(
            () =>
              (window as Window & { __f14ShiftObserverInstalled?: boolean })
                .__f14ShiftObserverInstalled,
          ),
        ).toBe(true);
        const cls = await page.evaluate(
          () => (window as Window & { __f14Shifts?: number }).__f14Shifts ?? 0,
        );
        expect(cls).toBeLessThan(0.001);
        geometryEvidence.push({
          locale,
          theme,
          viewport: viewport.name,
          bannerWidth: bannerGeometry.width,
          bannerHeight: bannerGeometry.height,
          formTop: form!.y,
          bannerBottom: bannerBox!.y + bannerBox!.height,
          cls,
        });
        await expectAxeClean(page);

        const committed = join(
          process.cwd(),
          'tests',
          'integration',
          'evidence',
          'f14-ui',
          `registration-${locale}-${theme}-${viewport.name}.png`,
        );
        const temporary = testInfo.outputPath(
          `registration-${locale}-${theme}-${viewport.name}.png`,
        );
        await mkdir(dirname(committed), { recursive: true });
        await page.screenshot({ path: temporary, fullPage: true });
        await copyFile(temporary, committed);
      });
    }
  }
}

test('invalid registration remains generic, neutral, and form-free', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([
    { name: LOCALE_COOKIE, value: 'en', url: origin },
    { name: THEME_COOKIE, value: 'light', url: origin },
  ]);
  await page.goto('/register/not-a-token');
  await expect(page.locator('main h1')).toHaveText(
    'This registration link is invalid or no longer available.',
  );
  await expect(
    page.locator('[data-registration-card="premium-centered"]'),
  ).toHaveCount(0);
  await expect(page.locator('[data-brand-scope]')).toHaveCount(0);
  await expect(page.locator('[data-registration-card] form')).toHaveCount(0);
  await expectAxeClean(page);
  const committed = join(
    process.cwd(),
    'tests',
    'integration',
    'evidence',
    'f14-ui',
    'registration-invalid-en-light-mobile-390.png',
  );
  const temporary = testInfo.outputPath(
    'registration-invalid-en-light-mobile-390.png',
  );
  await mkdir(dirname(committed), { recursive: true });
  await page.screenshot({ path: temporary, fullPage: true });
  await copyFile(temporary, committed);
});
