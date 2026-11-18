import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, anonClient, sql } from './harness';
import {
  clientContext,
  graph,
  type Context,
} from './registration-approval-fixture';
import { crossWorkspaceOffer, issue } from './registration-links-fixture';

/**
 * F24 synthetic fixtures. Two workspaces (A, B) from the shared registration
 * fixture; approved clients are created through the F12 graph helper, signed
 * in with a real Auth session, and given a username through the real
 * `client_update_username` RPC. Synthetic data only.
 */
export type LeaderboardContext = Context & {
  offerB: Awaited<ReturnType<typeof crossWorkspaceOffer>>;
};

export type LeaderboardClient = {
  clientId: string;
  userId: string;
  workspaceId: string;
  subscriptionId: string;
  username: string;
  client: SupabaseClient;
};

export async function leaderboardContext(): Promise<LeaderboardContext> {
  const f = await clientContext();
  const offerB = await crossWorkspaceOffer(f);
  return { ...f, offerB };
}

export function syntheticUsername(prefix = 'lb') {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/**
 * The shared fixtures are workspace-A shaped: some helpers read `f.wsA`,
 * others `f.p.offer.workspace_id` (registration-links-fixture since the
 * market-scoped package categories). A workspace B context must therefore
 * move BOTH: `wsA` becomes wsB, and `p` becomes the foreign offer's
 * published fixture shape (its own offer/workspace and version).
 */
export function workspaceBContext(f: LeaderboardContext): Context {
  return {
    ...f,
    wsA: f.wsB,
    p: {
      ...f.p,
      versionId: f.offerB.versionId,
      offer: {
        ...f.p.offer,
        id: f.offerB.offerId,
        workspace_id: f.wsB.id,
        current_version_id: f.offerB.versionId,
      },
    },
  } as unknown as Context;
}

function scoped(f: LeaderboardContext, workspace: 'A' | 'B'): Context {
  return workspace === 'A' ? f : workspaceBContext(f);
}

/**
 * An approved client. `activatedDaysAgo` null leaves the subscription
 * awaiting activation; otherwise activation is back-dated that many days.
 */
export async function leaderboardClient(
  f: LeaderboardContext,
  options: {
    workspace?: 'A' | 'B';
    activatedDaysAgo?: number | null;
    username?: string | null;
    /** FR-018 goal type (PO 2026-11-14); null leaves it unset (not eligible). */
    goalType?: 'fat_loss' | 'muscle_gain' | 'maintenance' | null;
  } = {},
): Promise<LeaderboardClient> {
  const workspace = options.workspace ?? 'A';
  const ctx = scoped(f, workspace);
  const email = `f24-${randomUUID()}@example.test`;
  const password = `F24-${randomUUID()}-aA1!`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error('F24 client auth fixture failed');
  const userId = created.data.user.id;
  const link = await issue(ctx, f.po.client, {
    workspace_id: ctx.wsA.id,
    package_version_id: ctx.p.versionId,
  });
  if (link.error || typeof link.data !== 'string')
    throw new Error('F24 registration link fixture failed');
  const db = sql();
  let ids: Awaited<ReturnType<typeof graph>>;
  try {
    ids = await db.begin((tx) =>
      graph(tx, ctx, {
        linkId: link.data as string,
        versionId: ctx.p.versionId,
        authUserId: userId,
      }),
    );
    const activatedDaysAgo =
      options.activatedDaysAgo === undefined ? 20 : options.activatedDaysAgo;
    if (activatedDaysAgo !== null)
      // F19 T021: a direct fixture activation is a PO override.
      await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
        values(${ctx.wsA.id},${ids.subscription},clock_timestamp()-make_interval(days=>${activatedDaysAgo}),${randomUUID()},'po_override')`;
  } finally {
    await db.end();
  }
  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error('F24 client sign-in fixture failed');
  const username =
    options.username === undefined ? syntheticUsername() : options.username;
  if (username !== null) {
    const result = await client.rpc('client_update_username', {
      p_username: username,
    });
    if (result.error || result.data?.status !== 'updated')
      throw new Error(
        `F24 username fixture failed: ${String(result.data?.status ?? 'error')}`,
      );
  }
  const goalType =
    options.goalType === undefined ? 'maintenance' : options.goalType;
  if (goalType !== null) {
    const set = await f.po.client.rpc('set_client_goal_type', {
      p_workspace_id: ctx.wsA.id,
      p_client_id: ids.client,
      p_goal_type: goalType,
    });
    if (set.error || set.data?.status !== 'updated')
      throw new Error(
        `F24 goal-type fixture failed: ${String(set.data?.status ?? 'error')}`,
      );
  }
  return {
    clientId: ids.client,
    userId,
    workspaceId: ctx.wsA.id,
    subscriptionId: ids.subscription,
    username: username?.toLowerCase() ?? '',
    client,
  };
}

/** PO creates and approves a candidate; returns the publication id. */
export async function publishAsPo(
  f: LeaderboardContext,
  workspaceId: string,
  clientIds: readonly string[],
) {
  const created = await f.po.client.rpc('create_leaderboard_candidate', {
    p_workspace_id: workspaceId,
    p_client_ids: clientIds,
    p_operation_key: randomUUID(),
  });
  if (created.error || created.data?.status !== 'created')
    throw new Error(
      `F24 candidate fixture failed: ${String(created.data?.status ?? 'error')}`,
    );
  const publicationId = created.data.publication_id as string;
  const decided = await f.po.client.rpc('decide_leaderboard_candidate', {
    p_publication_id: publicationId,
    p_decision: 'approve',
  });
  if (decided.error || decided.data?.status !== 'approved')
    throw new Error('F24 approval fixture failed');
  return publicationId;
}
