import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  sql,
  tables,
  functions,
  probe,
  graph,
  clientContext,
  type Context,
} from './registration-approval-fixture';
const db = sql();
let f: Context;
beforeAll(async () => {
  f = await clientContext();
});
afterAll(() => db.end());
it.each(tables)(
  'T008 forced RLS, default deny and zero base grants: %s',
  async (table) => {
    const [r] =
      await db`select relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as owner from pg_class where oid=to_regclass(${table})`;
    expect(r).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      owner: 'postgres',
    });
    const [schema, name] = table.split('.');
    expect(
      await db`select policyname from pg_policies where schemaname=${schema!} and tablename=${name!}`,
    ).toHaveLength(0);
    for (const role of ['anon', 'authenticated', 'service_role'])
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const [g] =
          await db`select has_table_privilege(${role},${table},${privilege}) as allowed`;
        expect(g!.allowed).toBe(false);
      }
    const triggers =
      await db`select tgname from pg_trigger where tgrelid=${table}::regclass and not tgisinternal and tgenabled='O'`;
    for (const suffix of ['no_update', 'no_delete', 'no_truncate'])
      expect(triggers.map((r) => r.tgname)).toContain('f12_' + suffix);
  },
);
it('T008 exact private function inventory; U4 RPCs have narrow grants', async () => {
  const rows =
    await db`select p.oid::regprocedure::text as signature,prosecdef,proconfig,pg_get_userbyid(proowner) as owner,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and proname like 'f12_%'`;
  expect(rows.map((r) => r.signature).sort()).toEqual(
    functions.map((n) => 'app_private.' + n).sort(),
  );
  for (const row of rows) {
    expect(row.prosecdef).toBe(true);
    expect(row.proconfig).toContain('search_path=""');
    expect(row.owner).toBe('postgres');
    expect(row.prosrc).not.toMatch(/\bexecute\s/i);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [g] =
        await db`select has_function_privilege(${role},${row.signature},'EXECUTE') as allowed`;
      expect(g!.allowed).toBe(false);
    }
  }
  for (const name of ['installment_collect', 'collection_correct'])
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [r] =
        await db`select prosecdef,proconfig,pg_get_userbyid(proowner) as owner,has_function_privilege(${role},oid,'EXECUTE') as allowed from pg_proc where oid=to_regprocedure(${'public.' + name + '(jsonb)'})`;
      expect(r).toEqual({
        prosecdef: true,
        proconfig: ['search_path=""'],
        owner: 'postgres',
        allowed: role === 'authenticated',
      });
    }
});
it('T020 U4 shares the client/subscription/obligation/ledger/key lock order', async () => {
  const [row] =
    await db`select prosrc from pg_proc where oid='app_private.f12_u4_operation(text,jsonb)'::regprocedure`;
  const source = row!.prosrc as string;
  const stages = [
    /select \* into c from public\.clients[^;]*for update;/,
    /select \* into s from public\.subscriptions[^;]*for update;/,
    /perform x\.id from public\.subscription_installments[^;]*for update;/,
    /perform e\.id from public\.payment_events[^;]*for update;/,
    /perform pg_advisory_xact_lock\(/,
  ].map((pattern) => source.search(pattern));
  expect(stages.every((position) => position >= 0)).toBe(true);
  expect(stages).toEqual([...stages].sort((left, right) => left - right));
});
it('T008 controlled grants independently exercise RLS on populated tenant rows', async () => {
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id) values(${f.wsA.id},${ids.subscription},now(),${randomUUID()})`;
    await tx`set constraints all immediate`;
    for (const table of tables)
      expect(
        (await tx.unsafe(`select * from ${table}`)).length,
      ).toBeGreaterThan(0);
    // RLS must deny even when table privileges have been temporarily supplied.
    for (const table of tables)
      await tx.unsafe(`grant select on ${table} to authenticated,anon`);
    await tx`grant usage on schema app_private to anon`;
    for (const [name, identity] of Object.entries(f.actors)) {
      const role = name === 'anon' ? 'anon' : 'authenticated';
      await tx.unsafe(`set local role ${role}`);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: identity.userId, role })},true)`;
      for (const table of tables)
        expect(await tx.unsafe(`select * from ${table}`)).toEqual([]);
      await tx`reset role`;
    }
  });
});
it('T008 composite tenant and same-parent foreign keys are installed', async () => {
  const rows =
    await db`select conrelid::regclass::text as child,pg_get_constraintdef(oid) as definition from pg_constraint where contype='f' and conrelid=any(${tables}::regclass[])`;
  for (const table of tables)
    expect(
      rows.some(
        (r) =>
          r.child === table.replace('public.', '') &&
          r.definition.includes('FOREIGN KEY (workspace_id,') &&
          r.definition.includes('ON DELETE RESTRICT'),
      ),
    ).toBe(true);
  expect(
    rows.filter(
      (r) =>
        r.child === 'payment_events' &&
        r.definition.includes('workspace_id, subscription_id, obligation_id'),
    ),
  ).toHaveLength(4);
});
