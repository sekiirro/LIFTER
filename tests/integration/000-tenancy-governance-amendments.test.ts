import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import { admin, checked, createStaff, sql } from './harness';
import { clientContext, graph } from './registration-approval-fixture';
import { testStaffDisplayName } from '../helpers/staff-display-name';

const db = sql();
afterAll(async () => db.end());
let finalGuardActors:
  | {
      actor: Awaited<ReturnType<typeof createStaff>>;
      target: Awaited<ReturnType<typeof createStaff>>;
    }
  | undefined;

async function ownerCount() {
  const [row] =
    await db`select count(*)::int as n from public.staff_profiles where role = 'platform_owner'`;
  return Number(row?.n ?? 0);
}

async function guardedOwnerCount() {
  const [row] =
    await db`select owner_count from app_private.f3_platform_owner_state where singleton`;
  return Number(row?.owner_count ?? 0);
}

async function makeWorkspace(
  owner: Awaited<ReturnType<typeof createStaff>>,
  label: string,
) {
  return checked(
    await owner.client
      .from('workspaces')
      .insert({
        name: label,
        slug: `s63-${randomUUID()}`,
        created_by: owner.userId,
      })
      .select()
      .single(),
  ) as { id: string };
}

async function grantMembership(
  owner: Awaited<ReturnType<typeof createStaff>>,
  workspaceId: string,
  userId: string,
) {
  return checked(
    await owner.client
      .from('workspace_memberships')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        granted_by: owner.userId,
      })
      .select()
      .single(),
  ) as { id: string };
}

async function roleOf(userId: string) {
  const [row] =
    await db`select role from public.staff_profiles where user_id = ${userId}`;
  return row?.role;
}

async function remainsPlatformOwner(userId: string) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
    const [row] = await tx`select app_private.is_platform_owner() as allowed`;
    return row?.allowed;
  });
}

async function hasWorkspaceAccess(userId: string, workspaceId: string) {
  return db.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
    const [row] =
      await tx`select app_private.has_workspace_access(${workspaceId}::uuid, null) as allowed`;
    return row?.allowed;
  });
}

async function membershipCounts(userId: string) {
  const [row] = await db`
    select count(*)::int as total,
      count(*) filter (where revoked_at is null)::int as active
    from public.workspace_memberships where user_id = ${userId}
  `;
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0) };
}

