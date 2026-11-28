'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { Messages } from '../../lib/i18n';
import {
  canonicalPointInput,
  normalizePointReason,
  type PointAdjustmentInput,
  type PointAdjustmentOperation,
  type PointActionResult,
  type PostPointAdjustmentAction,
  type ReattributePointAction,
  type ReattributePointInput,
} from '../../lib/workforce/manual-points';
import type { LedgerEntry, StaffTotal } from '../../lib/workforce/report-types';
import { Alert } from '../ui/Alert';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import styles from './WorkforceReport.module.css';

export type PointActionDialogProps = {
  operation: PointAdjustmentOperation | 'reattribute';
  staff: StaffTotal | null;
  entry: LedgerEntry | null;
  targets: StaffTotal[];
  workspaceId: string;
  currentMonth: string;
  messages: Messages;
  postAction?: PostPointAdjustmentAction;
  reattributeAction?: ReattributePointAction;
  onClose: () => void;
  onSuccess: () => void;
};

function operationLabel(
  operation: PointActionDialogProps['operation'],
  messages: Messages,
): string {
  switch (operation) {
    case 'add':
      return messages['workforce.report.points.add'];
    case 'deduct':
      return messages['workforce.report.points.deduct'];
    case 'correct':
      return messages['workforce.report.points.correct'];
    case 'reattribute':
      return messages['workforce.report.points.reattribute'];
  }
}

function errorTitle(
  status: PointActionResult['status'],
  messages: Messages,
): string {
  if (status === 'not_permitted') return messages['workforce.report.denied'];
  if (status === 'key_conflict')
    return messages['workforce.report.points.stale'];
  return messages['workforce.report.points.error'];
}

