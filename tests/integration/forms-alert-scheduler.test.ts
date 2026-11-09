import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { sql } from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback F15 scheduler privilege fixture');

it('uses the inert owner-only F11 cron pattern with restricted grants and advisory locks', async () => {
  const [rows, grants, active] = await Promise.all([
    db`
      select p.proname,p.prosecdef,p.proconfig,pg_catalog.pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_exec,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_exec
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='app_private' and p.proname in
        ('f15_alert_schedule_activate','f15_alert_schedule_deactivate','f15_alert_schedule_run')
      order by p.proname
    `,
    db`select has_schema_privilege('anon','cron','USAGE') as anon_usage,
        has_schema_privilege('authenticated','cron','USAGE') as authenticated_usage,
        has_schema_privilege('service_role','cron','USAGE') as service_usage`,
    db`select count(*)::int as jobs from cron.job where jobname='lifter-f15-alerts'`,
  ]);
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.owner).toBe('postgres');
    expect(row.prosecdef).toBe(false);
    expect(row.proconfig).toContain('search_path=""');
    expect(row.anon_exec).toBe(false);
    expect(row.authenticated_exec).toBe(false);
    expect(row.service_exec).toBe(false);
  }
  expect(grants[0]).toEqual({
    anon_usage: false,
    authenticated_usage: false,
    service_usage: false,
  });
  expect(active[0]?.jobs).toBe(0);

  const [defs] = await db`
    select pg_catalog.pg_get_functiondef('app_private.f15_alert_schedule_activate()'::regprocedure) as activate_def,
      pg_catalog.pg_get_functiondef('app_private.f15_alert_schedule_deactivate()'::regprocedure) as deactivate_def,
      pg_catalog.pg_get_functiondef('app_private.f15_alert_schedule_run()'::regprocedure) as run_def
  `;
  expect(defs!.activate_def).toMatch(/current_user\s*<>\s*'postgres'/i);
  expect(defs!.deactivate_def).toMatch(/current_user\s*<>\s*'postgres'/i);
  expect(defs!.activate_def).toMatch(/pg_advisory_xact_lock\(11011,\s*317\)/);
  expect(defs!.deactivate_def).toMatch(/pg_advisory_xact_lock\(11011,\s*317\)/);
  expect(defs!.activate_def).toContain('cron.schedule');
  expect(defs!.deactivate_def).toContain('cron.unschedule');
  expect(defs!.run_def).toMatch(/current_user\s*<>\s*'postgres'/i);
  expect(defs!.run_def).toContain('clock_timestamp()');
  expect(defs!.run_def).toContain('evaluate_forms_alerts_core');

  const migration = readFileSync(
    new URL(
      '../../supabase/migrations/20261108230029_f15_alert_schedules.sql',
      import.meta.url,
    ),
    'utf8',
  );
  expect(migration).not.toMatch(
    /select\s+app_private\.f15_alert_schedule_activate\s*\(/i,
  );
});

it('rejects non-owner activation even when execute is temporarily granted', async () => {
  await expect(
    db.begin(async (tx) => {
      await tx`grant execute on function app_private.f15_alert_schedule_activate() to authenticated`;
      await tx`set local role authenticated`;
      await expect(
        tx`select app_private.f15_alert_schedule_activate()`,
      ).rejects.toMatchObject({ message: 'f15_alert_owner_required' });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
