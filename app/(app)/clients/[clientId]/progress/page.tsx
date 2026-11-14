import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MeasurementsSection,
  TimelineSection,
} from '../../../../../components/progress-coaching/ProgressView';
import styles from '../../../../../components/progress-coaching/ProgressView.module.css';
import { getActor } from '../../../../../lib/auth/actor';
import { roleHasCapability } from '../../../../../lib/auth/capabilities';
import { resolveStaffClientContext } from '../../../../../lib/client-notes/client-details-context';
import { isUuid } from '../../../../../lib/client-notes/validation';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { getMessages } from '../../../../../lib/i18n';
import { readStaffClientProgress } from '../../../../../lib/progress-coaching/service';
import { createSessionClient } from '../../../../../lib/supabase/server';

export default async function StaffClientProgressPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const actor = await getActor();
  // FR-030: trainers, workspace owners and platform owners; Sales has no coaching_work.
  if (!actor?.role || !roleHasCapability(actor.role, 'coaching_work'))
    notFound();
  const session = await createSessionClient();
  if (!session) notFound();
  const contextResult = await session.rpc('client_notes_client_context', {
    p_client_id: clientId,
  });
  if (contextResult.error) throw new Error('Client context unavailable');
  const target = resolveStaffClientContext(actor, clientId, contextResult.data);
  if (!target) notFound();

  const result = await readStaffClientProgress(target);
  if (result.status === 'denied' || result.status === 'not_found') notFound();
  if (result.status !== 'ok') throw new Error('Progress unavailable');

  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{messages['progress.title']}</h1>
      <MeasurementsSection
        measurements={result.measurements}
        locale={locale}
        messages={messages}
      />
      <TimelineSection
        events={result.timeline}
        locale={locale}
        messages={messages}
      />
    </main>
  );
}
