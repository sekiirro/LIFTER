import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

it('T008 leaves pg_cron disabled and backup gates open', async () => {
  const jobs = await db`
    select jobid,jobname,schedule,command,username,active,database
    from cron.job
    where jobname like 'lifter-f11-%'
      or command ilike '%purge_f11_retained_data%'
      or command ilike '%purge_retention%'
  `;
  expect(jobs).toEqual([]);

  for (const migration of [
    'supabase/migrations/20261223070000_retention_purge_eligibility.sql',
    'supabase/migrations/20261223070001_retention_purge_authz.sql',
    'supabase/migrations/20261223070002_retention_purge_refund_hold.sql',
  ]) {
    expect(readFileSync(migration, 'utf8')).not.toMatch(
      /purge_schedule_activate\s*\(/i,
    );
  }

  const readiness = readFileSync('docs/13-production-readiness.md', 'utf8');
  for (const id of ['OP-01', 'BR-01', 'BR-02', 'BR-04', 'FN-03']) {
    const row = readiness
      .split(/\r?\n/)
      .find((line) => line.startsWith(`| ${id} |`));
    expect(row, `${id} remains an explicit readiness row`).toBeDefined();
    if (row) expect(row).toMatch(/\| Open\s*\|/);
  }
});
