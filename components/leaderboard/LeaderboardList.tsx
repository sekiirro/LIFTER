import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import {
  formatQualifyingCount,
  formatRankLabel,
  formatResultsMonth,
} from '../../lib/leaderboard/format';
import type { LeaderboardEntryView } from '../../lib/leaderboard/projection';
import { Bidi } from '../ui/Bidi';
import { Card } from '../ui/Card';
import styles from './leaderboard.module.css';

/** Renders only the rank/username allow-list; scores are never available here. */
export function LeaderboardList({
  periodMonth,
  entries,
  locale,
  messages,
}: {
  periodMonth: string;
  entries: readonly LeaderboardEntryView[];
  locale: Locale;
  messages: Messages;
}) {
  return (
    <Card as="section" aria-labelledby="leaderboard-month">
      <p id="leaderboard-month" className={styles.month}>
        {formatResultsMonth(
          periodMonth,
          messages['leaderboard.resultsMonthLabel'],
          locale,
        )}
      </p>
      <ol className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.rank} className={styles.entry}>
            <span className={styles.rank}>
              {formatRankLabel(
                entry.rank,
                messages['leaderboard.rankLabel'],
                locale,
              )}
            </span>
            <span className={styles.username}>
              <Bidi dir="ltr">{entry.username}</Bidi>
            </span>
          </li>
        ))}
      </ol>
      {entries.length < 5 && (
        <p className={styles.note}>
          {formatQualifyingCount(
            entries.length,
            messages['leaderboard.fewerThanFive'],
            locale,
          )}
        </p>
      )}
    </Card>
  );
}
