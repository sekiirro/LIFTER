import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  registered,
  sql,
} from './registration-approval-operations-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';
import { cleanupAlertFixture } from './forms-alert-fixture-cleanup';

const db = sql();
afterAll(() => db.end());
const CORE = 'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)';
const IMMUTABLE = 'app_private.f15_alert_schedule_immutable()';
const rollback = new Error('rollback F15 alert mutation fixture');
const migrationPath = new URL(
  '../../supabase/migrations/20261108230029_f15_alert_schedules.sql',
  import.meta.url,
);

async function expectInvariantFailure(
  label: string,
  assertion: () => Promise<void>,
) {
  let failure: unknown;
  try {
    await assertion();
  } catch (error) {
    failure = error;
  }
  expect(
    failure,
    `${label} mutant must fail its named assertion`,
  ).toBeDefined();
}

async function rollbackProbe(body: (tx: TransactionSql) => Promise<void>) {
  let failure: unknown;
  try {
    await db.begin(async (tx) => {
      try {
        await body(tx);
      } catch (error) {
        failure = error;
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback && failure === undefined) failure = error;
  }
  if (failure !== undefined) throw failure;
}

async function makeAssignment(
  tx: TransactionSql,
  f: Awaited<ReturnType<typeof clientContext>>,
  clientId: string,
  deadlineAt: string | null,
) {
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policyId = deadlineAt === null ? null : randomUUID();
  const occurrenceKey = `alert-mutation:${assignmentId}`;
  const terms = `alert-mutation-${randomUUID()}`;
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${f.wsA.id},'Alert mutation fixture')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${f.wsA.id},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  if (policyId) {
    await tx`insert into app_private.form_assignment_policies(
      id,workspace_id,form_id,version_number,audience_kind,specific_client_ids,
      trigger_kind,timing,stop_conditions,configured_by
    ) values(
      ${policyId},${f.wsA.id},${formId},1,'specific_clients',${[clientId]}::uuid[],
      'manual','{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb,${f.po.userId}
    )`;
    await tx`insert into app_private.form_assignment_occurrences(
      workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,
      version_number,trigger_kind,created_by
    ) values(
      ${f.wsA.id},${policyId},${occurrenceKey},clock_timestamp(),${[clientId]}::uuid[],
      1,'manual',${f.po.userId}
    )`;
  }
  await tx`insert into public.form_assignments(
    id,workspace_id,client_id,form_id,version_number,terms_policy_version,
    version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,policy_id,configured_by
  ) values(
    ${assignmentId},${f.wsA.id},${clientId},${formId},1,${terms},${tx.json({ questions: [] })},
    ${policyId ? occurrenceKey : 'initial'},clock_timestamp(),${deadlineAt}::timestamptz,${policyId},
    ${policyId ? f.po.userId : null}
  )`;
  return assignmentId;
}

async function evaluate(
  tx: TransactionSql | ReturnType<typeof sql>,
  workspaceId: string,
  date: string,
) {
  const [row] = await tx`
    select app_private.evaluate_forms_alerts_core(${date}::timestamptz,${workspaceId}::uuid,250) as result
  `;
  return row!.result as { status: string; enqueued?: number };
}

async function setupClient() {
  const f = await clientContext();
  const client = await registered(f);
  return { f, client };
}

async function trainerBatchProbe(
  f: Awaited<ReturnType<typeof clientContext>>,
  client: Awaited<ReturnType<typeof registered>>,
) {
  let expectedAssertionFailed = false;
  await rollbackProbe(async (tx) => {
    const trainerAssignment = await makeAssignment(tx, f, client.id, null);
    const [trainerSchedule] = await tx`
      insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
      ) values(
        ${f.wsA.id},${trainerAssignment},'trainer_late','2026-05-01T00:00:00Z',${f.trainerA.userId}
      ) returning id`;
    await tx`insert into app_private.form_alert_occurrences(
      workspace_id,schedule_id,stage,recipient_user_id,job_id,enqueued_at
    ) values
      (${f.wsA.id},${trainerSchedule!.id},'trainer_initial',${f.trainerA.userId},null,'2026-05-01T00:00:00Z'),
      (${f.wsA.id},${trainerSchedule!.id},'trainer_owners_24h',${f.po.userId},null,'2026-05-02T00:00:00Z'),
      (${f.wsA.id},${trainerSchedule!.id},'trainer_owners_24h',${f.woA.userId},null,'2026-05-02T00:00:00Z')`;
    const clientAssignment = await makeAssignment(
      tx,
      f,
      client.id,
      '2026-05-03T00:00:00Z',
    );
    const [row] = await tx`
      select app_private.evaluate_forms_alerts_core(
        '2026-05-03T00:00:00Z'::timestamptz,${f.wsA.id}::uuid,1
      ) as result`;
    try {
      expect(row!.result).toEqual({ status: 'ok', enqueued: 2 });
    } catch {
      expectedAssertionFailed = true;
    }
    if (!expectedAssertionFailed) {
      const [clientOccurrences] = await tx`
        select count(*)::int as count from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=(
          select id from app_private.form_alert_schedules
          where workspace_id=${f.wsA.id} and source_assignment_id=${clientAssignment}
            and alert_kind='client_late'
        )`;
      expect(clientOccurrences?.count).toBe(2);
    }
  });
  return expectedAssertionFailed;
}

it('kills a trainer batch-starvation mutant and restores the evaluator', async () => {
  const { f, client } = await setupClient();
  await withCrashSafeFunctionMutant(
    CORE,
    (source) => source.replace("s.alert_kind <> 'trainer_late'", 'true'),
    async () => {
      expect(await trainerBatchProbe(f, client)).toBe(true);
    },
  );
  expect(await trainerBatchProbe(f, client)).toBe(false);
});

it('kills delayed client-late stages, reassignment deadline reset, and omitted-owner mutants', async () => {
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source.replace(
          "schedule_row.deadline_at as stage_at\n        where schedule_row.alert_kind='client_late'",
          "schedule_row.deadline_at + interval '24 hours' as stage_at\n        where schedule_row.alert_kind='client_late'",
        ),
      async () =>
        expectInvariantFailure(
          'client reminder must remain separate from the deadline clock',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(
                tx,
                f,
                client.id,
                '2026-05-01T10:00:00.000Z',
              );
              await tx`update app_private.form_alert_schedules
              set trainer_user_id=${f.trainerA.userId}
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;
              expect(
                await evaluate(tx, f.wsA.id, '2026-05-01T10:00:00.000Z'),
              ).toEqual({
                status: 'ok',
                enqueued: 2,
              });
            }),
        ),
    );
  }
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      IMMUTABLE,
      (source) =>
        source.replace(
          '    or new.deadline_at is distinct from old.deadline_at\n',
          '',
        ),
      async () =>
        expectInvariantFailure(
          'reassignment must preserve the original due instant',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(
                tx,
                f,
                client.id,
                '2026-05-02T10:00:00.000Z',
              );
              await tx`update app_private.form_alert_schedules
              set trainer_user_id=${f.trainerA.userId},deadline_at='2026-05-03T10:00:00Z'
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;
              const [row] =
                await tx`select deadline_at from app_private.form_alert_schedules
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;
              expect(new Date(row!.deadline_at as string).toISOString()).toBe(
                '2026-05-02T10:00:00.000Z',
              );
            }),
        ),
    );
  }
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source.replaceAll(
          "sp.role='workspace_owner'::public.staff_role",
          "sp.role='sales'::public.staff_role",
        ),
      async () =>
        expectInvariantFailure('owner stage must include both PO and WO', () =>
          rollbackProbe(async (tx) => {
            await makeAssignment(tx, f, client.id, '2026-05-04T10:00:00.000Z');
            await evaluate(tx, f.wsA.id, '2026-05-06T10:00:00.000Z');
            const recipients = await tx`select recipient_user_id
              from app_private.form_alert_occurrences
              where workspace_id=${f.wsA.id} and stage='client_owners_immediate'`;
            expect(
              recipients.map((row) => row.recipient_user_id).sort(),
            ).toEqual([f.po.userId, f.woA.userId].sort());
          }),
        ),
    );
  }
});

it('kills delayed-owner-stage, duplicate-stage, and answer-text mutants', async () => {
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source.replace(
          "schedule_row.deadline_at as stage_at\n        where schedule_row.alert_kind='client_late'",
          "schedule_row.deadline_at + interval '24 hours' as stage_at\n        where schedule_row.alert_kind='client_late'",
        ),
      async () =>
        expectInvariantFailure(
          'immediate owner stage must enqueue the platform owner',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(
                tx,
                f,
                client.id,
                '2026-05-07T10:00:00.000Z',
              );
              await tx`update app_private.form_alert_schedules
              set trainer_user_id=${f.trainerA.userId}
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;
              await tx`update public.workspace_memberships
              set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
              where workspace_id=${f.wsA.id} and user_id=${f.woA.userId} and revoked_at is null`;
              await evaluate(tx, f.wsA.id, '2026-05-07T10:00:00.000Z');
              const recipients =
                await tx`select recipient_user_id from app_private.form_alert_occurrences
              where workspace_id=${f.wsA.id}`;
              expect(
                recipients.map((row) => row.recipient_user_id).sort(),
              ).toEqual([f.po.userId].sort());
            }),
        ),
    );
  }
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source
          .replace(
            'on conflict (workspace_id,schedule_id,stage,recipient_user_id) do nothing',
            'on conflict (workspace_id,schedule_id,stage,recipient_user_id) do update set id=gen_random_uuid()',
          )
          .replace(
            "format('f15-alert:%s:%s:%s',schedule_row.id,stage_row.stage,recipient_row.user_id)",
            "format('f15-alert:%s:%s:%s:%s',schedule_row.id,stage_row.stage,recipient_row.user_id,gen_random_uuid())",
          ),
      async () =>
        expectInvariantFailure(
          'replayed stage/recipient must not create another occurrence',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(
                tx,
                f,
                client.id,
                '2026-05-09T10:00:00.000Z',
              );
              await tx`update app_private.form_alert_schedules
              set trainer_user_id=${f.trainerA.userId}
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment}`;
              expect(
                await evaluate(tx, f.wsA.id, '2026-05-10T10:00:00.000Z'),
              ).toMatchObject({
                status: 'ok',
                enqueued: 1,
              });
              expect(
                await evaluate(tx, f.wsA.id, '2026-05-10T10:00:00.000Z'),
              ).toEqual({
                status: 'ok',
                enqueued: 0,
              });
            }),
        ),
    );
  }
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source.replace(
          "jsonb_build_object(\n            'alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage\n          )",
          "jsonb_build_object(\n            'answer_text','sensitive synthetic answer','alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage\n          )",
        ),
      async () =>
        expectInvariantFailure(
          'job and audit payloads must remain IDs-only',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(
                tx,
                f,
                client.id,
                '2026-05-11T10:00:00.000Z',
              );
              await evaluate(tx, f.wsA.id, '2026-05-12T10:00:00.000Z');
              const [job] = await tx`select j.payload,e.details
              from app_private.form_alert_occurrences o
              join public.jobs j on j.id=o.job_id
              join public.audit_events e on e.target_id=o.id and e.action='form.alert_enqueued'
              where o.workspace_id=${f.wsA.id} and o.schedule_id in (
                select id from app_private.form_alert_schedules where source_assignment_id=${assignment}
              ) limit 1`;
              expect(JSON.stringify(job)).not.toContain(
                'sensitive synthetic answer',
              );
              expect(
                Object.keys(job!.payload as Record<string, unknown>).sort(),
              ).toEqual(['alert_id', 'recipient_id', 'stage']);
              expect(
                Object.keys(job!.details as Record<string, unknown>).sort(),
              ).toEqual(['recipient_id', 'schedule_id', 'stage']);
            }),
        ),
    );
  }
});

