import type { SupabaseClient } from '@supabase/supabase-js';
import { authorize, type Actor } from '../auth/authorize';
import { mapPlanRpcError, type CreatePlanReceipt } from './client-contract';

export type CreateWorkoutPlanInput = {
  clientId: string;
  kind: 'workout';
  operationKey: string;
} & (
  | {
      createMode: 'blank';
      templateId?: never;
      templateVersion?: never;
      sourcePlanId?: never;
    }
  | {
      createMode: 'template';
      templateId: string;
      templateVersion?: number;
      sourcePlanId?: never;
    }
  | {
      createMode: 'existing_plan';
      sourcePlanId: string;
      templateId?: never;
      templateVersion?: never;
    }
);

export type CreateWorkoutPlanResult =
  | { status: 'ok'; receipt: CreatePlanReceipt }
  | {
      status:
        | 'not_permitted'
        | 'invalid_input'
        | 'invalid_document'
        | 'stale_version'
        | 'key_conflict'
        | 'unavailable';
    };

type CreatePlanDependencies = {
  actor: Actor | null;
  client: SupabaseClient;
};

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isCreateWorkoutPlanInput(
  value: unknown,
): value is CreateWorkoutPlanInput {
  if (!isRecord(value) || value.kind !== 'workout') return false;
  if (
    typeof value.clientId !== 'string' ||
    !UUID_V4.test(value.clientId) ||
    typeof value.operationKey !== 'string' ||
    !UUID_V4.test(value.operationKey)
  )
    return false;

  if (value.createMode === 'blank')
    return (
      value.templateId === undefined &&
      value.templateVersion === undefined &&
      value.sourcePlanId === undefined
    );
  if (value.createMode === 'template')
    return (
      typeof value.templateId === 'string' &&
      UUID_V4.test(value.templateId) &&
      value.sourcePlanId === undefined &&
      (value.templateVersion === undefined ||
        (Number.isInteger(value.templateVersion) &&
          Number(value.templateVersion) > 0))
    );
  if (value.createMode === 'existing_plan')
    return (
      typeof value.sourcePlanId === 'string' &&
      UUID_V4.test(value.sourcePlanId) &&
      value.templateId === undefined &&
      value.templateVersion === undefined
    );
  return false;
}

/**
 * Creates one workout plan through the F19 root/copy RPCs. Workspace scope is
 * resolved from the selected client on the authenticated session and checked
 * against the current actor; the database RPC repeats authorization and binds
 * the operation key transactionally.
 */
export async function createWorkoutPlan(
  input: unknown,
  deps: CreatePlanDependencies,
): Promise<CreateWorkoutPlanResult> {
  if (!isCreateWorkoutPlanInput(input)) return { status: 'invalid_input' };
  if (!deps.actor) return { status: 'not_permitted' };

  try {
    const { data, error } = await deps.client
      .from('clients')
      .select('workspace_id')
      .eq('id', input.clientId)
      .maybeSingle();
    if (
      error ||
      !data ||
      !authorize(deps.actor, 'coaching_work', data.workspace_id)
    )
      return { status: 'not_permitted' };

    const response =
      input.createMode === 'blank'
        ? await deps.client.rpc('create_plan_draft', {
            p_workspace_id: data.workspace_id,
            p_client_id: input.clientId,
            p_plan_kind: 'workout',
            p_content: { schema_version: 1, days: [] },
            p_operation_key: input.operationKey,
          })
        : await deps.client.rpc('copy_plan_to_draft', {
            p_workspace_id: data.workspace_id,
            p_target_client_id: input.clientId,
            p_create_mode: input.createMode,
            p_source_id:
              input.createMode === 'template'
                ? input.templateId
                : input.sourcePlanId,
            p_operation_key: input.operationKey,
            p_template_version:
              input.createMode === 'template'
                ? (input.templateVersion ?? null)
                : null,
          });

    if (response.error) return mapPlanRpcError(response.error);
    if (typeof response.data !== 'string' || !UUID_V4.test(response.data))
      return { status: 'unavailable' };
    return { status: 'ok', receipt: { planId: response.data } };
  } catch {
    return { status: 'unavailable' };
  }
}
