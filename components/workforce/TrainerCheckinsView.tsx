'use client';

import { useState, useTransition, useMemo } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { numberingLocale } from '../../lib/i18n/format';
import { getMessages, type Messages } from '../../lib/i18n';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, NoResults, ErrorState } from '../ui/States';
import { Bidi } from '../ui/Bidi';
import { useToast } from '../ui/Toast';
import type {
  TrainerCheckinRow,
  FormStatus,
  FollowupStatus,
  FormStatusFilter,
  FollowupStatusFilter,
} from '../../lib/workforce/types';
import styles from './TrainerCheckins.module.css';

export function formatCairoDateTime(
  isoString: string | null | undefined,
  locale: Locale,
): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(numberingLocale(locale), {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '—';
  }
}

export type TrainerCheckinsViewProps = {
  workspaceId: string;
  locale: Locale;
  checkins: TrainerCheckinRow[];
  denied?: boolean;
  error?: boolean;
  onRetry?: () => void;
  confirmFollowup: (params: {
    workspaceId: string;
    assignmentId: string;
    currentFollowupStatus: string;
  }) => Promise<{ status: string; transitionId?: string }>;
};

export function TrainerCheckinsView({
  workspaceId,
  locale,
  checkins: initialCheckins,
  denied = false,
  error = false,
  onRetry,
  confirmFollowup,
}: TrainerCheckinsViewProps) {
  const messages: Messages = getMessages(locale);
  const toast = useToast();

  const [items, setItems] = useState<TrainerCheckinRow[]>(initialCheckins);
  const [formFilter, setFormFilter] = useState<FormStatusFilter>('all');
  const [followupFilter, setFollowupFilter] =
    useState<FollowupStatusFilter>('all');
  const [selectedItem, setSelectedItem] = useState<TrainerCheckinRow | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (formFilter !== 'all' && item.form_status !== formFilter) {
        return false;
      }
      if (followupFilter !== 'all' && item.followup_status !== followupFilter) {
        return false;
      }
      return true;
    });
  }, [items, formFilter, followupFilter]);

  // If permission denied, show only the denied message without disclosing data existence
  if (denied) {
    return (
      <main className={styles.page}>
        <div
          className={styles.deniedAlert}
          role="alert"
          data-testid="workforce-denied"
        >
          <h2 className={styles.deniedTitle}>
            {messages['workforce.checkin.denied']}
          </h2>
        </div>
      </main>
    );
  }

  // If load error, show the error state with retry
  if (error) {
    return (
      <main className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            {messages['workforce.checkin.title']}
          </h1>
        </div>
        <ErrorState
          title={messages['workforce.checkin.loadError']}
          retryLabel={messages['states.retry']}
          onRetry={onRetry ?? (() => window.location.reload())}
        />
      </main>
    );
  }

  const handleConfirm = () => {
    if (!selectedItem) return;
    const targetAssignmentId = selectedItem.assignment_id;
    const currentStatus = selectedItem.followup_status;

    startTransition(async () => {
      try {
        const result = await confirmFollowup({
          workspaceId,
          assignmentId: targetAssignmentId,
          currentFollowupStatus: currentStatus,
        });

        if (result.status === 'already_recorded') {
          toast.success(messages['workforce.checkin.followUp.alreadyRecorded']);
          setItems((prev) =>
            prev.map((row) =>
              row.assignment_id === targetAssignmentId
                ? {
                    ...row,
                    followup_status: 'Followed Up',
                    followup_at: row.followup_at ?? new Date().toISOString(),
                  }
                : row,
            ),
          );
        } else if (result.status === 'ok') {
          toast.success(messages['workforce.checkin.followUp.success']);
          setItems((prev) =>
            prev.map((row) =>
              row.assignment_id === targetAssignmentId
                ? {
                    ...row,
                    followup_status: 'Followed Up',
                    followup_at: new Date().toISOString(),
                  }
                : row,
            ),
          );
        } else {
          toast.success(messages['workforce.checkin.followUp.error']);
        }
      } catch {
        toast.success(messages['workforce.checkin.followUp.error']);
      } finally {
        setSelectedItem(null);
      }
    });
  };

  const getFormStatusLabel = (status: FormStatus) => {
    switch (status) {
      case 'Scheduled':
        return messages['workforce.checkin.formStatus.scheduled'];
      case 'Awaiting Client':
        return messages['workforce.checkin.formStatus.awaitingClient'];
      case 'Client Overdue':
        return messages['workforce.checkin.formStatus.clientOverdue'];
      case 'Submitted':
        return messages['workforce.checkin.formStatus.submitted'];
    }
  };

  const getFormStatusBadgeClass = (status: FormStatus) => {
    switch (status) {
      case 'Submitted':
        return styles.badgeSuccess;
      case 'Client Overdue':
        return styles.badgeError;
      case 'Awaiting Client':
        return styles.badgeWarning;
      case 'Scheduled':
      default:
        return styles.badgeNeutral;
    }
  };

  const getFollowupStatusLabel = (status: FollowupStatus) => {
    switch (status) {
      case 'Pending':
        return messages['workforce.checkin.followStatus.pending'];
      case 'Followed Up':
        return messages['workforce.checkin.followStatus.followedUp'];
      case 'Late':
        return messages['workforce.checkin.followStatus.late'];
      case 'Disputed':
        return messages['workforce.checkin.followStatus.disputed'];
    }
  };

  const getFollowupStatusBadgeClass = (status: FollowupStatus) => {
    switch (status) {
      case 'Followed Up':
        return styles.badgeSuccess;
      case 'Late':
        return styles.badgeError;
      case 'Disputed':
        return styles.badgeWarning;
      case 'Pending':
      default:
        return styles.badgeNeutral;
    }
  };

  const hasLateHistory = (item: TrainerCheckinRow) => {
    return (
      item.followup_status === 'Late' ||
      item.followup_history?.some((h) => h.status === 'Late')
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{messages['workforce.checkin.title']}</h1>
      </header>

      {/* Filters */}
      <section
        className={styles.filtersGroup}
        aria-label={messages['staff.clientDirectory.filters']}
        data-testid="checkin-filters"
      >
        <span className={styles.filtersLabel}>
          {messages['staff.clientDirectory.filters']}
        </span>

        <div className={styles.filterItem}>
          <label htmlFor="form-status-filter">
            {messages['workforce.checkin.filter.formStatus']}
          </label>
          <select
            id="form-status-filter"
            className={styles.filterSelect}
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value as FormStatusFilter)}
            data-testid="filter-form-status"
          >
            <option value="all">{messages['catalog.all']}</option>
            <option value="Scheduled">
              {messages['workforce.checkin.formStatus.scheduled']}
            </option>
            <option value="Awaiting Client">
              {messages['workforce.checkin.formStatus.awaitingClient']}
            </option>
            <option value="Client Overdue">
              {messages['workforce.checkin.formStatus.clientOverdue']}
            </option>
            <option value="Submitted">
              {messages['workforce.checkin.formStatus.submitted']}
            </option>
          </select>
        </div>

        <div className={styles.filterItem}>
          <label htmlFor="followup-status-filter">
            {messages['workforce.checkin.filter.followUpStatus']}
          </label>
          <select
            id="followup-status-filter"
            className={styles.filterSelect}
            value={followupFilter}
            onChange={(e) =>
              setFollowupFilter(e.target.value as FollowupStatusFilter)
            }
            data-testid="filter-followup-status"
          >
            <option value="all">{messages['catalog.all']}</option>
            <option value="Pending">
              {messages['workforce.checkin.followStatus.pending']}
            </option>
            <option value="Followed Up">
              {messages['workforce.checkin.followStatus.followedUp']}
            </option>
            <option value="Late">
              {messages['workforce.checkin.followStatus.late']}
            </option>
            <option value="Disputed">
              {messages['workforce.checkin.followStatus.disputed']}
            </option>
          </select>
        </div>
      </section>

      {/* Empty States */}
      {items.length === 0 ? (
        <EmptyState title={messages['workforce.checkin.empty']} />
      ) : filteredItems.length === 0 ? (
        <NoResults title={messages['workforce.checkin.noResults']} />
      ) : (
        <>
          {/* Desktop Table View */}
          <div className={styles.tableWrapper}>
            <table
              className={styles.table}
              data-testid="trainer-checkins-table"
            >
              <thead>
                <tr>
                  <th>{messages['registrationApproval.name']}</th>
                  <th>{messages['clientSignup.phone']}</th>
                  <th>{messages['workforce.checkin.column.platform']}</th>
                  <th>{messages['clientSignup.telegramUsername']}</th>
                  <th>{messages['workforce.checkin.column.formSchedule']}</th>
                  <th>{messages['workforce.checkin.column.submittedAt']}</th>
                  <th>{messages['workforce.checkin.filter.formStatus']}</th>
                  <th>{messages['workforce.checkin.column.deadline']}</th>
                  <th>{messages['workforce.checkin.filter.followUpStatus']}</th>
                  <th>{messages['workforce.checkin.column.followedUpAt']}</th>
                  <th>{messages['staff.clientDirectory.assignment']}</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const canFollowUp =
                    item.form_status === 'Submitted' &&
                    item.followup_status !== 'Followed Up';
                  const showLate = hasLateHistory(item);

                  return (
                    <tr
                      key={item.assignment_id}
                      data-testid={`checkin-row-${item.assignment_id}`}
                    >
                      <td data-field="client-name">
                        <strong>{item.client_name}</strong>
                      </td>
                      <td data-field="phone">
                        <Bidi>{item.phone_e164 ?? '—'}</Bidi>
                      </td>
                      <td data-field="platform">
                        <Bidi>{item.username_normalized ?? '—'}</Bidi>
                      </td>
                      <td data-field="telegram">
                        <Bidi>
                          {item.telegram_username
                            ? `@${item.telegram_username}`
                            : '—'}
                        </Bidi>
                      </td>
                      <td data-field="form-schedule">
                        <Bidi>
                          {formatCairoDateTime(item.scheduled_at, locale)}
                        </Bidi>
                      </td>
                      <td data-field="submitted-at">
                        <Bidi>
                          {formatCairoDateTime(item.submitted_at, locale)}
                        </Bidi>
                      </td>
                      <td data-field="form-status">
                        <span
                          className={`${styles.badge} ${getFormStatusBadgeClass(item.form_status)}`}
                        >
                          {getFormStatusLabel(item.form_status)}
                        </span>
                      </td>
                      <td data-field="deadline">
                        <Bidi>
                          {formatCairoDateTime(item.followup_due_at, locale)}
                        </Bidi>
                      </td>
                      <td data-field="followup-status">
                        <div className={styles.cellStack}>
                          <span
                            className={`${styles.badge} ${getFollowupStatusBadgeClass(item.followup_status)}`}
                          >
                            {getFollowupStatusLabel(item.followup_status)}
                          </span>
                          {showLate && (
                            <span
                              className={styles.lateWarning}
                              data-testid="late-warning"
                            >
                              {messages['workforce.checkin.lateWarning']}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-field="followed-up-at">
                        <Bidi>
                          {formatCairoDateTime(item.followup_at, locale)}
                        </Bidi>
                      </td>
                      <td data-field="trainer">
                        <Bidi>{item.responsible_trainer_id ?? '—'}</Bidi>
                      </td>
                      <td data-field="action">
                        {canFollowUp && (
                          <Button
                            variant="primary"
                            onClick={() => setSelectedItem(item)}
                            data-testid={`followup-btn-${item.assignment_id}`}
                          >
                            {messages['workforce.checkin.followUp.action']}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div
            className={styles.mobileList}
            data-testid="trainer-checkins-cards"
          >
            {filteredItems.map((item) => {
              const canFollowUp =
                item.form_status === 'Submitted' &&
                item.followup_status !== 'Followed Up';
              const showLate = hasLateHistory(item);

              return (
                <article
                  key={item.assignment_id}
                  className={styles.mobileCard}
                  data-testid={`checkin-card-${item.assignment_id}`}
                >
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['registrationApproval.name']}
                    </span>
                    <strong className={styles.cardValue}>
                      {item.client_name}
                    </strong>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['clientSignup.phone']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>{item.phone_e164 ?? '—'}</Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.column.platform']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>{item.username_normalized ?? '—'}</Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['clientSignup.telegramUsername']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>
                        {item.telegram_username
                          ? `@${item.telegram_username}`
                          : '—'}
                      </Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.column.formSchedule']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>
                        {formatCairoDateTime(item.scheduled_at, locale)}
                      </Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.column.submittedAt']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>
                        {formatCairoDateTime(item.submitted_at, locale)}
                      </Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.filter.formStatus']}
                    </span>
                    <span
                      className={`${styles.badge} ${getFormStatusBadgeClass(item.form_status)}`}
                    >
                      {getFormStatusLabel(item.form_status)}
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.column.deadline']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>
                        {formatCairoDateTime(item.followup_due_at, locale)}
                      </Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.filter.followUpStatus']}
                    </span>
                    <div className={styles.cellStack}>
                      <span
                        className={`${styles.badge} ${getFollowupStatusBadgeClass(item.followup_status)}`}
                      >
                        {getFollowupStatusLabel(item.followup_status)}
                      </span>
                      {showLate && (
                        <span
                          className={styles.lateWarning}
                          data-testid="late-warning-mobile"
                        >
                          {messages['workforce.checkin.lateWarning']}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['workforce.checkin.column.followedUpAt']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>
                        {formatCairoDateTime(item.followup_at, locale)}
                      </Bidi>
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>
                      {messages['staff.clientDirectory.assignment']}
                    </span>
                    <span className={styles.cardValue}>
                      <Bidi>{item.responsible_trainer_id ?? '—'}</Bidi>
                    </span>
                  </div>

                  {canFollowUp && (
                    <div className={styles.cardActions}>
                      <Button
                        variant="primary"
                        onClick={() => setSelectedItem(item)}
                        data-testid={`followup-btn-mobile-${item.assignment_id}`}
                      >
                        {messages['workforce.checkin.followUp.action']}
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={selectedItem !== null}
        title={messages['workforce.checkin.followUp.confirmTitle']}
        description={messages['workforce.checkin.followUp.confirmBody']}
        confirmLabel={messages['dialog.confirm']}
        cancelLabel={messages['dialog.cancel']}
        loading={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setSelectedItem(null)}
      />
    </main>
  );
}
