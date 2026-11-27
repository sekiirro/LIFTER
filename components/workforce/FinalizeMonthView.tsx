'use client';

import { useState, useTransition } from 'react';
import type { Messages } from '../../lib/i18n';
import type { Locale } from '../../lib/design/preferences';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Alert } from '../ui/Alert';
import { useToast } from '../ui/Toast';
import type { FinalizeResult } from '../../lib/workforce/finalize';
import styles from './FinalizeMonth.module.css';

export type FinalizeMonthViewProps = {
  workspaceId: string;
  locale: Locale;
  messages: Messages;
  endedMonths: string[];
  currentCairoMonth: string;
  denied?: boolean;
  initialSelectedMonth?: string;
  onFinalizeAction: (params: {
    workspaceId: string;
    month: string;
  }) => Promise<FinalizeResult>;
};

export function FinalizeMonthView({
  workspaceId,
  locale,
  messages,
  endedMonths,
  currentCairoMonth,
  denied = false,
  initialSelectedMonth,
  onFinalizeAction,
}: FinalizeMonthViewProps) {
  const { success: toastSuccess } = useToast();
  const [isPending, startTransition] = useTransition();

  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialSelectedMonth || endedMonths[0] || '',
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizedMonths, setFinalizedMonths] = useState<Set<string>>(
    new Set(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [alreadyFinalized, setAlreadyFinalized] = useState(false);

  // Non-PO denial wall (no existence or month details disclosed)
  if (denied) {
    return (
      <main
        className={styles.main}
        lang={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <Alert
          tone="error"
          title={messages['workforce.finalize.denied']}
          data-testid="finalize-denied"
        />
      </main>
    );
  }

  const isSelectedAlreadyFinalized =
    alreadyFinalized || finalizedMonths.has(selectedMonth);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    setErrorMessage(null);
    setIsRetryable(false);
    setAlreadyFinalized(false);
  };

  const handleTriggerFinalize = () => {
    if (!selectedMonth) return;
    if (selectedMonth >= currentCairoMonth) {
      setErrorMessage(messages['workforce.finalize.currentMonthError']);
      setIsRetryable(false);
      return;
    }
    if (isSelectedAlreadyFinalized) {
      setErrorMessage(messages['workforce.finalize.alreadyFinalized']);
      setIsRetryable(false);
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmFinalize = () => {
    startTransition(async () => {
      try {
        const result = await onFinalizeAction({
          workspaceId,
          month: selectedMonth,
        });

        if (result.status === 'finalized') {
          setConfirmOpen(false);
          setFinalizedMonths((prev) => new Set(prev).add(selectedMonth));
          setErrorMessage(null);
          setIsRetryable(false);
          toastSuccess(messages['workforce.finalize.success']);
        } else if (result.status === 'already_finalized') {
          setConfirmOpen(false);
          setAlreadyFinalized(true);
          setFinalizedMonths((prev) => new Set(prev).add(selectedMonth));
          setErrorMessage(messages['workforce.finalize.alreadyFinalized']);
          setIsRetryable(false);
        } else if (result.status === 'invalid_period') {
          setConfirmOpen(false);
          setErrorMessage(messages['workforce.finalize.currentMonthError']);
          setIsRetryable(false);
        } else if (result.status === 'not_permitted') {
          setConfirmOpen(false);
          setErrorMessage(messages['workforce.finalize.denied']);
          setIsRetryable(false);
        } else if (result.status === 'stale') {
          setConfirmOpen(false);
          setErrorMessage(messages['workforce.finalize.stale']);
          setIsRetryable(true);
        } else {
          setConfirmOpen(false);
          setErrorMessage(messages['workforce.finalize.error']);
          setIsRetryable(true);
        }
      } catch {
        setConfirmOpen(false);
        setErrorMessage(messages['workforce.finalize.error']);
        setIsRetryable(true);
      }
    });
  };

  return (
    <main
      className={styles.main}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-testid="finalize-month-view"
    >
      <div className={styles.header}>
        <h1 className={styles.title}>{messages['workforce.finalize.title']}</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.fieldGroup}>
          <label htmlFor="finalize-month-select" className={styles.label}>
            {messages['workforce.finalize.selectMonth']}
          </label>
          <div className={styles.selectWrapper}>
            <select
              id="finalize-month-select"
              className={styles.select}
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              aria-describedby="finalize-month-hint"
              data-testid="finalize-month-select"
            >
              {endedMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {isSelectedAlreadyFinalized && (
              <span
                className={`${styles.badge} ${styles.badgeFinalized}`}
                data-testid="badge-finalized"
              >
                {messages['workforce.finalize.finalized']}
              </span>
            )}
          </div>
          <p id="finalize-month-hint" className={styles.hint}>
            {messages['workforce.finalize.closedHint']}
          </p>
        </div>

        {errorMessage && (
          <Alert tone="error" title={errorMessage} data-testid="finalize-error">
            {isRetryable && (
              <div className={styles.errorActions}>
                <Button
                  variant="secondary"
                  onClick={handleTriggerFinalize}
                  data-testid="finalize-retry-button"
                >
                  {messages['states.retry']}
                </Button>
              </div>
            )}
          </Alert>
        )}

        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={isSelectedAlreadyFinalized || isPending}
            loading={isPending}
            onClick={handleTriggerFinalize}
            data-testid="finalize-submit-button"
          >
            {messages['workforce.finalize.action']}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={messages['workforce.finalize.confirmTitle']}
        description={messages['workforce.finalize.confirmBody']}
        confirmLabel={messages['dialog.confirm']}
        cancelLabel={messages['dialog.cancel']}
        loading={isPending}
        onConfirm={handleConfirmFinalize}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
