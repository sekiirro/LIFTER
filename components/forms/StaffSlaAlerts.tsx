'use client';

import type { ReactNode } from 'react';
import { Bidi } from '../ui/Bidi';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { formatUiNumber, localizeUiDigits } from '../../lib/i18n/format-digits';
import type { StaffAssignmentPreview } from '../../lib/forms/staff-contracts';
import { getClientReminderSchedule } from '../../lib/forms/staff-policy';
import styles from './StaffForms.module.css';

function formatCairoDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function trainerPolicyMessage(template: string, locale: Locale): ReactNode[] {
  const values: Record<string, ReactNode> = {
    workflow: <Bidi dir="ltr">D-{localizeUiDigits('03', locale)}</Bidi>,
    recoveryDays: <Bidi>{formatUiNumber(7, locale)}</Bidi>,
    escalationHours: <Bidi>{formatUiNumber(24, locale)}</Bidi>,
  };
  return template
    .split(/(\{workflow\}|\{recoveryDays\}|\{escalationHours\})/g)
    .map((part, index) => (
      <span key={`copy-${index}`}>{part in values ? values[part] : part}</span>
    ));
}

export function StaffSlaAlerts({
  locale,
  assignments,
}: {
  locale: Locale;
  assignments: readonly StaffAssignmentPreview[];
}) {
  const messages = getMessages(locale);
  const clientCases = assignments.filter(
    (assignment) => assignment.kind === 'client-late',
  );
  const trainerCases = assignments.filter(
    (assignment) => assignment.kind === 'trainer-late',
  );

  return (
    <section className={styles.panel} aria-labelledby="forms-alerts-title">
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="forms-alerts-title">{messages['forms.staffSlaAlerts']}</h2>
          <p>{messages['forms.staffMockPreview']}</p>
        </div>
      </header>

      <section
        className={styles.policySection}
        aria-labelledby="client-late-title"
      >
        <h3 id="client-late-title">{messages['forms.staffClientLate']}</h3>
        <p>{messages['forms.staffDeadlinePolicy']}</p>
        <p>
          {messages['forms.defaultOnboardingForm']}:{' '}
          <Bidi>{formatUiNumber(3, locale)}</Bidi>{' '}
          {messages['forms.staffCalendarDays']}
        </p>
        <p>
          {messages['forms.staffOtherDeadline']}:{' '}
          <Bidi>
            {formatUiNumber(1, locale)}–{formatUiNumber(14, locale)}
          </Bidi>{' '}
          {messages['forms.staffCalendarDays']};{' '}
          {messages['forms.staffDefault']}{' '}
          <Bidi>{formatUiNumber(3, locale)}</Bidi>
        </p>
        <ol className={styles.timeline}>
          <li>
            <strong>
              <Bidi>+{formatUiNumber(24, locale)}</Bidi>{' '}
              {messages['forms.staffHours']}
            </strong>
            <span>{messages['forms.staffClientFirstAlert']}</span>
          </li>
          <li>
            <strong>
              <Bidi>+{formatUiNumber(48, locale)}</Bidi>{' '}
              {messages['forms.staffHours']}
            </strong>
            <span>{messages['forms.staffClientEscalation']}</span>
          </li>
        </ol>
        <ul className={styles.scheduleList}>
          {clientCases.map((assignment) => {
            const schedule = getClientReminderSchedule(
              assignment.deadlineAt,
              assignment.trainerAssigned,
            );
            return (
              <li key={assignment.id}>
                <strong>
                  <Bidi>{assignment.id}</Bidi>
                </strong>
                <span>
                  {schedule.firstAudience === 'trainer'
                    ? messages['forms.staffTrainerAt']
                    : messages['forms.staffOwnersAt']}{' '}
                  <Bidi dir="auto">
                    {formatCairoDate(schedule.firstAt, locale)}
                  </Bidi>
                </span>
                <span>
                  {messages['forms.staffOwnersAt']}{' '}
                  <Bidi dir="auto">
                    {formatCairoDate(schedule.escalationAt, locale)}
                  </Bidi>
                </span>
              </li>
            );
          })}
        </ul>
        <p className={styles.hint}>
          {messages['forms.staffAuthorizedOwnersOnly']}
        </p>
      </section>

      <section
        className={styles.policySection}
        aria-labelledby="trainer-late-title"
      >
        <h3 id="trainer-late-title">{messages['forms.staffTrainerLate']}</h3>
        <p>
          {trainerPolicyMessage(
            messages['forms.staffTrainerLatePolicy'],
            locale,
          )}
        </p>
        <ul className={styles.scheduleList}>
          {trainerCases.map((assignment) => (
            <li key={assignment.id}>
              <strong>
                <Bidi>{assignment.id}</Bidi>
              </strong>
              <span>
                {messages['forms.staffD03Deadline'].split('{deadline}')[0]}
                <Bidi dir="ltr">D-{localizeUiDigits('03', locale)}</Bidi>
                {messages['forms.staffD03Deadline'].split('{deadline}')[1]}
              </span>
              <span>
                <Bidi dir="auto">
                  {formatCairoDate(assignment.deadlineAt, locale)}
                </Bidi>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>{messages['forms.staffSyntheticOnly']}</p>
      </section>
    </section>
  );
}
