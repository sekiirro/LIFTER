import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { sql } from './harness';

// T021/T022/T023 [FR-003, FR-004, FR-019, FR-020, FR-026, FR-028-FR-030]
let f: LeaderboardContext;
let eligible: LeaderboardClient[];
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  eligible = [];
  for (let index = 0; index < 3; index += 1)
    eligible.push(await leaderboardClient(f));
});
afterAll(() => db.end());

const candidate = (clientIds: readonly string[], key = randomUUID()) =>
  f.po.client.rpc('create_leaderboard_candidate', {
    p_workspace_id: f.wsA.id,
    p_client_ids: clientIds,
    p_operation_key: key,
  });
const decide = (publicationId: string, decision: 'approve' | 'reject') =>
  f.po.client.rpc('decide_leaderboard_candidate', {
    p_publication_id: publicationId,
    p_decision: decision,
  });

describe('publication lifecycle', () => {
  it('shows nothing before any approval (FR-004)', async () => {
    expect(
      (await eligible[0]!.client.rpc('client_leaderboard_read')).data,
    ).toEqual({ status: 'empty' });
    expect(
      (
        await f.trainerA.client.rpc('workspace_leaderboard_read', {
          p_workspace_id: f.wsA.id,
        })
      ).data,
    ).toEqual({ status: 'empty' });
  });

  it('keeps a pending candidate hidden, then rejection leaves nothing visible and is audited', async () => {
    const created = await candidate([eligible[0]!.clientId]);
    expect(created.data?.status).toBe('created');
    const publicationId = created.data.publication_id as string;
    expect(
      (await eligible[0]!.client.rpc('client_leaderboard_read')).data,
    ).toEqual({ status: 'empty' });
    const pending = await f.po.client.rpc('leaderboard_pending_read', {
      p_workspace_id: f.wsA.id,
    });
    expect(pending.data).toMatchObject({
      status: 'pending',
      publication_id: publicationId,
      entries: [{ rank: 1, username: eligible[0]!.username }],
    });
    expect((await candidate([eligible[1]!.clientId])).data).toEqual({
      status: 'pending_exists',
    });

    expect((await decide(publicationId, 'reject')).data).toEqual({
      status: 'rejected',
    });
    expect((await decide(publicationId, 'reject')).data).toEqual({
      status: 'already_decided',
      state: 'rejected',
    });
    expect((await decide(publicationId, 'approve')).data).toEqual({
      status: 'conflict',
    });
    expect(
      (await eligible[0]!.client.rpc('client_leaderboard_read')).data,
    ).toEqual({ status: 'empty' });
    const [audit] = await db`
      select actor_user_id, workspace_id, details from public.audit_events
      where action='leaderboard.publication_rejected' and target_id=${publicationId}`;
    expect(audit?.actor_user_id).toBe(f.po.userId);
    expect(audit?.workspace_id).toBe(f.wsA.id);
    expect(Object.keys(audit?.details ?? {}).sort()).toEqual([
      'entry_count',
      'period_month',
    ]);
  });

  it('approval makes the list visible; the previous list stays until the next approval', async () => {
    const firstId = await publishAsPo(f, f.wsA.id, [
      eligible[1]!.clientId,
      eligible[0]!.clientId,
    ]);
    const first = await eligible[2]!.client.rpc('client_leaderboard_read');
    expect(first.data).toMatchObject({
      status: 'available',
      entries: [
        { rank: 1, username: eligible[1]!.username },
        { rank: 2, username: eligible[0]!.username },
      ],
    });
    expect(first.data.period_month).toMatch(/^\d{4}-\d{2}-01$/u);
    const [approved] = await db`
      select details from public.audit_events
      where action='leaderboard.publication_approved' and target_id=${firstId}`;
    expect(approved?.details.entry_count).toBe(2);

    const next = await candidate([eligible[2]!.clientId]);
    expect(next.data?.status).toBe('created');
    // Successor pending: the approved list is unchanged.
    expect(
      (await eligible[2]!.client.rpc('client_leaderboard_read')).data.entries,
    ).toEqual(first.data.entries);
    expect((await decide(next.data.publication_id, 'reject')).data).toEqual({
      status: 'rejected',
    });
    expect(
      (await eligible[2]!.client.rpc('client_leaderboard_read')).data.entries,
    ).toEqual(first.data.entries);

    await publishAsPo(f, f.wsA.id, [eligible[2]!.clientId]);
    expect(
      (await eligible[2]!.client.rpc('client_leaderboard_read')).data.entries,
    ).toEqual([{ rank: 1, username: eligible[2]!.username }]);
  });

  it('replays an operation key instead of creating a second candidate', async () => {
    const key = randomUUID();
    const created = await candidate([eligible[0]!.clientId], key);
    expect(created.data?.status).toBe('created');
    expect((await candidate([eligible[0]!.clientId], key)).data).toEqual({
      status: 'replayed',
      publication_id: created.data.publication_id,
    });
    await decide(created.data.publication_id, 'reject');
  });

  it('validates size, duplicates and eligibility of every candidate client', async () => {
    const newcomer = await leaderboardClient(f, { activatedDaysAgo: 3 });
    const unactivated = await leaderboardClient(f, { activatedDaysAgo: null });
    const noUsername = await leaderboardClient(f, { username: null });
    expect((await candidate([])).data).toEqual({ status: 'invalid_input' });
    expect(
      (await candidate([eligible[0]!.clientId, eligible[0]!.clientId])).data,
    ).toEqual({ status: 'invalid_input' });
    expect(
      (await candidate(Array.from({ length: 6 }, () => randomUUID()))).data,
    ).toEqual({ status: 'invalid_input' });
    for (const client of [newcomer, unactivated, noUsername])
      expect((await candidate([client.clientId])).data).toEqual({
        status: 'ineligible_client',
      });
    expect((await candidate([randomUUID()])).data).toEqual({
      status: 'ineligible_client',
    });
  });
});

