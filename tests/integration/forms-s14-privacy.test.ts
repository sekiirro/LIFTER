import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { clientContext, pending } from './client-accounts-fixture';
import { sql } from './harness';

const db = sql();

afterAll(() => db.end());

describe('T048 personal-data authorization and erasure', () => {
  it('keeps answer, legal-hold, and counts-only erasure records private under forced RLS', async () => {
    const rows = await db`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
        not has_table_privilege('authenticated',c.oid,'select') as direct_select_denied
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where (n.nspname='public' and c.relname='form_answer_revisions')
        or (n.nspname='app_private' and c.relname in ('form_retention_windows', 'form_legal_holds', 'form_answer_erasure_controls'))
    `;

    expect(rows).toHaveLength(4);
    expect(
      rows.every(
        (row) =>
          row.relrowsecurity &&
          row.relforcerowsecurity &&
          row.direct_select_denied,
      ),
    ).toBe(true);
  });

  it('requires the shared Forms answer-read capability and denies Sales/unknown', async () => {
    const rows = await db`
      select role::text as role,
        app_private.role_has_capability(role,'read_form_answers') as allowed,
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

  it('provides a single audited reader before answer data can be returned', async () => {
    const rows = await db`
      select to_regprocedure('public.read_form_answer(uuid,uuid)') is not null as present,
        p.prosrc as body
      from (select 1) seed
      left join pg_catalog.pg_proc p on p.oid=to_regprocedure('public.read_form_answer(uuid,uuid)')
    `;
    expect(rows[0]?.present).toBe(true);
    const body = rows[0]?.body as string;
    const auditInsert = body.indexOf('insert into public.audit_events');
    const answerReturn = body.indexOf('return revision_row.answer_values');
    expect(auditInsert).toBeGreaterThanOrEqual(0);
    expect(answerReturn).toBeGreaterThan(auditInsert);
    const auditValues = body.slice(
      body.indexOf('values', auditInsert),
      body.indexOf(';', auditInsert),
    );
    expect(auditValues).not.toMatch(/answer_values|sex|answer_text/iu);
  });

  it('defers purge during a legal hold, then deletes answer copies only after day 30', async () => {
    const context = await clientContext();
    const assignment = randomUUID();
    const form = randomUUID();
    const policy = `s17-synthetic-${randomUUID()}`;
    const versionData = {
      n7: { minMeals: 2, maxMeals: 5 },
      n12: { seriesBySex: { male: 'standard-male', female: 'female' } },
    };
    const rollback = new Error('synthetic retention fixture rollback');

    await expect(
      db.begin(async (tx) => {
        const client = await pending(tx, context);
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        await tx`insert into public.forms(id,workspace_id,name) values(${form},${context.wsA.id},'Synthetic Intake')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${context.wsA.id},${form},1,${policy},${tx.json(versionData)},'published')
        `;
        await tx`
          insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
          values(${assignment},${context.wsA.id},${client.id},${form},1,${policy},${tx.json(versionData)})
        `;
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignment},1,${tx.json({ sex: 'female', private_note: 'SYNTHETIC-CANARY' })})
        `;
        await tx`
          insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignment},1,${tx.json({ sex: 'female', private_note: 'SYNTHETIC-CANARY' })})
        `;
        const [window] = await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${context.wsA.id},${client.id},${randomUUID()},'closure',clock_timestamp()-interval '31 days')
          returning id
        `;
        await tx`
          insert into app_private.form_legal_holds(workspace_id,client_id,hold_reference)
          values(${context.wsA.id},${client.id},${randomUUID()})
        `;

        const [held] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(held?.result).toMatchObject({ status: 'deferred_legal_hold' });
        expect(
          await tx`select 1 from public.form_answer_revisions where assignment_id=${assignment}`,
        ).toHaveLength(1);
        expect(
          await tx`select 1 from app_private.form_answer_erasure_controls where outcome='deferred_legal_hold'`,
        ).toHaveLength(1);

        await tx`
          update app_private.form_legal_holds set released_at=clock_timestamp()
          where workspace_id=${context.wsA.id} and client_id=${client.id} and released_at is null
        `;
        const [purged] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(purged?.result).toMatchObject({
          status: 'purged',
          revisions: 1,
          drafts: 1,
        });
        expect(
          await tx`select 1 from public.form_answer_revisions where assignment_id=${assignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select 1 from public.form_answer_drafts where assignment_id=${assignment}`,
        ).toHaveLength(0);
        expect(
          await tx`select 1 from public.form_assignments where id=${assignment}`,
        ).toHaveLength(1);
        const identifiers = await tx`
          select column_name from information_schema.columns
          where table_schema='app_private' and table_name='form_answer_erasure_controls'
            and column_name in ('id','workspace_id','client_id','assignment_id','answer_id')
        `;
        expect(identifiers).toHaveLength(0);
        const [controls] = await tx`
          select bool_and(answer_count is not null and draft_count is not null) as counts_only
          from app_private.form_answer_erasure_controls
        `;
        expect(controls).toEqual({ counts_only: true });
        expect(window?.id).toBeTruthy();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('does not purge before the authoritative 30-day window', async () => {
    const context = await clientContext();
    const rollback = new Error('synthetic retention fixture rollback');
    await expect(
      db.begin(async (tx) => {
        const client = await pending(tx, context);
        await tx`
          insert into app_private.form_retention_windows(workspace_id,client_id,source_event_id,source_kind,ended_at)
          values(${context.wsA.id},${client.id},${randomUUID()},'closure',clock_timestamp()-interval '29 days')
        `;
        const [result] = await tx`
          select app_private.purge_ended_form_answers(${context.wsA.id},${client.id}) as result
        `;
        expect(result?.result).toMatchObject({ status: 'not_due' });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
