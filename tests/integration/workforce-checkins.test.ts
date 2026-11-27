import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { sql } from './harness';
import { clientContext, graph } from './registration-approval-fixture';

const db = sql();
let doubleClick: {
  workspaceId: string;
  clientId: string;
  assignmentId: string;
  trainers: string[];
};
afterAll(() => db.end());

type Tx = TransactionSql;

async function asUser<T>(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<T>,
): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    const result = await run(sp as Tx);
    await sp`reset role`;
    return result;
  })) as T;
}

async function denied(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<unknown>,
) {
  await expect(asUser(tx, userId, run)).rejects.toMatchObject({
    code: '42501',
  });
}

const definition = {
  questions: [
    {
      id: 'workoutAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
    {
      id: 'dietAdherence',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      validation: { min: 0, max: 10, step: 1 },
    },
  ],
};

describe('P7 T002/T003/T004 same-workspace check-ins projection', () => {
  it('returns F15 answer history to every same-workspace Trainer and denies other roles/workspaces', async () => {
    const f = await clientContext();
    const foreign = await clientContext();
    await db.begin(async (tx) => {
      const ids = await graph(tx, f);
      const [clock] = await tx`
        select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
      `;
      const today = clock!.today as string;
      await tx`insert into public.subscription_activations(
        workspace_id,subscription_id,activated_at,delivery_event_id,activation_source
      ) values(
        ${f.wsA.id},${ids.subscription},
        ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',
        ${randomUUID()},'po_override'
      )`;

      const terms = `p7-checkins-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${terms},'terms','published')`;
      const formId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${f.wsA.id},'P7 synthetic check-in')`;
      await tx`insert into public.form_versions(
        workspace_id,form_id,version_number,terms_policy_version,definition,status
      ) values(${f.wsA.id},${formId},1,${terms},${tx.json(definition as JSONValue)},'published')`;
      await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${f.wsA.id},${formId},1)`,
      );
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`
        select id from public.form_assignments
        where workspace_id=${f.wsA.id} and client_id=${ids.client}
          and form_id=${formId} and occurrence_key=${'weekly_checkin:' + today}
      `;
      expect(assignment).toBeDefined();
      const assignmentId = assignment!.id as string;
      doubleClick = {
        workspaceId: f.wsA.id,
        clientId: ids.client,
        assignmentId,
        trainers: [f.trainerA.userId, f.trainerB.userId],
      };
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values
          (${f.wsA.id},${assignmentId},1,${tx.json({ workoutAdherence: 6, dietAdherence: 4 })}),
          (${f.wsA.id},${assignmentId},2,${tx.json({ workoutAdherence: 8, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${f.wsA.id},${assignmentId},2,clock_timestamp() - interval '26 hours')`;
      await tx`insert into public.client_trainer_assignments(
        workspace_id,client_id,trainer_user_id,assigned_by,assigned_at,workspace_membership_id
      ) select ${f.wsA.id},${ids.client},${f.trainerA.userId},${f.po.userId},
        s.submitted_at - interval '1 hour',m.id
        from app_private.form_submissions s
        join public.workspace_memberships m
          on m.workspace_id=s.workspace_id and m.user_id=${f.trainerA.userId}
        where s.workspace_id=${f.wsA.id} and s.assignment_id=${assignmentId}`;
      await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
        values(${f.wsA.id},${f.trainerB.userId},${f.po.userId})`;
      await tx`insert into app_private.workforce_checkin_transitions(
        workspace_id,assignment_id,status,actor_user_id,occurred_at
      ) select ${f.wsA.id},${assignmentId},'Followed Up',${f.trainerA.userId},
        submitted_at + interval '1 hour'
        from app_private.form_submissions
        where workspace_id=${f.wsA.id} and assignment_id=${assignmentId}`;
      await asUser(
        tx,
        f.po.userId,
        (sp) =>
          sp`select public.assign_client_responsible_trainer(${f.wsA.id},${ids.client},${f.trainerB.userId})`,
      );

      const read = (userId: string) =>
        asUser(
          tx,
          userId,
          (sp) =>
            sp`select * from public.get_trainer_checkins(${f.wsA.id},${today}::date,${today}::date,100,0)`,
        );
      for (const trainer of [f.trainerA.userId, f.trainerB.userId]) {
        const rows = await read(trainer);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          assignment_id: assignmentId,
          form_status: 'Submitted',
          followup_status: 'Followed Up',
          responsible_trainer_id: f.trainerA.userId,
          followup_history: [
            expect.objectContaining({ status: 'Pending' }),
            expect.objectContaining({
              status: 'Followed Up',
              actor_user_id: f.trainerA.userId,
            }),
          ],
          answer_history: [
            { answers: { workoutAdherence: 8, dietAdherence: 5 } },
          ],
        });
      }
      const confirmed = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.confirm_trainer_checkin_followup(${f.wsA.id},${assignmentId}) as result`,
      );
      expect(confirmed[0]?.result).toMatchObject({ status: 'ok' });
      const transitionId = (confirmed[0]?.result as { transition_id: string })
        .transition_id;
      const duplicate = await asUser(
        tx,
        f.trainerB.userId,
        (sp) =>
          sp`select public.confirm_trainer_checkin_followup(${f.wsA.id},${assignmentId}) as result`,
      );
      expect(duplicate[0]?.result).toEqual(confirmed[0]?.result);
      const followedUp = await asUser(
        tx,
        f.trainerB.userId,
        (sp) =>
          sp`select * from public.get_trainer_checkins(${f.wsA.id},${today}::date,${today}::date,100,0)`,
      );
      expect(followedUp[0]).toMatchObject({
        followup_status: 'Followed Up',
        responsible_trainer_id: f.trainerA.userId,
        followup_history: [
          expect.objectContaining({ status: 'Pending' }),
          expect.objectContaining({
            status: 'Followed Up',
            actor_user_id: f.trainerA.userId,
          }),
        ],
      });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update app_private.workforce_checkin_transitions
            set occurred_at=clock_timestamp()
            where workspace_id=${f.wsA.id} and assignment_id=${assignmentId}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        tx.savepoint(
          (sp) =>
            sp`delete from app_private.workforce_checkin_transitions
            where workspace_id=${f.wsA.id} and assignment_id=${assignmentId}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const cascadeRollback = new Error('privacy erasure cascade rollback');
      await expect(
        tx.savepoint(async (sp) => {
          await sp`delete from app_private.form_submissions
            where workspace_id=${f.wsA.id} and assignment_id=${assignmentId}`;
          const [remaining] = await sp`
            select count(*)::int as count from app_private.workforce_checkin_transitions
            where workspace_id=${f.wsA.id} and assignment_id=${assignmentId}
          `;
          expect(remaining!.count).toBe(0);
          throw cascadeRollback;
        }),
      ).rejects.toBe(cascadeRollback);
      const [audit] = await tx`
        select action,target_table,target_id,details
        from public.audit_events where target_id=${transitionId}::uuid
      `;
      expect(audit).toMatchObject({
        action: 'audit.opaque_reference',
        target_table: 'opaque_reference',
        target_id: transitionId,
        details: { reference_id: transitionId },
      });
      expect(Object.keys(audit!.details as object)).toEqual(['reference_id']);
      const [noticeCounts] = await tx`
        select
          (select count(*)::int from app_private.client_inbox_notices
            where workspace_id=${f.wsA.id} and source_key=${assignmentId}) as client_notices,
          (select count(*)::int from app_private.staff_inbox_notices
            where workspace_id=${f.wsA.id} and source_key=${assignmentId}) as staff_notices
      `;
      expect(noticeCounts).toMatchObject({
        client_notices: 0,
        staff_notices: 0,
      });
      for (const actor of [
        f.woA.userId,
        f.salesA.userId,
        foreign.trainerA.userId,
      ])
        await denied(
          tx,
          actor,
          (sp) =>
            sp`select * from public.get_trainer_checkins(${f.wsA.id},${today}::date,${today}::date,100,0)`,
        );
      for (const actor of [
        f.woA.userId,
        f.salesA.userId,
        foreign.trainerA.userId,
      ])
        await denied(
          tx,
          actor,
          (sp) =>
            sp`select public.confirm_trainer_checkin_followup(${f.wsA.id},${assignmentId})`,
        );
    });
  });

  it('serializes simultaneous Trainer double-clicks into one follow-up transition', async () => {
    const invoke = async (userId: string) => {
      const connection = sql();
      try {
        return await connection.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
          await tx`set local role authenticated`;
          const [row] = await tx`
            select public.confirm_trainer_checkin_followup(
              ${doubleClick.workspaceId},${doubleClick.assignmentId}
            ) as result
          `;
          await tx`reset role`;
          return row!.result as { status: string; transition_id: string };
        });
      } finally {
        await connection.end();
      }
    };
    const [first, second] = await Promise.all([
      invoke(doubleClick.trainers[0]!),
      invoke(doubleClick.trainers[1]!),
    ]);
    expect(first).toMatchObject({ status: 'ok' });
    expect(second).toEqual(first);
    const [count] = await db`
      select count(*)::int as count from app_private.workforce_checkin_transitions
      where workspace_id=${doubleClick.workspaceId}
        and assignment_id=${doubleClick.assignmentId} and status='Followed Up'
    `;
    expect(count?.count).toBe(1);
  });

  it('rechecks workspace access after a confirmation waits on its assignment lock', async () => {
    const trainerA = doubleClick.trainers[0]!;
    const trainerB = doubleClick.trainers[1]!;
    const lockConnection = sql();
    const connection = sql();
    let announceLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => (announceLocked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const lockHolder = lockConnection.begin(async (tx) => {
      await tx`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        ${'p7-checkin-followup:' + doubleClick.workspaceId + ':' + doubleClick.assignmentId},0))`;
      announceLocked();
      await gate;
    });
    try {
      await locked;
      const pending = connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: trainerA, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        return tx`select public.confirm_trainer_checkin_followup(
          ${doubleClick.workspaceId},${doubleClick.assignmentId}) as result`;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.workspace_memberships
          set revoked_at=clock_timestamp(),revoked_by=${trainerB}
          where workspace_id=${doubleClick.workspaceId} and user_id=${trainerA}`;
      });
      release();
      await expect(pending).rejects.toMatchObject({ code: '42501' });
      await lockHolder;
      await db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.workspace_memberships set revoked_at=null,revoked_by=null
          where workspace_id=${doubleClick.workspaceId} and user_id=${trainerA}`;
      });
    } finally {
      release();
      await lockHolder;
      await connection.end();
      await lockConnection.end();
    }
  });

  it('rechecks workspace access after a confirmation waits on the F15 submission row', async () => {
    const trainerA = doubleClick.trainers[0]!;
    const trainerB = doubleClick.trainers[1]!;
    const lockConnection = sql();
    const connection = sql();
    let announceLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => (announceLocked = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const lockHolder = lockConnection.begin(async (tx) => {
      await tx`select 1 from app_private.form_submissions
        where workspace_id=${doubleClick.workspaceId} and assignment_id=${doubleClick.assignmentId}
        for update`;
      announceLocked();
      await gate;
    });
    try {
      await locked;
      const pending = connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: trainerA, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        return tx`select public.confirm_trainer_checkin_followup(
          ${doubleClick.workspaceId},${doubleClick.assignmentId}) as result`;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.workspace_memberships
          set revoked_at=clock_timestamp(),revoked_by=${trainerB}
          where workspace_id=${doubleClick.workspaceId} and user_id=${trainerA}`;
      });
      release();
      await expect(pending).rejects.toMatchObject({ code: '42501' });
      await lockHolder;
      await db.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.workspace_memberships set revoked_at=null,revoked_by=null
          where workspace_id=${doubleClick.workspaceId} and user_id=${trainerA}`;
      });
    } finally {
      release();
      await lockHolder;
      await connection.end();
      await lockConnection.end();
    }
  });

  it('allows transition deletion only inside the F26 allowlisted purge context', async () => {
    const runId = randomUUID();
    await db.begin(async (tx) => {
      const mutationRollback = new Error('rollback F26 allowlist mutation');
      const [guardBefore] = await tx`
        select pg_catalog.pg_get_functiondef(
          'app_private.retention_purge_context_allows(oid,text)'::regprocedure
        ) as definition
      `;
      try {
        await tx.savepoint(async (inner) => {
          const mutationRunId = randomUUID();
          await inner`insert into app_private.retention_purge_runs(run_id,request_fingerprint,status)
            values(${mutationRunId},${'b'.repeat(64)},'running')`;
          await inner`select set_config('app_private.retention_purge_run_id',${mutationRunId},true)`;
          await inner`update app_private.retention_purge_allowlist set can_delete=false
            where table_oid='app_private.workforce_checkin_transitions'::regclass`;
          await expect(
            inner.savepoint(
              (sp) => sp`delete from app_private.workforce_checkin_transitions
                where workspace_id=${doubleClick.workspaceId}
                  and assignment_id=${doubleClick.assignmentId} and status='Pending'`,
            ),
          ).rejects.toMatchObject({ code: '23514' });
          await inner.unsafe(`create or replace function app_private.retention_purge_context_allows(
            p_table_oid oid,p_operation text
          ) returns boolean language sql stable security definer set search_path = '' as $$
            select true
          $$`);
          const removedGuard = await inner`
            delete from app_private.workforce_checkin_transitions
            where workspace_id=${doubleClick.workspaceId}
              and assignment_id=${doubleClick.assignmentId} and status='Pending'
            returning id
          `;
          expect(removedGuard).toHaveLength(1);
          throw mutationRollback;
        });
      } catch (error) {
        if (error !== mutationRollback) throw error;
      }
      const [guardAfter] = await tx`
        select pg_catalog.pg_get_functiondef(
          'app_private.retention_purge_context_allows(oid,text)'::regprocedure
        ) as definition
      `;
      expect(guardAfter!.definition).toBe(guardBefore!.definition);
      await tx`insert into app_private.retention_purge_runs(run_id,request_fingerprint,status)
        values(${runId},${'a'.repeat(64)},'running')`;
      await expect(
        tx.savepoint(
          (sp) =>
            sp`delete from app_private.workforce_checkin_transitions
            where workspace_id=${doubleClick.workspaceId}
              and assignment_id=${doubleClick.assignmentId} and status='Pending'`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await tx`select set_config('app_private.retention_purge_run_id',${runId},true)`;
      const [allowed] = await tx`
        select app_private.retention_purge_context_allows(
          'app_private.workforce_checkin_transitions'::regclass,'DELETE'
        ) as allowed
      `;
      expect(allowed?.allowed).toBe(true);
      const deleted = await tx`
        delete from app_private.workforce_checkin_transitions
        where workspace_id=${doubleClick.workspaceId}
          and assignment_id=${doubleClick.assignmentId} and status='Pending'
        returning id
      `;
      expect(deleted).toHaveLength(1);
      await tx`select set_config('app_private.retention_purge_run_id','',true)`;
      await tx`delete from app_private.retention_purge_runs where run_id=${runId}`;
    });
  });

  it('forces private RLS and exposes only authenticated projection/confirmation RPCs', async () => {
    const [table] = await db`
      select c.relrowsecurity, c.relforcerowsecurity,
        has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
        has_table_privilege('service_role',c.oid,'SELECT') as service_role_select
      from pg_catalog.pg_class c
      where c.oid=to_regclass('app_private.workforce_checkin_transitions')
    `;
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
      authenticated_select: false,
      service_role_select: false,
    });
    const [channel] = await db`
      select exists (
        select 1 from pg_catalog.pg_publication_tables
        where schemaname='app_private' and tablename='workforce_checkin_transitions'
      ) as realtime_published,
      has_table_privilege('authenticated',
        'app_private.workforce_checkin_transitions','SELECT') as authenticated_count_head
    `;
    expect(channel).toMatchObject({
      realtime_published: false,
      authenticated_count_head: false,
    });
    const auditReaders = await db`
      select policyname,roles,qual
      from pg_catalog.pg_policies
      where schemaname='public' and tablename='audit_events' and cmd='SELECT'
    `;
    expect(auditReaders).toHaveLength(1);
    expect(auditReaders[0]).toMatchObject({
      policyname: 'audit_events_select_scoped',
      roles: ['authenticated'],
    });
    expect(auditReaders[0]?.qual).toContain('workspace_owner');
    const routines = await db`
      select p.prosecdef, p.proconfig,
        has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
        has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
      from pg_catalog.pg_proc p
      where p.oid in (
        to_regprocedure('public.get_trainer_checkins(uuid,date,date,integer,integer)'),
        to_regprocedure('public.confirm_trainer_checkin_followup(uuid,uuid)')
      )
    `;
    expect(routines).toHaveLength(2);
    for (const routine of routines)
      expect(routine).toMatchObject({
        prosecdef: true,
        proconfig: ['search_path=""'],
        authenticated_execute: true,
        anon_execute: false,
        service_role_execute: false,
      });
  });

  it('blocks direct transition access and UPDATE/DELETE/TRUNCATE outside the F26 purge path', async () => {
    const deniedRead = await db
      .begin(async (tx) => {
        await tx`set local role authenticated`;
        return tx`select count(*)::int from app_private.workforce_checkin_transitions`;
      })
      .then(
        () => false,
        () => true,
      );
    expect(deniedRead).toBe(true);
    const [allowlist] = await db`
      select can_delete,can_update,traverse
      from app_private.retention_purge_allowlist
      where table_oid='app_private.workforce_checkin_transitions'::regclass
    `;
    expect(allowlist).toEqual({
      can_delete: true,
      can_update: false,
      traverse: true,
    });
    const [triggers] = await db`
      select count(*) filter (where tgtype::int=27)::int as row_guard,
        count(*) filter (where tgtype::int=34)::int as truncate_guard
      from pg_catalog.pg_trigger
      where tgrelid='app_private.workforce_checkin_transitions'::regclass and not tgisinternal
    `;
    expect(triggers).toEqual({ row_guard: 1, truncate_guard: 1 });
  });

  it('T030/T031 purges linked P7 check-ins and preserves durable earned totals', async () => {
    const rollback = new Error('rollback F26 P7 purge fixture');
    try {
      await db.begin(async (tx) => {
        const [fkClosure] = await tx`
        with recursive p7_tables(table_oid) as (
          select c.oid
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where (n.nspname='public' and left(c.relname,3)='p7_')
             or (n.nspname='app_private' and c.relname='workforce_checkin_transitions')
        ), closure(table_oid,path) as (
          select table_oid,array[table_oid] from p7_tables
          union all
          select fk.confrelid,closure.path||fk.confrelid
          from closure
          join pg_catalog.pg_constraint fk on fk.conrelid=closure.table_oid and fk.contype='f'
          where not fk.confrelid=any(closure.path)
        )
        select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object(
          'child',fk.conrelid::regclass::text,
          'parent',fk.confrelid::regclass::text,
          'constraint',fk.conname
        )) as edges
        from closure
        join pg_catalog.pg_constraint fk on fk.conrelid=closure.table_oid and fk.contype='f'
        join pg_catalog.pg_class parent on parent.oid=fk.confrelid
        join pg_catalog.pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
        where (parent_ns.nspname='public' and (parent.relname='clients' or parent.relname like 'form%'))
           or (parent_ns.nspname='app_private' and parent.relname like 'form%')
      `;
        const edges = (fkClosure!.edges ?? []) as Array<{
          child: string;
          parent: string;
        }>;
        expect(
          edges.map(({ child, parent }) => `${child}->${parent}`).sort(),
        ).toEqual([
          'app_private.form_assignment_occurrences->app_private.form_assignment_policies',
          'app_private.form_assignment_policies->form_versions',
          'app_private.form_submissions->form_answer_revisions',
          'app_private.form_submissions->form_assignments',
          'app_private.workforce_checkin_transitions->app_private.form_submissions',
          'form_answer_revisions->form_assignments',
          'form_assignments->app_private.form_assignment_occurrences',
          'form_assignments->app_private.form_assignment_policies',
          'form_assignments->clients',
          'form_assignments->form_versions',
          'form_versions->forms',
        ]);
        const [earnedColumns] = await tx`
        select array_agg(a.attname order by a.attnum) as columns
        from pg_catalog.pg_attribute a
        where a.attrelid='public.p7_earned_points'::regclass
          and a.attnum>0 and not a.attisdropped
      `;
        expect(earnedColumns!.columns).toEqual([
          'id',
          'workspace_id',
          'staff_user_id',
          'points',
          'effective_month',
          'trigger_at',
          'recorded_at',
          'rule_version',
          'source_key',
          'source_hash',
          'original_month',
        ]);

        const sourceKey = randomUUID();
        await tx`
        insert into public.p7_earned_points(
          workspace_id,staff_user_id,points,effective_month,trigger_at,rule_version,source_key,source_hash
        ) values (
          ${doubleClick.workspaceId},${doubleClick.trainers[0]!},1.00,
          date_trunc('month',clock_timestamp())::date,clock_timestamp(),
          'p7-purge-retention-test',${sourceKey},repeat('a',64)
        )
      `;
        const [before] = await tx`
        select count(*)::int as facts,coalesce(sum(points),0)::text as total
        from public.p7_earned_points where workspace_id=${doubleClick.workspaceId}
          and staff_user_id=${doubleClick.trainers[0]!}
      `;
        await tx`set local session_replication_role = replica`;
        await tx`update public.clients set deactivated_at=clock_timestamp()-interval '31 days',
        deactivation_reason='closure' where id=${doubleClick.clientId}`;
        await tx`set local session_replication_role = origin`;
        // Keep concurrent integration fixtures isolated while exercising the real
        // F26 apply path for this client inside the rollback-only transaction.
        await tx.unsafe(`create or replace function app_private.p7_retention_has_open_dispute(
        p_workspace_id uuid,p_client_id uuid
      ) returns boolean language sql stable security invoker set search_path = '' as $$
        select p_client_id <> '${doubleClick.clientId}'::uuid
      $$`);

        const runId = randomUUID();
        const [purge] = await tx`
        select app_private.purge_retention_apply(${runId},'apply') as result
      `;
        expect(purge!.result).toMatchObject({ status: 'applied' });
        expect(
          (purge!.result as { eligible_clients: number }).eligible_clients,
        ).toBe(1);
        expect(
          (purge!.result as { deleted_by_table: Record<string, number> })
            .deleted_by_table['app_private.workforce_checkin_transitions'],
        ).toBeGreaterThan(0);
        const [after] = await tx`
        select count(*)::int as facts,coalesce(sum(points),0)::text as total
        from public.p7_earned_points where workspace_id=${doubleClick.workspaceId}
          and staff_user_id=${doubleClick.trainers[0]!}
      `;
        expect(after).toEqual(before);
        const [client] =
          await tx`select id from public.clients where id=${doubleClick.clientId}`;
        expect(client).toBeUndefined();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
