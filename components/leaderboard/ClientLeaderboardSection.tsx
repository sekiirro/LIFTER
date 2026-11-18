import { getActor } from '../../lib/auth/actor';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import {
  readClientLeaderboard,
  readClientMyRank,
} from '../../lib/leaderboard/service';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/States';
import { LeaderboardList } from './LeaderboardList';
import { MyRank } from './MyRank';
import styles from './leaderboard.module.css';

export const LEADERBOARD_SECTION_ID = 'leaderboard';

/**
 * F24 Top 5 section of the client Progress page (S57-PO-12: "Top 5 belongs
 * inside Progress, not Main Navigation"). Shows the caller's private rank
 * (own rank and total only) and the public Top 5 derived from the approved
 * full ranking. Renders nothing for a non-client session; a failed read
 * shows the approved generic error inside the section only, so the rest of
 * the Progress page is unaffected.
 */
export async function ClientLeaderboardSection({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  const actor = await getActor();
  const [view, myRank] = await Promise.all([
    readClientLeaderboard(actor),
    readClientMyRank(actor),
  ]);
  if (view.status === 'not_permitted') return null;
  const titleId = `${LEADERBOARD_SECTION_ID}-title`;
  return (
    <Card
      as="section"
      id={LEADERBOARD_SECTION_ID}
      className={styles.section}
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{messages['leaderboard.title']}</h2>
      <MyRank
        view={myRank}
        label={messages['leaderboard.yourRank']}
        template={messages['leaderboard.rankOfTotal']}
        locale={locale}
      />
      {view.status === 'available' ? (
        <LeaderboardList
          periodMonth={view.periodMonth}
          entries={view.entries}
          locale={locale}
          messages={messages}
        />
      ) : view.status === 'empty' ? (
        <EmptyState title={messages['leaderboard.empty']} />
      ) : (
        <p role="alert">{messages['states.error.description']}</p>
      )}
    </Card>
  );
}
