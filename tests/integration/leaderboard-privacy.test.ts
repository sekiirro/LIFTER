import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, sql } from './harness';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  syntheticUsername,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';

// T027 [FR-023, FR-024, FR-038, FR-040; SC-004]: every leaderboard response,
// error payload and audit row is checked against an explicit allow-list.
// Synthetic data only.
let f: LeaderboardContext;
let listed: LeaderboardClient;
let other: LeaderboardClient;
const db = sql();
const payloads: Array<{ label: string; body: unknown }> = [];

/** Every key any F24 client/staff/PO response may carry (pool excluded). */
const ALLOWED_KEYS = new Set([
  'status',
  'period_month',
  'entries',
  'rank',
  'username',
  'publication_id',
  'state',
  'eligible',
  'opted_out',
  'total',
]);
const FORBIDDEN =
  /score|adherence|workout|diet|progress|weight|body.?fat|measurement|circumference|check.?in|answer|note|photo|plan|email|phone|birth|subscription|client_id|achiev|client_code/iu;

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value && typeof value === 'object')
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      keysOf(nested, into);
    }
  return into;
}

function record(label: string, result: { data: unknown; error: unknown }) {
  payloads.push({ label, body: result.data });
  if (result.error)
    payloads.push({ label: `${label}:error`, body: result.error });
}

beforeAll(async () => {
  f = await leaderboardContext();
  listed = await leaderboardClient(f);
  other = await leaderboardClient(f);
  await publishAsPo(f, f.wsA.id, [listed.clientId, other.clientId]);

  record('client read', await listed.client.rpc('client_leaderboard_read'));
  record('client self', await listed.client.rpc('client_leaderboard_self'));
  record('private rank', await listed.client.rpc('client_leaderboard_my_rank'));
  record(
    'staff private rank',
    await f.trainerA.client.rpc('client_leaderboard_my_rank'),
  );
  for (const [label, actor] of [
    ['po', f.po],
    ['owner', f.woA],
    ['trainer', f.trainerA],
    ['sales', f.salesA],
    ['foreign owner', f.actors.woB],
  ] as const)
    record(
      `workspace read ${label}`,
      await actor.client.rpc('workspace_leaderboard_read', {
        p_workspace_id: f.wsA.id,
      }),
    );

  const created = await f.po.client.rpc('create_leaderboard_candidate', {
    p_workspace_id: f.wsA.id,
    p_client_ids: [other.clientId],
    p_operation_key: randomUUID(),
  });
  record('candidate create', created);
  record(
    'pending read',
    await f.po.client.rpc('leaderboard_pending_read', {
      p_workspace_id: f.wsA.id,
    }),
  );
  record(
    'decide',
    await f.po.client.rpc('decide_leaderboard_candidate', {
      p_publication_id: created.data?.publication_id,
      p_decision: 'reject',
    }),
  );
  record(
    'decide replay',
    await f.po.client.rpc('decide_leaderboard_candidate', {
      p_publication_id: created.data?.publication_id,
      p_decision: 'reject',
    }),
  );
  record(
    'username update',
    await listed.client.rpc('client_update_username', {
      p_username: syntheticUsername('pv'),
    }),
  );
  record(
    'username taken',
    await listed.client.rpc('client_update_username', {
      p_username: other.username,
    }),
  );
  record('opt-out', await other.client.rpc('client_leaderboard_opt_out'));
  record(
    'opt-out replay',
    await other.client.rpc('client_leaderboard_opt_out'),
  );
  record('opted-out self', await other.client.rpc('client_leaderboard_self'));

  // Denied and failing calls: their error payloads are checked too.
  const anonymous = anonClient();
  record('anon read', await anonymous.rpc('client_leaderboard_read'));
  record(
    'anon workspace read',
    await anonymous.rpc('workspace_leaderboard_read', {
      p_workspace_id: f.wsA.id,
    }),
  );
  record(
    'client pending read',
    await listed.client.rpc('leaderboard_pending_read', {
      p_workspace_id: f.wsA.id,
    }),
  );
  record(
    'direct table read',
    await listed.client.from('leaderboard_entries').select('*').limit(1),
  );
});
afterAll(() => db.end());

describe('T027 leaderboard privacy allow-list', () => {
  it('captured every planned response', () => {
    expect(payloads.length).toBeGreaterThanOrEqual(19);
  });

  it('returns only allow-listed keys from every client, staff and PO RPC', () => {
    for (const { label, body } of payloads) {
      if (label.endsWith(':error')) continue;
      for (const key of keysOf(body))
        expect(ALLOWED_KEYS.has(key), `${label}: ${key}`).toBe(true);
    }
  });

  it('never carries health, score, input or contact values in any response or error', () => {
    for (const { label, body } of payloads) {
      const text = JSON.stringify(body ?? null);
      // Usernames are the approved display field; strip them before scanning.
      const scrubbed = text.replace(
        /"username":"[^"]*"/gu,
        '"username":"<username>"',
      );
      expect(scrubbed, label).not.toMatch(FORBIDDEN);
      expect(text, label).not.toContain(listed.clientId);
      expect(text, label).not.toContain(other.clientId);
    }
  });

  it('shows usernames only to authorized same-workspace viewers', () => {
    const leaks = payloads.filter(({ label }) =>
      ['foreign owner', 'anon', 'client pending', 'direct table'].some(
        (prefix) => label.includes(prefix),
      ),
    );
    expect(leaks.length).toBeGreaterThan(0);
    for (const { label, body } of leaks) {
      const text = JSON.stringify(body ?? null);
      expect(text, label).not.toContain(listed.username);
      expect(text, label).not.toContain(other.username);
    }
  });

  it('writes audit details without usernames, ids of clients, scores or health data', async () => {
    const audits = await db`
      select action, details from public.audit_events
      where workspace_id=${f.wsA.id}
        and (action like 'leaderboard.%'
          or action in ('client.username_changed', 'client.goal_type_changed'))`;
    const actions = new Set(audits.map((audit) => audit.action as string));
    for (const action of [
      'leaderboard.publication_approved',
      'leaderboard.publication_rejected',
      'leaderboard.client_opted_out',
      'client.username_changed',
      'client.goal_type_changed',
    ])
      expect(actions.has(action), action).toBe(true);
    for (const audit of audits) {
      const keys = Object.keys(audit.details as Record<string, unknown>);
      for (const key of keys)
        expect(['period_month', 'entry_count'], audit.action).toContain(key);
      const text = JSON.stringify(audit.details);
      expect(text).not.toContain(listed.username);
      expect(text).not.toContain(other.username);
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it('stores no score or health column in the leaderboard relations (FR-024)', async () => {
    const columns = await db`
      select table_name, column_name from information_schema.columns
      where table_schema='public' and table_name in (
        'leaderboard_publications','leaderboard_entries',
        'leaderboard_current_publications','client_leaderboard_opt_outs')`;
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns)
      expect(
        column.column_name as string,
        `${column.table_name as string}`,
      ).not.toMatch(
        /score|adherence|progress|weight|fat|measurement|checkin|answer|note|photo|username/iu,
      );
  });
});
