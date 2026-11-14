import { expect, test } from '@playwright/test';
import { LOCALE_COOKIE, THEME_COOKIE } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { formatMyRank } from '../../lib/leaderboard/format';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
} from '../integration/leaderboard-fixture';
import {
  installLeaderboardSession,
  leaderboardOrigin as origin,
} from './leaderboard-session';

// T011 [FR-005, FR-007-FR-009, FR-013, FR-025]: the account-settings notice
// and the direct opt-out remove a listed client immediately, with no PO
// action. Synthetic fixture data only.
let leaving: LeaderboardClient;
let staying: LeaderboardClient;

test.describe.serial('F24 direct opt-out from account settings', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const f = await leaderboardContext();
    leaving = await leaderboardClient(f);
    staying = await leaderboardClient(f);
    await publishAsPo(f, f.wsA.id, [leaving.clientId, staying.clientId]);
  });

  for (const locale of ['en', 'ar'] as const)
    test(`${locale}: notice, opt-out and immediate removal`, async ({
      page,
      context,
    }) => {
      const m = getMessages(locale);
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: origin },
        { name: THEME_COOKIE, value: 'light', url: origin },
      ]);
      // Each locale opts out a different client; the second run uses `staying`.
      const actor = locale === 'en' ? leaving : staying;
      await installLeaderboardSession(context, actor.client);

      await page.goto('/leaderboard');
      await expect(
        page.getByText(actor.username, { exact: true }),
      ).toBeVisible();

      await page.goto('/account/settings');
      await expect(
        page.getByRole('heading', { name: m['leaderboard.optOut.mayAppear'] }),
      ).toBeVisible();
      await expect(
        page.getByText(m['leaderboard.optOut.mayAppearBody'], { exact: true }),
      ).toBeVisible();
      const button = page.getByRole('button', {
        name: m['leaderboard.optOut.turnOffParticipation'],
      });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('status').filter({
          hasText: m['leaderboard.optOut.success'],
        }),
      ).toBeVisible();

      await page.reload();
      await expect(
        page.getByText(m['leaderboard.optedOut'], { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: m['leaderboard.optOut.turnOffParticipation'],
        }),
      ).toHaveCount(0);

      // Removed from the currently approved list immediately (FR-008).
      await page.goto('/leaderboard');
      await expect(page.getByText(actor.username, { exact: true })).toHaveCount(
        0,
      );
      // PO 2026-11-14: the opted-out client keeps their private rank; the
      // total still counts every ranked client.
      await expect(
        page.getByText(
          formatMyRank(
            locale === 'en' ? 1 : 2,
            2,
            m['leaderboard.myRank'],
            locale,
          ),
          { exact: true },
        ),
      ).toBeVisible();
    });
});
