import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  registered,
  request,
  sql,
} from './registration-approval-operations-fixture';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

const db = sql();
afterAll(() => db.end());
async function expectInvariantFailure(body: () => Promise<void>) {
  let failure: unknown;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  expect(failure, 'the named invariant must kill the mutant').toBeDefined();
}
async function insertForm(
  tx: TransactionSql,
  workspaceId: string,
  policy: string,
) {
  const formId = randomUUID();
  await tx`insert into public.forms(id,workspace_id,name) values(${formId},${workspaceId},'T010 policy')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${policy},${tx.json({ questions: [] })},'published')`;
  return formId;
}

async function createForm(workspaceId: string) {
  return db.begin(async (tx) => {
    await tx`lock table app_private.terms_policy_versions in share row exclusive mode`;
    const policy = `t010-${randomUUID()}`;
    await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
      values(${policy},'terms','published')`;
    return insertForm(tx, workspaceId, policy);
  });
}

function policyArgs(
  workspaceId: string,
  formId: string,
  audience = 'all_active_clients',
  trigger = 'manual',
) {
  return {
    p_workspace_id: workspaceId,
    p_form_id: formId,
    p_version_number: 1,
    p_audience_kind: audience,
    p_specific_client_ids: [],
    p_trigger_kind: trigger,
    p_timing: { client_deadline_days: 3 },
    p_stop_conditions: { frozen: true, inactive: true },
  };
}

async function futureApprovedClient() {
  const context = await clientContext();
  const client = await registered(context);
  return { context, client };
}

async function setFutureActivation(
  workspaceId: string,
  subscriptionId: string,
) {
  await db`insert into public.subscription_activations(
    workspace_id,subscription_id,activated_at,delivery_event_id
  ) select ${workspaceId},${subscriptionId},
    (((clock_timestamp() at time zone 'Africa/Cairo')::date+5)::timestamp at time zone 'Africa/Cairo'),
    ${randomUUID()}`;
}

async function setCurrentActivation(
  workspaceId: string,
  subscriptionId: string,
) {
  await db`insert into public.subscription_activations(
    workspace_id,subscription_id,activated_at,delivery_event_id
  ) values(
    ${workspaceId},${subscriptionId},clock_timestamp(),${randomUUID()}
  )`;
}

describe('T010/T023 per-form assignment policy', () => {
  it('does not create manual assignments after retirement and preserves existing snapshots', async () => {
    const { context, client } = await futureApprovedClient();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId, 'all_active_clients', 'manual'),
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const approval = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    expect((approval.data as { status: string }).status).toBe('ok');
    const subscriptionId = (
      approval.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setCurrentActivation(context.wsA.id, subscriptionId);

    const initial = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: `manual-before-retire-${randomUUID()}`,
      },
    );
    expect(initial.data).toMatchObject({ status: 'materialized', count: 1 });
    const before = await db`
      select client_id,version_number,terms_policy_version,version_snapshot::text as snapshot_bytes
      from public.form_assignments where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(before).toHaveLength(1);
    const beforeOccurrences = await db`
      select o.occurrence_key from app_private.form_assignment_occurrences o
      join app_private.form_assignment_policies p on p.workspace_id=o.workspace_id and p.id=o.policy_id
      where o.workspace_id=${context.wsA.id} and p.form_id=${formId}`;

    const retired = await context.po.client.rpc('retire_workspace_form', {
      p_workspace_id: context.wsA.id,
      p_form_id: formId,
      p_request_id: randomUUID(),
    });
    expect(retired.data).toMatchObject({ status: 'ok', formStatus: 'retired' });
    await context.po.client.rpc('materialize_intake_assignment_occurrence', {
      p_workspace_id: context.wsA.id,
      p_form_id: formId,
      p_occurrence_key: `manual-after-retire-${randomUUID()}`,
    });
    const after = await db`
      select client_id,version_number,terms_policy_version,version_snapshot::text as snapshot_bytes
      from public.form_assignments where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(after).toEqual(before);
    const afterOccurrences = await db`
      select o.occurrence_key from app_private.form_assignment_occurrences o
      join app_private.form_assignment_policies p on p.workspace_id=o.workspace_id and p.id=o.policy_id
      where o.workspace_id=${context.wsA.id} and p.form_id=${formId}`;
    expect(afterOccurrences).toEqual(beforeOccurrences);
  });

  it('serializes a manual assignment attempt behind concurrent retirement', async () => {
    const { context, client } = await futureApprovedClient();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId, 'all_active_clients', 'manual'),
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const approval = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    const subscriptionId = (
      approval.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setCurrentActivation(context.wsA.id, subscriptionId);

    let releaseRetirement!: () => void;
    let signalRetirement!: () => void;
    const retirementLockHeld = new Promise<void>((resolve) => {
      releaseRetirement = resolve;
    });
    const retirementAcquired = new Promise<void>((resolve) => {
      signalRetirement = resolve;
    });
    const retirement = db.begin(async (tx) => {
      const [result] = await tx`
        select app_private.retire_workspace_form(
          ${context.wsA.id},${formId},${randomUUID()},${context.po.userId}
        ) as result`;
      expect(result?.result).toMatchObject({
        status: 'ok',
        formStatus: 'retired',
      });
      signalRetirement();
      await retirementLockHeld;
    });
    await retirementAcquired;

    let attempt: ReturnType<typeof context.po.client.rpc>;
    try {
      attempt = context.po.client.rpc(
        'materialize_intake_assignment_occurrence',
        {
          p_workspace_id: context.wsA.id,
          p_form_id: formId,
          p_occurrence_key: `manual-race-${randomUUID()}`,
        },
      );
      const returnedBeforeRetirementCommit = await Promise.race([
        attempt.then(() => true),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 150),
        ),
      ]);
      expect(returnedBeforeRetirementCommit).toBe(false);
    } finally {
      releaseRetirement();
    }
    await retirement;
    await attempt!;
    const assignments = await db`
      select id from public.form_assignments
      where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(assignments).toHaveLength(0);
    const occurrences = await db`
      select o.occurrence_key from app_private.form_assignment_occurrences o
      join app_private.form_assignment_policies p on p.workspace_id=o.workspace_id and p.id=o.policy_id
      where o.workspace_id=${context.wsA.id} and p.form_id=${formId}`;
    expect(occurrences).toHaveLength(0);
  });

  it('does not materialize a recurring occurrence after retirement', async () => {
    const { context, client } = await futureApprovedClient();
    const formId = await createForm(context.wsA.id);
    const cairoToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(
          context.wsA.id,
          formId,
          'all_active_clients',
          'recurring',
        ),
        p_timing: {
          client_deadline_days: 3,
          recurrence_interval_days: 7,
          recurrence_starts_on: cairoToday,
        },
      },
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const approval = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    expect((approval.data as { status: string }).status).toBe('ok');
    const subscriptionId = (
      approval.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setCurrentActivation(context.wsA.id, subscriptionId);

    const retired = await context.po.client.rpc('retire_workspace_form', {
      p_workspace_id: context.wsA.id,
      p_form_id: formId,
      p_request_id: randomUUID(),
    });
    expect(retired.data).toMatchObject({ status: 'ok', formStatus: 'retired' });
    await context.po.client.rpc('materialize_intake_assignment_occurrence', {
      p_workspace_id: context.wsA.id,
      p_form_id: formId,
      p_occurrence_key: `recurring:${cairoToday}`,
    });
    const [rows] = await db`
      select count(distinct a.id)::integer as assignments,
        count(distinct o.occurrence_key)::integer as occurrences
      from app_private.form_assignment_policies p
      left join public.form_assignments a on a.workspace_id=p.workspace_id and a.policy_id=p.id
      left join app_private.form_assignment_occurrences o on o.workspace_id=p.workspace_id and o.policy_id=p.id
      where p.workspace_id=${context.wsA.id} and p.form_id=${formId}`;
    expect(rows).toEqual({ assignments: 0, occurrences: 0 });
  });

  it('kills the retired-form guard mutant in occurrence materialization', async () => {
    await withCrashSafeFunctionMutant(
      'app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date)',
      (definition) =>
        definition.replace(
          "if latest_form_status='retired' then",
          'if false then',
        ),
      async () =>
        await expectInvariantFailure(async () => {
          const { context, client } = await futureApprovedClient();
          const formId = await createForm(context.wsA.id);
          const cairoToday = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Cairo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
          const configured = await context.po.client.rpc(
            'configure_intake_assignment_policy',
            {
              ...policyArgs(
                context.wsA.id,
                formId,
                'all_active_clients',
                'recurring',
              ),
              p_timing: {
                client_deadline_days: 3,
                recurrence_interval_days: 7,
                recurrence_starts_on: cairoToday,
              },
            },
          );
          expect(configured.data).toEqual({ status: 'configured' });
          const approval = await context.po.client.rpc('registration_approve', {
            request: request(context, client),
          });
          const subscriptionId = (
            approval.data as { receipt: { subscription_id: string } }
          ).receipt.subscription_id;
          await setCurrentActivation(context.wsA.id, subscriptionId);
          const retired = await context.po.client.rpc('retire_workspace_form', {
            p_workspace_id: context.wsA.id,
            p_form_id: formId,
            p_request_id: randomUUID(),
          });
          expect(retired.data).toMatchObject({ status: 'ok' });
          await context.po.client.rpc(
            'materialize_intake_assignment_occurrence',
            {
              p_workspace_id: context.wsA.id,
              p_form_id: formId,
              p_occurrence_key: `recurring:${cairoToday}`,
            },
          );
          const [rows] = await db`
            select count(distinct a.id)::integer as assignments,
              count(distinct o.occurrence_key)::integer as occurrences
            from app_private.form_assignment_policies p
            left join public.form_assignments a on a.workspace_id=p.workspace_id and a.policy_id=p.id
            left join app_private.form_assignment_occurrences o on o.workspace_id=p.workspace_id and o.policy_id=p.id
            where p.workspace_id=${context.wsA.id} and p.form_id=${formId}`;
          expect(rows).toEqual({ assignments: 0, occurrences: 0 });
        }),
    );
  });

  it('excludes a deactivated client from an all-active audience snapshot', async () => {
    const { context, client } = await futureApprovedClient();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId, 'all_active_clients', 'manual'),
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const approval = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    expect((approval.data as { status: string }).status).toBe('ok');
    const subscriptionId = (
      approval.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setCurrentActivation(context.wsA.id, subscriptionId);
    await db.begin(async (tx) => {
      await tx`set local session_replication_role='replica'`;
      await tx`update public.clients set deactivated_at=clock_timestamp(),deactivation_reason='closure'
        where workspace_id=${context.wsA.id} and id=${client.id}`;
    });

    const result = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: `active-${client.id}`,
      },
    );
    expect(result.data).toMatchObject({ status: 'materialized', count: 0 });
    const [occurrence] = await db`
      select audience_client_ids from app_private.form_assignment_occurrences o
      join app_private.form_assignment_policies p
        on p.workspace_id=o.workspace_id and p.id=o.policy_id
      where o.workspace_id=${context.wsA.id} and p.form_id=${formId}
    `;
    expect(occurrence?.audience_client_ids).toEqual([]);
  });

  it('rejects a missing recurrence interval in policy and materialization paths', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const cairoToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(
          context.wsA.id,
          formId,
          'all_active_clients',
          'recurring',
        ),
        p_timing: {
          client_deadline_days: 3,
          recurrence_interval_days: 7,
          recurrence_starts_on: cairoToday,
        },
      },
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const omitted = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(
          context.wsA.id,
          formId,
          'all_active_clients',
          'recurring',
        ),
        p_timing: { client_deadline_days: 3, recurrence_starts_on: cairoToday },
      },
    );
    expect(omitted.data).toEqual({ status: 'not_found' });
    const explicitNull = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(
          context.wsA.id,
          formId,
          'all_active_clients',
          'recurring',
        ),
        p_timing: {
          client_deadline_days: 3,
          recurrence_interval_days: null,
          recurrence_starts_on: cairoToday,
        },
      },
    );
    expect(explicitNull.data).toEqual({ status: 'not_found' });
    await withCrashSafeFunctionMutant(
      'public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb)',
      (definition) =>
        definition.replace(
          /or \(p_trigger_kind='recurring' and \(coalesce\(p_timing->>'recurrence_interval_days',''\) !~ '\^\[0-9\]\+\$'\s+or coalesce\(\(p_timing->>'recurrence_interval_days'\)::integer,0\) not between 1 and 365 or\s+/,
          "or (p_trigger_kind='recurring' and (",
        ),
      async () =>
        expectInvariantFailure(async () => {
          const mutant = await context.po.client.rpc(
            'configure_intake_assignment_policy',
            {
              ...policyArgs(
                context.wsA.id,
                formId,
                'all_active_clients',
                'recurring',
              ),
              p_timing: {
                client_deadline_days: 3,
                recurrence_interval_days: null,
                recurrence_starts_on: cairoToday,
              },
            },
          );
          expect(mutant.data).toEqual({ status: 'not_found' });
        }),
    );
    await db`update app_private.form_assignment_policies set timing=${db.json({ client_deadline_days: 3, recurrence_interval_days: null, recurrence_starts_on: cairoToday })}
      where workspace_id=${context.wsA.id} and form_id=${formId}`;
    await withCrashSafeFunctionMutant(
      'app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date)',
      (definition) =>
        definition.replace(
          /if coalesce\(policy\.timing->>'recurrence_interval_days',''\) !~ '\^\[0-9\]\+\$'\s+or coalesce\(\(policy\.timing->>'recurrence_interval_days'\)::integer,0\) not between 1 and 365\s+or\s+/,
          'if ',
        ),
      async () =>
        expectInvariantFailure(async () => {
          const materialized = await context.po.client.rpc(
            'materialize_intake_assignment_occurrence',
            {
              p_workspace_id: context.wsA.id,
              p_form_id: formId,
              p_occurrence_key: `recurring:${cairoToday}`,
            },
          );
          expect(materialized.data).toEqual({ status: 'not_found' });
        }),
    );
  });

  it('S25-R2 uses F12 approved_at rather than client created_at for onboarding cutoff', async () => {
    const { context, client } = await futureApprovedClient();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId, 'new_clients', 'onboarding'),
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const approved = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    expect((approved.data as { status: string }).status).toBe('ok');
    const subscriptionId = (
      approved.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setFutureActivation(context.wsA.id, subscriptionId);
    const [timestamps] =
      await db`select c.created_at < p.configured_at as created_before_policy,
      a.approved_at >= p.configured_at as approved_after_policy
      from public.clients c join app_private.registration_approval_events a
        on a.workspace_id=c.workspace_id and a.client_id=c.id
      join app_private.form_assignment_policies p on p.workspace_id=c.workspace_id and p.form_id=${formId}
      where c.workspace_id=${context.wsA.id} and c.id=${client.id}`;
    expect(timestamps).toEqual({
      created_before_policy: true,
      approved_after_policy: true,
    });
    const assigned = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: `onboard-${client.id}`,
      },
    );
    expect(assigned.data).toMatchObject({ status: 'materialized', count: 1 });
    const [row] = await db`select client_id from public.form_assignments
      where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(row?.client_id).toBe(client.id);
  });

  it('accepts bounded Cairo-date recurrence timing and snapshots each scheduled occurrence once', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const today =
      await db`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`;
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(
          context.wsA.id,
          formId,
          'all_active_clients',
          'recurring',
        ),
        p_timing: {
          recurrence_interval_days: 7,
          recurrence_starts_on: today[0]!.day,
          client_deadline_days: 3,
        },
      },
    );
    expect(configured.data).toEqual({ status: 'configured' });
    const key = `recurring:${today[0]!.day}`;
    const first = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: key,
      },
    );
    expect(first.data).toMatchObject({ status: 'materialized' });
    const evaluatedAt = (first.data as { snapshot_at: string }).snapshot_at;
    const [evaluatedDate] = await db`
      select ((${evaluatedAt}::timestamptz at time zone 'Africa/Cairo')::date)::text as day
    `;
    expect(key).toBe(`recurring:${evaluatedDate!.day}`);
    const replay = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: key,
      },
    );
    expect(replay.data).toEqual({ status: 'already_materialized', count: 0 });
    const next = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: `recurring:${today[0]!.day}:next`,
      },
    );
    expect(next.data).toMatchObject({ status: 'not_found' });
  });

  it('S25-R2 allows future onboarding/manual delivery and excludes future all-active recurring delivery', async () => {
    const { context, client } = await futureApprovedClient();
    const formIds = await db.begin(async (tx) => {
      await tx`lock table app_private.terms_policy_versions in share row exclusive mode`;
      const sharedTerms = `t010-${randomUUID()}`;
      await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
        values(${sharedTerms},'terms','published')`;
      return {
        onboarding: await insertForm(tx, context.wsA.id, sharedTerms),
        manual: await insertForm(tx, context.wsA.id, sharedTerms),
        active: await insertForm(tx, context.wsA.id, sharedTerms),
      };
    });
    const onboardingPolicy = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(
        context.wsA.id,
        formIds.onboarding,
        'new_clients',
        'onboarding',
      ),
    );
    expect(onboardingPolicy.data).toEqual({ status: 'configured' });
    const approved = await context.po.client.rpc('registration_approve', {
      request: request(context, client),
    });
    expect((approved.data as { status: string }).status).toBe('ok');
    const subscriptionId = (
      approved.data as { receipt: { subscription_id: string } }
    ).receipt.subscription_id;
    await setFutureActivation(context.wsA.id, subscriptionId);
    for (const [, args] of [
      [
        formIds.manual,
        {
          ...policyArgs(
            context.wsA.id,
            formIds.manual,
            'specific_clients',
            'manual',
          ),
          p_specific_client_ids: [client.id],
        },
      ],
      [
        formIds.active,
        {
          ...policyArgs(
            context.wsA.id,
            formIds.active,
            'all_active_clients',
            'recurring',
          ),
          p_timing: {
            recurrence_interval_days: 7,
            recurrence_starts_on: (
              await db`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`
            )[0]!.day,
            client_deadline_days: 3,
          },
        },
      ],
    ] as const) {
      const result = await context.po.client.rpc(
        'configure_intake_assignment_policy',
        args,
      );
      expect(result.data).toEqual({ status: 'configured' });
    }
    const [projection] = await db`select app_private.f13_project_entitlement(
      ${context.wsA.id},${subscriptionId},(clock_timestamp() at time zone 'Africa/Cairo')::date
    )->>'status' as status`;
    expect(projection?.status).toBe('future');
    for (const [formId, expected] of [
      [formIds.onboarding, 1],
      [formIds.manual, 1],
      [formIds.active, 0],
    ] as const) {
      const result = await context.po.client.rpc(
        'materialize_intake_assignment_occurrence',
        {
          p_workspace_id: context.wsA.id,
          p_form_id: formId,
          p_occurrence_key: `future-${formId}`,
        },
      );
      if (expected === 0) {
        expect(
          result.data?.status === 'not_found' ||
            (result.data?.status === 'materialized' && result.data.count === 0),
          'future entitlement must never enter an all-active/recurring audience',
        ).toBe(true);
        const [count] =
          await db`select count(*)::int as count from public.form_assignments
          where workspace_id=${context.wsA.id} and form_id=${formId} and client_id=${client.id}`;
        expect(count?.count).toBe(0);
      } else {
        expect(result.data).toMatchObject({
          status: 'materialized',
          count: expected,
        });
      }
    }
  });

  it('defines scoped audience policy and occurrence-bound immutable snapshots with separate deadlines', async () => {
    const policies = await db`
      select column_name from information_schema.columns
      where table_schema='app_private' and table_name='form_assignment_policies'
    `;
    expect(policies.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'workspace_id',
        'form_id',
        'version_number',
        'audience_kind',
        'specific_client_ids',
        'trigger_kind',
        'timing',
        'stop_conditions',
        'configured_by',
        'configured_at',
      ]),
    );
    const assignmentColumns = await db`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='form_assignments'
    `;
    expect(assignmentColumns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'occurrence_key',
        'audience_snapshot_at',
        'client_deadline_at',
        'policy_id',
        'configured_by',
      ]),
    );
    const indexes = await db`
      select indexdef from pg_indexes
      where schemaname='public' and tablename='form_assignments'
    `;
    expect(indexes.map((row) => row.indexdef).join('\n')).toMatch(
      /workspace_id, client_id, form_id, occurrence_key/,
    );
  });

  it('rejects replayed occurrences and mutation of frozen audience/version/deadline facts', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(configured.error).toBeNull();
    expect(configured.data).toEqual({ status: 'configured' });
    const occurrenceKey = `occ-${randomUUID()}`;
    const materialized = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(materialized.error).toBeNull();
    expect(materialized.data).toMatchObject({
      status: 'materialized',
      count: 0,
    });
    const replay = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(replay.data).toEqual({ status: 'already_materialized', count: 0 });
    const changedAudience = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(context.wsA.id, formId, 'new_clients', 'onboarding'),
        p_timing: { client_deadline_days: 7 },
      },
    );
    expect(changedAudience.data).toEqual({ status: 'configured' });
    const replayAfterPolicyChange = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(replayAfterPolicyChange.data).toEqual({
      status: 'already_materialized',
      count: 0,
    });
    const [snapshot] =
      await db`select * from app_private.form_assignment_occurrences
      where workspace_id=${context.wsA.id} and occurrence_key=${occurrenceKey}`;
    expect(snapshot?.audience_client_ids).toEqual([]);
    expect(snapshot?.trigger_kind).toBe('manual');
    const [currentPolicy] =
      await db`select audience_kind from app_private.form_assignment_policies
      where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(currentPolicy?.audience_kind).toBe('new_clients');
    await expect(db`
      update app_private.form_assignment_occurrences set audience_client_ids=array[${randomUUID()}::uuid]
      where workspace_id=${context.wsA.id} and occurrence_key=${occurrenceKey}
    `).rejects.toThrow(/immutable/);
  });

  it('denies Sales configuration and rechecks the configuring actor after lock wait', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const denied = await context.salesA.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual({ status: 'not_found' });
  });

  it('returns no policy write when authorization is revoked during the form lock wait', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const initial = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(initial.data).toEqual({ status: 'configured' });
    const lockKey = `${context.wsA.id}:${formId}`;
    const blocker = sql();
    const selector = sql();
    let signal!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => (signal = resolve));
    const hold = blocker.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(pg_catalog.hashtextextended(${lockKey},0))`;
      signal();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await acquired;
    let pending: Promise<unknown> | undefined;
    try {
      pending = selector.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.trainerA.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`select public.configure_intake_assignment_policy(
          ${context.wsA.id},${formId},1,'new_clients','{}'::uuid[],'onboarding',
          '{"client_deadline_days":7}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb) as result`;
        return row?.result;
      });
      let waiting = false;
      const deadline = Date.now() + 8000;
      while (!waiting && Date.now() < deadline) {
        const [row] = await db`select exists(select 1 from pg_stat_activity
          where datname=current_database() and state='active' and wait_event_type='Lock'
            and wait_event='advisory' and query ilike '%configure_intake_assignment_policy%') as waiting`;
        waiting = Boolean(row?.waiting);
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(
        waiting,
        'configuration must wait on the serialized policy lock',
      ).toBe(true);
      await db`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${context.po.userId}
        where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId} and revoked_at is null`;
      release();
      await hold;
      expect(await pending).toEqual({ status: 'not_found' });
      const [row] =
        await db`select audience_kind,configured_by from app_private.form_assignment_policies
        where workspace_id=${context.wsA.id} and form_id=${formId}`;
      expect(row?.audience_kind).toBe('all_active_clients');
      expect(row?.configured_by).toBe(context.po.userId);
    } finally {
      if (release) release();
      await Promise.allSettled([hold, ...(pending ? [pending] : [])]);
      await blocker.end();
      await selector.end();
    }
  });
});
