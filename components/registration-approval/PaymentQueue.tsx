import type { Messages } from '../../lib/i18n';
import type { WorkspacePaymentQueueItem } from '../../lib/registration-approval/read';
import { Bidi } from '../ui/Bidi';
import { EmptyState } from '../ui/States';
import { StatusBadge } from './StatusBadge';
import styles from './registration-approval.module.css';
import { formatMinorUnits } from '../../lib/registration-approval/money';

export function PaymentQueue({
  items,
  workspaceId,
  messages,
}: {
  items: WorkspacePaymentQueueItem[];
  workspaceId: string;
  messages: Messages;
}) {
  if (!items.length)
    return <EmptyState title={messages['registrationApproval.paymentEmpty']} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{messages['registrationApproval.name']}</th>
            <th>{messages['registrationApproval.title']}</th>
            <th>{messages['registrationApproval.amount']}</th>
            <th>{messages['registrationApproval.unpaid']}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.subscription_id}>
              <td>
                <a
                  href={`/payments/${item.subscription_id}?workspace=${encodeURIComponent(workspaceId)}&client=${encodeURIComponent(item.client_id)}`}
                >
                  {item.name}
                </a>
              </td>
              <td>
                <StatusBadge status={item.approval_state} messages={messages} />
              </td>
              <td>
                <Bidi>
                  {item.price_minor} {item.currency}
                </Bidi>
              </td>
              <td>
                {item.unpaid_by_currency.map((amount) => (
                  <div key={amount.currency}>
                    <Bidi>
                      {formatMinorUnits(amount.unpaid_minor)} {amount.currency}
                    </Bidi>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
