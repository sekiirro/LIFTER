import 'server-only';
import { getActor } from '../../auth/actor';
import { authorize } from '../../auth/authorize';
import { createSessionClient } from '../../supabase/server';
import {
  mapOperationResult,
  parseRequestIdInput,
  parseRequestRow,
  type FoodReplacementRequest,
  type FoodReplacementResult,
} from './validation';

const COLUMNS =
  'id, client_id, plan_id, plan_version_id, item_id, request_text, status, prepared_alternative_id, created_at, resolved_at';

export type RequestListResult =
  | { status: 'ok'; requests: FoodReplacementRequest[] }
  | { status: 'unavailable' };

function toList(data: unknown, error: unknown): RequestListResult {
  if (error || !Array.isArray(data)) return { status: 'unavailable' };
  const rows = data.map(parseRequestRow);
  return rows.every((row) => row !== null)
    ? { status: 'ok', requests: rows as FoodReplacementRequest[] }
    : { status: 'unavailable' };
}

/**
 * Own requests for the signed-in client, newest first. RLS limits rows to the
 * caller's own client; pending requests never hide existing alternatives
 * because the plan document is read separately (FR-024).
 */
export async function listOwnFoodReplacementRequests(): Promise<RequestListResult> {
  const session = await createSessionClient();
  if (!session) return { status: 'unavailable' };
  const { data, error } = await session
    .from('food_replacement_requests')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);
  return toList(data, error);
}

/** Requests for one client, for authorized trainers and owners (coaching_work). */
export async function listClientFoodReplacementRequests(target: {
  workspaceId: string;
  clientId: string;
}): Promise<RequestListResult> {
  const actor = await getActor();
  if (!actor || !authorize(actor, 'coaching_work', target.workspaceId))
    return { status: 'unavailable' };
  const session = await createSessionClient();
  if (!session) return { status: 'unavailable' };
  const { data, error } = await session
    .from('food_replacement_requests')
    .select(COLUMNS)
    .eq('workspace_id', target.workspaceId)
    .eq('client_id', target.clientId)
    .order('created_at', { ascending: false })
    .limit(100);
  return toList(data, error);
}

/**
 * Resolves the request workspace through RLS and applies the app-layer
 * coaching wall before any staff operation. A request the caller cannot read
 * (foreign workspace, Sales, client) yields null, so callers answer `denied`.
 */
export async function staffRequestSession(requestId: string) {
  const actor = await getActor();
  if (!actor) return null;
  const session = await createSessionClient();
  if (!session) return null;
  const { data, error } = await session
    .from('food_replacement_requests')
    .select('workspace_id')
    .eq('id', requestId)
    .maybeSingle();
  if (
    error ||
    !data ||
    typeof data.workspace_id !== 'string' ||
    !authorize(actor, 'coaching_work', data.workspace_id)
  )
    return null;
  return session;
}

/** FR-027: an authorized trainer or owner rejects an open request. */
export async function rejectFoodReplacementRequest(
  raw: unknown,
): Promise<FoodReplacementResult> {
  const input = parseRequestIdInput(raw);
  if (!input) return { status: 'invalid' };
  const session = await staffRequestSession(input.requestId);
  if (!session) return { status: 'denied' };
  return mapOperationResult(
    'reject',
    await session.rpc('reject_food_replacement_request', {
      p_request_id: input.requestId,
    }),
  );
}
