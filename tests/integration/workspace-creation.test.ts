import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createWorkspace } from '../../lib/workspaces/create';
import {
  clientContext,
  createRecoveryClientTarget,
} from './client-accounts-fixture';
import { checked, admin, sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let client: Awaited<ReturnType<typeof createRecoveryClientTarget>>;

function actor(
  userId: string,
  role: 'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | null,
) {
  return { userId, role, activeWorkspaceIds: [] } as const;
}

beforeAll(async () => {
  fixture = await twoWorkspaceFixture();
  client = await createRecoveryClientTarget(await clientContext());
});

afterAll(async () => {
  await db.end();
});

it('T049 lets only the Platform Owner create a workspace and records one audit event', async () => {
  const id = randomUUID();
  const name = `S11-2 ${randomUUID()}`;
  const slug = `s11-2-${randomUUID()}`;
  const staffBefore = Number(
    (await db`select count(*)::int as n from public.staff_profiles`)[0]?.n ?? 0,
  );

  const created = await createWorkspace(
    fixture.po.client,
    actor(fixture.po.userId, 'platform_owner'),
    { id, name, slug },
  );
  expect(created.status).toBe('created');
  if (!('workspace' in created))
    throw new Error('Workspace creation returned no record');
  expect(created.workspace).toMatchObject({
    id,
    name,
    slug,
    created_by: fixture.po.userId,
  });

  const rejectedActors = [
    { ...fixture.woA, role: 'workspace_owner' as const },
    { ...fixture.trainerA, role: 'trainer' as const },
    { ...fixture.salesA, role: 'sales' as const },
    { userId: client.userId, client: client.client, role: null },
  ];
  for (const [index, user] of rejectedActors.entries()) {
    const attemptedId = randomUUID();
    expect(
      await createWorkspace(user.client, actor(user.userId, user.role), {
        id: attemptedId,
        name: `Rejected ${index}`,
        slug: `r-${randomUUID()}`,
      }),
    ).toEqual({ status: 'forbidden' });
    const result = await user.client.from('workspaces').insert({
      id: attemptedId,
      name: `Rejected ${index}`,
      slug: `r-${randomUUID()}`,
      created_by: user.userId,
    });
    expect(result.error?.code).toBe('42501');
    const rows = await admin()
      .from('workspaces')
      .select('id')
      .eq('id', attemptedId);
    expect(checked(rows)).toHaveLength(0);
  }

  const [workspace] =
    await db`select id,name,slug,created_by from public.workspaces where id=${id}`;
  expect(workspace).toMatchObject({
    id,
    name,
    slug,
    created_by: fixture.po.userId,
  });
  const [audit] =
    await db`select action,actor_user_id,target_table,target_id,workspace_id,details
    from public.audit_events where target_table='workspaces' and target_id=${id}`;
  expect(audit).toMatchObject({
    action: 'workspace.created',
    actor_user_id: fixture.po.userId,
    target_table: 'workspaces',
    target_id: id,
    workspace_id: id,
    details: {},
  });
  expect(
    await db`select id from public.audit_events where target_id=${id}`,
  ).toHaveLength(1);

  const [workspaceMemberships] =
    await db`select count(*)::int as n from public.workspace_memberships where workspace_id=${id}`;
  const [clients] =
    await db`select count(*)::int as n from public.clients where workspace_id=${id}`;
  const [packages] =
    await db`select count(*)::int as n from public.packages where workspace_id=${id}`;
  const [branding] =
    await db`select count(*)::int as n from app_private.branding_drafts where workspace_id=${id}`;
  const [staffAfter] =
    await db`select count(*)::int as n from public.staff_profiles`;
  expect([
    workspaceMemberships?.n,
    clients?.n,
    packages?.n,
    branding?.n,
  ]).toEqual([0, 0, 0, 0]);
  expect(Number(staffAfter?.n ?? 0)).toBe(staffBefore);

  const opened = await fixture.po.client
    .from('workspaces')
    .select('id')
    .eq('id', id)
    .single();
  expect(checked(opened)?.id).toBe(id);
  const [poMemberships] =
    await db`select count(*)::int as n from public.workspace_memberships
    where workspace_id=${id} and user_id=${fixture.po.userId}`;
  expect(poMemberships?.n).toBe(0);
});

it('T049 returns the original workspace on an identical lost-response retry and rejects changed input', async () => {
  const id = randomUUID();
  const input = {
    id,
    name: `Retry ${randomUUID()}`,
    slug: `retry-${randomUUID()}`,
  };
  const po = actor(fixture.po.userId, 'platform_owner');
  const first = await createWorkspace(fixture.po.client, po, input);
  expect(first.status).toBe('created');
  if (!('workspace' in first))
    throw new Error('Workspace creation returned no record');

  const retry = await createWorkspace(fixture.po.client, po, input);
  expect(retry).toMatchObject({ status: 'existing', workspace: input });

  const changedName = await createWorkspace(fixture.po.client, po, {
    ...input,
    name: `${input.name} changed`,
  });
  expect(changedName.status).toBe('error');
  const changedSlug = await createWorkspace(fixture.po.client, po, {
    ...input,
    slug: `${input.slug}-changed`,
  });
  expect(changedSlug.status).toBe('error');

  const [rows] =
    await db`select count(*)::int as n from public.workspaces where id=${id}`;
  expect(rows?.n).toBe(1);
  expect(
    await db`select id from public.audit_events where target_id=${id}`,
  ).toHaveLength(1);
});

it('T049 serializes in-flight retries with the same client key', async () => {
  const input = {
    id: randomUUID(),
    name: `Concurrent ${randomUUID()}`,
    slug: `concurrent-${randomUUID()}`,
  };
  const po = actor(fixture.po.userId, 'platform_owner');
  const [first, second] = await Promise.all([
    createWorkspace(fixture.po.client, po, input),
    createWorkspace(fixture.po.client, po, input),
  ]);
  expect([first.status, second.status].sort()).toEqual(['created', 'existing']);
  if (!('workspace' in first) || !('workspace' in second))
    throw new Error('Concurrent workspace retry returned no record');
  expect(first.workspace?.id).toBe(input.id);
  expect(second.workspace?.id).toBe(input.id);
  expect(
    await db`select id from public.workspaces where id=${input.id}`,
  ).toHaveLength(1);
  expect(
    await db`select id from public.audit_events where target_id=${input.id}`,
  ).toHaveLength(1);
});
