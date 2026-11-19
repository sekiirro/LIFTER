import 'server-only';
import { createSessionClient } from '../supabase/server';

type MonthlyResult = {
  status: string;
  pending_event_ids?: string[];
  [key: string]: unknown;
};

/**
 * Load month-scoped data through the signed-in actor's workspace check.
 * Foreign-currency lines remain pending until provider terms and the independent
 * T062 review permit fetching and accepting a pinned rate.
 */
export async function getPackageMonthlyCollections(
  workspaceId: string,
  monthStart: string,
): Promise<MonthlyResult | null> {
  const session = await createSessionClient();
  if (!session) return null;
  const result = await session.rpc('package_monthly_collections', {
    workspace_id: workspaceId,
    month_start: monthStart,
  });
  if (result.error) return null;
  return (result.data as MonthlyResult | null) ?? null;
}

export async function getPackageCommissionReport(
  workspaceId: string,
  monthStart: string,
): Promise<unknown | null> {
  const session = await createSessionClient();
  if (!session) return null;
  const result = await session.rpc('package_commission_report', {
    workspace_id: workspaceId,
    month_start: monthStart,
  });
  return result.data ?? null;
}

export async function getPackageInstallmentReport(
  workspaceId: string,
): Promise<unknown | null> {
  const session = await createSessionClient();
  if (!session) return null;
  const result = await session.rpc('package_installment_report', {
    workspace_id: workspaceId,
  });
  return result.data ?? null;
}
