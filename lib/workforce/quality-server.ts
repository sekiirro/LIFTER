import 'server-only';

import { getActor } from '../auth/actor';
import { createSessionClient } from '../supabase/server';
import { fetchWorkforceReport } from './report';
import {
  calculateQualityPoints,
  formatExactDecimal,
  validateMonthFormat,
} from './quality';

export type QualityCategory = 'transformation' | 'feedback';

export type MonthlyQualityRevision = {
  id: string;
  workspace_id: string;
  trainer_id: string;
  month: string;
  category: QualityCategory;
  revision: number;
  positive_count: number;
  negative_count: number;
  positive_weight: string;
  negative_weight: string;
  net_points: string;
  idempotency_key: string;
  created_at: string;
  created_by: string;
};

export type RecordQualityInput = {
  workspaceId: string;
  trainerId: string;
  month: string;
  category: QualityCategory;
  positiveCount: number;
  negativeCount: number;
  positiveWeight: string | null;
  negativeWeight: string | null;
  expectedRevision: number;
  idempotencyKey: string;
};

export type QualityResult =
  | {
      status: 'ok';
      effective: MonthlyQualityRevision[];
      revisions: MonthlyQualityRevision[];
    }
  | { status: 'denied' | 'invalid_input' | 'error' };

export type RecordQualityResult =
  | { status: 'ok'; data: MonthlyQualityRevision }
  | {
      status:
        | 'denied'
        | 'invalid_input'
        | 'stale'
        | 'idempotency_reused'
        | 'closed'
        | 'error';
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 2_147_483_647;

function rpcStatus(error: { code?: string; message?: string } | null) {
  if (!error) return 'error' as const;
  if (error.code === '42501' || error.message?.includes('not_permitted'))
    return 'denied' as const;
  if (error.code === '40001' || error.message?.includes('stale_revision'))
    return 'stale' as const;
  if (error.code === '23505') return 'idempotency_reused' as const;
  if (error.code === '22023') return 'invalid_input' as const;
  return 'error' as const;
}

export async function getMonthlyQuality(
  workspaceId: string,
  month: string,
): Promise<QualityResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') return { status: 'denied' };
  if (
    typeof workspaceId !== 'string' ||
    typeof month !== 'string' ||
    !isUuid(workspaceId) ||
    !validateMonthFormat(month)
  )
    return { status: 'invalid_input' };

  const client = await createSessionClient();
  if (!client) return { status: 'error' };
  const params = {
    p_workspace_id: workspaceId,
    p_month: month,
    p_trainer_id: null,
    p_category: null,
  };
  const [effective, revisions] = await Promise.all([
    client.rpc('get_monthly_quality_effective', params),
    client.rpc('get_monthly_quality_revisions', params),
  ]);
  if (effective.error || revisions.error) {
    const status = rpcStatus(effective.error ?? revisions.error);
    return {
      status:
        status === 'denied' || status === 'invalid_input' ? status : 'error',
    };
  }
  if (!Array.isArray(effective.data) || !Array.isArray(revisions.data))
    return { status: 'error' };
  return {
    status: 'ok',
    effective: effective.data as MonthlyQualityRevision[],
    revisions: revisions.data as MonthlyQualityRevision[],
  };
}

export async function recordMonthlyQuality(
  input: RecordQualityInput,
): Promise<RecordQualityResult> {
  const actor = await getActor();
  if (!actor || actor.role !== 'platform_owner') return { status: 'denied' };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !isUuid(input.workspaceId) ||
    !isUuid(input.trainerId) ||
    typeof input.month !== 'string' ||
    !validateMonthFormat(input.month) ||
    (input.category !== 'transformation' && input.category !== 'feedback') ||
    !isCount(input.positiveCount) ||
    !isCount(input.negativeCount) ||
    (input.positiveWeight !== null &&
      typeof input.positiveWeight !== 'string') ||
    (input.negativeWeight !== null &&
      typeof input.negativeWeight !== 'string') ||
    typeof input.expectedRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision > 2_147_483_647 ||
    typeof input.idempotencyKey !== 'string' ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.trim().length > 200
  )
    return { status: 'invalid_input' };

  let positiveWeight: string | null;
  let negativeWeight: string | null;
  try {
    positiveWeight =
      input.positiveWeight === null
        ? null
        : formatExactDecimal(input.positiveWeight.trim());
    negativeWeight =
      input.negativeWeight === null
        ? null
        : formatExactDecimal(input.negativeWeight.trim());
    calculateQualityPoints({
      category: input.category,
      positiveCount: input.positiveCount,
      negativeCount: input.negativeCount,
      positiveWeight,
      negativeWeight,
    });
  } catch {
    return { status: 'invalid_input' };
  }
  if (
    input.category === 'transformation' &&
    (input.negativeCount !== 0 || negativeWeight !== null)
  )
    return { status: 'invalid_input' };

  const client = await createSessionClient();
  if (!client) return { status: 'error' };
  const report = await fetchWorkforceReport(
    client,
    input.workspaceId,
    input.month,
  );
  if (report.status !== 'ok') {
    return { status: report.status === 'denied' ? 'denied' : 'error' };
  }
  if (report.data.is_closed) return { status: 'closed' };

  const { data, error } = await client.rpc('record_monthly_quality', {
    p_workspace_id: input.workspaceId,
    p_trainer_id: input.trainerId,
    p_month: input.month,
    p_category: input.category,
    p_positive_count: input.positiveCount,
    p_negative_count: input.negativeCount,
    p_positive_weight: positiveWeight,
    p_negative_weight: negativeWeight,
    p_idempotency_key: input.idempotencyKey.trim(),
    p_expected_revision: input.expectedRevision,
  });
  if (error) return { status: rpcStatus(error) };
  if (!data || typeof data !== 'object') return { status: 'error' };
  return { status: 'ok', data: data as MonthlyQualityRevision };
}
