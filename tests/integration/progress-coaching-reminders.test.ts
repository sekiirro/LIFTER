import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { checkInReminders } from '../../lib/progress-coaching/checkins/schedule';
import { clientContext, graph, probe } from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

// Spec 023 T010 (FR-006, FR-007, FR-009, SC-003): weekly check-in reminders on the F22 client
// inbox seam. Everything runs inside a rolled-back probe transaction; actors are impersonated
// with JWT claims under SET ROLE authenticated.

type Tx = TransactionSql;

const checkinDefinition = {
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

describe('spec 023 weekly check-in reminders (client inbox seam)', () => {
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

  // Rollback-scoped: every caller runs inside probe(), which rolls the inserts back.
  async function configureCheckin(
    tx: Tx,
    f: Awaited<ReturnType<typeof clientContext>>,
  ) {
    const ws = f.wsA.id;
    const terms = `f23-rem-${randomUUID()}`;
    await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${terms},'terms','published')`;
    const formId = randomUUID();
    await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ws},'F23 weekly check-in')`;
    await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
      values(${ws},${formId},1,${terms},${tx.json(checkinDefinition as JSONValue)},'published')`;
    const configured = await asUser(
      tx,
      f.trainerA.userId,
      (sp) =>
        sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
    );
    expect(configured[0]!.r).toMatchObject({ status: 'configured' });
    return formId;
  }

  async function definition(tx: Tx, identity: string) {
    const [row] =
      await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
    return row!.d as string;
  }

  it('sends the day-of and follow-up reminders at 10:00 Cairo once, only while unanswered', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const ws = f.wsA.id;
      const own = await graph(tx, f);
      const other = await graph(tx, f, { linkId: otherLink });
      const userOf = async (clientId: string) =>
        (
          await tx`select auth_user_id from public.clients where id = ${clientId}`
        )[0]!.auth_user_id as string;
      const clientUser = await userOf(own.client);
      const otherUser = await userOf(other.client);
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      for (const subscription of [own.subscription, other.subscription])
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
          values(${ws},${subscription},
            ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      await configureCheckin(tx, f);
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id = ${ws} and client_id = ${own.client}
          and occurrence_key = ${'weekly_checkin:' + today}`;
      const assignmentId = assignment!.id as string;

      const at = (day: string, time: string) =>
        tx`select ((${day}::date)::timestamp + ${time}::interval) at time zone 'Africa/Cairo' as t`.then(
          (rows) => rows[0]!.t as Date,
        );
      const run = async (instant: Date) =>
        (
          await tx`select app_private.f23_checkin_reminders_run(${instant.toISOString()}::timestamptz) as n`
        )[0]!.n as number;
      const kinds = async (clientId: string) =>
        (
          await tx`select notice_kind, source_key from app_private.client_inbox_notices
            where workspace_id = ${ws} and client_id = ${clientId} order by created_at, notice_kind`
        ).map((row) => `${row.notice_kind}:${row.source_key === assignmentId}`);
      const tomorrow = (await tx`select (${today}::date + 1)::text as d`)[0]!
        .d as string;

      // The SQL instants agree with the unit-tested TypeScript schedule.
      const expected = checkInReminders(assignmentId, today);
      expect(Date.parse(expected[0]!.sendAt)).toBe(
        (await at(today, '10 hours')).getTime(),
      );
      expect(Date.parse(expected[1]!.sendAt)).toBe(
        (await at(tomorrow, '10 hours')).getTime(),
      );

      // Not before 10:00 on the due day.
      expect(await run(await at(today, '9 hours 59 minutes'))).toBe(0);
      // Exactly at 10:00: one day-of reminder for the client with the unanswered check-in.
      expect(await run(await at(today, '10 hours'))).toBeGreaterThanOrEqual(1);
      expect(await kinds(own.client)).toEqual(['checkin_reminder_day_of:true']);
      // Idempotent: reruns and a later hour create nothing new.
      expect(await run(await at(today, '10 hours'))).toBe(0);
      expect(await run(await at(today, '15 hours'))).toBe(0);
      expect(await kinds(own.client)).toEqual(['checkin_reminder_day_of:true']);

      // The follow-up is not due until 24 hours later.
      expect(await run(await at(tomorrow, '9 hours 59 minutes'))).toBe(0);
      expect(await run(await at(tomorrow, '10 hours'))).toBeGreaterThanOrEqual(
        1,
      );
      expect(await kinds(own.client)).toEqual([
        'checkin_reminder_day_of:true',
        'checkin_reminder_followup:true',
      ]);

      // The client reads only own reminder notices; another client and staff do not see them.
      const own1 = await asUser(
        tx,
        clientUser,
        (sp) => sp`select public.read_client_notices() as r`,
      );
      expect(
        (own1[0]!.r as { notices: { notice_kind: string }[] }).notices
          .map((notice) => notice.notice_kind)
          .sort(),
      ).toEqual(['checkin_reminder_day_of', 'checkin_reminder_followup']);
      const own2 = await asUser(
        tx,
        otherUser,
        (sp) => sp`select public.read_client_notices() as r`,
      );
      expect(
        (own2[0]!.r as { notices: { notice_kind: string }[] }).notices
          .map((notice) => notice.notice_kind)
          .filter((kind) => kind.startsWith('checkin_reminder'))
          .sort(),
      ).toEqual(['checkin_reminder_day_of', 'checkin_reminder_followup']);
      for (const staff of [f.trainerB.userId, f.trainerA.userId]) {
        const view = await asUser(
          tx,
          staff,
          (sp) => sp`select public.read_client_notices() as r`,
        );
        expect(view[0]!.r).toEqual({ status: 'invalid' });
      }
    });
  });

  it('sends no follow-up once the check-in is submitted, and no reminder to another workspace', async () => {
    const f = await clientContext();
    await probe(async (tx) => {
      const ws = f.wsA.id;
      const own = await graph(tx, f);
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
        values(${ws},${own.subscription},
          ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      await configureCheckin(tx, f);
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id = ${ws} and client_id = ${own.client}
          and occurrence_key = ${'weekly_checkin:' + today}`;
      const assignmentId = assignment!.id as string;
      const run = async (day: string, time: string) =>
        (
          await tx`select app_private.f23_checkin_reminders_run(
            (((${day}::date)::timestamp + ${time}::interval) at time zone 'Africa/Cairo')) as n`
        )[0]!.n as number;
      const tomorrow = (await tx`select (${today}::date + 1)::text as d`)[0]!
        .d as string;

      await run(today, '10 hours');
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignmentId},1,${tx.json({ workoutAdherence: 5, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignmentId},1,clock_timestamp())`;
      expect(await run(tomorrow, '10 hours')).toBe(0);
      const kinds =
        await tx`select notice_kind from app_private.client_inbox_notices
        where workspace_id = ${ws} and client_id = ${own.client}
          and notice_kind like 'checkin_reminder%'`;
      expect(kinds.map((row) => row.notice_kind)).toEqual([
        'checkin_reminder_day_of',
      ]);
      // Notices never cross workspaces: workspace B holds none for this client's assignment.
      const [foreign] =
        await tx`select count(*)::int as n from app_private.client_inbox_notices
        where workspace_id = ${f.wsB.id} and source_key = ${assignmentId}`;
      expect(foreign!.n).toBe(0);
    });
  });

  it('keeps the run owner-only and kills mutants of the 10:00 gate and the answered check', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const ws = f.wsA.id;
      const own = await graph(tx, f);
      const other = await graph(tx, f, { linkId: otherLink });
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      for (const subscription of [own.subscription, other.subscription])
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
          values(${ws},${subscription},
            ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      await configureCheckin(tx, f);
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id = ${ws} and client_id = ${own.client}
          and occurrence_key = ${'weekly_checkin:' + today}`;
      const assignmentId = assignment!.id as string;
      // The first client has already answered; the second has not.
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignmentId},1,${tx.json({ workoutAdherence: 5, dietAdherence: 5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignmentId},1,clock_timestamp())`;

      for (const actor of [f.po.userId, f.trainerA.userId, f.trainerB.userId])
        await denied(
          tx,
          actor,
          (sp) => sp`select app_private.f23_checkin_reminders_run()`,
        );

      const early = () =>
        tx`select app_private.f23_checkin_reminders_run(
          (((${today}::date)::timestamp + interval '9 hours 59 minutes') at time zone 'Africa/Cairo')) as n`.then(
          (rows) => rows[0]!.n as number,
        );
      const identity = 'app_private.f23_checkin_reminders_run(timestamptz)';
      const original = await definition(tx, identity);

      expect(await early()).toBe(0);
      const gate = original.replace(
        "if now_ts < ((reminder.send_day::timestamp + interval '10 hours') at time zone 'Africa/Cairo') then",
        'if false then',
      );
      expect(gate).not.toBe(original);
      await tx.unsafe(gate);
      let gateInvariantFailed = false;
      try {
        expect(await early()).toBe(0);
      } catch {
        gateInvariantFailed = true;
      }
      await tx.unsafe(original);
      expect(gateInvariantFailed, '10:00 gate mutant must fail').toBe(true);

      // Answered check-ins: the mutant without the submission filter keeps reminding.
      const late = () =>
        tx`select app_private.f23_checkin_reminders_run(
          (((${today}::date)::timestamp + interval '11 hours') at time zone 'Africa/Cairo')) as n`.then(
          (rows) => rows[0]!.n as number,
        );
      expect(await late()).toBe(0);
      const answered = original.replace(
        'where s.workspace_id = a.workspace_id and s.assignment_id = a.id)',
        'where s.workspace_id = a.workspace_id and s.assignment_id = a.id and false)',
      );
      expect(answered).not.toBe(original);
      await tx.unsafe(answered);
      let answeredInvariantFailed = false;
      try {
        expect(await late()).toBe(0);
      } catch {
        answeredInvariantFailed = true;
      }
      await tx.unsafe(original);
      expect(answeredInvariantFailed, 'answered-check mutant must fail').toBe(
        true,
      );
    });
  });
});
