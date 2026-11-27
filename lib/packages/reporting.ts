import 'server-only';
import { getActor } from '../auth/actor';
import { createSessionClient } from '../supabase/server';

type ReportDenied = { status: 'not_permitted' };
type ReportUnavailable = { status: 'unavailable' };
type ReportClient = { client_id: string; client_name: string | null };
type CollectionRow = ReportClient & {
  event_id: string;
  subscription_id: string;
  package_id: string;
  kind: 'collection';
  amount_minor: string;
  currency: string;
  recorded_at: string;
  fx: {
    status: 'ready' | 'pending';
    provider?: string | null;
    rate?: string;
    publication_date?: string | null;
  };
  converted_egp_exact: string | null;
};
type AccountingEventRow = ReportClient & {
  event_id: string;
  subscription_id: string;
  package_id: string;
  kind: 'correction_reversal';
  amount_minor: string;
  currency: string;
  recorded_at: string;
};
type CommissionRow = {
  package_id: string;
  original_commission_by_currency: Record<string, string>;
  converted_egp_exact: string | null;
  converted_egp_minor: string | null;
  pending_event_count: number;
};
type InstallmentRow = ReportClient & {
  subscription_id: string;
  package_id: string;
  installment_id: string;
  seq: number;
  due_on: string | null;
  amount_minor: string;
  currency: string;
  paid_minor: string;
  remaining_minor: string;
  is_installment_client: boolean;
};

export type PackageMonthlyCollectionsResult =
  | {
      status: 'ok';
      month: string;
      collections: CollectionRow[];
      accounting_events: AccountingEventRow[];
      pending_event_ids: string[];
      converted_egp_minor: string;
    }
  | ReportDenied
  | ReportUnavailable;

export type PackageCommissionReportResult =
  | { status: 'ok'; month: string; commissions: CommissionRow[] }
  | ReportDenied
  | ReportUnavailable;

export type PackageInstallmentReportResult =
  | {
      status: 'ok';
      installments: InstallmentRow[];
    }
  | ReportDenied
  | ReportUnavailable;

async function reportingClient(workspaceId: string) {
  const actor = await getActor();
  if (
    !actor ||
    actor.deleted ||
    (actor.role !== 'platform_owner' && actor.role !== 'workspace_owner') ||
    (actor.role === 'workspace_owner' &&
      !actor.activeWorkspaceIds.includes(workspaceId))
  ) {
    return { status: 'not_permitted' } as const;
  }
  const client = await createSessionClient();
  return client
    ? ({ status: 'ok', client } as const)
    : ({ status: 'unavailable' } as const);
}

/** Load reporting data only after the session actor passes the PO/WO wall. */
export async function getPackageMonthlyCollections(
  workspaceId: string,
  monthStart: string,
): Promise<PackageMonthlyCollectionsResult | null> {
  const access = await reportingClient(workspaceId);
  if (access.status !== 'ok') return access;
  const result = await access.client.rpc('package_monthly_collections', {
    workspace_id: workspaceId,
    month_start: monthStart,
  });
  if (result.error) return null;
  return (result.data as PackageMonthlyCollectionsResult | null) ?? null;
}

export async function getPackageCommissionReport(
  workspaceId: string,
  monthStart: string,
): Promise<PackageCommissionReportResult | null> {
  const access = await reportingClient(workspaceId);
  if (access.status !== 'ok') return access;
  const result = await access.client.rpc('package_commission_report', {
    workspace_id: workspaceId,
    month_start: monthStart,
  });
  if (result.error) return null;
  return (result.data as PackageCommissionReportResult | null) ?? null;
}

export async function getPackageInstallmentReport(
  workspaceId: string,
): Promise<PackageInstallmentReportResult | null> {
  const access = await reportingClient(workspaceId);
  if (access.status !== 'ok') return access;
  const result = await access.client.rpc('package_installment_report', {
    workspace_id: workspaceId,
  });
  if (result.error) return null;
  return (result.data as PackageInstallmentReportResult | null) ?? null;
}

export type PlatformBreakdown = 'month' | 'package';

export type PlatformMetricTotals = {
  revenueConvertedEgpMinor: string;
  subscriptionCount: number;
  clientCount: number;
};

export type PlatformBreakdownRow = {
  key: string;
  label: string;
  package?: { id: string; market: string | null; type: string | null } | null;
  revenueConvertedEgpMinor: string;
  subscriptionCount: number;
  clientCount: number;
};

