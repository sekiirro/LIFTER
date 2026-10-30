import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { clientContext, pending } from './client-accounts-fixture';
import { sql } from './harness';

const db = sql();

afterAll(() => db.end());

describe('T047 forms persistence', () => {
  it('creates tenant-scoped form, version, and assignment relations with forced RLS', async () => {
    const rows = await db`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        not has_table_privilege('authenticated',c.oid,'select') as direct_select_denied
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('forms', 'form_versions', 'form_assignments')
    `;

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relname: 'forms',
          relrowsecurity: true,
          relforcerowsecurity: true,
          direct_select_denied: true,
        }),
        expect.objectContaining({
          relname: 'form_versions',
          relrowsecurity: true,
          relforcerowsecurity: true,
          direct_select_denied: true,
        }),
        expect.objectContaining({
          relname: 'form_assignments',
          relrowsecurity: true,
          relforcerowsecurity: true,
          direct_select_denied: true,
        }),
      ]),
    );
  });

  it('keeps the PO, WO, and Trainer assignment capability in parity and denies Sales/unknown', async () => {
    const rows = await db`
      select role::text as role,
        app_private.role_has_capability(role,'assign_intake_form') as allowed,
        app_private.role_has_capability(role,'unknown_forms_capability') as unknown_allowed
      from unnest(enum_range(null::public.staff_role)) role
    `;

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'platform_owner',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'workspace_owner',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'trainer',
          allowed: true,
          unknown_allowed: false,
        }),
        expect.objectContaining({
          role: 'sales',
          allowed: false,
          unknown_allowed: false,
        }),
      ]),
    );
  });

  it('binds each form version to the current published T&C policy without seeding copy', async () => {
    const version = `s17-synthetic-${randomUUID()}`;
    const { wsA } = await clientContext();
    const workspace = wsA.id;
    const form = randomUUID();
    const definition = {
      n7: { minMeals: 2, maxMeals: 5, derivedTiming: true },
      n12: { seriesBySex: { male: 'standard-male', female: 'female' } },
    };
    const rollback = new Error('synthetic policy fixture rollback');

    await expect(
      db.begin(async (tx) => {
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${version},'terms','published')
        `;
        await tx`
          insert into public.forms(id,workspace_id,name)
          values(${form},${workspace},'Synthetic Intake')
        `;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${workspace},${form},1,${version},${tx.json(definition)},'published')
        `;
        const rows = await tx`
          select terms_policy_version, definition
          from public.form_versions
          where workspace_id=${workspace} and form_id=${form} and version_number=1
        `;
        expect(rows[0]?.terms_policy_version).toBe(version);
        expect(rows[0]?.definition).toEqual(definition);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('keeps the canonical T&C seed in DRAFT until an explicit synthetic fixture is published', async () => {
    const rows = await db`
      select status
      from app_private.terms_policy_versions
      where version='f15-terms-s14-draft-2026-10-30' and policy_kind='terms'
    `;
    expect(rows).toEqual([{ status: 'draft' }]);
  });

  it('rejects edits to published versions and cross-workspace assignment versions', async () => {
    const first = await clientContext();
    const second = await clientContext();
    const policy = `s17-synthetic-${randomUUID()}`;
    const form = randomUUID();
    const definition = {
      n7: { minMeals: 2, maxMeals: 5 },
      n12: { seriesBySex: { male: 'standard-male', female: 'female' } },
    };
    const rollback = new Error('synthetic persistence fixture rollback');

    await expect(
      db.begin(async (tx) => {
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        await tx`
          insert into public.forms(id,workspace_id,name)
          values(${form},${first.wsA.id},'Synthetic Intake')
        `;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${first.wsA.id},${form},1,${policy},${tx.json(definition)},'published')
        `;
        const ownClient = await pending(tx, first);
        await tx`
          insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
          values(${first.wsA.id},${ownClient.id},${form},1,${policy},${tx.json(definition)})
        `;
        const snapshot = await tx`
          select terms_policy_version,version_snapshot from public.form_assignments
          where workspace_id=${first.wsA.id} and client_id=${ownClient.id} and form_id=${form}
        `;
        expect(snapshot[0]).toEqual({
          terms_policy_version: policy,
          version_snapshot: definition,
        });
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`update public.form_assignments set version_snapshot='{}'::jsonb where workspace_id=${first.wsA.id} and client_id=${ownClient.id} and form_id=${form}`,
          ),
        ).rejects.toThrow();
        const client = await pending(tx, second);
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`
            insert into public.form_assignments(workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
            values(${second.wsA.id},${client.id},${form},1,${policy},${tx.json(definition)})
          `,
          ),
        ).rejects.toThrow();
        const newerPolicy = `s17-synthetic-${randomUUID()}`;
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status,created_at)
          values(${newerPolicy},'terms','published',clock_timestamp()+interval '1 second')
        `;
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`
              insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
              values(${first.wsA.id},${form},2,${policy},${tx.json(definition)},'published')
            `,
          ),
        ).rejects.toThrow();
        await expect(
          tx.savepoint(
            async (sp) =>
              sp`
              update public.form_versions set definition='{}'::jsonb
              where workspace_id=${first.wsA.id} and form_id=${form} and version_number=1
            `,
          ),
        ).rejects.toThrow();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
