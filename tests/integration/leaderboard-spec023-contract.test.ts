import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  parseMeasurementBaselineRow,
  parseWeeklyAdherenceRow,
} from '../../lib/progress-coaching/contract';
import { aggregateMonthlyAdherence } from '../../lib/leaderboard/spec023-source';
import { clientContext, graph, probe } from './registration-approval-fixture';

// F24 adapter against the spec 023 read contract (real functions, rolled-back
// probe). The PO reads as a coaching_work holder; Sales and foreign staff are
// denied with 42501; the read is audited with ids/counts only.
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

describe('F24 spec 023 score-input adapter contract', () => {
  it('reads current-month adherence and baselines by name for the PO and denies others', async () => {
    const f = await clientContext();
    await probe(async (tx) => {
      const ids = await graph(tx, f);
      const ws = f.wsA.id;
      const [clock] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today`;
      const today = clock!.today as string;
      await tx`select set_config('request.jwt.claims','{}',true)`;
      await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id)
        values(${ws},${ids.subscription},
          ((${today}::date - 7)::timestamp + interval '9 hours') at time zone 'Africa/Cairo',${randomUUID()})`;
      const terms = `f24-${randomUUID()}`;
      const formId = randomUUID();
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status) values(${terms},'terms','published')`;
      await tx`insert into public.forms(id,workspace_id,name) values(${formId},${ws},'F24 adapter check-in')`;
      await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
        values(${ws},${formId},1,${terms},${tx.json(checkinDefinition as JSONValue)},'published')`;
      const configured = await asUser(
        tx,
        f.trainerA.userId,
        (sp) =>
          sp`select public.configure_weekly_checkin_form(${ws},${formId},1) as r`,
      );
      expect(configured[0]!.r).toMatchObject({ status: 'configured' });
      await tx`select app_private.f23_weekly_checkin_run(${today}::date)`;
      const [assignment] = await tx`select id from public.form_assignments
        where workspace_id=${ws} and client_id=${ids.client} and occurrence_key=${'weekly_checkin:' + today}`;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${ws},${assignment!.id},1,${tx.json({ workoutAdherence: 9, dietAdherence: 5, bodyWeight: 80 })})`;
      await tx`insert into app_private.form_submissions(workspace_id,assignment_id,revision,submitted_at)
        values(${ws},${assignment!.id},1,clock_timestamp())`;

      const monthStart = `${today.slice(0, 8)}01`;
      const raw = await asUser(
        tx,
        f.po.userId,
        (sp) =>
          sp`select * from public.progress_weekly_adherence(${ws},${monthStart}::date,${today}::date)`,
      );
      const rows = raw.map((value) =>
        parseWeeklyAdherenceRow({
          ...value,
          checkin_date:
            value.checkin_date instanceof Date
              ? value.checkin_date.toISOString().slice(0, 10)
              : value.checkin_date,
          submitted_at: String(value.submitted_at),
        }),
      );
      expect(rows.every(Boolean)).toBe(true);
      expect(
        aggregateMonthlyAdherence(
          rows.filter((row) => row !== null),
          [ids.client],
        ),
      ).toEqual([
        {
          clientId: ids.client,
          workoutAdherence: 9,
          dietAdherence: 5,
          checkins: 1,
        },
      ]);
      const [audit] =
        await tx`select actor_user_id, details from public.audit_events
        where workspace_id=${ws} and action='progress.adherence_read' order by id desc limit 1`;
      expect(audit!.actor_user_id).toBe(f.po.userId);
      expect(Object.keys(audit!.details).sort()).toEqual([
        'from',
        'rows',
        'to',
      ]);

      const baselines = await asUser(
        tx,
        f.po.userId,
        (sp) =>
          sp`select client_id, measurement_type, baseline_value::text, latest_value::text,
            baseline_recorded_on::text, latest_recorded_on::text, measurement_count
          from public.progress_measurement_baselines(${ws},${today}::date)`,
      );
      expect(baselines.map(parseMeasurementBaselineRow)).toEqual([
        expect.objectContaining({
          clientId: ids.client,
          measurementType: 'bodyWeight',
          baselineValue: 80,
          measurementCount: 1,
        }),
      ]);

      for (const actor of [f.salesA.userId, f.trainerB.userId])
        await expect(
          asUser(
            tx,
            actor,
            (sp) =>
              sp`select * from public.progress_weekly_adherence(${ws},${monthStart}::date,${today}::date)`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asUser(
          tx,
          f.po.userId,
          (sp) =>
            sp`select * from public.progress_weekly_adherence(${ws},${today}::date,${monthStart}::date - 1)`,
        ),
      ).rejects.toMatchObject({ code: '22023' });
    });
  });
});
