import 'server-only';
import { createSessionClient } from '../supabase/server';

export type SalesProjectionStatus =
  'finalized' | 'not_available' | 'empty' | 'denied' | 'error';

export type SalesMonthlyTotalResult = {
  status: SalesProjectionStatus;
  month?: string;
  total?: string | null;
};

export type OwnBasicSalaryResult =
  | { status: 'ok'; amount: string | null; currency: string | null }
  | { status: 'denied' }
  | { status: 'error' };

export async function readOwnBasicSalary(params: {
  employeeId: string;
  month: string;
}): Promise<OwnBasicSalaryResult> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };

  const { data, error } = await client.rpc('p7_get_own_compensation', {
    p_employee_id: params.employeeId,
    p_effective_month: params.month,
  });

  if (error) {
    return error.code === '42501' || error.message?.includes('not_permitted')
      ? { status: 'denied' }
      : { status: 'error' };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== 'object') return { status: 'error' };
  const payload = row as Record<string, unknown>;
  const amount = payload.basic_salary_amount;
  const currency = payload.currency;

  if (amount === null && currency === null) {
    return { status: 'ok', amount: null, currency: null };
  }
  if (
    typeof amount !== 'string' ||
    !/^\d+\.\d{2}$/.test(amount) ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return { status: 'error' };
  }

  return { status: 'ok', amount, currency };
}

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
