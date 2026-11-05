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
  process.env.HERO_R22_USERNAME_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter-s34-hero-r22');
const local = Boolean(
  process.env.DB_URL || process.env.SUPABASE_DB_URL || process.env.API_URL,
);
let token: string;

test.describe.serial('r22 username error-state design evidence', () => {
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
    const captures: string[] = [];
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
              ? 'Use 3–30 characters: English letters, numbers, periods, or underscores.'
              : 'استخدم من 3 لـ30 حرف: حروف إنجليزي أو أرقام أو نقطة أو شرطة سفلية.',
          );
          await expect(
            page.locator('#signup-username-error bdi'),
          ).toHaveAttribute('dir', 'auto');
          await expect(page.locator('form [role="alert"]')).toHaveCount(0);
          await expectHeroAxeClean(page);
          const filename = `${locale}-${theme}-${width}.png`;
          await page.screenshot({
            path: join(screenshotDirectory, filename),
            fullPage: true,
          });
          captures.push(filename);
        }
      }
    }
    const index = [
      '# S34 Hero r22 — Username error-state captures',
      '',
      'Real registration page; locally rejects the synthetic invalid-format username `ab`. The EN/AR username format copy matches S32-PO-9 Q10 and S34-PO-1 H1=A byte-for-byte. Server-error clearing and submit-only availability are separately covered by the unit regression.',
      '',
      '| Locale / direction | Theme | Width | Capture |',
      '|---|---|---:|---|',
      ...captures.map((filename) => {
        const [locale, theme, width] = filename.replace('.png', '').split('-');
        return `| ${locale === 'ar' ? 'AR / RTL' : 'EN / LTR'} | ${theme} | ${width}px | [${filename}](./${filename}) |`;
      }),
      '',
      'Axe: 0 violations in each captured state.',
    ].join('\n');
    await writeFile(join(screenshotDirectory, 'INDEX.md'), index, 'utf8');
  });
});
