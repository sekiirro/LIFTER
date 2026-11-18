import 'server-only';
import { authorizeClientAccess } from '../../client-access/authorize';
import { createSessionClient } from '../../supabase/server';
import { parseSelectInput, type FoodReplacementResult } from './validation';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * FR-018: the client freely selects one of the existing approved F18
 * alternatives (or clears the selection). This is a thin client-wall wrapper
 * over F18 `select_nutrition_alternative`; it creates no request and no plan
 * revision, and never writes selection rows itself.
 */
export async function selectExistingAlternative(
  raw: unknown,
): Promise<FoodReplacementResult> {
  const input = parseSelectInput(raw);
  if (!input) return { status: 'invalid' };
  // App-layer wall; the F18 RPC re-checks client, subscription and plan ownership.
  const access = await authorizeClientAccess();
  if (!access.allowed) return { status: 'denied' };
  const session = await createSessionClient();
  if (!session) return { status: 'unavailable' };
  const result = await session.rpc('select_nutrition_alternative', {
    p_plan_version_id: input.planVersionId,
    p_item_id: input.itemId,
    p_alternative_id: input.alternativeId,
    p_operation_key: input.operationKey,
  });
  if (result.error) return { status: 'unavailable' };
  const data = record(result.data);
  switch (data.status) {
    case 'ok':
      return { status: 'selected' };
    case 'stale_version':
    case 'key_conflict':
    case 'invalid_selection':
      return { status: data.status };
    case 'not_permitted':
      return { status: 'denied' };
    default:
      return { status: 'unavailable' };
  }
}
