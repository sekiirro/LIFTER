import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  leaderboardClient,
  leaderboardContext,
  publishAsPo,
  type LeaderboardClient,
  type LeaderboardContext,
} from './leaderboard-fixture';
import { anonClient, sql } from './harness';

// T005/T006/T007 [FR-001, FR-035, FR-040] foundational RLS and grants.
const tables = [
  'public.client_leaderboard_opt_outs',
  'public.leaderboard_publications',
  'public.leaderboard_entries',
  'public.leaderboard_current_publications',
  'app_private.client_username_changes',
] as const;
const rpcs = [
  'public.client_update_username(text)',
  'public.client_leaderboard_opt_out()',
  'public.client_leaderboard_read()',
  'public.workspace_leaderboard_read(uuid)',
  'public.client_leaderboard_self()',
  'public.leaderboard_candidate_pool(uuid)',
  'public.create_leaderboard_candidate(uuid,uuid[],uuid)',
  'public.leaderboard_pending_read(uuid)',
  'public.decide_leaderboard_candidate(uuid,text)',
] as const;
const helpers = [
  'app_private.f24_username_issue(text,uuid)',
  'app_private.f24_active_days(uuid,uuid,date,integer)',
  'app_private.f24_eligibility_facts(uuid,uuid,date)',
  'app_private.f24_client_eligible(uuid,uuid,date)',
  'app_private.f24_visible_username(uuid,uuid)',
  'app_private.f24_publication_entries(uuid,uuid)',
  'app_private.f24_current_view(uuid)',
] as const;

let f: LeaderboardContext;
let clientA: LeaderboardClient;
const db = sql();
beforeAll(async () => {
  f = await leaderboardContext();
  clientA = await leaderboardClient(f);
  await publishAsPo(f, f.wsA.id, [clientA.clientId]);
});
afterAll(() => db.end());

describe('catalog: deny-by-default storage', () => {
  it('enables and forces RLS with no policies and no API-role grants', async () => {
    for (const table of tables) {
      const [row] = await db`
        select c.relrowsecurity, c.relforcerowsecurity,
          (select count(*)::int from pg_policies p where p.schemaname||'.'||p.tablename=${table}) as policies,
          has_table_privilege('anon', ${table}, 'select') as anon_select,
          has_table_privilege('authenticated', ${table}, 'select') as auth_select,
          has_table_privilege('authenticated', ${table}, 'insert') as auth_insert,
          has_table_privilege('service_role', ${table}, 'select') as service_select
        from pg_class c where c.oid=${table}::regclass`;
      expect(row, table).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
        policies: 0,
        anon_select: false,
        auth_select: false,
        auth_insert: false,
        service_select: false,
      });
    }
  });

  it('binds every relation to its workspace with composite foreign keys', async () => {
    const fks = await db`
      select conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as def
      from pg_constraint
      where contype='f' and conrelid in (
        'public.client_leaderboard_opt_outs'::regclass, 'public.leaderboard_entries'::regclass,
        'public.leaderboard_current_publications'::regclass, 'app_private.client_username_changes'::regclass)
        and pg_get_constraintdef(oid) like '%(workspace_id, %'`;
    expect(fks.length).toBeGreaterThanOrEqual(5);
  });

  it('exposes only SECURITY DEFINER RPCs with a pinned search_path, to authenticated only', async () => {
    for (const fn of rpcs) {
      const [row] = await db`
        select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
          has_function_privilege('anon', p.oid, 'execute') as anon_exec,
          has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
        from pg_proc p where p.oid=to_regprocedure(${fn})`;
      expect(row, fn).toEqual({
        prosecdef: true,
        proconfig: ['search_path=""'],
        owner: 'postgres',
        anon_exec: false,
        auth_exec: true,
      });
    }
    for (const fn of helpers) {
      const [row] = await db`
        select has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
          has_function_privilege('anon', p.oid, 'execute') as anon_exec
        from pg_proc p where p.oid=to_regprocedure(${fn})`;
      expect(row, fn).toEqual({ auth_exec: false, anon_exec: false });
    }
  });
});

describe('API denial for anonymous, revoked and foreign callers', () => {
  it('denies table access through PostgREST for every role', async () => {
    for (const caller of [
      anonClient(),
      clientA.client,
      f.trainerA.client,
      f.po.client,
    ])
      for (const table of [
        'client_leaderboard_opt_outs',
        'leaderboard_publications',
        'leaderboard_entries',
        'leaderboard_current_publications',
      ]) {
        const read = await caller.from(table).select('*').limit(1);
        expect(read.error, table).not.toBeNull();
      }
  });

  it('denies anonymous RPC execution', async () => {
    const anonymous = anonClient();
    for (const [name, args] of [
      ['client_leaderboard_read', {}],
      ['workspace_leaderboard_read', { p_workspace_id: f.wsA.id }],
      ['client_leaderboard_self', {}],
      ['client_leaderboard_opt_out', {}],
    ] as const)
      expect((await anonymous.rpc(name, args)).error, name).not.toBeNull();
  });

  it('denies revoked and foreign-workspace staff the workspace read', async () => {
    for (const caller of [f.actors.revoked, f.trainerB, f.actors.woB])
      expect(
        (
          await caller.client.rpc('workspace_leaderboard_read', {
            p_workspace_id: f.wsA.id,
          })
        ).data,
      ).toEqual({ status: 'not_permitted' });
  });

  it('gives a signed-in user without a client account no client read', async () => {
    for (const name of ['client_leaderboard_read', 'client_leaderboard_self'])
      expect((await f.actors.client.client.rpc(name)).data, name).toEqual({
        status: 'not_permitted',
      });
  });
});