export type WorkspaceAggregateRow = {
  workspaceId: string;
  workspaceName: string;
  revenueConvertedEgpMinor: string;
  subscriptionCount: number;
  clientCount: number;
};

export type PlatformAggregateReportResult =
  | {
      status: 'ok';
      period: string;
      breakdown: PlatformBreakdown;
      totals: PlatformMetricTotals;
      workspaceAggregates: WorkspaceAggregateRow[];
      breakdowns: PlatformBreakdownRow[];
    }
  | ReportDenied
  | ReportUnavailable;

export type DrilldownSourceRow = {
  id: string;
  recordedAt: string;
  package: { id: string; market: string | null; type: string | null } | null;
  clientName: string | null;
  kind: 'collection' | 'correction_reversal' | 'commission' | 'installment';
  status: string;
  amountMinor: string;
  currency: string;
  convertedEgpExact: string | null;
  commissionMinor?: string | null;
  dueOn?: string | null;
  paidMinor?: string | null;
  remainingMinor?: string | null;
  pendingRates?: number;
};

export type WorkspaceDrilldownResult =
  | {
      status: 'ok';
      workspaceId: string;
      workspaceName: string;
      rows: DrilldownSourceRow[];
      totals: PlatformMetricTotals;
    }
  | ReportDenied
  | ReportUnavailable;

async function platformOwnerClient() {
  const actor = await getActor();
  if (!actor || actor.deleted || actor.role !== 'platform_owner') {
    return { status: 'not_permitted' } as const;
  }
  const client = await createSessionClient();
  return client
    ? ({ status: 'ok', client } as const)
    : ({ status: 'unavailable' } as const);
}

export async function getPlatformAggregateReport(params: {
  monthStart: string;
  breakdown: PlatformBreakdown;
  workspaceId?: string;
}): Promise<PlatformAggregateReportResult> {
  const access = await platformOwnerClient();
  if (access.status !== 'ok') return access;

  try {
    const rpcResult = await access.client.rpc('platform_aggregate_report', {
      period: params.monthStart,
      breakdown_dimension: params.breakdown,
      filter_workspace_id:
        params.workspaceId && params.workspaceId !== 'all'
          ? params.workspaceId
          : null,
    });
    if (
      !rpcResult.error &&
      rpcResult.data &&
      (rpcResult.data as { status?: string }).status === 'ok'
    ) {
      return rpcResult.data as PlatformAggregateReportResult;
    }
  } catch {
    // fall through to contract-compliant query
  }

  let wsQuery = access.client
    .from('workspaces')
    .select('id, name')
    .order('name');
  if (params.workspaceId && params.workspaceId !== 'all') {
    wsQuery = wsQuery.eq('id', params.workspaceId);
  }
  const wsResult = await wsQuery;
  if (wsResult.error || !wsResult.data) return { status: 'unavailable' };
  const workspaces = wsResult.data;

  let totalRevenueMinor = 0n;
  let totalSubs = 0;
  let totalClients = 0;
  const workspaceAggregates: WorkspaceAggregateRow[] = [];

  for (const ws of workspaces) {
    const [colResult, subsResult, clientsResult] = await Promise.all([
      getPackageMonthlyCollections(ws.id, params.monthStart),
      access.client
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id),
      access.client
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id),
    ]);

    const revMinorStr =
      colResult && colResult.status === 'ok'
        ? colResult.converted_egp_minor
        : '0';
    const revMinor = BigInt(revMinorStr);
    totalRevenueMinor += revMinor;
    const subCount = subsResult.count ?? 0;
    const clientCount = clientsResult.count ?? 0;
    totalSubs += subCount;
    totalClients += clientCount;

    workspaceAggregates.push({
      workspaceId: ws.id,
      workspaceName: ws.name,
      revenueConvertedEgpMinor: revMinorStr,
      subscriptionCount: subCount,
      clientCount,
    });
  }

  const breakdowns: PlatformBreakdownRow[] = [];
  if (params.breakdown === 'month') {
    breakdowns.push({
      key: params.monthStart.slice(0, 7),
      label: params.monthStart.slice(0, 7),
      revenueConvertedEgpMinor: totalRevenueMinor.toString(),
      subscriptionCount: totalSubs,
      clientCount: totalClients,
    });
  } else {
    const pkgsResult = await access.client
      .from('packages')
      .select('id, market, type');
    const packages = pkgsResult.data ?? [];
    for (const pkg of packages) {
      breakdowns.push({
        key: pkg.id,
        label: `${pkg.market ?? '—'} · ${pkg.type ?? '—'}`,
        package: pkg,
        revenueConvertedEgpMinor: '0',
        subscriptionCount: 0,
        clientCount: 0,
      });
    }
  }

  return {
    status: 'ok',
    period: params.monthStart.slice(0, 7),
    breakdown: params.breakdown,
    totals: {
      revenueConvertedEgpMinor: totalRevenueMinor.toString(),
      subscriptionCount: totalSubs,
      clientCount: totalClients,
    },
    workspaceAggregates,
    breakdowns,
  };
}

