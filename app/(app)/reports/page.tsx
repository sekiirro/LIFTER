import { cookies } from 'next/headers';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { createSessionClient } from '../../../lib/supabase/server';
import {
  getPackageCommissionReport,
  getPackageInstallmentReport,
  getPackageMonthlyCollections,
} from '../../../lib/packages/reporting';
import { formatMinorUnits } from '../../../lib/packages/money';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import {
  ReportsView,
  type ReportPackage,
  type ReportsData,
} from './ReportsView';
import styles from './reports.module.css';

type Search = { workspace?: string | string[]; month?: string | string[] };

function cairoMonth() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function formatConvertedTotal(value: string, locale: 'ar' | 'en') {
  if (value === '0') {
    const amount = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
    const text = `${amount} EGP`;
    return locale === 'ar' ? `\u2068${text}\u2069` : text;
  }
  return formatMinorUnits(value, 'EGP', locale);
}

function denied(locale: 'ar' | 'en', message: string) {
  return (
    <main
      className={styles.main}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <Alert tone="error" title={message} />
    </main>
  );
}

function loadFailure(locale: 'ar' | 'en', message: string, retry: string) {
  return (
    <main
      className={styles.main}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <Alert tone="error" title={message} />
      <a href="/reports">{retry}</a>
    </main>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  // This wall precedes workspace reads, package reads, and every reporting RPC.
  if (actor.role !== 'platform_owner' && actor.role !== 'workspace_owner')
    return denied(locale, m['reports.denied']);

  const params = await searchParams;
  const target = params.workspace;
  if (
    (actor.role === 'workspace_owner' &&
      (actor.activeWorkspaceIds.length === 0 ||
        (target !== undefined &&
          (typeof target !== 'string' ||
            !actor.activeWorkspaceIds.includes(target))))) ||
    (actor.role === 'platform_owner' &&
      target !== undefined &&
      typeof target !== 'string')
  )
    return denied(locale, m['reports.denied']);

  const month = validMonth(params.month) ? params.month : cairoMonth();
  const client = await createSessionClient();
  if (!client) return denied(locale, m['reports.denied']);

  let workspaceQuery = client
    .from('workspaces')
    .select('id,name')
    .order('name');
  if (actor.role === 'workspace_owner')
    workspaceQuery = workspaceQuery.in('id', actor.activeWorkspaceIds);
  const workspaceResult = await workspaceQuery;
  if (workspaceResult.error)
    return loadFailure(
      locale,
      m['reports.collections.loadError'],
      m['packages.retry'],
    );
  const workspaces = workspaceResult.data ?? [];
  if (workspaces.length === 0 && actor.role === 'workspace_owner')
    return denied(locale, m['reports.denied']);
  if (workspaces.length === 0)
    return (
      <main
        className={styles.main}
        lang={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <h1>{m['reports.title']}</h1>
        <EmptyState title={m['packages.noWorkspace']} />
      </main>
    );

  const workspaceId = typeof target === 'string' ? target : workspaces[0]!.id;
  if (
    !workspaces.some((workspace) => workspace.id === workspaceId) ||
    (actor.role === 'workspace_owner' &&
      !actor.activeWorkspaceIds.includes(workspaceId))
  )
    return denied(locale, m['reports.denied']);

  const [
    collectionsResult,
    commissionResult,
    installmentResult,
    packagesResult,
  ] = await Promise.all([
    getPackageMonthlyCollections(workspaceId, `${month}-01`),
    getPackageCommissionReport(workspaceId, `${month}-01`),
    getPackageInstallmentReport(workspaceId),
    client
      .from('packages')
      .select('id,market,type')
      .eq('workspace_id', workspaceId),
  ]);
  if (packagesResult.error)
    return loadFailure(
      locale,
      m['reports.collections.loadError'],
      m['packages.retry'],
    );

  const packages: ReportPackage[] = (packagesResult.data ?? []).map((row) => ({
    id: row.id,
    market: row.market,
    type: row.type,
  }));
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const data: ReportsData = {
    collections:
      collectionsResult?.status === 'ok'
        ? {
            status: 'ok',
            rows: collectionsResult.collections.map((row) => ({
              id: row.event_id,
              package: packageById.get(row.package_id) ?? null,
              clientName: row.client_name,
              recordedAt: row.recorded_at,
              amountMinor: row.amount_minor,
              currency: row.currency,
              convertedEgpExact: row.converted_egp_exact,
            })),
            totalConvertedEgpMinor: collectionsResult.converted_egp_minor,
            pendingEventIds: collectionsResult.pending_event_ids,
          }
        : { status: 'error' },
    commissions:
      commissionResult?.status === 'ok'
        ? {
            status: 'ok',
            rows: commissionResult.commissions.map((row) => ({
              package: packageById.get(row.package_id) ?? null,
              byCurrency: row.original_commission_by_currency,
              convertedEgpExact: row.converted_egp_exact,
              pendingRateCount: row.pending_event_count,
            })),
          }
        : { status: 'error' },
    installments:
      installmentResult?.status === 'ok'
        ? {
            status: 'ok',
            rows: installmentResult.installments.map((row) => ({
              id: row.installment_id,
              package: packageById.get(row.package_id) ?? null,
              clientName: row.client_name,
              dueOn: row.due_on,
              amountMinor: row.amount_minor,
              paidMinor: row.paid_minor,
              remainingMinor: row.remaining_minor,
              currency: row.currency,
              isInstallmentClient: row.is_installment_client,
            })),
          }
        : { status: 'error' },
  };

  // Preserve exact integer reporting amounts; helper accepts minor-unit strings.
  const totalConvertedEgp =
    data.collections.status === 'ok'
      ? formatConvertedTotal(data.collections.totalConvertedEgpMinor, locale)
      : null;

  return (
    <ReportsView
      locale={locale}
      month={month}
      workspaceId={workspaceId}
      workspaces={workspaces.map(({ id, name }) => ({ id, name }))}
      data={data}
      totalConvertedEgp={totalConvertedEgp}
      role={actor.role}
      messages={m}
    />
  );
}
