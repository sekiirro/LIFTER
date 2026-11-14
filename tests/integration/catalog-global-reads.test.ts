import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
type Actor = { userId: string; role: string | null; state: string };
type MatrixRow = Record<string, string> & { operation: string };
const parity = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'tests/fixtures/catalog-role-parity.sql.json'),
    'utf8',
  ),
) as { roles: string[]; operations: MatrixRow[] };
let actors: Actor[];

beforeAll(async () => {
  const makeActor = async (
    role: string | null,
    state: string,
  ): Promise<Actor> => {
    const created = await admin().auth.admin.createUser({
      email: `catalog-read-${state.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${randomUUID()}@example.test`,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'Catalog read actor missing');
    if (role)
      checked(
        await admin()
          .from('staff_profiles')
          .insert({
            user_id: created.data.user.id,
            role,
            display_name: role.replaceAll('_', ' '),
          }),
      );
    return { userId: created.data.user.id, role, state };
  };
  const po = await makeActor('platform_owner', 'PO');
  const wo = await makeActor('workspace_owner', 'WO');
  const trainer = await makeActor('trainer', 'Trainer');
  const sales = await makeActor('sales', 'Sales');
  const client = await makeActor(null, 'Client');
  const unknown = await makeActor(null, 'Unknown/unauthenticated');
  const workspace = checked(
    await admin()
      .from('workspaces')
      .insert({
        name: 'Global read authorization fixture',
        slug: `f3-global-read-${randomUUID().slice(0, 8)}`,
        created_by: po.userId,
      })
      .select('id')
      .single(),
  );
  if (!workspace) throw new Error('Catalog read workspace missing');
  checked(
    await admin()
      .from('workspace_memberships')
      .insert(
        [wo, trainer, sales].map((actor) => ({
          workspace_id: workspace.id,
          user_id: actor.userId,
          granted_by: po.userId,
        })),
      ),
  );
  actors = [po, wo, trainer, sales, client, unknown];
});

afterAll(async () => db.end());

describe('global catalog RLS and read RPC authorization', () => {
  it('uses the T001 role fixture for global direct-read and catalog_search boundaries', async () => {
    const expectation = parity.operations.find(
      (row) => row.operation === 'Read global catalog/search/history',
    );
    if (!expectation)
      throw new Error('T001 global catalog read expectation missing');
    const exerciseId = randomUUID();
    const rollbackMarker = 'rollback_catalog_global_read_fixture';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.exercises (id, created_by, current_version)
          values (${exerciseId}, ${actors[0]!.userId}, 1)`;
        await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by)
          values (${exerciseId}, 1, '{"fixture":"global-read-only"}'::jsonb, ${actors[0]!.userId})`;
        await tx`select set_config('role', 'authenticated', true)`;
        for (const actor of actors) {
          const expected = expectation[actor.state];
          if (!expected)
            throw new Error(`T001 role state missing: ${actor.state}`);
          const allowed =
            expected.startsWith('Allow') || expected.startsWith('Same as WO');
          await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
          const direct =
            await tx`select id from public.exercises where id = ${exerciseId}`;
          expect(direct, actor.state).toHaveLength(allowed ? 1 : 0);
          if (allowed) expect(direct[0]!.id).toBe(exerciseId);

          if (allowed) {
            const rows =
              await tx`select result_id, result_workspace_id, result_version, result_payload
              from public.catalog_search('exercise', 'global-read-only', '{}'::jsonb, null, null)`;
            expect(rows, actor.state).toEqual([
              {
                result_id: exerciseId,
                result_workspace_id: null,
                result_version: 1,
                result_payload: { fixture: 'global-read-only' },
              },
            ]);
          } else {
            await expect(
              tx.savepoint(
                async (sp) =>
                  sp`select * from public.catalog_search('exercise', 'global-read-only', '{}'::jsonb, null, null)`,
              ),
              actor.state,
            ).rejects.toMatchObject({
              code: '42501',
              message: 'not_permitted',
            });
          }
        }
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });

  it('denies the anonymous role at both direct RLS and RPC privilege boundaries', async () => {
    const rollbackMarker = 'rollback_catalog_anon_read_fixture';
    try {
      await db.begin(async (tx) => {
        await tx`select set_config('role', 'anon', true)`;
        await expect(
          tx.savepoint(async (sp) => sp`select id from public.exercises`),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`select * from public.catalog_search('exercise', null, '{}'::jsonb, null, null)`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect((error as Error).message).toBe(rollbackMarker);
    }
  });

  it('denies unauthorized catalog_search actors before validating request filters', async () => {
    const deniedActors = actors.filter((actor) =>
      ['Sales', 'Client', 'Unknown/unauthenticated'].includes(actor.state),
    );
    await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      for (const actor of deniedActors) {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`select * from public.catalog_search('food', null, null::jsonb, null, null)`,
          ),
          actor.state,
        ).rejects.toMatchObject({
          code: '42501',
          message: 'not_permitted',
        });
      }
    });
  });
});