export async function getWorkspaceDrilldownRows(params: {
  workspaceId: string;
  monthStart: string;
}): Promise<WorkspaceDrilldownResult> {
  const access = await platformOwnerClient();
  if (access.status !== 'ok') return access;

  try {
    const rpcResult = await access.client.rpc('workspace_drilldown_rows', {
      workspace_id: params.workspaceId,
      month_start: params.monthStart,
    });
    if (
      !rpcResult.error &&
      rpcResult.data &&
      (rpcResult.data as { status?: string }).status === 'ok'
    ) {
      return rpcResult.data as WorkspaceDrilldownResult;
    }
  } catch {
    // fall through
  }

  const wsResult = await access.client
    .from('workspaces')
    .select('name')
    .eq('id', params.workspaceId)
    .single();
  const workspaceName = wsResult.data?.name ?? params.workspaceId;

  const [colResult, comResult, insResult, pkgsResult] = await Promise.all([
    getPackageMonthlyCollections(params.workspaceId, params.monthStart),
    getPackageCommissionReport(params.workspaceId, params.monthStart),
    getPackageInstallmentReport(params.workspaceId),
    access.client
      .from('packages')
      .select('id, market, type')
      .eq('workspace_id', params.workspaceId),
  ]);

  const packageById = new Map((pkgsResult.data ?? []).map((p) => [p.id, p]));

  const rows: DrilldownSourceRow[] = [];

  if (colResult && colResult.status === 'ok') {
    for (const col of colResult.collections) {
      rows.push({
        id: col.event_id,
        recordedAt: col.recorded_at,
        package: packageById.get(col.package_id) ?? null,
        clientName: col.client_name,
        kind: 'collection',
        status: 'completed',
        amountMinor: col.amount_minor,
        currency: col.currency,
        convertedEgpExact: col.converted_egp_exact,
      });
    }
    for (const ev of colResult.accounting_events) {
      rows.push({
        id: ev.event_id,
        recordedAt: ev.recorded_at,
        package: packageById.get(ev.package_id) ?? null,
        clientName: ev.client_name,
        kind: 'correction_reversal',
        status: 'completed',
        amountMinor: ev.amount_minor,
        currency: ev.currency,
        convertedEgpExact: null,
      });
    }
  }

  if (comResult && comResult.status === 'ok') {
    for (const com of comResult.commissions) {
      rows.push({
        id: `commission-${com.package_id}`,
        recordedAt: params.monthStart,
        package: packageById.get(com.package_id) ?? null,
        clientName: null,
        kind: 'commission',
        status: 'completed',
        amountMinor: com.converted_egp_minor ?? '0',
        currency: 'EGP',
        convertedEgpExact: com.converted_egp_exact,
        commissionMinor: com.converted_egp_minor,
        pendingRates: com.pending_event_count,
      });
    }
  }

  if (insResult && insResult.status === 'ok') {
    for (const ins of insResult.installments) {
      rows.push({
        id: ins.installment_id,
        recordedAt: ins.due_on ?? params.monthStart,
        package: packageById.get(ins.package_id) ?? null,
        clientName: ins.client_name,
        kind: 'installment',
        status: ins.remaining_minor === '0' ? 'completed' : 'due',
        amountMinor: ins.amount_minor,
        currency: ins.currency,
        convertedEgpExact: null,
        dueOn: ins.due_on,
        paidMinor: ins.paid_minor,
        remainingMinor: ins.remaining_minor,
      });
    }
  }

  const revMinorStr =
    colResult && colResult.status === 'ok'
      ? colResult.converted_egp_minor
      : '0';

  return {
    status: 'ok',
    workspaceId: params.workspaceId,
    workspaceName,
    rows,
    totals: {
      revenueConvertedEgpMinor: revMinorStr,
      subscriptionCount: rows.length,
      clientCount: new Set(rows.map((r) => r.clientName).filter(Boolean)).size,
    },
  };
}
