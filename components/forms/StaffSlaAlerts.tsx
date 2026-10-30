'use client';

import { Bidi } from '../ui/Bidi';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
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
          {messages['forms.defaultOnboardingForm']}: <Bidi>3</Bidi>{' '}
          {messages['forms.staffCalendarDays']}
        </p>
        <p>
          {messages['forms.staffOtherDeadline']}: <Bidi>1–14</Bidi>{' '}
          {messages['forms.staffCalendarDays']};{' '}
          {messages['forms.staffDefault']} <Bidi>3</Bidi>
        </p>
        <ol className={styles.timeline}>
          <li>
            <strong>
              <Bidi>+24</Bidi> {messages['forms.staffHours']}
            </strong>
            <span>{messages['forms.staffClientFirstAlert']}</span>
          </li>
          <li>
            <strong>
              <Bidi>+48</Bidi> {messages['forms.staffHours']}
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
        <p>{messages['forms.staffTrainerLatePolicy']}</p>
        <ul className={styles.scheduleList}>
          {trainerCases.map((assignment) => (
            <li key={assignment.id}>
              <strong>
                <Bidi>{assignment.id}</Bidi>
              </strong>
              <span>{messages['forms.staffD03Deadline']}</span>
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
