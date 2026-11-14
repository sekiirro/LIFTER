import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../../lib/i18n';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { expectHeroAxeClean } from './registration-hero-evidence';

const origin =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.APP_ORIGIN ??
  'http://localhost:3000';
const screenshotDirectory =
  process.env.HERO_S35_ERROR_SCREENSHOT_DIR ??
  process.env.HERO_R22_USERNAME_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter-s35-hero-r24');
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let token: string;

function relativeLuminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a computed RGB color, received ${color}`);
  }
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

test.describe.serial('S35 Hero error-border design evidence', () => {
  test.beforeAll(async () => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    const { registrationFixture, secret, issue, checked } =
      await import('../integration/registration-links-fixture');
    const fixture = await registrationFixture();
    const issued = secret();
    checked(
      await issue(fixture, fixture.po.client, { token_hash: issued.hash }),
    );
    token = issued.token;
    await mkdir(screenshotDirectory, { recursive: true });
  });

  test('captures invalid Username across locale, theme and viewport', async ({
    page,
    context,
  }) => {
    test.skip(!local, 'Requires the selected local Supabase stack.');
    const captures: {
      filename: string;
      borderColor: string;
      inputBackground: string;
      contrast: number;
    }[] = [];
    for (const locale of ['ar', 'en'] as const) {
      const messages = getMessages(locale);
      for (const theme of ['light', 'dark'] as const) {
        for (const width of [390, 1440] as const) {
          const height = width === 1440 ? 900 : 844;
          await page.setViewportSize({ width, height });
          await context.addCookies([
            { name: LOCALE_COOKIE, value: locale, url: origin },
            { name: THEME_COOKIE, value: theme, url: origin },
          ]);
          await page.goto(`/register/${token}`);
          await page.addStyleTag({
            content: 'nextjs-portal { display: none !important; }',
          });
          await page
            .getByLabel(messages['clientSignup.name'], { exact: true })
            .fill('Heba Sami Nabil');
          await page
            .getByLabel(messages['clientSignup.dateOfBirth'], { exact: true })
            .fill('2000-01-01');
          const username = page.getByLabel(messages['clientSignup.username'], {
            exact: true,
          });
          await username.fill('ab');
          await username.press('Enter');
          await expect(username).toBeFocused();
          await expect(username).toHaveAttribute('aria-invalid', 'true');
          await expect(username).toHaveAttribute(
            'aria-describedby',
            'signup-username-error',
          );
          await expect(page.locator('#signup-username-error')).toHaveText(
            locale === 'en'
              ? 'Username must be at least 3 characters.'
              : 'اليوزرنيم لازم يكون 3 خانات على الأقل.',
          );
          await expect(
            page.locator('#signup-username-error bdi'),
          ).toHaveAttribute('dir', 'auto');
          await expect(page.locator('form [role="alert"]')).toHaveCount(0);
          const colors = await username.evaluate((input) => {
            const control = input.closest<HTMLElement>(
              '[class*="fieldControl"]',
            );
            if (!control || control.dataset.error !== 'true')
              throw new Error('Username error control surface unavailable');
            const style = getComputedStyle(control);
            return {
              border: style.borderTopColor,
              background: style.backgroundColor,
            };
          });
          const contrast = contrastRatio(colors.border, colors.background);
          expect(contrast).toBeGreaterThanOrEqual(3);
          expect(colors.border).toBe(
            theme === 'light' ? 'rgb(153, 27, 27)' : 'rgb(252, 165, 165)',
          );
          await expectHeroAxeClean(page);
          const filename = `${locale}-${theme}-${width}.png`;
          await page.screenshot({
            path: join(screenshotDirectory, filename),
            fullPage: true,
          });
          captures.push({
            filename,
            borderColor: colors.border,
            inputBackground: colors.background,
            contrast,
          });
        }
      }
    }
    const index = [
      '# S35 Hero r24 — Username error-border captures',
      '',
      'Real registration page; locally rejects the synthetic invalid-format username `ab`. The EN/AR username format copy matches S32-PO-9 Q10 and S34-PO-1 H1=A byte-for-byte. Border and input background colors are measured from the rendered control; contrast is calculated using WCAG relative luminance. Server-error clearing and submit-only availability are separately covered by the unit regression.',
      '',
      '| Locale / direction | Theme | Width | Capture | Error border | Input background | Contrast |',
      '|---|---|---:|---|---|---|---:|',
      ...captures.map(
        ({ filename, borderColor, inputBackground, contrast }) => {
          const [locale, theme, width] = filename
            .replace('.png', '')
            .split('-');
          return `| ${locale === 'ar' ? 'AR / RTL' : 'EN / LTR'} | ${theme} | ${width}px | [${filename}](./${filename}) | ${borderColor} | ${inputBackground} | ${contrast.toFixed(2)}:1 |`;
        },
      ),
      '',
      'Axe: 0 violations in each captured state.',
    ].join('\n');
    await writeFile(join(screenshotDirectory, 'INDEX.md'), index, 'utf8');
  });
});
