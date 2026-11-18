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
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  eligible = await leaderboardClient(f);
  optedOut = await leaderboardClient(f);
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
