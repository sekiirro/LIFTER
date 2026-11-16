import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';
import { parseWorkoutDocumentV1 } from '../workout-planner/document';
import {
  mapPlanRpcError,
  type DraftWriteReceipt,
  type PlanOperationError,
} from './client-contract';

export type SaveWorkoutPlanDraftInput = {
  planId: string;
  expectedDraftVersion: number;
  content: {
    kind: 'workout';
    schemaVersion: 1;
    document: unknown;
  };
  operationKey: string;
  intent: 'autosave' | 'save_draft';
};

export type SaveWorkoutPlanDraftResult =
  { status: 'ok'; receipt: DraftWriteReceipt } | PlanOperationError;

type Dependencies = { actor: Actor | null; client: SupabaseClient };
type UnknownRecord = Record<string, unknown>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isInput(value: unknown): value is SaveWorkoutPlanDraftInput {
  return (
    isRecord(value) &&
    typeof value.planId === 'string' &&
    UUID_V4.test(value.planId) &&
    Number.isSafeInteger(value.expectedDraftVersion) &&
    Number(value.expectedDraftVersion) >= 1 &&
    Number(value.expectedDraftVersion) < Number.MAX_SAFE_INTEGER &&
    isRecord(value.content) &&
    value.content.kind === 'workout' &&
    value.content.schemaVersion === 1 &&
    typeof value.operationKey === 'string' &&
    UUID_V4.test(value.operationKey) &&
    (value.intent === 'autosave' || value.intent === 'save_draft')
  );
}

/**
 * Writes the private workout draft through F19's operation-key/CAS RPC.
 * Authorization is resolved before validating the domain document so invalid
 * payloads cannot reveal whether a caller can access a plan.
 */
export async function saveWorkoutPlanDraft(
  input: unknown,
  deps: Dependencies,
): Promise<SaveWorkoutPlanDraftResult> {
  if (!isInput(input)) return { status: 'invalid_input' };
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

    let document;
    try {
      document = parseWorkoutDocumentV1(input.content.document);
    } catch {
      return { status: 'invalid_document' };
    }

    const response = await deps.client.rpc('save_plan_draft', {
      p_plan_id: input.planId,
      p_expected_draft_version: input.expectedDraftVersion,
      p_content: document,
      p_operation_key: input.operationKey,
    });
    if (response.error) return mapPlanRpcError(response.error);
    const draftVersion =
      typeof response.data === 'number'
        ? response.data
        : typeof response.data === 'string'
          ? Number(response.data)
          : Number.NaN;
    if (
      !Number.isSafeInteger(draftVersion) ||
      draftVersion !== input.expectedDraftVersion + 1
    )
      return { status: 'unavailable' };
    return {
      status: 'ok',
      receipt: { planId: input.planId, draftVersion },
    };
  } catch {
    return { status: 'unavailable' };
  }
}
