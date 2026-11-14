import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ClientLeaderboardSection } from '../../../components/leaderboard/ClientLeaderboardSection';
import { MeasurementAdd } from '../../../components/progress-coaching/MeasurementAdd';
import { MeasurementCorrection } from '../../../components/progress-coaching/MeasurementCorrection';
import {
  MeasurementsSection,
  TimelineSection,
  measurementFieldLabel,
} from '../../../components/progress-coaching/ProgressView';
import styles from '../../../components/progress-coaching/ProgressView.module.css';
import { ToastProvider } from '../../../components/ui/Toast';
import { authorizeClientAccess } from '../../../lib/client-access/authorize';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { readClientSelfProgress } from '../../../lib/progress-coaching/service';
import {
  recordOwnMeasurementAction,
  updateOwnMeasurementAction,
} from './actions';

export default async function ClientProgressPage() {
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const result = await readClientSelfProgress();
  if (result.status === 'denied' || result.status === 'not_found') notFound();
  if (result.status !== 'ok') throw new Error('Progress unavailable');

  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  // Approved copy: S55-PO-10, S57-PO-12 and S57-PO-13.
  const failed = messages['states.error.description'];
  const addLabels = {
    add: messages['progress.measurement.add'],
    value: messages['progress.measurement.value'],
    date: messages['progress.measurement.date'],
    save: messages['progress.measurement.save'],
    cancel: messages['dialog.cancel'],
    saved: messages['progress.measurement.saved'],
    duplicate: messages['progress.measurement.duplicateSameDay'],
    failed,
  };
  const editLabels = {
    edit: messages['progress.measurement.edit'],
    confirm: messages['progress.measurement.save'],
    cancel: messages['dialog.cancel'],
    saved: messages['progress.measurement.saved'],
    failed,
  };
  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <main className={styles.page}>
        <h1 className={styles.title}>{messages['progress.title']}</h1>
        {/* FR-005: check-ins never gate login or access. */}
        <p className={styles.note}>{messages['checkin.completed.notGate']}</p>
        {result.measurementsVisible ? (
          <MeasurementsSection
            measurements={result.measurements}
            locale={locale}
            messages={messages}
            actions={
              result.entryTypes.length > 0 ? (
                <ul className={styles.list} data-testid="progress-entry-types">
                  {result.entryTypes.map((type) => {
                    const typeLabel = type.label ? type.label[locale] : type.id;
                    return (
                      <li key={type.id} className={styles.row}>
                        <span className={styles.label}>{typeLabel}</span>
                        <MeasurementAdd
                          workspaceId={result.workspaceId}
                          clientId={result.clientId}
                          measurementType={type.id}
                          typeLabel={typeLabel}
                          unit={locale === 'en' ? type.unitEn : type.unitAr}
                          today={result.today}
                          labels={addLabels}
                          record={recordOwnMeasurementAction}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : null
            }
            // Check-in rows stay trainer-only; the client edits own manual rows.
            rowAction={(m) =>
              m.sourceKind === 'manual' ? (
                <MeasurementCorrection
                  workspaceId={result.workspaceId}
                  clientId={result.clientId}
                  measurementId={m.id}
                  value={m.value}
                  updatedAt={m.updatedAt}
                  fieldLabel={measurementFieldLabel(m, locale)}
                  labels={editLabels}
                  correct={updateOwnMeasurementAction}
                />
              ) : null
            }
          />
        ) : null}
        <TimelineSection
          events={result.timeline}
          locale={locale}
          messages={messages}
        />
        {/* F24 (S57-PO-12): Top 5 and private rank live inside Progress. */}
        <ClientLeaderboardSection locale={locale} messages={messages} />
      </main>
    </ToastProvider>
  );
}
