import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

// Spec 023 T045 (FR-031, FR-033): the client timeline is a read-only projection
// over existing immutable facts. It adds no table, so it has no rows of its own
// to retain, and it adds no retention rule, purge job or cron entry; the source
// facts keep their existing F11/F12/F13/F19/F20 retention.

let db: ReturnType<typeof sql>;

beforeAll(() => {
  db = sql();
});
afterAll(async () => db?.end());

describe('spec 023 timeline retention (T045)', () => {
  it('stores nothing of its own and adds no retention rule', async () => {
    const tables = await db`
      select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p', 'v', 'm')
        and c.relname ~* 'timeline'`;
    expect(tables).toEqual([]);

    const [projection] = await db`
      select p.provolatile, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'client_progress_timeline'`;
    // STABLE: the projection cannot write (no audit duplication, FR-033).
    expect(projection).toEqual({ provolatile: 's', prosecdef: true });

    const retention = await db`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'app_private') and p.proname like 'f23%'
        and p.proname ~* '(purge|retention|expire|cleanup)'`;
    expect(retention).toEqual([]);

    const [cron] = await db`
      select exists(select 1 from pg_namespace where nspname = 'cron') as installed`;
    if (cron!.installed) {
      const jobs = await db`select jobname from cron.job
        where jobname ~* 'f23' and jobname ~* '(timeline|purge|retention)'`;
      expect(jobs).toEqual([]);
    }
  });

  it('reads only the source facts of the fixed event set', async () => {
    const [row] = await db`
      select pg_catalog.pg_get_functiondef(
        'public.client_progress_timeline(uuid,uuid)'::regprocedure) as d`;
    const body = row!.d as string;
    for (const source of [
      'app_private.registration_approval_events',
      'public.subscription_renewals',
      'public.plan_deliveries',
      'public.subscription_freezes',
      'public.subscription_freeze_events',
      'app_private.client_closure_operations',
      'public.food_replacement_requests',
    ])
      expect(body, source).toContain(source);
    // No write statements: the projection never duplicates audit rows.
    expect(body).not.toMatch(
      /\b(insert|update|delete)\s+(into|from)?\s*public\.audit_events/i,
    );
  });
});
