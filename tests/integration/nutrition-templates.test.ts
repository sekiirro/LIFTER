import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
type Tx = postgres.TransactionSql;
let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});
afterAll(async () => db.end());

async function asActor<T>(tx: Tx, id: string, body: () => Promise<T>) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: 'authenticated' })}, true)`;
  return body();
}

describe('F18 nutrition template storage isolation', () => {
  it('keeps global tables platform-scoped and workspace tables tenant-scoped', async () => {
    const names = [
      'nutrition_global_templates',
      'nutrition_global_template_versions',
      'nutrition_workspace_templates',
      'nutrition_workspace_template_versions',
    ];
    const relations = await db`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_catalog.pg_class c
      where c.relnamespace='public'::regnamespace and c.relname=any(${names})
    `;
    expect(relations).toHaveLength(names.length);
    expect(relations.every((row) => row.enabled && row.forced)).toBe(true);

    const policies = await db`
      select tablename, cmd, qual
      from pg_catalog.pg_policies
      where schemaname='public' and tablename=any(${names})
    `;
    for (const table of [
      'nutrition_global_templates',
      'nutrition_global_template_versions',
    ]) {
      const global = policies.filter((row) => row.tablename === table);
      expect(global).toHaveLength(1);
      expect(global[0]?.cmd).toBe('SELECT');
      expect(global[0]?.qual).toContain('is_platform_owner');
      expect(global[0]?.qual).not.toContain('has_workspace_access');
    }
    for (const table of [
      'nutrition_workspace_templates',
      'nutrition_workspace_template_versions',
    ]) {
      const scoped = policies.filter((row) => row.tablename === table);
      expect(scoped).toHaveLength(1);
      expect(scoped[0]?.cmd).toBe('SELECT');
      expect(scoped[0]?.qual).toMatch(
        /has_workspace_access\([^)]*workspace_id, 'coaching_work'/,
      );
    }
  });

  it('denies workspace access to global content and cross-workspace content', async () => {
    const globalId = randomUUID();
    const templateId = randomUUID();
    const marker = 'rollback_nutrition_template_fixture';
    try {
      await db.begin(async (tx) => {
        await tx`insert into public.nutrition_global_templates(id,created_by,current_version)
          values (${globalId},${f.po.userId},1)`;
        await tx`insert into public.nutrition_global_template_versions(template_id,version,document,schema_version,created_by)
          values (${globalId},1,'{"marker":"global"}'::jsonb,1,${f.po.userId})`;
        await tx`insert into public.nutrition_workspace_templates(workspace_id,id,created_by,current_version,display_name)
          values (${f.wsA.id},${templateId},${f.trainerA.userId},1,'A private template')`;
        await tx`insert into public.nutrition_workspace_template_versions(workspace_id,template_id,version,document,schema_version,created_by)
          values (${f.wsA.id},${templateId},1,'{"marker":"workspace-a"}'::jsonb,1,${f.trainerA.userId})`;

        await asActor(tx, f.trainerB.userId, async () => {
          await expect(
            tx`select id from public.nutrition_global_templates where id=${globalId}`,
          ).resolves.toEqual([]);
          await expect(
            tx`select template_id from public.nutrition_global_template_versions where template_id=${globalId}`,
          ).resolves.toEqual([]);
          await expect(
            tx`select id from public.nutrition_workspace_templates where id=${templateId}`,
          ).resolves.toEqual([]);
          await expect(
            tx`select template_id from public.nutrition_workspace_template_versions where template_id=${templateId}`,
          ).resolves.toEqual([]);
        });

        await asActor(tx, f.trainerA.userId, async () => {
          await expect(
            tx`select id from public.nutrition_global_templates where id=${globalId}`,
          ).resolves.toEqual([]);
          await expect(
            tx`select document from public.nutrition_workspace_template_versions where workspace_id=${f.wsA.id} and template_id=${templateId}`,
          ).resolves.toEqual([{ document: { marker: 'workspace-a' } }]);
          await expect(
            tx`update public.nutrition_workspace_template_versions set document='{"changed":true}' where workspace_id=${f.wsA.id} and template_id=${templateId}`,
          ).rejects.toMatchObject({ code: '42501' });
        });
        throw new Error(marker);
      });
    } catch (error) {
      if ((error as Error).message !== marker) throw error;
    }
  });

  it('enforces composite tenant foreign keys and immutable version privileges', async () => {
    const constraints = await db`
      select c.conname, pg_catalog.pg_get_constraintdef(c.oid) as definition
      from pg_catalog.pg_constraint c
      where c.conrelid='public.nutrition_workspace_template_versions'::regclass
    `;
    expect(
      constraints.some((row) =>
        row.definition.includes('(workspace_id, template_id)'),
      ),
    ).toBe(true);
    const privilege = await db`
      select has_table_privilege('authenticated','public.nutrition_global_templates','insert') as global_insert,
        has_table_privilege('authenticated','public.nutrition_global_template_versions','update') as global_version_update,
        has_table_privilege('authenticated','public.nutrition_workspace_template_versions','update') as workspace_version_update
    `;
    expect(privilege).toEqual([
      {
        global_insert: false,
        global_version_update: false,
        workspace_version_update: false,
      },
    ]);
  });
});
