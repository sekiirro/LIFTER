import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();

afterAll(async () => db.end());

describe('T046 exercise override identity and storage contract', () => {
  it('keys an override by both workspace and canonical exercise', async () => {
    const [row] = await db`
      select
        (select array_agg(a.attname order by k.ordinality)
         from pg_catalog.pg_constraint c
         cross join lateral unnest(c.conkey) with ordinality as k(attnum, ordinality)
         join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         where c.conrelid = 'public.exercise_overrides'::regclass and c.contype = 'p') as key_columns,
        (select exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_overrides'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.workspaces'::regclass
            and c.conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid = c.conrelid and attname = 'workspace_id')]::smallint[]
        )) as workspace_fk,
        (select exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_overrides'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.exercises'::regclass
            and c.conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid = c.conrelid and attname = 'exercise_id')]::smallint[]
        )) as canonical_fk
    `;
    expect(row!.key_columns).toEqual(['workspace_id', 'exercise_id']);
    expect(row!.workspace_fk).toBe(true);
    expect(row!.canonical_fk).toBe(true);
  });

  it('uses composite version keys and a workspace-scoped current-version reference', async () => {
    const [row] = await db`
      select
        (select array_agg(a.attname order by k.ordinality)
         from pg_catalog.pg_constraint c
         cross join lateral unnest(c.conkey) with ordinality as k(attnum, ordinality)
         join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         where c.conrelid = 'public.exercise_override_versions'::regclass and c.contype = 'p') as version_key,
        (select exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_override_versions'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.exercise_overrides'::regclass
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality as k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
                = array['workspace_id', 'exercise_id']::name[]
        )) as parent_fk,
        (select exists (
          select 1 from pg_catalog.pg_constraint c
          where c.conrelid = 'public.exercise_overrides'::regclass
            and c.contype = 'f'
            and c.confrelid = 'public.exercise_override_versions'::regclass
            and (select array_agg(a.attname order by k.ordinality)
                 from unnest(c.conkey) with ordinality as k(attnum, ordinality)
                 join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
                = array['workspace_id', 'exercise_id', 'current_version']::name[]
        )) as current_version_fk
    `;
    expect(row!.version_key).toEqual(['workspace_id', 'exercise_id', 'version']);
    expect(row!.parent_fk).toBe(true);
    expect(row!.current_version_fk).toBe(true);
  });

  it('keeps override versions append-only', async () => {
    const [row] = await db`
      select exists (
        select 1 from pg_catalog.pg_trigger t
        where t.tgrelid = 'public.exercise_override_versions'::regclass
          and not t.tgisinternal
          and (t.tgtype & 16) = 16
          and (t.tgtype & 8) = 8
      ) as append_only_trigger
    `;
    expect(row!.append_only_trigger).toBe(true);
  });

  it('documents null-as-inherit and keeps an explicit alternatives-present bit', async () => {
    const [row] = await db`
      select
        col_description('public.exercise_override_versions'::regclass, (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.exercise_override_versions'::regclass and attname = 'payload'
        )) as payload_comment,
        col_description('public.exercise_override_versions'::regclass, (
          select attnum from pg_catalog.pg_attribute
          where attrelid = 'public.exercise_override_versions'::regclass and attname = 'alternatives_present'
        )) as alternatives_comment
    `;
    expect(row!.payload_comment).toMatch(/null.*inherit/i);
    expect(row!.alternatives_comment).toMatch(/zero child rows.*explicit empty/i);
  });

  it('forces workspace RLS and keeps the coaching-work predicate on both tables', async () => {
    const rows = await db`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity, p.qual
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      left join pg_catalog.pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
      where c.relname in ('exercise_overrides', 'exercise_override_versions')
      order by c.relname
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
      expect(row.qual).toMatch(/has_workspace_access\s*\(\s*(?:[\w"]+\.)?workspace_id\s*,\s*'coaching_work'/i);
    }
  });

  it('does not grant direct DML on override identities or versions', async () => {
    const rows = await db`
      select t.table_name, p.privilege_type,
        has_table_privilege('authenticated', 'public.' || t.table_name, p.privilege_type) as authenticated_granted,
        has_table_privilege('service_role', 'public.' || t.table_name, p.privilege_type) as service_granted
      from (values ('exercise_overrides'), ('exercise_override_versions')) as t(table_name)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(privilege_type)
    `;
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => !row.authenticated_granted && !row.service_granted)).toBe(true);
  });
});
