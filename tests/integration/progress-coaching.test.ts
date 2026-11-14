import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRecoveryClientTarget } from './client-accounts-fixture';
import { anonClient } from './harness';
import { clientContext, graph, probe } from './registration-approval-fixture';

// Spec 023 US1/US2/US4 + the spec 024 read contract. Data scenarios run inside a
// rolled-back probe transaction with actors impersonated by signed JWT claims
// (SET ROLE authenticated). No f23 wall trusts session_user, so those denials reach
// the wall; the API-session test below exercises the same walls through PostgREST.

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
      label: { en: 'Body weight', ar: 'الوزن' },
    },
  ],
};

// Both forms share one published terms version: publishing a newer terms version
// makes every older one non-current, and F15 then treats those forms as not found.
async function currentTerms(tx: Tx) {
  const terms = `f23-${randomUUID()}`;
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  return terms;
}

async function publishedForm(
  tx: Tx,
  workspaceId: string,
  terms: string,
  definition: object,
) {
  const formId = randomUUID();
  await tx`insert into public.forms(id,workspace_id,name) values(${formId},${workspaceId},'F23 weekly check-in')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${terms},${tx.json(definition as JSONValue)},'published')`;
  return formId;
}

describe('spec 023 progress coaching (database walls and behavior)', () => {
  it('schedules, extracts, corrects, exposes the 024 contract and isolates workspaces', async () => {
    const f = await clientContext();
    await probe(async (tx) => {
      const ids = await graph(tx, f);
      const ws = f.wsA.id;
      const clientId = ids.client;
      const [client] =
        await tx`select auth_user_id from public.clients where id=${clientId}`;
      const clientUser = client!.auth_user_id as string;
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      // Authoritative activation fact, 7 Cairo days ago (synthetic stand-in for F19 T021).
      await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
        values(${ws},${ids.subscription},
          ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()})`;

      // Configuration: invalid definition, foreign/Sales denial, then success.
      const terms = await currentTerms(tx);
      const badForm = await publishedForm(tx, ws, terms, { questions: [] });
      const formId = await publishedForm(tx, ws, terms, checkinDefinition);
      const bad = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${badForm},1) as r`,
      );
      expect(bad[0]!.r).toEqual({ status: 'invalid' });
      await denied(
        tx,
        f.trainerB.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1)`,
      );
      await denied(
        tx,
        f.salesA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1)`,
      );
      const configured = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
      );
      expect(configured[0]!.r).toMatchObject({ status: 'configured' });

      // FR-001: day 7 after activation is due; the owner-only run materializes once.
      const [index] = await tx`select
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date) as due,
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date - 1) as before,
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date + 7) as next`;
      expect(index).toEqual({ due: 1, before: null, next: 2 });
      await denied(
        tx,
        f.po.userId,
        (sp) => sp`select app_private.f23_weekly_checkin_run(${today}::date)`,
      );
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const assignments = await tx`select id from public.form_assignments
        where workspace_id=${ws} and client_id=${clientId} and form_id=${formId}
          and occurrence_key=${'weekly_checkin:' + today}`;
      expect(assignments).toHaveLength(1);
      const assignmentId = assignments[0]!.id as string;

      // Client submits: measurement auto-extracted with source reference and units.
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignmentId},1,${tx.json({ workoutAdherence: 8, dietAdherence: 6, bodyWeight: 92.5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignmentId},1,clock_timestamp())`;
      const [measurement] =
        await tx`select id,value::text,unit_en,unit_ar,source_kind,source_assignment_id,
          recorded_on::text, updated_at::text as updated_at from public.progress_measurements
        where workspace_id=${ws} and client_id=${clientId} and measurement_type='bodyWeight'`;
      expect(measurement).toMatchObject({
        value: '92.5',
        unit_en: 'kg',
        unit_ar: 'كجم',
        source_kind: 'checkin',
        source_assignment_id: assignmentId,
        recorded_on: today,
      });
      const [adherenceRows] =
        await tx`select count(*)::int as n from public.progress_measurements
        where workspace_id=${ws} and measurement_type in ('workoutAdherence','dietAdherence')`;
      expect(adherenceRows!.n).toBe(0);

      // Spec 024 contract: values by name for coaching staff; Sales/foreign denied.
      const adherence = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select * from public.progress_weekly_adherence(${ws},${today}::date,${today}::date)`,
      );
      expect(adherence).toEqual([
        expect.objectContaining({
          client_id: clientId,
          assignment_id: assignmentId,
          workoutAdherence: 8,
          dietAdherence: 6,
        }),
      ]);
      for (const actor of [f.salesA.userId, f.trainerB.userId, clientUser])
        await denied(
          tx,
          actor,
          (sp) =>
            sp`select * from public.progress_weekly_adherence(${ws},${today}::date,${today}::date)`,
        );
      // A later F15 answer revision (correction) refreshes the stored values.
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignmentId},2,${tx.json({ workoutAdherence: 9, dietAdherence: 6, bodyWeight: 92.5 })})`;
      const refreshed = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select "workoutAdherence" from public.progress_weekly_adherence(${ws},${today}::date,${today}::date)`,
      );
      expect(refreshed).toEqual([{ workoutAdherence: 9 }]);
      const [readAudit] = await tx`select details from public.audit_events
        where workspace_id=${ws} and action='progress.adherence_read' order by id desc limit 1`;
      expect(readAudit!.details).toEqual({ from: today, to: today, rows: 1 });
      const baselines = await asUser(
        tx,
        f.woA.userId,
        (sp) =>
          sp`select measurement_type, baseline_value::text, measurement_count
          from public.progress_measurement_baselines(${ws},${today}::date)`,
      );
      expect(baselines).toEqual([
        {
          measurement_type: 'bodyWeight',
          baseline_value: '92.5',
          measurement_count: 1,
        },
      ]);
      await denied(
        tx,
        f.trainerB.userId,
        (sp) =>
          sp`select * from public.progress_measurement_history(${ws},${today}::date,${today}::date)`,
      );

      // FR-012/FR-015: same-day manual duplicate rejected; client-only entry.
      const duplicate = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${clientId},'bodyWeight',93,${today}::date) as r`,
      );
      expect(duplicate[0]!.r).toEqual({
        status: 'duplicate_same_day',
        measurement_id: measurement!.id,
      });
      const earlier = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${clientId},'bodyWeight',93,${today}::date - 1) as r`,
      );
      expect(earlier[0]!.r).toMatchObject({ status: 'recorded' });
      const notMapped = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${clientId},'workoutAdherence',5,${today}::date - 2) as r`,
      );
      expect(notMapped[0]!.r).toEqual({ status: 'invalid' });
      await denied(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${clientId},'bodyWeight',93,${today}::date - 3)`,
      );

      // FR-013: a second staff member corrects in place; background audit only.
      // The expected version is sent as text: postgres.js would serialize a
      // timestamptz parameter through a JS Date and drop the microseconds, which
      // the optimistic-concurrency check correctly treats as a stale version.
      const corrected = await asUser(
        tx,
        f.woA.userId,
        (sp) =>
          sp`select public.correct_progress_measurement(${ws},${measurement!.id},91,${measurement!.updated_at}::text::timestamptz) as r`,
      );
      expect(corrected[0]!.r).toMatchObject({ status: 'corrected' });
      const stale = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.correct_progress_measurement(${ws},${measurement!.id},90,${measurement!.updated_at}::text::timestamptz) as r`,
      );
      expect(stale[0]!.r).toEqual({ status: 'conflict' });
      await denied(
        tx,
        f.trainerB.userId,
        (sp) =>
          sp`select public.correct_progress_measurement(${ws},${measurement!.id},90,now())`,
      );
      await denied(
        tx,
        f.salesA.userId,
        (sp) =>
          sp`select public.correct_progress_measurement(${ws},${measurement!.id},90,now())`,
      );
      const [correction] =
        await tx`select change_kind,actor_user_id,previous_value::text,new_value::text
        from app_private.progress_measurement_corrections where measurement_id=${measurement!.id}`;
      expect(correction).toEqual({
        change_kind: 'trainer_correction',
        actor_user_id: f.woA.userId,
        previous_value: '92.5',
        new_value: '91',
      });
      const [correctionAudit] = await tx`select details from public.audit_events
        where action='progress.measurement_corrected' and target_id=${measurement!.id}`;
      expect(Object.keys(correctionAudit!.details).sort()).toEqual([
        'change_kind',
        'correction_id',
      ]);
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update app_private.progress_measurement_corrections set new_value=0 where measurement_id=${measurement!.id}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });

      // RLS: foreign trainer and Sales see no rows; the client sees own rows.
      const visible = async (actor: string) =>
        (
          await asUser(
            tx,
            actor,
            (sp) =>
              sp`select count(*)::int as n from public.progress_measurements where workspace_id=${ws}`,
          )
        )[0]!.n as number;
      expect(await visible(f.trainerB.userId)).toBe(0);
      expect(await visible(f.salesA.userId)).toBe(0);
      expect(await visible(clientUser)).toBe(2);
      expect(await visible(f.trainerA.userId)).toBeGreaterThanOrEqual(2);
      await denied(
        tx,
        f.trainerB.userId,
        (sp) => sp`select public.list_progress_measurements(${ws},${clientId})`,
      );
      const self = await asUser(
        tx,
        clientUser,
        (sp) => sp`select public.client_self_progress() as r`,
      );
      expect(self[0]!.r).toMatchObject({
        status: 'ok',
        measurements_status: 'ok',
        measurements: expect.arrayContaining([
          expect.objectContaining({
            measurement_type: 'bodyWeight',
            label: { en: 'Body weight', ar: 'الوزن' },
          }),
        ]),
      });

      // FR-008: KPI counts check-ins received.
      const kpi = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.progress_checkins_received_count(${ws},${today}::date,${today}::date) as r`,
      );
      expect(kpi[0]!.r).toEqual({ status: 'ok', received: 1 });
      await denied(
        tx,
        f.salesA.userId,
        (sp) =>
          sp`select public.progress_checkins_received_count(${ws},${today}::date,${today}::date)`,
      );

      // FR-002: a 3-day freeze from today shifts the cycle by 3 days, no catch-up.
      const freeze = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.subscription_freeze_operation(${sp.json({
            action: 'apply',
            workspace_id: ws,
            client_id: clientId,
            subscription_id: ids.subscription,
            request_key: randomUUID(),
            expected_revision: 0,
            duration_days: 3,
          } as JSONValue)}) as r`,
      );
      expect(freeze[0]!.r).toMatchObject({ status: 'applied' });
      const [shift] = await tx`select
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date) as frozen_day,
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date + 3) as resumed,
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date + 7) as unfrozen_slot,
        app_private.f23_checkin_due_index(${ws},${clientId},${today}::date + 10) as next`;
      expect(shift).toEqual({
        frozen_day: null,
        resumed: 1,
        unfrozen_slot: null,
        next: 2,
      });

      // FR-029/FR-030: timeline for the client and coaching staff; Sales/foreign denied.
      const timeline = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.client_progress_timeline(${ws},${clientId}) as r`,
      );
      const events = (
        timeline[0]!.r as { status: string; events: { event_type: string }[] }
      ).events.map((event) => event.event_type);
      expect(events).toEqual(['registration', 'freezeApply']);
      const staffTimeline = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.client_progress_timeline(${ws},${clientId}) as r`,
      );
      expect(staffTimeline[0]!.r).toEqual(timeline[0]!.r);
      for (const actor of [f.salesA.userId, f.trainerB.userId])
        await denied(
          tx,
          actor,
          (sp) => sp`select public.client_progress_timeline(${ws},${clientId})`,
        );
    });
  });

  it('denies the spec 024 readers and progress RPCs to real Sales, foreign-trainer, client and anon API sessions', async () => {
    const f = await clientContext();
    const ws = f.wsA.id;
    const pendingClient = await createRecoveryClientTarget(f);
    const someId = randomUUID();
    const window = {
      p_workspace_id: ws,
      p_from: '2026-11-01',
      p_to: '2026-11-30',
    };
    const readers: [string, Record<string, unknown>][] = [
      ['progress_weekly_adherence', window],
      ['progress_measurement_history', window],
      [
        'progress_measurement_baselines',
        { p_workspace_id: ws, p_as_of: '2026-11-30' },
      ],
    ];
    const staffRpcs: [string, Record<string, unknown>][] = [
      ...readers,
      ['progress_checkins_received_count', window],
      [
        'list_progress_measurements',
        { p_workspace_id: ws, p_client_id: pendingClient.clientId },
      ],
      [
        'client_progress_timeline',
        { p_workspace_id: ws, p_client_id: pendingClient.clientId },
      ],
      [
        'correct_progress_measurement',
        {
          p_workspace_id: ws,
          p_measurement_id: someId,
          p_value: 1,
          p_expected_updated_at: new Date().toISOString(),
        },
      ],
      [
        'configure_weekly_checkin_form',
        { p_workspace_id: ws, p_form_id: someId, p_version_number: 1 },
      ],
    ];
    const expectDenied = async (
      label: string,
      client: SupabaseClient,
      name: string,
      args: Record<string, unknown>,
    ) => {
      const result = await client.rpc(name, args);
      expect(result.error?.code, `${label} ${name}`).toBe('42501');
      expect(result.data, `${label} ${name}`).toBeNull();
    };
    const actors: [string, SupabaseClient][] = [
      ['Sales', f.salesA.client],
      ['foreign trainer', f.trainerB.client],
      ['client', pendingClient.client],
      ['anon', anonClient()],
    ];
    for (const [label, client] of actors)
      for (const [name, args] of staffRpcs)
        await expectDenied(label, client, name, args);
    // Client-only writer and self surface: staff and non-approved sessions are denied.
    const record = {
      p_workspace_id: ws,
      p_client_id: pendingClient.clientId,
      p_measurement_type: 'bodyWeight',
      p_value: 80,
      p_recorded_on: '2026-11-01',
    };
    for (const [label, client] of [
      ...actors,
      ['trainer', f.trainerA.client] as [string, SupabaseClient],
    ]) {
      await expectDenied(label, client, 'record_progress_measurement', record);
      await expectDenied(label, client, 'client_self_progress', {});
    }
    // The same walls admit real coaching staff of the workspace.
    for (const [name, args] of readers) {
      const allowed = await f.trainerA.client.rpc(name, args);
      expect(allowed.error, `trainer ${name}`).toBeNull();
      expect(Array.isArray(allowed.data), `trainer ${name}`).toBe(true);
    }
  });

  it('keeps helper functions private and the correction table unreadable', async () => {
    const f = await clientContext();
    await probe(async (tx) => {
      const [grants] = await tx`select
        has_function_privilege('authenticated','app_private.f23_write_measurement_correction(uuid,public.progress_measurements,text,uuid,numeric,text,text)','execute') as writer,
        has_function_privilege('authenticated','app_private.f23_weekly_checkin_run(date)','execute') as run,
        has_table_privilege('authenticated','app_private.progress_measurement_corrections','select') as corrections,
        has_table_privilege('authenticated','public.progress_measurements','insert') as insert_measurements,
        has_table_privilege('authenticated','public.progress_measurements','update') as update_measurements,
        has_table_privilege('authenticated','app_private.progress_checkin_adherence','select') as adherence_store,
        has_function_privilege('service_role','public.progress_weekly_adherence(uuid,date,date)','execute') as service_adherence,
        has_function_privilege('service_role','public.progress_measurement_baselines(uuid,date)','execute') as service_baselines`;
      expect(grants).toEqual({
        writer: false,
        run: false,
        corrections: false,
        insert_measurements: false,
        update_measurements: false,
        adherence_store: false,
        service_adherence: false,
        service_baselines: false,
      });
      await denied(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select count(*) from app_private.progress_measurement_corrections`,
      );
    });
  });
});
