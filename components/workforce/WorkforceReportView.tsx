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
  StaffTotal,
  LedgerCategory,
  LedgerEntry,
} from '../../lib/workforce/report-types';
import type {
  PostPointAdjustmentAction,
  ReattributePointAction,
} from '../../lib/workforce/manual-points';
import { PointActionDialog } from './PointActionDialog';
import styles from './WorkforceReport.module.css';
import { RefundFaultReviewPanel } from './RefundFaultReviewPanel';

type PointDialogState =
  | { operation: 'add' | 'deduct'; staff: StaffTotal }
  | { operation: 'correct'; staff: StaffTotal; entry: LedgerEntry }
  | { operation: 'reattribute'; entry: LedgerEntry };

export type WorkforceReportViewProps = {
  report: WorkforceReportData | null;
  status: 'ok' | 'loading' | 'error' | 'denied';
  locale: 'ar' | 'en';
  messages: Messages;
  currentMonth: string; // "YYYY-MM"
  onMonthChange?: (month: string) => void;
  onRetry?: () => void;
  postPointAdjustment?: PostPointAdjustmentAction;
  reattributePointEntry?: ReattributePointAction;
};

export function WorkforceReportView({
  report,
  status,
  locale,
  messages: m,
  currentMonth,
  onMonthChange,
  onRetry,
  postPointAdjustment,
  reattributePointEntry,
}: WorkforceReportViewProps) {
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');
  const [pointDialog, setPointDialog] = useState<PointDialogState | null>(null);
  const [pointFeedback, setPointFeedback] = useState<'success' | null>(null);

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

  const operationLabel = (operation: NonNullable<LedgerEntry['operation']>) => {
    switch (operation) {
      case 'add':
        return m['workforce.report.points.add'];
      case 'deduct':
        return m['workforce.report.points.deduct'];
      case 'correct':
        return m['workforce.report.points.correct'];
      case 'reattribute':
        return m['workforce.report.points.reattribute'];
    }
  };

  const trainers = report?.trainers ?? [];
  const sales = report?.sales ?? [];
  const ledger = report?.ledger ?? [];
  const staffOptions = report?.totals ?? [...trainers, ...sales];

  function staffForEntry(entry: LedgerEntry): StaffTotal {
    return (
      staffOptions.find(
        (staff) => staff.staff_user_id === entry.staff_user_id,
      ) ?? {
        staff_user_id: entry.staff_user_id,
        role: entry.staff_role,
        display_name: entry.staff_name,
        points: entry.points,
        is_negative: entry.points.startsWith('-'),
      }
    );
  }

  function targetsForEntry(entry: LedgerEntry): StaffTotal[] {
    return staffOptions.filter(
      (staff) => staff.staff_user_id !== entry.staff_user_id,
    );
  }

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

      {pointFeedback === 'success' && (
        <Alert
          tone="success"
          title={m['workforce.report.points.saved']}
          data-testid="points-success"
        />
      )}
      {report && (
        <RefundFaultReviewPanel
          workspaceId={report.workspace_id}
          locale={locale}
          messages={m}
          staff={[...trainers, ...sales]}
        />
      )}

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
                            <td id={`staff-total-${staff.staff_user_id}`}>
                              {staff.display_name || (
                                <Bidi dir="ltr">{staff.staff_user_id}</Bidi>
                              )}
                              <div className={styles.pointActions}>
                                <Button
                                  variant="secondary"
                                  className={styles.rowAction}
                                  aria-describedby={`staff-total-${staff.staff_user_id}`}
                                  data-testid={`points-add-${staff.staff_user_id}`}
                                  disabled={
                                    !postPointAdjustment || pointDialog !== null
                                  }
                                  onClick={() => {
                                    setPointFeedback(null);
                                    setPointDialog({
                                      operation: 'add',
                                      staff,
                                    });
                                  }}
                                >
                                  {m['workforce.report.points.add']}
                                </Button>
                                <Button
                                  variant="secondary"
                                  className={styles.rowAction}
                                  aria-describedby={`staff-total-${staff.staff_user_id}`}
                                  data-testid={`points-deduct-${staff.staff_user_id}`}
                                  disabled={
                                    !postPointAdjustment || pointDialog !== null
                                  }
                                  onClick={() => {
                                    setPointFeedback(null);
                                    setPointDialog({
                                      operation: 'deduct',
                                      staff,
                                    });
                                  }}
                                >
                                  {m['workforce.report.points.deduct']}
                                </Button>
                              </div>
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
                            <td id={`staff-total-${staff.staff_user_id}`}>
                              {staff.display_name || (
                                <Bidi dir="ltr">{staff.staff_user_id}</Bidi>
                              )}
                              <div className={styles.pointActions}>
                                <Button
                                  variant="secondary"
                                  className={styles.rowAction}
                                  aria-describedby={`staff-total-${staff.staff_user_id}`}
                                  data-testid={`points-add-${staff.staff_user_id}`}
                                  disabled={
                                    !postPointAdjustment || pointDialog !== null
                                  }
                                  onClick={() => {
                                    setPointFeedback(null);
                                    setPointDialog({
                                      operation: 'add',
                                      staff,
                                    });
                                  }}
                                >
                                  {m['workforce.report.points.add']}
                                </Button>
                                <Button
                                  variant="secondary"
                                  className={styles.rowAction}
                                  aria-describedby={`staff-total-${staff.staff_user_id}`}
                                  data-testid={`points-deduct-${staff.staff_user_id}`}
                                  disabled={
                                    !postPointAdjustment || pointDialog !== null
                                  }
                                  onClick={() => {
                                    setPointFeedback(null);
                                    setPointDialog({
                                      operation: 'deduct',
                                      staff,
                                    });
                                  }}
                                >
                                  {m['workforce.report.points.deduct']}
                                </Button>
                              </div>
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
              <div
                className={styles.tableWrapper}
                tabIndex={0}
                aria-label={m['workforce.report.ledger.title']}
              >
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
                            <div className={styles.pointActions}>
                              <Button
                                variant="secondary"
                                className={styles.rowAction}
                                aria-describedby={`ledger-staff-${entry.id}`}
                                data-testid={`points-correct-${entry.id}`}
                                disabled={
                                  !postPointAdjustment || pointDialog !== null
                                }
                                onClick={() => {
                                  setPointFeedback(null);
                                  setPointDialog({
                                    operation: 'correct',
                                    staff: staffForEntry(entry),
                                    entry,
                                  });
                                }}
                              >
                                {m['workforce.report.points.correct']}
                              </Button>
                              <Button
                                variant="secondary"
                                className={styles.rowAction}
                                aria-describedby={`ledger-staff-${entry.id}`}
                                data-testid={`points-reattribute-${entry.id}`}
                                disabled={
                                  !reattributePointEntry ||
                                  pointDialog !== null ||
                                  targetsForEntry(entry).length === 0
                                }
                                onClick={() => {
                                  setPointFeedback(null);
                                  setPointDialog({
                                    operation: 'reattribute',
                                    entry,
                                  });
                                }}
                              >
                                {m['workforce.report.points.reattribute']}
                              </Button>
                            </div>
                          </td>
                          <td>{categoryLabel(entry.category)}</td>
                          <td id={`ledger-staff-${entry.id}`}>
                            {entry.staff_name || (
                              <Bidi dir="ltr">{entry.staff_user_id}</Bidi>
                            )}
                          </td>
                          <td className={styles.metaText}>
                            {entry.reason ? (
                              <Bidi dir="auto">{entry.reason}</Bidi>
                            ) : entry.reason_code ? (
                              <Bidi dir="ltr">{entry.reason_code}</Bidi>
                            ) : (
                              '—'
                            )}
                            {entry.operation && (
                              <div>
                                <Bidi dir="auto">
                                  {operationLabel(entry.operation)}
                                </Bidi>
                              </div>
                            )}
                            {entry.original_entry_id &&
                              entry.original_entry_kind && (
                                <div>
                                  <Bidi dir="auto">
                                    {categoryLabel(
                                      entry.original_entry_kind === 'earned'
                                        ? 'earned'
                                        : 'poAdjustment',
                                    )}
                                  </Bidi>{' '}
                                  <Bidi dir="ltr">
                                    {entry.original_entry_id}
                                  </Bidi>
                                </div>
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
                                <Bidi dir="auto">
                                  {m[
                                    'workforce.report.ledger.originalMonth'
                                  ].replace(
                                    '{month}',
                                    entry.original_month ?? '',
                                  )}
                                </Bidi>
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

      {pointDialog && report && (
        <PointActionDialog
          operation={pointDialog.operation}
          staff={'staff' in pointDialog ? pointDialog.staff : null}
          entry={'entry' in pointDialog ? pointDialog.entry : null}
          targets={
            pointDialog.operation === 'reattribute'
              ? targetsForEntry(pointDialog.entry)
              : []
          }
          workspaceId={report.workspace_id}
          currentMonth={currentMonth}
          messages={m}
          postAction={postPointAdjustment}
          reattributeAction={reattributePointEntry}
          onClose={() => setPointDialog(null)}
          onSuccess={() => {
            setPointDialog(null);
            setPointFeedback('success');
          }}
        />
      )}
    </main>
  );
}
