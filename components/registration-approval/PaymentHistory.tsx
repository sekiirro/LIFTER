'use client';

import { useRef, useState } from 'react';
import type { Messages } from '../../lib/i18n';
import {
  correctCollectionAction,
  recordInstallmentAction,
} from '../../app/(app)/registration-approvals/actions';
import { Bidi } from '../ui/Bidi';
import { EmptyState } from '../ui/States';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert } from '../ui/Alert';
import { Field } from '../ui/Field';
import { PaymentConfirmation } from './PaymentConfirmation';
import { StatusBadge } from './StatusBadge';
import styles from './registration-approval.module.css';

type Obligation = {
  seq: number;
  amount_minor: string;
  currency: string;
  due_on: string | null;
  paid: boolean;
  collected_on: string | null;
  obligation_id?: string;
  revision?: number;
  tail_event_id?: string | null;
  kind?: string | null;
};
type CommissionEvent = {
  installment_seq: number;
  commission_minor: string;
  rate_bp: number;
};

export function PaymentHistory({
  obligations,
  role,
  messages,
  commissionEvents = [],
  workspaceId,
  clientId,
  subscriptionId,
}: {
  obligations: Obligation[];
  role: string;
  messages: Messages;
  commissionEvents?: CommissionEvent[];
  workspaceId?: string;
  clientId?: string;
  subscriptionId?: string;
}) {
  const commission =
    role === 'platform_owner' || role === 'workspace_owner'
      ? commissionEvents
      : [];
  const [correcting, setCorrecting] = useState<Obligation | null>(null);
  const [notice, setNotice] = useState('');
  const [pendingRequest, setPendingRequest] = useState('');
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const requestKeys = useRef(new Map<string, string>());
  const requestKey = (operation: string, id: string) => {
    const mapKey = `${operation}:${id}`;
    let key = requestKeys.current.get(mapKey);
    if (!key) {
      key = crypto.randomUUID();
      requestKeys.current.set(mapKey, key);
    }
    return key;
  };
  const runCorrection = async () => {
    if (
      !correcting?.obligation_id ||
      !correcting.tail_event_id ||
      !subscriptionId ||
      !clientId ||
      !workspaceId
    )
      return;
    setPendingRequest(`correction:${correcting.obligation_id}`);
    try {
      const result = await correctCollectionAction({
        workspaceId,
        clientId,
        subscriptionId,
        obligationId: correcting.obligation_id,
        originalEventId: correcting.tail_event_id,
        requestKey: requestKey('correction', correcting.obligation_id),
        expectedInstallmentSeq: correcting.seq,
        expectedRevision: correcting.revision,
        expectedPreviousEventId: correcting.tail_event_id,
        correctionConfirmed: true,
      });
      setNotice(
        result.status === 'ok'
          ? messages['registrationApproval.success']
          : result.status === 'stale_state'
            ? messages['registrationApproval.stale']
            : messages['registrationApproval.unavailable'],
      );
      setCorrecting(null);
    } catch {
      setNotice(messages['registrationApproval.uncertain']);
    } finally {
      setPendingRequest('');
    }
  };
  const runCollection = async (obligation: Obligation, confirmed: boolean) => {
    const paymentDate = obligation.obligation_id
      ? paymentDates[obligation.obligation_id]
      : '';
    if (
      !confirmed ||
      !paymentDate ||
      !workspaceId ||
      !clientId ||
      !subscriptionId ||
      !obligation.obligation_id
    ) {
      setNotice(messages['registrationApproval.paymentDateHint']);
      return;
    }
    setPendingRequest(`collection:${obligation.obligation_id}`);
    try {
      const result = await recordInstallmentAction({
        workspaceId,
        clientId,
        subscriptionId,
        obligationId: obligation.obligation_id,
        requestKey: requestKey('collection', obligation.obligation_id),
        expectedInstallmentSeq: obligation.seq,
        expectedRevision: obligation.revision ?? 0,
        expectedPreviousEventId: obligation.tail_event_id ?? null,
        expectedAmountMinor: obligation.amount_minor,
        currency: obligation.currency,
        collectedOn: paymentDate,
        paymentConfirmed: true,
      });
      setNotice(
        result.status === 'ok'
          ? messages['registrationApproval.success']
          : result.status === 'stale_state'
            ? messages['registrationApproval.stale']
            : messages['registrationApproval.uncertain'],
      );
    } catch {
      setNotice(messages['registrationApproval.uncertain']);
    } finally {
      setPendingRequest('');
    }
  };
  if (!obligations.length)
    return <EmptyState title={messages['registrationApproval.paymentEmpty']} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{messages['registrationApproval.installment']}</th>
            <th>{messages['registrationApproval.amount']}</th>
            <th>{messages['registrationApproval.dueOn']}</th>
            <th>{messages['registrationApproval.history']}</th>
            {commission.length > 0 && (
              <th>{messages['registrationApproval.commission']}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {obligations.map((obligation) => (
            <tr key={obligation.seq}>
              <td>
                <Bidi>{obligation.seq}</Bidi>
              </td>
              <td>
                <Bidi>
                  {obligation.amount_minor} {obligation.currency}
                </Bidi>
              </td>
              <td>
                <Bidi>{obligation.due_on ?? '—'}</Bidi>
              </td>
              <td>
                <StatusBadge
                  status={obligation.paid ? 'paid' : 'unpaid'}
                  messages={messages}
                />
                {!obligation.paid && obligation.obligation_id && (
                  <div className={styles.actions}>
                    <Field
                      label={messages['registrationApproval.paymentDate']}
                      inputProps={{
                        type: 'date',
                        required: true,
                        value: paymentDates[obligation.obligation_id] ?? '',
                        onChange: (event) => {
                          const value = event.currentTarget.value;
                          setPaymentDates((current) => ({
                            ...current,
                            [obligation.obligation_id!]: value,
                          }));
                        },
                      }}
                    />
                    <PaymentConfirmation
                      amountMinor={obligation.amount_minor}
                      currency={obligation.currency}
                      requestKey=""
                      pending={
                        pendingRequest ===
                        `collection:${obligation.obligation_id}`
                      }
                      onConfirm={(confirmed) =>
                        void runCollection(obligation, confirmed)
                      }
                      messages={messages}
                    />
                  </div>
                )}
                {role === 'platform_owner' &&
                  obligation.paid &&
                  obligation.kind === 'collection' &&
                  obligation.obligation_id &&
                  obligation.tail_event_id && (
                    <Button
                      data-testid="correction-action"
                      variant="secondary"
                      onClick={() => setCorrecting(obligation)}
                    >
                      {messages['registrationApproval.correct']}
                    </Button>
                  )}
              </td>
              {commission.length > 0 && (
                <td>
                  <Bidi>
                    {commission
                      .filter(
                        (event) => event.installment_seq === obligation.seq,
                      )
                      .map((event) => event.commission_minor)
                      .join(', ')}
                  </Bidi>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {notice && <Alert tone="info" title={notice} />}
      <ConfirmDialog
        open={correcting !== null}
        title={messages['registrationApproval.correct']}
        description={messages['registrationApproval.confirmDescription']}
        confirmLabel={messages['registrationApproval.correct']}
        cancelLabel={messages['registrationApproval.cancel']}
        tone="destructive"
        onConfirm={() => void runCorrection()}
        onCancel={() => setCorrecting(null)}
        loading={pendingRequest.startsWith('correction:')}
      />
    </div>
  );
}
