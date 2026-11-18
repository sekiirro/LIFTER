import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeaderboardDashboardNotice } from '../../components/leaderboard/DashboardNotice';
import { getMessages } from '../../lib/i18n';
import { toDashboardNoticeStatus } from '../../lib/leaderboard/projection';

// T011 [FR-005, FR-013]: once-only dashboard notice, approved copy only.
describe('F24 once-only dashboard notice', () => {
  it('renders the approved title, body and the account-settings link (EN)', () => {
    const m = getMessages('en');
    const html = renderToStaticMarkup(
      createElement(LeaderboardDashboardNotice, { messages: m }),
    );
    expect(html).toContain('You may appear in the Top 5');
    expect(html).toContain(m['leaderboard.optOut.mayAppearBody']);
    expect(html).toContain('href="/account/settings"');
    expect(html).toContain('Account settings');
    expect(html).toContain('data-testid="leaderboard-dashboard-notice"');
  });

  it('renders the approved Egyptian Arabic copy', () => {
    const m = getMessages('ar');
    const html = renderToStaticMarkup(
      createElement(LeaderboardDashboardNotice, { messages: m }),
    );
    expect(html).toContain(m['leaderboard.optOut.mayAppear']);
    expect(html).toContain(m['leaderboard.optOut.mayAppearBody']);
    expect(html).toContain(m['accountSettings.title']);
  });

  it('maps only the three known RPC statuses, anything else is unavailable', () => {
    expect(toDashboardNoticeStatus({ status: 'first_view' })).toBe(
      'first_view',
    );
    expect(toDashboardNoticeStatus({ status: 'not_shown' })).toBe('not_shown');
    expect(toDashboardNoticeStatus({ status: 'not_permitted' })).toBe(
      'not_permitted',
    );
    for (const bad of [null, undefined, [], 'first_view', { status: 'x' }])
      expect(toDashboardNoticeStatus(bad)).toBe('unavailable');
  });
});
