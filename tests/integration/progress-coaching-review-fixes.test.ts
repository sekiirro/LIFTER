import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { clientContext, graph, probe } from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

// Spec 023 review fixes (PR #109 reviews A1, A2, A3, A7, A9, B2, T046): date floor, extraction lock,
// per-policy isolation of the weekly run, correction range, late reminders, idempotency, and
// rolled-back function mutants for the read/write walls. Everything runs in rolled-back probes.

type Tx = TransactionSql;
type Ctx = Awaited<ReturnType<typeof clientContext>>;

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
    {
      id: 'bodyWeight',
      sectionId: 'checkin',
      type: 'number',
      required: false,
      unit: { en: 'kg', ar: 'كجم' },
      validation: { min: 20, max: 400 },
      title: { en: 'Body weight', ar: 'الوزن' },
    },
  ],
};

describe('spec 023 review fixes', () => {
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

  async function code(
    tx: Tx,
    userId: string,
    run: (sp: Tx) => Promise<unknown>,
  ) {
    try {
      await asUser(tx, userId, run);
      return 'ok';
    } catch (error) {
      return (error as { code?: string }).code ?? 'error';
    }
  }

  // Rollback-scoped: every caller runs inside probe(), which rolls the inserts back.
  async function configureCheckin(tx: Tx, f: Ctx) {
    const ws = f.wsA.id;
    const terms = `f23-rev-${randomUUID()}`;
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

  async function world(tx: Tx, f: Ctx, otherLink: string, activate = true) {
    const ws = f.wsA.id;
    const own = await graph(tx, f);
    const other = await graph(tx, f, { linkId: otherLink });
    const userOf = async (id: string) =>
      (await tx`select auth_user_id from public.clients where id = ${id}`)[0]!
        .auth_user_id as string;
    const [clock] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
    const today = clock!.today as string;
    await tx`select set_config('request.jwt.claims','{}',true)`;
    if (activate)
      for (const subscription of [own.subscription, other.subscription])
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
          values(${ws},${subscription},
            ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
    await configureCheckin(tx, f);
    return {
      ws,
      own: own.client as string,
      other: other.client as string,
      ownUser: await userOf(own.client),
      otherUser: await userOf(other.client),
      today,
    };
  }

  async function definition(tx: Tx, identity: string) {
    const [row] =
      await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
    return row!.d as string;
  }

  /** The control holds, then a mutant with the control removed must break the same invariant. */
  async function killsMutant(
    tx: Tx,
    label: string,
    identity: string,
    edits: [string, string][],
    invariant: () => Promise<void>,
  ) {
    await invariant();
    const original = await definition(tx, identity);
    let mutant = original;
    for (const [from, to] of edits) {
      expect(mutant.includes(from), `${label}: anchor ${from}`).toBe(true);
      mutant = mutant.replace(from, to);
    }
    await tx.unsafe(mutant);
    let failed = false;
    try {
      await invariant();
    } catch {
      failed = true;
    }
    await tx.unsafe(original);
    expect(failed, `${label}: the mutant must fail its invariant`).toBe(true);
  }

  it('A1/A9/A2: date floor, correction range for manual rows, and the extraction row lock', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink);
      const record = (user: string, client: string, on: string, value = 90) =>
        asUser(
          tx,
          user,
          async (sp) =>
            (
              await sp`select public.record_progress_measurement(${w.ws},${client},'bodyWeight',${value},${on}::date) as r`
            )[0]!.r as { status: string; measurement_id?: string },
        );
      const [dates] = await tx`select
        (${w.today}::date - 100)::text as recent, (${w.today}::date - 400)::text as old`;

      // A1: an absurd or older-than-a-year date can never become the baseline.
      const floor = async () => {
        expect((await record(w.ownUser, w.own, '0001-01-01')).status).toBe(
          'invalid',
        );
        expect(
          (await record(w.ownUser, w.own, dates!.old as string)).status,
        ).toBe('invalid');
      };
      expect(
        (await record(w.ownUser, w.own, dates!.recent as string)).status,
      ).toBe('recorded');
      await killsMutant(
        tx,
        'date floor',
        'public.record_progress_measurement(uuid,uuid,text,numeric,date)',
        [
          [
            "or p_recorded_on < (clock_timestamp() at time zone 'Africa/Cairo')::date - 366 then",
            'and false then',
          ],
        ],
        floor,
      );

      // A9: a manual row is range-checked against the current check-in question on correction.
      const [row] =
        await tx`select id, updated_at::text as v from public.progress_measurements
        where client_id = ${w.own} and measurement_type = 'bodyWeight'`;
      const correct = (value: number) =>
        asUser(
          tx,
          f.trainerA.userId,
          async (sp) =>
            (
              await sp`select public.correct_progress_measurement(${w.ws},${row!.id},${value},${row!.v}::timestamptz) as r`
            )[0]!.r as { status: string },
        );
      expect((await correct(5)).status).toBe('invalid');
      expect((await correct(95)).status).toBe('corrected');

      // A2: the extraction trigger serializes on the same clients row lock as the manual entry.
      const trigger = await definition(
        tx,
        'app_private.f23_extract_checkin_measurements()',
      );
      expect(trigger).toMatch(/from public\.clients c[^;]*for update;/);
      const manual = await definition(
        tx,
        'public.record_progress_measurement(uuid,uuid,text,numeric,date)',
      );
      expect(manual).toMatch(/from public\.clients c[^;]*for update;/);
    });
  });

  it('A3/A4: one failing policy is skipped and audited, the run stays idempotent and a snapshot', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink);
      await tx`select app_private.f23_weekly_checkin_run(${w.today}::date)`;
      const count = async () =>
        (
          await tx`select count(*)::int as n from public.form_assignments
            where workspace_id = ${w.ws} and occurrence_key = ${'weekly_checkin:' + w.today}`
        )[0]!.n as number;
      expect(await count()).toBe(2);
      // Idempotent: a second run materializes nothing and the count is unchanged.
      expect(
        (
          await tx`select app_private.f23_weekly_checkin_run(${w.today}::date) as n`
        )[0]!.n,
      ).toBe(0);
      expect(await count()).toBe(2);
    });
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink);
      await tx`create function public.f23_test_fail() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`;
      await tx`create trigger f23_test_fail before insert on public.form_assignments
        for each row execute function public.f23_test_fail()`;
      const result =
        await tx`select app_private.f23_weekly_checkin_run(${w.today}::date) as n`;
      expect(result[0]!.n).toBe(0);
      const [skipped] =
        await tx`select count(*)::int as n from public.audit_events
        where action = 'form.weekly_checkin_policy_skipped' and workspace_id = ${w.ws}`;
      expect(skipped!.n).toBeGreaterThanOrEqual(1);
      const [made] =
        await tx`select count(*)::int as n from public.form_assignments
        where workspace_id = ${w.ws} and occurrence_key = ${'weekly_checkin:' + w.today}`;
      expect(made!.n).toBe(0);
    });
  });

  it('B2: a late start sends only the follow-up, never a stale day-of reminder', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink);
      await tx`select app_private.f23_weekly_checkin_run(${w.today}::date)`;
      const late = async () =>
        (
          await tx`select app_private.f23_checkin_reminders_run(
            (((${w.today}::date + 1)::timestamp + interval '11 hours') at time zone 'Africa/Cairo')) as n`
        )[0]!.n as number;
      await killsMutant(
        tx,
        'late day-of skip',
        'app_private.f23_checkin_reminders_run(timestamptz)',
        [
          [
            "and now_ts >= (((due.due_on + 1)::timestamp + interval '10 hours') at time zone 'Africa/Cairo') then",
            'and false then',
          ],
        ],
        async () => {
          const kinds = async () =>
            (
              await tx`select notice_kind from app_private.client_inbox_notices
                where workspace_id = ${w.ws} and client_id = ${w.own}
                  and notice_kind like 'checkin_reminder%'`
            ).map((row) => row.notice_kind);
          await late();
          expect(await kinds()).toEqual(['checkin_reminder_followup']);
        },
      );
    });
  });

  it('A7/T046: mutants of the measurement, timeline, self-view and contract-reader walls and the entitlement half', async () => {
    const f = await clientContext();
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink);
      const list = (user: string, client: string) =>
        code(
          tx,
          user,
          (sp) =>
            sp`select public.list_progress_measurements(${w.ws},${client})`,
        );

      // record: another client cannot record into this client's account.
      await killsMutant(
        tx,
        'record wall',
        'public.record_progress_measurement(uuid,uuid,text,numeric,date)',
        [
          [
            'if not app_private.f23_client_progress_visible(p_workspace_id, p_client_id) then',
            'if false then',
          ],
        ],
        async () => {
          expect(
            await code(
              tx,
              w.otherUser,
              (sp) =>
                sp`select public.record_progress_measurement(${w.ws},${w.own},'bodyWeight',90,${w.today}::date)`,
            ),
          ).toBe('42501');
        },
      );

      // list: another client and a foreign-workspace trainer cannot list this client.
      await killsMutant(
        tx,
        'list wall',
        'public.list_progress_measurements(uuid,uuid)',
        [
          [
            'and not app_private.f23_client_progress_visible(p_workspace_id, p_client_id) then',
            'and false then',
          ],
        ],
        async () => {
          expect(await list(w.otherUser, w.own)).toBe('42501');
          expect(await list(f.trainerB.userId, w.own)).toBe('42501');
        },
      );

      // timeline: Sales is denied; and the projection never leaks another client's events.
      await killsMutant(
        tx,
        'timeline wall',
        'public.client_progress_timeline(uuid,uuid)',
        [
          [
            'if not app_private.client_has_access(p_workspace_id, p_client_id)',
            'if false and not app_private.client_has_access(p_workspace_id, p_client_id)',
          ],
        ],
        async () => {
          expect(
            await code(
              tx,
              f.salesA.userId,
              (sp) =>
                sp`select public.client_progress_timeline(${w.ws},${w.own})`,
            ),
          ).toBe('42501');
        },
      );
      await killsMutant(
        tx,
        'timeline projection filter',
        'public.client_progress_timeline(uuid,uuid)',
        [
          [
            'where e.workspace_id = p_workspace_id and e.client_id = p_client_id',
            'where e.workspace_id = p_workspace_id',
          ],
        ],
        async () => {
          const events = await asUser(
            tx,
            w.ownUser,
            async (sp) =>
              (
                await sp`select public.client_progress_timeline(${w.ws},${w.own}) as r`
              )[0]!.r as { events: { event_type: string }[] },
          );
          expect(
            events.events.filter((e) => e.event_type === 'registration'),
          ).toHaveLength(1);
        },
      );

      // client_self_progress: staff are not clients.
      await killsMutant(
        tx,
        'self view wall',
        'public.client_self_progress()',
        [
          [
            "if matches <> 1 then raise exception 'not_permitted' using errcode = '42501'; end if;",
            'if false then null; end if;',
          ],
        ],
        async () => {
          expect(
            await code(
              tx,
              f.trainerA.userId,
              (sp) => sp`select public.client_self_progress()`,
            ),
          ).toBe('42501');
        },
      );

      // spec 024 readers: Sales and a foreign-workspace trainer are denied.
      for (const [fn] of [
        ['public.progress_weekly_adherence(uuid,date,date)'],
        ['public.progress_measurement_history(uuid,date,date)'],
        ['public.progress_measurement_baselines(uuid,date)'],
      ] as const) {
        const call = (user: string) =>
          code(tx, user, (sp) =>
            fn.includes('baselines')
              ? sp`select ${sp.unsafe(fn.split('(')[0]!)}(${w.ws},${w.today}::date)`
              : sp`select ${sp.unsafe(fn.split('(')[0]!)}(${w.ws},${w.today}::date - 7,${w.today}::date)`,
          );
        await killsMutant(
          tx,
          `reader ${fn}`,
          fn,
          [
            [
              "if not app_private.has_workspace_access(p_workspace_id, 'coaching_work') then",
              'if false then',
            ],
          ],
          async () => {
            expect(await call(f.salesA.userId)).toBe('42501');
            expect(await call(f.trainerB.userId)).toBe('42501');
          },
        );
      }

      // client RLS policy: another client sees none of this client's rows.
      await tx`select set_config('request.jwt.claims','{}',true)`;
      await tx`insert into public.progress_measurements(workspace_id,client_id,measurement_type,value,unit_en,unit_ar,recorded_on,source_kind,entered_by,updated_by)
        values(${w.ws},${w.own},'bodyWeight',90,'kg','كجم',${w.today}::date,'manual',${w.ownUser},${w.ownUser})`;
      const foreignRows = () =>
        asUser(
          tx,
          w.otherUser,
          async (sp) =>
            (
              await sp`select id from public.progress_measurements where client_id = ${w.own}`
            ).length,
        );
      expect(await foreignRows()).toBe(0);
      await tx`alter policy progress_measurements_client_read on public.progress_measurements using (true)`;
      let policyMutantFailed = false;
      try {
        expect(await foreignRows()).toBe(0);
      } catch {
        policyMutantFailed = true;
      }
      await tx`alter policy progress_measurements_client_read on public.progress_measurements using (app_private.f23_client_progress_visible(workspace_id, client_id))`;
      expect(policyMutantFailed, 'client RLS policy mutant must fail').toBe(
        true,
      );
      expect(await foreignRows()).toBe(0);
    });

    // The entitlement half: an un-activated client has no plan access, so measurements stay hidden.
    await probe(async (tx) => {
      const w = await world(tx, f, otherLink, false);
      await killsMutant(
        tx,
        'entitlement half',
        'app_private.f23_client_progress_visible(uuid,uuid)',
        [
          [
            "e.value->>'status' in ('active','frozen'))",
            "e.value->>'status' is not null)",
          ],
        ],
        async () => {
          const visible = await asUser(
            tx,
            w.ownUser,
            async (sp) =>
              (
                await sp`select app_private.f23_client_progress_visible(${w.ws},${w.own}) as v`
              )[0]!.v as boolean,
          );
          expect(visible).toBe(false);
        },
      );
    });
  });
});
