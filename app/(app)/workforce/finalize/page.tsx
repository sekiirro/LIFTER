import { cookies } from 'next/headers';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { createSessionClient } from '../../../../lib/supabase/server';
import { ToastProvider } from '../../../../components/ui/Toast';
import {
  getCurrentCairoMonth,
  getEndedCairoMonths,
} from '../../../../lib/workforce/finalize';
import { FinalizeMonthView } from '../../../../components/workforce/FinalizeMonthView';
import { finalizeMonthAction } from './actions';

type Search = { workspace?: string | string[]; month?: string | string[] };

export default async function FinalizeMonthPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  // Platform Owner only gate: non-PO roles see denied string without existence disclosure
  if (actor.role !== 'platform_owner') {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <FinalizeMonthView
          workspaceId=""
          locale={locale}
          messages={messages}
          endedMonths={[]}
          currentCairoMonth=""
          denied={true}
          onFinalizeAction={finalizeMonthAction}
        />
      </ToastProvider>
    );
  }

  const client = await createSessionClient();
  if (!client) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <FinalizeMonthView
          workspaceId=""
          locale={locale}
          messages={messages}
          endedMonths={[]}
          currentCairoMonth=""
          denied={true}
          onFinalizeAction={finalizeMonthAction}
        />
      </ToastProvider>
    );
  }

  const { data: workspaces, error } = await client
    .from('workspaces')
    .select('id,name')
    .order('name');

  if (error || !workspaces || workspaces.length === 0) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <FinalizeMonthView
          workspaceId=""
          locale={locale}
          messages={messages}
          endedMonths={[]}
          currentCairoMonth=""
          denied={true}
          onFinalizeAction={finalizeMonthAction}
        />
      </ToastProvider>
    );
  }

  const params = await searchParams;
  const targetWorkspace =
    typeof params.workspace === 'string' ? params.workspace : workspaces[0]!.id;
  const workspaceId =
    workspaces.find((w) => w.id === targetWorkspace)?.id ?? workspaces[0]!.id;

  const currentCairoMonth = getCurrentCairoMonth();
  const endedMonths = getEndedCairoMonths(12);

  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <FinalizeMonthView
        workspaceId={workspaceId}
        locale={locale}
        messages={messages}
        endedMonths={endedMonths}
        currentCairoMonth={currentCairoMonth}
        denied={false}
        initialSelectedMonth={
          typeof params.month === 'string' ? params.month : undefined
        }
        onFinalizeAction={finalizeMonthAction}
      />
    </ToastProvider>
  );
}
