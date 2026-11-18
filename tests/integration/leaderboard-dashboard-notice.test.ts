import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  leaderboardClient,
  leaderboardContext,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { anonClient, sql } from './harness';

// T011/T015 [FR-005, FR-013, SC-007]: the dashboard notice is first_view
// exactly once for an eligible client, never for an opted-out client.
let f: LeaderboardContext;
let eligible: LeaderboardClient;
let optedOut: LeaderboardClient;
let noGoal: LeaderboardClient;
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  eligible = await leaderboardClient(f);
  optedOut = await leaderboardClient(f);
  // Not opted out, but ineligible: no trainer-set goal type (PO 2026-11-14).
  noGoal = await leaderboardClient(f, { goalType: null });
});
afterAll(() => db.end());

describe('once-only dashboard notice', () => {
  it('shows once to an eligible client, then never again', async () => {
    expect(
      (await eligible.client.rpc('client_leaderboard_dashboard_notice')).data,
    ).toEqual({ status: 'first_view' });
    for (let i = 0; i < 2; i++)
      expect(
        (await eligible.client.rpc('client_leaderboard_dashboard_notice')).data,
      ).toEqual({ status: 'not_shown' });
    const rows = await db`
      select workspace_id from public.client_leaderboard_notice_seen
      where client_id=${eligible.clientId}`;
    expect(rows).toEqual([{ workspace_id: f.wsA.id }]);
  });

  it('never shows to an opted-out client and records nothing', async () => {
    await optedOut.client.rpc('client_leaderboard_opt_out');
    expect(
      (await optedOut.client.rpc('client_leaderboard_dashboard_notice')).data,
    ).toEqual({ status: 'not_shown' });
    const rows = await db`
      select 1 from public.client_leaderboard_notice_seen
      where client_id=${optedOut.clientId}`;
    expect(rows).toHaveLength(0);
  });

  it('stays hidden while an un-opted-out client is ineligible, then shows once when eligible', async () => {
    const rpc = () => noGoal.client.rpc('client_leaderboard_dashboard_notice');
    const rows = () =>
      db`select 1 from public.client_leaderboard_notice_seen where client_id=${noGoal.clientId}`;
    expect((await rpc()).data).toEqual({ status: 'not_shown' });
    expect(await rows()).toHaveLength(0);
    const set = await f.po.client.rpc('set_client_goal_type', {
      p_workspace_id: f.wsA.id,
      p_client_id: noGoal.clientId,
      p_goal_type: 'maintenance',
    });
    expect(set.data?.status).toBe('updated');
    expect((await rpc()).data).toEqual({ status: 'first_view' });
    expect((await rpc()).data).toEqual({ status: 'not_shown' });
    expect(await rows()).toHaveLength(1);
  });

  it('mutation: stripping the eligibility check shows the notice to an ineligible client (kill evidence)', async () => {
    const call =
      'or not app_private.f24_client_eligible(c.workspace_id, c.id, app_private.f24_cairo_today())';
    const rollback = new Error('rollback notice mutation');
    let mutant: unknown = 'not-reached';
    const ineligible = await leaderboardClient(f, { goalType: null });
    try {
      await db.begin(async (tx) => {
        const [row] = await tx`
          select pg_get_functiondef('public.client_leaderboard_dashboard_notice()'::regprocedure) as definition`;
        const definition = row!.definition as string;
        const mutated = definition.replace(call, '');
        expect(mutated).not.toBe(definition);
        await tx.unsafe(mutated);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ineligible.userId, role: 'authenticated' })},true)`;
        const [result] =
          await tx`select public.client_leaderboard_dashboard_notice() as result`;
        mutant = result!.result;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(mutant).toEqual({ status: 'first_view' });
    const [definition] = await db`
      select pg_get_functiondef('public.client_leaderboard_dashboard_notice()'::regprocedure) as body`;
    expect(definition?.body).toContain(call);
    expect(
      (await ineligible.client.rpc('client_leaderboard_dashboard_notice')).data,
    ).toEqual({ status: 'not_shown' });
  });

  it('is a client-only action resolved from the session', async () => {
    for (const actor of [f.trainerA, f.woA, f.po])
      expect(
        (await actor.client.rpc('client_leaderboard_dashboard_notice')).data,
      ).toEqual({ status: 'not_permitted' });
    expect(
      (await anonClient().rpc('client_leaderboard_dashboard_notice')).error,
    ).not.toBeNull();
    const direct = await eligible.client
      .from('client_leaderboard_notice_seen')
      .insert({ workspace_id: f.wsA.id, client_id: optedOut.clientId });
    expect(direct.error).not.toBeNull();
  });

  it('keeps the seen record immutable', async () => {
    await expect(
      db`delete from public.client_leaderboard_notice_seen where client_id=${eligible.clientId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});