describe('T021 final Platform Owner demotion characterization and RED cases', () => {
  let first: Awaited<ReturnType<typeof createStaff>>;
  let second: Awaited<ReturnType<typeof createStaff>>;
  let soleOwner: Awaited<ReturnType<typeof createStaff>>;

  it('T021(a) demotes one Platform Owner while another remains', async () => {
    const ownersBefore = await ownerCount();
    first = await createStaff('platform_owner', 's63-t021-first');
    second = await createStaff('platform_owner', 's63-t021-second');
    expect(await ownerCount()).toBe(ownersBefore + 2);

    const result = await second.client
      .from('staff_profiles')
      .update({ role: 'trainer' })
      .eq('user_id', first.userId);
    expect(result.error).toBeNull();
    expect(await roleOf(first.userId)).toBe('trainer');
    expect(await remainsPlatformOwner(first.userId)).toBe(false);
    expect(await ownerCount()).toBe(ownersBefore + 1);
    soleOwner = second;
  });

  it('T021(b) refuses demotion when the isolated owner count is one (RED before T015)', async () => {
    let refusal: unknown;
    try {
      await db.begin(async (tx) => {
        // Isolate the final-owner condition from unrelated seeded owners.
        await tx`update app_private.f3_platform_owner_state set owner_count = 1 where singleton`;
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: soleOwner.userId, role: 'authenticated' })}, true)`;
        await tx`update public.staff_profiles set role = 'trainer' where user_id = ${soleOwner.userId}`;
      });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      code: '42501',
      message: 'not_permitted',
    });
    expect(await roleOf(soleOwner.userId)).toBe('platform_owner');
    expect(await guardedOwnerCount()).toBe(await ownerCount());
  });

  it('T021(c) permits add-first ownership transfer', async () => {
    const ownersBefore = await ownerCount();
    const replacement = await createStaff(null, 's63-t021-replacement');
    checked(
      await soleOwner.client.from('staff_profiles').insert({
        user_id: replacement.userId,
        role: 'platform_owner',
        display_name: testStaffDisplayName(),
      }),
    );
    const result = await soleOwner.client
      .from('staff_profiles')
      .update({ role: 'trainer' })
      .eq('user_id', soleOwner.userId);
    expect(result.error).toBeNull();
    expect(await ownerCount()).toBe(ownersBefore);
    expect(await remainsPlatformOwner(soleOwner.userId)).toBe(false);
    expect(await remainsPlatformOwner(replacement.userId)).toBe(true);
    soleOwner = replacement;
  });

  it('T021(d) serializes concurrent demotions at a two-owner guard count (RED before T015)', async () => {
    const ownersBefore = await ownerCount();
    const other = await createStaff(null, 's63-t021-racer');
    checked(
      await soleOwner.client.from('staff_profiles').insert({
        user_id: other.userId,
        role: 'platform_owner',
        display_name: testStaffDisplayName(),
      }),
    );
    expect(await ownerCount()).toBe(ownersBefore + 1);
    await db`update app_private.f3_platform_owner_state set owner_count = 2 where singleton`;
    try {
      expect(await guardedOwnerCount()).toBe(2);
      const results = await Promise.all([
        soleOwner.client
          .from('staff_profiles')
          .update({ role: 'trainer' })
          .eq('user_id', other.userId),
        other.client
          .from('staff_profiles')
          .update({ role: 'trainer' })
          .eq('user_id', soleOwner.userId),
      ]);
      expect(
        results.every(
          (result) => result.error === null || result.error.code === '42501',
        ),
      ).toBe(true);
      expect(
        [await roleOf(other.userId), await roleOf(soleOwner.userId)].filter(
          (role) => role === 'platform_owner',
        ),
      ).toHaveLength(1);
      expect(await guardedOwnerCount()).toBe(1);
      expect(await ownerCount()).toBeGreaterThanOrEqual(ownersBefore);
    } finally {
      await db`update app_private.f3_platform_owner_state
        set owner_count = (select count(*)::int from public.staff_profiles where role = 'platform_owner')
        where singleton`;
    }
    expect(await guardedOwnerCount()).toBe(await ownerCount());
  });

  it('T021(e) rolls back the role and every membership after a forced failure', async () => {
    const actor = await createStaff(
      'platform_owner',
      's63-t021-rollback-actor',
    );
    const target = await createStaff(
      'platform_owner',
      's63-t021-rollback-target',
    );
    finalGuardActors = { actor, target };
    const workspace = await makeWorkspace(actor, 'T021 rollback workspace');
    const membership = await grantMembership(
      actor,
      workspace.id,
      target.userId,
    );
    const [beforeMembership] =
      await db`select id, workspace_id, user_id, granted_at, granted_by, revoked_at, revoked_by from public.workspace_memberships where id = ${membership.id}`;

    const forcedFailure = new Error('S63 synthetic rollback');
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
        await tx`update public.staff_profiles set role = 'trainer' where user_id = ${target.userId}`;
        await tx`update public.workspace_memberships set revoked_at = now(), revoked_by = ${actor.userId} where id = ${membership.id}`;
        throw forcedFailure;
      }),
    ).rejects.toBe(forcedFailure);

    expect(await roleOf(target.userId)).toBe('platform_owner');
    const [afterMembership] =
      await db`select id, workspace_id, user_id, granted_at, granted_by, revoked_at, revoked_by from public.workspace_memberships where id = ${membership.id}`;
    expect(afterMembership).toEqual(beforeMembership);
  });
});

describe('T015 shared final-owner serialization paths', () => {
  it('keeps the no-delete protection while demotion races with staff-profile deletion', async () => {
    if (!finalGuardActors) {
      finalGuardActors = {
        actor: await createStaff('platform_owner', 's63-t015-race-actor'),
        target: await createStaff('platform_owner', 's63-t015-race-target'),
      };
    }
    const { actor, target } = finalGuardActors;
    const beforeOwners = await ownerCount();
    expect(beforeOwners).toBeGreaterThanOrEqual(2);

    const [demotion, deletion] = await Promise.allSettled([
      actor.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', target.userId),
      db`delete from public.staff_profiles where user_id = ${actor.userId}`,
    ]);
    expect(deletion.status).toBe('rejected');
    if (deletion.status === 'rejected')
      expect(deletion.reason).toMatchObject({ code: '23514' });
    if (demotion.status === 'fulfilled')
      expect(demotion.value.error).toBeNull();
    expect(await ownerCount()).toBeGreaterThanOrEqual(beforeOwners - 1);
  });

  it('T015 membership revocation waits on the shared final-owner transaction lock', async () => {
    const actor =
      (finalGuardActors &&
        (await roleOf(finalGuardActors.actor.userId)) === 'platform_owner' &&
        finalGuardActors.actor) ||
      (finalGuardActors &&
        (await roleOf(finalGuardActors.target.userId)) === 'platform_owner' &&
        finalGuardActors.target);
    if (!actor)
      throw new Error('T015 synthetic Platform Owner fixture missing');
    const trainer = await createStaff('trainer', 's63-t015-lock-trainer');
    const workspace = await makeWorkspace(actor, 'T015 lock workspace');
    const membership = await grantMembership(
      actor,
      workspace.id,
      trainer.userId,
    );
    const holder = sql();
    const revoker = sql();
    const observer = sql();
    const [backend] = await revoker`select pg_backend_pid() as pid`;
    let releaseHolder = () => {};
    let signalReady = () => {};
    const releasePromise = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const readyPromise = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    const holderPromise = holder.begin(async (tx) => {
      await tx`update app_private.f3_platform_owner_state
        set owner_count = owner_count where singleton`;
      signalReady();
      await releasePromise;
    });
    await readyPromise;
    const revocationPromise = revoker.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
      await tx`update public.workspace_memberships set revoked_at = now(), revoked_by = ${actor.userId} where id = ${membership.id}`;
    });
    let waitedOnLock = false;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [activity] = await observer`
          select wait_event_type
          from pg_catalog.pg_stat_activity
          where pid = ${backend?.pid}
        `;
        if (activity?.wait_event_type === 'Lock') {
          waitedOnLock = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waitedOnLock).toBe(true);
    } finally {
      releaseHolder();
      await holderPromise;
      await revocationPromise;
      await Promise.all([holder.end(), revoker.end(), observer.end()]);
    }
    const [revoked] =
      await db`select revoked_at from public.workspace_memberships where id = ${membership.id}`;
    expect(revoked?.revoked_at).not.toBeNull();
  });
});

describe('T022/T024 membership-revocation characterization under S37-Q5 = A', () => {
  it('T022 revokes a Platform Owner membership without changing role or role-based access', async () => {
    const actor = await createStaff('platform_owner', 's63-t022-actor');
    const member = await createStaff('platform_owner', 's63-t022-member');
    const workspace = await makeWorkspace(actor, 'T022 workspace');
    const membership = await grantMembership(
      actor,
      workspace.id,
      member.userId,
    );
    const beforeOwners = await ownerCount();

    checked(
      await actor.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: actor.userId,
        })
        .eq('id', membership.id),
    );

    const [revoked] =
      await db`select revoked_at, revoked_by from public.workspace_memberships where id = ${membership.id}`;
    expect(revoked?.revoked_at).not.toBeNull();
    expect(revoked?.revoked_by).toBe(actor.userId);
    expect(await roleOf(member.userId)).toBe('platform_owner');
    expect(await remainsPlatformOwner(member.userId)).toBe(true);
    expect(await ownerCount()).toBe(beforeOwners);
  });

  it('T024 concurrent Platform Owner membership revocations both commit and preserve roles/count', async () => {
    const first = await createStaff('platform_owner', 's63-t024-first');
    const second = await createStaff('platform_owner', 's63-t024-second');
    const workspaceA = await makeWorkspace(first, 'T024 workspace A');
    const workspaceB = await makeWorkspace(first, 'T024 workspace B');
    const membershipA = await grantMembership(
      first,
      workspaceA.id,
      first.userId,
    );
    const membershipB = await grantMembership(
      first,
      workspaceB.id,
      second.userId,
    );
    const beforeOwners = await ownerCount();

    const results = await Promise.all([
      first.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: first.userId,
        })
        .eq('id', membershipA.id),
      second.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: second.userId,
        })
        .eq('id', membershipB.id),
    ]);
    expect(results.every((result) => result.error === null)).toBe(true);
    const revoked =
      await db`select id, revoked_at from public.workspace_memberships where id in (${membershipA.id}, ${membershipB.id})`;
    expect(revoked).toHaveLength(2);
    expect(revoked.every((row) => row.revoked_at !== null)).toBe(true);
    expect(await roleOf(first.userId)).toBe('platform_owner');
    expect(await roleOf(second.userId)).toBe('platform_owner');
    expect(await ownerCount()).toBe(beforeOwners);
  });
});

describe('T014 Workspace Owner roster boundary', () => {
  it('exposes only active membership fields for the current owner workspace', async () => {
    const po = await createStaff('platform_owner', 's63-t014-po');
    const ownerA = await createStaff('workspace_owner', 's63-t014-owner-a');
    const ownerB = await createStaff('workspace_owner', 's63-t014-owner-b');
    const activeA = await createStaff('trainer', 's63-t014-active-a');
    const revokedA = await createStaff('sales', 's63-t014-revoked-a');
    const activeB = await createStaff('trainer', 's63-t014-active-b');
    const workspaceA = await makeWorkspace(po, 'T014 workspace A');
    const workspaceB = await makeWorkspace(po, 'T014 workspace B');
    await grantMembership(po, workspaceA.id, ownerA.userId);
    await grantMembership(po, workspaceA.id, activeA.userId);
    const revokedMembership = await grantMembership(
      po,
      workspaceA.id,
      revokedA.userId,
    );
    await grantMembership(po, workspaceB.id, ownerB.userId);
    await grantMembership(po, workspaceB.id, activeB.userId);
    checked(
      await po.client
        .from('workspace_memberships')
        .update({ revoked_at: new Date().toISOString(), revoked_by: po.userId })
        .eq('id', revokedMembership.id),
    );

    const roster = await ownerA.client.rpc('f3_workspace_owner_roster', {
      p_workspace_id: workspaceA.id,
    });
    expect(roster.error).toBeNull();
    const rows = roster.data as Array<Record<string, unknown>>;
    expect(rows.map((row) => row.user_id).sort()).toEqual(
      [ownerA.userId, activeA.userId].sort(),
    );
    expect(
      rows.every(
        (row) =>
          Object.keys(row).sort().join(',') ===
          'granted_at,revoked_at,role,user_id,workspace_id',
      ),
    ).toBe(true);
    expect(rows.every((row) => row.workspace_id === workspaceA.id)).toBe(true);
    expect(rows.find((row) => row.user_id === activeA.userId)?.role).toBe(
      'trainer',
    );
    expect(
      rows.some(
        (row) =>
          row.user_id === revokedA.userId || row.user_id === activeB.userId,
      ),
    ).toBe(false);

    const foreignWorkspace = await ownerA.client.rpc(
      'f3_workspace_owner_roster',
      {
        p_workspace_id: workspaceB.id,
      },
    );
    expect(foreignWorkspace.error).toBeNull();
    expect(foreignWorkspace.data).toEqual([]);
    const nonOwner = await activeA.client.rpc('f3_workspace_owner_roster', {
      p_workspace_id: workspaceA.id,
    });
    expect(nonOwner.error).toBeNull();
    expect(nonOwner.data).toEqual([]);

    const directMembershipRead = await ownerA.client
      .from('workspace_memberships')
      .select('user_id, workspace_id, granted_at, revoked_at')
      .eq('workspace_id', workspaceA.id);
    expect(directMembershipRead.error).toBeNull();
    expect(directMembershipRead.data?.map((row) => row.user_id)).toEqual([
      ownerA.userId,
    ]);
    const directProfileRead = await ownerA.client
      .from('staff_profiles')
      .select('user_id, role, display_name')
      .in('user_id', [activeA.userId, revokedA.userId]);
    if (directProfileRead.error)
      expect(directProfileRead.error.code).toBe('42501');
    else expect(directProfileRead.data).toEqual([]);

    const [rpcSecurity] = await db`
      select p.prosecdef as security_definer,
        pg_catalog.pg_get_userbyid(p.proowner) as function_owner,
        p.proconfig as function_config,
        pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'f3_workspace_owner_roster'
    `;
    expect(rpcSecurity).toEqual({
      security_definer: true,
      function_owner: 'postgres',
      function_config: ['search_path=""'],
      authenticated_execute: true,
      anon_execute: false,
      service_role_execute: false,
    });
    const [counterAcl] = await db`
      select pg_catalog.has_table_privilege('authenticated', 'app_private.f3_platform_owner_state', 'SELECT') as readable,
        pg_catalog.has_table_privilege('authenticated', 'app_private.f3_platform_owner_state', 'UPDATE') as writable
    `;
    expect(counterAcl).toEqual({ readable: false, writable: false });
  });
});

describe('T025/T027 revocation boundary and stale sessions', () => {
  it('T025/T027(a) removes non-PO workspace access for the same signed session after revocation', async () => {
    const po = await createStaff('platform_owner', 's63-t025-po');
    const trainer = await createStaff('trainer', 's63-t025-trainer');
    const workspace = await makeWorkspace(po, 'T025 revoked workspace');
    const membership = await grantMembership(po, workspace.id, trainer.userId);

    const beforeRead = await trainer.client
      .from('workspaces')
      .select('id')
      .eq('id', workspace.id);
    expect(beforeRead.error).toBeNull();
    expect(beforeRead.data).toHaveLength(1);
    expect(await hasWorkspaceAccess(trainer.userId, workspace.id)).toBe(true);

    checked(
      await po.client
        .from('workspace_memberships')
        .update({ revoked_at: new Date().toISOString(), revoked_by: po.userId })
        .eq('id', membership.id),
    );

    const afterRead = await trainer.client
      .from('workspaces')
      .select('id')
      .eq('id', workspace.id);
    expect(afterRead.error).toBeNull();
    expect(afterRead.data).toEqual([]);
    expect(await hasWorkspaceAccess(trainer.userId, workspace.id)).toBe(false);

    const deniedWorkspace = await trainer.client
      .from('workspaces')
      .insert({
        name: 'T025 denied workspace',
        slug: `s63-${randomUUID()}`,
        created_by: trainer.userId,
      })
      .select('id');
    expect(
      Boolean(deniedWorkspace.error) || deniedWorkspace.data?.length === 0,
    ).toBe(true);

    const deniedMembership = await trainer.client
      .from('workspace_memberships')
      .insert({
        workspace_id: workspace.id,
        user_id: trainer.userId,
        granted_by: trainer.userId,
      })
      .select('id');
    expect(
      Boolean(deniedMembership.error) || deniedMembership.data?.length === 0,
    ).toBe(true);

    const deniedRole = await trainer.client
      .from('staff_profiles')
      .update({ role: 'workspace_owner' })
      .eq('user_id', trainer.userId)
      .select('user_id');
    expect(Boolean(deniedRole.error) || deniedRole.data?.length === 0).toBe(
      true,
    );
    expect(await roleOf(trainer.userId)).toBe('trainer');
  });

  it('T027(c) denies a Platform Owner session after the role is changed', async () => {
    const po = await createStaff('platform_owner', 's63-t027-po');
    const formerPo = await createStaff('platform_owner', 's63-t027-former-po');
    const workspace = await makeWorkspace(po, 'T027 stale PO workspace');
    const beforeRead = await formerPo.client
      .from('workspaces')
      .select('id')
      .eq('id', workspace.id);
    expect(beforeRead.error).toBeNull();
    expect(beforeRead.data).toHaveLength(1);

    checked(
      await po.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', formerPo.userId),
    );

    const afterRead = await formerPo.client
      .from('workspaces')
      .select('id')
      .eq('id', workspace.id);
    expect(afterRead.error).toBeNull();
    expect(afterRead.data).toEqual([]);
    expect(await remainsPlatformOwner(formerPo.userId)).toBe(false);
    const deniedRole = await formerPo.client
      .from('staff_profiles')
      .update({ role: 'workspace_owner' })
      .eq('user_id', po.userId)
      .select('user_id');
    expect(Boolean(deniedRole.error) || deniedRole.data?.length === 0).toBe(
      true,
    );
    expect(await roleOf(po.userId)).toBe('platform_owner');
  });
});

describe('T026 no automatic membership creation', () => {
  it('does not add membership rows when revoking an existing member', async () => {
    const po = await createStaff('platform_owner', 's63-t026a-po');
    const member = await createStaff('trainer', 's63-t026a-member');
    const workspace = await makeWorkspace(po, 'T026(a) workspace');
    const membership = await grantMembership(po, workspace.id, member.userId);
    const before = await membershipCounts(member.userId);
    expect(before.total).toBeGreaterThanOrEqual(1);

    checked(
      await po.client
        .from('workspace_memberships')
        .update({ revoked_at: new Date().toISOString(), revoked_by: po.userId })
        .eq('id', membership.id),
    );

    const after = await membershipCounts(member.userId);
    expect(after.total).toBe(before.total);
    expect(after.active).toBe(before.active - 1);
  });

  it('does not add rows during add-first transfer or its membership revocation', async () => {
    const formerPo = await createStaff('platform_owner', 's63-t026b-former-po');
    const replacement = await createStaff(null, 's63-t026b-replacement');
    const workspace = await makeWorkspace(formerPo, 'T026(b) workspace');
    const membership = await grantMembership(
      formerPo,
      workspace.id,
      formerPo.userId,
    );
    const replacementBefore = await membershipCounts(replacement.userId);

    checked(
      await formerPo.client.from('staff_profiles').insert({
        user_id: replacement.userId,
        role: 'platform_owner',
        display_name: testStaffDisplayName(),
      }),
    );
    checked(
      await formerPo.client
        .from('staff_profiles')
        .update({ role: 'trainer' })
        .eq('user_id', formerPo.userId),
    );
    expect(await membershipCounts(replacement.userId)).toEqual(
      replacementBefore,
    );

    const formerBeforeRevoke = await membershipCounts(formerPo.userId);
    checked(
      await replacement.client
        .from('workspace_memberships')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: replacement.userId,
        })
        .eq('id', membership.id),
    );
    const formerAfterRevoke = await membershipCounts(formerPo.userId);
    expect(formerAfterRevoke.total).toBe(formerBeforeRevoke.total);
    expect(formerAfterRevoke.active).toBe(formerBeforeRevoke.active - 1);
    expect(await membershipCounts(replacement.userId)).toEqual(
      replacementBefore,
    );
  });
});

async function protectedTableSnapshot() {
  const tables = await db`
    select schemaname, tablename
    from pg_catalog.pg_tables
    where schemaname in ('public', 'app_private', 'auth', 'storage')
      and not (schemaname = 'public' and tablename in ('workspace_memberships', 'audit_events', 'plan_audit_events'))
    order by schemaname, tablename
  `;
  const snapshot: Record<string, { count: number; fingerprint: string }> = {};
  for (const table of tables) {
    const [row] = await db`
      select count(*)::int as count,
        pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(t)::text, E'\n' order by pg_catalog.to_jsonb(t)::text), '')) as fingerprint
      from ${db(table.schemaname as string)}.${db(table.tablename as string)} as t
    `;
    snapshot[`${table.schemaname}.${table.tablename}`] = {
      count: Number(row?.count ?? 0),
      fingerprint: String(row?.fingerprint ?? ''),
    };
  }
  return snapshot;
}

async function appendOnlyAuditSnapshot(workspaceId: string, trainerId: string) {
  return {
    audit:
      await db`select id, pg_catalog.md5(pg_catalog.to_jsonb(e)::text) as fingerprint from public.audit_events e where workspace_id = ${workspaceId} or target_id = ${trainerId} order by id`,
    plans:
      await db`select id, pg_catalog.md5(pg_catalog.to_jsonb(e)::text) as fingerprint from public.plan_audit_events e where workspace_id = ${workspaceId} order by id`,
  };
}

const workoutContent = (notes: string) => ({
  schema_version: 1,
  days: [],
  notes,
});
const nutritionContent = (title: string) => ({
  schemaVersion: 1,
  structure: 'single_day',
  implicitDayTypeId: 'dt-1',
  dayTypes: [
    { id: 'dt-1', trainingDay: false, name: { ar: 'يوم', en: title } },
  ],
  meals: [],
});

describe('T017 departed-trainer departure RED characterization', () => {
  it('revokes all workspace access while preserving identities, attribution, audit, and protected rows (RED before T020/T018)', async () => {
    const context = await clientContext();
    const seeded = await db.begin((tx) => graph(tx, context));
    const trainer = await createStaff('trainer', 's63-t017-departed');
    const trainerMembership = await grantMembership(
      context.po,
      context.wsA.id,
      trainer.userId,
    );
    checked(
      await context.po.client.from('workspace_memberships').insert({
        workspace_id: context.wsB.id,
        user_id: trainer.userId,
        granted_by: context.po.userId,
      }),
    );

    const workoutDraft = checked(
      await trainer.client.rpc('create_plan_draft', {
        p_workspace_id: context.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'workout',
        p_content: workoutContent('T017 retained workout'),
        p_operation_key: randomUUID(),
      }),
    ) as string;
    await db.begin((tx) =>
      seedSubmittedIntake(tx, context.wsA.id, seeded.client),
    );
    checked(
      await trainer.client.rpc('save_plan_draft', {
        p_plan_id: workoutDraft,
        p_expected_draft_version: 1,
        p_content: workoutContent('T017 retained workout revision'),
        p_operation_key: randomUUID(),
      }),
    );
    checked(
      await trainer.client.rpc('ready_and_publish_plan', {
        p_plan_id: workoutDraft,
        p_expected_draft_version: 2,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      }),
    );
    const nutritionDraft = checked(
      await trainer.client.rpc('create_plan_draft', {
        p_workspace_id: context.wsA.id,
        p_client_id: seeded.client,
        p_plan_kind: 'nutrition',
        p_content: nutritionContent('T017 retained nutrition'),
        p_operation_key: randomUUID(),
      }),
    ) as string;
    checked(
      await trainer.client.rpc('publish_nutrition_revision', {
        p_plan_id: nutritionDraft,
        p_expected_draft_version: 1,
        p_expected_published_version: 0,
        p_operation_key: randomUUID(),
      }),
    );

    const protectedBefore = await protectedTableSnapshot();
    const auditBefore = await appendOnlyAuditSnapshot(
      context.wsA.id,
      trainer.userId,
    );
    const membershipsBefore =
      await db`select id, workspace_id, user_id, granted_at, granted_by, revoked_at, revoked_by from public.workspace_memberships where user_id = ${trainer.userId} order by id`;
    expect(membershipsBefore).toHaveLength(2);
    expect(
      membershipsBefore.every((row) => row.granted_by === context.po.userId),
    ).toBe(true);

    const departure = await context.po.client.rpc('f3_deactivate_trainer', {
      p_trainer_user_id: trainer.userId,
    });
    expect(departure.error).toBeNull();

    const afterMemberships =
      await db`select id, workspace_id, user_id, granted_at, granted_by, revoked_at, revoked_by from public.workspace_memberships where user_id = ${trainer.userId} order by id`;
    expect(afterMemberships).toHaveLength(2);
    expect(afterMemberships.map((row) => row.id)).toEqual(
      membershipsBefore.map((row) => row.id),
    );
    expect(
      afterMemberships.every(
        (row) =>
          row.revoked_at !== null && row.revoked_by === context.po.userId,
      ),
    ).toBe(true);
    expect(
      afterMemberships.map((row) => [row.granted_at, row.granted_by]),
    ).toEqual(membershipsBefore.map((row) => [row.granted_at, row.granted_by]));
    expect(await roleOf(trainer.userId)).toBe('trainer');
    const authUser = await admin().auth.admin.getUserById(trainer.userId);
    expect(authUser.error).toBeNull();
    expect(authUser.data.user?.id).toBe(trainer.userId);
    expect(
      checked(await trainer.client.from('workspaces').select('id')),
    ).toEqual([]);
    expect(await remainsPlatformOwner(trainer.userId)).toBe(false);
    expect(await protectedTableSnapshot()).toEqual(protectedBefore);
    const auditAfter = await appendOnlyAuditSnapshot(
      context.wsA.id,
      trainer.userId,
    );
    const afterAuditById = new Map(
      auditAfter.audit.map((row) => [row.id, row]),
    );
    expect(auditAfter.audit.length).toBeGreaterThanOrEqual(
      auditBefore.audit.length,
    );
    expect(
      auditBefore.audit.every(
        (row) => afterAuditById.get(row.id)?.fingerprint === row.fingerprint,
      ),
    ).toBe(true);
    expect(auditAfter.plans).toEqual(auditBefore.plans);
    expect(membershipsBefore.map((row) => row.id)).toContain(
      trainerMembership.id,
    );
  });
});
