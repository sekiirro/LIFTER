import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MeasurementsSection,
  TimelineSection,
} from '../../../components/progress-coaching/ProgressView';
import styles from '../../../components/progress-coaching/ProgressView.module.css';
import { authorizeClientAccess } from '../../../lib/client-access/authorize';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { readClientSelfProgress } from '../../../lib/progress-coaching/service';

export default async function ClientProgressPage() {
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const result = await readClientSelfProgress();
  if (result.status === 'denied' || result.status === 'not_found') notFound();
  if (result.status !== 'ok') throw new Error('Progress unavailable');

  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{messages['progress.title']}</h1>
      {/* FR-005: check-ins never gate login or access. */}
      <p className={styles.note}>{messages['checkin.completed.notGate']}</p>
      {result.measurementsVisible ? (
        <MeasurementsSection
          measurements={result.measurements}
          locale={locale}
          messages={messages}
        />
      ) : null}
      <TimelineSection
        events={result.timeline}
        locale={locale}
        messages={messages}
      />
    </main>
  );
}
