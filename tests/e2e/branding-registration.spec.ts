import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { modes } from '../../lib/design/tokens';
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
import { registrationIssueActorIndex } from './registration-issue-actor';

const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
const printRegistrationCases = (['ar', 'en'] as const).flatMap((locale) =>
  (['light', 'dark', 'follow-device'] as const).flatMap((theme) =>
    (['light', 'dark'] as const).map((osTheme) => ({
      locale,
      theme,
      osTheme,
    })),
  ),
);
let fixture: RegistrationFixture | null = null;
let token = '';
let registrationIssueCount = 0;
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
  if (!local)
    throw new Error('Requires the selected disposable local database.');
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
  if (!fixture) throw new Error('Stack-B registration fixture is missing');
  const { secret, issue, checked } =
    await import('../integration/registration-links-fixture');
  const link = secret();
  const actorIndex = registrationIssueActorIndex(registrationIssueCount++);
  const actor = actorIndex === 0 ? fixture.po : fixture.woA;
  checked(await issue(fixture, actor.client, { token_hash: link.hash }));
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

for (const { locale, theme, osTheme } of printRegistrationCases) {
  test(`print/${locale}/${theme}/os-${osTheme}: filled registration follows theme tokens`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const resolvedTheme = theme === 'follow-device' ? osTheme : theme;
    await page.emulateMedia({ colorScheme: osTheme, reducedMotion: 'reduce' });
    const cookies: { name: string; value: string; url: string }[] = [
      { name: LOCALE_COOKIE, value: locale, url: origin },
    ];
    if (theme !== 'follow-device')
      cookies.push({ name: THEME_COOKIE, value: theme, url: origin });
    await context.addCookies(cookies);
    await page.goto(`/register/${token}`);
    await page.locator('input[name="name"]').fill('Print Contrast');
    await page.locator('input[name="email"]').fill('print@example.test');
    await page.locator('input[type="tel"]').fill('1001234567');
    await page.locator('input[name="password"]').fill('StrongPrint42!');
    await expectHeroAxeClean(page);
    await page.emulateMedia({ media: 'print', colorScheme: osTheme });
    const expectedTokens = await page.evaluate(
      ({ card, text }) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = card;
        probe.style.color = text;
        document.body.append(probe);
        const resolved = getComputedStyle(probe);
        const tokens = {
          card: resolved.backgroundColor,
          text: resolved.color,
        };
        probe.remove();
        return tokens;
      },
      { card: modes[resolvedTheme].card, text: modes[resolvedTheme].text },
    );

    const contrast = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const card = document.querySelector<HTMLElement>(
        '[data-registration-card="premium-centered"]',
      );
      const input =
        document.querySelector<HTMLInputElement>('input[name="name"]');
      const callingCode = document.querySelector<HTMLElement>(
        '[data-testid="country-calling-code"]',
      );
      if (!card || !input || !callingCode)
        throw new Error('Print form targets unavailable');
      const tokenProbe = document.createElement('span');
      tokenProbe.style.backgroundColor = root
        .getPropertyValue('--color-card')
        .trim();
      tokenProbe.style.color = root.getPropertyValue('--color-text').trim();
      document.body.append(tokenProbe);
      const resolvedTokens = getComputedStyle(tokenProbe);
      const tokenCard = resolvedTokens.backgroundColor;
      const tokenText = resolvedTokens.color;
      tokenProbe.remove();
      const inputControl = input.closest<HTMLElement>(
        '[class*="fieldControl"]',
      );
      const phoneControl = callingCode.closest<HTMLElement>(
        '[class*="fieldControl"]',
      );
      if (!inputControl || !phoneControl)
        throw new Error('Print form control surfaces unavailable');
      const inputStyle = getComputedStyle(input);
      const callingStyle = getComputedStyle(callingCode);
      const inputBackground = getComputedStyle(inputControl).backgroundColor;
      const callingBackground = getComputedStyle(phoneControl).backgroundColor;
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      const luminance = (value: string) => {
        const channels = rgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
        );
      };
      const ratio = (foreground: string, background: string) => {
        const fg = luminance(foreground);
        const bg = luminance(background);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      };
      return {
        card: getComputedStyle(card).backgroundColor,
        tokenCard,
        inputColor: inputStyle.color,
        inputFill: inputStyle.getPropertyValue('-webkit-text-fill-color'),
        tokenText,
        inputBackground,
        inputRatio: ratio(inputStyle.color, inputBackground),
        callingColor: callingStyle.color,
        callingFill: callingStyle.getPropertyValue('-webkit-text-fill-color'),
        callingBackground,
        callingRatio: ratio(callingStyle.color, callingBackground),
        inputValue: input.value,
        theme: document.documentElement.dataset.theme,
      };
    });
    expect(contrast.theme).toBe(theme === 'follow-device' ? undefined : theme);
    expect(contrast.tokenCard).toBe(expectedTokens.card);
    expect(contrast.tokenText).toBe(expectedTokens.text);
    expect(contrast.card).toBe(contrast.tokenCard);
    expect(contrast.inputColor).toBe(contrast.tokenText);
    expect(contrast.inputFill).toBe(contrast.tokenText);
    expect(contrast.callingColor).toBe(contrast.tokenText);
    expect(contrast.callingFill).toBe(contrast.tokenText);
    expect(contrast.inputRatio).toBeGreaterThanOrEqual(4.5);
    expect(contrast.callingRatio).toBeGreaterThanOrEqual(4.5);
    expect(contrast.inputValue).toBe('Print Contrast');
    await captureHeroScreenshot(
      page,
      `print-registration-${locale}-${theme}-os-${osTheme}`,
    );
  });
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
