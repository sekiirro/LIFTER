import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { EmptyState } from '../ui/States';
import styles from './registration-approval.module.css';

type Item = {
  client_id: string;
  subscription_id: string;
  name: string;
  approval_state: string;
  price_minor: string;
  currency: string;
  unpaid_minor: string;
};

export function PaymentQueue({
  items,
  workspaceId,
  messages,
}: {
  items: Item[];
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
                <Bidi>{item.approval_state}</Bidi>
              </td>
              <td>
                <Bidi>
                  {item.price_minor} {item.currency}
                </Bidi>
              </td>
              <td>
                <Bidi>
                  {item.unpaid_minor} {item.currency}
                </Bidi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
