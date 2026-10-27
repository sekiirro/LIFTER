import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  checked,
  createStaff,
  sql,
  twoWorkspaceFixture,
} from './harness';

const db = sql();
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
afterAll(async () => {
  await db.end();
});

async function events(target: string) {
  return db`select * from public.audit_events where target_id = ${target} order by id`;
}

describe('emission (T002)', () => {
  it('audits every PO governance change exactly once, with allow-listed details', async () => {
    const workspaceId = randomUUID();
    const slug = `f5-c-${randomUUID()}`;
    checked(
      await f.po.client.from('workspaces').insert({
        id: workspaceId,
        name: 'C',
        slug,
        created_by: f.po.userId,
      }),
    );
    expect(await events(workspaceId)).toHaveLength(1);
    expect((await events(workspaceId))[0]).toMatchObject({
      action: 'workspace.created',
      actor_user_id: f.po.userId,
      workspace_id: workspaceId,
      target_id: workspaceId,
      target_table: 'workspaces',
      details: {},
    });
    checked(
      await f.po.client
        .from('workspaces')
        .update({ name: 'C renamed' })
        .eq('id', workspaceId),
    );
    expect(await events(workspaceId)).toHaveLength(2);
    expect((await events(workspaceId))[1]).toMatchObject({
      action: 'workspace.updated',
      actor_user_id: f.po.userId,
      workspace_id: workspaceId,
      details: { changed: { name: { from: 'C', to: 'C renamed' } } },
    });
    const renamedSlug = `f5-renamed-${randomUUID()}`;
    checked(
      await f.po.client
        .from('workspaces')
        .update({ slug: renamedSlug })
        .eq('id', workspaceId),
    );
    expect(await events(workspaceId)).toHaveLength(3);
    expect((await events(workspaceId))[2]?.details).toEqual({
      changed: { slug: { from: slug, to: renamedSlug } },
    });
    checked(
      await f.po.client
        .from('workspaces')
        .update({ name: 'C renamed', slug: renamedSlug })
        .eq('id', workspaceId),
    );
    expect(await events(workspaceId)).toHaveLength(3);

    const membershipId = randomUUID();
    checked(
      await f.po.client.from('workspace_memberships').insert({
        id: membershipId,
        workspace_id: workspaceId,
        user_id: f.trainerB.userId,
        granted_by: f.po.userId,
      }),
    );
    expect(await events(membershipId)).toHaveLength(1);
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update({
          revoked_at: '2000-01-01T00:00:00Z',
          revoked_by: f.po.userId,
        })
        .eq('id', membershipId),
    );
    const membershipEvents = await events(membershipId);
    expect(membershipEvents).toHaveLength(2);
    expect(membershipEvents.map((row) => row.action)).toEqual([
      'membership.granted',
      'membership.revoked',
    ]);
    for (const row of membershipEvents) {
      expect(row).toMatchObject({
        actor_user_id: f.po.userId,
        target_table: 'workspace_memberships',
        workspace_id: workspaceId,
        details: { user_id: f.trainerB.userId },
      });
    }
    const [revoked] =
      await db`select revoked_at > '2000-01-01'::timestamptz as final_value from public.workspace_memberships where id = ${membershipId}`;
    expect(revoked?.final_value).toBe(true);

    const staff = await createStaff(null, 'f5-assigned');
    checked(
      await f.po.client
        .from('staff_profiles')
        .insert({ user_id: staff.userId, role: 'sales' }),
    );
    expect(await events(staff.userId)).toHaveLength(1);
    checked(
      await f.po.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', staff.userId),
    );
    checked(
      await f.po.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', staff.userId),
    );
    const staffEvents = await events(staff.userId);
    expect(staffEvents).toHaveLength(2);
    expect(staffEvents[0]).toMatchObject({
      action: 'staff_role.assigned',
      details: { role: 'sales' },
    });
    expect(staffEvents[1]).toMatchObject({
      action: 'staff_role.changed',
      details: { from: 'sales', to: 'trainer' },
    });
    for (const row of staffEvents) {
      expect(row).toMatchObject({
        actor_user_id: f.po.userId,
        workspace_id: null,
        target_table: 'staff_profiles',
      });
    }

    const fixtureEvents =
      await db`select * from public.audit_events where workspace_id in (${f.wsA.id}, ${f.wsB.id}) or target_id in (${f.po.userId}, ${f.woA.userId}, ${f.trainerA.userId}, ${f.salesA.userId}, ${f.trainerB.userId})`;
    expect(fixtureEvents).toHaveLength(11);
    expect(fixtureEvents.every((row) => row.actor_user_id === null)).toBe(true);
    const produced = [
      ...fixtureEvents,
      ...(await events(workspaceId)),
      ...membershipEvents,
      ...staffEvents,
    ];
    for (const row of produced) {
      const details = JSON.stringify(row.details);
      expect(details).not.toContain('@');
      for (const identity of [
        f.po,
        f.woA,
        f.trainerA,
        f.salesA,
        f.trainerB,
        staff,
      ]) {
        expect(details).not.toContain(identity.email);
      }
    }
  });

  it('emits nothing for rejected writes or a rolled-back source transaction', async () => {
    const id = randomUUID();
    const slug = `f5-rejected-${randomUUID()}`;
    const result = await f.trainerA.client
      .from('workspaces')
      .insert({ id, name: 'Rejected', slug, created_by: f.trainerA.userId });
    expect(result.error?.code).toBe('42501');
    expect(await events(id)).toHaveLength(0);
    expect(
      await db`select id from public.workspaces where id = ${id} or slug = ${slug}`,
    ).toHaveLength(0);
    await expect(
      db.begin(async (tx) => {
        await tx`insert into public.workspaces (id, name, slug, created_by) values (${id}, 'Rolled back', ${slug}, ${f.po.userId})`;
        expect(
          await tx`select id from public.audit_events where target_id = ${id}`,
        ).toHaveLength(1);
        throw new Error('rollback source write');
      }),
    ).rejects.toThrow('rollback source write');
    expect(await events(id)).toHaveLength(0);
  });
});

