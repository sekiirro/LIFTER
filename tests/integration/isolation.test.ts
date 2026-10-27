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

describe('T008 workspace isolation', () => {
  it.each(['woA', 'trainerA', 'salesA'] as const)(
    '%s cannot read foreign workspace, membership or profile rows',
    async (actor) => {
      const staff = f[actor];
      for (const [table, column, value] of [
        ['workspaces', 'id', f.wsB.id],
        ['workspace_memberships', 'workspace_id', f.wsB.id],
        ['staff_profiles', 'user_id', f.trainerB.userId],
      ] as const) {
        expect(
          checked(await staff.client.from(table).select('*').eq(column, value)),
        ).toEqual([]);
      }
      await db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: staff.userId, role: 'authenticated' })}, true)`;
        const [row] =
          await tx`select app_private.has_workspace_access(${f.wsB.id}::uuid) as allowed`;
        expect(row?.allowed).toBe(false);
      });
    },
  );

  it('(a) trainer A reads only A, including a targeted foreign lookup', async () => {
    const rows = checked(
      await f.trainerA.client.from('workspaces').select('id'),
    );
    expect(rows).toEqual([{ id: f.wsA.id }]);
    expect(
      checked(
        await f.trainerA.client
          .from('workspaces')
          .select('id')
          .eq('id', f.wsB.id),
      ),
    ).toEqual([]);
  });

  it('(b) trainer sees only their own membership, never the WO or B membership', async () => {
    const rows = checked(
      await f.trainerA.client
        .from('workspace_memberships')
        .select('workspace_id,user_id'),
    );
    expect(rows).toEqual([
      { workspace_id: f.wsA.id, user_id: f.trainerA.userId },
    ]);
    expect(
      checked(
        await f.trainerA.client
          .from('workspace_memberships')
          .select('id')
          .eq('workspace_id', f.wsB.id),
      ),
    ).toEqual([]);
    expect(
      checked(await f.trainerA.client.from('staff_profiles').select('user_id')),
    ).toEqual([{ user_id: f.trainerA.userId }]);
    expect(
      checked(
        await f.trainerA.client
          .from('staff_profiles')
          .select('user_id')
          .eq('user_id', f.trainerB.userId),
      ),
    ).toEqual([]);
  });

  it('(c) PO without membership reads both workspaces and every fixture membership/profile', async () => {
    const ids = [f.wsA.id, f.wsB.id];
    expect(
      checked(await f.po.client.from('workspaces').select('id').in('id', ids)),
    ).toHaveLength(2);
    expect(
      checked(
        await f.po.client
          .from('workspace_memberships')
          .select('id')
          .in('workspace_id', ids),
      ),
    ).toHaveLength(4);
    const staffIds = [f.po, f.woA, f.trainerA, f.salesA, f.trainerB].map(
      (staff) => staff.userId,
    );
    expect(
      checked(
        await f.po.client
          .from('staff_profiles')
          .select('user_id')
          .in('user_id', staffIds),
      ),
    ).toHaveLength(5);
  });

  it('(d) anonymous reads return no data or permission denied', async () => {
    for (const table of [
      'workspaces',
      'staff_profiles',
      'workspace_memberships',
    ]) {
      const { data, error } = await anonClient().from(table).select('*');
      expect(data ?? []).toEqual([]);
      if (error) expect(error.code).toBe('42501');
    }
  });

  it('(e) revoked sales membership loses workspace access and remains in history', async () => {
    checked(
      await f.po.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: f.po.userId,
        })
        .eq('workspace_id', f.wsA.id)
        .eq('user_id', f.salesA.userId)
        .select()
        .single(),
    );
    expect(
      checked(await f.salesA.client.from('workspaces').select('id')),
    ).toEqual([]);
    const rows =
      await db`select revoked_at, revoked_by from public.workspace_memberships where workspace_id = ${f.wsA.id} and user_id = ${f.salesA.userId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(rows[0]?.revoked_by).toBe(f.po.userId);
  });

  it('(f) auth-only identity sees no tenancy data', async () => {
    const staff = await createStaff(null, 'no-profile');
    for (const table of [
      'workspaces',
      'workspace_memberships',
      'staff_profiles',
    ]) {
      expect(checked(await staff.client.from(table).select('*'))).toEqual([]);
    }
  });

  it('(g) trainer without memberships sees no workspace', async () => {
    const staff = await createStaff('trainer', 'no-memberships');
    expect(checked(await staff.client.from('workspaces').select('id'))).toEqual(
      [],
    );
  });

  it('(h) database helper uses the authenticated JWT identity inside a transaction', async () => {
    await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })}, true)`;
      const [row] =
        await tx`select auth.uid() as identity, app_private.has_workspace_access(${f.wsA.id}::uuid) as own, app_private.has_workspace_access(${f.wsB.id}::uuid) as foreign_access`;
      expect(row).toMatchObject({
        identity: f.trainerA.userId,
        own: true,
        foreign_access: false,
      });
      expect(
        await tx`select id from public.workspaces where id = ${f.wsB.id}`,
      ).toHaveLength(0);
    });
  });
});
