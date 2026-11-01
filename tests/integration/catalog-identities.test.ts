import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, checked, sql } from './harness';

const db = sql();
type Actor = { userId: string };
let po: Actor;
let trainer: Actor;
let workspaceId: string;

beforeAll(async () => {
  const createActor = async (role: 'platform_owner' | 'trainer'): Promise<Actor> => {
    const email = `catalog-${role}-${randomUUID()}@example.test`;
    const created = await admin().auth.admin.createUser({
      email,
      password: `Catalog-${randomUUID()}-aA1!`,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? 'Catalog fixture user missing');
    checked(
      await admin().from('staff_profiles').insert({
        user_id: created.data.user.id,
        role,
      }),
    );
    return { userId: created.data.user.id };
  };
  po = await createActor('platform_owner');
  trainer = await createActor('trainer');
  const workspace = checked(
    await admin()
      .from('workspaces')
      .insert({
        name: 'Catalog provenance fixture',
        slug: `f3-catalog-${randomUUID().slice(0, 8)}`,
        created_by: po.userId,
      })
      .select('id')
      .single(),
  );
  workspaceId = workspace.id;
  checked(
    await admin().from('workspace_memberships').insert({
      workspace_id: workspaceId,
      user_id: trainer.userId,
      granted_by: po.userId,
    }),
  );
});
afterAll(async () => db.end());

async function readFoodProvenance(actor: Actor) {
  const foodId = randomUUID();
  let projected: { created_by: string | null; origin_workspace_id: string | null }[] = [];
  const rollbackMarker = 'rollback_catalog_provenance_fixture';
  try {
    await db.begin(async (tx) => {
      await tx`insert into public.foods (id, created_by, origin_workspace_id, current_version)
        values (${foodId}, ${po.userId}, ${workspaceId}, 1)`;
      await tx`insert into public.food_versions (food_id, version, payload, created_by)
        values (${foodId}, 1, '{}'::jsonb, ${po.userId})`;
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
      projected = await tx`select created_by, origin_workspace_id from public.catalog_foods_safe where id = ${foodId}`;
      const versions = await tx`select created_by, origin_workspace_id from public.catalog_food_versions_safe where food_id = ${foodId}`;
      expect(versions).toEqual(projected);
      throw new Error(rollbackMarker);
    });
  } catch (error) {
    expect((error as Error).message).toBe(rollbackMarker);
  }
  return projected;
}

describe('global catalog identities and immutable versions', () => {
  it('has stable identities, unique versions, immutable provenance and valid current-version references', async () => {
    const tables = await db`
      select c.relname as name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('exercises', 'exercise_versions', 'foods', 'food_versions')
      order by c.relname
    `;
    expect(tables.map((row) => row.name)).toEqual([
      'exercise_versions',
      'exercises',
      'food_versions',
      'foods',
    ]);

    const constraints = await db`
      select c.conrelid::regclass::text as table_name, pg_catalog.pg_get_constraintdef(c.oid) as definition
      from pg_catalog.pg_constraint c
      where c.conrelid in (
        'public.exercises'::regclass,
        'public.exercise_versions'::regclass,
        'public.foods'::regclass,
        'public.food_versions'::regclass
      )
      order by table_name, definition
    `;
    const definitionsFor = (table: string) =>
      constraints
        .filter((row) => row.table_name.split('.').at(-1) === table)
        .map((row) => row.definition)
        .join('\n');
    expect(definitionsFor('exercise_versions')).toContain('PRIMARY KEY (exercise_id, version)');
    expect(definitionsFor('food_versions')).toContain('PRIMARY KEY (food_id, version)');
    expect(definitionsFor('exercises')).toContain('FOREIGN KEY (id, current_version) REFERENCES exercise_versions(exercise_id, version)');
    expect(definitionsFor('foods')).toContain('FOREIGN KEY (id, current_version) REFERENCES food_versions(food_id, version)');

    const columns = await db`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and ((table_name = 'foods' and column_name in ('created_by', 'origin_workspace_id'))
          or (table_name in ('exercises', 'foods') and column_name = 'current_version'))
      order by table_name, column_name
    `;
    expect(columns).toEqual([
      { table_name: 'exercises', column_name: 'current_version', is_nullable: 'NO' },
      { table_name: 'foods', column_name: 'created_by', is_nullable: 'NO' },
      { table_name: 'foods', column_name: 'current_version', is_nullable: 'NO' },
      { table_name: 'foods', column_name: 'origin_workspace_id', is_nullable: 'YES' },
    ]);

    const triggers = await db`
      select c.relname as table_name, t.tgname as trigger_name, t.tgenabled
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
        and c.relname in ('exercise_versions', 'food_versions', 'exercises', 'foods')
      order by c.relname, t.tgname
    `;
    expect(triggers.filter((row) => row.table_name.endsWith('_versions')).map((row) => row.tgenabled)).not.toContain('D');
    expect(triggers.some((row) => row.trigger_name === 'exercise_versions_append_only')).toBe(true);
    expect(triggers.some((row) => row.trigger_name === 'food_versions_append_only')).toBe(true);
    expect(triggers.some((row) => row.trigger_name === 'foods_provenance_immutable')).toBe(true);

    const directDml = await db`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where grantee = 'authenticated'
        and table_schema = 'public'
        and table_name in ('exercises', 'exercise_versions', 'foods', 'food_versions')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    `;
    expect(directDml).toEqual([]);
  });

  it('global_food_provenance_masking_non_po', async () => {
    expect(await readFoodProvenance(trainer)).toEqual([
      { created_by: null, origin_workspace_id: null },
    ]);
  });

  it('global_food_provenance_po_governance_read', async () => {
    expect(await readFoodProvenance(po)).toEqual([
      { created_by: po.userId, origin_workspace_id: workspaceId },
    ]);
  });

  it('projects food creator and origin only through PO governance reads', async () => {
    const views = await db`
      select c.relname as name, c.reloptions, pg_catalog.pg_get_userbyid(c.relowner) as owner
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
        and c.relname in ('catalog_foods_safe', 'catalog_food_versions_safe')
    `;
    expect(views.map((row) => row.name).sort()).toEqual([
      'catalog_food_versions_safe',
      'catalog_foods_safe',
    ].sort());
    expect(views.every((row) => row.owner === 'postgres' && row.reloptions?.includes('security_barrier=true'))).toBe(true);
    const definitions = await db`
      select pg_catalog.pg_get_viewdef(c.oid, true) as definition
      from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relname in ('catalog_foods_safe', 'catalog_food_versions_safe')
    `;
    expect(definitions.every((row) => /is_platform_owner/i.test(row.definition))).toBe(true);
    expect(definitions.every((row) => /created_by/i.test(row.definition) && /origin_workspace_id/i.test(row.definition))).toBe(true);
  });

  it('rejects mutation of versions, identity provenance and invalid current-version pointers', async () => {
    const exerciseId = randomUUID();
    const exerciseVersionMutation = db.begin(async (tx) => {
      await tx`insert into public.exercises (id, created_by, current_version) values (${exerciseId}, ${po.userId}, 1)`;
      await tx`insert into public.exercise_versions (exercise_id, version, payload, created_by) values (${exerciseId}, 1, '{}'::jsonb, ${po.userId})`;
      await tx`update public.exercise_versions set payload = '{"mutated":true}' where exercise_id = ${exerciseId}`;
    });
    await expect(exerciseVersionMutation).rejects.toMatchObject({ code: '23514' });

    const foodId = randomUUID();
    await expect(db.begin(async (tx) => {
      await tx`insert into public.foods (id, created_by, origin_workspace_id, current_version) values (${foodId}, ${po.userId}, ${workspaceId}, 1)`;
      await tx`insert into public.food_versions (food_id, version, payload, created_by) values (${foodId}, 1, '{}'::jsonb, ${po.userId})`;
      await tx`update public.foods set origin_workspace_id = null where id = ${foodId}`;
    })).rejects.toMatchObject({ code: '23514' });

    const creatorId = randomUUID();
    const creatorFoodId = randomUUID();
    await expect(db.begin(async (tx) => {
      await tx`insert into public.foods (id, created_by, origin_workspace_id, current_version) values (${creatorFoodId}, ${po.userId}, ${workspaceId}, 1)`;
      await tx`insert into public.food_versions (food_id, version, payload, created_by) values (${creatorFoodId}, 1, '{}'::jsonb, ${po.userId})`;
      await tx`update public.foods set created_by = ${creatorId} where id = ${creatorFoodId}`;
    })).rejects.toMatchObject({ code: '23514' });

    const badId = randomUUID();
    await expect(db.begin(async (tx) => {
      await tx`insert into public.exercises (id, created_by, current_version) values (${badId}, ${po.userId}, 99)`;
      await tx`set constraints all immediate`;
    })).rejects.toMatchObject({ code: '23503' });
  });
});