it('kills race, missing dedupe lock, and two-hour escalation mutants', async () => {
  {
    const { f, client } = await setupClient();
    const assignment = await db.begin(async (tx) => {
      const id = await makeAssignment(tx, f, client.id, null);
      await tx`insert into app_private.form_alert_schedules(
        workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
      ) values(
        ${f.wsA.id},${id},'trainer_late','2026-05-13T10:00:00.000Z',${f.trainerA.userId}
      )`;
      return id;
    });
    try {
      await withCrashSafeFunctionMutant(
        CORE,
        (source) => source.replace('    for update of s skip locked\n', ''),
        async () =>
          expectInvariantFailure(
            'detector must observe the locked on-time delivery first',
            async () => {
              const writer = sql();
              const evaluator = sql();
              await evaluator`set lock_timeout = '1s'`;
              await writer`begin`;
              try {
                await writer`update app_private.form_alert_schedules
              set delivered_at='2026-05-13T09:59:59.000Z'::timestamptz
              where workspace_id=${f.wsA.id} and source_assignment_id=${assignment} and alert_kind='trainer_late'`;
                const result = await evaluate(
                  evaluator,
                  f.wsA.id,
                  '2026-05-14T10:00:00.000Z',
                );
                expect(result).toEqual({ status: 'ok', enqueued: 0 });
                await writer`commit`;
              } finally {
                await writer`rollback`.catch(() => undefined);
                await writer.end();
                await evaluator.end();
              }
            },
          ),
      );
    } finally {
      await db.begin((tx) => cleanupAlertFixture(tx, f.wsA.id, assignment));
    }
  }
  {
    const { f, client } = await setupClient();
    const assignment = await db.begin(async (tx) => {
      const id = await makeAssignment(
        tx,
        f,
        client.id,
        '2026-05-15T10:00:00.000Z',
      );
      return id;
    });
    try {
      await withCrashSafeFunctionMutant(
        CORE,
        (source) =>
          source.replace(
            '  perform pg_catalog.pg_advisory_xact_lock(11011,318);\n',
            '',
          ),
        async () =>
          expectInvariantFailure(
            'concurrent evaluator must wait on the dedupe advisory lock',
            async () => {
              const lockConnection = sql();
              const evaluator = sql();
              await lockConnection`begin`;
              await lockConnection`select pg_catalog.pg_advisory_xact_lock(11011,318)`;
              let finished = false;
              const [session] = await evaluator`select pg_backend_pid() as pid`;
              expect(session).toBeDefined();
              const pid = session!.pid;
              const pending = evaluate(
                evaluator,
                f.wsA.id,
                '2026-05-16T10:00:00.000Z',
              ).finally(() => {
                finished = true;
              });
              try {
                await expect
                  .poll(
                    async () => {
                      const [activity] = await lockConnection`
                      select wait_event_type,wait_event
                      from pg_catalog.pg_stat_activity where pid=${pid}
                    `;
                      if (activity?.wait_event_type === 'Lock')
                        return activity.wait_event;
                      return finished ? 'finished' : null;
                    },
                    { timeout: 5000 },
                  )
                  .toBe('advisory');
                await lockConnection`commit`;
                await pending;
                void assignment;
              } finally {
                await lockConnection`rollback`.catch(() => undefined);
                await lockConnection.end();
                await evaluator.end();
              }
            },
          ),
      );
    } finally {
      await db.begin((tx) => cleanupAlertFixture(tx, f.wsA.id, assignment));
    }
  }
  {
    const { f, client } = await setupClient();
    await withCrashSafeFunctionMutant(
      CORE,
      (source) =>
        source.replace(
          /select 'trainer_owners_24h',schedule_row\.deadline_at \+ interval '24 hours'/,
          "select 'trainer_owners_24h',schedule_row.deadline_at + interval '2 hours'",
        ),
      async () =>
        expectInvariantFailure(
          'D-03 owner escalation remains at +24 hours',
          () =>
            rollbackProbe(async (tx) => {
              const assignment = await makeAssignment(tx, f, client.id, null);
              await tx`insert into app_private.form_alert_schedules(
              workspace_id,source_assignment_id,alert_kind,deadline_at,trainer_user_id
            ) values(
              ${f.wsA.id},${assignment},'trainer_late','2026-05-17T10:00:00Z',${f.trainerA.userId}
            )`;
              await evaluate(tx, f.wsA.id, '2026-05-17T13:00:00Z');
              const owners =
                await tx`select id from app_private.form_alert_occurrences
              where workspace_id=${f.wsA.id} and stage='trainer_owners_24h'`;
              expect(owners).toHaveLength(0);
            }),
        ),
    );
  }
});

