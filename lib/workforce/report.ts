import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorkforceReportData,
  WorkforceReportResponse,
} from './report-types';

export function cairoCurrentMonth(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(monthStr: string, offset: number): string {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthNumStr!, 10) - 1;
  const date = new Date(Date.UTC(year, month + offset, 1));
  const newYear = date.getUTCFullYear();
  const newMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${newYear}-${newMonth}`;
}

export async function fetchWorkforceReport(
  client: SupabaseClient,
  workspaceId: string,
  cairoMonthStr: string,
): Promise<WorkforceReportResponse> {
  const monthDate = `${cairoMonthStr}-01`;
  const { data, error } = await client.rpc('p7_workforce_report', {
    p_workspace_id: workspaceId,
    p_month: monthDate,
  });

  if (error) {
    if (error.code === '42501' || error.message?.includes('not_permitted')) {
      return { status: 'denied' };
    }
    return { status: 'error', message: error.message };
  }

  return {
    status: 'ok',
    data: data as WorkforceReportData,
  };
}
