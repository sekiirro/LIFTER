'use client';
import { useSyncExternalStore } from 'react';
import { ErrorState } from '../../../components/ui/States';
import { getMessages } from '../../../lib/i18n';
import { parseLocale } from '../../../lib/design/preferences';
import styles from './packages.module.css';
const subscribe = () => () => {};
export default function PackagesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useSyncExternalStore(
    subscribe,
    () => parseLocale(document.documentElement.lang),
    () => 'ar' as const,
  );
  const m = getMessages(locale);
  return (
    <main className={styles.main}>
      <h1>{m['packages.title']}</h1>
      <ErrorState
        title={m['packages.unavailable']}
        retryLabel={m['packages.retry']}
        onRetry={reset}
      />
    </main>
  );
}
