import 'server-only';
import { createSessionClient } from '../supabase/server';
import {
  projectClientPortalOverview,
  projectClientPortalPlan,
  type ClientPortalOverview,
  type ClientPortalPlan,
} from './portal-projection';

type PortalRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Every call is a fresh server read: the database re-derives the client from
 * the signed identity and re-evaluates F13 entitlement (FR-006/FR-007).
 * Nothing here is cached across requests.
 */
export async function loadClientPortalOverview(
  client: PortalRpc,
): Promise<ClientPortalOverview> {
  try {
    const { data, error } = await client.rpc('client_portal_overview');
    if (error) return { status: 'denied' };
    return projectClientPortalOverview(data);
  } catch {
    return { status: 'denied' };
  }
}

export async function loadClientPortalPlan(
  client: PortalRpc,
  planId: string,
  revisionNumber: number | null,
): Promise<ClientPortalPlan> {
  try {
    const { data, error } = await client.rpc('client_portal_plan', {
      p_plan_id: planId,
      p_revision_number: revisionNumber,
    });
    if (error) return { status: 'denied' };
    return projectClientPortalPlan(data, { planId, revisionNumber });
  } catch {
    return { status: 'denied' };
  }
}

export async function readClientPortalOverview(): Promise<ClientPortalOverview> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  return loadClientPortalOverview(client);
}

export async function readClientPortalPlan(
  planId: string,
  revisionNumber: number | null,
): Promise<ClientPortalPlan> {
  const client = await createSessionClient();
  if (!client) return { status: 'denied' };
  return loadClientPortalPlan(client, planId, revisionNumber);
}
