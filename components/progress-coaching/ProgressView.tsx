import { Bidi } from '../ui/Bidi';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/States';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { formatNumber, numberingLocale } from '../../lib/i18n/format';
import type {
  ProgressMeasurement,
  TimelineEvent,
} from '../../lib/progress-coaching/types';
import styles from './ProgressView.module.css';

function formatDate(value: string, locale: Locale): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat(numberingLocale(locale), {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  }).format(date);
}

/**
 * Measurements are read-only here: corrections are background-audited with no
 * history UI (FR-013), and progress photos stay on Telegram (FR-017).
 */
export function MeasurementsSection({
  measurements,
  locale,
  messages,
}: {
  measurements: readonly ProgressMeasurement[];
  locale: Locale;
  messages: Messages;
}) {
  return (
    <Card as="section" aria-labelledby="progress-measurements-title">
      <h2 id="progress-measurements-title" className={styles.heading}>
        {messages['progress.measurements.title']}
      </h2>
      {measurements.length === 0 ? (
        <EmptyState title={messages['progress.measurements.empty']} />
      ) : (
        <ul className={styles.list}>
          {measurements.map((m) => {
            const unit = locale === 'en' ? m.unitEn : m.unitAr;
            const label = m.label ? m.label[locale] : m.measurementType;
            return (
              <li key={m.id} className={styles.row}>
                <span className={styles.label}>
                  <Bidi>{label}</Bidi>
                </span>
                <span className={styles.value}>
                  <bdi dir="ltr">{formatNumber(m.value, locale)}</bdi>
                  {unit ? (
                    <>
                      {' '}
                      <Bidi>{unit}</Bidi>
                    </>
                  ) : null}
                </span>
                <time className={styles.meta} dateTime={m.recordedOn}>
                  {formatDate(m.recordedOn, locale)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function TimelineSection({
  events,
  locale,
  messages,
}: {
  events: readonly TimelineEvent[];
  locale: Locale;
  messages: Messages;
}) {
  return (
    <Card as="section" aria-labelledby="progress-timeline-title">
      <h2 id="progress-timeline-title" className={styles.heading}>
        {messages['timeline.title']}
      </h2>
      {events.length === 0 ? (
        <EmptyState title={messages['timeline.empty']} />
      ) : (
        <ol className={styles.list}>
          {events.map((event) => (
            <li
              key={`${event.eventType}:${event.referenceId}`}
              className={styles.row}
            >
              <span className={styles.label}>
                {messages[`timeline.event.${event.eventType}`]}
              </span>
              <time className={styles.meta} dateTime={event.occurredAt}>
                {formatDate(event.occurredAt, locale)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
