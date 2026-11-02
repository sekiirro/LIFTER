import { createHash, randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { identity, probe, sql } from './client-accounts-fixture';

// F11 schedule contract replayed only on isolated Stack C for this lane.
const db = sql();
const jobName = 'lifter-f11-purge-signup';
const command = 'select app_private.purge_f11_retained_data();';
const helpers = [
  'purge_schedule_activate',
  'purge_schedule_deactivate',
  'purge_f11_retained_data',
];
afterAll(() => db.end());

it('installs pg_cron in pg_catalog and leaves ZERO F11 jobs after migration', async () => {
  expect(
    await db`select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_cron'`,
  ).toEqual([{ nspname: 'pg_catalog' }]);
  // Includes inactive placeholders, alternate F11 names, and unnamed purge jobs.
  expect(
    await db`select jobid from cron.job where jobname like 'lifter-f11-%' or command ilike '%purge_f11_retained_data%'`,
  ).toHaveLength(0);
});

it('activates exactly one owner job, replaces it idempotently and deactivates twice, all rolled back', async () => {
  await probe(async (tx) => {
    const unrelated =
      await tx`select jobid,schedule,command,username,active from cron.job order by jobid`;
    await tx`select app_private.purge_schedule_deactivate()`;
    await tx`select app_private.purge_schedule_deactivate()`;
    let previousId: unknown;
    for (let i = 0; i < 2; i++) {
      await tx`select app_private.purge_schedule_activate()`;
      const jobs =
        await tx`select jobid,jobname,schedule,command,username,active,database from cron.job where jobname like 'lifter-f11-%' or command ilike '%purge_f11_retained_data%'`;
      expect(jobs).toHaveLength(1);
      const [database] = await tx`select current_database() as name`;
      expect(jobs[0]).toMatchObject({
        jobname: jobName,
        schedule: '0 * * * *',
        command,
        username: 'postgres',
        active: true,
        database: database!.name,
      });
      if (i > 0) expect(jobs[0]!.jobid).not.toEqual(previousId);
      previousId = jobs[0]!.jobid;
    }
    await tx`select app_private.purge_schedule_deactivate()`;
    await tx`select app_private.purge_schedule_deactivate()`;
    expect(
      await tx`select jobid,schedule,command,username,active from cron.job order by jobid`,
    ).toEqual(unrelated);
    // Leave a job visible inside the transaction to prove rollback removes it.
    await tx`select app_private.purge_schedule_activate()`;
  });
  expect(
    await db`select 1 from cron.job where jobname=${jobName}`,
  ).toHaveLength(0);
});

it('keeps activation helpers private, postgres-owned invokers with empty search_path', async () => {
  for (const name of helpers) {
    const signature = `app_private.${name}()`;
    const [fn] =
      await db`select oid,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=to_regprocedure(${signature})`;
    expect(fn).toMatchObject({ owner: 'postgres', prosecdef: false });
    expect(fn!.proconfig).toEqual(['search_path=""']);
    expect(
      await db`select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=${fn!.oid}::oid and a.grantee<>p.proowner and a.privilege_type='EXECUTE'`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${name}`,
    ).toHaveLength(0);
  }
});

for (const role of ['anon', 'authenticated', 'service_role']) {
  it(`${role} cannot execute either helper or read cron.job even when an owner job exists`, async () => {
    await probe(async (tx) => {
      await tx`select app_private.purge_schedule_activate()`;
      for (const name of helpers) {
        const [grant] =
          await tx`select has_function_privilege(${role},${`app_private.${name}()`},'EXECUTE') as allowed`;
        expect(grant!.allowed).toBe(false);
        await expect(
          tx.savepoint(async (inner) => {
            await inner.unsafe(`set local role ${role}`);
            await inner.unsafe(`select app_private.${name}()`);
          }),
        ).rejects.toMatchObject({ code: '42501' });
      }
      const [grant] =
        await tx`select has_schema_privilege(${role},'cron','USAGE') as allowed`;
      // Supabase owns cron.job as supabase_admin and grants PUBLIC SELECT.
      // Postgres cannot revoke that owner's grant. Deny schema USAGE and
      // prove the real SELECT below fails, even with an existing owner job.
      expect(grant!.allowed).toBe(false);
      await expect(
        tx.savepoint(async (inner) => {
          await inner.unsafe(`set local role ${role}`);
          await inner`select * from cron.job`;
        }),
      ).rejects.toMatchObject({ code: '42501' });
      // Even an accidental future EXECUTE grant cannot change the caller role.
      for (const name of helpers) {
        await expect(
          tx.savepoint(async (inner) => {
            await inner.unsafe(`grant usage on schema app_private to ${role}`);
            await inner.unsafe(
              `grant execute on function app_private.${name}() to ${role}`,
            );
            await inner.unsafe(`set local role ${role}`);
            await inner.unsafe(`select app_private.${name}()`);
          }),
        ).rejects.toMatchObject({
          code: '42501',
          message: 'purge_schedule_owner_required',
        });
      }
    });
  });
}

it('F11 retention wrapper runs both purges and is restricted to postgres', async () => {
  const [fn] =
    await db`select prosrc, prosecdef, proconfig, pg_get_userbyid(proowner) as owner
    from pg_proc where oid=to_regprocedure('app_private.purge_f11_retained_data()')`;
  expect(fn).toMatchObject({ owner: 'postgres', prosecdef: false });
  expect(fn!.proconfig).toEqual(['search_path=""']);
  expect(fn!.prosrc).toContain(
    'perform app_private.purge_client_signup_attempts()',
  );
  expect(fn!.prosrc).toContain('perform app_private.purge_operation_keys()');
  await probe(async (tx) => {
    const actor = await identity(tx);
    const [attempt] =
      await tx`insert into app_private.client_signup_attempts(outcome_class, created_at)
      values ('failure', clock_timestamp() - interval '31 days') returning id`;
    const key = randomUUID();
    await tx`insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash, result, created_at)
      values (${actor.id}, 'catalog.food_created', ${key}, ${`sha256:${'c'.repeat(64)}`}, '{}'::jsonb,
        clock_timestamp() - interval '31 days')`;
    await tx`select app_private.purge_f11_retained_data()`;
    expect(
      await tx`select 1 from app_private.client_signup_attempts where id=${attempt!.id}`,
    ).toHaveLength(0);
    expect(
      await tx`select 1 from app_private.operation_keys where actor_user_id=${actor.id} and operation_key=${key}`,
    ).toHaveLength(0);
  });
});
it('preserves installed cleanup/policy bodies byte-for-byte except newline conventions', async () => {
  // Pinned from ac50a64, not recomputed from possibly mutated migration files.
  const bodies: Record<string, string> = {
    'app_private.signup_retention_policy()':
      '34eb2f5df81c46b21a403ebb353c50884f152c6dd7302f6b4a801582657e8068',
    'app_private.signup_attempt_purge_proof()':
      'ba16af87b4c5ecfb23c7096610098fe36ab5ef8d1513bf35335316785f353634',
    'app_private.signup_guard_attempt_delete()':
      '1363d209592104a6e5e4241a3cdbb7e2dd59923fdd4a862fec9f42a50071dbd7',
    'app_private.purge_client_signup_attempts()':
      '6fffae6587b4fa379cec25c0be8e2f7d8ac0aaf67c7002e806f07bcdc0be4447',
    'public.client_signup_admit(text,text,bytea,bytea,timestamptz,uuid,bytea)':
      '3f0435c5dc551db5520219015056aa1e7b27179cc546b14ceeeebcb9225182e0',
  };
  for (const [signature, hash] of Object.entries(bodies)) {
    const [fn] =
      await db`select prosrc,prosecdef,proconfig,pg_get_userbyid(proowner) as owner from pg_proc where oid=to_regprocedure(${signature})`;
    expect(fn).toMatchObject({ owner: 'postgres', prosecdef: true });
    expect(fn!.proconfig).toContain('search_path=""');
    expect(
      createHash('sha256')
        .update((fn!.prosrc as string).replace(/\r\n/g, '\n').trim())
        .digest('hex'),
      signature,
    ).toBe(hash);
  }
});
