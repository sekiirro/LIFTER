import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  asUser,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T020 (FR-009, FR-010; PO 2026-11-14 PO-4): client-recipient extension of
// the F15 inbox. The producer seam is exercised directly here because the F19
// delivery/activation hook is not on main; no trigger is simulated.
let p: PortalFixture;
let owner: PortalClient;
let other: PortalClient;

beforeAll(async () => {
  p = await portalFixture();
  owner = await p.makeClient({ activate: true, label: 'notice owner' });
  other = await p.makeClient({ activate: true, label: 'notice other' });
});
afterAll(async () => p?.close());

async function enqueue(
  workspaceId: string,
  clientId: string,
  kind: string,
  sourceKey = randomUUID(),
): Promise<string | null> {
  const [row] = await p.db`select app_private.f22_enqueue_client_notice(
    ${workspaceId}::uuid, ${clientId}::uuid, ${kind}, ${sourceKey}::uuid) as id`;
  return (row!.id as string | null) ?? null;
}

async function asClient(
  userId: string,
  call: { read: number } | { mark: string | null },
): Promise<Record<string, unknown>> {
  return p.db.begin((tx) =>
    asUser(tx, userId, async (inner) => {
      const [row] =
        'read' in call
          ? await inner`select public.read_client_notices(${call.read}::integer, null) as value`
          : await inner`select public.mark_client_notice_read(${call.mark}::uuid) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}

const ids = (value: Record<string, unknown>) =>
  (value.notices as Array<{ notice_id: string }>).map((n) => n.notice_id);

describe('F22 client notice producer seam (T020)', () => {
  it('is idempotent per producer key and audits only the first write', async () => {
    const key = randomUUID();
    const first = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'workout_delivered',
      key,
    );
    const again = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'workout_delivered',
      key,
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/u);
    expect(again).toBe(first);
    const [counts] = await p.db`select
      (select count(*)::int from app_private.client_inbox_notices where id=${first}) as rows,
      (select count(*)::int from public.audit_events
        where action='client_notice.enqueued' and target_id=${first}) as audits`;
    expect(counts).toEqual({ rows: 1, audits: 1 });
    // A different kind or key is a different notice.
    const other = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'nutrition_delivered_activated',
      key,
    );
    expect(other).not.toBe(first);
  });

  it('writes nothing for a client outside the given workspace', async () => {
    expect(
      await enqueue(p.fixture.wsB.id, owner.clientId, 'workout_delivered'),
    ).toBeNull();
    expect(
      await enqueue(p.fixture.wsA.id, randomUUID(), 'workout_delivered'),
    ).toBeNull();
    const [row] =
      await p.db`select count(*)::int as count from app_private.client_inbox_notices
        where workspace_id=${p.fixture.wsB.id} and client_id=${owner.clientId}`;
    expect(row!.count).toBe(0);
  });

  it('rejects unknown kinds and missing arguments', async () => {
    await expect(
      enqueue(p.fixture.wsA.id, owner.clientId, 'form_alert'),
    ).rejects.toThrow(/invalid_client_notice/u);
    await expect(
      p.db`select app_private.f22_enqueue_client_notice(${p.fixture.wsA.id}::uuid, ${owner.clientId}::uuid, 'workout_delivered', null)`,
    ).rejects.toThrow(/invalid_client_notice/u);
  });
});

describe('F22 client notice reads and mark-read (T020)', () => {
  it('returns only the signed-in client’s notices, newest first, IDs-only', async () => {
    const mine = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'subscription_activated',
    );
    const theirs = await enqueue(
      p.fixture.wsA.id,
      other.clientId,
      'workout_delivered',
    );
    const read = await asClient(owner.authUserId, { read: 100 });
    expect(read.status).toBe('ok');
    expect(ids(read)).toContain(mine);
    expect(ids(read)).not.toContain(theirs);
    expect(ids(read)[0]).toBe(mine);
    for (const notice of read.notices as Array<Record<string, unknown>>)
      expect(Object.keys(notice).sort()).toEqual([
        'created_at',
        'notice_id',
        'notice_kind',
        'read_at',
      ]);
    const otherRead = await asClient(other.authUserId, { read: 100 });
    expect(ids(otherRead)).toEqual([theirs]);
  });

  it('marks an own notice read once and refuses foreign or unknown ids alike', async () => {
    const notice = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'nutrition_delivered',
    );
    expect(await asClient(other.authUserId, { mark: notice })).toEqual({
      status: 'not_found',
    });
    expect(await asClient(owner.authUserId, { mark: randomUUID() })).toEqual({
      status: 'not_found',
    });
    expect(await asClient(owner.authUserId, { mark: null })).toEqual({
      status: 'not_found',
    });
    expect(await asClient(owner.authUserId, { mark: notice })).toEqual({
      status: 'read',
    });
    const [first] =
      await p.db`select read_at from app_private.client_inbox_notices where id=${notice}`;
    expect(first!.read_at).not.toBeNull();
    expect(await asClient(owner.authUserId, { mark: notice })).toEqual({
      status: 'read',
    });
    const [after] = await p.db`select
      (select read_at from app_private.client_inbox_notices where id=${notice}) as read_at,
      (select count(*)::int from public.audit_events
        where action='client_notice.marked_read' and target_id=${notice}) as audits`;
    expect(after!.read_at).toEqual(first!.read_at);
    expect(after!.audits).toBe(1);
  });

  it('rejects out-of-range page sizes', async () => {
    for (const limit of [0, 101])
      expect(await asClient(owner.authUserId, { read: limit })).toEqual({
        status: 'invalid_input',
      });
  });

  it('gives staff of either workspace, the Platform Owner and anonymous callers no notices', async () => {
    for (const actor of [
      p.fixture.trainerA,
      p.fixture.woA,
      p.fixture.trainerB,
      p.fixture.salesA,
      p.fixture.po,
    ]) {
      const read = await actor.client.rpc('read_client_notices', {
        p_limit: 10,
        p_before: null,
      });
      expect(read.error).toBeNull();
      expect(read.data).toEqual({ status: 'invalid' });
      const mark = await actor.client.rpc('mark_client_notice_read', {
        p_notice_id: randomUUID(),
      });
      expect(mark.data).toEqual({ status: 'invalid' });
    }
    const anon = anonClient();
    expect(
      (await anon.rpc('read_client_notices', { p_limit: 10, p_before: null }))
        .error,
    ).not.toBeNull();
    expect(
      (await anon.rpc('mark_client_notice_read', { p_notice_id: randomUUID() }))
        .error,
    ).not.toBeNull();
  });
});

describe('F22 client notice storage contract (T020)', () => {
  it('forces RLS and grants no API role access to the table or the producer', async () => {
    const [table] = await p.db`select relrowsecurity, relforcerowsecurity
      from pg_class where oid='app_private.client_inbox_notices'::regclass`;
    expect(table).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const [g] =
          await p.db`select has_table_privilege(${role}, 'app_private.client_inbox_notices', ${privilege}) as allowed`;
        expect(g!.allowed, `${role} ${privilege}`).toBe(false);
      }
      const [fn] = await p.db`select has_function_privilege(${role},
        'app_private.f22_enqueue_client_notice(uuid,uuid,text,uuid)', 'EXECUTE') as allowed`;
      expect(fn!.allowed, role).toBe(false);
    }
    for (const signature of [
      'public.read_client_notices(integer,timestamptz)',
      'public.mark_client_notice_read(uuid)',
    ]) {
      for (const [role, allowed] of [
        ['anon', false],
        ['authenticated', true],
        ['service_role', false],
      ] as const) {
        const [g] =
          await p.db`select has_function_privilege(${role}, ${signature}, 'EXECUTE') as allowed`;
        expect(g!.allowed, `${role} ${signature}`).toBe(allowed);
      }
    }
  });

  it('keeps rows immutable apart from a single read_at transition', async () => {
    const notice = await enqueue(
      p.fixture.wsA.id,
      owner.clientId,
      'workout_delivered',
    );
    await expect(
      p.db`update app_private.client_inbox_notices set notice_kind='nutrition_delivered' where id=${notice}`,
    ).rejects.toThrow(/client_notice_immutable/u);
    await expect(
      p.db`delete from app_private.client_inbox_notices where id=${notice}`,
    ).rejects.toThrow(/client_notice_immutable/u);
  });

  it('leaves the F15 staff inbox schema unchanged', async () => {
    const columns =
      await p.db`select column_name from information_schema.columns
      where table_schema='app_private' and table_name='form_alert_inbox' order by ordinal_position`;
    expect(columns.map((c) => c.column_name)).toEqual([
      'id',
      'workspace_id',
      'delivery_id',
      'recipient_user_id',
      'source_assignment_id',
      'stage',
      'created_at',
      'read_at',
    ]);
  });
});
