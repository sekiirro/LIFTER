import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getActor } from '../../../../lib/auth/actor';
import { roleHasCapability } from '../../../../lib/auth/capabilities';
import { createSessionClient } from '../../../../lib/supabase/server';
import { readClientNotes } from '../../../../lib/client-notes/service';
import { resolveStaffClientContext } from '../../../../lib/client-notes/client-details-context';
import { isUuid } from '../../../../lib/client-notes/validation';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { ClientDetailsTabs } from './ClientDetailsTabs';

export default async function ClientDetailsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();

  const actor = await getActor();
  if (!actor?.role || !roleHasCapability(actor.role, 'coaching_work'))
    notFound();

  const session = await createSessionClient();
  if (!session) notFound();
  const contextResult = await session.rpc('client_notes_client_context', {
    p_client_id: clientId,
  });
  if (contextResult.error) notFound();
  const clientContext = resolveStaffClientContext(
    actor,
    clientId,
    contextResult.data,
  );
  if (!clientContext) notFound();

  const result = await readClientNotes(clientContext);
  if (result.status === 'denied' || result.status === 'invalid_input')
    notFound();

  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  return (
    <ClientDetailsTabs
      clientId={clientContext.clientId}
      workspaceId={clientContext.workspaceId}
      actorId={actor.userId}
      role={actor.role}
      locale={locale}
      messages={messages}
      notes={result.status === 'ok' ? result.notes : []}
      status={result.status === 'ok' ? 'ready' : 'error'}
    />
  );
}
