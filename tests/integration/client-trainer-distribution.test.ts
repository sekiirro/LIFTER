import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, createStaff, sql } from './harness';
import { clientContext, pending } from './client-accounts-fixture';
import { graph } from './registration-approval-fixture';
import { issue } from './registration-links-fixture';
import { drain, type Rpc } from '../../workers/cron/src/drain';
import { createHandlers } from '../../workers/cron/src/handlers';

const db = sql();
const service = admin();

async function approvedClient() {
  const context = await clientContext();
  const fact = await db.begin((tx) => graph(tx, context));
  return { context, clientId: fact.client, approvalId: fact.fact };
}

async function enqueue(
  clientId: string,
  approvalId: string,
  workspaceId: string,
) {
  const [row] =
    await db`select app_private.enqueue_client_trainer_distribution_job(
    ${workspaceId}::uuid, ${clientId}::uuid, ${approvalId}::uuid
  ) as id`;
  if (!row) throw new Error('distribution job enqueue failed');
  return row.id as string;
}

async function enqueueRaw(
  clientId: string,
  approvalId: string,
  workspaceId: string,
) {
  const [row] = await db`select app_private.enqueue_job(
    'client.distribution', ${workspaceId}::uuid,
    ${db.json({ client_id: clientId, approval_id: approvalId })},
    ${`test.client.distribution:${randomUUID()}`},
    '2000-01-01T00:00:00Z'::timestamptz, 5
  ) as id`;
  if (!row) throw new Error('synthetic distribution job enqueue failed');
  return row.id as string;
}

async function claim(jobId: string) {
  const { data, error } = await service.rpc('jobs_claim', {
    batch: 100,
    lease_seconds: 300,
  });
  if (error) throw new Error('job claim failed: ' + error.code);
  const job = (data as Array<{ id: string; lease_token: string }>).find(
    (candidate) => candidate.id === jobId,
  );
  if (!job) throw new Error('test distribution job not claimed');
  return job;
}

async function handle(job: { id: string; lease_token: string }) {
  return service.rpc('handle_client_trainer_distribution', {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
  });
}

async function outcome(jobId: string) {
  const [row] = await db`select outcome, completed_at, status, payload
    from public.jobs where id=${jobId}`;
  return row;
}

async function waitForDistributionLockWait() {
  const observer = sql();
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      const [row] = await observer`select count(*)::int as count
        from pg_stat_activity where wait_event_type='Lock'
          and query ilike '%handle_client_trainer_distribution%'`;
      if ((row?.count as number) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('distribution handler did not wait on the workspace lock');
  } finally {
    await observer.end();
  }
}

beforeAll(async () => {
  await db`select 1`;
});
afterAll(async () => {
  await db.end();
});

