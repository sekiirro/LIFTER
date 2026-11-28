import { cookies } from 'next/headers';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { createSessionClient } from '../../../../lib/supabase/server';
import { loadStrikeReview } from '../../../../lib/workforce/strikes';
import { ToastProvider } from '../../../../components/ui/Toast';
import { StrikeReviewView } from '../../../../components/workforce/StrikeReviewView';
import { correctStrikeAction } from './actions';

type Search = { workspace?: string | string[] };

export default async function StrikeReviewPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const denied = () => (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <StrikeReviewView
        locale={locale}
        messages={messages}
        workspaceId=""
        trainers={[]}
        status="denied"
        onCorrect={correctStrikeAction}
      />
    </ToastProvider>
  );

  if (actor.role !== 'platform_owner') return denied();
  const client = await createSessionClient();
  if (!client) return denied();
  const { data: workspaces, error } = await client
    .from('workspaces')
    .select('id,name')
    .order('name');
  if (error || !workspaces?.length) return denied();

  const params = await searchParams;
  const requested = Array.isArray(params.workspace)
    ? params.workspace[0]
    : params.workspace;
  const workspace =
    workspaces.find((item) => item.id === requested) ?? workspaces[0]!;
  const loaded = await loadStrikeReview(client, workspace.id);
  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <StrikeReviewView
        locale={locale}
        messages={messages}
        workspaceId={workspace.id}
        workspaces={workspaces}
        selectedWorkspaceName={workspace.name}
        trainers={loaded.status === 'ok' ? loaded.trainers : []}
        status={loaded.status}
        onCorrect={correctStrikeAction}
      />
    </ToastProvider>
  );
}
