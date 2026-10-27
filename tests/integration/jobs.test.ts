import { randomUUID } from 'node:crypto';
import type { JSONValue } from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import type { Job } from '../../workers/cron/src/drain';
import {
  admin,
  anonClient,
  checked,
  sql,
  twoWorkspaceFixture,
} from './harness';

const db = sql();
const service = admin();
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let kind: string;
beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
beforeEach(() => {
  kind = `test.${randomUUID()
    .replaceAll('-', '')
    .replace(/[0-9]/g, (n) => String.fromCharCode(97 + Number(n)))}`;
});
afterEach(async () => {
  // Only this test's synthetic jobs; immutable audit history remains in the disposable stack.
  await db`delete from public.jobs where kind = ${kind}`;
});
afterAll(async () => {
  await db.end();
});

async function enqueue(
  options: {
    key?: string;
    workspace?: string | null;
    payload?: Record<string, JSONValue>;
    runAt?: string;
    maxAttempts?: number;
    jobKind?: string;
  } = {},
  connection = db,
): Promise<string> {
  const [row] = await connection`select app_private.enqueue_job(
    ${options.jobKind ?? kind}, ${options.workspace ?? null}::uuid,
    ${connection.json(options.payload ?? {})}, ${options.key ?? randomUUID()},
    ${options.runAt ?? '2000-01-01T00:00:00Z'}::timestamptz, ${options.maxAttempts ?? 5}
  ) as id`;
  expect(row?.id).toBeTypeOf('string');
  return row!.id as string;
}

async function claim(leaseSeconds = 300): Promise<Job[]> {
  return checked(
    await service.rpc('jobs_claim', {
      batch: 100,
      lease_seconds: leaseSeconds,
    }),
  ) as Job[];
}

async function claimOwn(id: string, leaseSeconds = 300): Promise<Job> {
  // Foreign jobs may occupy a batch. Never complete/fail someone else's jobs.
  for (let i = 0; i < 100; i++) {
    const jobs = await claim(leaseSeconds);
    const own = jobs.find((j) => j.id === id);
    if (own) return own;
    if (jobs.length === 0) break;
  }
  throw new Error('Expected test job was not claimed');
}

async function readJob(id: string) {
  return checked(await service.from('jobs').select('*').eq('id', id).single());
}

