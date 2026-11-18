import 'server-only';
import { authorizeClientAccess } from '../../client-access/authorize';
import { createSessionClient } from '../../supabase/server';
import {
  mapOperationResult,
  parseRequestIdInput,
  parseSubmitInput,
  type FoodReplacementResult,
} from './validation';

/** App-layer client wall; the RPCs re-check client ownership, subscription and plan. */
async function clientSession() {
  const access = await authorizeClientAccess();
  if (!access.allowed) return null;
  return createSessionClient();
}

/** FR-019/FR-021: free-text request for a new alternative, one open per food. */
export async function submitFoodReplacementRequest(
  raw: unknown,
): Promise<FoodReplacementResult> {
  const input = parseSubmitInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await clientSession();
  if (!session) return { status: 'denied' };
  return mapOperationResult(
    'submit',
    await session.rpc('submit_food_replacement_request', {
      p_plan_version_id: input.planVersionId,
      p_item_id: input.itemId,
      p_request_text: input.requestText,
    }),
  );
}

/** FR-020: the client cancels an open request; editing in place is not offered. */
export async function cancelFoodReplacementRequest(
  raw: unknown,
): Promise<FoodReplacementResult> {
  const input = parseRequestIdInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await clientSession();
  if (!session) return { status: 'denied' };
  return mapOperationResult(
    'cancel',
    await session.rpc('cancel_food_replacement_request', {
      p_request_id: input.requestId,
    }),
  );
}
