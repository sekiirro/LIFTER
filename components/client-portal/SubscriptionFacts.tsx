import {
  lastCoveredDay,
  subscriptionStatusLabelKey,
  type SubscriptionSummary,
} from '../../lib/client-access/portal-projection';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { formatCalendarDate } from './format';
import styles from './client-portal.module.css';

/**
 * F13 subscription status (S57-PO-12 labels; Refunded only for a full
 * refund) and the end date as the last covered day (S57-PO-5). F13 remains
 * the authority for both.
 */
export function SubscriptionFacts({
  subscription,
  locale,
  messages: m,
}: {
  subscription: SubscriptionSummary;
  locale: Locale;
  messages: Messages;
}) {
  const statusKey = subscriptionStatusLabelKey(subscription);
  let lastDay: string | null = null;
  if (subscription.effectiveEndExclusive) {
    try {
      lastDay = lastCoveredDay(subscription.effectiveEndExclusive);
    } catch {
      lastDay = null;
    }
  }
  if (!statusKey && !lastDay) return null;
  return (
    <dl className={styles.facts} data-testid="client-portal-subscription">
      {statusKey && (
        <>
          <dt>{m['client.portal.subscriptionStatus']}</dt>
          <dd data-testid="client-portal-subscription-status">
            {m[statusKey]}
          </dd>
        </>
      )}
      {lastDay && (
        <>
          <dt>{m['client.portal.subscriptionEndDate']}</dt>
          <dd>
            <time dateTime={lastDay}>
              <Bidi>{formatCalendarDate(lastDay, locale)}</Bidi>
            </time>
          </dd>
        </>
      )}
    </dl>
  );
}
