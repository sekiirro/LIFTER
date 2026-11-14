'use client';

import { Bidi } from '../ui/Bidi';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type { StaffAssignmentPreview } from '../../lib/forms/staff-contracts';
import styles from './StaffForms.module.css';

function formatCairoDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

export function StaffIntake({
  locale,
  assignments,
}: {
  locale: Locale;
  assignments: readonly StaffAssignmentPreview[];
}) {
  const messages = getMessages(locale);
  return (
    <section className={styles.panel} aria-labelledby="forms-intake-title">
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="forms-intake-title">
            {messages['forms.staffAssignedForms']}
          </h2>
          <p>{messages['forms.staffMockPreview']}</p>
        </div>
      </header>
      {assignments.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{messages['forms.staffNoAssignments']}</h3>
          <p>{messages['forms.staffNoAssignmentsHint']}</p>
        </div>
      ) : (
        <ol className={styles.assignmentList}>
          {assignments.map((assignment) => (
            <li className={styles.assignment} key={assignment.id}>
              <div className={styles.assignmentHeader}>
                <h3>{messages['forms.staffAssignment']}</h3>
                <span className={styles.statusTag}>
                  {
                    messages[
                      assignment.resolvedAt
                        ? 'forms.staffStatus.resolved'
                        : assignment.kind === 'client-late'
                          ? 'forms.staffStatus.clientLate'
                          : 'forms.staffStatus.trainerLate'
                    ]
                  }
                </span>
              </div>
              <dl className={styles.details}>
                <div>
                  <dt>{messages['forms.staffReference']}</dt>
                  <dd>
                    <Bidi>{assignment.id}</Bidi>
                  </dd>
                </div>
                <div>
                  <dt>{messages['forms.staffFormReference']}</dt>
                  <dd>
                    <Bidi>{assignment.formReference}</Bidi>
                  </dd>
                </div>
                <div>
                  <dt>{messages['forms.staffClientReference']}</dt>
                  <dd>
                    <Bidi>{assignment.clientReference}</Bidi>
                  </dd>
                </div>
                <div>
                  <dt>{messages['forms.staffDeadline']}</dt>
                  <dd>
                    <Bidi dir="auto">
                      {formatCairoDate(assignment.deadlineAt, locale)}
                    </Bidi>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