describe('F11 automatic responsible-Trainer distribution T058', () => {
  it('exposes a private writer and a service-role-only leased handler', async () => {
    const [privileges] = await db`select
      has_function_privilege('anon','app_private.write_client_trainer_distribution(uuid,uuid,uuid)','execute') as anon_writer,
      has_function_privilege('authenticated','app_private.write_client_trainer_distribution(uuid,uuid,uuid)','execute') as authenticated_writer,
      has_function_privilege('service_role','app_private.write_client_trainer_distribution(uuid,uuid,uuid)','execute') as service_writer,
      has_function_privilege('service_role','public.handle_client_trainer_distribution(uuid,uuid)','execute') as service_handler,
      has_function_privilege('authenticated','public.handle_client_trainer_distribution(uuid,uuid)','execute') as authenticated_handler,
      has_function_privilege('anon','public.handle_client_trainer_distribution(uuid,uuid)','execute') as anon_handler`;
    expect(privileges).toEqual({
      anon_writer: false,
      authenticated_writer: false,
      service_writer: false,
      service_handler: true,
      authenticated_handler: false,
      anon_handler: false,
    });

    const { context, clientId, approvalId } = await approvedClient();
    const jobId = await enqueue(clientId, approvalId, context.wsA.id);
    const claimed = await claim(jobId);
    const invalidLease = await handle({
      id: jobId,
      lease_token: randomUUID(),
    });
    expect(invalidLease.error).toBeNull();
    expect(invalidLease.data).toBe(false);
    const [untouched] =
      await db`select outcome, completed_at from public.jobs where id=${jobId}`;
    expect(untouched).toEqual({ outcome: null, completed_at: null });
    await service.rpc('jobs_fail', {
      id: jobId,
      lease: claimed.lease_token,
      error_code: 'synthetic_cleanup',
      permanent: true,
    });

    for (const role of ['anon', 'authenticated', 'service_role']) {
      await expect(
        db.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`select app_private.write_client_trainer_distribution(
            ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid
          )`;
        }),
      ).rejects.toThrow();
    }
  });

  it('refuses pre-approval assignment and no-ops a delayed unapproved job', async () => {
    const context = await clientContext();
    const client = await db.begin((tx) => pending(tx, context));
    const [attempt] = await db`select public.assign_client_responsible_trainer(
      ${context.wsA.id}, ${client.id}, ${context.trainerA.userId}
    ) as result`;
    expect(attempt?.result).toMatchObject({ status: 'not_permitted' });

    const jobId = await enqueueRaw(
      client.id as string,
      randomUUID(),
      context.wsA.id,
    );
    const claimed = await claim(jobId);
    const handled = await handle(claimed);
    expect(handled.error).toBeNull();
    expect(handled.data).toBe(true);
    const [before] =
      await db`select count(*)::int as count from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${client.id} and ended_at is null`;
    expect(before?.count).toBe(0);
    expect(await outcome(jobId)).toMatchObject({
      outcome: 'no_op_client_not_approved',
      status: 'running',
    });
    const [rows] =
      await db`select count(*)::int as count from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${client.id}`;
    expect(rows?.count).toBe(0);
    const complete = await service.rpc('jobs_complete', {
      id: jobId,
      lease: claimed.lease_token,
    });
    expect(complete.data).toBe(true);
  });

  it('deduplicates an approval job, assigns by balance, and preserves completion across a retry', async () => {
    const { context, clientId, approvalId } = await approvedClient();
    const trainerC = await createStaff('trainer', 'distribution-balance');
    checked(
      await context.po.client.from('workspace_memberships').insert({
        workspace_id: context.wsA.id,
        user_id: trainerC.userId,
        granted_by: context.po.userId,
      }),
    );
    const jobId = await enqueue(clientId, approvalId, context.wsA.id);
    expect(await enqueue(clientId, approvalId, context.wsA.id)).toBe(jobId);
    const claimed = await claim(jobId);
    const handled = await handle(claimed);
    expect(handled.error).toBeNull();
    expect(handled.data).toBe(true);
    expect(await outcome(jobId)).toMatchObject({
      outcome: 'assigned',
      status: 'running',
    });
    const [assignment] = await db`select trainer_user_id, assignment_source,
      source_approval_id, assigned_by, ended_at
      from public.client_trainer_assignments where workspace_id=${context.wsA.id}
        and client_id=${clientId} and ended_at is null`;
    const [tieBreak] =
      await db`select m.user_id from public.workspace_memberships m
      join public.staff_profiles p on p.user_id=m.user_id and p.role='trainer'::public.staff_role
      where m.workspace_id=${context.wsA.id} and m.revoked_at is null
      order by m.user_id limit 1`;
    expect(assignment).toMatchObject({
      assignment_source: 'system_distribution',
      source_approval_id: approvalId,
      assigned_by: null,
      ended_at: null,
      trainer_user_id: tieBreak?.user_id,
    });

    // Simulate a worker crash after the assignment transaction committed but
    // before jobs_complete. The expired lease is reclaimed with a new token.
    await db`update public.jobs set lease_expires_at=statement_timestamp()-interval '1 second'
      where id=${jobId}`;
    const retryClaim = await claim(jobId);
    const retry = await handle(retryClaim);
    expect(retry.error).toBeNull();
    expect(retry.data).toBe(true);
    const [rows] =
      await db`select count(*)::int as count from public.client_trainer_assignments
      where workspace_id=${context.wsA.id} and client_id=${clientId} and ended_at is null`;
    expect(rows?.count).toBe(1);
    await service.rpc('jobs_complete', {
      id: jobId,
      lease: retryClaim.lease_token,
    });

    const secondLink = checked(await issue(context)) as string;
    const secondClient = await db.begin((tx) =>
      graph(tx, context, { linkId: secondLink }),
    );
    const secondJob = await enqueue(
      secondClient.client,
      secondClient.fact,
      context.wsA.id,
    );
    const secondLease = await claim(secondJob);
    const secondResult = await handle(secondLease);
    expect(secondResult.error).toBeNull();
    expect(secondResult.data).toBe(true);
    const [secondAssignment] = await db`select trainer_user_id
      from public.client_trainer_assignments where workspace_id=${context.wsA.id}
        and client_id=${secondClient.client} and ended_at is null`;
    expect(secondAssignment?.trainer_user_id).not.toBe(
      assignment?.trainer_user_id,
    );
    await service.rpc('jobs_complete', {
      id: secondJob,
      lease: secondLease.lease_token,
    });
  });

  it('records terminal no-op outcomes for active automatic rows and manual overrides', async () => {
    for (const source of [
      'active_system',
      'active_manual',
      'ended_manual',
    ] as const) {
      const { context, clientId, approvalId } = await approvedClient();
      if (source === 'active_manual' || source === 'ended_manual') {
        const assigned = await context.po.client.rpc(
          'assign_client_responsible_trainer',
          {
            p_workspace_id: context.wsA.id,
            p_client_id: clientId,
            p_trainer_user_id: context.trainerA.userId,
          },
        );
        expect(assigned.data).toMatchObject({ status: 'ok' });
        if (source === 'ended_manual') {
          await db`update public.workspace_memberships
            set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
            where workspace_id=${context.wsA.id}
              and user_id=${context.trainerA.userId} and revoked_at is null`;
        }
      } else {
        const [membership] =
          await db`select id from public.workspace_memberships
          where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId}
            and revoked_at is null`;
        await db`insert into public.client_trainer_assignments(
          workspace_id, client_id, trainer_user_id, assignment_source,
          assigned_by, workspace_membership_id, source_approval_id
        ) values (
          ${context.wsA.id}, ${clientId}, ${context.trainerA.userId},
          'system_distribution', null, ${membership!.id}, ${approvalId}
        )`;
      }

      const jobId = await enqueue(clientId, approvalId, context.wsA.id);
      const lease = await claim(jobId);
      const result = await handle(lease);
      expect(result.error).toBeNull();
      expect(result.data).toBe(true);
      expect(await outcome(jobId)).toMatchObject({
        outcome:
          source === 'active_system'
            ? 'no_op_active_assignment_exists'
            : 'no_op_po_override_exists',
      });
      const [rows] =
        await db`select count(*)::int as count from public.client_trainer_assignments
        where workspace_id=${context.wsA.id} and client_id=${clientId} and ended_at is null`;
      expect(rows?.count).toBe(source === 'ended_manual' ? 0 : 1);
      await service.rpc('jobs_complete', {
        id: jobId,
        lease: lease.lease_token,
      });
    }
  });

  it('records no_eligible and drains a queued backlog', async () => {
    const { context, clientId, approvalId } = await approvedClient();
    await db`update public.workspace_memberships set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
      where workspace_id=${context.wsA.id} and user_id in (${context.trainerA.userId}, ${context.trainerB.userId})
        and revoked_at is null`;
    const first = await enqueue(clientId, approvalId, context.wsA.id);
    const secondLink = checked(await issue(context)) as string;
    const secondClient = await db.begin((tx) =>
      graph(tx, context, { linkId: secondLink }),
    );
    const second = await enqueue(
      secondClient.client,
      secondClient.fact,
      context.wsA.id,
    );
    const rpc = (async (name, args) => {
      if (name === 'jobs_claim') {
        const result = await service.rpc('jobs_claim', args);
        if (result.error) throw new Error('jobs_claim failed');
        return result.data;
      }
      if (name === 'handle_client_trainer_distribution') {
        const result = await service.rpc(
          'handle_client_trainer_distribution',
          args,
        );
        if (result.error) throw new Error('distribution handler failed');
        return result.data;
      }
      if (name === 'jobs_complete') {
        const result = await service.rpc('jobs_complete', args);
        if (result.error) throw new Error('jobs_complete failed');
        return result.data;
      }
      const result = await service.rpc('jobs_fail', args);
      if (result.error) throw new Error('jobs_fail failed');
      return result.data;
    }) as Rpc;
    await drain({ rpc, handlers: createHandlers(rpc), batch: 25 });
    expect(await outcome(first)).toMatchObject({ outcome: 'no_eligible' });
    expect(await outcome(second)).toMatchObject({ outcome: 'no_eligible' });
    const [backlog] = await db`select count(*)::int as count from public.jobs
      where id in (${first}, ${second}) and status='done' and completed_at is not null`;
    expect(backlog?.count).toBe(2);
  });

  it('serializes distribution behind the shared workspace lock', async () => {
    const { context, clientId, approvalId } = await approvedClient();
    const jobId = await enqueue(clientId, approvalId, context.wsA.id);
    const lease = await claim(jobId);
    let locked!: () => void;
    let release!: () => void;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    const continueHolder = new Promise<void>((resolve) => (release = resolve));
    const holder = db.begin(async (tx) => {
      await tx`select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          ${`f11.responsible_trainer.workspace:${context.wsA.id}`}, 0
        )
      )`;
      locked();
      await tx`update public.workspace_memberships
        set revoked_at=statement_timestamp(), revoked_by=${context.po.userId}
        where workspace_id=${context.wsA.id} and revoked_at is null
          and user_id in (${context.trainerA.userId}, ${context.trainerB.userId})`;
      await continueHolder;
    });
    await lockHeld;
    const handling = handle(lease);
    try {
      await waitForDistributionLockWait();
    } finally {
      release();
    }
    await holder;
    const handled = await handling;
    expect(handled.error).toBeNull();
    expect(handled.data).toBe(true);
    expect(await outcome(jobId)).toMatchObject({ outcome: 'no_eligible' });
    const [rows] = await db`select count(*)::int as count
      from public.client_trainer_assignments where client_id=${clientId} and ended_at is null`;
    expect(rows?.count).toBe(0);
    await service.rpc('jobs_complete', { id: jobId, lease: lease.lease_token });
  });
});
