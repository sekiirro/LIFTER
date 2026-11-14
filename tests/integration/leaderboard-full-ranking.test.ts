import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, sql } from './harness';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';

// PO 2026-11-14: "Rank ALL eligible clients monthly. Each client sees their
// private rank and total participants; public Leaderboard shows Top 5 only.
// Opt-out hides the client publicly, preserves their private rank, and
// automatically promotes the next eligible client (#6 -> #5). PO approves the
// full ranking; promotions require no reapproval." Synthetic data only.
let f: LeaderboardContext;
let ranked: LeaderboardClient[]; // approved ranks 1..7
let unranked: LeaderboardClient;
let foreign: LeaderboardClient;
let publicationId: string;
const db = sql();

const publicRead = (client: LeaderboardClient) =>
  client.client.rpc('client_leaderboard_read');
const myRank = (client: LeaderboardClient) =>
  client.client.rpc('client_leaderboard_my_rank');

beforeAll(async () => {
  f = await leaderboardContext();
  ranked = [];
  for (let index = 0; index < 7; index += 1)
    ranked.push(await leaderboardClient(f));
  unranked = await leaderboardClient(f);
  foreign = await leaderboardClient(f, { workspace: 'B' });
  publicationId = await publishAsPo(
    f,
    f.wsA.id,
    ranked.map((client) => client.clientId),
  );
});
afterAll(() => db.end());

describe('full ranking stored, public Top 5 derived', () => {
  it('stores all seven approved ranks', async () => {
    const rows = await db`
      select client_id, rank from public.leaderboard_entries
      where workspace_id=${f.wsA.id} and publication_id=${publicationId}
      order by rank`;
    expect(rows.map((row) => row.client_id)).toEqual(
      ranked.map((client) => client.clientId),
    );
  });

  it('shows clients and staff only the Top 5, ranks 1-5', async () => {
    const expected = ranked
      .slice(0, 5)
      .map((client, index) => ({ rank: index + 1, username: client.username }));
    expect((await publicRead(ranked[6]!)).data.entries).toEqual(expected);
    expect(
      (
        await f.trainerA.client.rpc('workspace_leaderboard_read', {
          p_workspace_id: f.wsA.id,
        })
      ).data.entries,
    ).toEqual(expected);
  });

  it('gives each ranked client only their own rank and the total', async () => {
    for (const [index, client] of ranked.entries()) {
      const { data, error } = await myRank(client);
      expect(error).toBeNull();
      expect(data).toEqual({
        status: 'ranked',
        period_month: expect.stringMatching(/^\d{4}-\d{2}-01$/u),
        rank: index + 1,
        total: 7,
      });
      const text = JSON.stringify(data);
      for (const other of ranked)
        if (other !== client) {
          expect(text).not.toContain(other.username);
          expect(text).not.toContain(other.clientId);
        }
    }
    expect((await myRank(unranked)).data).toEqual({ status: 'not_ranked' });
  });

  it('lets the PO review the full ranking before approval', async () => {
    const created = await f.po.client.rpc('create_leaderboard_candidate', {
      p_workspace_id: f.wsA.id,
      p_client_ids: [...ranked, unranked].map((client) => client.clientId),
      p_operation_key: randomUUID(),
    });
    expect(created.data?.status).toBe('created');
    const pending = await f.po.client.rpc('leaderboard_pending_read', {
      p_workspace_id: f.wsA.id,
    });
    expect(pending.data.entries).toHaveLength(8);
    // Reject it so the approved ranking stays current for the rest of the suite.
    const rejected = await f.po.client.rpc('decide_leaderboard_candidate', {
      p_publication_id: created.data.publication_id,
      p_decision: 'reject',
    });
    expect(rejected.data).toEqual({ status: 'rejected' });
  });
});

describe('opt-out promotion without reapproval', () => {
  it('promotes #6 into the Top 5 when a Top 5 client opts out', async () => {
    const decisionsBefore = await db`
      select count(*)::int as n from public.audit_events
      where workspace_id=${f.wsA.id} and action like 'leaderboard.publication_%'`;
    expect(
      (await ranked[1]!.client.rpc('client_leaderboard_opt_out')).data,
    ).toEqual({ status: 'opted_out' });
    const expected = [
      ranked[0],
      ranked[2],
      ranked[3],
      ranked[4],
      ranked[5],
    ].map((client, index) => ({ rank: index + 1, username: client!.username }));
    for (const read of [
      publicRead(ranked[6]!),
      publicRead(ranked[1]!),
      f.po.client.rpc('workspace_leaderboard_read', {
        p_workspace_id: f.wsA.id,
      }),
    ])
      expect((await read).data.entries).toEqual(expected);
    // No new decision and the same approved publication: no reapproval.
    const [current] = await db`
      select publication_id from public.leaderboard_current_publications
      where workspace_id=${f.wsA.id}`;
    expect(current!.publication_id).toBe(publicationId);
    const decisionsAfter = await db`
      select count(*)::int as n from public.audit_events
      where workspace_id=${f.wsA.id} and action like 'leaderboard.publication_%'`;
    expect(decisionsAfter[0]!.n).toBe(decisionsBefore[0]!.n);
  });

  it('keeps the opted-out client’s private rank, and the total still counts them', async () => {
    expect((await myRank(ranked[1]!)).data).toMatchObject({
      status: 'ranked',
      rank: 2,
      total: 7,
    });
    // The promoted client's private rank is their approved rank (6).
    expect((await myRank(ranked[5]!)).data).toMatchObject({
      rank: 6,
      total: 7,
    });
  });

  it('treats the public Top 5 (not the whole ranking) as FR-019 past winners', async () => {
    const pool = await f.po.client.rpc('leaderboard_candidate_pool', {
      p_workspace_id: f.wsA.id,
    });
    expect(pool.data.incumbent_client_ids).toEqual(
      [ranked[0], ranked[2], ranked[3], ranked[4], ranked[5]].map(
        (client) => client!.clientId,
      ),
    );
  });
});

