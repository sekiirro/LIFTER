'use client';

import type { Locale } from '../../lib/design/preferences';
import { numberingLocale } from '../../lib/i18n/format';
import { getMessages, type Messages } from '../../lib/i18n';
import { Card } from '../ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { Bidi } from '../ui/Bidi';
import styles from './SalesProjection.module.css';

export function formatCairoMonth(
  isoDate: string | null | undefined,
  locale: Locale,
): string {
  if (!isoDate) return '—';
  try {
    const parts = isoDate.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]) || 1;
    if (!year || !month) return isoDate;
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat(numberingLocale(locale), {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return isoDate;
  }
}

export type SalesProjectionState =
  'finalized' | 'not_available' | 'empty' | 'loading' | 'error' | 'denied';

export type SalesMonthlyTotalViewProps = {
  workspaceId: string;
  locale: Locale;
  month: string;
  status: SalesProjectionState;
  total?: string | null;
  ownBasicSalary?: { amount: string; currency: string };
  onRetry?: () => void;
  onMonthChange?: (month: string) => void;
};

export function SalesMonthlyTotalView({
  locale,
  month,
  status,
  total,
  ownBasicSalary,
  onRetry,
}: SalesMonthlyTotalViewProps) {
  const messages: Messages = getMessages(locale);

  // 1. Denied state: no existence disclosure
  if (status === 'denied') {
    return (
      <main className={styles.page}>
        <div
          className={styles.deniedAlert}
          role="alert"
          data-testid="sales-projection-denied"
        >
          <h2 className={styles.deniedTitle}>
            {messages['workforce.salesProjection.denied']}
          </h2>
        </div>
      </main>
    );
  }

  // 2. Loading state
  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {messages['workforce.salesProjection.title']}
          </h1>
        </header>
        <div
          className={styles.loadingContainer}
          aria-busy="true"
          data-testid="sales-projection-loading"
        >
          <p className={styles.loadingText}>
            {messages['workforce.salesProjection.loading']}
          </p>
          <Skeleton shape="card" />
        </div>
      </main>
    );
  }

  // 3. Error state with retry action
  if (status === 'error') {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {messages['workforce.salesProjection.title']}
          </h1>
        </header>
        <div data-testid="sales-projection-error">
          <ErrorState
            title={messages['workforce.salesProjection.loadError']}
            retryLabel={messages['states.retry']}
            onRetry={onRetry ?? (() => window.location.reload())}
          />
        </div>
      </main>
    );
  }

  // 4. Not available yet state (before Cairo month-end or before PO finalization)
  if (status === 'not_available') {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {messages['workforce.salesProjection.title']}
          </h1>
          <div className={styles.periodRow}>
            <span className={styles.periodLabel}>
              {messages['reports.month']}
            </span>
            <span className={styles.periodValue}>
              <Bidi>{formatCairoMonth(month, locale)}</Bidi>
            </span>
          </div>
        </header>
        <div
          className={styles.cardWrapper}
          data-testid="sales-projection-not-available"
        >
          <Card elevated className={styles.notAvailableCard}>
            <h2 className={styles.notAvailableTitle}>
              {messages['workforce.salesProjection.notAvailable']}
            </h2>
            {ownBasicSalary ? (
              <div className={styles.ownBasicSalary}>
                <span className={styles.totalLabel}>
                  {messages['workforce.compensation.own.basicSalary']}
                </span>
                <span className={styles.salaryAmount}>
                  <Bidi dir="ltr">
                    {ownBasicSalary.amount} {ownBasicSalary.currency}
                  </Bidi>
                </span>
              </div>
            ) : null}
            <p className={styles.notAvailableHint}>
              {messages['workforce.salesProjection.notAvailableUntilNextMonth']}
            </p>
          </Card>
        </div>
      </main>
    );
  }

  // 5. Empty state (finalized snapshot exists, but caller has no record/total)
  if (status === 'empty') {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {messages['workforce.salesProjection.title']}
          </h1>
          <div className={styles.periodRow}>
            <span className={styles.periodLabel}>
              {messages['reports.month']}
            </span>
            <span className={styles.periodValue}>
              <Bidi>{formatCairoMonth(month, locale)}</Bidi>
            </span>
          </div>
        </header>
        <div data-testid="sales-projection-empty">
          <EmptyState title={messages['workforce.salesProjection.empty']} />
        </div>
      </main>
    );
  }

  // 6. Total state (finalized total present)
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {messages['workforce.salesProjection.title']}
        </h1>
        <div className={styles.periodRow}>
          <span className={styles.periodLabel}>
            {messages['reports.month']}
          </span>
          <span className={styles.periodValue}>
            <Bidi>{formatCairoMonth(month, locale)}</Bidi>
          </span>
        </div>
      </header>
      <div className={styles.cardWrapper} data-testid="sales-projection-total">
        <Card elevated className={styles.totalCard}>
          <div className={styles.totalHeader}>
            <span className={styles.totalLabel}>
              {messages['workforce.salesProjection.total']}
            </span>
          </div>
          <div
            className={styles.totalAmount}
            role="group"
            aria-label={messages['workforce.salesProjection.aria.total']}
          >
            <Bidi>{total ?? '0.00'}</Bidi>
          </div>
        </Card>
      </div>
    </main>
  );
}
