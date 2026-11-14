import type { SubscriptionSummary } from '../../lib/client-access/portal-projection';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { formatCalendarDate } from './format';
import styles from './client-portal.module.css';

/**
 * F13 end date only. The status value is not rendered until its labels are
 * approved (PO-DECISION-NEEDED in the F22 PR); F13 remains the authority.
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
  return (
    <dl className={styles.facts} data-testid="client-portal-subscription">
      <dt>{m['client.portal.subscriptionEndDate']}</dt>
      <dd>
        <time dateTime={subscription.effectiveEndExclusive}>
          <Bidi>
            {formatCalendarDate(subscription.effectiveEndExclusive, locale)}
          </Bidi>
        </time>
      </dd>
    </dl>
  );
}