describe('private rank walls', () => {
  it('has no way to ask for another client’s rank', async () => {
    const attempt = await ranked[0]!.client.rpc('client_leaderboard_my_rank', {
      p_client_id: ranked[6]!.clientId,
    });
    expect(attempt.error).not.toBeNull();
    expect(attempt.data).toBeNull();
  });

  it('denies staff, anonymous and foreign-workspace callers', async () => {
    for (const staff of [f.po, f.woA, f.trainerA, f.salesA])
      expect(
        (await staff.client.rpc('client_leaderboard_my_rank')).data,
      ).toEqual({ status: 'not_permitted' });
    expect(
      (await anonClient().rpc('client_leaderboard_my_rank')).error,
    ).not.toBeNull();
    // A workspace B client never sees workspace A's ranking.
    expect((await myRank(foreign)).data).toEqual({ status: 'none' });
    expect((await publicRead(foreign)).data).toEqual({ status: 'empty' });
  });

  it('mutation: dropping the own-client filter leaks another client’s rank (kill evidence)', async () => {
    const own = 'and e.client_id=c.id';
    const rollback = new Error('rollback my-rank mutation');
    let mutant: unknown = 'not-reached';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('public.client_leaderboard_my_rank()'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(own, '');
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ranked[6]!.userId, role: 'authenticated' })},true)`;
        const [result] =
          await tx`select public.client_leaderboard_my_rank() as result`;
        mutant = result!.result;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    // Client #7 must see rank 7; the mutant returns some other client's rank.
    expect(mutant).not.toMatchObject({ rank: 7 });
    const [definition] = await db`
      select pg_get_functiondef('public.client_leaderboard_my_rank()'::regprocedure) as body`;
    expect(definition?.body).toContain(own);
  });
});

// S57-PO-12 (PO 2026-11-15): "Every eligible client sees their private full
// rank; only the public Top 5 is visible to others."
describe('S57-PO-12 private rank only for eligible clients; public cap', () => {
  async function inRollback<T>(
    run: (tx: TransactionSql) => Promise<T>,
  ): Promise<T> {
    const rollback = new Error('rollback S57-PO-12 probe');
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

  it('gives an ineligible client in the approved ranking nothing', async () => {
    // Losing the goal type makes the client ineligible (S57-PO-1).
    const client = ranked[3]!;
    await db`delete from public.client_goal_types
      where workspace_id=${f.wsA.id} and client_id=${client.clientId}`;
    try {
      expect((await myRank(client)).data).toEqual({ status: 'not_ranked' });
      // Eligible clients still get their own rank and the full total.
      expect((await myRank(ranked[0]!)).data).toMatchObject({
        status: 'ranked',
        rank: 1,
        total: 7,
      });
    } finally {
      const restored = await f.po.client.rpc('set_client_goal_type', {
        p_workspace_id: f.wsA.id,
        p_client_id: client.clientId,
        p_goal_type: 'maintenance',
      });
      expect(restored.data).toEqual({ status: 'updated' });
    }
    expect((await myRank(client)).data).toMatchObject({ rank: 4 });
  });

  it('mutation: dropping the eligibility check gives an ineligible client a rank (kill evidence)', async () => {
    const check =
      'or not app_private.f24_client_rankable(c.workspace_id, c.id, app_private.f24_cairo_today())';
    const client = ranked[4]!;
    const mutant = await inRollback(async (tx) => {
      await tx`delete from public.client_goal_types
        where workspace_id=${f.wsA.id} and client_id=${client.clientId}`;
      const [row] = await tx`
        select pg_get_functiondef('public.client_leaderboard_my_rank()'::regprocedure) as definition`;
      const definition = row!.definition as string;
      const mutated = definition.replace(check, '');
      expect(mutated).not.toBe(definition);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.userId, role: 'authenticated' })},true)`;
      const [result] =
        await tx`select public.client_leaderboard_my_rank() as result`;
      return result!.result as Record<string, unknown>;
    });
    // The live wall returns not_ranked for that state (test above); the mutant leaks the rank.
    expect(mutant).toMatchObject({ status: 'ranked', rank: 5 });
    const [definition] = await db`
      select pg_get_functiondef('public.client_leaderboard_my_rank()'::regprocedure) as body`;
    expect(definition?.body).toContain(check);
  });

  it('mutation: removing the public cap exposes ranks beyond the Top 5 (kill evidence)', async () => {
    const cap = 'where t.public_rank <= 5';
    const live = (
      await f.trainerA.client.rpc('workspace_leaderboard_read', {
        p_workspace_id: f.wsA.id,
      })
    ).data;
    expect(live.entries).toHaveLength(5);
    const mutant = await inRollback(async (tx) => {
      const [row] = await tx`
        select pg_get_functiondef('app_private.f24_public_entries(uuid,uuid)'::regprocedure) as definition`;
      const definition = row!.definition as string;
      const mutated = definition.replace(cap, '');
      expect(mutated).not.toBe(definition);
      await tx.unsafe(mutated);
      const [view] =
        await tx`select app_private.f24_current_view(${f.wsA.id}) as result`;
      return view!.result as { entries: unknown[] };
    });
    // Seven ranked, one opted out: the mutant shows six public rows.
    expect(mutant.entries.length).toBeGreaterThan(5);
    const [definition] = await db`
      select pg_get_functiondef('app_private.f24_public_entries(uuid,uuid)'::regprocedure) as body`;
    expect(definition?.body).toContain(cap);
  });
});
