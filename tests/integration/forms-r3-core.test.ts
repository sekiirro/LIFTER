import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';

const db = sql();
afterAll(() => db.end());

const rollback = new Error('rollback T003 synthetic authorization fixture');

async function makeScope(tx: postgres.TransactionSql) {
  const ids = {
    po: randomUUID(),
    trainer: randomUUID(),
    sales: randomUUID(),
    workspaceA: randomUUID(),
    workspaceB: randomUUID(),
    form: randomUUID(),
  };
  await tx`insert into auth.users(id,email) values
    (${ids.po},${`t003-po-${ids.po}@example.test`}),
    (${ids.trainer},${`t003-trainer-${ids.trainer}@example.test`}),
    (${ids.sales},${`t003-sales-${ids.sales}@example.test`})`;
  await tx`insert into public.staff_profiles(user_id,role,display_name) values
    (${ids.po},'platform_owner','Platform Owner'),(${ids.trainer},'trainer','Trainer'),(${ids.sales},'sales','Sales Staff')`;
  await tx`insert into public.workspaces(id,name,slug,created_by) values
    (${ids.workspaceA},'T003 A',${`t003-a-${ids.workspaceA}`},${ids.po}),
    (${ids.workspaceB},'T003 B',${`t003-b-${ids.workspaceB}`},${ids.po})`;
  await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by) values
    (${ids.workspaceA},${ids.trainer},${ids.po}),
    (${ids.workspaceA},${ids.sales},${ids.po})`;
  return ids;
}

describe('T003 tenant keys and two authorization walls', () => {
  it('uses workspace-composite primary keys and forced RLS for all F15 owner tables', async () => {
    const rows = await db`
      select c.relname, pg_catalog.pg_get_constraintdef(k.oid) as primary_key,
        c.relrowsecurity, c.relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      join pg_catalog.pg_constraint k on k.conrelid=c.oid and k.contype='p'
      where n.nspname='public'
        and c.relname in ('forms','form_versions','form_assignments')
    `;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.primary_key).toMatch(
        /PRIMARY KEY \(workspace_id, (id|form_id, version_number)\)/u,
      );
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }
  });

  it('keeps foreign and nonexistent relation targets indistinguishable through RLS', async () => {
    await expect(
      db.begin(async (tx) => {
        const ids = await makeScope(tx);
        await tx`insert into public.forms(id,workspace_id,name) values
          (${ids.form},${ids.workspaceA},'T003 workspace A'),
          (${ids.form},${ids.workspaceB},'T003 workspace B')`;
        await tx`grant select(id,workspace_id) on public.forms to authenticated`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ids.trainer, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const foreign = await tx`
          select workspace_id,id from public.forms
          where workspace_id=${ids.workspaceB} and id=${ids.form}
        `;
        const missing = await tx`
          select workspace_id,id from public.forms
          where workspace_id=${ids.workspaceB} and id=${randomUUID()}
        `;
        expect(foreign).toEqual([]);
        expect(missing).toEqual(foreign);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('denies revoked members and Sales at the SQL Forms capability wall', async () => {
    await expect(
      db.begin(async (tx) => {
        const ids = await makeScope(tx);
        await tx`update public.workspace_memberships
          set revoked_at=clock_timestamp(), revoked_by=${ids.trainer}
          where workspace_id=${ids.workspaceA} and user_id=${ids.trainer}`;

        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ids.trainer, role: 'authenticated' })},true)`;
        const [revoked] = await tx`
          select app_private.has_workspace_access(${ids.workspaceA},'author_forms') as allowed
        `;
        expect(revoked?.allowed).toBe(false);

        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ids.sales, role: 'authenticated' })},true)`;
        const [sales] = await tx`
          select app_private.has_workspace_access(${ids.workspaceA},'author_forms') as allowed
        `;
        expect(sales?.allowed).toBe(false);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('keeps the RLS denial assertion sensitive to a broadened-policy mutation', async () => {
    let mutantWasKilled = false;
    await expect(
      db.begin(async (tx) => {
        const ids = await makeScope(tx);
        await tx`insert into public.forms(id,workspace_id,name)
          values(${ids.form},${ids.workspaceA},'T003 mutation canary')`;
        await tx`grant select(id,workspace_id) on public.forms to authenticated`;
        await tx.unsafe(`drop policy forms_workspace_scope on public.forms`);
        await tx.unsafe(`create policy forms_workspace_scope on public.forms
          for select to authenticated using (true)`);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ids.sales, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const visible = await tx`select workspace_id,id from public.forms`;
        try {
          expect(visible).toEqual([]);
        } catch {
          mutantWasKilled = true;
        }
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(mutantWasKilled).toBe(true);
  });

  it('leaves final capability positives pending reconciliation', async () => {
    try {
      await db.begin(async (tx) => {
        const ids = await makeScope(tx);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: ids.trainer, role: 'authenticated' })},true)`;
        const [access] = await tx`
          select app_private.has_workspace_access(${ids.workspaceA},'author_forms') as allowed
        `;
        expect(access?.allowed).toBe(true);
        throw rollback;
      });
    } catch (error) {
      if (error === rollback) return;
      throw error;
    }
  });
});
