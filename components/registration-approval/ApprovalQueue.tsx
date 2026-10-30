import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { EmptyState } from '../ui/States';
import { StatusBadge } from './StatusBadge';
import styles from './registration-approval.module.css';

type Item = {
  client_id: string;
  name: string;
  signup_time: string;
  approval_state: string;
  offer_version_label: string;
  price_minor: string;
  currency: string;
};

export function ApprovalQueue({
  items,
  workspaceId,
  messages,
}: {
  items: Item[];
  workspaceId: string;
  messages: Messages;
}) {
  if (!items.length)
    return <EmptyState title={messages['registrationApproval.empty']} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{messages['registrationApproval.name']}</th>
            <th>{messages['registrationApproval.signupTime']}</th>
            <th>{messages['registrationApproval.offer']}</th>
            <th>{messages['registrationApproval.amount']}</th>
            <th>{messages['registrationApproval.title']}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.client_id}>
              <td>
                <a
                  href={`/registration-approvals/${item.client_id}?workspace=${encodeURIComponent(workspaceId)}`}
                >
                  {item.name}
                </a>
              </td>
              <td>
                <Bidi>{item.signup_time}</Bidi>
              </td>
              <td>{item.offer_version_label}</td>
              <td>
                <Bidi>
                  {item.price_minor} {item.currency}
                </Bidi>
              </td>
              <td>
                <StatusBadge status={item.approval_state} messages={messages} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
