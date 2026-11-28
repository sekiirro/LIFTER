'use server';

import { refresh } from 'next/cache';
import { requireActor } from '../../../../lib/auth/actor';
import { createSessionClient } from '../../../../lib/supabase/server';
import {
  canonicalPointInput,
  isOriginalEntryKind,
  isPointAdjustmentOperation,
  isUuid,
  isValidPointMonth,
  normalizePointReason,
  type PointActionResult,
  type PointActionStatus,
  type PointAdjustmentInput,
  type ReattributePointInput,
} from '../../../../lib/workforce/manual-points';

const resultStatuses = new Set<PointActionStatus>([
  'ok',
  'reason_required',
  'invalid_input',
  'invalid_target',
  'invalid_lineage',
  'key_conflict',
  'not_permitted',
]);

function rpcResult(
  data: unknown,
  error: { code?: string } | null,
): PointActionResult {
  if (error) {
    return {
      status: error.code === '42501' ? 'not_permitted' : 'error',
    };
  }
  if (
    data &&
    typeof data === 'object' &&
    'status' in data &&
    typeof data.status === 'string' &&
    resultStatuses.has(data.status as PointActionStatus)
  ) {
    return { status: data.status as PointActionStatus };
  }
  return { status: 'error' };
}

export async function postPointAdjustmentAction(
  input: PointAdjustmentInput,
): Promise<PointActionResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') {
    return { status: 'not_permitted' };
  }
  if (!input || typeof input !== 'object') return { status: 'invalid_input' };

  const reason = normalizePointReason(input.reason);
  if (reason.status !== 'ok') return { status: reason.status };
  if (
    !isUuid(input.workspaceId) ||
    !isUuid(input.staffUserId) ||
    !isUuid(input.idempotencyKey) ||
    !isPointAdjustmentOperation(input.operation)
  ) {
    return { status: 'invalid_input' };
  }

  const points = canonicalPointInput(input.points, input.operation);
  if (!points) return { status: 'invalid_input' };

  if (input.operation === 'correct') {
    if (
      input.effectiveMonth !== null ||
      !isOriginalEntryKind(input.originalEntryKind) ||
      !isUuid(input.originalEntryId)
    ) {
      return { status: 'invalid_input' };
    }
  } else if (
    !isValidPointMonth(input.effectiveMonth) ||
    input.originalEntryKind !== null ||
    input.originalEntryId !== null
  ) {
    return { status: 'invalid_input' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'not_permitted' };

  try {
    const { data, error } = await client.rpc('p7_post_point_adjustment', {
      p_workspace_id: input.workspaceId,
      p_staff_user_id: input.staffUserId,
      p_operation: input.operation,
      p_points: input.operation === 'deduct' ? `-${points}` : points,
      p_effective_month: input.effectiveMonth
        ? `${input.effectiveMonth}-01`
        : null,
      p_original_entry_kind: input.originalEntryKind,
      p_original_entry_id: input.originalEntryId,
      p_reason: reason.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    const result = rpcResult(data, error);
    if (result.status === 'ok') refresh();
    return result;
  } catch {
    return { status: 'error' };
  }
}

export async function reattributePointEntryAction(
  input: ReattributePointInput,
): Promise<PointActionResult> {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') {
    return { status: 'not_permitted' };
  }
  if (!input || typeof input !== 'object') return { status: 'invalid_input' };

  const reason = normalizePointReason(input.reason);
  if (reason.status !== 'ok') return { status: reason.status };
  if (
    !isUuid(input.workspaceId) ||
    !isOriginalEntryKind(input.originalEntryKind) ||
    !isUuid(input.originalEntryId) ||
    !isUuid(input.targetStaffUserId) ||
    !isUuid(input.idempotencyKey)
  ) {
    return { status: 'invalid_input' };
  }

  const client = await createSessionClient();
  if (!client) return { status: 'not_permitted' };

  try {
    const { data, error } = await client.rpc('p7_reattribute_point_entry', {
      p_workspace_id: input.workspaceId,
      p_original_entry_kind: input.originalEntryKind,
      p_original_entry_id: input.originalEntryId,
      p_target_staff_user_id: input.targetStaffUserId,
      p_reason: reason.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    const result = rpcResult(data, error);
    if (result.status === 'ok') refresh();
    return result;
  } catch {
    return { status: 'error' };
  }
}
