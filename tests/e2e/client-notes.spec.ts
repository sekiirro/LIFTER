import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import {
  clientNotesFixture,
  type ClientNotesFixture,
} from '../integration/client-notes-fixture';

const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
).origin;
const screenshotDir =
  process.env.F20_SCREENSHOT_DIR ??
  join(tmpdir(), 'lifter', 's49-luna-f20-page', 'client-notes');
let fixture: ClientNotesFixture;

async function installSession(
  context: BrowserContext,
  identity: ClientNotesFixture['context']['trainerA'],
) {
  const { loadEnv } = await import('../integration/harness');
  const env = loadEnv();
  const { data } = await identity.client.auth.getSession();
  if (!data.session) throw new Error('fixture session missing');
  const { createServerClient } = await import('@supabase/ssr');
  const collected: Array<{
    name: string;
    value: string;
    options?: {
      expires?: number | string | Date;
      maxAge?: number;
      httpOnly?: boolean;
      sameSite?: boolean | 'lax' | 'strict' | 'none';
    };
  }> = [];
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        collected.push(...values);
      },
    },
  });
  const result = await client.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error) throw new Error('could not install fixture session');
  if (collected.length === 0)
    throw new Error('fixture session cookies missing');
  await context.clearCookies({ name: /^sb-/ });
  const now = Math.floor(Date.now() / 1000);
  await context.addCookies(
    collected.map((cookie) => {
      const expiresOption = cookie.options?.expires;
      const parsedExpiry =
        expiresOption instanceof Date
          ? Math.floor(expiresOption.getTime() / 1000)
          : typeof expiresOption === 'number'
            ? Math.floor(expiresOption)
            : typeof expiresOption === 'string'
              ? Math.floor(Date.parse(expiresOption) / 1000)
              : undefined;
      const expires =
        parsedExpiry !== undefined && Number.isFinite(parsedExpiry)
          ? parsedExpiry
          : typeof cookie.options?.maxAge === 'number'
            ? now + Math.floor(cookie.options.maxAge)
            : now + 3600;
      const sameSiteOption = cookie.options?.sameSite;
      const sameSite =
        sameSiteOption === 'strict'
          ? ('Strict' as const)
          : sameSiteOption === 'none'
            ? ('None' as const)
            : sameSiteOption === 'lax'
              ? ('Lax' as const)
              : undefined;
      return {
        name: cookie.name,
        value: cookie.value,
        url: origin,
        ...(cookie.options?.httpOnly !== undefined
          ? { httpOnly: cookie.options.httpOnly }
          : {}),
        ...(sameSite ? { sameSite } : {}),
        expires,
      };
    }),
  );
  const installedCookieMetadata = await context.cookies(origin);
  console.log(
    'Installed cookie metadata:',
    installedCookieMetadata.map(({ name, domain, path, expires, value }) => ({
      name,
      domain,
      path,
      expires,
      valueLength: value.length,
    })),
  );
}

