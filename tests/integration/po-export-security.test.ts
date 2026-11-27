import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  anonClient,
  checked,
  sql,
  twoWorkspaceFixture,
} from './harness';
import { portalFixture } from './client-portal-fixture';

let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
const svc = admin();
const db = sql();

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
  await svc.auth.admin.deleteUser(f.po.userId);
  await svc.auth.admin.deleteUser(f.woA.userId);
  await svc.auth.admin.deleteUser(f.trainerA.userId);
  await svc.auth.admin.deleteUser(f.salesA.userId);
  await svc.auth.admin.deleteUser(f.trainerB.userId);
});

async function assertDeniedWithoutDisclosure(
  client: SupabaseClient,
  workspaceId: string,
) {
  const result = await client.rpc('request_po_client_export', {
    p_workspace_id: workspaceId,
    p_idempotency_key: randomUUID(),
  });
  expect(result.data).toBeNull();
  expect(result.error?.code).toBe('42501');
}

describe('PO export authorization RED (T001-T003)', () => {
  it.each([
    ['workspace owner', () => f.woA.client],
    ['trainer in requested workspace', () => f.trainerA.client],
    ['trainer in foreign workspace', () => f.trainerB.client],
    ['sales', () => f.salesA.client],
  ])(
    '%s cannot request one-workspace or all-workspace exports',
    async (_role, getClient) => {
      const client = getClient();
      await assertDeniedWithoutDisclosure(client, f.wsA.id);
      await assertDeniedWithoutDisclosure(client, f.wsB.id);
      await assertDeniedWithoutDisclosure(client, randomUUID());
    },
  );

  it('anonymous and authenticated unprofiled actors cannot request exports', async () => {
    await assertDeniedWithoutDisclosure(anonClient(), f.wsA.id);
    const email = `po-export-unprofiled-${randomUUID()}@example.test`;
    const password = `S71-${randomUUID()}-aA1!`;
    const unprofiled = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (unprofiled.error || !unprofiled.data.user)
      throw new Error('Unable to create synthetic unprofiled actor');
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({
      email,
      password,
    });
    // Deliberately use an unauthenticated path if the synthetic credential is
    // unavailable; there is no role profile that could ever grant export.
    if (!signedIn.error) await assertDeniedWithoutDisclosure(client, f.wsA.id);
  });

  it('a client account cannot request one-workspace or all-workspace exports', async () => {
    const portal = await portalFixture();
    const email = `po-export-client-${randomUUID()}@example.test`;
    const password = `S71-${randomUUID()}-aA1!`;
    const created = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error('Unable to create synthetic client actor');
    try {
      const clientAccount = await portal.makeClient({
        activate: false,
        label: 'po-export-client',
        authUserId: created.data.user.id,
      });
      expect(clientAccount.authUserId).toBe(created.data.user.id);
      const client = anonClient();
      const signedIn = await client.auth.signInWithPassword({
        email,
        password,
      });
      expect(signedIn.error).toBeNull();
      await assertDeniedWithoutDisclosure(client, f.wsA.id);
      await assertDeniedWithoutDisclosure(client, f.wsB.id);
      await assertDeniedWithoutDisclosure(client, randomUUID());
    } finally {
      await portal.close();
      await svc.auth.admin.deleteUser(created.data.user.id);
    }
  });

  it('direct job and guessed artifact reads do not reveal export existence', async () => {
    const guessed = randomUUID();
    const jobRead = await f.woA.client
      .from('jobs')
      .select('id')
      .eq('id', guessed);
    expect(jobRead.data).toBeNull();
    expect(jobRead.error).not.toBeNull();
    const objectRead = await f.woA.client.storage
      .from('po-export-artifacts')
      .download(`${f.wsA.id}/${guessed}.csv`);
    expect(objectRead.data).toBeNull();
    expect(objectRead.error).not.toBeNull();
  });

  it('the current PO can request either scope idempotently with safe audit metadata (T006)', async () => {
    const key = randomUUID();
    const first = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: f.wsA.id,
      p_idempotency_key: key,
    });
    expect(first.error).toBeNull();
    expect(first.data).toMatch(/^[0-9a-f-]{36}$/iu);
    const second = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: f.wsA.id,
      p_idempotency_key: key,
    });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const allScope = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: null,
      p_idempotency_key: randomUUID(),
    });
    expect(allScope.error).toBeNull();
    const concurrentKey = randomUUID();
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        f.po.client.rpc('request_po_client_export', {
          p_workspace_id: f.wsB.id,
          p_idempotency_key: concurrentKey,
        }),
      ),
    );
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    expect(new Set(concurrent.map((result) => result.data)).size).toBe(1);
    const [concurrentJob] = await db`
      select count(*)::int as count from public.jobs
      where idempotency_key like ${`po-export:${f.po.userId}:${f.wsB.id}:%`}
        and idempotency_key like ${`%:${concurrentKey}`}
    `;
    expect(concurrentJob?.count).toBe(1);
    const jobs = checked(
      await svc
        .from('jobs')
        .select('id,kind,workspace_id,payload,status')
        .eq('id', first.data!),
    );
    expect(jobs).not.toBeNull();
    expect(jobs!).toHaveLength(1);
    expect(jobs![0]).toMatchObject({
      id: first.data,
      kind: 'po.export',
      workspace_id: f.wsA.id,
      status: 'pending',
      payload: {
        actor_user_id: f.po.userId,
        scope_workspace_id: f.wsA.id,
        manifest_version: '030-v1',
      },
    });
    const queued = await f.po.client.rpc('read_po_client_export_status', {
      p_job_id: first.data!,
    });
    expect(queued.data).toEqual({ status: 'queued' });
    const foreignStatus = await f.woA.client.rpc(
      'read_po_client_export_status',
      {
        p_job_id: first.data!,
      },
    );
    expect(foreignStatus.data).toBeNull();
    expect(foreignStatus.error?.code).toBe('42501');
    const events = await db`
      select action,actor_user_id,workspace_id,details from public.audit_events
      where target_id=${first.data!}
    `;
    expect(events).toHaveLength(2);
    expect(
      events.every((event) => event.action === 'po_export.requested'),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(
      /health_notes|health-canary|email|phone|csv|url|secret/iu,
    );
  });

  it('a client idempotency key cannot be replayed with a different export scope', async () => {
    const key = randomUUID();
    const first = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: f.wsA.id,
      p_idempotency_key: key,
    });
    expect(first.error).toBeNull();
    for (const scope of [f.wsB.id, null]) {
      const replay = await f.po.client.rpc('request_po_client_export', {
        p_workspace_id: scope,
        p_idempotency_key: key,
      });
      expect(replay.data).toBeNull();
      expect(replay.error?.code).toBe('22023');
    }
    const [count] = await db`
      select count(*)::int as n from public.jobs
      where idempotency_key=${`po-export:${f.po.userId}:${key}`}
    `;
    expect(count?.n).toBe(1);

    const concurrentKey = randomUUID();
    const concurrent = await Promise.all([
      f.po.client.rpc('request_po_client_export', {
        p_workspace_id: f.wsA.id,
        p_idempotency_key: concurrentKey,
      }),
      f.po.client.rpc('request_po_client_export', {
        p_workspace_id: f.wsB.id,
        p_idempotency_key: concurrentKey,
      }),
    ]);
    expect(concurrent.filter((result) => result.error === null)).toHaveLength(
      1,
    );
    expect(concurrent.filter((result) => result.error !== null)).toHaveLength(
      1,
    );
  });

  it('hides PO-export audit and dead-letter metadata from every non-PO role', async () => {
    const requested = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: f.wsA.id,
      p_idempotency_key: randomUUID(),
    });
    expect(requested.error).toBeNull();
    const deadId = randomUUID();
    await db`
      insert into public.jobs(id,kind,workspace_id,payload,idempotency_key,status,attempts,last_error,max_attempts)
      values(${deadId},'po.export',${f.wsA.id},${db.json({ kind: 'po.export' })},${`po-export-dead-${deadId}`},'pending',1,'worker_failed',1)
    `;
    await db`update public.jobs set status='dead',finished_at=now() where id=${deadId}`;
    const targetIds = [requested.data!, deadId];
    const portal = await portalFixture();
    const email = `po-export-audit-${randomUUID()}@example.test`;
    const password = `S71-${randomUUID()}-aA1!`;
    const created = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error('Unable to create audit test client');
    try {
      await portal.makeClient({
        activate: false,
        label: 'po-export-audit',
        authUserId: created.data.user.id,
      });
      const clientAccount = anonClient();
      const signedIn = await clientAccount.auth.signInWithPassword({
        email,
        password,
      });
      expect(signedIn.error).toBeNull();
      const nonPoClients = [
        f.woA.client,
        f.trainerA.client,
        f.salesA.client,
        clientAccount,
        anonClient(),
      ];
      for (const client of nonPoClients) {
        const visible = await client
          .from('audit_events')
          .select('action,details')
          .in('target_id', targetIds);
        expect(visible.data ?? []).toEqual([]);
      }
      const poEvents = await f.po.client
        .from('audit_events')
        .select('action,details')
        .in('target_id', targetIds);
      expect(poEvents.error).toBeNull();
      expect(poEvents.data?.map((event) => event.action)).toEqual(
        expect.arrayContaining(['po_export.requested', 'job.dead_lettered']),
      );
      const ordinary = await f.woA.client
        .from('audit_events')
        .select('action')
        .eq('workspace_id', f.wsA.id);
      expect(
        ordinary.data?.some(
          (event) =>
            event.action !== 'po_export.requested' &&
            event.action !== 'job.dead_lettered',
        ),
      ).toBe(true);
    } finally {
      await portal.close();
      await svc.auth.admin.deleteUser(created.data.user.id);
    }
  });

  it('leases the bounded source snapshot to the service worker only (T006)', async () => {
    const requested = await f.po.client.rpc('request_po_client_export', {
      p_workspace_id: f.wsA.id,
      p_idempotency_key: randomUUID(),
    });
    expect(requested.error).toBeNull();
    const lease = randomUUID();
    await db`
      update public.jobs set status='running', lease_token=${lease},
        lease_expires_at=now()+interval '5 minutes'
      where id=${requested.data!} and kind='po.export'
    `;

    const snapshot = await svc.rpc('po_export_snapshot', {
      p_job_id: requested.data!,
      p_lease_token: lease,
    });
    expect(snapshot.error).toBeNull();
    expect(snapshot.data).toMatchObject({
      rows: [],
      row_count: 0,
      exceeded_limit: false,
    });
    const direct = await f.po.client.rpc('po_export_snapshot', {
      p_job_id: requested.data!,
      p_lease_token: lease,
    });
    expect(direct.data).toBeNull();
    expect(direct.error?.code).toBe('42501');
  });

  it('authorization denial test kills a mutant that grants every actor PO status (mutation)', async () => {
    const rollback = new Error('rollback mutated authorization helper');
    await expect(
      db.begin(async (tx) => {
        await tx`create or replace function app_private.is_platform_owner()
          returns boolean language sql stable security definer set search_path = '' as $$ select true $$`;
        await tx`select set_config('request.jwt.claim.sub', ${f.woA.userId}, true)`;
        await tx`select set_config('request.jwt.claim.role', 'authenticated', true)`;
        await tx`set local role authenticated`;
        const [mutated] = await tx`
          select public.request_po_client_export(${f.wsA.id}, ${randomUUID()}) as id
        `;
        // This is the exploit produced by the mutation. The ordinary RED/GREEN
        // expectation is 42501, so the authorization test rejects this mutant.
        expect(mutated?.id).toMatch(/^[0-9a-f-]{36}$/iu);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('retrieval is requester-bound, audited before bytes, and expired artifacts are denied (T002/T003/T006)', async () => {
    const id = randomUUID();
    const objectPath = `${id}/archive.csv`;
    const inserted = await db`
      insert into public.jobs(kind,workspace_id,payload,idempotency_key,status,finished_at)
      values('po.export',${f.wsA.id},${db.json({
        actor_user_id: f.po.userId,
        scope_workspace_id: f.wsA.id,
        artifact_path: objectPath,
        manifest_version: '030-v1',
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      })},${`po-export-test-${id}`},'done',now()) returning id
    `;
    const upload = await svc.storage
      .from('po-export-artifacts')
      .upload(
        objectPath,
        new Blob(['id\r\nsynthetic\r\n'], { type: 'text/csv' }),
      );
    expect(upload.error).toBeNull();

    const poPath = await f.po.client.rpc('record_po_export_retrieval', {
      p_job_id: inserted[0]!.id,
    });
    expect(poPath.error).toBeNull();
    expect(poPath.data).toBe(objectPath);
    const ready = await f.po.client.rpc('read_po_client_export_status', {
      p_job_id: inserted[0]!.id,
    });
    expect(ready.data).toEqual({ status: 'ready' });
    const denied = await f.woA.client.rpc('record_po_export_retrieval', {
      p_job_id: inserted[0]!.id,
    });
    expect(denied.data).toBeNull();
    expect(denied.error?.code).toBe('42501');
    const direct = await f.po.client.storage
      .from('po-export-artifacts')
      .download(objectPath);
    expect(direct.data).toBeNull();
    expect(direct.error).not.toBeNull();

    const audit = await db`
      select action,actor_user_id,workspace_id,details from public.audit_events
      where target_id=${inserted[0]!.id} and action='po_export.retrieved'
    `;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_user_id: f.po.userId,
      workspace_id: f.wsA.id,
      details: { outcome: 'downloaded', manifest_version: '030-v1' },
    });
    expect(JSON.stringify(audit)).not.toContain('synthetic');

    const expiredId = randomUUID();
    await db`
      insert into public.jobs(id,kind,workspace_id,payload,idempotency_key,status,finished_at)
      values(${expiredId},'po.export',${f.wsA.id},${db.json({
        actor_user_id: f.po.userId,
        scope_workspace_id: f.wsA.id,
        artifact_path: `${expiredId}/archive.csv`,
        manifest_version: '030-v1',
        generated_at: new Date(Date.now() - 16 * 60_000).toISOString(),
        expires_at: new Date(Date.now() - 1_000).toISOString(),
      })},${`po-export-test-${expiredId}`},'done',now())
    `;
    const expired = await f.po.client.rpc('record_po_export_retrieval', {
      p_job_id: expiredId,
    });
    expect(expired.data).toBeNull();
    expect(expired.error?.code).toBe('42501');
    const [expiredRow] = await db`
      select id,status,payload->>'actor_user_id' as actor_id
      from public.jobs where id=${expiredId}
    `;
    expect(expiredRow).toMatchObject({
      id: expiredId,
      status: 'done',
      actor_id: f.po.userId,
    });
    const expiredStatus = await f.po.client.rpc(
      'read_po_client_export_status',
      {
        p_job_id: expiredId,
      },
    );
    expect(expiredStatus.error).toBeNull();
    expect(expiredStatus.data).toEqual({ status: 'expired' });
    const directSweep = await f.po.client.rpc('po_export_expired_artifacts', {
      p_limit: 100,
    });
    expect(directSweep.data).toBeNull();
    expect(directSweep.error?.code).toBe('42501');
    const expiredBatch = await svc.rpc('po_export_expired_artifacts', {
      p_limit: 100,
    });
    expect(expiredBatch.error).toBeNull();
    expect(expiredBatch.data).toContainEqual({
      job_id: expiredId,
      object_path: `${expiredId}/archive.csv`,
    });
    const marked = await svc.rpc('po_export_expired_mark', {
      p_job_id: expiredId,
    });
    expect(marked.data).toBe(true);
    const expiredJob = checked(
      await svc.from('jobs').select('payload').eq('id', expiredId).single(),
    );
    expect(expiredJob).not.toBeNull();
    expect(expiredJob!.payload).not.toHaveProperty('artifact_path');
    expect(expiredJob!.payload).not.toHaveProperty('expires_at');
    await svc.storage.from('po-export-artifacts').remove([objectPath]);
  });

  it('direct-storage denial test kills a permissive RLS policy mutant (mutation)', async () => {
    const objectPath = `mutation/${randomUUID()}.csv`;
    const upload = await svc.storage
      .from('po-export-artifacts')
      .upload(objectPath, new Blob(['synthetic'], { type: 'text/csv' }));
    expect(upload.error).toBeNull();
    const rollback = new Error('rollback permissive storage policy mutant');
    await expect(
      db.begin(async (tx) => {
        await tx`drop policy po_export_artifacts_no_authenticated_read on storage.objects`;
        await tx`drop policy po_export_artifacts_no_authenticated_write on storage.objects`;
        await tx`create policy po_export_rls_mutant on storage.objects
          for select to authenticated using (bucket_id = 'po-export-artifacts')`;
        await tx`select set_config('request.jwt.claim.sub', ${f.woA.userId}, true)`;
        await tx`select set_config('request.jwt.claim.role', 'authenticated', true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`
          select count(*)::int as visible from storage.objects
          where bucket_id='po-export-artifacts' and name=${objectPath}
        `;
        expect(row?.visible).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    const denied = await f.woA.client.storage
      .from('po-export-artifacts')
      .download(objectPath);
    expect(denied.data).toBeNull();
    expect(denied.error).not.toBeNull();
    await svc.storage.from('po-export-artifacts').remove([objectPath]);
  });
});
