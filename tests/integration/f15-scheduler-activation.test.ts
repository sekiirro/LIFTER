import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  runTelegramJobs,
  type TelegramMessage,
} from '../../lib/forms/telegram-delivery';
import { admin, loadEnv, sql } from './harness';
import {
  clientContext,
  registered,
} from './registration-approval-operations-fixture';

// Opt in only on Stack D with LIFTER_F15_SCHEDULER_E2E=1. From the repository root:
// See specs/015-forms-intake/quickstart.md for the repository-portable Stack D command.

const db = sql();
const runTag = randomUUID().replaceAll('-', '').slice(0, 12);
const maxRunMs = 50 * 60 * 1000;
const schedulerE2EEnabled =
  process.env.LIFTER_F15_SCHEDULER_E2E === '1' &&
  process.env.LIFTER_SUPABASE_STACK === 'd';
let safeTargetConfirmed = false;
let cleanupAllowed = false;
let fixtureBaselineWorkspaceIds: string[] = [];
let fixtureBaselineUserIds: string[] = [];
let fixtureOwnedWorkspaceIds: string[] = [];
let fixtureOwnedUserIds: string[] = [];
let captureServer: Server | undefined;
type Captured = {
  chat_id: string;
  text: string;
  disable_web_page_preview: boolean;
};

async function insertAlertAssignment(
  tx: TransactionSql,
  workspaceId: string,
  clientId: string,
  tag: string,
  deadlineAt: string,
  configuredBy: string,
) {
  const formId = randomUUID();
  const assignmentId = randomUUID();
  const policyId = randomUUID();
  const occurrenceKey = `f15-sched-${tag}:${assignmentId}`;
  const terms = `f15-sched-${tag}-${randomUUID().slice(0, 8)}`;
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},${`S26 F15 Scheduler ${tag}`})`;
  await tx`insert into public.form_versions(
      workspace_id,form_id,version_number,terms_policy_version,definition,status
    ) values(${workspaceId},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  await tx`insert into app_private.form_assignment_policies(
      id,workspace_id,form_id,version_number,audience_kind,specific_client_ids,
      trigger_kind,timing,stop_conditions,configured_by
    ) values(
      ${policyId},${workspaceId},${formId},1,'specific_clients',${[clientId]}::uuid[],
      'manual','{"client_deadline_days":3}'::jsonb,
      '{"frozen":true,"inactive":true}'::jsonb,${configuredBy}
    )`;
  await tx`insert into app_private.form_assignment_occurrences(
      workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,
      version_number,trigger_kind,created_by
    ) values(
      ${workspaceId},${policyId},${occurrenceKey},clock_timestamp(),
      ${[clientId]}::uuid[],1,'manual',${configuredBy}
    )`;
  await tx`insert into public.form_assignments(
      id,workspace_id,client_id,form_id,version_number,terms_policy_version,
      version_snapshot,occurrence_key,audience_snapshot_at,client_deadline_at,
      policy_id,configured_by
    ) values(
      ${assignmentId},${workspaceId},${clientId},${formId},1,${terms},
      ${tx.json({ questions: [] })},${occurrenceKey},clock_timestamp(),
      ${deadlineAt}::timestamptz,${policyId},${configuredBy}
    )`;
  const [schedule] = await tx`select id from app_private.form_alert_schedules
    where workspace_id=${workspaceId} and source_assignment_id=${assignmentId}
      and alert_kind='client_late'`;
  if (!schedule) throw new Error('Tagged synthetic schedule insert failed');
  return { assignmentId, scheduleId: schedule.id as string };
}

function loopbackCaptureTransport(
  server: Server,
  captured: Captured[],
  failChatOnce: string,
) {
  const address = server.address();
  if (!address || typeof address === 'string' || address.port !== 3317)
    throw new Error('F15 capture stub did not bind expected port');
  return {
    async send(message: TelegramMessage) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('test_transport_disabled_in_production');
      const url = new URL('http://127.0.0.1:3317/capture');
      if (url.hostname !== '127.0.0.1' || url.port !== '3317')
        throw new Error('test_transport_loopback_only');
      const payload = {
        chat_id: message.chatId,
        text: message.text,
        disable_web_page_preview: true,
      };
      captured.push(payload);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
      });
      if (message.chatId === failChatOnce) {
        failChatOnce = '';
      }
      if (!response.ok) throw new Error('synthetic_capture_failure');
    },
  };
}