test.describe('staff Client Details Notes tab on Stack D', () => {
  test.beforeAll(async () => {
    fixture = await clientNotesFixture();
    await mkdir(screenshotDir, { recursive: true });
  });

  test.afterAll(async () => {
    await fixture?.close();
  });

  test('renders the one functional tab across locale, theme, and viewport matrix', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.context.trainerA);
    const cases = [
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'light',
        width: 390,
        height: 844,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'light',
        width: 1440,
        height: 900,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'dark',
        width: 390,
        height: 844,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'dark',
        width: 1440,
        height: 900,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'light',
        width: 390,
        height: 844,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'light',
        width: 1440,
        height: 900,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'dark',
        width: 390,
        height: 844,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'dark',
        width: 1440,
        height: 900,
      },
    ] as const;

    for (const variant of cases) {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: variant.locale, url: origin },
        { name: THEME_COOKIE, value: variant.theme, url: origin },
      ]);
      await page.setViewportSize({
        width: variant.width,
        height: variant.height,
      });
      await page.goto(`/clients/${fixture.clientId}`);
      const messages = getMessages(variant.locale);
      await expect(page.locator('main')).toHaveAttribute(
        'dir',
        variant.direction,
      );
      await expect(page.getByRole('tablist')).toHaveCount(1);
      const tablist = page.getByRole('tablist', {
        name: messages['clientNotes.tab'],
      });
      const tab = page.getByRole('tab', { name: messages['clientNotes.tab'] });
      await expect(tab).toHaveCount(1);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(
        await tab.evaluate(
          (element) => getComputedStyle(element.parentElement!).display,
        ),
      ).toBe('flex');
      expect(
        await tab.evaluate(
          (element) => getComputedStyle(element.parentElement!).flexDirection,
        ),
      ).toBe('row');
      expect(await tab.locator('svg').count()).toBe(0);
      await expect(tablist).toHaveAttribute(
        'aria-label',
        messages['clientNotes.tab'],
      );
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await expect(page.getByRole('tabpanel')).toHaveAttribute(
        'aria-labelledby',
        'client-notes-tab',
      );
      await expect(page.getByText(messages['clientNotes.empty'])).toBeVisible();
      await expect(
        page.getByText(messages['clientNotes.create']),
      ).toBeVisible();

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        axe.violations.filter((violation) =>
          ['critical', 'serious'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);

      const name = `${variant.locale}-${variant.theme}-${variant.width}`;
      await page.screenshot({
        path: join(screenshotDir, `${name}.png`),
        fullPage: true,
      });
    }

    const tab = page.getByRole('tab');
    const panel = page.getByRole('tabpanel');
    await tab.focus();
    await expect(tab).toBeFocused();
    expect(
      await tab.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).toBe('solid');
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await panel.evaluate(
        (element) =>
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
      ),
    ).toBe(0);
  });

  test('creates a note through the UI and reloads its persisted body', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.context.trainerA);
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
      { name: THEME_COOKIE, value: 'light', url: origin },
    ]);
    await page.goto(`/clients/${fixture.clientId}`);
    const body = `F20 persisted note ${Date.now()}`;
    await page
      .getByRole('textbox', {
        name: getMessages('en')['clientNotes.noteLabel'],
      })
      .fill(body);
    await page
      .getByRole('button', { name: getMessages('en')['clientNotes.saveNote'] })
      .click();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(body, { exact: true })).toBeVisible();
  });

  test('renders the signed-in sign-out control accessibly across locale and theme variants', async ({
    page,
    context,
  }) => {
    await installSession(context, fixture.context.trainerA);
    const cases = [
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'light',
        width: 390,
        height: 844,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'light',
        width: 1440,
        height: 900,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'dark',
        width: 390,
        height: 844,
      },
      {
        locale: 'en',
        direction: 'ltr',
        theme: 'dark',
        width: 1440,
        height: 900,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'light',
        width: 390,
        height: 844,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'light',
        width: 1440,
        height: 900,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'dark',
        width: 390,
        height: 844,
      },
      {
        locale: 'ar',
        direction: 'rtl',
        theme: 'dark',
        width: 1440,
        height: 900,
      },
    ] as const;

    for (const variant of cases) {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: variant.locale, url: origin },
        { name: THEME_COOKIE, value: variant.theme, url: origin },
      ]);
      await page.setViewportSize({
        width: variant.width,
        height: variant.height,
      });
      await page.goto('/');
      const messages = getMessages(variant.locale);
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        variant.direction,
      );
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        variant.locale,
      );
      await expect(
        page.getByRole('button', { name: messages['auth.signOut'] }),
      ).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        axe.violations.filter((violation) =>
          ['critical', 'serious'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      await page.screenshot({
        path: join(
          screenshotDir,
          `signout-${variant.locale}-${variant.theme}-${variant.width}.png`,
        ),
        fullPage: true,
      });
    }
  });
});
