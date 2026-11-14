import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from './harness';
import starter from '../../lib/forms/s14-starter-content.json';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('T006 mutation probe rollback');

function validDefinition(charLimit = 150) {
  const value = structuredClone(starter);
  const question = value.questions.find((candidate) => candidate.id === 'B05');
  if (!question)
    throw new Error('The starter short-text fixture is missing B05');
  question.charLimit = charLimit;
  return value;
}

async function fixture(tx: postgres.TransactionSql) {
  const owner = randomUUID();
  const sales = randomUUID();
  const wsA = randomUUID();
  const wsB = randomUUID();
  await tx`insert into auth.users(id,email) values
    (${owner},${`f15-mutant-owner-${owner}@example.test`}),
    (${sales},${`f15-mutant-sales-${sales}@example.test`})`;
  await tx`insert into public.staff_profiles(user_id,role,display_name) values
    (${owner},'workspace_owner','Workspace Owner'),(${sales},'sales','Sales Staff')`;
  await tx`insert into public.workspaces(id,name,slug,created_by) values
    (${wsA},'Mutation A',${`f15-mutant-a-${wsA}`},${owner}),
    (${wsB},'Mutation B',${`f15-mutant-b-${wsB}`},${owner})`;
  await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by) values
    (${wsA},${owner},${owner}),(${wsB},${owner},${owner}),
    (${wsA},${sales},${owner})`;
  const forms = await Promise.all(
    [wsA, wsB].map(async (workspaceId) => {
      const rows = await tx`
        select app_private.ensure_default_onboarding_form(${workspaceId},${owner}) as form_id`;
      return rows[0]!.form_id as string;
    }),
  );
  return { owner, sales, wsA, wsB, formA: forms[0]!, formB: forms[1]! };
}

async function installMutant(
  tx: postgres.TransactionSql,
  signature: string,
  from: string,
  to: string,
) {
  const rows =
    await tx`select pg_catalog.pg_get_functiondef(${signature}::regprocedure) as definition`;
  const original = rows[0]?.definition;
  if (typeof original !== 'string' || !original.includes(from))
    throw new Error(`Mutation target not found: ${signature}`);
  const mutated = original.replace(from, to);
  await tx.unsafe(mutated);
}

async function assertExpectationKillsMutant<T>(
  actual: T,
  expected: T,
): Promise<void> {
  let killed = false;
  try {
    expect(actual).toEqual(expected);
  } catch {
    killed = true;
  }
  expect(killed).toBe(true);
}

describe('T006 persisted Builder mutation probes', () => {
  it('kills an unauthorized author mutant at the Sales-denial assertion', async () => {
    await db
      .begin(async (tx) => {
        const f = await fixture(tx);
        await installMutant(
          tx,
          'public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text)',
          "or not app_private.role_has_capability(actor_role,'author_forms')",
          'or false',
        );
        await installMutant(
          tx,
          'public.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,text)',
          "or not app_private.has_workspace_access(p_workspace_id,'author_forms')",
          'or false',
        );
        // The public wrapper is followed by post-lock checks in the private
        // writer. Remove both layers so this probe still exercises the
        // unauthorized-write mutant after the lock-wait hardening.
        const privateSave =
          'app_private.save_workspace_form_draft(uuid,uuid,integer,jsonb,uuid,uuid,text)';
        for (let i = 0; i < 2; i += 1) {
          await installMutant(
            tx,
            privateSave,
            "or not app_private.role_has_capability(app_private.current_staff_role(),'author_forms')",
            'or false',
          );
          await installMutant(
            tx,
            privateSave,
            "or not app_private.has_workspace_access(p_workspace_id,'author_forms')",
            'or false',
          );
        }
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.sales, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const rows = await tx`
          select public.save_workspace_form_draft(
            ${f.wsA},${f.formA},1,${tx.json(validDefinition())},${randomUUID()},'Your First Step'
          ) as result`;
        await assertExpectationKillsMutant(rows[0]?.result ?? null, null);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('kills a cross-workspace source lookup mutant at the copy-denial assertion', async () => {
    await db
      .begin(async (tx) => {
        const f = await fixture(tx);
        await installMutant(
          tx,
          'app_private.copy_workspace_form(uuid,uuid,uuid,uuid)',
          'where f.workspace_id=p_workspace_id and f.id=p_source_form_id',
          'where f.id=p_source_form_id',
        );
        await installMutant(
          tx,
          'app_private.copy_workspace_form(uuid,uuid,uuid,uuid)',
          'where v.workspace_id=p_workspace_id and v.form_id=p_source_form_id',
          'where v.form_id=p_source_form_id',
        );
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.owner, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const rows = await tx`
          select public.copy_workspace_form(${f.wsA},${f.formB},${randomUUID()}) as result`;
        await assertExpectationKillsMutant(rows[0]?.result, {
          status: 'missing',
        });
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('kills an executable-script extension mutant at the definition assertion', async () => {
    await db
      .begin(async (tx) => {
        await installMutant(
          tx,
          'app_private.f15_valid_builder_definition(jsonb,boolean)',
          'if exists(select 1 from jsonb_object_keys(question) k where k not in (',
          'if false and exists(select 1 from jsonb_object_keys(question) k where k not in (',
        );
        const base = validDefinition();
        const executable = {
          ...base,
          questions: base.questions.map((question, index) =>
            index === 0
              ? { ...question, script: 'javascript:alert(1)' }
              : question,
          ),
        };
        const rows = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(executable)},false) as valid`;
        await assertExpectationKillsMutant(rows[0]?.valid, false);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('kills a conditional-cycle mutant at the definition assertion', async () => {
    await db
      .begin(async (tx) => {
        await installMutant(
          tx,
          'app_private.f15_valid_builder_definition(jsonb,boolean)',
          'if exists(\n    with recursive edges(child,parent) as (',
          'if false and exists(\n    with recursive edges(child,parent) as (',
        );
        const base = validDefinition();
        const cyclic = {
          ...base,
          questions: base.questions.map((question) =>
            question.id === 'B01'
              ? {
                  ...question,
                  when: {
                    mode: 'all',
                    conditions: [{ questionId: 'B02', operator: 'isAnswered' }],
                  },
                }
              : question.id === 'B02'
                ? {
                    ...question,
                    when: {
                      mode: 'all',
                      conditions: [
                        { questionId: 'B01', operator: 'isAnswered' },
                      ],
                    },
                  }
                : question,
          ),
        };
        const rows = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(cyclic)},false) as valid`;
        await assertExpectationKillsMutant(rows[0]?.valid, false);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it('kills a short-text bound mutant at the invalid-definition assertion', async () => {
    await db
      .begin(async (tx) => {
        await installMutant(
          tx,
          'app_private.f15_valid_builder_definition(jsonb,boolean)',
          'not between 1 and 150',
          'not between 1 and 1000',
        );
        const rows = await tx`
          select app_private.f15_valid_builder_definition(${tx.json(validDefinition(151))},false) as valid`;
        await assertExpectationKillsMutant(rows[0]?.valid, false);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });
});