async function waitForSuccessfulRuns(
  jobId: number,
  target: number,
  maxMs: number,
) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const [row] = await db`
      select count(*)::int as count
      from cron.job_run_details
      where jobid=${jobId} and status='succeeded'
    `;
    if ((row?.count as number) >= target) return row!.count as number;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Timed out waiting for scheduled F15 cron cycles');
}

async function cleanupFixtures(
  tag: string,
  ownedWorkspaceIds: string[],
  ownedUserIds: string[],
  baselineWorkspaceIds: string[],
  baselineUserIds: string[],
) {
  const workspaceRows = await db`
    select id from public.workspaces
    where id=any(${ownedWorkspaceIds}::uuid[])
      and slug like ${`f15-s26-${tag.toLowerCase()}-%`}
  `;
  const taggedUsers = await db`
    select id from auth.users
    where id=any(${ownedUserIds}::uuid[])
      and raw_user_meta_data->>'f15_scheduler_run'=${tag}
  `;
  if (
    workspaceRows.length !== ownedWorkspaceIds.length ||
    taggedUsers.length !== ownedUserIds.length
  )
    throw new Error('Tagged synthetic scheduler cleanup ownership mismatch');
  await db.begin(async (tx) => {
    await tx`set local session_replication_role='replica'`;
    const cols = await tx`
      select table_schema,table_name,column_name
      from information_schema.columns
      where table_schema in ('public','app_private') and data_type='uuid'
        and (column_name='workspace_id'
          or column_name ~* '(user|actor|created_by|granted_by|revoked_by|configured_by)')
      order by table_schema,table_name,column_name
    `;
    for (const col of cols) {
      const schema = String(col.table_schema).replaceAll('"', '""');
      const table = String(col.table_name).replaceAll('"', '""');
      const column = String(col.column_name).replaceAll('"', '""');
      const isWorkspace = column === 'workspace_id';
      const ids = isWorkspace ? ownedWorkspaceIds : ownedUserIds;
      if (!ids.length) continue;
      await tx.unsafe(
        `delete from "${schema}"."${table}" where "${column}" = any($1::uuid[])`,
        [ids],
      );
    }
    if (ownedWorkspaceIds.length)
      await tx`delete from public.workspaces where id=any(${ownedWorkspaceIds}::uuid[])`;
    await tx`delete from app_private.terms_policy_versions where version like ${`f15-sched-${tag}-%`}`;
  });
  const client = admin();
  for (const userId of ownedUserIds) {
    const removed = await client.auth.admin.deleteUser(userId);
    if (removed.error) throw new Error('Tagged synthetic auth cleanup failed');
  }
  const [preserved] = await db`
    select
      (select count(*)::int from public.workspaces
        where id=any(${baselineWorkspaceIds}::uuid[])) as workspaces,
      (select count(*)::int from auth.users
        where id=any(${baselineUserIds}::uuid[])) as users
  `;
  expect(preserved).toMatchObject({
    workspaces: baselineWorkspaceIds.length,
    users: baselineUserIds.length,
  });
}

function assertLoopbackTarget() {
  const { apiUrl, dbUrl } = loadEnv();
  for (const [label, value] of [
    ['API', apiUrl],
    ['database', dbUrl],
  ] as const) {
    const hostname = new URL(value).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname))
      throw new Error(`F15 scheduler E2E refuses non-loopback ${label} host`);
  }
  safeTargetConfirmed = true;
}

