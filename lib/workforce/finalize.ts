import { createSessionClient } from '../supabase/server';

export type FinalizeStatus =
  | 'finalized'
  | 'already_finalized'
  | 'not_permitted'
  | 'invalid_period'
  | 'stale'
  | 'error';

export type FinalizeResult = {
  status: FinalizeStatus;
  snapshotId?: string;
  effectiveMonth?: string;
  message?: string;
};

/**
 * Returns current Cairo month in YYYY-MM format.
 */
export function getCurrentCairoMonth(referenceDate = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(referenceDate);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/**
 * Validates YYYY-MM string.
 */
export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Generates an array of closed/ended Cairo months strictly before the current Cairo month.
 */
export function getEndedCairoMonths(
  count = 12,
  referenceDate = new Date(),
): string[] {
  const currentMonthStr = getCurrentCairoMonth(referenceDate);
  const [currentYear, currentMonthNum] = currentMonthStr.split('-').map(Number);
  const ended: string[] = [];

  let y = currentYear!;
  let m = currentMonthNum! - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }

  for (let i = 0; i < count; i++) {
    ended.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }

  return ended;
}

/**
 * Calls public.p7_finalize_month(p_workspace_id, p_month) via Supabase RPC.
 */
export async function finalizeMonthRpc(
  workspaceId: string,
  month: string,
): Promise<FinalizeResult> {
  if (!isValidMonth(month)) {
    return { status: 'invalid_period' };
  }

  const client = await createSessionClient();
  if (!client) {
    return { status: 'error' };
  }

  const { data, error } = await client.rpc('p7_finalize_month', {
    p_workspace_id: workspaceId,
    p_month: `${month}-01`,
  });

  if (error || !data) {
    return { status: 'error' };
  }

  if (data.status === 'not_permitted') {
    return { status: 'not_permitted' };
  }
  if (data.status === 'invalid_period') {
    return { status: 'invalid_period' };
  }
  if (data.status === 'finalized') {
    return {
      status: 'finalized',
      snapshotId: data.snapshot_id,
      effectiveMonth: data.effective_month,
    };
  }

  return { status: 'error' };
}
