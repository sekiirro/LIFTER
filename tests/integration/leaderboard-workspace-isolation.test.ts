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

// T031/T032 [FR-001, FR-035, FR-037; SC-005] and T027 payload allow-list.
let f: LeaderboardContext;
let clientA: LeaderboardClient;
let clientB: LeaderboardClient;
const db = sql();

beforeAll(async () => {
  f = await leaderboardContext();
  clientA = await leaderboardClient(f, { workspace: 'A' });
  // Same username in workspace B is allowed (per-workspace uniqueness).
  clientB = await leaderboardClient(f, {
    workspace: 'B',
    username: clientA.username,
  });
  await publishAsPo(f, f.wsA.id, [clientA.clientId]);
});
afterAll(() => db.end());

describe('two-workspace isolation', () => {
  it('never shows workspace A results to workspace B clients or staff', async () => {
    expect((await clientB.client.rpc('client_leaderboard_read')).data).toEqual({
      status: 'empty',
    });
    expect(
      (
        await f.trainerB.client.rpc('workspace_leaderboard_read', {
          p_workspace_id: f.wsA.id,
        })
      ).data,
    ).toEqual({ status: 'not_permitted' });
    expect(
      (
        await f.trainerB.client.rpc('workspace_leaderboard_read', {
          p_workspace_id: f.wsB.id,
        })
      ).data,
    ).toEqual({ status: 'empty' });
  });

  it('never lets a foreign client into a candidate, even for the PO', async () => {
    expect(
      (
        await f.po.client.rpc('create_leaderboard_candidate', {
          p_workspace_id: f.wsA.id,
          p_client_ids: [clientB.clientId],
          p_operation_key: randomUUID(),
        })
      ).data,
    ).toEqual({ status: 'ineligible_client' });
    const pool = await f.po.client.rpc('leaderboard_candidate_pool', {
      p_workspace_id: f.wsA.id,
    });
    const ids = (pool.data.pool as Array<{ client_id: string }>).map(
      (row) => row.client_id,
    );
    expect(ids).toContain(clientA.clientId);
    expect(ids).not.toContain(clientB.clientId);
  });

  it('keeps entries composite-bound to their own workspace', async () => {
    const [publication] = await db`
      select publication_id from public.leaderboard_current_publications where workspace_id=${f.wsA.id}`;
    await expect(
      db`insert into public.leaderboard_entries(workspace_id,publication_id,client_id,rank)
        values(${f.wsB.id},${publication!.publication_id},${clientB.clientId},2)`,
    ).rejects.toBeDefined();
    await expect(
      db`insert into public.leaderboard_current_publications(workspace_id,publication_id)
        values(${f.wsB.id},${publication!.publication_id})`,
    ).rejects.toBeDefined();
  });

  it('returns only status, period and rank/username rows (SC-004)', async () => {
    const view = (await clientA.client.rpc('client_leaderboard_read')).data;
    expect(Object.keys(view).sort()).toEqual([
      'entries',
      'period_month',
      'status',
    ]);
    for (const entry of view.entries as Array<Record<string, unknown>>)
      expect(Object.keys(entry).sort()).toEqual(['rank', 'username']);
    const pool = (
      await f.po.client.rpc('leaderboard_candidate_pool', {
        p_workspace_id: f.wsA.id,
      })
    ).data;
    for (const row of pool.pool as Array<Record<string, unknown>>)
      expect(Object.keys(row).sort()).toEqual([
        'active_days',
        'client_id',
        'entitlement_status',
        'has_username',
        'opted_out',
      ]);
    const self = (await clientA.client.rpc('client_leaderboard_self')).data;
    expect(Object.keys(self).sort()).toEqual([
      'eligible',
      'opted_out',
      'status',
      'username',
    ]);
    expect(self).toMatchObject({ eligible: true, username: clientA.username });
  });

  it('writes leaderboard audit details without usernames or scores', async () => {
    const audits = await db`
      select action, details from public.audit_events
      where workspace_id=${f.wsA.id} and action like 'leaderboard.%'`;
    expect(audits.length).toBeGreaterThan(0);
    for (const audit of audits) {
      const text = JSON.stringify(audit.details);
      expect(text).not.toContain(clientA.username);
      expect(text).not.toMatch(/score|adherence|progress|weight/iu);
    }
  });
});
