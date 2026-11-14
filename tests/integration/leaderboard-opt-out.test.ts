import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { anonClient, sql } from './harness';

// T009/T010 [FR-007-FR-009, FR-025, FR-039; S55-PO-6 Q13]
let f: LeaderboardContext;
let listed: LeaderboardClient;
let other: LeaderboardClient;
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  listed = await leaderboardClient(f);
  other = await leaderboardClient(f);
  await publishAsPo(f, f.wsA.id, [listed.clientId, other.clientId]);
});
afterAll(() => db.end());

describe('direct opt-out', () => {
  it('removes a listed client from the approved list immediately, without PO action', async () => {
    const before = await other.client.rpc('client_leaderboard_read');
    expect(before.data.entries).toEqual([
      { rank: 1, username: listed.username },
      { rank: 2, username: other.username },
    ]);
    const optOut = await listed.client.rpc('client_leaderboard_opt_out');
    expect(optOut.error).toBeNull();
    expect(optOut.data).toEqual({ status: 'opted_out' });

    for (const read of [
      other.client.rpc('client_leaderboard_read'),
      listed.client.rpc('client_leaderboard_read'),
      f.trainerA.client.rpc('workspace_leaderboard_read', {
        p_workspace_id: f.wsA.id,
      }),
      f.po.client.rpc('workspace_leaderboard_read', {
        p_workspace_id: f.wsA.id,
      }),
    ])
      expect((await read).data.entries).toEqual([
        { rank: 2, username: other.username },
      ]);
    expect(
      (await listed.client.rpc('client_leaderboard_self')).data,
    ).toMatchObject({ status: 'ok', opted_out: true, eligible: false });
  });

  it('is audited once with actor and time, and is idempotent', async () => {
    expect(
      (await listed.client.rpc('client_leaderboard_opt_out')).data,
    ).toEqual({ status: 'already_opted_out' });
    const audits = await db`
      select actor_user_id, workspace_id, occurred_at, details from public.audit_events
      where action='leaderboard.client_opted_out' and target_id=${listed.clientId}`;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_user_id: listed.userId,
      workspace_id: f.wsA.id,
      details: {},
    });
    expect(audits[0]!.occurred_at).toBeInstanceOf(Date);
    const [row] = await db`
      select o.actor_user_id, a.id is not null as linked
      from public.client_leaderboard_opt_outs o
      left join public.audit_events a on a.id=o.audit_event_id
      where o.client_id=${listed.clientId}`;
    expect(row).toEqual({ actor_user_id: listed.userId, linked: true });
  });

  it('excludes the client from later candidates and from the PO pool', async () => {
    expect(
      (
        await f.po.client.rpc('create_leaderboard_candidate', {
          p_workspace_id: f.wsA.id,
          p_client_ids: [listed.clientId],
          p_operation_key: randomUUID(),
        })
      ).data,
    ).toEqual({ status: 'ineligible_client' });
    const pool = await f.po.client.rpc('leaderboard_candidate_pool', {
      p_workspace_id: f.wsA.id,
    });
    const entry = (pool.data.pool as Array<Record<string, unknown>>).find(
      (row) => row.client_id === listed.clientId,
    );
    expect(entry).toMatchObject({ opted_out: true });
  });

  it('is a client-only action resolved from the session', async () => {
    for (const actor of [f.trainerA, f.woA, f.po])
      expect(
        (await actor.client.rpc('client_leaderboard_opt_out')).data,
      ).toEqual({ status: 'not_permitted' });
    expect(
      (await anonClient().rpc('client_leaderboard_opt_out')).error,
    ).not.toBeNull();
    const direct = await other.client
      .from('client_leaderboard_opt_outs')
      .insert({ workspace_id: f.wsA.id, client_id: listed.clientId });
    expect(direct.error).not.toBeNull();
  });

  it('keeps the opt-out record immutable', async () => {
    await expect(
      db`delete from public.client_leaderboard_opt_outs where client_id=${listed.clientId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('mutation: a read that ignores opt-outs re-exposes the client (kill evidence)', async () => {
    const filter =
      'and not exists(select 1 from public.client_leaderboard_opt_outs o\n      where o.workspace_id=ws and o.client_id=cid)';
    const rollback = new Error('rollback opt-out mutation');
    let mutantEntries: unknown = 'not-reached';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('app_private.f24_visible_username(uuid,uuid)'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(filter, '');
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        const [view] =
          await tx`select app_private.f24_current_view(${f.wsA.id}) as result`;
        mutantEntries = view?.result.entries;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    // The FR-008 assertion above ([rank 2 only]) fails under the mutant.
    expect(mutantEntries).not.toEqual([{ rank: 2, username: other.username }]);
  });
});
