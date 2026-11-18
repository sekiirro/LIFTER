import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { formatRankOfTotal } from '../../lib/leaderboard/format';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from '../integration/leaderboard-fixture';
import {
  installLeaderboardSession,
  leaderboardOrigin as origin,
} from './leaderboard-session';

// T029/T030 Frontend Design Gate evidence (docs/09-frontend-design-gate.md):
// every F24 page in EN-LTR and AR-RTL, light and dark, mobile and desktop,
// with axe. Synthetic fixture data only.
const screenshotDir =
  process.env.F24_SCREENSHOT_DIR ?? join(tmpdir(), 'lifter', 'f24-leaderboard');
const matrix = (['en', 'ar'] as const).flatMap((locale) =>
  (['light', 'dark'] as const).flatMap((theme) =>
    ([390, 1440] as const).map((width) => ({
      locale,
      theme,
      width,
      height: width === 1440 ? 900 : 844,
    })),
  ),
);

let f: LeaderboardContext;
let listed: LeaderboardClient[];
const captures: string[] = [];

async function capture(
  page: Page,
  name: string,
  variant: (typeof matrix)[number],
) {
  await expect(page.locator('html')).toHaveAttribute(
    'dir',
    variant.locale === 'ar' ? 'rtl' : 'ltr',
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations, `${name} ${variant.locale}`).toEqual([]);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${name} horizontal overflow`).toBeLessThanOrEqual(
    clientWidth,
  );
  const file = `${name}-${variant.locale}-${variant.theme}-${variant.width}.png`;
  await page.screenshot({ path: join(screenshotDir, file), fullPage: true });
  captures.push(file);
}

async function forEachVariant(
  page: Page,
  run: (variant: (typeof matrix)[number]) => Promise<void>,
) {
  for (const variant of matrix) {
    await page.context().addCookies([
      { name: LOCALE_COOKIE, value: variant.locale, url: origin },
      { name: THEME_COOKIE, value: variant.theme, url: origin },
    ]);
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await run(variant);
  }
}

test.describe.serial('F24 leaderboard design-gate screenshots', () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    f = await leaderboardContext();
    listed = [];
    for (let index = 0; index < 3; index += 1)
      listed.push(await leaderboardClient(f));
    await publishAsPo(
      f,
      f.wsA.id,
      listed.map((client) => client.clientId),
    );
    // A pending successor for the PO review page.
    const pending = await f.po.client.rpc('create_leaderboard_candidate', {
      p_workspace_id: f.wsA.id,
      p_client_ids: [listed[1]!.clientId, listed[0]!.clientId],
      p_operation_key: randomUUID(),
    });
    if (pending.error || pending.data?.status !== 'created')
      throw new Error('F24 pending candidate fixture failed');
    await mkdir(screenshotDir, { recursive: true });
  });

  test('client Top 5 page', async ({ page, context }) => {
    test.setTimeout(180_000);
    await installLeaderboardSession(context, listed[0]!.client);
    await forEachVariant(page, async (variant) => {
      const m = getMessages(variant.locale);
      // S57-PO-12: the old deep link lands on the Top 5 section of Progress.
      await page.goto('/leaderboard');
      await expect(page).toHaveURL(/\/progress#leaderboard$/u);
      const section = page.locator('#leaderboard');
      await expect(
        section.getByRole('heading', {
          level: 2,
          name: m['leaderboard.title'],
        }),
      ).toBeVisible();
      for (const client of listed)
        await expect(
          section.getByText(client.username, { exact: true }),
        ).toBeVisible();
      await expect(section).not.toContainText(/score|adherence|progress/iu);
      // Private rank (S57-PO-6/-12): listed[0] is rank 1 of 3.
      await expect(
        section.getByText(m['leaderboard.yourRank'], { exact: true }),
      ).toBeVisible();
      await expect(
        section.getByText(
          formatRankOfTotal(1, 3, m['leaderboard.rankOfTotal'], variant.locale),
          { exact: true },
        ),
      ).toBeVisible();
      await capture(page, 'client-progress-top5', variant);
    });
  });

  test('client account settings (username and participation)', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await installLeaderboardSession(context, listed[2]!.client);
    await forEachVariant(page, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto('/account/settings');
      await expect(
        page.getByLabel(m['clientSignup.username'], { exact: true }),
      ).toHaveValue(listed[2]!.username);
      await expect(
        page.getByRole('heading', { name: m['leaderboard.optOut.mayAppear'] }),
      ).toBeVisible();
      await expect(
        page.getByText(m['leaderboard.optOut.mayAppearBody'], { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: m['leaderboard.optOut.turnOffParticipation'],
        }),
      ).toBeVisible();
      await capture(page, 'client-account-settings', variant);
    });
  });

  test('staff workspace Top 5 and PO review', async ({ page, context }) => {
    test.setTimeout(240_000);
    await installLeaderboardSession(context, f.po.client);
    const query = `?workspace=${encodeURIComponent(f.wsA.id)}`;
    await forEachVariant(page, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto(`/workspace-leaderboard${query}`);
      await expect(
        page.getByRole('heading', { level: 1, name: m['leaderboard.title'] }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: m['leaderboard.publish.action'] }),
      ).toBeVisible();
      await capture(page, 'staff-leaderboard', variant);

      await page.goto(`/workspace-leaderboard/review${query}`);
      await expect(
        page.getByRole('button', { name: m['leaderboard.publish.action'] }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: m['leaderboard.publish.rejectAction'],
        }),
      ).toBeVisible();
      await expect(
        page.getByText(listed[1]!.username, { exact: true }),
      ).toBeVisible();
      await capture(page, 'po-review', variant);
    });
  });

  test('staff Client Details Goals section (PO 2026-11-14)', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    await installLeaderboardSession(context, f.trainerA.client);
    const path = `/clients/${listed[0]!.clientId}`;
    await forEachVariant(page, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: m['clientGoals.title'] }),
      ).toBeVisible();
      // Fixture default goal type is Maintenance.
      await expect(
        page.getByLabel(m['clientGoals.goalType'], { exact: true }),
      ).toHaveValue('maintenance');
      await expect(
        page.getByText(m['clientGoals.nearTermGoalEmpty'], { exact: true }),
      ).toBeVisible();
      await capture(page, 'client-details-goals', variant);
    });
    const m = getMessages('en');
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await page.goto(path);
    await page
      .getByLabel(m['clientGoals.goalType'], { exact: true })
      .selectOption('fat_loss');
    await page.getByRole('button', { name: m['clientGoals.save'] }).click();
    await expect(
      page.getByRole('status').filter({ hasText: m['clientGoals.saved'] }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel(m['clientGoals.goalType'], { exact: true }),
    ).toHaveValue('fat_loss');
  });

  test.afterAll(async () => {
    if (captures.length === 0) return;
    await writeFile(
      join(screenshotDir, 'INDEX.md'),
      [
        '# F24 leaderboard Frontend Design Gate captures',
        '',
        'Synthetic fixture data. Axe (WCAG 2.2 AA tags): 0 violations and no horizontal overflow in every capture.',
        '',
        ...captures.map((file) => `- [${file}](./${file})`),
      ].join('\n'),
      'utf8',
    );
  });
});
