'use client';

import { useSyncExternalStore } from 'react';
import { ErrorState } from '../../../../components/ui/States';
import { dirFor, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import styles from './ClientDetailsTabs.module.css';

export default function ClientDetailsError({
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
