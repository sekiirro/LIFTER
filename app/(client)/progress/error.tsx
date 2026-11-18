'use client';

import { useSyncExternalStore } from 'react';
import { ErrorState } from '../../../components/ui/States';
import styles from '../../../components/progress-coaching/ProgressView.module.css';
import { dirFor, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';

export default function ClientProgressError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useSyncExternalStore(
    () => () => {},
    () => parseLocale(document.documentElement.lang),
    () => 'ar' as const,
  );
  const m = getMessages(locale);
  return (
    <main className={styles.page} dir={dirFor(locale)} lang={locale}>
      <ErrorState
        title={m['states.error.title']}
        description={m['states.error.description']}
        onRetry={reset}
        retryLabel={m['states.retry']}
      />
    </main>
  );
}
