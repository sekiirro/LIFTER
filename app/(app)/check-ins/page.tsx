import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { CheckinConfiguration } from '../../../components/progress-coaching/CheckinConfiguration';
import styles from '../../../components/progress-coaching/ProgressView.module.css';
import { ToastProvider } from '../../../components/ui/Toast';
import { requireActor } from '../../../lib/auth/actor';
import { roleHasCapability } from '../../../lib/auth/capabilities';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { readCheckinConfiguration } from '../../../lib/progress-coaching/checkins/configuration';
import { createSessionClient } from '../../../lib/supabase/server';
import { configureCheckinFormAction } from './actions';

type Workspace = { id: string; name: string };

/**
 * Staff weekly check-in configuration (spec 023 US1). Workspace selection follows
 * the F15 forms page: the first accessible workspace, or `?workspace=<id>`.
 */
export default async function CheckinConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (!actor.role || !roleHasCapability(actor.role, 'assign_intake_form'))
    notFound();
  const client = await createSessionClient();
  if (!client) notFound();
  let query = client.from('workspaces').select('id,name').order('name');
  if (actor.role !== 'platform_owner') {
    if (actor.activeWorkspaceIds.length === 0) notFound();
    query = query.in('id', actor.activeWorkspaceIds);
  }
  const { data, error } = await query;
  if (error || !data?.length) notFound();
  const workspaces = data as Workspace[];
  const requested = (await searchParams).workspace;
  const requestedId = Array.isArray(requested) ? '' : requested;
  const workspace =
    workspaces.find((item) => item.id === requestedId) ?? workspaces[0]!;

  const result = await readCheckinConfiguration(workspace.id);
  if (result.status === 'denied') notFound();
  if (result.status !== 'ok')
    throw new Error('Check-in configuration unavailable');

  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <main className={styles.page}>
        <h1 className={styles.title}>{messages['checkin.config.title']}</h1>
        <CheckinConfiguration
          key={`${workspace.id}:${result.current?.formId ?? ''}`}
          workspaceId={workspace.id}
          locale={locale}
          forms={result.forms}
          currentFormId={result.current?.formId ?? null}
          configure={configureCheckinFormAction}
          labels={{
            select: messages['checkin.config.select'],
            save: messages['checkin.config.save'],
            saved: messages['checkin.config.saved'],
            invalid: messages['checkin.config.invalid'],
            conflict: messages['checkin.config.conflict'],
            failed: messages['states.error.description'],
            empty: messages['states.empty.title'],
          }}
        />
      </main>
    </ToastProvider>
  );
}
