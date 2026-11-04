import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from './harness';
import postgres from 'postgres';

const db = postgres(loadEnv().dbUrl, { max: 4, connect_timeout: 10 });
afterAll(() => db.end());

const rollback = new Error('T009 synthetic fixture rollback');

it('serializes default retirement with workspace default selection', async () => {
  const [retirement] = await db`
    select pg_get_functiondef('app_private.retire_workspace_form(uuid,uuid,uuid,uuid)'::regprocedure) as definition
  `;
  const [selection] = await db`
    select pg_get_functiondef('app_private.set_default_onboarding_form(uuid,uuid,uuid)'::regprocedure) as definition
  `;
  const retirementBody = retirement!.definition as string;
  const selectionBody = selection!.definition as string;
  const retirementDefaultLock = retirementBody.indexOf(
    'f15-default-onboarding:',
  );
  const retirementSelectedDefaultCheck = retirementBody.indexOf(
    'from public.workspace_default_onboarding_forms',
  );
  expect(retirementDefaultLock).toBeGreaterThan(-1);
  expect(retirementDefaultLock).toBeLessThan(retirementSelectedDefaultCheck);
  expect(selectionBody).toContain('f15-default-onboarding:');
});

async function workspace(tx: postgres.TransactionSql) {
  const actor = randomUUID();
  const workspaceId = randomUUID();
  await tx`insert into auth.users(id,email) values
    (${actor},${`f15-default-${actor}@example.test`})`;
  await tx`insert into public.staff_profiles(user_id,role)
    values(${actor},'workspace_owner')`;
  await tx`insert into public.workspaces(id,name,slug,created_by)
    values(${workspaceId},'Default form fixture',${`f15-default-${workspaceId}`},${actor})`;
  await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
    values(${workspaceId},${actor},${actor})`;
  return { actor, workspaceId };
}

describe('T006/T009 persisted onboarding default', () => {
  it('stores one workspace-scoped default with forced RLS and no direct grants', async () => {
    const rows = await db`
      select c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('authenticated',c.oid,'select') as direct_select
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='workspace_default_onboarding_forms'
    `;
    expect(rows).toEqual([
      { relrowsecurity: true, relforcerowsecurity: true, direct_select: false },
    ]);
    const constraints = await db`
      select pg_catalog.pg_get_constraintdef(c.oid) as definition
      from pg_catalog.pg_constraint c
      where c.conrelid='public.workspace_default_onboarding_forms'::regclass
        and c.contype='p'
    `;
    expect(constraints[0]?.definition).toBe('PRIMARY KEY (workspace_id)');
  });

  it('lazily provisions one ordinary draft with sourced editable S14 starter content', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const first = await tx`
        select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
      `;
        const second = await tx`
        select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
      `;
        expect(first[0]?.form_id).toBe(second[0]?.form_id);
        const rows = await tx`
        select f.name, v.status, jsonb_array_length(v.definition->'sections') as sections,
          jsonb_array_length(v.definition->'questions') > 0 as has_questions,
          v.definition->>'copyStatus' as copy_status,
          v.terms_policy_version
        from public.forms f join public.form_versions v
          on v.workspace_id=f.workspace_id and v.form_id=f.id
        where f.workspace_id=${fixture.workspaceId} and f.id=${first[0]!.form_id}
      `;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          name: 'Your First Step',
          status: 'draft',
          sections: 3,
          has_questions: true,
          copy_status: 'draft',
        });
        expect(rows[0]?.terms_policy_version).toBe(
          'f15-terms-s14-draft-2026-10-30',
        );
        const count = await tx`
        select count(*)::int as count from public.workspace_default_onboarding_forms
        where workspace_id=${fixture.workspaceId}
      `;
        expect(count[0]?.count).toBe(1);
        const audit = await tx`
        select details from public.audit_events
        where workspace_id=${fixture.workspaceId}
          and action='form.default_onboarding_provisioned'
      `;
        expect(audit).toHaveLength(1);
        expect(Object.keys(audit[0]!.details).sort()).toEqual([
          'form_id',
          'version_number',
        ]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('serializes concurrent first reads and records one durable provisioning marker', async () => {
    const fixture = await db.begin(async (tx) => workspace(tx));
    try {
      const provision = () =>
        db.begin(async (tx) => {
          const rows = await tx`
            select app_private.ensure_default_onboarding_form(
              ${fixture.workspaceId},${fixture.actor}
            ) as form_id`;
          return rows[0]?.form_id;
        });
      const [first, second] = await Promise.all([provision(), provision()]);
      expect(first).toBeTruthy();
      expect(first).toBe(second);
      const counts = await db`
        select
          (select count(*)::int from public.workspace_default_onboarding_forms
            where workspace_id=${fixture.workspaceId}) as designations,
          (select count(*)::int from app_private.workspace_onboarding_provisioning
            where workspace_id=${fixture.workspaceId}) as markers,
          (select count(*)::int from public.forms where workspace_id=${fixture.workspaceId}) as forms`;
      expect(counts[0]).toEqual({ designations: 1, markers: 1, forms: 1 });
    } finally {
      await db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`delete from public.audit_events where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}`;
        await tx`delete from app_private.workspace_onboarding_provisioning where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.form_versions where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.forms where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.workspace_memberships where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.workspaces where id=${fixture.workspaceId}`;
        await tx`delete from public.staff_profiles where user_id=${fixture.actor}`;
        await tx`delete from auth.users where id=${fixture.actor}`;
      });
    }
  });

  it('returns a generic configuration error after a provisioned designation and form disappear', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const initial = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id`;
        const firstFormId = initial[0]!.form_id;
        await tx`delete from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}`;
        await tx`delete from public.form_versions where workspace_id=${fixture.workspaceId} and form_id=${firstFormId}`;
        await tx`delete from public.forms where workspace_id=${fixture.workspaceId} and id=${firstFormId}`;

        const before =
          await tx`select count(*)::int as count from public.forms where workspace_id=${fixture.workspaceId}`;
        const state =
          await tx`select app_private.resolve_default_onboarding_configuration(
          ${fixture.workspaceId},${fixture.actor}) as result`;
        const stillNoDefault =
          await tx`select count(*)::int as count from public.workspace_default_onboarding_forms
          where workspace_id=${fixture.workspaceId}`;
        const after =
          await tx`select count(*)::int as count from public.forms where workspace_id=${fixture.workspaceId}`;
        const marker =
          await tx`select first_form_id from app_private.workspace_onboarding_provisioning
          where workspace_id=${fixture.workspaceId}`;
        expect(state[0]?.result).toEqual({
          status: 'configuration_error',
          errorCode: 'onboarding_default_configuration',
        });
        expect(marker).toEqual([{ first_form_id: firstFormId }]);
        expect(stillNoDefault[0]?.count).toBe(0);
        expect(after).toEqual(before);
        expect(after[0]?.count).toBe(0);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it.each(['retired', 'cross-workspace'] as const)(
    'returns a generic configuration error without re-pointing a %s designation',
    async (invalidKind) => {
      await expect(
        db.begin(async (tx) => {
          const fixture = await workspace(tx);
          const other = await workspace(tx);
          const first =
            await tx`select app_private.ensure_default_onboarding_form(
            ${fixture.workspaceId},${fixture.actor}) as form_id`;
          const second =
            await tx`select app_private.ensure_default_onboarding_form(
            ${other.workspaceId},${other.actor}) as form_id`;
          let invalidId = first[0]!.form_id;
          if (invalidKind === 'retired') {
            await tx`update public.form_versions set status='retired'
              where workspace_id=${fixture.workspaceId} and form_id=${invalidId}`;
          } else {
            await tx`set local session_replication_role = replica`;
            await tx`update public.workspace_default_onboarding_forms
              set form_id=${second[0]!.form_id} where workspace_id=${fixture.workspaceId}`;
            await tx`set local session_replication_role = origin`;
            invalidId = second[0]!.form_id;
          }
          const beforeForms =
            await tx`select count(*)::int as count from public.forms
            where workspace_id in (${fixture.workspaceId},${other.workspaceId})`;
          const state =
            await tx`select app_private.resolve_default_onboarding_configuration(
            ${fixture.workspaceId},${fixture.actor}) as result`;
          const designation =
            await tx`select form_id from public.workspace_default_onboarding_forms
            where workspace_id=${fixture.workspaceId}`;
          const afterForms =
            await tx`select count(*)::int as count from public.forms
            where workspace_id in (${fixture.workspaceId},${other.workspaceId})`;
          expect(state[0]?.result).toEqual({
            status: 'configuration_error',
            errorCode: 'onboarding_default_configuration',
          });
          expect(designation).toEqual([{ form_id: invalidId }]);
          expect(afterForms).toEqual(beforeForms);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    },
  );

  it('clears configuration error by authorized internal selection and records the correction audit', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        await tx`select app_private.ensure_default_onboarding_form(
          ${fixture.workspaceId},${fixture.actor})`;
        await tx`delete from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}`;
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Corrected default')`;
        await tx`insert into public.form_versions(workspace_id,form_id,version_number,
          terms_policy_version,definition,status) values(${fixture.workspaceId},${replacement},1,
          'f15-terms-s14-draft-2026-10-30',${tx.json({ title: { en: 'Corrected default', ar: '' }, sections: [], questions: [] })},'draft')`;
        const changed = await tx`select app_private.set_default_onboarding_form(
          ${fixture.workspaceId},${replacement},${fixture.actor}) as changed`;
        const state =
          await tx`select app_private.resolve_default_onboarding_configuration(
          ${fixture.workspaceId},${fixture.actor}) as result`;
        const audit = await tx`select action,details from public.audit_events
          where workspace_id=${fixture.workspaceId} and action='form.default_onboarding_selected'`;
        expect(changed[0]?.changed).toBe(true);
        expect(state[0]?.result).toEqual({ status: 'ok', formId: replacement });
        expect(audit).toHaveLength(1);
        expect(audit[0]?.details).toEqual({
          previous_form_id: null,
          form_id: replacement,
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('does not silently replace a retired designated default', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const selected = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const formId = selected[0]!.form_id;
        await tx`update public.form_versions set status='retired'
          where workspace_id=${fixture.workspaceId} and form_id=${formId}`;
        const stillSelected = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        expect(stillSelected[0]?.form_id).toBeNull();
        const state =
          await tx`select app_private.resolve_default_onboarding_configuration(
          ${fixture.workspaceId},${fixture.actor}) as result`;
        expect(state[0]?.result).toEqual({
          status: 'configuration_error',
          errorCode: 'onboarding_default_configuration',
        });
        const latest = await tx`select status from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${formId}
          order by version_number desc limit 1`;
        expect(latest[0]?.status).toBe('retired');
        const forms =
          await tx`select count(*)::int as count from public.forms where workspace_id=${fixture.workspaceId}`;
        expect(forms[0]?.count).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('reads a retired designation as a generic configuration error (pending T049 author_forms)', async () => {
    await db
      .begin(async (tx) => {
        const fixture = await workspace(tx);
        const selected = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const formId = selected[0]!.form_id;
        await tx`update public.form_versions set status='retired'
          where workspace_id=${fixture.workspaceId} and form_id=${formId}`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const result =
          await tx`select public.get_staff_forms(${fixture.workspaceId}) as result`;
        expect(result[0]?.result).toMatchObject({
          status: 'configuration_error',
          errorCode: 'onboarding_default_configuration',
          defaultOnboardingFormId: null,
        });
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('rejects retiring the selected onboarding form until a replacement is chosen', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const current = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const result = await tx`
          select app_private.retire_workspace_form(${fixture.workspaceId},${current[0]!.form_id},${randomUUID()},${fixture.actor}) as result
        `;
        expect(result[0]?.result).toEqual({ status: 'default_selected' });
        const status = await tx`select status from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${current[0]!.form_id}`;
        expect(status[0]?.status).toBe('draft');
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Selected before retirement')`;
        await tx`insert into public.form_versions(
            workspace_id,form_id,version_number,terms_policy_version,definition,status
          ) values(
            ${fixture.workspaceId},${replacement},1,'f15-terms-s14-draft-2026-10-30',
            ${tx.json({ title: { en: 'Replacement', ar: '' }, sections: [], questions: [] })},'draft'
          )`;
        const selected = await tx`
          select app_private.set_default_onboarding_form(${fixture.workspaceId},${replacement},${fixture.actor}) as changed`;
        expect(selected[0]?.changed).toBe(true);
        const retireAfterSelection = await tx`
          select app_private.retire_workspace_form(${fixture.workspaceId},${current[0]!.form_id},${randomUUID()},${fixture.actor}) as result`;
        expect(retireAfterSelection[0]?.result).toEqual({
          status: 'ok',
          formId: current[0]!.form_id,
          revision: 1,
          formStatus: 'retired',
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('corrects a missing designation through authorized Workspace Owner and Platform Owner selection (pending T049)', async () => {
    await db
      .begin(async (tx) => {
        const fixture = await workspace(tx);
        const form = await tx`
        select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
      `;
        const platformOwner = randomUUID();
        await tx`insert into auth.users(id,email) values
          (${platformOwner},${`f15-default-po-${platformOwner}@example.test`})`;
        await tx`insert into public.staff_profiles(user_id,role)
          values(${platformOwner},'platform_owner')`;
        await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
          values(${fixture.workspaceId},${platformOwner},${fixture.actor})`;
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Synthetic selected form')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${fixture.workspaceId},${replacement},1,'f15-terms-s14-draft-2026-10-30',${tx.json({ title: { en: 'Synthetic selected form', ar: '' }, sections: [], questions: [] })},'draft')
        `;
        await tx`delete from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const result = await tx`
        select public.select_default_onboarding_form(${fixture.workspaceId},${replacement}) as result
      `;
        expect(result[0]?.result).toEqual({ status: 'ok' });
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: platformOwner, role: 'authenticated' })},true)`;
        const poResult = await tx`
          select public.select_default_onboarding_form(${fixture.workspaceId},${form[0]!.form_id}) as result
        `;
        expect(poResult[0]?.result).toEqual({ status: 'ok' });
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('loads Forms and lazily provisions the default through author_forms (pending T049)', async () => {
    await db
      .begin(async (tx) => {
        const fixture = await workspace(tx);
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const result = await tx`
        select public.get_staff_forms(${fixture.workspaceId}) as result
      `;
        expect(result[0]?.result.status).toBe('ok');
        expect(result[0]?.result.forms[0]).toMatchObject({
          title: { en: 'Your First Step' },
          sections: expect.any(Array),
          questions: expect.any(Array),
          deadlineDays: 3,
          status: 'draft',
        });
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('denies Sales and unknown callers and rejects a missing or retired target', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const current = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const retired = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${retired},${fixture.workspaceId},'Synthetic retired form')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${fixture.workspaceId},${retired},1,'f15-terms-s14-draft-2026-10-30',${tx.json({ title: { en: 'Synthetic retired form', ar: '' }, sections: [], questions: [] })},'retired')
        `;
        const retiredSelection = await tx`
          select app_private.set_default_onboarding_form(${fixture.workspaceId},${retired},${fixture.actor}) as changed
        `;
        const missingSelection = await tx`
          select app_private.set_default_onboarding_form(${fixture.workspaceId},${randomUUID()},${fixture.actor}) as changed
        `;
        expect(retiredSelection[0]?.changed).toBe(false);
        expect(missingSelection[0]?.changed).toBe(false);
        const pointer = await tx`
          select form_id from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}
        `;
        expect(pointer[0]?.form_id).toBe(current[0]?.form_id);
        const unknown = randomUUID();
        await tx`insert into auth.users(id,email) values
        (${unknown},${`f15-default-unknown-${unknown}@example.test`})`;
        await tx`update public.staff_profiles set role='sales' where user_id=${fixture.actor}`;
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.actor, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const denied = await tx`
        select public.select_default_onboarding_form(${fixture.workspaceId},${randomUUID()}) as result
      `;
        expect(denied[0]?.result).toBeNull();
        const deniedList = await tx`
        select public.get_staff_forms(${fixture.workspaceId}) as result
      `;
        expect(deniedList[0]?.result).toBeNull();
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: unknown, role: 'authenticated' })},true)`;
        const unknownResult = await tx`
        select public.select_default_onboarding_form(${fixture.workspaceId},${randomUUID()}) as result
      `;
        expect(unknownResult[0]?.result).toBeNull();
        const unknownList = await tx`
        select public.get_staff_forms(${fixture.workspaceId}) as result
      `;
        expect(unknownList[0]?.result).toBeNull();
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('rolls back the provisioned form and pointer when the IDs-only audit append fails', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        await tx.unsafe(`create function app_private.f15_test_reject_default_audit() returns trigger
        language plpgsql set search_path='' as $$ begin
          if new.action='form.default_onboarding_provisioned' then
            raise exception 'synthetic audit failure';
          end if;
          return new;
        end $$`);
        await tx.unsafe(`create trigger f15_test_reject_default_audit before insert on public.audit_events
        for each row execute function app_private.f15_test_reject_default_audit()`);
        await expect(
          tx.savepoint(
            (sp) => sp`
        select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor})
      `,
          ),
        ).rejects.toThrow();
        const counts = await tx`
        select (select count(*)::int from public.forms where workspace_id=${fixture.workspaceId}) as forms,
          (select count(*)::int from public.workspace_default_onboarding_forms where workspace_id=${fixture.workspaceId}) as defaults
      `;
        expect(counts[0]).toEqual({ forms: 0, defaults: 0 });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('rolls back a selection pointer when its audit append fails', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const current = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Synthetic replacement')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${fixture.workspaceId},${replacement},1,'f15-terms-s14-draft-2026-10-30',${tx.json({ title: { en: 'Replacement', ar: '' }, sections: [], questions: [] })},'draft')
        `;
        await tx.unsafe(`create function app_private.f15_test_reject_selection_audit() returns trigger
          language plpgsql set search_path='' as $$ begin
            if new.action='form.default_onboarding_selected' then
              raise exception 'synthetic selection audit failure';
            end if;
            return new;
          end $$`);
        await tx.unsafe(`create trigger f15_test_reject_selection_audit before insert on public.audit_events
          for each row execute function app_private.f15_test_reject_selection_audit()`);
        await expect(
          tx.savepoint(
            (sp) =>
              sp`select app_private.set_default_onboarding_form(${fixture.workspaceId},${replacement},${fixture.actor})`,
          ),
        ).rejects.toThrow();
        const pointer = await tx`
          select form_id from public.workspace_default_onboarding_forms
          where workspace_id=${fixture.workspaceId}
        `;
        expect(pointer[0]?.form_id).toBe(current[0]?.form_id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('changes only the default pointer and preserves every version definition', async () => {
    await expect(
      db.begin(async (tx) => {
        const fixture = await workspace(tx);
        const current = await tx`
          select app_private.ensure_default_onboarding_form(${fixture.workspaceId},${fixture.actor}) as form_id
        `;
        const originalVersions = await tx`
          select version_number,definition from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${current[0]!.form_id}
          order by version_number
        `;
        const replacement = randomUUID();
        await tx`insert into public.forms(id,workspace_id,name)
          values(${replacement},${fixture.workspaceId},'Synthetic replacement')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${fixture.workspaceId},${replacement},1,'f15-terms-s14-draft-2026-10-30',${tx.json({ title: { en: 'Replacement', ar: '' }, sections: [], questions: [] })},'draft')
        `;
        const changed = await tx`
          select app_private.set_default_onboarding_form(${fixture.workspaceId},${replacement},${fixture.actor}) as changed
        `;
        expect(changed[0]?.changed).toBe(true);
        const afterVersions = await tx`
          select version_number,definition from public.form_versions
          where workspace_id=${fixture.workspaceId} and form_id=${current[0]!.form_id}
          order by version_number
        `;
        expect(afterVersions).toEqual(originalVersions);
        const pointer = await tx`
          select form_id from public.workspace_default_onboarding_forms
          where workspace_id=${fixture.workspaceId}
        `;
        expect(pointer[0]?.form_id).toBe(replacement);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