it('kills migration activation, non-owner activation, missing scheduler lock, and broad cron grant mutants', async () => {
  {
    const source = readFileSync(migrationPath, 'utf8');
    const assertInactive = (migration: string) =>
      expect(migration).not.toMatch(
        /select\s+app_private\.f15_alert_schedule_activate\s*\(/i,
      );
    await expectInvariantFailure(
      'migration must not activate cron',
      async () => {
        const mutant = source.replace(
          '-- No cron.schedule call, activation, or external delivery adapter is run here.',
          'select app_private.f15_alert_schedule_activate();',
        );
        assertInactive(mutant);
      },
    );
  }
  {
    await withCrashSafeFunctionMutant(
      'app_private.f15_alert_schedule_activate()',
      (source) =>
        source.replace(
          /  if current_user <> 'postgres' then\s+raise exception 'f15_alert_owner_required' using errcode='42501';\s+end if;\s*/,
          '',
        ),
      async () =>
        expectInvariantFailure(
          'non-owner activation must return owner-required',
          async () => {
            await expect(
              db.begin(async (tx) => {
                await tx`grant execute on function app_private.f15_alert_schedule_activate() to authenticated`;
                await tx`set local role authenticated`;
                await tx`select app_private.f15_alert_schedule_activate()`;
              }),
            ).rejects.toMatchObject({ message: 'f15_alert_owner_required' });
          },
        ),
    );
  }
  {
    await withCrashSafeFunctionMutant(
      'app_private.f15_alert_schedule_deactivate()',
      (source) =>
        source.replace(
          '  perform pg_catalog.pg_advisory_xact_lock(11011,317);\n',
          '',
        ),
      async () =>
        expectInvariantFailure(
          'scheduler deactivation must serialize on its advisory lock',
          async () => {
            const lockConnection = sql();
            const scheduler = sql();
            let pending: Promise<unknown> | undefined;
            let finished = false;
            try {
              await lockConnection`begin`;
              await lockConnection`select pg_catalog.pg_advisory_xact_lock(11011,317)`;
              const [session] = await scheduler`select pg_backend_pid() as pid`;
              expect(session).toBeDefined();
              const pid = session!.pid;
              pending =
                scheduler`select app_private.f15_alert_schedule_deactivate()`
                  .execute()
                  .finally(() => {
                    finished = true;
                  });
              await expect
                .poll(
                  async () => {
                    const [activity] = await lockConnection`
                      select wait_event_type,wait_event
                      from pg_catalog.pg_stat_activity where pid=${pid}
                    `;
                    if (activity?.wait_event_type === 'Lock')
                      return activity.wait_event;
                    return finished ? 'finished' : null;
                  },
                  { timeout: 5000 },
                )
                .toBe('advisory');
              await lockConnection`commit`;
              await pending;
            } finally {
              await lockConnection`rollback`.catch(() => undefined);
              await pending?.catch(() => undefined);
              await lockConnection.end();
              await scheduler.end();
            }
          },
        ),
    );
  }
  {
    await expectInvariantFailure(
      'API roles must not receive cron schema usage',
      async () =>
        rollbackProbe(async (tx) => {
          await tx`grant usage on schema cron to authenticated`;
          const [row] =
            await tx`select has_schema_privilege('authenticated','cron','USAGE') as allowed`;
          expect(row?.allowed).toBe(false);
        }),
    );
  }
});
