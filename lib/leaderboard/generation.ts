import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLeaderboardCandidate } from './candidate';
import {
  parseEligibilityPool,
  type LeaderboardEligibilityFacts,
} from './eligibility';
import {
  productionLeaderboardResolvers,
  type LeaderboardClientFacts,
} from './resolvers';
import type { LeaderboardScoreInputSource } from './score-inputs';
import {
  LeaderboardInputsUnresolvedError,
  createSpec023ScoreInputSource,
} from './spec023-source';

/**
 * PO candidate generation, independent of the request/session layer so the
 * same pipeline runs in the server action and in integration tests:
 * PO pool (F13 facts, goal type, registration order) -> eligibility ->
 * spec 023 inputs through the production resolvers -> ranking ->
 * `create_leaderboard_candidate` (which re-checks every client).
 */
export type LeaderboardRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export type CandidatePool = {
  periodMonth: string;
  pool: LeaderboardEligibilityFacts[];
  incumbentClientIds: string[];
};

export function toCandidatePool(value: unknown): CandidatePool | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const pool = parseEligibilityPool(record.pool);
  if (
    record.status !== 'ok' ||
    typeof record.period_month !== 'string' ||
    !/^\d{4}-\d{2}-01$/u.test(record.period_month) ||
    !pool ||
    !Array.isArray(record.incumbent_client_ids) ||
    !record.incumbent_client_ids.every((id) => typeof id === 'string')
  )
    return null;
  return {
    periodMonth: record.period_month,
    pool,
    incumbentClientIds: record.incumbent_client_ids as string[],
  };
}

export type CandidateStatus =
  | 'created'
  | 'replayed'
  | 'pending_exists'
  | 'ineligible_client'
  | 'no_eligible_clients'
  | 'invalid_input'
  | 'inputs_unresolved'
  | 'not_permitted'
  | 'unavailable';

const CREATE_STATUSES = [
  'created',
  'replayed',
  'pending_exists',
  'ineligible_client',
  'invalid_input',
  'not_permitted',
] as const;

export function clientFactsOf(
  pool: readonly LeaderboardEligibilityFacts[],
): ReadonlyMap<string, LeaderboardClientFacts> {
  return new Map(
    pool.map((facts) => [
      facts.clientId,
      {
        goalType: facts.goalType,
        registrationApprovedAt: facts.registrationApprovedAt,
      },
    ]),
  );
}

/** Production source: spec 023 data through the PO-decided resolvers. */
export function spec023SourceFor(
  client: SupabaseClient,
  now?: () => Date,
): (pool: CandidatePool) => LeaderboardScoreInputSource {
  return (pool) =>
    createSpec023ScoreInputSource({
      client,
      resolvers: productionLeaderboardResolvers(clientFactsOf(pool.pool)),
      ...(now ? { now } : {}),
    });
}

export async function generateCandidateWith(input: {
  rpc: LeaderboardRpc;
  workspaceId: string;
  sourceFor: (pool: CandidatePool) => LeaderboardScoreInputSource;
  operationKey?: string;
}): Promise<CandidateStatus> {
  try {
    const raw = await input.rpc('leaderboard_candidate_pool', {
      p_workspace_id: input.workspaceId,
    });
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as { status?: unknown }).status === 'not_permitted'
    )
      return 'not_permitted';
    const pool = toCandidatePool(raw);
    if (!pool) return 'unavailable';
    const ranked = await buildLeaderboardCandidate({
      workspaceId: input.workspaceId,
      periodMonth: pool.periodMonth,
      pool: pool.pool,
      incumbentClientIds: pool.incumbentClientIds,
      source: input.sourceFor(pool),
    });
    if (ranked.length === 0) return 'no_eligible_clients';
    const result = await input.rpc('create_leaderboard_candidate', {
      p_workspace_id: input.workspaceId,
      p_client_ids: ranked.map((entry) => entry.clientId),
      p_operation_key: input.operationKey ?? globalThis.crypto.randomUUID(),
    });
    const status =
      result && typeof result === 'object' && !Array.isArray(result)
        ? (result as { status?: unknown }).status
        : undefined;
    return (CREATE_STATUSES as readonly unknown[]).includes(status)
      ? (status as CandidateStatus)
      : 'unavailable';
  } catch (error) {
    if (error instanceof LeaderboardInputsUnresolvedError)
      return 'inputs_unresolved';
    return 'unavailable';
  }
}