describe('immutability (T003)', () => {
  it.each(['workspaces', 'staff_profiles', 'workspace_memberships'] as const)(
    'postgres cannot DELETE or TRUNCATE audited governance table %s',
    async (table) => {
      const [role] = await db`select current_user as name`;
      expect(role?.name).toBe('postgres');
      const key = table === 'staff_profiles' ? 'user_id' : 'id';
      const before =
        await db`select * from public.${db(table)} order by ${db(key)}`;
      expect(before.length).toBeGreaterThan(0);
      const target = before[0];
      if (!target) throw new Error('Governance fixture row missing');
      const historyBefore =
        await db`select * from public.audit_events order by id`;
      for (const operation of ['delete', 'truncate'] as const) {
        await expect(
          db.begin(async (tx) => {
            if (operation === 'delete')
              await tx`delete from public.${tx(table)} where ${tx(key)} = ${target[key]}`;
            // CASCADE reaches the trigger instead of failing on foreign keys.
            if (operation === 'truncate')
              await tx`truncate public.${tx(table)} cascade`;
            throw new Error('governance mutation unexpectedly succeeded');
          }),
        ).rejects.toMatchObject({
          code: '23514',
          message: 'Deletes are not allowed on audited governance tables',
        });
        expect(
          await db`select * from public.${db(table)} order by ${db(key)}`,
        ).toEqual(before);
        expect(await db`select * from public.audit_events order by id`).toEqual(
          historyBefore,
        );
      }
    },
  );

  it.each(['postgres', 'service_role', 'authenticated', 'anon'] as const)(
    '%s cannot UPDATE, DELETE or TRUNCATE audit history',
    async (role) => {
      const before = await events(f.wsA.id);
      expect(before).toHaveLength(1);
      const [countBefore] =
        await db`select count(*)::int as count from public.audit_events`;
      for (const operation of ['update', 'delete', 'truncate'] as const) {
        await expect(
          db.begin(async (tx) => {
            if (role === 'service_role') await tx`set local role service_role`;
            if (role === 'authenticated') {
              await tx`set local role authenticated`;
              await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })}, true)`;
            }
            if (role === 'anon') await tx`set local role anon`;
            if (operation === 'update')
              await tx`update public.audit_events set action = 'tampered.event' where target_id = ${f.wsA.id}`;
            if (operation === 'delete')
              await tx`delete from public.audit_events where target_id = ${f.wsA.id}`;
            if (operation === 'truncate')
              await tx`truncate public.audit_events`;
            // Always roll back if a missing guard accidentally permits a mutation.
            throw new Error('audit mutation unexpectedly succeeded');
          }),
        ).rejects.toMatchObject({
          code: role === 'postgres' ? '23514' : '42501',
        });
        expect(await events(f.wsA.id)).toEqual(before);
        const [countAfter] =
          await db`select count(*)::int as count from public.audit_events`;
        expect(countAfter).toEqual(countBefore);
      }
    },
  );

  it.each(['po', 'woA', 'trainerA'] as const)(
    '%s cannot insert, update or delete through the API',
    async (actor) => {
      const before = await events(f.wsA.id);
      const forgedTarget = randomUUID();
      const client = f[actor].client;
      const results = [
        await client
          .from('audit_events')
          .insert({
            action: 'forged.event',
            target_table: 'workspaces',
            target_id: forgedTarget,
            workspace_id: f.wsA.id,
          })
          .select(),
        await client
          .from('audit_events')
          .update({ action: 'tampered.event' })
          .eq('target_id', f.wsA.id)
          .select(),
        await client
          .from('audit_events')
          .delete()
          .eq('target_id', f.wsA.id)
          .select(),
      ];
      for (const result of results) {
        expect(result.data ?? []).toEqual([]);
        if (result.error) expect(result.error.code).toBe('42501');
      }
      expect(await events(f.wsA.id)).toEqual(before);
      expect(await events(forgedTarget)).toHaveLength(0);
    },
  );
});

describe('visibility (T004)', () => {
  it('PO sees A, B and platform events; WO sees only active own-workspace events', async () => {
    checked(
      await f.po.client
        .from('staff_profiles')
        .update({ role: 'sales' })
        .eq('user_id', f.trainerB.userId),
    );
    const platform = (await events(f.trainerB.userId)).find(
      (row) => row.action === 'staff_role.changed',
    );
    if (!platform) throw new Error('Platform audit event missing');
    const expected = [
      ...(await events(f.wsA.id)),
      ...(await events(f.wsB.id)),
      platform,
    ];
    const ids = expected.map((row) => row.id);
    const poRows = checked(
      await f.po.client.from('audit_events').select('*').in('id', ids),
    );
    if (!poRows) throw new Error('PO audit query returned no data');
    expect(poRows).toHaveLength(3);
    expect(poRows.map((row) => row.workspace_id)).toEqual(
      expect.arrayContaining([f.wsA.id, f.wsB.id, null]),
    );
    const ownRows = checked(
      await f.woA.client.from('audit_events').select('*'),
    );
    if (!ownRows) throw new Error('WO audit query returned no data');
    expect(ownRows.length).toBeGreaterThan(0);
    expect(ownRows.every((row) => row.workspace_id === f.wsA.id)).toBe(true);
    expect(
      checked(
        await f.woA.client.from('audit_events').select('*').in('id', ids),
      ),
    ).toHaveLength(1);
    expect(
      checked(
        await f.woA.client
          .from('audit_events')
          .select('*')
          .eq('workspace_id', f.wsB.id),
      ),
    ).toEqual([]);
    expect(
      checked(
        await f.woA.client
          .from('audit_events')
          .select('*')
          .is('workspace_id', null),
      ),
    ).toEqual([]);
    for (const client of [f.trainerA.client, f.salesA.client, anonClient()]) {
      const result = await client.from('audit_events').select('*');
      expect(result.data ?? []).toEqual([]);
      if (result.error) expect(result.error.code).toBe('42501');
    }
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update({ revoked_at: '2000-01-01T00:00:00Z', revoked_by: f.po.userId })
        .eq('workspace_id', f.wsA.id)
        .eq('user_id', f.woA.userId)
        .select()
        .single(),
    );
    expect(
      checked(await f.woA.client.from('audit_events').select('*')),
    ).toEqual([]);
  });
});
