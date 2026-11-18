import Link from 'next/link';
import type { Messages } from '../../lib/i18n';
import { Card } from '../ui/Card';
import styles from './leaderboard.module.css';

/**
 * F24 FR-005: the once-only dashboard notice. Approved copy only
 * (`leaderboard.optOut.mayAppear*`, `accountSettings.title`); the notice stays
 * available in account settings.
 */
export function LeaderboardDashboardNotice({
  messages: m,
}: {
  messages: Messages;
}) {
  return (
    <Card
      as="section"
      className={styles.section}
      aria-labelledby="leaderboard-dashboard-notice"
      data-testid="leaderboard-dashboard-notice"
    >
      <h2 id="leaderboard-dashboard-notice">
        {m['leaderboard.optOut.mayAppear']}
      </h2>
      <p>{m['leaderboard.optOut.mayAppearBody']}</p>
      <Link href="/account/settings">{m['accountSettings.title']}</Link>
    </Card>
  );
}
