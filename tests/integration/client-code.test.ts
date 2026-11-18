import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientContext, sql } from './registration-approval-fixture';
import { pending, signup, signupFixture } from './client-accounts-fixture';
import { checked, issue } from './registration-links-fixture';
import type { Context } from './registration-approval-fixture';

// F11 S66-PO-1 (option A): random per-workspace client code.
const FORMAT = /^[2-9A-HJ-NP-Z]{8}$/;
const DISPLAY = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

let db: ReturnType<typeof sql>;
beforeAll(() => {
  db = sql();
});
afterAll(async () => db?.end());

async function newClient(context: Context) {
  const link = checked(await issue(context)) as string;
  return db.begin((tx) => pending(tx, context, { registration_link_id: link }));
}

async function lookup(
  actor: Context['po'],
  workspaceId: string,
  code: string | null,
) {
  const result = await actor.client.rpc('find_client_by_code', {
    p_workspace_id: workspaceId,
    p_code: code,
  });
  expect(result.error).toBeNull();
  return result.data;
}

describe('F11 client code (S66-PO-1 option A)', () => {
  it('assigns a random 8-character unambiguous code at creation, ignoring any supplied value', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    const link = checked(await issue(context)) as string;
    const b = await db.begin((tx) =>
      pending(tx, context, {
        registration_link_id: link,
        client_code: 'AAAAAAAA',
      }),
    );
    for (const row of [a, b]) {
      expect(row.client_code).toMatch(FORMAT);
      expect(row.client_code).not.toMatch(/[01OI]/);
    }
    expect(b.client_code).not.toBe('AAAAAAAA');
    expect(a.client_code).not.toBe(b.client_code);
  });

  it('is unique on (workspace_id, client_code) and format-constrained', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    const b = await newClient(context);
    await expect(
      db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.clients set client_code=${a.client_code} where id=${b.id}`;
      }),
    ).rejects.toThrow(/clients_workspace_id_client_code_key/);
    for (const bad of [
      'AAAAAAA0',
      'AAAAAAAO',
      'AAAAAAA1',
      'AAAAAAAI',
      'aaaaaaaa',
      'AAAA-AAA',
      'AAAAAAA',
    ]) {
      await expect(
        db.begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`update public.clients set client_code=${bad} where id=${b.id}`;
        }),
      ).rejects.toThrow(/clients_client_code_format/);
    }
  });

  it('is immutable after assignment', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    await expect(
      db`update public.clients set client_code='ZZZZ2222' where id=${a.id}`,
    ).rejects.toThrow(/client_code_immutable/);
    await expect(
      db`update public.clients set client_code=null where id=${a.id}`,
    ).rejects.toThrow(/client_code_immutable|not-null/);
    const [after] =
      await db`select client_code from public.clients where id=${a.id}`;
    expect(after!.client_code).toBe(a.client_code);
  });

  it('retries on collision and fails closed when every candidate collides', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    const ws = context.wsA.id;
    const [retry] = await db`
      select app_private.allocate_client_code(${ws}::uuid, array[${a.client_code}, 'bad', null, 'CCCC3333']::text[]) as code`;
    expect(retry!.code).toBe('CCCC3333');
    await expect(
      db`select app_private.allocate_client_code(${ws}::uuid, array[${a.client_code}, 'I0I0I0I0']::text[])`,
    ).rejects.toThrow(/client_code_allocation_exhausted/);
    // The same candidate is free in a different workspace (per-workspace uniqueness).
    const [other] = await db`
      select app_private.allocate_client_code(${context.wsB.id}::uuid, array[${a.client_code}]::text[]) as code`;
    expect(other!.code).toBe(a.client_code);
  });

  it('backfills existing clients with unique valid codes (migration block re-run)', async () => {
    const context = await clientContext();
    await newClient(context);
    await newClient(context);
    const [state] = await db`
      select count(*) filter (where client_code is null or client_code !~ '^[2-9A-HJ-NP-Z]{8}$')::int as invalid,
        count(*)::int as total, count(distinct (workspace_id, client_code))::int as distinct_codes
      from public.clients`;
    expect(state!.invalid).toBe(0);
    expect(state!.distinct_codes).toBe(state!.total);
    // Re-run the migration backfill loop (without DDL locks) over all rows in a rolled-back transaction.
    const rollback = new Error('rollback');
    let restored = 0;
    await db
      .begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`do $$ declare r record; begin
          for r in select id, workspace_id from public.clients order by created_at, id loop
            update public.clients set client_code = app_private.allocate_client_code(r.workspace_id) where id = r.id;
          end loop; end $$`;
        const [after] = await tx`
          select count(*) filter (where client_code ~ '^[2-9A-HJ-NP-Z]{8}$')::int as valid,
            count(*)::int as total, count(distinct (workspace_id, client_code))::int as distinct_codes
          from public.clients`;
        restored = after!.valid;
        expect(after!.valid).toBe(after!.total);
        expect(after!.distinct_codes).toBe(after!.total);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    expect(restored).toBeGreaterThan(1);
  });

  it('normalises case and dashes and formats as XXXX-XXXX', async () => {
    const [n] = await db`select
      app_private.normalize_client_code(' abcd-2345 ') as lower_dash,
      app_private.normalize_client_code('ABCD2345') as plain,
      app_private.normalize_client_code('ABCD-2340') as zero,
      app_private.normalize_client_code('ABCD-234') as short,
      app_private.normalize_client_code(null) as nul,
      app_private.format_client_code('abcd2345') as display`;
    expect(n).toEqual({
      lower_dash: 'ABCD2345',
      plain: 'ABCD2345',
      zero: null,
      short: null,
      nul: null,
      display: 'ABCD-2345',
    });
  });

  it('lets only the Platform Owner and own-workspace Workspace Owner find a client by exact code', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    const display = `${a.client_code.slice(0, 4)}-${a.client_code.slice(4)}`;
    expect(display).toMatch(DISPLAY);
    const expected = { status: 'ok', client_id: a.id, client_code: display };
    expect(await lookup(context.po, context.wsA.id, display)).toEqual(expected);
    expect(await lookup(context.woA, context.wsA.id, display)).toEqual(
      expected,
    );
    expect(
      await lookup(context.woA, context.wsA.id, a.client_code.toLowerCase()),
    ).toEqual(expected);
  });

  it('returns not_permitted to Trainer, Sales, client and other-workspace owner', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    for (const actor of [
      context.trainerA,
      context.salesA,
      context.actors.client,
      context.actors.woB,
    ]) {
      expect(await lookup(actor, context.wsA.id, a.client_code)).toEqual({
        status: 'not_permitted',
      });
    }
    const asClientAccount = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: a.auth_user_id, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [result] = await tx`
        select public.find_client_by_code(${context.wsA.id}, ${a.client_code}) as result`;
      return result!.result;
    });
    expect(asClientAccount).toEqual({ status: 'not_permitted' });
  });

  it('exposes no client_code column privilege or private-function grant to API roles', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [column] = await db`
        select has_column_privilege(${role}, 'public.clients', 'client_code', 'SELECT') as allowed`;
      expect(column!.allowed, role).toBe(false);
      for (const fn of [
        'app_private.allocate_client_code(uuid,text[])',
        'app_private.normalize_client_code(text)',
        'app_private.format_client_code(text)',
      ]) {
        const [grant] = await db`
          select has_function_privilege(${role}, ${fn}, 'EXECUTE') as allowed`;
        expect(grant!.allowed, `${role} ${fn}`).toBe(false);
      }
      const [rpc] = await db`
        select has_function_privilege(${role}, 'public.find_client_by_code(uuid,text)', 'EXECUTE') as allowed`;
      expect(rpc!.allowed, role).toBe(role === 'authenticated');
    }
    const context = await clientContext();
    const a = await newClient(context);
    const direct = await context.actors.client.client
      .from('clients')
      .select('client_code')
      .eq('workspace_id', context.wsA.id);
    expect(direct.error).not.toBeNull();
    expect(JSON.stringify(direct.data ?? null)).not.toContain(a.client_code);
  });

  it('does not enumerate: wrong, malformed and foreign-workspace codes return the same no-match shape', async () => {
    const context = await clientContext();
    const a = await newClient(context);
    const noMatch = { status: 'ok', client_id: null, client_code: null };
    // A valid code of workspace A searched inside workspace B (foreign) is a no-match.
    expect(
      await lookup(context.actors.woB, context.wsB.id, a.client_code),
    ).toEqual(noMatch);
    for (const wrong of [
      'ZZZZ-2222',
      'zzzz2222',
      'not-a-code',
      '',
      ' ',
      'AAAA-AAA0',
      `${a.client_code}X`,
      a.client_code.slice(0, 7),
      `${a.client_code.slice(0, 4)}%`,
    ]) {
      expect(await lookup(context.po, context.wsA.id, wrong), wrong).toEqual(
        noMatch,
      );
      expect(await lookup(context.woA, context.wsA.id, wrong), wrong).toEqual(
        noMatch,
      );
    }
    expect(await lookup(context.po, context.wsA.id, null)).toEqual(noMatch);
    // The PO searching workspace B with A's code is also a no-match, not a hit.
    expect(await lookup(context.po, context.wsB.id, a.client_code)).toEqual(
      noMatch,
    );
  });

  it('leaves every user trigger on public.clients enabled (migration disable/enable guard)', async () => {
    const triggers = await db`
      select tgname, tgenabled from pg_trigger
      where tgrelid = 'public.clients'::regclass and not tgisinternal
      order by tgname`;
    expect(triggers.map((t) => t.tgname)).toEqual(
      expect.arrayContaining([
        'f11_client_code_assign',
        'f11_client_code_immutable',
        'f12_client_transition',
        'signup_client_insert_guard',
      ]),
    );
    for (const t of triggers) expect(t.tgenabled, t.tgname).toBe('O');
  });

  it('does not report a client_code unique violation as an email/phone duplicate on signup', async () => {
    const context = await clientContext();
    const existing = await newClient(context);
    const fixture = await signupFixture(context);
    const rollback = new Error('rollback');
    let result: unknown;
    await db
      .begin(async (tx) => {
        // Force the allocator to return a code that already exists in the workspace.
        await tx.unsafe(
          `create or replace function app_private.allocate_client_code(p_workspace_id uuid, p_candidates text[] default null)
           returns text language sql as $f$ select '${existing.client_code}'::text $f$`,
        );
        result = await signup(tx, fixture, {
          ...fixture.fields,
          name: 'Client Example Synthetic',
          date_of_birth: '1990-04-12',
          username: `Fit.Client.${fixture.link.replaceAll('-', '').slice(0, 8)}`,
          telegram_username: '@FitClient_1',
        });
        const [count] = await tx`
          select count(*)::int as n from public.clients
          where registration_link_id=${fixture.link}`;
        expect(count!.n).toBe(0);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    expect(result).toEqual({ status: 'unavailable' });
  });
});
