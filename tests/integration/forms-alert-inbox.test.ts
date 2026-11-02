import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  registered,
  sql,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
const rollback = new Error('rollback F15 in-app inbox fixture');
const coreName =
  'app_private.evaluate_forms_alerts_core(timestamptz,uuid,integer)';
const writeName = 'app_private.write_f15_in_app_alert(uuid)';
const readName = 'public.read_form_alert_inbox(integer,timestamptz)';

async function definition(tx: TransactionSql, identity: string) {
  const [row] = await tx`
    select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as body
  `;
  return row!.body as string;
}

async function fixture(tx: TransactionSql) {
  const f = await clientContext();
  const client = await registered(f);
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policyId = randomUUID();
  const terms = `inbox-${randomUUID()}`;
  await tx`insert into public.workspace_memberships(workspace_id,user_id,granted_by)
    select ${f.wsA.id},${f.trainerB.userId},${f.po.userId}
    where not exists (select 1 from public.workspace_memberships
      where workspace_id=${f.wsA.id} and user_id=${f.trainerB.userId}
        and revoked_at is null)`;
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${f.wsA.id},'Synthetic alert inbox')`;
  await tx`insert into public.form_versions(
      workspace_id,form_id,version_number,terms_policy_version,definition,status
    ) values(${f.wsA.id},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  await tx`insert into app_private.form_assignment_policies(
      id,workspace_id,form_id,version_number,audience_kind,specific_client_ids,
      trigger_kind,timing,stop_conditions,configured_by
    ) values(
      ${policyId},${f.wsA.id},${formId},1,'specific_clients',${[client.id]}::uuid[],
      'manual','{"client_deadline_days":3}'::jsonb,
      '{"frozen":true,"inactive":true}'::jsonb,${f.po.userId}
    )`;
  await tx`insert into app_private.form_assignment_occurrences(
      workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,
      version_number,trigger_kind,created_by
    ) values(
      ${f.wsA.id},${policyId},${`inbox:${assignmentId}`},clock_timestamp(),
      ${[client.id]}::uuid[],1,'manual',${f.po.userId}
    )`;
  await tx`insert into public.form_assignments(
      id,workspace_id,client_id,form_id,version_number,terms_policy_version,
      version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,
      policy_id,configured_by
    ) values(
      ${assignmentId},${f.wsA.id},${client.id},${formId},1,${terms},
      ${tx.json({ questions: [] })},${`inbox:${assignmentId}`},clock_timestamp(),
      '2026-06-01T10:00:00.000Z'::timestamptz,${policyId},${f.po.userId}
    )`;
  const [schedule] = await tx`select id from app_private.form_alert_schedules
    where workspace_id=${f.wsA.id} and source_assignment_id=${assignmentId}
      and alert_kind='client_late'`;
  await tx`update app_private.form_alert_schedules set trainer_user_id=${f.trainerA.userId}
    where id=${schedule!.id}`;
  const [evaluation] = await tx`select app_private.evaluate_forms_alerts_core(
    '2026-06-02T10:00:00.000Z'::timestamptz,${f.wsA.id}::uuid,250
  ) as result`;
  expect(evaluation!.result).toEqual({ status: 'ok', enqueued: 1 });
  const [occurrence] =
    await tx`select id,job_id from app_private.form_alert_occurrences
    where workspace_id=${f.wsA.id} and schedule_id=${schedule!.id}`;
  return {
    f,
    scheduleId: schedule!.id as string,
    occurrenceId: occurrence!.id as string,
  };
}

async function expectMutation(label: string, run: () => Promise<void>) {
  let failed: unknown;
  try {
    await run();
  } catch (error) {
    failed = error;
  }
  expect(failed, `${label} mutant must fail the named assertion`).toBeDefined();
}

