import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient } from './harness';
import {
  clientRead,
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T004 + T032 (FR-010, FR-011; SC-008): foreign-workspace negatives for
// the portal and directory boundaries, plus the definer/ACL contract.
let p: PortalFixture;
let client: PortalClient;
let planId: string;

beforeAll(async () => {
  p = await portalFixture();
  client = await p.makeClient({ activate: true, label: 'isolation' });
  planId = await p.createDraft(client.clientId, 'workout', 'F22 isolation');
  await p.publish(planId, 1, 0);
});
afterAll(async () => p?.close());

const directoryArgs = (workspaceId: string, search: string | null = null) => ({
  p_workspace_id: workspaceId,
  p_search: search,
  p_approval_state: null,
  p_subscription_status: null,
  p_limit: 50,
  p_offset: 0,
});

describe('F22 directory workspace isolation (T004/T032)', () => {
  it('denies a foreign-workspace trainer with the same error as a nonexistent workspace', async () => {
    const foreign = await p.fixture.trainerB.client.rpc(
      'staff_client_directory',
      directoryArgs(p.fixture.wsA.id),
    );
    const missing = await p.fixture.trainerB.client.rpc(
      'staff_client_directory',
      directoryArgs(randomUUID()),
    );
    expect(foreign.data).toBeNull();
    expect(foreign.error?.code).toBe('42501');
    expect(missing.error?.code).toBe('42501');
    expect(foreign.error?.message).toBe(missing.error?.message);
  });

  it('never returns workspace A clients from workspace B searches', async () => {
    const result = await p.fixture.trainerB.client.rpc(
      'staff_client_directory',
      directoryArgs(p.fixture.wsB.id, client.email),
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ status: 'ok', clients: [], has_more: false });
  });

  it('denies roles without coaching_work, clients and anonymous callers', async () => {
    const sales = await p.fixture.salesA.client.rpc(
      'staff_client_directory',
      directoryArgs(p.fixture.wsA.id),
    );
    expect(sales.error?.code).toBe('42501');
    const anon = await anonClient().rpc(
      'staff_client_directory',
      directoryArgs(p.fixture.wsA.id),
    );
    expect(anon.data ?? null).toBeNull();
    expect(anon.error).not.toBeNull();
    await expect(
      p.db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.authUserId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        await tx`select public.staff_client_directory(${p.fixture.wsA.id}::uuid,null,null,null,50,0)`;
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('allows workspace staff with coaching_work and the verified Platform Owner', async () => {
    for (const staff of [p.fixture.trainerA, p.fixture.woA, p.fixture.po]) {
      const result = await staff.client.rpc(
        'staff_client_directory',
        directoryArgs(p.fixture.wsA.id, client.email),
      );
      expect(result.error).toBeNull();
      expect(
        (result.data as { clients: Array<{ client_id: string }> }).clients.map(
          (r) => r.client_id,
        ),
      ).toEqual([client.clientId]);
    }
  });
});

describe('F22 portal identity isolation (T004)', () => {
  it('derives the client only from the signed identity', async () => {
    const own = await clientRead(p.db, client.authUserId, {
      planId,
      revision: null,
    });
    expect(own.status).toBe('ok');
    const stranger = await clientRead(p.db, randomUUID(), {
      planId,
      revision: null,
    });
    expect(stranger).toEqual({ status: 'invalid' });
    const strangerOverview = await clientRead(p.db, randomUUID(), 'overview');
    expect(strangerOverview).toEqual({ status: 'invalid' });
  });

  it('leaves F19 base tables closed to the client identity', async () => {
    const rows = await p.db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: client.authUserId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      return tx`select
        (select count(*)::int from public.plan_deliveries) as deliveries,
        (select count(*)::int from public.plan_revisions) as revisions,
        (select count(*)::int from public.plan_roots) as roots`;
    });
    expect(rows[0]).toEqual({ deliveries: 0, revisions: 0, roots: 0 });
  });
});

describe('F22 definer and ACL contract (T004)', () => {
  const publicFunctions = [
    'public.client_portal_overview()',
    'public.client_portal_plan(uuid,integer)',
    'public.staff_client_directory(uuid,text,text,text,integer,integer)',
  ];
  const privateFunctions = [
    'app_private.f22_portal_client()',
    'app_private.f22_subscription_summary(uuid,uuid)',
    'app_private.f22_delivered_revisions(uuid,uuid,uuid,uuid)',
  ];

  it('owns every function by postgres with an empty search path and definer rights', async () => {
    for (const signature of [...publicFunctions, ...privateFunctions]) {
      const [row] =
        await p.db`select pg_get_userbyid(proowner) as owner, prosecdef, proconfig
        from pg_proc where oid=${signature}::regprocedure`;
      expect(row!.owner, signature).toBe('postgres');
      expect(row!.prosecdef, signature).toBe(true);
      expect(row!.proconfig, signature).toContain('search_path=""');
    }
  });

  it('grants EXECUTE only to authenticated on the public entry points', async () => {
    for (const signature of [...publicFunctions, ...privateFunctions])
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const [row] =
          await p.db`select has_function_privilege(${role},${signature},'EXECUTE') as allowed`;
        expect(row!.allowed, `${role} ${signature}`).toBe(
          role === 'authenticated' && signature.startsWith('public.'),
        );
      }
  });
});
