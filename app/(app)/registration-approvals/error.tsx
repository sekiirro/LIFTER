'use client';

import { useSyncExternalStore } from 'react';
import { getMessages } from '../../../lib/i18n';
import { parseLocale } from '../../../lib/design/preferences';
import { ErrorState } from '../../../components/ui/States';
import styles from '../packages/packages.module.css';

export default function RegistrationApprovalsError({
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
    <main className={styles.main}>
      <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ErrorState
          title={m['registrationApproval.unavailable']}
          onRetry={reset}
          retryLabel={m['registrationApproval.retry']}
        />
      </div>
    </main>
  );
}
