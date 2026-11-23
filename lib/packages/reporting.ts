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
