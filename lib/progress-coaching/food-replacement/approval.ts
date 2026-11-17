import 'server-only';
import { staffRequestSession } from './lifecycle';
import {
  mapOperationResult,
  parseApproveInput,
  type FoodReplacementResult,
} from './validation';

/**
 * FR-022/FR-023: approval prepares an F19 DRAFT revision that carries the new
 * alternative within F18's max-3 cap. It never publishes: the trainer still
 * runs F18 Ready & Publish, and the request stays open until that revision
 * contains the alternative (the database closes it as approved then).
 */
export async function approveFoodReplacementRequest(
  raw: unknown,
): Promise<FoodReplacementResult> {
  const input = parseApproveInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await staffRequestSession(input.requestId);
  if (!session) return { status: 'denied' };
  return mapOperationResult(
    'approve',
    await session.rpc('approve_food_replacement_request', {
      p_request_id: input.requestId,
      p_food_id: input.foodId,
      p_food_version: input.foodVersion,
      p_quantity: input.quantity,
      p_replace_alternative_id: input.replaceAlternativeId,
      p_expected_draft_version: input.expectedDraftVersion,
      p_operation_key: input.operationKey,
    }),
  );
}
