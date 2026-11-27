import { createSessionClient } from '../supabase/server';

export type SalesProjectionStatus =
  'finalized' | 'not_available' | 'empty' | 'denied' | 'error';

export type SalesMonthlyTotalResult = {
  status: SalesProjectionStatus;
  month?: string;
  total?: string | null;
};

export async function readSalesMonthlyTotal(params: {
  workspaceId: string;
  month: string;
}): Promise<SalesMonthlyTotalResult> {
  const client = await createSessionClient();
  if (!client) {
    return { status: 'denied' };
  }

  const { data, error } = await client.rpc('p7_get_sales_monthly_total', {
    p_workspace_id: params.workspaceId,
    p_month: params.month,
  });

  if (error) {
    if (error.code === '42501' || error.message?.includes('not_permitted')) {
      return { status: 'denied' };
    }
    return { status: 'error' };
  }

  if (!data || typeof data !== 'object') {
    return { status: 'error' };
  }

  const payload = data as Record<string, unknown>;
  const status = payload.status;

  if (status === 'not_available') {
    return { status: 'not_available' };
  }

  if (status === 'empty') {
    return {
      status: 'empty',
      month: typeof payload.month === 'string' ? payload.month : params.month,
      total: null,
    };
  }

  if (status === 'finalized' && typeof payload.total === 'string') {
    return {
      status: 'finalized',
      month: typeof payload.month === 'string' ? payload.month : params.month,
      total: payload.total,
    };
  }

  return { status: 'error' };
}
