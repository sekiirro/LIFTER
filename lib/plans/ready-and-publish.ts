/**
 * F22 US1 wiring of staff Ready & Publish to the F19 RPC (FR-001; SC-001).
 *
 * F19 `ready_and_publish_plan` (workout) and F18 `publish_nutrition_revision`
 * (nutrition; the generic RPC refuses nutrition plans) own the revision +
 * delivery transaction, idempotency, CAS and subscription binding. This
 * adapter only validates the request shape, routes by the plan's kind and maps
 * the closed results. Activation and the productivity unit are committed by
 * F19 T021 inside the same transaction; this adapter neither implements nor
 * simulates them.
 */
import {
  mapPlanRpcError,
  type PlanKind,
  type PlanOperationError,
  type ReadyAndPublishReceipt,
  type ReadyAndPublishRequest,
} from './client-contract';
import { isUuid } from '../client-access/portal-projection';

/**
 * F19 returns the stored receipt for an exact replay without a replay marker,
 * so this result carries no `replayed` marker (see PR implementation notes).
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

/** Kind-specific publish RPC: nutrition never goes through the generic one. */
export const PUBLISH_RPC: Record<PlanKind, string> = {
  workout: 'ready_and_publish_plan',
  nutrition: 'publish_nutrition_revision',
};

const closedStatuses = new Set([
  'not_permitted',
  'invalid_input',
  'invalid_document',
  'stale_version',
  'key_conflict',
  'unavailable',
]);

/**
 * F18 raises `nutrition_*` validation codes (SQLSTATE 22023) for an invalid
 * nutrition document; F19 errors keep the shared contract mapping.
 */
function mapPublishRpcError(error: unknown): PlanOperationError {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (
      code === '22023' &&
      typeof message === 'string' &&
      message.startsWith('nutrition_')
    )
      return { status: 'invalid_document' };
  }
  return mapPlanRpcError(error);
}

export function mapReadyAndPublishResult(
  data: unknown,
  error: unknown,
  request: ReadyAndPublishRequest,
): ReadyAndPublishResult {
  if (error) return mapPublishRpcError(error);
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
  kind: PlanKind,
): Promise<ReadyAndPublishResult> {
  const request = parseReadyAndPublishRequest(input);
  if (!request || !Object.hasOwn(PUBLISH_RPC, kind))
    return { status: 'invalid_input' };
  try {
    const { data, error } = await client.rpc(PUBLISH_RPC[kind]!, {
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
