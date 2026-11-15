import { dirFor, type Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Card } from '../ui/Card';
import styles from './SubscriptionExpiredNotice.module.css';

/**
 * Informational-only subscription expiry notice (F19-FR-011 / S42-PO-6).
 * Renders the approved bilingual title and body with zero interactive actions.
 */
export function SubscriptionExpiredNotice({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}) {
  return (
    <Card
      as="section"
      aria-labelledby="subscription-expired-title"
      dir={dirFor(locale)}
      lang={locale}
      className={styles.card}
    >
      <h1 id="subscription-expired-title" className={styles.title}>
        {messages['plans.expiredTitle']}
      </h1>
      <p className={styles.body}>{messages['plans.expiredBody']}</p>
    </Card>
  );
}
