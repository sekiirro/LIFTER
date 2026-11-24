import { createHash } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { clientContext, graph, sql } from './registration-approval-fixture';

const db = sql();
const rollback = new Error('rollback retention authorization probe');
type ApiRole = 'authenticated' | 'anon' | 'service_role';

afterAll(() => db.end());

async function callAs(actorId: string | null, role: ApiRole = 'authenticated') {
  let result: unknown;
  try {
    await db.begin(async (tx) => {
      const claims = actorId ? { sub: actorId, role } : { role };
      await tx`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
      await tx.unsafe(`set local role ${role}`);
      const [row] =
        await tx`select app_private.purge_retention_for_platform_owner() as value`;
      result = row!.value;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return result;
}

async function underMutant<T>(
  signature: string,
  control: string,
  replacement: string,
  actorId: string,
  probe: (tx: TransactionSql) => Promise<T>,
) {
  let observed: T | undefined;
  try {
    await db.begin(async (tx) => {
      const [row] =
        await tx`select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition`;
      const definition = row!.definition as string;
      const mutated = definition.replace(control, replacement);
      expect(
        mutated,
        'the Platform Owner guard exists in the wrapper',
      ).not.toBe(definition);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actorId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      observed = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return observed;
}

it('T006 authorizes the Platform Owner at the database boundary only', async () => {
  const f = await clientContext();
  let clientUserId = '';
  await db.begin(async (tx) => {
    const ids = await graph(tx, f);
    const [client] = await tx`
      select auth_user_id from public.clients where id=${ids.client}
    `;
    clientUserId = client!.auth_user_id as string;
  });

  const [catalog] = await db`
    select p.prosecdef, p.proconfig,
      pg_catalog.pg_get_userbyid(p.proowner) as owner,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
    from pg_catalog.pg_proc p
    where p.oid='app_private.purge_retention_for_platform_owner()'::regprocedure
  `;
  expect(catalog).toMatchObject({
    prosecdef: true,
    proconfig: ['search_path=""'],
    owner: 'postgres',
    authenticated_execute: true,
    anon_execute: false,
    service_role_execute: false,
  });

  expect(await callAs(f.po.userId)).toHaveProperty('eligible_by_class');
  for (const actorId of [
    f.trainerA.userId,
    f.salesA.userId,
    f.trainerB.userId,
    clientUserId,
  ]) {
    await expect(callAs(actorId)).rejects.toMatchObject({ code: '42501' });
  }
  await expect(callAs(null)).rejects.toMatchObject({ code: '42501' });
  await expect(callAs(null, 'anon')).rejects.toMatchObject({ code: '42501' });
  await expect(callAs(null, 'service_role')).rejects.toMatchObject({
    code: '42501',
  });

  const signature = 'app_private.purge_retention_for_platform_owner()';
  const control =
    'if auth.uid() is null or not app_private.is_platform_owner() then';
  const [beforeMutation] = await db`
    select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
  `;
  const beforeHash = createHash('sha256')
    .update(beforeMutation!.definition as string)
    .digest('hex');
  const leaked = (await underMutant(
    signature,
    control,
    'if auth.uid() is null then',
    f.trainerA.userId,
    async (tx) => {
      const [row] =
        await tx`select app_private.purge_retention_for_platform_owner() as value`;
      return row!.value as { eligible_by_class: Record<string, number> };
    },
  )) as { eligible_by_class: Record<string, number> };
  expect(leaked).toHaveProperty('eligible_by_class');
  const [afterMutation] = await db`
    select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition
  `;
  expect(afterMutation!.definition).toBe(beforeMutation!.definition);
  expect(
    createHash('sha256')
      .update(afterMutation!.definition as string)
      .digest('hex'),
  ).toBe(beforeHash);
});
