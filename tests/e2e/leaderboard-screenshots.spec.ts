import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import {
  formatQualifyingCount,
  formatRankLabel,
  formatRankOfTotal,
} from '../../lib/leaderboard/format';
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
let emptyClient: LeaderboardClient;

export type CaptureRecord = {
  file: string;
  violations: number;
};
const captures: CaptureRecord[] = [];

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
  captures.push({ file, violations: axe.violations.length });
}

async function forEachVariant(
  page: Page,
  identity: { client: SupabaseClient } | SupabaseClient,
  run: (variant: (typeof matrix)[number]) => Promise<void>,
) {
  const client = 'client' in identity ? identity.client : identity;
  for (const variant of matrix) {
    await page.context().addCookies([
      { name: LOCALE_COOKIE, value: variant.locale, url: origin },
      { name: THEME_COOKIE, value: variant.theme, url: origin },
    ]);
    await installLeaderboardSession(page.context(), client);
    await page.setViewportSize({
      width: variant.width,
      height: variant.height,
    });
    await run(variant);
  }
}

test.describe.serial('F24 leaderboard design-gate screenshots', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    f = await leaderboardContext();
    listed = [];
    for (let index = 0; index < 3; index += 1)
      listed.push(await leaderboardClient(f));
    await publishAsPo(
      f,
      f.wsA.id,
      listed.map((client) => client.clientId),
    );
    // Workspace B client with no published leaderboard for empty-state coverage.
    emptyClient = await leaderboardClient(f, { workspace: 'B' });

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

  test('client Top 5 page (available, private rank, fewer than 5, keyboard)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await forEachVariant(page, listed[0]!, async (variant) => {
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
      await expect(
        section.getByText(
          formatRankLabel(1, m['leaderboard.rankLabel'], variant.locale),
          { exact: true },
        ),
      ).toBeVisible();
      await expect(section).not.toContainText(/score|adherence|progress/iu);

      // Fewer than 5 qualifying note (S55-PO-10):
      await expect(
        section.getByText(
          formatQualifyingCount(
            3,
            m['leaderboard.fewerThanFive'],
            variant.locale,
          ),
          { exact: true },
        ),
      ).toBeVisible();

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

  test('client Top 5 empty state', async ({ page }) => {
    test.setTimeout(240_000);
    await forEachVariant(page, emptyClient, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto('/leaderboard');
      await expect(page).toHaveURL(/\/progress#leaderboard$/u);
      const section = page.locator('#leaderboard');
      await expect(
        section.getByRole('heading', {
          level: 2,
          name: m['leaderboard.title'],
        }),
      ).toBeVisible();
      // Approved empty-state copy (S55-PO-10):
      await expect(
        section.getByText(m['leaderboard.empty'], { exact: true }),
      ).toBeVisible();
      // Private rank is not rendered when unranked/empty
      await expect(
        section.getByText(m['leaderboard.yourRank']),
      ).not.toBeVisible();
      await capture(page, 'client-progress-empty', variant);
    });
  });

  test('client account settings (username and participation)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await forEachVariant(page, listed[2]!, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto('/account/settings');
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: m['accountSettings.title'],
        }),
      ).toBeVisible();
      const usernameInput = page.getByLabel(m['clientSignup.username'], {
        exact: true,
      });
      await expect(usernameInput).toHaveValue(listed[2]!.username);
      await expect(
        page.getByRole('heading', { name: m['leaderboard.optOut.mayAppear'] }),
      ).toBeVisible();
      await expect(
        page.getByText(m['leaderboard.optOut.mayAppearBody'], { exact: true }),
      ).toBeVisible();
      const optOutBtn = page.getByRole('button', {
        name: m['leaderboard.optOut.turnOffParticipation'],
      });
      await expect(optOutBtn).toBeVisible();

      // Keyboard navigation and visible focus path (docs/09-frontend-design-gate.md §4)
      await usernameInput.focus();
      await expect(usernameInput).toBeFocused();
      await page.keyboard.press('Tab');
      const saveBtn = page.getByRole('button', {
        name: m['clientNotes.saveChanges'],
      });
      await expect(saveBtn).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(optOutBtn).toBeFocused();

      await capture(page, 'client-account-settings', variant);
    });
  });

  test('staff workspace Top 5 and PO review', async ({ page }) => {
    test.setTimeout(300_000);
    const query = `?workspace=${encodeURIComponent(f.wsA.id)}`;
    await forEachVariant(page, f.po.client, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto(`/workspace-leaderboard${query}`);
      await expect(
        page.getByRole('heading', { level: 1, name: m['leaderboard.title'] }),
      ).toBeVisible();
      const reviewLink = page.getByRole('link', {
        name: m['leaderboard.publish.action'],
      });
      await expect(reviewLink).toBeVisible();
      // Keyboard focus path on action link
      await reviewLink.focus();
      await expect(reviewLink).toBeFocused();
      await capture(page, 'staff-leaderboard', variant);

      await page.goto(`/workspace-leaderboard/review${query}`);
      const approveBtn = page.getByRole('button', {
        name: m['leaderboard.publish.action'],
      });
      const rejectBtn = page.getByRole('button', {
        name: m['leaderboard.publish.rejectAction'],
      });
      await expect(approveBtn).toBeVisible();
      await expect(rejectBtn).toBeVisible();
      await expect(
        page.getByText(listed[1]!.username, { exact: true }),
      ).toBeVisible();

      // Keyboard focus navigation between approve and reject buttons
      await approveBtn.focus();
      await expect(approveBtn).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(rejectBtn).toBeFocused();

      await capture(page, 'po-review', variant);
    });
  });

  test('staff workspace empty state and PO review empty candidate', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const query = `?workspace=${encodeURIComponent(f.wsB.id)}`;
    await forEachVariant(page, f.po.client, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto(`/workspace-leaderboard${query}`);
      await expect(
        page.getByRole('heading', { level: 1, name: m['leaderboard.title'] }),
      ).toBeVisible();
      await expect(
        page.getByText(m['leaderboard.empty'], { exact: true }),
      ).toBeVisible();
      await capture(page, 'staff-leaderboard-empty', variant);

      await page.goto(`/workspace-leaderboard/review${query}`);
      await expect(
        page.getByText(m['leaderboard.empty'], { exact: true }),
      ).toBeVisible();
      const generateBtn = page.getByRole('button', {
        name: m['leaderboard.publish.generateAction'],
      });
      await expect(generateBtn).toBeVisible();
      await generateBtn.focus();
      await expect(generateBtn).toBeFocused();
      await capture(page, 'po-review-empty', variant);
    });
  });

  test('staff Client Details Goals section (PO 2026-11-14)', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const path = `/clients/${listed[0]!.clientId}`;
    await forEachVariant(page, f.trainerA.client, async (variant) => {
      const m = getMessages(variant.locale);
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: m['clientGoals.title'] }),
      ).toBeVisible();
      const goalSelect = page.getByLabel(m['clientGoals.goalType'], {
        exact: true,
      });
      // Fixture default goal type is Maintenance.
      await expect(goalSelect).toHaveValue('maintenance');
      await expect(
        page.getByText(m['clientGoals.nearTermGoalEmpty'], { exact: true }),
      ).toBeVisible();

      // Keyboard focus on select and tab to save button
      await goalSelect.focus();
      await expect(goalSelect).toBeFocused();
      await page.keyboard.press('Tab');
      const saveGoalBtn = page.getByRole('button', {
        name: m['clientGoals.save'],
      });
      await expect(saveGoalBtn).toBeFocused();

      await capture(page, 'client-details-goals', variant);
    });
    const m = getMessages('en');
    await context.addCookies([
      { name: LOCALE_COOKIE, value: 'en', url: origin },
    ]);
    await installLeaderboardSession(context, f.trainerA.client);
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
        ...captures.map(
          (c) => `- [${c.file}](./${c.file}) - axe violations: ${c.violations}`,
        ),
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(screenshotDir, 'manifest.json'),
      JSON.stringify(captures, null, 2),
      'utf8',
    );
  });
});
