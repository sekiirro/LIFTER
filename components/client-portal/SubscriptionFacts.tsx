import {
  lastCoveredDay,
  type SubscriptionSummary,
} from '../../lib/client-access/portal-projection';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { formatCalendarDate } from './format';
import styles from './client-portal.module.css';

/**
 * F13 end date shown as the last covered day (PO-2, 2026-11-14). The status
 * value is not rendered until its labels are approved (PO-1); F13 remains the
 * authority.
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
  if (!subscription.effectiveEndExclusive) return null;
  let lastDay: string;
  try {
    lastDay = lastCoveredDay(subscription.effectiveEndExclusive);
  } catch {
    return null;
  }
  return (
    <dl className={styles.facts} data-testid="client-portal-subscription">
      <dt>{m['client.portal.subscriptionEndDate']}</dt>
      <dd>
        <time dateTime={lastDay}>
          <Bidi>{formatCalendarDate(lastDay, locale)}</Bidi>
        </time>
      </dd>
    </dl>
  );
}
