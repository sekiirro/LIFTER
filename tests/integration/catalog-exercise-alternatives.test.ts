import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();

afterAll(async () => db.end());

describe('T048 exercise override alternatives storage contract', () => {
  it('keys child rows to one immutable override version and same-workspace private targets', async () => {
    const [row] = await db`
      select
        exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_override_alternatives'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.exercise_override_versions'::regclass
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
                = array['workspace_id','exercise_id','override_version']::name[]
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.confkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
                = array['workspace_id','exercise_id','version']::name[]
        ) as parent_version_fk,
        exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_override_alternatives'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.workspace_exercises'::regclass
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
                = array['workspace_id','workspace_exercise_id']::name[]
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.confkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
                = array['workspace_id','id']::name[]
        ) as same_workspace_private_fk,
        exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_override_alternatives'::regclass
            and c.contype = 'f' and c.confrelid = 'public.exercises'::regclass
            and c.conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='global_exercise_id')]::smallint[]
        ) as global_target_fk
    `;
    expect(row!.parent_version_fk).toBe(true);
    // This is the foreign-target regression: the workspace key must participate in the FK.
    expect(row!.same_workspace_private_fk).toBe(true);
    expect(row!.global_target_fk).toBe(true);
  });

  it('rejects rows with both or neither target through an exactly-one-target CHECK', async () => {
    const [row] = await db`
      select exists (
        select 1 from pg_catalog.pg_constraint c
        where c.conrelid = 'public.exercise_override_alternatives'::regclass
          and c.contype = 'c'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%num_nonnulls(global_exercise_id, workspace_exercise_id) = 1%'
      ) as exactly_one_check
    `;
    expect(row!.exactly_one_check).toBe(true);
  });

  it('bounds each version to three unique targets and preserves written rows', async () => {
    const [row] = await db`
      select
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.exercise_override_alternatives'::regclass
            and c.contype='c' and pg_catalog.pg_get_constraintdef(c.oid) ilike '%position%1%3%') as bounded_position,
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.exercise_override_alternatives'::regclass
            and c.contype='u'
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
                = array['workspace_id','exercise_id','override_version','global_exercise_id']::name[]) as unique_global,
        exists (select 1 from pg_catalog.pg_constraint c
          where c.conrelid='public.exercise_override_alternatives'::regclass
            and c.contype='u'
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
                = array['workspace_id','exercise_id','override_version','workspace_exercise_id']::name[]) as unique_private,
        exists (select 1 from pg_catalog.pg_trigger t
          where t.tgrelid='public.exercise_override_alternatives'::regclass and not t.tgisinternal
            and t.tgtype & 16 = 16 and t.tgtype & 8 = 8) as immutable_trigger
    `;
    expect(row!.bounded_position).toBe(true);
    expect(row!.unique_global).toBe(true);
    expect(row!.unique_private).toBe(true);
    expect(row!.immutable_trigger).toBe(true);
  });

  it('validates targets as active at write time and skips inactive targets in library reads', async () => {
    const [row] = await db`
      select
        pg_catalog.pg_get_functiondef('app_private.validate_exercise_override_alternative()'::regprocedure) as validator,
        pg_catalog.pg_get_functiondef('public.catalog_exercise_override_alternatives(uuid,uuid)'::regprocedure) as library_read
    `;
    expect(row!.validator).toMatch(/lifecycle_state/i);
    expect(row!.validator).toMatch(/'active'/i);
    expect(row!.validator).toMatch(/workspace_id/i);
    expect(row!.library_read).toMatch(/lifecycle_state\s*=\s*'active'/i);
    expect(row!.library_read).toMatch(/has_workspace_access/i);
  });

  it('freezes target rows and filters a target removed after the version was written', async () => {
    const fixture = await twoWorkspaceFixture();
    const actor = fixture.trainerA.userId;
    const sourceId = randomUUID();
    const activeTargetId = randomUUID();
    const removedLaterId = randomUUID();
    await db.begin(async (tx) => {
      const writeExercise = async (id: string, name: string) => {
        await tx`insert into public.exercises(id, created_by, current_version)
          values (${id}, ${actor}, 1)`;
        await tx`insert into public.exercise_versions(exercise_id, version, payload, created_by)
          values (${id}, 1, ${tx.json({ name_en: name })}, ${actor})`;
      };
      await writeExercise(sourceId, 'Alternative source');
      await writeExercise(activeTargetId, 'Alternative remains active');
      await writeExercise(removedLaterId, 'Alternative removed later');
      await tx`insert into public.exercise_overrides(workspace_id, exercise_id, current_version)
        values (${fixture.wsA.id}, ${sourceId}, 1)`;
      await tx`insert into public.exercise_override_versions(
          workspace_id, exercise_id, version, payload, alternatives_present, created_by
        ) values (${fixture.wsA.id}, ${sourceId}, 1, '{}'::jsonb, true, ${actor})`;
      await tx`insert into public.exercise_override_alternatives(
          workspace_id, exercise_id, override_version, position, global_exercise_id
        ) values
          (${fixture.wsA.id}, ${sourceId}, 1, 1, ${activeTargetId}),
          (${fixture.wsA.id}, ${sourceId}, 1, 2, ${removedLaterId})`;
      await tx`update public.exercises set lifecycle_state = 'removed' where id = ${removedLaterId}`;
    });

    const [resolved] = await db.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, role: 'authenticated' })}, true)`;
      return tx`select public.catalog_exercise_override_alternatives(${fixture.wsA.id}, ${sourceId}) as result`;
    });
    expect(resolved!.result).toEqual({
      present: true,
      items: [{ position: 1, global_exercise_id: activeTargetId, workspace_exercise_id: null }],
    });
    await expect(db`insert into public.exercise_override_alternatives(
        workspace_id, exercise_id, override_version, position, global_exercise_id
      ) values (${fixture.wsA.id}, ${sourceId}, 1, 3, ${removedLaterId})`)
      .rejects.toThrow('catalog_exercise_alternatives_invalid');
  });

  it('uses forced workspace RLS with no direct DML grants', async () => {
    const [row] = await db`
      select c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('authenticated','public.exercise_override_alternatives','INSERT') as authenticated_insert,
        has_table_privilege('service_role','public.exercise_override_alternatives','INSERT') as service_insert,
        has_table_privilege('authenticated','public.exercise_override_alternatives','UPDATE') as authenticated_update,
        has_table_privilege('authenticated','public.exercise_override_alternatives','DELETE') as authenticated_delete
      from pg_catalog.pg_class c where c.oid='public.exercise_override_alternatives'::regclass
    `;
    expect(row!.relrowsecurity).toBe(true);
    expect(row!.relforcerowsecurity).toBe(true);
    expect(row!.authenticated_insert).toBe(false);
    expect(row!.service_insert).toBe(false);
    expect(row!.authenticated_update).toBe(false);
    expect(row!.authenticated_delete).toBe(false);
  });
});
