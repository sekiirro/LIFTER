import type { SupabaseClient } from '@supabase/supabase-js';

export type ClientPlanProjectionItem = {
  plan_id: string;
  plan_kind: 'workout' | 'nutrition';
  revision_number: number;
  published_at: string;
  content: unknown;
};

export type ClientPlanProjectionResult =
  | { status: 'ok'; plans: ClientPlanProjectionItem[] }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Reads the authenticated client's delivered plans from `public.client_plan_projection()`.
 * Expired, deactivated, unapproved, or unauthenticated callers receive `denied`
 * with zero plan content.
 */
export async function readClientPlanProjection(
  client: Pick<SupabaseClient, 'rpc'> | null,
): Promise<ClientPlanProjectionResult> {
  if (!client) return { status: 'unavailable' };
  try {
    const { data, error } = await client.rpc('client_plan_projection');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return { status: 'unavailable' };
    }
    const payload = data as { status?: unknown; plans?: unknown };
    if (payload.status === 'invalid' || payload.status === 'not_permitted') {
      return { status: 'denied' };
    }
    if (payload.status !== 'ok' || !Array.isArray(payload.plans)) {
      return { status: 'unavailable' };
    }
    return {
      status: 'ok',
      plans: payload.plans as ClientPlanProjectionItem[],
    };
  } catch {
    return { status: 'unavailable' };
  }
}
