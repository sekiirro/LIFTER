'use client';

import React, { useState } from 'react';
import type { Messages } from '../../lib/i18n';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { EmptyState, NoResults, ErrorState, Skeleton } from '../ui/States';
import { shiftMonth } from '../../lib/workforce/report';
import type {
  WorkforceReportData,
  StaffRole,
  LedgerCategory,
} from '../../lib/workforce/report-types';
import styles from './WorkforceReport.module.css';

export type WorkforceReportViewProps = {
  report: WorkforceReportData | null;
  status: 'ok' | 'loading' | 'error' | 'denied';
  locale: 'ar' | 'en';
  messages: Messages;
  currentMonth: string; // "YYYY-MM"
  onMonthChange?: (month: string) => void;
  onRetry?: () => void;
};

export function WorkforceReportView({
  report,
  status,
  locale,
  messages: m,
  currentMonth,
  onMonthChange,
  onRetry,
}: WorkforceReportViewProps) {
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const categoryLabel = (category: LedgerCategory): string => {
    switch (category) {
      case 'earned':
        return m['workforce.report.ledger.category.earned'];
      case 'poAdjustment':
        return m['workforce.report.ledger.category.poAdjustment'];
      case 'refundReversal':
        return m['workforce.report.ledger.category.refundReversal'];
      case 'planDelay':
        return m['workforce.report.ledger.category.planDelay'];
      case 'checkinDelay':
        return m['workforce.report.ledger.category.checkinDelay'];
      case 'transformationFeedback':
        return m['workforce.report.ledger.category.transformationFeedback'];
      default:
        return category;
    }
  };

  const trainers = report?.trainers ?? [];
  const sales = report?.sales ?? [];
  const ledger = report?.ledger ?? [];

  const filteredTrainers = roleFilter === 'sales' ? [] : trainers;
  const filteredSales = roleFilter === 'trainer' ? [] : sales;
  const filteredLedger =
    roleFilter === 'all'
      ? ledger
      : ledger.filter((entry) => entry.staff_role === roleFilter);

  if (status === 'denied') {
    return (
      <main className={styles.container} lang={locale} dir={dir}>
        <Alert tone="error" title={m['workforce.report.denied']} />
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.container} lang={locale} dir={dir}>
        <ErrorState
          title={m['workforce.report.loadError']}
          retryLabel={m['states.retry']}
          onRetry={onRetry ?? (() => window.location.reload())}
        />
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main
        className={styles.container}
        lang={locale}
        dir={dir}
        aria-busy="true"
        aria-live="polite"
      >
        <div className={styles.header}>
          <h1 className={styles.title}>{m['workforce.report.loading']}</h1>
        </div>
        <Skeleton lines={6} shape="text" />
      </main>
    );
  }

  const isClosed = report?.is_closed ?? false;
  const hasNoData =
    (!report?.totals || report.totals.length === 0) &&
    (!report?.ledger || report.ledger.length === 0);

  const hasFilterMismatch =
    !hasNoData &&
    filteredTrainers.length === 0 &&
    filteredSales.length === 0 &&
    filteredLedger.length === 0;

  return (
    <main className={styles.container} lang={locale} dir={dir}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{m['workforce.report.title']}</h1>
          <span
            className={`${styles.badge} ${
              isClosed ? styles.badgeClosed : styles.badgeCurrent
            }`}
            data-testid="month-status-badge"
          >
            {isClosed
              ? m['workforce.report.closedMonth']
              : m['workforce.report.currentMonth']}
          </span>
        </div>
      </header>

      {/* Month Navigation */}
      <nav className={styles.navBar} aria-label={m['reports.month']}>
        <div className={styles.monthLabel}>
          <span>{m['reports.month']}: </span>
          <Bidi dir="ltr">{currentMonth}</Bidi>
        </div>
        <div className={styles.monthNavActions}>
          <Button
            variant="secondary"
            onClick={() => onMonthChange?.(shiftMonth(currentMonth, -1))}
            aria-label={m['reports.previousMonth']}
            data-testid="prev-month-button"
          >
            {m['reports.previousMonth']}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onMonthChange?.(shiftMonth(currentMonth, 1))}
            aria-label={m['reports.nextMonth']}
            data-testid="next-month-button"
          >
            {m['reports.nextMonth']}
          </Button>
        </div>
      </nav>

      {/* Formula & Hints Card */}
      <section
        className={styles.formulaCard}
        aria-label={m['workforce.report.netPointsFormula']}
      >
        <p className={styles.formulaFormula}>
          {m['workforce.report.netPointsFormula']}
        </p>
        <p className={styles.formulaHint}>
          {m['workforce.report.netPointsHint']}
        </p>
        <p className={styles.standingNote}>
          {m['workforce.report.pointsNotSalary']}
        </p>
      </section>

      {/* Filter controls */}
      <div
        className={styles.filterBar}
        role="group"
        aria-label={m['staff.clientDirectory.filters']}
      >
        <span className={styles.filterLabel}>
          {m['staff.clientDirectory.filters']}:
        </span>
        <Button
          variant={roleFilter === 'all' ? 'primary' : 'secondary'}
          onClick={() => setRoleFilter('all')}
          data-testid="filter-all-button"
        >
          {m['catalog.all']}
        </Button>
        <Button
          variant={roleFilter === 'trainer' ? 'primary' : 'secondary'}
          onClick={() => setRoleFilter('trainer')}
          data-testid="filter-trainer-button"
        >
          {m['staff.clientDirectory.assignment']}
        </Button>
        <Button
          variant={roleFilter === 'sales' ? 'primary' : 'secondary'}
          onClick={() => setRoleFilter('sales')}
          data-testid="filter-sales-button"
        >
          {m['forms.staffRole.sales']}
        </Button>
      </div>

      {/* Content / States */}
      {hasNoData ? (
        <EmptyState title={m['workforce.report.empty']} />
      ) : hasFilterMismatch ? (
        <NoResults title={m['workforce.report.noResults']} />
      ) : (
        <>
          {/* Totals Section */}
          <div className={styles.totalsGrid}>
            {/* Trainer Totals */}
            {roleFilter !== 'sales' && (
              <section
                className={styles.section}
                aria-label={m['workforce.report.section.trainers']}
              >
                <h2 className={styles.sectionTitle}>
                  {m['workforce.report.section.trainers']}
                </h2>
                {filteredTrainers.length === 0 ? (
                  <p className={styles.metaText}>
                    {m['workforce.report.empty']}
                  </p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">
                            {m['staff.clientDirectory.assignment']}
                          </th>
                          <th scope="col">
                            {m['workforce.report.column.netPoints']}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrainers.map((staff) => (
                          <tr key={staff.staff_user_id}>
                            <td>
                              {staff.display_name || (
                                <Bidi dir="ltr">{staff.staff_user_id}</Bidi>
                              )}
                            </td>
                            <td className={styles.numericCell}>
                              <span
                                className={
                                  staff.is_negative
                                    ? styles.negativePoints
                                    : undefined
                                }
                              >
                                <Bidi dir="ltr">{staff.points}</Bidi>
                              </span>
                              {staff.is_negative && (
                                <>
                                  <span
                                    className={styles.negativeBadge}
                                    data-testid="negative-badge"
                                  >
                                    {m['workforce.report.negativeTotal']}
                                  </span>
                                  <span className={styles.negativeHint}>
                                    {m['workforce.report.negativeHint']}
                                  </span>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Sales Totals */}
            {roleFilter !== 'trainer' && (
              <section
                className={styles.section}
                aria-label={m['workforce.report.section.sales']}
              >
                <h2 className={styles.sectionTitle}>
                  {m['workforce.report.section.sales']}
                </h2>
                {filteredSales.length === 0 ? (
                  <p className={styles.metaText}>
                    {m['workforce.report.empty']}
                  </p>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">{m['forms.staffRole.sales']}</th>
                          <th scope="col">
                            {m['workforce.report.column.netPoints']}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((staff) => (
                          <tr key={staff.staff_user_id}>
                            <td>
                              {staff.display_name || (
                                <Bidi dir="ltr">{staff.staff_user_id}</Bidi>
                              )}
                            </td>
                            <td className={styles.numericCell}>
                              <span
                                className={
                                  staff.is_negative
                                    ? styles.negativePoints
                                    : undefined
                                }
                              >
                                <Bidi dir="ltr">{staff.points}</Bidi>
                              </span>
                              {staff.is_negative && (
                                <>
                                  <span
                                    className={styles.negativeBadge}
                                    data-testid="negative-badge"
                                  >
                                    {m['workforce.report.negativeTotal']}
                                  </span>
                                  <span className={styles.negativeHint}>
                                    {m['workforce.report.negativeHint']}
                                  </span>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Ledger Section */}
          <section
            className={styles.section}
            aria-label={m['workforce.report.ledger.title']}
          >
            <h2 className={styles.sectionTitle}>
              {m['workforce.report.ledger.title']}
            </h2>
            {filteredLedger.length === 0 ? (
              <p className={styles.metaText}>{m['workforce.report.empty']}</p>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">
                        {m['workforce.report.ledger.column.points']}
                      </th>
                      <th scope="col">{m['workforce.report.ledger.title']}</th>
                      <th scope="col">
                        {m['staff.clientDirectory.assignment']} /{' '}
                        {m['forms.staffRole.sales']}
                      </th>
                      <th scope="col">
                        {m['workforce.report.ledger.column.reason']}
                      </th>
                      <th scope="col">
                        {m['workforce.report.ledger.column.actor']}
                      </th>
                      <th scope="col">
                        {m['workforce.report.ledger.column.effectiveMonth']}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map((entry) => {
                      const isNegative = entry.points.startsWith('-');
                      const showOriginalMonth =
                        entry.original_month &&
                        entry.original_month !== entry.effective_month;

                      return (
                        <tr key={entry.id}>
                          <td className={styles.numericCell}>
                            <span
                              className={
                                isNegative ? styles.negativePoints : undefined
                              }
                            >
                              <Bidi dir="ltr">{entry.points}</Bidi>
                            </span>
                          </td>
                          <td>{categoryLabel(entry.category)}</td>
                          <td>
                            {entry.staff_name || (
                              <Bidi dir="ltr">{entry.staff_user_id}</Bidi>
                            )}
                          </td>
                          <td className={styles.metaText}>
                            {entry.reason_code ? (
                              <Bidi dir="ltr">{entry.reason_code}</Bidi>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={styles.metaText}>
                            {entry.actor ? (
                              <Bidi dir="ltr">{entry.actor}</Bidi>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <Bidi dir="ltr">{entry.effective_month}</Bidi>
                            {showOriginalMonth && (
                              <span className={styles.originalMonthBadge}>
                                {m[
                                  'workforce.report.ledger.originalMonth'
                                ].replace(
                                  '{month}',
                                  entry.original_month ?? '',
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