describe('jobs outbox (T005)', () => {
  it('(a) enqueues idempotently, including ten separate concurrent connections', async () => {
    const key = randomUUID();
    const first = await enqueue({ key });
    expect(await enqueue({ key })).toBe(first);
    expect(
      await db`select id from public.jobs where idempotency_key = ${key}`,
    ).toHaveLength(1);
    const concurrentKey = randomUUID();
    const connections = Array.from({ length: 10 }, () => sql());
    try {
      const ids = await Promise.all(
        connections.map((connection) =>
          enqueue({ key: concurrentKey }, connection),
        ),
      );
      expect(new Set(ids).size).toBe(1);
      expect(
        await db`select id from public.jobs where idempotency_key = ${concurrentKey}`,
      ).toHaveLength(1);
    } finally {
      await Promise.all(connections.map((connection) => connection.end()));
    }
  });

  it('(b) two service-role clients claim disjoint sets covering twenty due jobs', async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, () => enqueue()));
    const clients = [admin(), admin()];
    const results = await Promise.all(
      clients.map((client) => client.rpc('jobs_claim', { batch: 10 })),
    );
    const sets = results.map((result) =>
      (checked(result) as Job[])
        .filter((j) => ids.includes(j.id))
        .map((j) => j.id),
    );
    const [left, right] = sets;
    expect(left!.filter((id) => right!.includes(id))).toEqual([]);
    expect(new Set(sets.flat()).size).toBe(20);
    expect([...sets.flat()].sort()).toEqual([...ids].sort());
    const rows =
      await db`select status, attempts, lease_token, lease_expires_at > now() as leased from public.jobs where kind = ${kind}`;
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'running',
        attempts: 1,
        leased: true,
      });
      expect(row.lease_token).not.toBeNull();
    }
  });

  it('(c) failure records a code and retries after one minute using database time', async () => {
    const id = await enqueue();
    const job = await claimOwn(id);
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: job.lease_token,
          error_code: 'temporary_error',
        }),
      ),
    ).toBe('pending');
    const [row] =
      await db`select *, extract(epoch from (run_at - now()))::float as delay, updated_at >= created_at as touched from public.jobs where id = ${id}`;
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error: 'temporary_error',
      lease_token: null,
      lease_expires_at: null,
      finished_at: null,
      touched: true,
    });
    expect(row?.delay).toBeGreaterThan(50);
    expect(row?.delay).toBeLessThanOrEqual(60);
    expect(
      await db`select id from public.audit_events where target_id = ${id}`,
    ).toHaveLength(0);
  });

  it('(d) dead-letters at max attempts exactly once, with scoped allow-listed audit details', async () => {
    const id = await enqueue({ workspace: f.wsA.id, maxAttempts: 2 });
    const first = await claimOwn(id);
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: first.lease_token,
          error_code: 'try_again',
        }),
      ),
    ).toBe('pending');
    await db`update public.jobs set run_at = now() - interval '1 second' where id = ${id}`;
    const second = await claimOwn(id);
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: second.lease_token,
          error_code: 'exhausted',
        }),
      ),
    ).toBe('dead');
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: second.lease_token,
          error_code: 'exhausted',
        }),
      ),
    ).toBeNull();
    expect(await readJob(id)).toMatchObject({
      status: 'dead',
      attempts: 2,
      last_error: 'exhausted',
      lease_token: null,
    });
    expect((await readJob(id)).finished_at).not.toBeNull();
    expect((await claim()).some((j) => j.id === id)).toBe(false);
    const events =
      await db`select * from public.audit_events where target_id = ${id}`;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'job.dead_lettered',
      actor_user_id: null,
      target_table: 'jobs',
      target_id: id,
      workspace_id: f.wsA.id,
      details: { kind, error: 'exhausted', attempts: 2 },
    });
  });

  it('(e,f) reclaims an expired lease, ignores stale reports, and completes the current lease', async () => {
    const id = await enqueue();
    const first = await claimOwn(id, 1);
    // Poll the database clock rather than assuming the host and database agree.
    await expect
      .poll(
        async () => {
          const [row] =
            await db`select lease_expires_at < now() as expired from public.jobs where id = ${id}`;
          return row?.expired;
        },
        { timeout: 5000, interval: 100 },
      )
      .toBe(true);
    const second = await claimOwn(id);
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(
      checked(
        await service.rpc('jobs_complete', { id, lease: first.lease_token }),
      ),
    ).toBe(false);
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: first.lease_token,
          error_code: 'stale',
          permanent: true,
        }),
      ),
    ).toBeNull();
    expect(await readJob(id)).toMatchObject({
      status: 'running',
      attempts: 2,
      lease_token: second.lease_token,
    });
    expect(
      checked(
        await service.rpc('jobs_complete', { id, lease: second.lease_token }),
      ),
    ).toBe(true);
    expect(
      checked(
        await service.rpc('jobs_complete', { id, lease: second.lease_token }),
      ),
    ).toBe(false);
    expect(await readJob(id)).toMatchObject({
      status: 'done',
      lease_token: null,
      lease_expires_at: null,
      workspace_id: null,
    });
    expect((await readJob(id)).finished_at).not.toBeNull();
    expect(
      await db`select id from public.audit_events where target_id = ${id}`,
    ).toHaveLength(0);
  });

  it('dead-letters an expired lease at max attempts exactly once instead of reclaiming it', async () => {
    const id = await enqueue({ workspace: f.wsA.id, maxAttempts: 1 });
    await claimOwn(id, 1);
    await expect
      .poll(
        async () => {
          const [row] =
            await db`select lease_expires_at < now() as expired from public.jobs where id = ${id}`;
          return row?.expired;
        },
        { timeout: 5000, interval: 100 },
      )
      .toBe(true);

    expect((await claim()).some((j) => j.id === id)).toBe(false);
    expect(await readJob(id)).toMatchObject({
      status: 'dead',
      attempts: 1,
      last_error: 'lease_expired',
      lease_token: null,
      lease_expires_at: null,
    });
    expect((await readJob(id)).finished_at).not.toBeNull();
    // Repeated drains must neither reclaim the job nor duplicate its audit event.
    expect((await claim()).some((j) => j.id === id)).toBe(false);
    const events =
      await db`select * from public.audit_events where target_id = ${id}`;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'job.dead_lettered',
      actor_user_id: null,
      target_table: 'jobs',
      target_id: id,
      workspace_id: f.wsA.id,
      details: { kind, error: 'lease_expired', attempts: 1 },
    });
  });

  it('(g) leaves future jobs pending', async () => {
    const id = await enqueue({ runAt: '2100-01-01T00:00:00Z' });
    expect((await claim()).some((j) => j.id === id)).toBe(false);
    expect(await readJob(id)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('(h) anon, PO and trainers cannot access either workspace jobs or execute RPCs', async () => {
    const ids = [
      await enqueue({ workspace: f.wsA.id }),
      await enqueue({ workspace: f.wsB.id }),
    ];
    for (const client of [anonClient(), f.po.client, f.trainerA.client]) {
      for (const id of ids) {
        const results = [
          await client.from('jobs').select('*').eq('id', id),
          await client
            .from('jobs')
            .insert({
              kind,
              workspace_id: f.wsB.id,
              idempotency_key: randomUUID(),
            })
            .select(),
          await client
            .from('jobs')
            .update({ status: 'done' })
            .eq('id', id)
            .select(),
        ];
        for (const result of results) {
          expect(result.data ?? []).toEqual([]);
          if (result.error) expect(result.error.code).toBe('42501');
        }
        for (const [name, args] of [
          ['jobs_claim', {}],
          ['jobs_complete', { id, lease: randomUUID() }],
          ['jobs_fail', { id, lease: randomUUID(), error_code: 'forged' }],
        ] as const) {
          expect((await client.rpc(name, args)).error?.code).toBe('42501');
        }
      }
    }
    for (const id of ids)
      expect(await readJob(id)).toMatchObject({
        status: 'pending',
        attempts: 0,
      });
    expect(
      await db`select id from public.jobs where kind = ${kind}`,
    ).toHaveLength(2);
  });

  it('(i) rejects oversized/non-object payloads, invalid kinds and invalid error codes', async () => {
    await expect(
      enqueue({ payload: { ids: 'x'.repeat(5000) } }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(enqueue({ jobKind: 'Invalid kind' })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      db`select app_private.enqueue_job(${kind}, null, ${db.json([1])}, ${randomUUID()})`,
    ).rejects.toMatchObject({ code: '23514' });
    const id = await enqueue();
    const job = await claimOwn(id);
    expect(
      (
        await service.rpc('jobs_fail', {
          id,
          lease: job.lease_token,
          error_code: 'private@example.test',
        })
      ).error?.code,
    ).toBe('23514');
    expect(await readJob(id)).toMatchObject({
      status: 'running',
      last_error: null,
    });
  });

  it('permanent failure dead-letters a platform job on its first attempt', async () => {
    const id = await enqueue();
    const job = await claimOwn(id);
    expect(
      checked(
        await service.rpc('jobs_fail', {
          id,
          lease: job.lease_token,
          error_code: 'unknown_kind',
          permanent: true,
        }),
      ),
    ).toBe('dead');
    const events =
      await db`select * from public.audit_events where target_id = ${id}`;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'job.dead_lettered',
      workspace_id: null,
      details: { kind, error: 'unknown_kind', attempts: 1 },
    });
  });
});
