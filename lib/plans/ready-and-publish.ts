/**
 * F22 US1 wiring of staff Ready & Publish to the F19 RPC (FR-001; SC-001).
 *
 * F19 `ready_and_publish_plan` owns the revision + delivery transaction,
 * idempotency, CAS and subscription binding. This adapter only validates the
 * request shape and maps the closed F19 results. Activation and the
 * productivity unit are F19 T021 and are not implemented or simulated here.
 */
import {
  mapPlanRpcError,
  type PlanOperationError,
  type ReadyAndPublishReceipt,
  type ReadyAndPublishRequest,
} from './client-contract';
import { isUuid } from '../client-access/portal-projection';

/**
 * F19 returns the stored receipt for an exact replay without a replay marker,
 * so this result carries no `replayed` flag (see PR open questions).
 */
export type ReadyAndPublishResult =
  { status: 'ok'; receipt: ReadyAndPublishReceipt } | PlanOperationError;

type PublishRpc = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

function isNonNegativeVersion(value: unknown, minimum: number): boolean {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
  );
}

export function parseReadyAndPublishRequest(
  input: unknown,
): ReadyAndPublishRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !==
    'expectedDraftVersion,expectedPublishedRevision,operationKey,planId'
  )
    return null;
  if (
    !isUuid(value.planId) ||
    !isUuid(value.operationKey) ||
    !isNonNegativeVersion(value.expectedDraftVersion, 1) ||
    !isNonNegativeVersion(value.expectedPublishedRevision, 0)
  )
    return null;
  return {
    planId: value.planId,
    operationKey: value.operationKey,
    expectedDraftVersion: value.expectedDraftVersion as number,
    expectedPublishedRevision: value.expectedPublishedRevision as number,
  };
}

const closedStatuses = new Set([
  'not_permitted',
  'invalid_input',
  'stale_version',
  'key_conflict',
  'unavailable',
]);

export function mapReadyAndPublishResult(
  data: unknown,
  error: unknown,
  request: ReadyAndPublishRequest,
): ReadyAndPublishResult {
  if (error) return mapPlanRpcError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { status: 'unavailable' };
  const value = data as Record<string, unknown>;
  if (value.status !== 'ok')
    return closedStatuses.has(String(value.status))
      ? ({ status: value.status } as PlanOperationError)
      : { status: 'unavailable' };
  if (
    value.plan_id !== request.planId ||
    !isUuid(value.revision_id) ||
    typeof value.revision_number !== 'number' ||
    !Number.isSafeInteger(value.revision_number) ||
    value.revision_number < 1
  )
    return { status: 'unavailable' };
  // Delivery/subscription IDs stay server-side (F19 plan-core-client.md).
  return {
    status: 'ok',
    receipt: {
      planId: request.planId,
      revisionId: value.revision_id,
      revisionNumber: value.revision_number,
    },
  };
}

export async function readyAndPublishPlan(
  client: PublishRpc,
  input: unknown,
): Promise<ReadyAndPublishResult> {
  const request = parseReadyAndPublishRequest(input);
  if (!request) return { status: 'invalid_input' };
  try {
    const { data, error } = await client.rpc('ready_and_publish_plan', {
      p_plan_id: request.planId,
      p_expected_draft_version: request.expectedDraftVersion,
      p_expected_published_version: request.expectedPublishedRevision,
      p_operation_key: request.operationKey,
    });
    return mapReadyAndPublishResult(data, error, request);
  } catch {
    return { status: 'unavailable' };
  }
}
