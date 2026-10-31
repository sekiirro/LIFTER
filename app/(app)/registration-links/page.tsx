import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { authorize } from '../../../lib/auth/authorize';
import { createSessionClient } from '../../../lib/supabase/server';
import { loadRegistrationLinks } from '../../../lib/registration-links/read';
import { isUuid } from '../../../lib/registration-links/validation';
import { getMessages } from '../../../lib/i18n';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { EmptyState } from '../../../components/ui/States';
import { Alert } from '../../../components/ui/Alert';
import { RegistrationLinksManager } from '../../../components/registration-links/RegistrationLinksManager';
import styles from '../../../components/registration-links/registration-links.module.css';
export default async function RegistrationLinksPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
  }>;
}) {
  const actor = await requireActor();
  if (!actor.role) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value),
    m = getMessages(locale);
  const failure = (
    <main className={styles.main}>
      <h1>{m['registration.title']}</h1>
      <Alert tone="error" title={m['registration.unavailable']} />
      <a href="/registration-links">{m['registration.reload']}</a>
    </main>
  );
  let workspaces: { id: string; name: string }[];
  try {
    const client = await createSessionClient();
    if (!client) return failure;
    const r = await client.from('workspaces').select('id,name').order('name');
    if (r.error || !r.data) return failure;
    workspaces = r.data.filter((w) =>
      authorize(actor, 'generate_registration_link', w.id),
    );
  } catch {
    return failure;
  }
  if (!workspaces.length)
    return (
      <main className={styles.main}>
        <h1>{m['registration.title']}</h1>
        <EmptyState title={m['registration.noWorkspace']} />
      </main>
    );
  const params = await searchParams,
    workspaceId =
      params.workspace === undefined ? workspaces[0]!.id : params.workspace;
  if (
    !isUuid(workspaceId) ||
    !workspaces.some((w) => w.id === workspaceId) ||
    !authorize(actor, 'generate_registration_link', workspaceId)
  )
    notFound();
  const data = await loadRegistrationLinks(actor, workspaceId);
  if (data.status !== 'ok') return failure;
  return (
    <RegistrationLinksManager
      key={`${workspaceId}:${data.offers.map((v) => v.id).join(',')}`}
      workspaceId={workspaceId}
      workspaces={workspaces}
      data={data}
      canSchedule={authorize(
        actor,
        'configure_installment_schedule',
        workspaceId,
      )}
      locale={locale}
    />
  );
}
