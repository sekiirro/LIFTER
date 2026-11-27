import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { ToastProvider } from '../../../../components/ui/Toast';
import { readTrainerCheckins } from '../../../../lib/workforce/checkins';
import { TrainerCheckinsView } from '../../../../components/workforce/TrainerCheckinsView';
import {
  confirmTrainerFollowupAction,
  loadMoreTrainerCheckinsAction,
} from './actions';
import { createSessionClient } from '../../../../lib/supabase/server';

export default async function TrainerCheckinsPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  // Role check: Only PO and Trainers can access. WO and Sales see denied state without existence disclosure.
  if (
    !actor.role ||
    (actor.role !== 'platform_owner' && actor.role !== 'trainer')
  ) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <TrainerCheckinsView
          workspaceId=""
          locale={locale}
          checkins={[]}
          denied={true}
          confirmFollowup={confirmTrainerFollowupAction}
        />
      </ToastProvider>
    );
  }

  const client = await createSessionClient();
  if (!client) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <TrainerCheckinsView
          workspaceId=""
          locale={locale}
          checkins={[]}
          denied={true}
          confirmFollowup={confirmTrainerFollowupAction}
        />
      </ToastProvider>
    );
  }

  // Resolve workspace
  let workspacesQuery = client
    .from('workspaces')
    .select('id,name')
    .order('name');
  if (actor.role !== 'platform_owner') {
    if (actor.activeWorkspaceIds.length === 0) {
      return (
        <ToastProvider dismissLabel={messages['toast.dismiss']}>
          <TrainerCheckinsView
            workspaceId=""
            locale={locale}
            checkins={[]}
            denied={true}
            confirmFollowup={confirmTrainerFollowupAction}
          />
        </ToastProvider>
      );
    }
    workspacesQuery = workspacesQuery.in('id', actor.activeWorkspaceIds);
  }

  const { data: workspaces, error: wsError } = await workspacesQuery;
  if (wsError || !workspaces?.length) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <TrainerCheckinsView
          workspaceId=""
          locale={locale}
          checkins={[]}
          denied={true}
          confirmFollowup={confirmTrainerFollowupAction}
        />
      </ToastProvider>
    );
  }

  const sp = await searchParams;
  const requestedWs = Array.isArray(sp.workspace)
    ? sp.workspace[0]
    : sp.workspace;
  const activeWorkspace =
    workspaces.find((w) => w.id === requestedWs) ?? workspaces[0]!;

  // Resolve Cairo date range (default +/- 30 days)
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // 'YYYY-MM-DD'

  const cairoToday = new Date(`${parts}T00:00:00Z`);
  const defaultFromDate = new Date(cairoToday.getTime() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const defaultToDate = new Date(cairoToday.getTime() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const fromDate =
    (Array.isArray(sp.from) ? sp.from[0] : sp.from) || defaultFromDate;
  const toDate = (Array.isArray(sp.to) ? sp.to[0] : sp.to) || defaultToDate;

  const result = await readTrainerCheckins({
    workspaceId: activeWorkspace.id,
    from: fromDate,
    to: toDate,
  });

  if (result.status === 'denied') {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <TrainerCheckinsView
          key={JSON.stringify([
            activeWorkspace.id,
            fromDate,
            toDate,
            locale,
            'denied',
          ])}
          workspaceId={activeWorkspace.id}
          locale={locale}
          checkins={[]}
          denied={true}
          confirmFollowup={confirmTrainerFollowupAction}
        />
      </ToastProvider>
    );
  }

  if (result.status === 'error') {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <TrainerCheckinsView
          key={JSON.stringify([
            activeWorkspace.id,
            fromDate,
            toDate,
            locale,
            'error',
          ])}
          workspaceId={activeWorkspace.id}
          locale={locale}
          checkins={[]}
          error={true}
          confirmFollowup={confirmTrainerFollowupAction}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <TrainerCheckinsView
        key={JSON.stringify([
          activeWorkspace.id,
          fromDate,
          toDate,
          locale,
          createHash('sha256')
            .update(JSON.stringify(result.checkins))
            .digest('hex'),
        ])}
        workspaceId={activeWorkspace.id}
        locale={locale}
        checkins={result.checkins}
        hasMore={result.checkins.length === 100}
        onLoadMore={loadMoreTrainerCheckinsAction.bind(null, {
          workspaceId: activeWorkspace.id,
          from: fromDate,
          to: toDate,
        })}
        confirmFollowup={confirmTrainerFollowupAction}
      />
    </ToastProvider>
  );
}
