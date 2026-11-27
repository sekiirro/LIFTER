import { cookies } from 'next/headers';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { createSessionClient } from '../../../../lib/supabase/server';
import {
  cairoCurrentMonth,
  isValidMonth,
  fetchWorkforceReport,
} from '../../../../lib/workforce/report';
import { WorkforceReportView } from '../../../../components/workforce/WorkforceReportView';

type Search = { workspace?: string | string[]; month?: string | string[] };

export default async function WorkforceReportPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  // Platform PO only. All others denied without existence disclosure.
  if (actor.role !== 'platform_owner') {
    return (
      <WorkforceReportView
        report={null}
        status="denied"
        locale={locale}
        messages={m}
        currentMonth={cairoCurrentMonth()}
      />
    );
  }

  const params = await searchParams;
  const target = params.workspace;
  if (target !== undefined && typeof target !== 'string') {
    return (
      <WorkforceReportView
        report={null}
        status="denied"
        locale={locale}
        messages={m}
        currentMonth={cairoCurrentMonth()}
      />
    );
  }

  const month = isValidMonth(params.month) ? params.month : cairoCurrentMonth();
  const client = await createSessionClient();
  if (!client) {
    return (
      <WorkforceReportView
        report={null}
        status="denied"
        locale={locale}
        messages={m}
        currentMonth={month}
      />
    );
  }

  const workspaceResult = await client
    .from('workspaces')
    .select('id,name')
    .order('name');

  const workspaces = workspaceResult.data ?? [];
  if (workspaces.length === 0) {
    return (
      <WorkforceReportView
        report={null}
        status="ok"
        locale={locale}
        messages={m}
        currentMonth={month}
      />
    );
  }

  const workspaceId = typeof target === 'string' ? target : workspaces[0]!.id;
  if (!workspaces.some((ws) => ws.id === workspaceId)) {
    return (
      <WorkforceReportView
        report={null}
        status="denied"
        locale={locale}
        messages={m}
        currentMonth={month}
      />
    );
  }

  const reportRes = await fetchWorkforceReport(client, workspaceId, month);

  if (reportRes.status === 'denied') {
    return (
      <WorkforceReportView
        report={null}
        status="denied"
        locale={locale}
        messages={m}
        currentMonth={month}
      />
    );
  }

  if (reportRes.status === 'error') {
    return (
      <WorkforceReportView
        report={null}
        status="error"
        locale={locale}
        messages={m}
        currentMonth={month}
      />
    );
  }

  return (
    <WorkforceReportView
      report={reportRes.data}
      status="ok"
      locale={locale}
      messages={m}
      currentMonth={month}
    />
  );
}
