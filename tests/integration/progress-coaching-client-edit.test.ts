import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { anonClient } from './harness';
import { clientContext, graph, probe } from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

// Spec 023 T026 (PO 2026-11-14 "Add + edit own") and the weekly check-in
// configuration read. Rolled-back probe; actors are impersonated with JWT claims
// under SET ROLE authenticated, as in progress-coaching.test.ts.

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

const checkinDefinition = {
  title: { en: 'Weekly check-in', ar: 'المتابعة الأسبوعية' },
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

async function activate(
  tx: Tx,
  ws: string,
  subscription: string,
  today: string,
) {
  await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
    values(${ws},${subscription},
      ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
}

describe('spec 023 client edit of own measurements and check-in configuration', () => {
  it('lets a client edit only their own manual rows, audited, behind the client wall', async () => {
    const f = await clientContext();
    // Each client consumes its registration link, so the second needs its own.
    const otherLink = checked(await issue(f)) as string;
    await probe(async (tx) => {
      const ws = f.wsA.id;
      const own = await graph(tx, f);
      const other = await graph(tx, f, { linkId: otherLink });
      const users = await tx`select id,auth_user_id from public.clients
        where id in ${tx([own.client, other.client])}`;
      const userOf = (id: string) =>
        users.find((row) => row.id === id)!.auth_user_id as string;
      const clientUser = userOf(own.client);
      const otherUser = userOf(other.client);
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      await activate(tx, ws, own.subscription, today);
      await activate(tx, ws, other.subscription, today);

      // Check-in form, configured by a trainer; plus a retired-free invalid form.
      const terms = `f23-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${terms},'terms','published')`;
      const formId = randomUUID();
      const plainFormId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name) values
        (${formId},${ws},'F23 weekly check-in'),(${plainFormId},${ws},'F23 plain form')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${ws},${formId},1,${terms},${tx.json(checkinDefinition as JSONValue)},'published'),
          (${ws},${plainFormId},1,${terms},${tx.json({ questions: [] })},'published')`;

      // Configuration read: coaching staff with assign_intake_form only.
      const before = await asUser(
        tx,
        f.trainerA.userId,
        (sp) => sp`select public.weekly_checkin_configuration(${ws}) as r`,
      );
      expect(before[0]!.r).toMatchObject({ status: 'ok', current: null });
      const listed = (
        before[0]!.r as { forms: { form_id: string; valid: boolean }[] }
      ).forms
        .filter((form) =>
          ([formId, plainFormId] as string[]).includes(form.form_id),
        )
        .map((form) => [form.form_id, form.valid]);
      expect(listed).toEqual(
        expect.arrayContaining([
          [formId, true],
          [plainFormId, false],
        ]),
      );
      for (const actor of [f.trainerB.userId, f.salesA.userId, clientUser])
        await denied(
          tx,
          actor,
          (sp) => sp`select public.weekly_checkin_configuration(${ws})`,
        );
      const configured = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
      );
      expect(configured[0]!.r).toMatchObject({ status: 'configured' });
      const after = await asUser(
        tx,
        f.woA.userId,
        (sp) => sp`select public.weekly_checkin_configuration(${ws}) as r`,
      );
      expect(after[0]!.r).toMatchObject({
        current: { form_id: formId, version_number: 1 },
      });

      // Entry options on the client self surface.
      const self = await asUser(
        tx,
        clientUser,
        (sp) => sp`select public.client_self_progress() as r`,
      );
      expect(self[0]!.r).toMatchObject({
        status: 'ok',
        workspace_id: ws,
        client_id: own.client,
        today,
        entry_types: [
          {
            id: 'bodyWeight',
            label: { en: 'Body weight', ar: 'الوزن' },
            unit_en: 'kg',
            unit_ar: 'كجم',
            min: 20,
            max: 400,
          },
        ],
      });

      // The client adds a manual row, then edits it with the version.
      const recorded = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${own.client},'bodyWeight',93,${today}::date - 1) as r`,
      );
      const measurementId = (recorded[0]!.r as { measurement_id: string })
        .measurement_id;
      const [row] =
        await tx`select updated_at::text as v from public.progress_measurements where id=${measurementId}`;
      const version = row!.v as string;
      const update = (actor: string, value: number, v = version) =>
        asUser(
          tx,
          actor,
          (sp) =>
            sp`select public.update_own_progress_measurement(${ws},${measurementId},${value},${v}::text::timestamptz) as r`,
        );
      expect((await update(clientUser, 500))[0]!.r).toEqual({
        status: 'invalid',
      });
      expect((await update(clientUser, 92))[0]!.r).toMatchObject({
        status: 'updated',
      });
      expect((await update(clientUser, 91))[0]!.r).toEqual({
        status: 'conflict',
      });
      const [stored] =
        await tx`select value::text, updated_by from public.progress_measurements where id=${measurementId}`;
      expect(stored).toEqual({ value: '92', updated_by: clientUser });
      const [edit] =
        await tx`select change_kind,actor_user_id,previous_value::text,new_value::text
        from app_private.progress_measurement_corrections where measurement_id=${measurementId}`;
      expect(edit).toEqual({
        change_kind: 'client_edit',
        actor_user_id: clientUser,
        previous_value: '93',
        new_value: '92',
      });
      const [audit] = await tx`select details from public.audit_events
        where action='progress.measurement_corrected' and target_id=${measurementId}`;
      expect(Object.keys(audit!.details).sort()).toEqual([
        'change_kind',
        'correction_id',
      ]);

      // Foreign client of the same workspace: indistinguishable from missing.
      expect((await update(otherUser, 90))[0]!.r).toEqual({
        status: 'not_found',
      });
      // Staff as client, Sales, and a foreign workspace id are denied at the wall.
      for (const actor of [
        f.trainerA.userId,
        f.woA.userId,
        f.salesA.userId,
        f.trainerB.userId,
      ])
        await denied(
          tx,
          actor,
          (sp) =>
            sp`select public.update_own_progress_measurement(${ws},${measurementId},90,now())`,
        );
      await denied(
        tx,
        clientUser,
        (sp) =>
          sp`select public.update_own_progress_measurement(${f.wsB.id},${measurementId},90,now())`,
      );

      // Check-in-extracted rows stay trainer-only.
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id=${ws} and client_id=${own.client} and form_id=${formId}`;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignment!.id},1,${tx.json({ workoutAdherence: 7, dietAdherence: 7, bodyWeight: 91.5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignment!.id},1,clock_timestamp())`;
      const [checkin] =
        await tx`select id, updated_at::text as v from public.progress_measurements
        where workspace_id=${ws} and client_id=${own.client} and source_kind='checkin'`;
      const notEditable = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.update_own_progress_measurement(${ws},${checkin!.id},90,${checkin!.v}::text::timestamptz) as r`,
      );
      expect(notEditable[0]!.r).toEqual({ status: 'not_editable' });
    });
  });

  it('denies anon API sessions on the new RPCs', async () => {
    const f = await clientContext();
    const anon = anonClient();
    for (const [name, args] of [
      [
        'update_own_progress_measurement',
        {
          p_workspace_id: f.wsA.id,
          p_measurement_id: randomUUID(),
          p_value: 1,
          p_expected_updated_at: new Date().toISOString(),
        },
      ],
      ['weekly_checkin_configuration', { p_workspace_id: f.wsA.id }],
    ] as const) {
      const result = await anon.rpc(name, args);
      expect(result.error?.code, name).toBe('42501');
      expect(result.data, name).toBeNull();
    }
  });
});
