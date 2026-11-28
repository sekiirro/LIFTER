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
  kind:
    | 'collection'
    | 'correction_reversal'
    | 'refund'
    | 'client_count'
    | 'subscription_count'
    | 'commission'
    | 'installment';
  status: string;
  amountMinor: string | null;
  currency: string | null;
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

export type BackendAggregateCurrencyTotal = {
  currency: string;
  collection_minor: string;
  reversal_minor: string;
  refund_minor?: string;
  commission_minor: string;
  converted_egp_exact: string | null;
  converted_commission_egp_exact: string | null;
  converted_egp_minor: string | null;
  converted_commission_egp_minor: string | null;
  pending_fx_count: number;
};

export type BackendAggregateWorkspaceTotal = BackendAggregateCurrencyTotal & {
  workspace_id: string;
};

export type BackendAggregateMonthTotal = BackendAggregateCurrencyTotal & {
  month: string;
};

export type BackendAggregatePackageTotal = BackendAggregateCurrencyTotal & {
  package_id: string;
};

export type BackendAggregateResponse = {
  status: string;
  workspace_id: string | null;
  month: string | null;
  counts?: {
    distinct_clients: number;
    distinct_subscriptions: number;
  };
  workspace_counts?: {
    workspace_id: string;
    distinct_clients: number;
    distinct_subscriptions: number;
  }[];
  month_counts?: {
    month: string;
    distinct_clients: number;
    distinct_subscriptions: number;
  }[];
  package_counts?: {
    package_id: string;
    distinct_clients: number;
    distinct_subscriptions: number;
  }[];
  currency_totals: BackendAggregateCurrencyTotal[];
  workspaces: BackendAggregateWorkspaceTotal[];
  months: BackendAggregateMonthTotal[];
  packages: BackendAggregatePackageTotal[];
};

export type BackendSourceRow = {
  event_id: string;
  workspace_id: string;
  subscription_id: string | null;
  client_id: string | null;
  client_name: string | null;
  package_id: string | null;
  kind:
    | 'collection'
    | 'correction_reversal'
    | 'refund'
    | 'client_count'
    | 'subscription_count';
  amount_minor: string | null;
  commission_minor: string | null;
  currency: string | null;
  recorded_at: string;
  fx: {
    status: 'ready' | 'pending';
    provider?: string | null;
    rate?: string | null;
    publication_date?: string | null;
  };
  converted_egp_exact: string | null;
  converted_commission_egp_exact: string | null;
};

