'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Role } from '../../lib/auth/capabilities';
import type { Messages } from '../../lib/i18n';
import {
  approveRegistrationAction,
  reconsiderRegistrationAction,
  rejectRegistrationAction,
} from '../../app/(app)/registration-approvals/actions';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Alert } from '../ui/Alert';
import { PaymentConfirmation } from './PaymentConfirmation';
import { PaymentHistory } from './PaymentHistory';
import styles from './registration-approval.module.css';

type Item = {
  client_id: string;
  name: string;
  signup_time: string;
  approval_state: string;
  offer_version_label: string;
  price_minor: string;
  currency: string;
  installments: {
    seq: number;
    amount_minor: string;
    currency: string;
    issued_day_offset: number | null;
  }[];
};

export function ApprovalReview({
  item,
  workspaceId,
  role,
  messages,
}: {
  item: Item;
  workspaceId: string;
  role: Role;
  messages: Messages;
}) {
  const [notice, setNotice] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [pending, setPending] = useState(false);
  const keys = useRef(new Map<string, string>());
  const requestKey = (action: string) => {
    const existing = keys.current.get(action);
    if (existing) return existing;
    const key = crypto.randomUUID();
    keys.current.set(action, key);
    return key;
  };
  const owner = role === 'platform_owner';
  const run = async (action: 'approve' | 'reject' | 'reconsider') => {
    setPending(true);
    try {
      const key = requestKey(action);
      const input = {
        workspaceId,
        clientId: item.client_id,
        requestKey: key,
        expectedAmountMinor: item.price_minor,
        currency: item.currency,
        collectedOn: paymentDate,
        paymentConfirmed: true,
      };
      const result =
        action === 'approve'
          ? await approveRegistrationAction(input)
          : action === 'reconsider'
            ? await reconsiderRegistrationAction(input)
            : await rejectRegistrationAction({
                workspaceId,
                clientId: item.client_id,
                requestKey: key,
                reasonCode: 'registration_rejected',
              });
      if (result.status === 'ok')
        setNotice(messages['registrationApproval.success']);
      else if (result.status === 'stale_state')
        setNotice(messages['registrationApproval.stale']);
      else if (result.status === 'key_conflict')
        setNotice(messages['registrationApproval.keyConflict']);
      else setNotice(messages['registrationApproval.unavailable']);
    } catch {
      setNotice(messages['registrationApproval.uncertain']);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className={styles.review} data-confirmation-required="true">
      <dl className={styles.details}>
        <div>
          <dt>{messages['registrationApproval.name']}</dt>
          <dd>{item.name}</dd>
        </div>
        <div>
          <dt>{messages['registrationApproval.signupTime']}</dt>
          <dd>
            <Bidi>{item.signup_time}</Bidi>
          </dd>
        </div>
        <div>
          <dt>{messages['registrationApproval.offer']}</dt>
          <dd>{item.offer_version_label}</dd>
        </div>
      </dl>
      <Field
        label={messages['registrationApproval.amount']}
        inputProps={{
          value: `${item.price_minor} ${item.currency}`,
          readOnly: true,
        }}
      />
      <Field
        label={messages['registrationApproval.paymentDate']}
        hint={messages['registrationApproval.paymentDateHint']}
        inputProps={{
          type: 'date',
          required: true,
          value: paymentDate,
          onChange: (event) => setPaymentDate(event.currentTarget.value),
        }}
      />
      {item.approval_state === 'pending-approval' && (
        <div className={styles.actions}>
          <PaymentConfirmation
            amountMinor={item.price_minor}
            currency={item.currency}
            requestKey=""
            pending={pending}
            onConfirm={(confirmed) => {
              if (confirmed && paymentDate) void run('approve');
              else setNotice(messages['registrationApproval.paymentDateHint']);
            }}
            messages={messages}
          />
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void run('reject')}
          >
            {messages['registrationApproval.reject']}
          </Button>
        </div>
      )}
      {item.approval_state === 'rejected' && owner && (
        <PaymentConfirmation
          amountMinor={item.price_minor}
          currency={item.currency}
          requestKey=""
          pending={pending}
          submitLabel={messages['registrationApproval.reconsider']}
          onConfirm={(confirmed) => {
            if (confirmed && paymentDate) void run('reconsider');
            else setNotice(messages['registrationApproval.paymentDateHint']);
          }}
          messages={messages}
        />
      )}
      {item.approval_state !== 'pending-approval' && (
        <Link href="/payments">
          {messages['registrationApproval.dashboardPayments']}
        </Link>
      )}
      {item.approval_state === 'rejected' && (
        <p>
          <Bidi>registration_rejected</Bidi>
        </p>
      )}
      {notice && <Alert tone="error" title={notice} />}
      <PaymentHistory
        obligations={item.installments.map((row) => ({
          seq: row.seq,
          amount_minor: row.amount_minor,
          currency: row.currency,
          due_on: null,
          paid: false,
          collected_on: null,
        }))}
        role={role}
        messages={messages}
      />
      <input type="hidden" value={workspaceId} readOnly aria-hidden="true" />
    </section>
  );
}
