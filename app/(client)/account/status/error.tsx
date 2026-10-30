'use client';

import { useSyncExternalStore } from 'react';
import { ErrorState } from '../../../../components/ui/States';
import { getMessages } from '../../../../lib/i18n';
import { parseLocale } from '../../../../lib/design/preferences';
import styles from '../../../login/login.module.css';

export default function ClientRegistrationStatusError({
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
  const messages = getMessages(locale);
  return (
    <main className={styles.main}>
      <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <ErrorState
          title={messages['registrationApproval.unavailable']}
          onRetry={reset}
          retryLabel={messages['registrationApproval.retry']}
        />
      </div>
    </main>
  );
}
