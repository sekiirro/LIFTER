'use client';

import { useSyncExternalStore } from 'react';
import { ErrorState } from '../ui/States';
import { dirFor, parseLocale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import styles from './leaderboard.module.css';

/**
 * Shared F24 route error boundary. A failed read shows the existing approved
 * generic error state with a retry; no provider detail is rendered or logged.
 */
export function LeaderboardError({ reset }: { reset: () => void }) {
  const locale = useSyncExternalStore(
    () => () => {},
    () => parseLocale(document.documentElement.lang),
    () => 'ar' as const,
  );
  const m = getMessages(locale);
  return (
    <main className={styles.main} dir={dirFor(locale)} lang={locale}>
      <ErrorState
        title={m['states.error.title']}
        description={m['states.error.description']}
        onRetry={reset}
        retryLabel={m['states.retry']}
      />
    </main>
  );
}
