import type { Messages } from '../../lib/i18n';
import styles from './registration-approval.module.css';

export function StatusBadge({
  status,
  messages,
}: {
  status: string;
  messages: Messages;
}) {
  const normalized = status === 'pending-approval' ? 'pending' : status;
  const key = `registrationApproval.${normalized}` as keyof Messages;
  const label = messages[key] ?? messages['registrationApproval.unavailable'];
  return (
    <span
      className={`${styles.badge} ${styles[normalized] ?? ''}`}
      data-status={status}
    >
      {label}
    </span>
  );
}
