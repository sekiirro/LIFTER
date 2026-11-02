'use client';

import { useState } from 'react';
import type { Messages } from '../../lib/i18n';
import { Button } from '../ui/Button';
import { Bidi } from '../ui/Bidi';
import styles from './registration-approval.module.css';

export function PaymentConfirmation({
  amountMinor,
  currency,
  requestKey,
  onConfirm,
  submitLabel,
  pending = false,
  canSubmit = true,
  messages,
}: {
  amountMinor: string;
  currency: string;
  requestKey: string;
  onConfirm: (confirmed: boolean, requestKey: string) => void;
  submitLabel?: string;
  pending?: boolean;
  canSubmit?: boolean;
  messages: Messages;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className={styles.confirmation} data-confirmation-required="true">
      <p>
        {messages['registrationApproval.amount']}:{' '}
        <Bidi>
          {amountMinor} {currency}
        </Bidi>
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        <span>{messages['registrationApproval.confirmPayment']}</span>
      </label>
      <p aria-live="polite" className={styles.live} />
      <Button
        disabled={!confirmed || pending || !canSubmit}
        loading={pending}
        loadingLabel={messages['registrationApproval.pendingAction']}
        onClick={() => onConfirm(confirmed, requestKey)}
      >
        {submitLabel ?? messages['registrationApproval.submit']}
      </Button>
    </div>
  );
}
