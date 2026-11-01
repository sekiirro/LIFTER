import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createStaff } from './harness';
import {
  clientContext,
  registered,
  request,
  sqlCall,
} from './registration-approval-operations-fixture';

const db = postgres(process.env.DB_URL ?? '', { max: 1, connect_timeout: 10 });
afterAll(() => db.end());

function hasAuditBeforeAnswer(body: string) {
  const audit = body.indexOf('insert into public.audit_events');
  const answer = body.lastIndexOf('return answer_result');
  return audit >= 0 && answer > audit;
}

describe('T004 single audited answer reader', () => {
  it('routes current, draft, and history through the single mode-aware reader', async () => {
    const [reader] = await db`
      select p.prosrc as body, pg_catalog.pg_get_function_arguments(p.oid) as args
      from pg_catalog.pg_proc p
      where p.oid=to_regprocedure('public.read_form_answer(uuid,uuid,text)')
    `;

    expect(reader).toBeDefined();
    if (!reader) throw new Error('mode-aware audited reader is missing');
    expect(reader.args).toContain('p_view text');
    expect(reader.body).toMatch(/current|latest/iu);
    expect(reader.body).toContain('form_answer_drafts');
    expect(reader.body).toContain('form_answer_revisions');
    expect(reader.body).toContain('form.answer_viewed');
    const audit = reader.body.indexOf('insert into public.audit_events');
    const dataReturn = reader.body.lastIndexOf('return answer_result');
    expect(hasAuditBeforeAnswer(reader.body)).toBe(true);
    expect(dataReturn).toBeGreaterThan(audit);
    expect(reader.body.slice(audit, dataReturn)).not.toMatch(
      /answer_values|answer_result/iu,
    );

    const mutant = reader.body.replace(
      /insert into public\.audit_events[\s\S]*?\);\s*/u,
      '',
    );
    expect(hasAuditBeforeAnswer(mutant)).toBe(false);
  });

  it('has no callable unaudited public RPC that reads answer data', async () => {
    const callableReaders = await db`
      select p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.oid not in (
          to_regprocedure('public.read_form_answer(uuid,uuid)'),
          to_regprocedure('public.read_form_answer(uuid,uuid,text)')
        )
        and p.prosrc ilike '%form_answer_revisions%'
        and (p.prosrc ilike '%answer_values%' or p.prosrc ilike '%form_answer_drafts%')
        and p.proname not in ('save_form_draft', 'submit_form_assignment', 'correct_form_answer')
        and has_function_privilege('authenticated',p.oid,'execute')
    `;

    expect(callableReaders).toEqual([]);
  });

  it('serves current, draft, and history through the reader for Client, Trainer, WO, and PO only', async () => {
    const context = await clientContext();
    const client = await registered(context);
    const formId = randomUUID();
    const assignmentId = randomUUID();
    const policy = `t004-${randomUUID()}`;
    const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
    const firstAnswers = { q1: 'first synthetic revision' };
    const secondAnswers = { q1: 'second synthetic revision' };
    const draftAnswers = { q1: 'synthetic draft' };
    const rollback = new Error('rollback T004 role reader fixture');

    await expect(
      db.begin(async (tx) => {
        expect(
          (
            await sqlCall(
              tx,
              context.po.userId,
              'approve',
              request(context, client),
            )
          ).status,
        ).toBe('ok');
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        await tx`insert into public.forms(id,workspace_id,name)
          values(${formId},${context.wsA.id},'T004 reader matrix')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${context.wsA.id},${formId},1,${policy},${tx.json(definition)},'published')
        `;
        await tx`
          insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
          values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${tx.json(definition)})
        `;
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values
            (${context.wsA.id},${assignmentId},1,${tx.json(firstAnswers)}),
            (${context.wsA.id},${assignmentId},2,${tx.json(secondAnswers)})
        `;
        await tx`
          insert into public.form_answer_drafts(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignmentId},2,${tx.json(draftAnswers)})
        `;

        const actors = [
          { label: 'Client', userId: client.userId, allowed: true },
          { label: 'Trainer', userId: context.trainerA.userId, allowed: true },
          { label: 'WO', userId: context.woA.userId, allowed: true },
          { label: 'PO', userId: context.po.userId, allowed: true },
          { label: 'Sales', userId: context.salesA.userId, allowed: false },
        ];
        for (const actor of actors) {
          for (const view of ['current', 'draft', 'history'] as const) {
            await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor.userId, role: 'authenticated' })},true)`;
            await tx`set local role authenticated`;
            const [row] = await tx`
              select public.read_form_answer(${context.wsA.id},${assignmentId},${view}) as answer
            `;
            await tx`reset role`;
            if (!actor.allowed) {
              expect(row?.answer, `${actor.label} ${view} must deny`).toBeNull();
            } else if (view === 'current') {
              expect(row?.answer, `${actor.label} ${view}`).toEqual(secondAnswers);
            } else if (view === 'draft') {
              expect(row?.answer, `${actor.label} ${view}`).toEqual(draftAnswers);
            } else {
              expect(row?.answer, `${actor.label} ${view}`).toEqual([
                { revision: 1, answers: firstAnswers },
                { revision: 2, answers: secondAnswers },
              ]);
            }
          }
        }
        expect(
          await tx`select count(*)::int as count from public.audit_events
            where action='form.answer_viewed' and target_id=${assignmentId}`,
        ).toEqual([{ count: 12 }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('returns zero answer bytes when the audit append fails', async () => {
    const context = await clientContext();
    const client = await registered(context);
    const trainer = await createStaff('trainer', 't004-audit-failure');
    const formId = randomUUID();
    const assignmentId = randomUUID();
    const policy = `t004-${randomUUID()}`;
    const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
    const answers = { q1: 'T004-SYNTHETIC-ANSWER-CANARY' };
    const rollback = new Error('rollback T004 audited-reader fixture');
    const triggerFunction = `t004_fail_answer_audit_${randomUUID().replaceAll('-', '')}`;

    await expect(
      db.begin(async (tx) => {
        expect(
          (
            await sqlCall(
              tx,
              context.po.userId,
              'approve',
              request(context, client),
            )
          ).status,
        ).toBe('ok');
        await tx`
          insert into public.workspace_memberships(workspace_id,user_id,granted_by)
          values(${context.wsA.id},${trainer.userId},${context.po.userId})
        `;
        await tx`
          insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${policy},'terms','published')
        `;
        await tx`insert into public.forms(id,workspace_id,name)
          values(${formId},${context.wsA.id},'T004 synthetic reader')`;
        await tx`
          insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
          values(${context.wsA.id},${formId},1,${policy},${tx.json(definition)},'published')
        `;
        await tx`
          insert into public.form_assignments(id,workspace_id,client_id,form_id,version_number,terms_policy_version,version_snapshot)
          values(${assignmentId},${context.wsA.id},${client.id},${formId},1,${policy},${tx.json(definition)})
        `;
        await tx`
          insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
          values(${context.wsA.id},${assignmentId},1,${tx.json(answers)})
        `;

        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: trainer.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [successfulRead] = await tx`
          select public.read_form_answer(${context.wsA.id},${assignmentId},'current') as answer
        `;
        expect(successfulRead?.answer).toEqual(answers);
        await tx`reset role`;
        const [auditCount] = await tx`
          select count(*)::int as count from public.audit_events
          where action='form.answer_viewed' and target_id=${assignmentId}
        `;
        expect(auditCount?.count).toBe(1);

        await tx.unsafe(`create function app_private.${triggerFunction}() returns trigger
          language plpgsql set search_path = '' as $$ begin
            if new.action='form.answer_viewed' then raise exception 'synthetic read audit unavailable'; end if;
            return new;
          end $$`);
        await tx.unsafe(`create trigger ${triggerFunction}
          before insert on public.audit_events for each row
          execute function app_private.${triggerFunction}()`);

        let returnedAnswer: unknown;
        await expect(
          tx.savepoint(async (sp) => {
            await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: trainer.userId, role: 'authenticated' })},true)`;
            await sp`set local role authenticated`;
            const [result] = await sp`
              select public.read_form_answer(${context.wsA.id},${assignmentId},'current') as answer
            `;
            returnedAnswer = result?.answer;
          }),
        ).rejects.toThrow('synthetic read audit unavailable');
        expect(returnedAnswer).toBeUndefined();
        expect(JSON.stringify(returnedAnswer ?? null)).not.toContain(
          'T004-SYNTHETIC-ANSWER-CANARY',
        );
        expect(
          await tx`select count(*)::int as count from public.audit_events
            where action='form.answer_viewed' and target_id=${assignmentId}`,
        ).toEqual([{ count: 1 }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