it('writes one IDs-only in-app delivery per queued occurrence and audits recipient reads/mark-read', async () => {
  await expect(
    db.begin(async (tx) => {
      const { f, scheduleId, occurrenceId } = await fixture(tx);
      const [first] =
        await tx`select app_private.write_f15_in_app_alert(${occurrenceId}) as id`;
      const [second] =
        await tx`select app_private.write_f15_in_app_alert(${occurrenceId}) as id`;
      expect(first!.id).toBe(second!.id);
      const deliveries =
        await tx`select d.id,d.channel,d.status,i.recipient_user_id,
          i.source_assignment_id,i.stage,i.read_at
        from app_private.form_alert_deliveries d
        join app_private.form_alert_inbox i on i.delivery_id=d.id
        where d.workspace_id=${f.wsA.id} and d.alert_occurrence_id=${occurrenceId}`;
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({
        channel: 'in_app',
        status: 'delivered',
        recipient_user_id: f.trainerA.userId,
        source_assignment_id: expect.any(String),
        stage: 'client_trainer_24h',
        read_at: null,
      });
      const [job] = await tx`select payload from public.jobs
        where id=(select job_id from app_private.form_alert_occurrences where id=${occurrenceId})`;
      expect(Object.keys(job!.payload as object).sort()).toEqual([
        'alert_id',
        'recipient_id',
        'stage',
      ]);
      expect(
        await tx`select id from app_private.form_alert_inbox
        where workspace_id=${f.wsA.id} and delivery_id=${deliveries[0]!.id}`,
      ).toHaveLength(1);

      await tx`select set_config('request.jwt.claims',${JSON.stringify({
        sub: f.trainerB.userId,
        role: 'authenticated',
      })},true)`;
      await tx`set local role authenticated`;
      const otherRecipient =
        await tx`select * from public.read_form_alert_inbox(20,null)`;
      expect(otherRecipient).toEqual([]);
      await tx`reset role`;
      await tx`select set_config('request.jwt.claims',${JSON.stringify({
        sub: f.trainerA.userId,
        role: 'authenticated',
      })},true)`;
      await tx`set local role authenticated`;
      const visible =
        await tx`select * from public.read_form_alert_inbox(20,null)`;
      expect(visible).toHaveLength(1);
      expect(visible[0]!.source_assignment_id).toBeTruthy();
      expect(
        await tx`select public.mark_form_alert_read(${deliveries[0]!.id}) as result`,
      ).toMatchObject([{ result: { status: 'read' } }]);
      expect(
        await tx`select public.mark_form_alert_read(${deliveries[0]!.id}) as result`,
      ).toMatchObject([{ result: { status: 'read' } }]);
      await tx`reset role`;
      const [inbox] = await tx`select read_at from app_private.form_alert_inbox
        where delivery_id=${deliveries[0]!.id}`;
      expect(inbox!.read_at).not.toBeNull();
      const audit = await tx`select action,details from public.audit_events
        where target_id in (select id from app_private.form_alert_inbox
          where delivery_id=${deliveries[0]!.id})
          and action in ('form.alert_inbox_read','form.alert_inbox_marked_read')`;
      expect(audit.map((row) => row.action).sort()).toEqual([
        'form.alert_inbox_marked_read',
        'form.alert_inbox_read',
      ]);
      expect(
        audit.every(
          (row) =>
            Object.keys(row.details as Record<string, unknown>)
              .sort()
              .join(',') === 'delivery_id,source_assignment_id,stage',
        ),
      ).toBe(true);
      void scheduleId;
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('requires a current staff link for Telegram and claims a channel delivery once', async () => {
  await expect(
    db.begin(async (tx) => {
      const { f, occurrenceId } = await fixture(tx);
      const [unlinked] = await tx`select public.prepare_f15_telegram_delivery(
      ${occurrenceId},${f.trainerA.userId}) as result`;
      expect(unlinked!.result).toEqual({ status: 'unlinked' });
      const token = randomUUID()
        .replaceAll('-', '')
        .padEnd(64, 'c')
        .slice(0, 64);
      await tx`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
      values(extensions.digest(${token},'sha256'),${f.trainerA.userId},clock_timestamp()+interval '10 minutes')`;
      const [linked] =
        await tx`select app_private.consume_f15_telegram_link_token(${token},'12345') as result`;
      expect(linked!.result).toBe(true);
      const [ready] = await tx`select public.prepare_f15_telegram_delivery(
      ${occurrenceId},${f.trainerA.userId}) as result`;
      const context = ready!.result as { status: string; delivery_id: string };
      expect(context.status).toBe('ready');
      const [chat] =
        await tx`select public.claim_f15_telegram_delivery(${context.delivery_id}) as result`;
      expect(chat!.result).toBe('12345');
      const [replay] = await tx`select public.prepare_f15_telegram_delivery(
      ${occurrenceId},${f.trainerA.userId}) as result`;
      expect(replay!.result).toEqual({ status: 'already_delivered' });
      const [membership] =
        await tx`select workspace_id from public.workspace_memberships
      where user_id=${f.trainerA.userId} and revoked_at is null limit 1`;
      await tx`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
      where workspace_id=${membership!.workspace_id} and user_id=${f.trainerA.userId}`;
      const [revoked] = await tx`select public.prepare_f15_telegram_delivery(
      ${occurrenceId},${f.trainerA.userId}) as result`;
      expect(revoked!.result).toEqual({ status: 'unavailable' });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('forces recipient-only inbox RLS and exposes only authenticated reader RPCs', async () => {
  const tables = await db`
    select c.relname,c.relrowsecurity,c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='app_private' and c.relname in
      ('form_alert_deliveries','form_alert_inbox') order by c.relname
  `;
  expect(tables).toHaveLength(2);
  for (const table of tables)
    expect(table).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });
  const policies = await db`select policyname,roles,cmd,qual
    from pg_catalog.pg_policies
    where schemaname='app_private' and tablename='form_alert_inbox'`;
  expect(policies).toHaveLength(1);
  expect(policies[0]).toMatchObject({
    policyname: 'form_alert_inbox_recipient_only',
    roles: ['authenticated'],
    cmd: 'SELECT',
  });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const table of ['form_alert_deliveries', 'form_alert_inbox']) {
      const [privileges] = await db`
        select has_table_privilege(${role},${`app_private.${table}`},'SELECT') as can_read,
          has_table_privilege(${role},${`app_private.${table}`},'INSERT') as can_write
      `;
      expect(privileges).toEqual({ can_read: false, can_write: false });
    }
    const [publicRead] = await db`
      select has_function_privilege(${role},'public.read_form_alert_inbox(integer,timestamptz)','EXECUTE') as allowed
    `;
    const [publicMark] = await db`
      select has_function_privilege(${role},'public.mark_form_alert_read(uuid)','EXECUTE') as allowed
    `;
    expect(publicRead!.allowed).toBe(role === 'authenticated');
    expect(publicMark!.allowed).toBe(role === 'authenticated');
  }
});

it('kills a cross-recipient inbox-read mutant', async () => {
  await expectMutation('recipient-only read', () =>
    db.begin(async (tx) => {
      const { f } = await fixture(tx);
      const source = await definition(tx, readName);
      const mutant = source.replace(
        'where i.recipient_user_id=actor_id',
        'where true',
      );
      expect(mutant).not.toBe(source);
      await tx.unsafe(mutant);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({
        sub: f.trainerB.userId,
        role: 'authenticated',
      })},true)`;
      await tx`set local role authenticated`;
      const rows =
        await tx`select * from public.read_form_alert_inbox(20,null)`;
      expect(rows).toEqual([]);
      throw rollback;
    }),
  );
});

it('kills a duplicate in-app delivery mutant', async () => {
  await expectMutation('per-channel delivery uniqueness', () =>
    db.begin(async (tx) => {
      const { f, occurrenceId } = await fixture(tx);
      const source = await definition(tx, writeName);
      const mutant = source.replace(
        /on conflict \(workspace_id,alert_occurrence_id,stage,recipient_user_id,channel\)\s+do nothing/,
        '',
      );
      expect(mutant).not.toBe(source);
      const [constraint] = await tx`select conname from pg_catalog.pg_constraint
        where conrelid='app_private.form_alert_deliveries'::regclass and contype='u'
          and pg_catalog.pg_get_constraintdef(oid) like 'UNIQUE (workspace_id, alert_occurrence_id,%'`;
      expect(constraint?.conname).toBeTruthy();
      await tx.unsafe(
        `alter table app_private.form_alert_deliveries drop constraint "${constraint!.conname}"`,
      );
      await tx.unsafe(mutant);
      await tx`select app_private.write_f15_in_app_alert(${occurrenceId})`;
      await tx`select app_private.write_f15_in_app_alert(${occurrenceId})`;
      const rows = await tx`select id from app_private.form_alert_deliveries
        where alert_occurrence_id=${occurrenceId} and channel='in_app'`;
      expect(rows).toHaveLength(1);
      throw rollback;
    }),
  );
});

it('kills an answer-text-in-jobs payload mutant', async () => {
  await expectMutation('IDs-only enqueue payload', () =>
    db.begin(async (tx) => {
      const source = await definition(tx, coreName);
      const mutant = source.replace(
        "jsonb_build_object(\n            'alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage\n          )",
        "jsonb_build_object(\n            'answer_text','synthetic sensitive answer','alert_id',o.id,'recipient_id',recipient_row.user_id,'stage',stage_row.stage\n          )",
      );
      expect(mutant).not.toBe(source);
      await tx.unsafe(mutant);
      const { f, occurrenceId } = await fixture(tx);
      const [job] = await tx`select j.payload from public.jobs j
        join app_private.form_alert_occurrences o on o.job_id=j.id
        where o.id=${occurrenceId}`;
      expect(Object.keys(job!.payload as object).sort()).toEqual([
        'alert_id',
        'recipient_id',
        'stage',
      ]);
      void f;
      throw rollback;
    }),
  );
});
