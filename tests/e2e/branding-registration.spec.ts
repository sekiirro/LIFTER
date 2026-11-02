import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import {
  captureHeroScreenshot,
  expectHeroAxeClean,
  expectHeroPreferencesGap,
  expectHeroPreferencesSingleRow,
  expectHeroFocusRing,
  expectHeroMaterialContract,
  expectHeroPhoneGroupLtr,
  expectHeroTextContrast,
  expectHeroTouchTargets,
  heroEvidenceDirectory,
} from './registration-hero-evidence';
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
  cardCenterX: number;
  cardCenterY: number;
  viewportCenterX: number;
  viewportCenterY: number;
  cls: number;
  screenshot: string;
  preferenceRows?: number;
  preferencePillHeight?: number;
  preferenceControlRowHeight?: number;
  preferenceGap?: number;
  preferenceGapToken?: number;
}[] = [];

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
  await mkdir(heroEvidenceDirectory, { recursive: true });
  await writeFile(
    join(heroEvidenceDirectory, 'registration-geometry.json'),
    `${JSON.stringify(geometryEvidence, null, 2)}\n`,
    'utf8',
  );
});

for (const locale of ['ar', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { name: 'mobile-360', width: 360, height: 800 },
      { name: 'mobile-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'desktop-1440', width: 1440, height: 900 },
    ]) {
      test(`${locale}/${theme}/${viewport.name}: published registration brand`, async ({
        page,
        context,
      }) => {
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
        await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
          'data-has-banner',
          'false',
        );
        await expect(page.locator('[data-registration-hero]')).toHaveAttribute(
          'data-hero-layout',
          'centered',
        );
        await expect(page.locator('[data-registration-banner]')).toHaveCount(0);
        await expect(
          page.locator('[data-registration-banner-fallback]'),
        ).toHaveCount(0);
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
          page.locator('[data-registration-card="premium-centered"] form'),
        ).toBeVisible();
        await expect(page.getByTestId('language-select')).toHaveAccessibleName(
          /.+/,
        );
        for (const option of ['system', 'dark', 'light']) {
          await expect(
            page.getByTestId(`theme-${option}`),
          ).toHaveAccessibleName(/.+/);
        }
        const cardBox = await page
          .locator('[data-registration-card="premium-centered"]')
          .boundingBox();
        expect(cardBox).not.toBeNull();
        const pillBox = await page
          .locator('[data-testid="registration-hero-preferences"]')
          .boundingBox();
        expect(pillBox).not.toBeNull();
        expect(pillBox!.y + pillBox!.height).toBeLessThanOrEqual(cardBox!.y);
        const preferenceMetrics =
          viewport.width <= 390
            ? await expectHeroPreferencesSingleRow(page)
            : null;
        const gapMetrics =
          viewport.width <= 390 ? await expectHeroPreferencesGap(page) : null;
        const cardCenterX = cardBox!.x + cardBox!.width / 2;
        const cardCenterY = cardBox!.y + cardBox!.height / 2;
        const viewportCenterX = viewport.width / 2;
        const viewportCenterY = viewport.height / 2;
        expect(Math.abs(cardCenterX - viewportCenterX)).toBeLessThanOrEqual(2);
        if (viewport.width >= 768) {
          expect(Math.abs(cardCenterY - viewportCenterY)).toBeLessThanOrEqual(
            2,
          );
        }
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
        await expectHeroMaterialContract(page);
        await expectHeroTextContrast(page);
        await expectHeroTouchTargets(page);
        await expectHeroFocusRing(page);
        if (locale === 'ar') await expectHeroPhoneGroupLtr(page);
        await expectHeroAxeClean(page);
        const screenshot =
          viewport.width <= 390
            ? await captureHeroScreenshot(
                page,
                `centered-${locale}-${theme}-${viewport.name}`,
              )
            : '';
        geometryEvidence.push({
          locale,
          theme,
          viewport: viewport.name,
          cardCenterX,
          cardCenterY,
          viewportCenterX,
          viewportCenterY,
          cls,
          screenshot,
          ...(preferenceMetrics
            ? {
                preferenceRows: preferenceMetrics.rows,
                preferencePillHeight: preferenceMetrics.pillHeight,
                preferenceControlRowHeight: preferenceMetrics.controlRowHeight,
                preferencePaddingLeft: preferenceMetrics.paddingLeft,
                preferencePaddingRight: preferenceMetrics.paddingRight,
                preferenceChildInsets: preferenceMetrics.childInsets,
              }
            : {}),
          ...(gapMetrics
            ? {
                preferenceGap: gapMetrics.gap,
                preferenceGapToken: gapMetrics.token,
              }
            : {}),
        });
      });
    }
  }
}

test('invalid registration remains generic, neutral, and form-free', async ({
  page,
  context,
}) => {
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
  await expectHeroAxeClean(page);
});

function contrastAgainstWhite(color: string) {
  const channels =
    color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number) ?? [];
  if (channels.length !== 3)
    throw new Error(`Unsupported computed text color: ${color}`);
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return 1.05 / (luminance + 0.05);
}

for (const locale of ['ar', 'en'] as const) {
  test(`print/${locale}/mobile-390: filled registration controls remain readable on paper`, async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the selected disposable local database.');
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([
      { name: LOCALE_COOKIE, value: locale, url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.emulateMedia({ media: 'print' });
    await page.goto(`/register/${token}`);
    await expect(page.locator('form')).toBeVisible();
    await page.locator('input[name="name"]').fill('Printed Registration');
    await page.locator('input[name="email"]').fill('printed@example.test');
    await page.locator('input[type="tel"]').fill('1001234567');
    await page.locator('input[name="password"]').fill('PrintedPass123!');

    const rendered = await page.evaluate(() => {
      const input =
        document.querySelector<HTMLInputElement>('input[name="name"]');
      const callingCode = document.querySelector<HTMLElement>(
        '[data-testid="country-calling-code"]',
      );
      if (!input || !callingCode)
        throw new Error('Registration controls missing');
      return {
        printMedia: matchMedia('print').matches,
        inputColor: getComputedStyle(input).color,
        inputFillColor: getComputedStyle(input).webkitTextFillColor,
        callingCodeColor: getComputedStyle(callingCode).color,
      };
    });
    expect(rendered.printMedia).toBe(true);
    expect(rendered.inputFillColor).toBe(rendered.inputColor);
    expect(contrastAgainstWhite(rendered.inputColor)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastAgainstWhite(rendered.callingCodeColor),
    ).toBeGreaterThanOrEqual(4.5);
    await captureHeroScreenshot(page, `print-registration-${locale}-390`);
  });
}
