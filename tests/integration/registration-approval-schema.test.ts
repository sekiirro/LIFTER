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
it('T008 exact private function inventory, no exposed U3 RPCs', async () => {
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
  for (const name of [
    'registration_approve',
    'registration_reject',
    'registration_reconsider',
    'installment_collect',
    'collection_correct',
  ])
    expect(
      await db`select oid from pg_proc where proname=${name}`,
    ).toHaveLength(0);
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
