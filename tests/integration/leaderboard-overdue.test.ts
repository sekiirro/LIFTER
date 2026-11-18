import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { sql } from './harness';

// S66-PO-2 [PO ruling]: an overdue client (F13 FR-028 input, reused as
// app_private.f13_client_overdue_state) is not rankable or public and sees
// neither the Top 5 nor the private rank. F13's own overdue derivation is
// covered by f13-overdue-access.test.ts; these probes pin the F24 wiring by
// forcing the F13 state for one client inside a rolled-back transaction.
let f: LeaderboardContext;
let overdue: LeaderboardClient;
let other: LeaderboardClient;
let foreign: LeaderboardClient;
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  overdue = await leaderboardClient(f);
  other = await leaderboardClient(f);
  foreign = await leaderboardClient(f, { workspace: 'B' });
  await publishAsPo(f, f.wsA.id, [overdue.clientId, other.clientId]);
});
afterAll(() => db.end());

async function inRollback<T>(
  run: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  const rollback = new Error('rollback S66-PO-2 probe');
  let result: T | undefined;
  try {
    await db.begin(async (tx) => {
      result = await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result as T;
}

/** Force the F13 overdue input to true for exactly one client id. */
async function forceOverdue(tx: TransactionSql, clientId: string) {
  await tx.unsafe(`
    create or replace function app_private.f13_client_overdue_state(ws uuid, cid uuid, as_of date)
    returns jsonb language sql stable security definer set search_path = '' as $fn$
      select jsonb_build_object('overdue', cid = '${clientId}'::uuid, 'overdue_since', null,
        'first_overdue_seq', null, 'overdue_installment_count', 0, 'reason', null)
    $fn$`);
}

async function asUser<T>(
  tx: TransactionSql,
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  return run();
}

const rpc = async (tx: TransactionSql, name: string) => {
  const [row] = await tx.unsafe(`select public.${name}() as result`);
  return row!.result as Record<string, unknown>;
};

describe('overdue clients are not rankable, public or shown the Top 5', () => {
  it('hides the Top 5 and private rank from the overdue client only', async () => {
    const seen = await inRollback(async (tx) => {
      await forceOverdue(tx, overdue.clientId);
      return {
        overdueRead: await asUser(tx, overdue.userId, () =>
          rpc(tx, 'client_leaderboard_read'),
        ),
        overdueRank: await asUser(tx, overdue.userId, () =>
          rpc(tx, 'client_leaderboard_my_rank'),
        ),
        overdueSelf: await asUser(tx, overdue.userId, () =>
          rpc(tx, 'client_leaderboard_self'),
        ),
        overdueNotice: await asUser(tx, overdue.userId, () =>
          rpc(tx, 'client_leaderboard_dashboard_notice'),
        ),
        otherRead: await asUser(tx, other.userId, () =>
          rpc(tx, 'client_leaderboard_read'),
        ),
        otherRank: await asUser(tx, other.userId, () =>
          rpc(tx, 'client_leaderboard_my_rank'),
        ),
      };
    });
    expect(seen.overdueRead).toEqual({ status: 'not_permitted' });
    expect(seen.overdueRank).toEqual({ status: 'not_ranked' });
    expect(seen.overdueSelf).toMatchObject({ status: 'ok', eligible: false });
    expect(seen.overdueNotice).toEqual({ status: 'not_shown' });
    // Not public: the other client sees a Top 5 without the overdue client,
    // renumbered, and keeps a private rank (the stored ranking is unchanged).
    expect(seen.otherRead).toMatchObject({
      status: 'available',
      entries: [{ rank: 1, username: other.username }],
    });
    expect(seen.otherRank).toMatchObject({ status: 'ranked' });
  });

  it('hides the overdue client from the staff view and rejects them as a candidate', async () => {
    const seen = await inRollback(async (tx) => {
      await forceOverdue(tx, overdue.clientId);
      const staff = await asUser(tx, f.po.userId, async () => {
        const [row] = await tx`
          select public.workspace_leaderboard_read(${f.wsA.id}) as result`;
        return row!.result;
      });
      const candidate = await asUser(tx, f.po.userId, async () => {
        const [row] = await tx`
          select public.create_leaderboard_candidate(${f.wsA.id}, ${[overdue.clientId]}::uuid[], ${randomUUID()}) as result`;
        return row!.result;
      });
      const [facts] = await tx`
        select app_private.f24_eligibility_facts(${f.wsA.id}, ${overdue.clientId}, app_private.f24_cairo_today()) as facts`;
      return { staff, candidate, facts: facts!.facts };
    });
    expect(seen.staff).toMatchObject({
      status: 'available',
      entries: [{ rank: 1, username: other.username }],
    });
    expect(seen.candidate).toEqual({ status: 'ineligible_client' });
    expect(seen.facts).toMatchObject({ overdue: true });
  });

  it('is workspace-scoped: another workspace is unaffected and F13 refuses a foreign client id', async () => {
    const seen = await inRollback(async (tx) => {
      await forceOverdue(tx, overdue.clientId);
      return asUser(tx, foreign.userId, () =>
        rpc(tx, 'client_leaderboard_self'),
      );
    });
    expect(seen).toMatchObject({ status: 'ok', eligible: true });
    // The real F13 state (no stub) fails closed for a client of another workspace.
    await expect(
      db`select app_private.f13_client_overdue_state(${f.wsA.id}, ${foreign.clientId}, app_private.f24_cairo_today())`,
    ).rejects.toMatchObject({ code: '42501' });
    // A client that is not overdue stays rankable.
    const [row] = await db`
      select app_private.f24_client_rankable(${f.wsA.id}, ${other.clientId}, app_private.f24_cairo_today()) as rankable`;
    expect(row).toEqual({ rankable: true });
  });

  it('mutation: dropping the overdue conjunct from f24_client_rankable keeps an overdue client rankable (kill evidence)', async () => {
    const conjunct = "and not (f.facts->>'overdue')::boolean";
    const mutant = await inRollback(async (tx) => {
      await forceOverdue(tx, overdue.clientId);
      const [row] = await tx`
        select pg_get_functiondef('app_private.f24_client_rankable(uuid,uuid,date)'::regprocedure) as definition`;
      const definition = row!.definition as string;
      const mutated = definition.replace(conjunct, '');
      expect(mutated).not.toBe(definition);
      const [before] = await tx`
        select app_private.f24_client_rankable(${f.wsA.id}, ${overdue.clientId}, app_private.f24_cairo_today()) as rankable`;
      await tx.unsafe(mutated);
      const [after] = await tx`
        select app_private.f24_client_rankable(${f.wsA.id}, ${overdue.clientId}, app_private.f24_cairo_today()) as rankable`;
      return { before: before!.rankable, after: after!.rankable };
    });
    expect(mutant).toEqual({ before: false, after: true });
    const [definition] = await db`
      select pg_get_functiondef('app_private.f24_client_rankable(uuid,uuid,date)'::regprocedure) as body`;
    expect(definition?.body).toContain(conjunct);
  });
});
