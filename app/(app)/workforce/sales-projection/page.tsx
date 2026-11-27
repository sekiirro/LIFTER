import { cookies } from 'next/headers';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { ToastProvider } from '../../../../components/ui/Toast';
import { readSalesMonthlyTotal } from '../../../../lib/workforce/sales-projection';
import {
  SalesMonthlyTotalView,
  type SalesProjectionState,
} from '../../../../components/workforce/SalesMonthlyTotalView';

export function getDefaultSalesMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m] = parts.split('-').map(Number);
  // Default to previous Cairo month (the most recently completed month)
  const prevMonthDate = new Date(Date.UTC(y!, m! - 2, 1));
  return prevMonthDate.toISOString().slice(0, 10);
}

export default async function SalesMonthlyTotalPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    month?: string | string[];
  }>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  // Authorization check: Only Sales role is permitted to view own monthly projection.
  // PO, WO, Trainer, and non-sales receive the denied state with no existence disclosure.
  if (!actor.role || actor.role !== 'sales') {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <SalesMonthlyTotalView
          workspaceId=""
          locale={locale}
          month=""
          status="denied"
        />
      </ToastProvider>
    );
  }

  if (actor.activeWorkspaceIds.length === 0) {
    return (
      <ToastProvider dismissLabel={messages['toast.dismiss']}>
        <SalesMonthlyTotalView
          workspaceId=""
          locale={locale}
          month=""
          status="denied"
        />
      </ToastProvider>
    );
  }

  const sp = await searchParams;
  const requestedWs = Array.isArray(sp.workspace)
    ? sp.workspace[0]
    : sp.workspace;
  const workspaceId =
    actor.activeWorkspaceIds.find((id) => id === requestedWs) ??
    actor.activeWorkspaceIds[0]!;

  const requestedMonth = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const month = requestedMonth || getDefaultSalesMonth();

  const result = await readSalesMonthlyTotal({
    workspaceId,
    month,
  });

  const status: SalesProjectionState = result.status;

  return (
    <ToastProvider dismissLabel={messages['toast.dismiss']}>
      <SalesMonthlyTotalView
        workspaceId={workspaceId}
        locale={locale}
        month={result.month ?? month}
        status={status}
        total={result.total}
      />
    </ToastProvider>
  );
}
