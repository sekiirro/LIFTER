import type { Locale } from '../../lib/design/preferences';
import { formatRankOfTotal } from '../../lib/leaderboard/format';
import type { MyRankView } from '../../lib/leaderboard/projection';
import styles from './leaderboard.module.css';

/**
 * The caller's private rank and the participant total of the current
 * approved ranking (S57-PO-6, S57-PO-12): label "Your rank", value
 * "Rank {rank} of {total}". Renders nothing unless the client is ranked; it
 * never shows any other client's rank.
 */
export function MyRank({
  view,
  label,
  template,
  locale,
}: {
  view: MyRankView;
  label: string;
  template: string;
  locale: Locale;
}) {
  if (view.status !== 'ranked') return null;
  return (
    <dl className={styles.myRank}>
      <dt>{label}</dt>
      <dd>{formatRankOfTotal(view.rank, view.total, template, locale)}</dd>
    </dl>
  );
}
