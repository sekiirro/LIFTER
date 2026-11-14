import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MyRank } from '../../components/leaderboard/MyRank';
import { getMessages } from '../../lib/i18n';
import { formatMyRank } from '../../lib/leaderboard/format';
import {
  MAX_RANKED_ENTRIES,
  toLeaderboardView,
  toMyRankView,
  toPendingCandidateView,
} from '../../lib/leaderboard/projection';

// PO 2026-11-14: full ranking, public Top 5, private rank and total.
const entries = (n: number) =>
  Array.from({ length: n }, (_, index) => ({
    rank: index + 1,
    username: `user_${index + 1}`,
  }));

describe('private rank projection', () => {
  it('copies only status, month, own rank and total', () => {
    expect(
      toMyRankView({
        status: 'ranked',
        period_month: '2026-11-01',
        rank: 7,
        total: 12,
        username: 'someone_else',
        client_id: '22222222-2222-4222-8222-222222222222',
        others: [{ rank: 1 }],
      }),
    ).toEqual({
      status: 'ranked',
      periodMonth: '2026-11-01',
      rank: 7,
      total: 12,
    });
    for (const status of ['none', 'not_ranked', 'not_permitted'] as const)
      expect(toMyRankView({ status })).toEqual({ status });
  });

  it('fails closed on malformed ranks and totals', () => {
    for (const bad of [
      null,
      { status: 'ranked', period_month: '2026-11-01', rank: 0, total: 3 },
      { status: 'ranked', period_month: '2026-11-01', rank: 4, total: 3 },
      { status: 'ranked', period_month: '2026-11-01', rank: 1.5, total: 3 },
      { status: 'ranked', period_month: '2026-11-15', rank: 1, total: 3 },
      {
        status: 'ranked',
        period_month: '2026-11-01',
        rank: 1,
        total: MAX_RANKED_ENTRIES + 1,
      },
      { status: 'other' },
    ])
      expect(toMyRankView(bad)).toEqual({ status: 'unavailable' });
  });

  it('renders the proposed copy with locale digits, and nothing unless ranked', () => {
    const en = getMessages('en');
    const ar = getMessages('ar');
    expect(formatMyRank(7, 12, en['leaderboard.myRank'], 'en')).toBe(
      'Your rank this month: 7 of 12',
    );
    expect(formatMyRank(7, 12, ar['leaderboard.myRank'], 'ar')).toBe(
      'ترتيبك الشهر ده: ٧ من ١٢',
    );
    const html = renderToStaticMarkup(
      createElement(MyRank, {
        view: {
          status: 'ranked',
          periodMonth: '2026-11-01',
          rank: 7,
          total: 12,
        },
        template: en['leaderboard.myRank'],
        locale: 'en',
      }),
    );
    expect(html).toContain('Your rank this month: 7 of 12');
    for (const status of [
      'none',
      'not_ranked',
      'not_permitted',
      'unavailable',
    ] as const)
      expect(
        renderToStaticMarkup(
          createElement(MyRank, {
            view: { status },
            template: en['leaderboard.myRank'],
            locale: 'en',
          }),
        ),
      ).toBe('');
  });
});

describe('public Top 5 vs full PO review', () => {
  it('keeps the public view at five entries at most (fails closed otherwise)', () => {
    expect(
      toLeaderboardView({
        status: 'available',
        period_month: '2026-11-01',
        entries: entries(5),
      }),
    ).toMatchObject({ status: 'available' });
    expect(
      toLeaderboardView({
        status: 'available',
        period_month: '2026-11-01',
        entries: entries(6),
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('lets the PO review the full ranking', () => {
    const view = toPendingCandidateView({
      status: 'pending',
      publication_id: '11111111-1111-4111-8111-111111111111',
      period_month: '2026-11-01',
      entries: entries(12),
    });
    expect(view).toMatchObject({ status: 'pending' });
    expect(view.status === 'pending' && view.entries).toHaveLength(12);
  });
});
