import type { Locale } from '../../lib/design/preferences';
import { formatMyRank } from '../../lib/leaderboard/format';
import type { MyRankView } from '../../lib/leaderboard/projection';
import { Card } from '../ui/Card';

/**
 * The caller's private rank and the participant total of the current
 * approved ranking (PO 2026-11-14). Renders nothing unless the client is
 * ranked; it never shows any other client's rank.
 */
export function MyRank({
  view,
  template,
  locale,
}: {
  view: MyRankView;
  template: string;
  locale: Locale;
}) {
  if (view.status !== 'ranked') return null;
  return (
    <Card
      as="section"
      aria-label={formatMyRank(view.rank, view.total, template, locale)}
    >
      <p>{formatMyRank(view.rank, view.total, template, locale)}</p>
    </Card>
  );
}