export type BackendSourceRowsResponse = {
  status: string;
  workspace_id: string;
  rows: BackendSourceRow[];
  has_more: boolean;
  next_cursor: {
    recorded_at: string;
    event_id: string;
  } | null;
};

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

  const normalizedMonthStart =
    params.monthStart.length === 7
      ? `${params.monthStart}-01`
      : params.monthStart;

  const rpcResult = await access.client.rpc('po_reporting_aggregate', {
    p_workspace_id:
      params.workspaceId && params.workspaceId !== 'all'
        ? params.workspaceId
        : null,
    p_month_start: normalizedMonthStart,
    p_package_id: null,
  });

  if (rpcResult.error) {
    if (rpcResult.error.code === '42501') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }
  const payload = rpcResult.data as BackendAggregateResponse | null;
  if (!payload || payload.status !== 'ok') {
    if (payload?.status === 'not_permitted') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }

  let totalRevenueMinor = 0n;
  for (const ct of payload.currency_totals ?? []) {
    if (ct.converted_egp_minor) {
      totalRevenueMinor += BigInt(ct.converted_egp_minor);
    }
  }

  const totals: PlatformMetricTotals = {
    revenueConvertedEgpMinor: totalRevenueMinor.toString(),
    subscriptionCount: Number(payload.counts?.distinct_subscriptions ?? 0),
    clientCount: Number(payload.counts?.distinct_clients ?? 0),
  };

  let wsQuery = access.client
    .from('workspaces')
    .select('id, name')
    .order('name');
  if (params.workspaceId && params.workspaceId !== 'all') {
    wsQuery = wsQuery.eq('id', params.workspaceId);
  }
  const wsResult = await wsQuery;
  const workspaces = wsResult.data ?? [];

  const wsRevenueMap = new Map<string, bigint>();
  for (const w of payload.workspaces ?? []) {
    wsRevenueMap.set(
      w.workspace_id,
      (wsRevenueMap.get(w.workspace_id) ?? 0n) +
        BigInt(w.converted_egp_minor || '0'),
    );
  }
  const wsCountsMap = new Map<string, { clients: number; subs: number }>();
  for (const wc of payload.workspace_counts ?? []) {
    wsCountsMap.set(wc.workspace_id, {
      clients: Number(wc.distinct_clients ?? 0),
      subs: Number(wc.distinct_subscriptions ?? 0),
    });
  }

  const workspaceAggregates: WorkspaceAggregateRow[] = workspaces.map((ws) => {
    const counts = wsCountsMap.get(ws.id);
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      revenueConvertedEgpMinor: (wsRevenueMap.get(ws.id) ?? 0n).toString(),
      subscriptionCount: counts?.subs ?? 0,
      clientCount: counts?.clients ?? 0,
    };
  });

  const breakdowns: PlatformBreakdownRow[] = [];
  if (params.breakdown === 'month') {
    const monthRevenueMap = new Map<string, bigint>();
    for (const m of payload.months ?? []) {
      monthRevenueMap.set(
        m.month,
        (monthRevenueMap.get(m.month) ?? 0n) +
          BigInt(m.converted_egp_minor || '0'),
      );
    }
    const monthCountsMap = new Map<string, { clients: number; subs: number }>();
    for (const mc of payload.month_counts ?? []) {
      monthCountsMap.set(mc.month, {
        clients: Number(mc.distinct_clients ?? 0),
        subs: Number(mc.distinct_subscriptions ?? 0),
      });
    }
    const monthKeys = new Set([
      ...monthRevenueMap.keys(),
      ...monthCountsMap.keys(),
    ]);
    if (monthKeys.size === 0 && params.monthStart) {
      monthKeys.add(params.monthStart.slice(0, 7));
    }
    const sortedMonths = Array.from(monthKeys).sort();
    for (const mKey of sortedMonths) {
      breakdowns.push({
        key: mKey,
        label: mKey,
        revenueConvertedEgpMinor: (monthRevenueMap.get(mKey) ?? 0n).toString(),
        subscriptionCount: monthCountsMap.get(mKey)?.subs ?? 0,
        clientCount: monthCountsMap.get(mKey)?.clients ?? 0,
      });
    }
  } else {
    const pkgsResult = await access.client
      .from('packages')
      .select('id, market, type');
    const packages = pkgsResult.data ?? [];
    const packageById = new Map(packages.map((p) => [p.id, p]));

    const pkgRevenueMap = new Map<string, bigint>();
    for (const p of payload.packages ?? []) {
      pkgRevenueMap.set(
        p.package_id,
        (pkgRevenueMap.get(p.package_id) ?? 0n) +
          BigInt(p.converted_egp_minor || '0'),
      );
    }
    const pkgCountsMap = new Map<string, { clients: number; subs: number }>();
    for (const pc of payload.package_counts ?? []) {
      pkgCountsMap.set(pc.package_id, {
        clients: Number(pc.distinct_clients ?? 0),
        subs: Number(pc.distinct_subscriptions ?? 0),
      });
    }

    const pkgKeys = new Set([
      ...packages.map((p) => p.id),
      ...pkgRevenueMap.keys(),
      ...pkgCountsMap.keys(),
    ]);
    for (const pkgId of pkgKeys) {
      const pkg = packageById.get(pkgId) ?? null;
      breakdowns.push({
        key: pkgId,
        label: pkg ? `${pkg.market ?? '—'} · ${pkg.type ?? '—'}` : '—',
        package: pkg,
        revenueConvertedEgpMinor: (pkgRevenueMap.get(pkgId) ?? 0n).toString(),
        subscriptionCount: pkgCountsMap.get(pkgId)?.subs ?? 0,
        clientCount: pkgCountsMap.get(pkgId)?.clients ?? 0,
      });
    }
  }

  return {
    status: 'ok',
    period: params.monthStart.slice(0, 7),
    breakdown: params.breakdown,
    totals,
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

  const normalizedMonthStart =
    params.monthStart.length === 7
      ? `${params.monthStart}-01`
      : params.monthStart;

  const [rpcResult, aggResult] = await Promise.all([
    access.client.rpc('po_reporting_source_rows', {
      p_workspace_id: params.workspaceId,
      p_month_start: normalizedMonthStart,
      p_package_id: null,
      p_page_size: 50,
      p_cursor_recorded_at: null,
      p_cursor_event_id: null,
    }),
    access.client.rpc('po_reporting_aggregate', {
      p_workspace_id: params.workspaceId,
      p_month_start: normalizedMonthStart,
      p_package_id: null,
    }),
  ]);

  if (rpcResult.error) {
    if (rpcResult.error.code === '42501') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }
  const payload = rpcResult.data as BackendSourceRowsResponse | null;
  if (!payload || payload.status !== 'ok') {
    if (payload?.status === 'not_permitted') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }

  const [wsResult, pkgsResult] = await Promise.all([
    access.client
      .from('workspaces')
      .select('name')
      .eq('id', params.workspaceId)
      .single(),
    access.client
      .from('packages')
      .select('id, market, type')
      .eq('workspace_id', params.workspaceId),
  ]);

  const workspaceName =
    (Array.isArray(wsResult.data)
      ? wsResult.data[0]?.name
      : wsResult.data?.name) ?? params.workspaceId;
  const packageById = new Map((pkgsResult.data ?? []).map((p) => [p.id, p]));

  const rows: DrilldownSourceRow[] = (payload.rows ?? []).map((row) => ({
    id: row.event_id,
    recordedAt: row.recorded_at,
    package: row.package_id ? (packageById.get(row.package_id) ?? null) : null,
    clientName: row.client_name ?? null,
    kind: row.kind,
    status: 'completed',
    amountMinor: row.amount_minor ?? null,
    currency: row.currency ?? null,
    convertedEgpExact: row.converted_egp_exact ?? null,
    commissionMinor: row.commission_minor ?? null,
  }));

  if (aggResult.error) {
    if (aggResult.error.code === '42501') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }
  const agg = aggResult.data as BackendAggregateResponse | null;
  if (!agg || agg.status !== 'ok') {
    if (agg?.status === 'not_permitted') return { status: 'not_permitted' };
    return { status: 'unavailable' };
  }

  let sum = 0n;
  for (const ct of agg.currency_totals ?? []) {
    if (ct.converted_egp_minor) {
      sum += BigInt(ct.converted_egp_minor);
    }
  }

  return {
    status: 'ok',
    workspaceId: params.workspaceId,
    workspaceName,
    rows,
    totals: {
      revenueConvertedEgpMinor: sum.toString(),
      subscriptionCount: Number(agg.counts?.distinct_subscriptions ?? 0),
      clientCount: Number(agg.counts?.distinct_clients ?? 0),
    },
  };
}
