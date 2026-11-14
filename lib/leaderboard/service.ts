import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Actor } from '../auth/authorize';
import { createSessionClient } from '../supabase/server';
import {
  canDecideLeaderboard,
  canViewWorkspaceLeaderboard,
  isClientSession,
} from './authorization';
import {
  generateCandidateWith,
  spec023SourceFor,
  type CandidatePool,
  type CandidateStatus,
} from './generation';
import {
  toClientLeaderboardSelf,
  toLeaderboardView,
  toPendingCandidateView,
  type ClientLeaderboardSelf,
  type LeaderboardView,
  type PendingCandidateView,
} from './projection';
import type { LeaderboardScoreInputSource } from './score-inputs';
import {
  checkUsername,
  parseUsernameUpdateResult,
  type UsernameUpdateStatus,
} from './username';

/**
 * Server-only F24 boundary. Each call applies the app-layer wall first and
 * then a SECURITY DEFINER RPC that re-checks identity and workspace. Errors
 * are mapped to fixed statuses; no provider diagnostic or payload is logged.
 */
type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>;

async function sessionRpc(): Promise<Rpc | null> {
  try {
    const client: SupabaseClient | null = await createSessionClient();
    if (!client) return null;
    return async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error('leaderboard_rpc_failed');
      return data;
    };
  } catch {
    return null;
  }
}

async function call<T>(
  name: string,
  args: Record<string, unknown> | undefined,
  map: (value: unknown) => T,
  unavailable: T,
): Promise<T> {
  const rpc = await sessionRpc();
  if (!rpc) return unavailable;
  try {
    return map(await rpc(name, args));
  } catch {
    return unavailable;
  }
}

export async function readClientLeaderboard(
  actor: Actor | null,
): Promise<LeaderboardView> {
  if (!isClientSession(actor)) return { status: 'not_permitted' };
  return call('client_leaderboard_read', undefined, toLeaderboardView, {
    status: 'unavailable',
  });
}

export async function readWorkspaceLeaderboard(
  actor: Actor | null,
  workspaceId: string,
): Promise<LeaderboardView> {
  if (!canViewWorkspaceLeaderboard(actor, workspaceId))
    return { status: 'not_permitted' };
  return call(
    'workspace_leaderboard_read',
    { p_workspace_id: workspaceId },
    toLeaderboardView,
    { status: 'unavailable' },
  );
}

export async function readClientLeaderboardSelf(
  actor: Actor | null,
): Promise<ClientLeaderboardSelf> {
  if (!isClientSession(actor)) return { status: 'not_permitted' };
  return call('client_leaderboard_self', undefined, toClientLeaderboardSelf, {
    status: 'unavailable',
  });
}

export type OptOutStatus =
  'opted_out' | 'already_opted_out' | 'not_permitted' | 'unavailable';

function toOptOutStatus(value: unknown): OptOutStatus {
  const status =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { status?: unknown }).status
      : undefined;
  return status === 'opted_out' ||
    status === 'already_opted_out' ||
    status === 'not_permitted'
    ? status
    : 'unavailable';
}

/** FR-007-FR-009: idempotent; the RPC resolves the client from the session. */
export async function optOutOfLeaderboard(
  actor: Actor | null,
): Promise<OptOutStatus> {
  if (!isClientSession(actor)) return 'not_permitted';
  return call(
    'client_leaderboard_opt_out',
    undefined,
    toOptOutStatus,
    'unavailable',
  );
}

/** FR-022/FR-037: Q14 validation in the app, then the database boundary. */
export async function updateOwnUsername(
  actor: Actor | null,
  raw: unknown,
): Promise<UsernameUpdateStatus> {
  if (!isClientSession(actor)) return 'not_permitted';
  const checked = checkUsername(raw);
  if (!checked.ok) return checked.issue;
  return call(
    'client_update_username',
    { p_username: raw },
    parseUsernameUpdateResult,
    'unavailable',
  );
}

export async function readPendingCandidate(
  actor: Actor | null,
  workspaceId: string,
): Promise<PendingCandidateView> {
  if (!canDecideLeaderboard(actor)) return { status: 'not_permitted' };
  return call(
    'leaderboard_pending_read',
    { p_workspace_id: workspaceId },
    toPendingCandidateView,
    { status: 'unavailable' },
  );
}

export type DecisionStatus =
  | 'approved'
  | 'rejected'
  | 'already_decided'
  | 'conflict'
  | 'not_found'
  | 'invalid_input'
  | 'not_permitted'
  | 'unavailable';

function toDecisionStatus(value: unknown): DecisionStatus {
  const status =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { status?: unknown }).status
      : undefined;
  return [
    'approved',
    'rejected',
    'already_decided',
    'conflict',
    'not_found',
    'invalid_input',
    'not_permitted',
  ].includes(String(status))
    ? (status as DecisionStatus)
    : 'unavailable';
}

/** FR-026/FR-028: PO-only decision recorded after off-app WhatsApp verification. */
export async function decideLeaderboardCandidate(
  actor: Actor | null,
  publicationId: string,
  decision: 'approve' | 'reject',
): Promise<DecisionStatus> {
  if (!canDecideLeaderboard(actor)) return 'not_permitted';
  return call(
    'decide_leaderboard_candidate',
    { p_publication_id: publicationId, p_decision: decision },
    toDecisionStatus,
    'unavailable',
  );
}

export type { CandidateStatus } from './generation';

/**
 * PO-only candidate generation over an injected score source factory. Fails
 * closed with `inputs_unresolved` when the source cannot compute a score
 * without guessing (see spec023-source.ts).
 */
export async function generateLeaderboardCandidate(
  actor: Actor | null,
  workspaceId: string,
  sourceFor: (pool: CandidatePool) => LeaderboardScoreInputSource,
): Promise<CandidateStatus> {
  if (!canDecideLeaderboard(actor)) return 'not_permitted';
  const rpc = await sessionRpc();
  if (!rpc) return 'unavailable';
  return generateCandidateWith({ rpc, workspaceId, sourceFor });
}

/**
 * PO-only generation from spec 023 data through the production resolvers
 * (PO decision 2026-11-14: goal type, body weight, last scoring input,
 * registration order).
 */
export async function generateLeaderboardCandidateFromSpec023(
  actor: Actor | null,
  workspaceId: string,
): Promise<CandidateStatus> {
  if (!canDecideLeaderboard(actor)) return 'not_permitted';
  const client = await createSessionClient().catch(() => null);
  if (!client) return 'unavailable';
  return generateLeaderboardCandidate(
    actor,
    workspaceId,
    spec023SourceFor(client),
  );
}
