'use client';

import { useEffect, useRef, useState } from 'react';
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
import { createApprovalRequestKeyStore } from './approval-request-keys';
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
type CorrectionContext = {
  subscriptionId: string | null;
  corrections: {
    seq: number;
    obligationId: string;
    revision: number;
    tailEventId: string;
  }[];
};

export function ApprovalReview({
  item,
  workspaceId,
  role,
  messages,
  correctionContext = null,
}: {
  item: Item;
  workspaceId: string;
  role: Role;
  messages: Messages;
  correctionContext?: CorrectionContext | null;
}) {
  const firstInstallment = item.installments[0];
  const amountDue = firstInstallment?.amount_minor ?? item.price_minor;
  const currencyDue = firstInstallment?.currency ?? item.currency;
  const [notice, setNotice] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const requestKey = useRef(createApprovalRequestKeyStore()).current;
  const owner = role === 'platform_owner';
  useEffect(() => setHydrated(true), []);
  const run = async (action: 'approve' | 'reject' | 'reconsider') => {
    setPending(true);
    try {
      const key = requestKey(
        action,
        action === 'reject' ? undefined : paymentDate,
      );
      const input = {
        workspaceId,
        clientId: item.client_id,
        requestKey: key,
        expectedAmountMinor: amountDue,
        currency: currencyDue,
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
        setNotice(
          messages[
            action === 'reject'
              ? 'registrationApproval.rejectSuccess'
              : 'registrationApproval.success'
          ],
        );
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
    <section
      className={styles.review}
      data-confirmation-required="true"
      data-testid="approval-review"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
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
          value: `${amountDue} ${currencyDue}`,
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
            amountMinor={amountDue}
            currency={currencyDue}
            requestKey=""
            pending={pending}
            canSubmit={Boolean(paymentDate)}
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
          amountMinor={amountDue}
          currency={currencyDue}
          requestKey=""
          pending={pending}
          canSubmit={Boolean(paymentDate)}
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
        obligations={item.installments.map((row) => {
          const correction = correctionContext?.corrections.find(
            (candidate) => candidate.seq === row.seq,
          );
          return {
            seq: row.seq,
            amount_minor: row.amount_minor,
            currency: row.currency,
            due_on: null,
            paid: correctionContext?.subscriptionId
              ? correction !== undefined
              : null,
            collected_on: null,
            obligation_id: correction?.obligationId,
            revision: correction?.revision,
            tail_event_id: correction?.tailEventId,
            kind: correction ? 'collection' : null,
          };
        })}
        role={role}
        messages={messages}
        workspaceId={
          correctionContext?.subscriptionId ? workspaceId : undefined
        }
        clientId={
          correctionContext?.subscriptionId ? item.client_id : undefined
        }
        subscriptionId={correctionContext?.subscriptionId ?? undefined}
      />
      <input type="hidden" value={workspaceId} readOnly aria-hidden="true" />
    </section>
  );
}