async function finalizeSchedulerE2E() {
  if (!schedulerE2EEnabled || !safeTargetConfirmed || !cleanupAllowed) return;
  let schedulerIsOff = false;
  try {
    await db`select app_private.f15_alert_schedule_deactivate()`;
    const [cron] = await db`select count(*)::int as count from cron.job`;
    schedulerIsOff = cron!.count === 0;
    expect(cron!.count).toBe(0);
  } finally {
    if (captureServer?.listening)
      await new Promise<void>((resolve) =>
        captureServer!.close(() => resolve()),
      );
    captureServer = undefined;
    if (cleanupAllowed && schedulerIsOff) {
      await cleanupFixtures(
        runTag,
        fixtureOwnedWorkspaceIds,
        fixtureOwnedUserIds,
        fixtureBaselineWorkspaceIds,
        fixtureBaselineUserIds,
      );
      cleanupAllowed = false;
    }
  }
}

describe.runIf(
  process.env.LIFTER_F15_SCHEDULER_E2E === '1' &&
    process.env.LIFTER_SUPABASE_STACK === 'd',
)(
  'F15 scheduler E2E requires LIFTER_F15_SCHEDULER_E2E=1 and LIFTER_SUPABASE_STACK=d; skipped otherwise',
  () => {
    it(
      'runs owner-activated F15 schedules through three cycles and delivers only through loopback fake transport',
      async () => {
        try {
          assertLoopbackTarget();
          if (process.env.TELEGRAM_BOT_TOKEN)
            throw new Error('D test process has Telegram token configured');
          const [baseline] = await db`
        select coalesce((select array_agg(id) from auth.users),array[]::uuid[]) as user_ids,
          coalesce((select array_agg(id) from public.workspaces),array[]::uuid[]) as workspace_ids,
          (select count(*)::int from app_private.form_alert_schedules) as schedules,
          (select count(*)::int from app_private.form_alert_occurrences) as occurrences,
          (select count(*)::int from app_private.form_alert_deliveries) as deliveries,
          (select count(*)::int from app_private.form_alert_inbox) as inbox_rows,
          (select count(*)::int from public.jobs where kind='forms.alert') as alert_jobs,
          (select count(*)::int from cron.job) as cron_jobs,
          exists(select 1 from pg_extension where extname in ('pg_net','http')) as outbound_extension,
          to_regclass('net.http_request_queue') is not null as net_queue,
          current_user as db_user
      `;
          expect(baseline).toMatchObject({
            schedules: 0,
            occurrences: 0,
            deliveries: 0,
            inbox_rows: 0,
            alert_jobs: 0,
            cron_jobs: 0,
            outbound_extension: false,
            net_queue: false,
            db_user: 'postgres',
          });
          fixtureBaselineWorkspaceIds = baseline!.workspace_ids as string[];
          fixtureBaselineUserIds = baseline!.user_ids as string[];
          cleanupAllowed = true;

          const f = await clientContext();
          const clientFixture = await registered(f);
          const users = [
            f.actors.po,
            f.actors.woA,
            f.actors.salesA,
            f.actors.trainerA,
            f.actors.woB,
            f.actors.salesB,
            f.actors.trainerB,
            f.actors.revoked,
            f.actors.noProfile,
            f.actors.client,
            { userId: clientFixture.userId },
          ];
          const userIds = users.map((user) => user.userId);
          fixtureOwnedWorkspaceIds = [f.wsA.id, f.wsB.id];
          fixtureOwnedUserIds = userIds;
          const slugTag = runTag.toLowerCase();
          await db`update public.workspaces set
      name=${`S26 F15 Scheduler ${runTag} A`},slug=${`f15-s26-${slugTag}-a`}
      where id=${f.wsA.id}`;
          await db`update public.workspaces set
      name=${`S26 F15 Scheduler ${runTag} B`},slug=${`f15-s26-${slugTag}-b`}
      where id=${f.wsB.id}`;
          await db`
      update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
        || jsonb_build_object('f15_scheduler_run',${runTag}::text,'display_name',${`S26 F15 Scheduler ${runTag}`}::text)
      where id=any(${userIds}::uuid[])
    `;
          const [tagged] = await db`
      select count(*)::int as users,
        bool_and(email like '%@example.test') as test_emails,
        bool_and(raw_user_meta_data->>'f15_scheduler_run'=${runTag}) as run_tagged
      from auth.users where id=any(${userIds}::uuid[])
    `;
          expect(tagged).toMatchObject({
            users: userIds.length,
            test_emails: true,
            run_tagged: true,
          });

          const deadline = new Date(
            Date.now() - 49 * 60 * 60 * 1000,
          ).toISOString();
          let assignmentB: { assignmentId: string; scheduleId: string };
          await db.begin(async (tx) => {
            await insertAlertAssignment(
              tx,
              f.wsA.id,
              clientFixture.id,
              runTag + '-a',
              deadline,
              f.actors.po.userId,
            );
            assignmentB = await insertAlertAssignment(
              tx,
              f.wsA.id,
              clientFixture.id,
              runTag + '-b',
              deadline,
              f.actors.po.userId,
            );
            await insertAlertAssignment(
              tx,
              f.wsA.id,
              clientFixture.id,
              runTag + '-c',
              deadline,
              f.actors.po.userId,
            );
          });

          for (const [owner, chatId] of [
            [f.actors.po, '991001'],
            [f.actors.woA, '991002'],
          ] as const) {
            const linkToken = randomUUID()
              .replaceAll('-', '')
              .padEnd(64, 'f')
              .slice(0, 64);
            await db`insert into app_private.f15_telegram_link_tokens(token_hash,user_id,expires_at)
        values(extensions.digest(${linkToken},'sha256'),${owner.userId},clock_timestamp()+interval '10 minutes')`;
            const [linked] =
              await db`select app_private.consume_f15_telegram_link_token(${linkToken},${chatId}) as ok`;
            expect(linked!.ok).toBe(true);
          }

          let failedOnce = false;
          const firstCycle = new Promise<void>((resolve, reject) => {
            captureServer = createServer(async (req, res) => {
              if (
                req.method !== 'POST' ||
                req.url !== '/capture' ||
                !req.socket.remoteAddress?.includes('127.0.0.1')
              ) {
                res.writeHead(404).end();
                return;
              }
              let body = '';
              for await (const part of req) body += part;
              const captured = JSON.parse(body) as Captured;
              resolve();
              const fail =
                captured.chat_id === '991001' &&
                captured.text.includes('/forms/alerts') &&
                !failedOnce;
              if (fail) failedOnce = true;
              res.writeHead(fail ? 503 : 200, {
                'content-type': 'application/json',
              });
              res.end(JSON.stringify({ ok: !fail }));
            });
            captureServer.once('error', reject);
            captureServer.listen(3317, '127.0.0.1');
          });
          const captureRows: Captured[] = [];
          await new Promise<void>((resolve, reject) => {
            captureServer!.once('listening', () => resolve());
            captureServer!.once('error', reject);
          });
          const transport = loopbackCaptureTransport(
            captureServer!,
            captureRows,
            '991001',
          );

          await db`select app_private.f15_alert_schedule_activate()`;
          const [job] = await db`select jobid,schedule,command,username
        from cron.job where jobname='lifter-f15-alerts'`;
          expect(job).toMatchObject({
            schedule: '*/5 * * * *',
            command: 'select app_private.f15_alert_schedule_run();',
            username: 'postgres',
          });
          const jobId = job!.jobid as number;

          await waitForSuccessfulRuns(jobId, 1, 8 * 60 * 1000);
          const [first] = await db`
        select count(*)::int as occurrences,
          count(distinct (schedule_id,stage,recipient_user_id))::int as occurrence_keys,
          count(*) filter (where stage='client_owners_immediate')::int as owner_immediate
        from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id}
      `;
          expect(first).toEqual({
            occurrences: 6,
            occurrence_keys: 6,
            owner_immediate: 6,
          });
          const recipients = await db`
        select stage,recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} order by stage,recipient_user_id
      `;
          expect(
            recipients
              .filter((row) => row.stage === 'client_owners_immediate')
              .map((row) => row.recipient_user_id)
              .sort(),
          ).toEqual(
            [
              f.actors.po.userId,
              f.actors.woA.userId,
              f.actors.po.userId,
              f.actors.woA.userId,
              f.actors.po.userId,
              f.actors.woA.userId,
            ].sort(),
          );
          const [inbox] = await db`
        select count(*)::int as rows,
          count(*) filter (where d.channel='in_app' and d.status='delivered')::int as delivered,
          count(*) filter (where i.recipient_user_id<>o.recipient_user_id)::int as recipient_mismatch
        from app_private.form_alert_inbox i
        join app_private.form_alert_deliveries d on d.id=i.delivery_id
        join app_private.form_alert_occurrences o on o.id=d.alert_occurrence_id
        where i.workspace_id=${f.wsA.id}
      `;
          expect(inbox).toEqual({
            rows: 6,
            delivered: 6,
            recipient_mismatch: 0,
          });
          const enqueuedAudit = await db`
        select details from public.audit_events
        where workspace_id=${f.wsA.id} and action='form.alert_enqueued'
      `;
          expect(enqueuedAudit).toHaveLength(6);
          expect(
            enqueuedAudit.every(
              (row) =>
                Object.keys(row.details as object)
                  .sort()
                  .join(',') === 'recipient_id,schedule_id,stage',
            ),
          ).toBe(true);
          const [scheduleAudit] = await db`
        select count(*)::int as count from public.audit_events
        where workspace_id=${f.wsA.id} and action='form.alert_scheduled'
      `;
          expect(scheduleAudit!.count).toBe(3);
          const jobs = await db`
        select payload from public.jobs where kind='forms.alert' and workspace_id=${f.wsA.id}
      `;
          expect(jobs).toHaveLength(6);
          expect(
            jobs.every(
              (row) =>
                Object.keys(row.payload as object)
                  .sort()
                  .join(',') === 'alert_id,recipient_id,stage',
            ),
          ).toBe(true);

          // Revoke an owner after scheduler enqueue but before Telegram preparation/claim.
          await db`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${f.actors.po.userId}
        where workspace_id=${f.wsA.id} and user_id=${f.actors.woA.userId} and revoked_at is null`;
          const [revokedLink] =
            await db`select revoked_at from app_private.f15_telegram_links where user_id=${f.actors.woA.userId}`;
          expect(revokedLink!.revoked_at).not.toBeNull();
          const workerClient = admin();
          const initialDelivery = await runTelegramJobs({
            client: workerClient,
            transport,
            appUrl: 'https://app.example.test',
          });
          expect(initialDelivery.failed).toBeGreaterThanOrEqual(2); // one revoked recipient and the injected transport failure
          await firstCycle;
          const alertMessage = {
            chat_id: '991001',
            text: 'You have a new form alert. Open your in-app inbox: https://app.example.test/forms/alerts',
            disable_web_page_preview: true,
          };
          expect(captureRows).toEqual([
            alertMessage,
            alertMessage,
            alertMessage,
          ]);
          expect(captureRows[0]!.text).not.toMatch(
            /client|answer|health|\bS26\b/i,
          );
          const [retry] = await db`
        select status,attempts,run_at,last_error
        from public.jobs
        where kind='forms.alert' and workspace_id=${f.wsA.id}
          and payload->>'recipient_id'=${f.actors.po.userId}
          and payload->>'stage'='client_owners_immediate'
          and status='pending'
      `;
          expect(retry!.attempts).toBe(1);
          expect(retry!.last_error).toBe('telegram_transport');
          expect(new Date(retry!.run_at as string).getTime()).toBeGreaterThan(
            Date.now() + 50_000,
          );
          const revokedJobs = await db`
        select status,last_error from public.jobs
        where kind='forms.alert' and workspace_id=${f.wsA.id}
          and payload->>'recipient_id'=${f.actors.woA.userId}
          and payload->>'stage'='client_owners_immediate'
      `;
          expect(revokedJobs).toHaveLength(3);
          expect(
            revokedJobs.every(
              (job) =>
                job.status === 'dead' &&
                job.last_error === 'authorization_changed',
            ),
          ).toBe(true);

          await waitForSuccessfulRuns(jobId, 3, 18 * 60 * 1000);
          const [afterCycles] = await db`
        select count(*)::int as occurrences,
          count(distinct (schedule_id,stage,recipient_user_id))::int as occurrence_keys,
          count(*) filter (where stage='client_owners_immediate')::int as owner_immediate
        from app_private.form_alert_occurrences where workspace_id=${f.wsA.id}
      `;
          expect(afterCycles).toEqual({
            occurrences: 6,
            occurrence_keys: 6,
            owner_immediate: 6,
          });
          const afterCycleAudits = await db`
        select details from public.audit_events
        where workspace_id=${f.wsA.id} and action='form.alert_enqueued'
      `;
          expect(afterCycleAudits).toHaveLength(6);
          expect(
            afterCycleAudits.every(
              (row) =>
                Object.keys(row.details as object)
                  .sort()
                  .join(',') === 'recipient_id,schedule_id,stage',
            ),
          ).toBe(true);
          const postRevocationOwners = await db`
        select recipient_user_id from app_private.form_alert_occurrences
        where workspace_id=${f.wsA.id} and schedule_id=${assignmentB!.scheduleId}
          and stage='client_owners_immediate' order by recipient_user_id
      `;
          expect(
            postRevocationOwners.map((row) => row.recipient_user_id).sort(),
          ).toEqual([f.actors.po.userId, f.actors.woA.userId].sort());
          const [inboxAfterRevocation] = await db`
        select count(*)::int as rows,
          count(*) filter (where i.recipient_user_id<>o.recipient_user_id)::int as recipient_mismatch
        from app_private.form_alert_inbox i
        join app_private.form_alert_deliveries d on d.id=i.delivery_id
        join app_private.form_alert_occurrences o on o.id=d.alert_occurrence_id
        where i.workspace_id=${f.wsA.id}
      `;
          expect(inboxAfterRevocation).toEqual({
            rows: 6,
            recipient_mismatch: 0,
          });

          const delay = Math.max(
            0,
            new Date(retry!.run_at as string).getTime() - Date.now(),
          );
          if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay + 1000));
          const retried = await runTelegramJobs({
            client: workerClient,
            transport,
            appUrl: 'https://app.example.test',
          });
          expect(retried.failed).toBe(0);
          expect(captureRows).toEqual([
            alertMessage,
            alertMessage,
            alertMessage,
            alertMessage,
          ]);
          const telegram = await db`
        select status,delivered_at from app_private.form_alert_deliveries
        where workspace_id=${f.wsA.id} and channel='telegram'
          and recipient_user_id=${f.actors.po.userId}
      `;
          expect(telegram).toHaveLength(3);
          expect(telegram.every((row) => row.status === 'delivered')).toBe(
            true,
          );
          const unauthorized = await db`
        select id from app_private.form_alert_deliveries
        where workspace_id=${f.wsA.id} and channel='telegram'
          and recipient_user_id=${f.actors.woA.userId}
      `;
          expect(unauthorized).toEqual([]);
          expect(
            captureRows.every((capture) => capture.chat_id === '991001'),
          ).toBe(true);

          await db`select app_private.f15_alert_schedule_deactivate()`;
          const [inactive] =
            await db`select count(*)::int as count from cron.job`;
          expect(inactive!.count).toBe(0);
          const [beforeWait] = await db`
        select (select count(*)::int from app_private.form_alert_occurrences
          where workspace_id=${f.wsA.id}) as occurrences,
          (select count(*)::int from cron.job_run_details where jobid=${jobId}) as runs
      `;
          await new Promise((resolve) =>
            setTimeout(resolve, 5 * 60 * 1000 + 10_000),
          );
          const [afterWait] = await db`
        select (select count(*)::int from app_private.form_alert_occurrences
          where workspace_id=${f.wsA.id}) as occurrences,
          (select count(*)::int from cron.job_run_details where jobid=${jobId}) as runs
      `;
          expect(afterWait).toEqual(beforeWait);
          expect(afterWait!.runs).toBeGreaterThanOrEqual(3);
          const [finalCron] =
            await db`select count(*)::int as count from cron.job`;
          expect(finalCron!.count).toBe(0);
        } finally {
          await finalizeSchedulerE2E();
        }
      },
      maxRunMs,
    );
    afterAll(async () => {
      try {
        await finalizeSchedulerE2E();
      } finally {
        await db.end();
      }
    });
  },
);
