import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  anonClient,
  checked,
  createStaff,
  sql,
  twoWorkspaceFixture,
  type Workspace,
} from './harness';

const db = sql();
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
afterAll(async () => {
  await db.end();
});

function blockedUpdate(result: {
  error: { code: string } | null;
  data: unknown[] | null;
}) {
  if (result.error) expect(result.error.code).toBe('42501');
  expect(result.data ?? []).toEqual([]);
}

describe('T009 governance', () => {
  for (const actor of ['woA', 'trainerA', 'salesA', 'anon'] as const) {
    it(`${actor} cannot perform any governance write in A or B`, async () => {
      const client = actor === 'anon' ? anonClient() : f[actor].client;
      const actorId = actor === 'anon' ? f.trainerA.userId : f[actor].userId;
      const unprofiled = await createStaff(null, `governance-${actor}`);
      const workspaceId = randomUUID();
      const inserted = await client
        .from('workspaces')
        .insert({
          id: workspaceId,
          name: 'Forbidden',
          slug: `f3-forbidden-${randomUUID()}`,
          created_by: actorId,
        })
        .select();
      expect(inserted.error?.code).toBe('42501');
      expect(
        await db`select id from public.workspaces where id = ${workspaceId}`,
      ).toHaveLength(0);

      for (const ws of [f.wsA, f.wsB]) {
        blockedUpdate(
          await client
            .from('workspaces')
            .update({ name: 'Forbidden' })
            .eq('id', ws.id)
            .select(),
        );
        const [workspace] =
          await db`select name from public.workspaces where id = ${ws.id}`;
        expect(workspace?.name).toBe(ws.name);

        const membershipId = randomUUID();
        const grant = await client
          .from('workspace_memberships')
          .insert({
            id: membershipId,
            workspace_id: ws.id,
            user_id: actorId,
            granted_by: actorId,
          })
          .select();
        expect(grant.error?.code).toBe('42501');
        expect(
          await db`select id from public.workspace_memberships where id = ${membershipId}`,
        ).toHaveLength(0);

        const targetId = ws.id === f.wsA.id ? actorId : f.trainerB.userId;
        blockedUpdate(
          await client
            .from('workspace_memberships')
            .update({
              revoked_at: new Date().toISOString(),
              revoked_by: actorId,
            })
            .eq('workspace_id', ws.id)
            .eq('user_id', targetId)
            .select(),
        );
        const [membership] =
          await db`select revoked_at, revoked_by from public.workspace_memberships where workspace_id = ${ws.id} and user_id = ${targetId}`;
        expect(membership).toMatchObject({
          revoked_at: null,
          revoked_by: null,
        });
      }

      const profile = await client
        .from('staff_profiles')
        .insert({ user_id: unprofiled.userId, role: 'platform_owner' })
        .select();
      expect(profile.error?.code).toBe('42501');
      expect(
        await db`select user_id from public.staff_profiles where user_id = ${unprofiled.userId}`,
      ).toHaveLength(0);
      for (const target of [actorId, f.trainerB.userId]) {
        const [before] =
          await db`select role from public.staff_profiles where user_id = ${target}`;
        blockedUpdate(
          await client
            .from('staff_profiles')
            .update({ role: 'platform_owner' })
            .eq('user_id', target)
            .select(),
        );
        const [after] =
          await db`select role from public.staff_profiles where user_id = ${target}`;
        expect(after).toEqual(before);
      }
    });
  }

  it('PO creates/updates workspace and staff, grants/revokes, rejects duplicates, then re-grants with history', async () => {
    const ws = checked(
      await f.po.client
        .from('workspaces')
        .insert({
          name: 'C',
          slug: `f3-c-${randomUUID()}`,
          created_by: f.po.userId,
        })
        .select()
        .single(),
    ) as Workspace;
    checked(
      await f.po.client
        .from('workspaces')
        .update({ name: 'C updated' })
        .eq('id', ws.id)
        .select()
        .single(),
    );
    const staff = await createStaff(null, 'po-managed');
    checked(
      await f.po.client
        .from('staff_profiles')
        .insert({ user_id: staff.userId, role: 'sales' })
        .select()
        .single(),
    );
    checked(
      await f.po.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', staff.userId)
        .select()
        .single(),
    );
    const [profile] =
      await db`select role from public.staff_profiles where user_id = ${staff.userId}`;
    expect(profile?.role).toBe('trainer');
    const membership = {
      workspace_id: ws.id,
      user_id: f.trainerB.userId,
      granted_by: f.po.userId,
    };
    const first = checked(
      await f.po.client
        .from('workspace_memberships')
        .insert(membership)
        .select()
        .single(),
    ) as { id: string };
    const duplicate = await f.po.client
      .from('workspace_memberships')
      .insert(membership);
    expect(duplicate.error?.code).toBe('23505');
    expect(
      await db`select id from public.workspace_memberships where workspace_id = ${ws.id}`,
    ).toHaveLength(1);
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update({ revoked_at: '2000-01-01T00:00:00Z', revoked_by: f.po.userId })
        .eq('id', first.id)
        .select()
        .single(),
    );
    const second = checked(
      await f.po.client
        .from('workspace_memberships')
        .insert(membership)
        .select()
        .single(),
    ) as { id: string };
    expect(second.id).not.toBe(first.id);
    const history =
      await db`select id, revoked_at, revoked_by, abs(extract(epoch from (revoked_at - now()))) < 300 as recent from public.workspace_memberships where workspace_id = ${ws.id}`;
    expect(history).toHaveLength(2);
    expect(history.find((row) => row.id === first.id)).toMatchObject({
      revoked_by: f.po.userId,
      recent: true,
    });
    expect(history.find((row) => row.id === second.id)).toMatchObject({
      revoked_at: null,
      revoked_by: null,
    });
    const [workspace] =
      await db`select name from public.workspaces where id = ${ws.id}`;
    expect(workspace?.name).toBe('C updated');
  });

  it('PO cannot forge created_by or granted_by', async () => {
    const id = randomUUID();
    expect(
      (
        await f.po.client.from('workspaces').insert({
          id,
          name: 'Forged',
          slug: `f3-forged-${randomUUID()}`,
          created_by: f.trainerA.userId,
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      await db`select id from public.workspaces where id = ${id}`,
    ).toHaveLength(0);
    expect(
      (
        await f.po.client
          .from('workspaces')
          .update({ created_by: f.trainerA.userId })
          .eq('id', f.wsA.id)
      ).error?.code,
    ).toBe('42501');
    const [ws] =
      await db`select created_by from public.workspaces where id = ${f.wsA.id}`;
    expect(ws?.created_by).toBe(f.po.userId);
    expect(
      (
        await f.po.client.from('workspace_memberships').insert({
          id,
          workspace_id: f.wsA.id,
          user_id: f.trainerB.userId,
          granted_by: f.trainerA.userId,
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      await db`select id from public.workspace_memberships where id = ${id}`,
    ).toHaveLength(0);
  });

  it('guard compares every immutable column and prevents forged or repeated revocation, including service role', async () => {
    const staff = await createStaff('trainer', 'guard');
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: f.wsA.id,
        user_id: staff.userId,
        granted_by: f.po.userId,
      }),
    );
    const rows =
      await db`select * from public.workspace_memberships where workspace_id = ${f.wsA.id} and user_id = ${staff.userId}`;
    const original = rows[0];
    if (!original) throw new Error('Membership fixture missing');
    const revoke = {
      revoked_at: new Date().toISOString(),
      revoked_by: f.po.userId,
    };
    const mutations = [
      { id: randomUUID() },
      { workspace_id: f.wsB.id },
      { user_id: f.trainerB.userId },
      { granted_at: '2000-01-01T00:00:00Z' },
      { granted_by: f.trainerB.userId },
    ];
    const unchanged = async () => {
      const [row] =
        await db`select * from public.workspace_memberships where id = ${original.id}`;
      expect(row).toEqual(original);
    };
    for (const client of [f.po.client, admin()]) {
      for (const mutation of mutations) {
        expect(
          (
            await client
              .from('workspace_memberships')
              .update({ ...revoke, ...mutation })
              .eq('id', original.id)
          ).error?.code,
        ).toBe('23514');
        await unchanged();
      }
      expect(
        (
          await client
            .from('workspace_memberships')
            .update({ revoked_at: revoke.revoked_at })
            .eq('id', original.id)
        ).error?.code,
      ).toBe('23514');
      await unchanged();
    }
    expect(
      (
        await f.po.client
          .from('workspace_memberships')
          .update({ ...revoke, revoked_by: f.trainerB.userId })
          .eq('id', original.id)
      ).error?.code,
    ).toBe('23514');
    await unchanged();
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update(revoke)
        .eq('id', original.id)
        .select()
        .single(),
    );
    const [revoked] =
      await db`select * from public.workspace_memberships where id = ${original.id}`;
    for (const client of [f.po.client, admin()]) {
      for (const mutation of [{ revoked_at: null, revoked_by: null }, revoke]) {
        expect(
          (
            await client
              .from('workspace_memberships')
              .update(mutation)
              .eq('id', original.id)
          ).error?.code,
        ).toBe('23514');
        const [row] =
          await db`select * from public.workspace_memberships where id = ${original.id}`;
        expect(row).toEqual(revoked);
      }
    }
    // A null auth.uid() skips attribution equality only; the service fixture can revoke.
    checked(
      await admin().from('workspace_memberships').insert({
        workspace_id: f.wsB.id,
        user_id: staff.userId,
        granted_by: f.po.userId,
      }),
    );
    checked(
      await admin()
        .from('workspace_memberships')
        .update(revoke)
        .eq('workspace_id', f.wsB.id)
        .eq('user_id', staff.userId)
        .select()
        .single(),
    );
    const [serviceRevoked] =
      await db`select revoked_by from public.workspace_memberships where workspace_id = ${f.wsB.id} and user_id = ${staff.userId}`;
    expect(serviceRevoked?.revoked_by).toBe(f.po.userId);
  });

  it('DELETE is denied to every application role, including PO and anon', async () => {
    const clients: SupabaseClient[] = [
      f.po.client,
      f.woA.client,
      f.trainerA.client,
      f.salesA.client,
      anonClient(),
    ];
    const [membership] =
      await db`select id from public.workspace_memberships where workspace_id = ${f.wsA.id} and user_id = ${f.trainerA.userId}`;
    if (!membership) throw new Error('Membership fixture missing');
    for (const [table, column, id] of [
      ['workspaces', 'id', f.wsA.id],
      ['workspace_memberships', 'id', membership.id as string],
      ['staff_profiles', 'user_id', f.trainerA.userId],
    ] as const) {
      const before =
        await db`select * from ${db(`public.${table}`)} where ${db(column)} = ${id}`;
      expect(before).toHaveLength(1);
      for (const client of clients) {
        expect(
          (await client.from(table).delete().eq(column, id).select()).error
            ?.code,
        ).toBe('42501');
        expect(
          await db`select * from ${db(`public.${table}`)} where ${db(column)} = ${id}`,
        ).toEqual(before);
      }
    }
  });
});
