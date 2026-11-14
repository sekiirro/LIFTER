import type { ReactNode } from 'react';
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

/** Authored question text plus unit, e.g. "Body weight (kg)". */
export function measurementFieldLabel(
  m: ProgressMeasurement,
  locale: Locale,
): string {
  const label = m.label ? m.label[locale] : m.measurementType;
  const unit = locale === 'en' ? m.unitEn : m.unitAr;
  return unit ? `${label} (${unit})` : label;
}

/**
 * Measurement list. There is no correction-history UI (FR-013: corrections are
 * background-audited only) and no photo upload (FR-017: photos stay on Telegram).
 * Staff pages pass `rowAction` to render the FR-013 correction control.
 */
export function MeasurementsSection({
  measurements,
  locale,
  messages,
  rowAction,
  actions,
}: {
  measurements: readonly ProgressMeasurement[];
  locale: Locale;
  messages: Messages;
  rowAction?: (measurement: ProgressMeasurement) => ReactNode;
  /** Rendered under the heading, e.g. the client add controls. */
  actions?: ReactNode;
}) {
  return (
    <Card as="section" aria-labelledby="progress-measurements-title">
      <h2 id="progress-measurements-title" className={styles.heading}>
        {messages['progress.measurements.title']}
      </h2>
      {actions}
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
                {rowAction ? rowAction(m) : null}
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
