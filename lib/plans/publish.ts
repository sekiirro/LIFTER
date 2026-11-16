import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';
import {
  mapPlanRpcError,
  type PlanOperationError,
  type ReadyAndPublishReceipt,
  type ReadyAndPublishRequest,
} from './client-contract';

export type PublishWorkoutPlanResult =
  { status: 'ok'; receipt: ReadyAndPublishReceipt } | PlanOperationError;

type Dependencies = { actor: Actor | null; client: SupabaseClient };
type UnknownRecord = Record<string, unknown>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRequest(value: unknown): value is ReadyAndPublishRequest {
  return (
    isRecord(value) &&
    typeof value.planId === 'string' &&
    UUID_V4.test(value.planId) &&
    Number.isSafeInteger(value.expectedDraftVersion) &&
    Number(value.expectedDraftVersion) >= 1 &&
    Number(value.expectedDraftVersion) < Number.MAX_SAFE_INTEGER &&
    Number.isSafeInteger(value.expectedPublishedRevision) &&
    Number(value.expectedPublishedRevision) >= 0 &&
    Number(value.expectedPublishedRevision) < Number.MAX_SAFE_INTEGER &&
    typeof value.operationKey === 'string' &&
    UUID_V4.test(value.operationKey)
  );
}

/**
 * Publishes the caller-selected draft/published versions only through F19's
 * atomic delivery RPC. Intake and subscription eligibility remain authoritative
 * database gates; this layer only establishes current actor/workspace access.
 */
export async function publishWorkoutPlan(
  input: unknown,
  deps: Dependencies,
): Promise<PublishWorkoutPlanResult> {
  if (!isRequest(input)) return { status: 'invalid_input' };
  if (!deps.actor) return { status: 'not_permitted' };

  try {
    const { data, error } = await deps.client
      .from('plan_roots')
      .select('workspace_id, plan_kind')
      .eq('id', input.planId)
      .maybeSingle();
    if (
      error ||
      !data ||
      data.plan_kind !== 'workout' ||
      !authorize(deps.actor, 'coaching_work', data.workspace_id)
    )
      return { status: 'not_permitted' };

    const response = await deps.client.rpc('ready_and_publish_plan', {
      p_plan_id: input.planId,
      p_expected_draft_version: input.expectedDraftVersion,
      p_expected_published_version: input.expectedPublishedRevision,
      p_operation_key: input.operationKey,
    });
    if (response.error) return mapPlanRpcError(response.error);
    if (!isRecord(response.data)) return { status: 'unavailable' };
    if (response.data.status !== 'ok') {
      const status = response.data.status;
      if (
        status === 'not_permitted' ||
        status === 'invalid_input' ||
        status === 'invalid_document' ||
        status === 'stale_version' ||
        status === 'key_conflict' ||
        status === 'unavailable'
      )
        return { status };
      return { status: 'unavailable' };
    }

    const { plan_id, revision_id, revision_number } = response.data;
    if (
      typeof plan_id !== 'string' ||
      !UUID_V4.test(plan_id) ||
      typeof revision_id !== 'string' ||
      !UUID_V4.test(revision_id) ||
      !Number.isSafeInteger(revision_number) ||
      Number(revision_number) < 1
    )
      return { status: 'unavailable' };
    return {
      status: 'ok',
      receipt: {
        planId: plan_id,
        revisionId: revision_id,
        revisionNumber: Number(revision_number),
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