export function PointActionDialog({
  operation,
  staff,
  entry,
  targets,
  workspaceId,
  currentMonth,
  messages,
  postAction,
  reattributeAction,
  onClose,
  onSuccess,
}: PointActionDialogProps) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [targetStaffUserId, setTargetStaffUserId] = useState(
    targets[0]?.staff_user_id ?? '',
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [reasonTouched, setReasonTouched] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submitPendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pointsRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const targetRef = useRef<HTMLSelectElement>(null);
  const reasonId = 'point-change-reason';
  const reasonHintId = 'point-change-reason-hint';
  const reasonErrorId = 'point-change-reason-error';
  const pointsId = 'point-change-points';
  const targetId = 'point-change-target';

  const reasonError =
    reasonTouched && reason.trim().length === 0
      ? messages['workforce.report.points.reasonRequired']
      : undefined;

  function newIntent() {
    setIdempotencyKey(globalThis.crypto.randomUUID());
    setActionError(null);
  }

  function submit() {
    if (isPending || submitPendingRef.current) return;
    setActionError(null);
    setReasonTouched(true);

    const normalizedReason = normalizePointReason(reason);
    if (normalizedReason.status === 'reason_required') {
      reasonRef.current?.focus();
      return;
    }
    if (normalizedReason.status === 'invalid_input') {
      setActionError(messages['workforce.report.points.error']);
      reasonRef.current?.focus();
      return;
    }

    if (operation === 'reattribute') {
      if (!entry || !reattributeAction || !targetStaffUserId) {
        setActionError(messages['workforce.report.points.error']);
        targetRef.current?.focus();
        return;
      }
      const input: ReattributePointInput = {
        workspaceId,
        originalEntryKind:
          entry.category === 'earned' ? 'earned' : 'adjustment',
        originalEntryId: entry.id,
        targetStaffUserId,
        reason,
        idempotencyKey,
      };
      submitPendingRef.current = true;
      setIsPending(true);
      void (async () => {
        try {
          const result = await reattributeAction(input);
          if (result.status === 'ok') onSuccess();
          else if (result.status === 'reason_required') {
            setReasonTouched(true);
            reasonRef.current?.focus();
          } else setActionError(errorTitle(result.status, messages));
        } catch {
          setActionError(messages['workforce.report.points.error']);
        } finally {
          submitPendingRef.current = false;
          setIsPending(false);
        }
      })();
      return;
    }

    if (!staff || !postAction || (operation === 'correct' && !entry)) {
      setActionError(messages['workforce.report.points.error']);
      return;
    }
    const canonicalPoints = canonicalPointInput(points, operation);
    if (!canonicalPoints) {
      setActionError(messages['workforce.report.points.error']);
      pointsRef.current?.focus();
      return;
    }
    const input: PointAdjustmentInput = {
      workspaceId,
      staffUserId: staff.staff_user_id,
      operation,
      points,
      effectiveMonth: operation === 'correct' ? null : currentMonth,
      originalEntryKind:
        operation === 'correct' && entry
          ? entry.category === 'earned'
            ? 'earned'
            : 'adjustment'
          : null,
      originalEntryId: operation === 'correct' ? (entry?.id ?? null) : null,
      reason,
      idempotencyKey,
    };
    submitPendingRef.current = true;
    setIsPending(true);
    void (async () => {
      try {
        const result = await postAction(input);
        if (result.status === 'ok') onSuccess();
        else if (result.status === 'reason_required') {
          setReasonTouched(true);
          reasonRef.current?.focus();
        } else setActionError(errorTitle(result.status, messages));
      } catch {
        setActionError(messages['workforce.report.points.error']);
      } finally {
        submitPendingRef.current = false;
        setIsPending(false);
      }
    })();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  const pointsPattern =
    operation === 'correct'
      ? '-?(0|[1-9][0-9]{0,7})([.][0-9]{1,2})?'
      : '(0|[1-9][0-9]{0,7})([.][0-9]{1,2})?';

  return (
    <ConfirmDialog
      open
      title={messages['workforce.report.points.confirmTitle']}
      description={messages['workforce.report.points.confirmBody']}
      confirmLabel={operationLabel(operation, messages)}
      cancelLabel={messages['dialog.cancel']}
      tone={operation === 'deduct' ? 'destructive' : 'default'}
      loading={isPending}
      onCancel={() => {
        if (!isPending) onClose();
      }}
      onConfirm={() => formRef.current?.requestSubmit()}
    >
      <form
        ref={formRef}
        className={styles.pointForm}
        aria-busy={isPending}
        data-testid="point-action-form"
        noValidate
        onSubmit={handleSubmit}
      >
        {operation !== 'reattribute' && (
          <div className={styles.pointField}>
            <label htmlFor={pointsId}>
              {messages['workforce.report.ledger.column.points']}
            </label>
            <input
              ref={pointsRef}
              id={pointsId}
              name="points"
              type="text"
              inputMode="decimal"
              pattern={pointsPattern}
              dir="ltr"
              autoComplete="off"
              required
              disabled={isPending}
              value={points}
              onChange={(event) => {
                setPoints(event.target.value);
                newIntent();
              }}
            />
          </div>
        )}
        {operation === 'reattribute' && (
          <div className={styles.pointField}>
            <label htmlFor={targetId}>
              {messages['workforce.report.refund.selectStaff']}
            </label>
            <select
              ref={targetRef}
              id={targetId}
              name="targetStaffUserId"
              required
              disabled={isPending}
              value={targetStaffUserId}
              onChange={(event) => {
                setTargetStaffUserId(event.target.value);
                newIntent();
              }}
            >
              {targets.map((target) => (
                <option key={target.staff_user_id} value={target.staff_user_id}>
                  {target.display_name || target.staff_user_id} ·{' '}
                  {target.role === 'trainer'
                    ? messages['staff.clientDirectory.assignment']
                    : messages['forms.staffRole.sales']}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={styles.pointField}>
          <label htmlFor={reasonId}>
            {messages['workforce.report.ledger.column.reason']}
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            name="reason"
            rows={4}
            maxLength={500}
            dir="auto"
            required
            disabled={isPending}
            value={reason}
            aria-describedby={`${reasonHintId}${reasonError ? ` ${reasonErrorId}` : ''}`}
            aria-invalid={reasonError ? true : undefined}
            onBlur={() => setReasonTouched(true)}
            onChange={(event) => {
              setReason(event.target.value);
              newIntent();
            }}
          />
          <p id={reasonHintId} className={styles.pointHint}>
            {messages['workforce.report.points.reasonHint']}
          </p>
          {reasonError && (
            <p
              id={reasonErrorId}
              className={styles.pointError}
              data-testid="points-reason-error"
            >
              {reasonError}
            </p>
          )}
        </div>
        {actionError && (
          <Alert
            tone="error"
            title={actionError}
            data-testid="points-action-error"
          />
        )}
      </form>
    </ConfirmDialog>
  );
}