describe('PO-only authorization (FR-028)', () => {
  it('denies every non-PO caller at the database wall', async () => {
    for (const actor of [f.woA, f.trainerA, f.salesA, eligible[0]!]) {
      expect(
        (
          await actor.client.rpc('create_leaderboard_candidate', {
            p_workspace_id: f.wsA.id,
            p_client_ids: [eligible[0]!.clientId],
            p_operation_key: randomUUID(),
          })
        ).data,
      ).toEqual({ status: 'not_permitted' });
      expect(
        (
          await actor.client.rpc('leaderboard_pending_read', {
            p_workspace_id: f.wsA.id,
          })
        ).data,
      ).toEqual({ status: 'not_permitted' });
      expect(
        (
          await actor.client.rpc('leaderboard_candidate_pool', {
            p_workspace_id: f.wsA.id,
          })
        ).data,
      ).toEqual({ status: 'not_permitted' });
      expect(
        (
          await actor.client.rpc('decide_leaderboard_candidate', {
            p_publication_id: randomUUID(),
            p_decision: 'approve',
          })
        ).data,
      ).toEqual({ status: 'not_permitted' });
    }
  });

  it('keeps decided publications and the current pointer immutable outside the approval RPC', async () => {
    const [row] = await db`
      select p.id from public.leaderboard_publications p
      where p.workspace_id=${f.wsA.id} and p.state='approved' limit 1`;
    await expect(
      db`update public.leaderboard_publications set state='rejected' where id=${row!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db`delete from public.leaderboard_entries where publication_id=${row!.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    const [rejected] = await db`
      select p.id from public.leaderboard_publications p
      where p.workspace_id=${f.wsA.id} and p.state='rejected' limit 1`;
    await expect(
      db`update public.leaderboard_current_publications set publication_id=${rejected!.id} where workspace_id=${f.wsA.id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('mutation: an approval that skips the pointer swap leaves the old list visible (kill evidence)', async () => {
    const swap =
      "if next_state = 'approved' then\n    insert into public.leaderboard_current_publications";
    const rollback = new Error('rollback approval mutation');
    let entriesAfterMutantApproval: unknown = 'not-reached';
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('public.decide_leaderboard_candidate(uuid,text)'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(
          swap,
          'if false then\n    insert into public.leaderboard_current_publications',
        );
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
        const [created] = await tx`
          select public.create_leaderboard_candidate(${f.wsA.id}, ${[eligible[0]!.clientId]}::uuid[], ${randomUUID()}) as result`;
        expect(created?.result.status).toBe('created');
        const [decided] = await tx`
          select public.decide_leaderboard_candidate(${created!.result.publication_id}, 'approve') as result`;
        expect(decided?.result).toEqual({ status: 'approved' });
        const [view] =
          await tx`select app_private.f24_current_view(${f.wsA.id}) as result`;
        entriesAfterMutantApproval = view?.result.entries;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    // The FR-029 invariant (an approved candidate becomes the visible list) fails under the mutant.
    expect(entriesAfterMutantApproval).not.toEqual([
      { rank: 1, username: eligible[0]!.username },
    ]);
    const [definition] = await db`
      select pg_get_functiondef('public.decide_leaderboard_candidate(uuid,text)'::regprocedure) as body`;
    expect(definition?.body).toContain(swap);
  });
});
