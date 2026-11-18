import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import { clientContext, graph, probe } from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';

// Spec 023 T022 / T046: CI-runnable database mutation evidence. Each control is
// first shown to hold, then replaced inside the rolled-back probe transaction by a
// mutant with the control removed; the paired invariant must then fail. The
// original definition is restored (and the probe rolls back regardless).

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

async function definition(tx: Tx, identity: string) {
  const [row] =
    await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
  return row!.d as string;
}

async function withFunctionMutant(
  tx: Tx,
  identity: string,
  mutate: (source: string) => string,
  body: () => Promise<void>,
) {
  const original = await definition(tx, identity);
  const mutant = mutate(original);
  if (mutant === original)
    throw new Error(`Mutation did not change ${identity}`);
  await tx.unsafe(mutant);
  try {
    await body();
  } finally {
    await tx.unsafe(original);
  }
}

async function expectInvariantFailure(
  label: string,
  invariant: () => Promise<void>,
) {
  let failure: unknown;
  try {
    await invariant();
  } catch (error) {
    failure = error;
  }
  expect(failure, `${label} mutant must fail its invariant`).toBeDefined();
}

const UPDATE_OWN =
  'public.update_own_progress_measurement(uuid,uuid,numeric,timestamptz)';
const CORRECT =
  'public.correct_progress_measurement(uuid,uuid,numeric,timestamptz)';

const definitionJson = {
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

describe('spec 023 database mutation evidence', () => {
  it('kills mutants of the client-own-edit wall, the trainer wall, RLS and the append-only audit', async () => {
    const f = await clientContext();
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
      for (const subscription of [own.subscription, other.subscription])
        await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
          values(${ws},${subscription},
            ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()},'po_override')`;
      const terms = `f23-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${terms},'terms','published')`;
      const formId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ws},'F23 mutation form')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${ws},${formId},1,${terms},${tx.json(definitionJson as JSONValue)},'published')`;
      const configured = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
      );
      expect(configured[0]!.r).toMatchObject({ status: 'configured' });

      // A manual row owned by the client, and a check-in-extracted row.
      const recorded = await asUser(
        tx,
        clientUser,
        (sp) =>
          sp`select public.record_progress_measurement(${ws},${own.client},'bodyWeight',93,${today}::date - 1) as r`,
      );
      const manualId = (recorded[0]!.r as { measurement_id: string })
        .measurement_id;
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id=${ws} and client_id=${own.client} and form_id=${formId}`;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignment!.id},1,${tx.json({ workoutAdherence: 7, dietAdherence: 7, bodyWeight: 91.5 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignment!.id},1,clock_timestamp())`;
      const [checkin] = await tx`select id from public.progress_measurements
        where workspace_id=${ws} and client_id=${own.client} and source_kind='checkin'`;
      const checkinId = checkin!.id as string;

      const versionOf = async (id: string) =>
        (
          await tx`select updated_at::text as v from public.progress_measurements where id=${id}`
        )[0]!.v as string;
      const updateOwn = async (actor: string, id: string, value: number) => {
        const version = await versionOf(id);
        const rows = await asUser(
          tx,
          actor,
          (sp) =>
            sp`select public.update_own_progress_measurement(${ws},${id},${value},${version}::text::timestamptz) as r`,
        );
        return rows[0]!.r as { status: string };
      };
      const raises42501 = async (run: () => Promise<unknown>) => {
        await expect(run()).rejects.toMatchObject({ code: '42501' });
      };

      // 1. Client wall: staff acting as a client is denied.
      const staffDenied = () =>
        raises42501(() => updateOwn(f.trainerA.userId, manualId, 90));
      await staffDenied();
      await withFunctionMutant(
        tx,
        UPDATE_OWN,
        (source) =>
          source.replace(
            'if own_client is null or not app_private.f23_client_progress_visible(p_workspace_id, own_client) then',
            'if false then',
          ),
        () => expectInvariantFailure('client wall', staffDenied),
      );

      // 2. Ownership: another client's row is indistinguishable from missing.
      const foreignNotFound = async () =>
        expect((await updateOwn(otherUser, manualId, 90)).status).toBe(
          'not_found',
        );
      await foreignNotFound();
      await withFunctionMutant(
        tx,
        UPDATE_OWN,
        (source) => source.replace(' and m.client_id = own_client', ''),
        () => expectInvariantFailure('ownership', foreignNotFound),
      );

      // 3. Check-in-extracted rows stay trainer-only.
      const checkinLocked = async () =>
        expect((await updateOwn(clientUser, checkinId, 90)).status).toBe(
          'not_editable',
        );
      await checkinLocked();
      await withFunctionMutant(
        tx,
        UPDATE_OWN,
        (source) =>
          source.replace(
            "if existing.source_kind <> 'manual' then",
            'if false then',
          ),
        () =>
          expectInvariantFailure('trainer-only check-in rows', checkinLocked),
      );

      // 4. Trainer correction wall: a foreign-workspace trainer is denied.
      const foreignTrainerDenied = () =>
        raises42501(() =>
          asUser(
            tx,
            f.trainerB.userId,
            (sp) =>
              sp`select public.correct_progress_measurement(${ws},${manualId},90,now())`,
          ),
        );
      await foreignTrainerDenied();
      await withFunctionMutant(
        tx,
        CORRECT,
        (source) =>
          source.replace(
            /if not app_private\.has_workspace_access\(p_workspace_id, 'coaching_work'\) then(\r?\n\s+raise exception)/,
            'if false then$1',
          ),
        () =>
          expectInvariantFailure(
            'trainer correction wall',
            foreignTrainerDenied,
          ),
      );

      // 5. RLS: a foreign-workspace trainer reads no measurement rows.
      const rlsIsolates = async () => {
        const [row] = await asUser(
          tx,
          f.trainerB.userId,
          (sp) =>
            sp`select count(*)::int as n from public.progress_measurements where workspace_id=${ws}`,
        );
        expect(row!.n).toBe(0);
      };
      await rlsIsolates();
      await tx`alter policy progress_measurements_staff_read on public.progress_measurements using (true)`;
      try {
        await expectInvariantFailure('staff RLS policy', rlsIsolates);
      } finally {
        await tx`alter policy progress_measurements_staff_read on public.progress_measurements
          using (app_private.has_workspace_access(workspace_id, 'coaching_work'))`;
      }
      await rlsIsolates();

      // 6. The background correction audit is append-only.
      expect((await updateOwn(clientUser, manualId, 92)).status).toBe(
        'updated',
      );
      const appendOnly = async () => {
        await expect(
          tx.savepoint(
            (sp) =>
              sp`update app_private.progress_measurement_corrections set new_value=0
                where measurement_id=${manualId}`,
          ),
        ).rejects.toMatchObject({ code: '23514' });
      };
      await appendOnly();
      await tx`alter table app_private.progress_measurement_corrections disable trigger f23_correction_no_update`;
      try {
        await expectInvariantFailure('append-only audit', appendOnly);
      } finally {
        await tx`alter table app_private.progress_measurement_corrections enable trigger f23_correction_no_update`;
      }
      await appendOnly();

      // Restored definitions behave as before.
      await staffDenied();
      await foreignNotFound();
      await checkinLocked();
      await foreignTrainerDenied();
    });
  });
});
