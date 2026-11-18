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
import { ClientGoals } from '../../../../components/client-goals/ClientGoals';
import { readClientGoal } from '../../../../lib/leaderboard/client-goals';
import { ClientDetailsTabs } from './ClientDetailsTabs';
import { setClientGoalTypeAction } from './goal-actions';

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
  if (contextResult.error) throw new Error('Client context unavailable');
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
  const goal = await readClientGoal(
    actor,
    clientContext.workspaceId,
    clientContext.clientId,
  );

  return (
    <ClientDetailsTabs
      clientId={clientContext.clientId}
      workspaceId={clientContext.workspaceId}
      actorId={actor.userId}
      role={actor.role}
      locale={locale}
      messages={messages}
      notes={result.status === 'ok' ? result.notes : []}
      hasMore={result.status === 'ok' ? result.hasMore : false}
      status={result.status === 'ok' ? 'ready' : 'error'}
      goals={
        goal.status === 'ok' ? (
          <ClientGoals
            action={setClientGoalTypeAction}
            workspaceId={clientContext.workspaceId}
            clientId={clientContext.clientId}
            goalType={goal.goalType}
            nearTermGoal={goal.nearTermGoal}
            messages={{
              title: messages['clientGoals.title'],
              goalType: messages['clientGoals.goalType'],
              goalTypes: {
                fat_loss: messages['clientGoals.goalType.fatLoss'],
                muscle_gain: messages['clientGoals.goalType.muscleGain'],
                maintenance: messages['clientGoals.goalType.maintenance'],
              },
              notSet: messages['clientGoals.notSet'],
              nearTermGoal: messages['clientGoals.nearTermGoal'],
              nearTermGoalEmpty: messages['clientGoals.nearTermGoalEmpty'],
              save: messages['clientGoals.save'],
              saved: messages['clientGoals.saved'],
              failed: messages['states.error.description'],
            }}
          />
        ) : null
      }
    />
  );
}
