import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { JSONValue, TransactionSql } from 'postgres';
import { sql } from './registration-approval-operations-fixture';
import { request } from './registration-approval-operations-fixture';
import { clientContext } from './registration-approval-operations-fixture';
import {
  changePolicyFixtureFreeze,
  withFormsPolicyF13Fixtures,
} from './forms-policy-fixtures';

const db = sql();
afterAll(() => db.end());
type Trigger = 'manual' | 'onboarding' | 'renewal' | 'recurring';
type Audience = 'all_active_clients' | 'new_clients' | 'specific_clients';

async function createForm(tx: TransactionSql, workspaceId: string) {
  const terms = `mutation-${randomUUID()}`;
  const formId = randomUUID();
  await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${terms},'terms','published')`;
  await tx`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},'Assignment mutation')`;
  await tx`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${terms},${tx.json({ questions: [] })},'published')`;
  return formId;
}

async function configure(
  tx: TransactionSql,
  actor: string,
  workspaceId: string,
  formId: string,
  audience: Audience,
  clientIds: string[],
  trigger: Trigger,
  timing: Record<string, unknown>,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    const [row] = await tx`
      select public.configure_intake_assignment_policy(
        ${workspaceId},${formId},1,${audience},${clientIds}::uuid[],${trigger},${tx.json(timing as JSONValue)},
        '{"frozen":true,"inactive":true}'::jsonb
      ) as result
    `;
    expect(row!.result).toEqual({ status: 'configured' });
  } finally {
    await tx`reset role`;
  }
}

async function core(
  tx: TransactionSql,
  actor: string,
  workspaceId: string,
  formId: string,
  key: string,
  date: string,
) {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: actor, role: 'authenticated' })},true)`;
  const [row] = await tx`
    select app_private.materialize_intake_assignment_occurrence_core(
      ${workspaceId},${formId},${key},${date}::date
    ) as result
  `;
  return row!.result as { status: string; count?: number };
}

async function dateOffset(tx: TransactionSql, date: string, offset: number) {
  const [row] = await tx`select (${date}::date+${offset}::int)::text as date`;
  return row!.date as string;
}

async function functionDefinition(tx: TransactionSql, identity: string) {
  const [row] = await tx`
    select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as definition
  `;
  return row!.definition as string;
}

async function withFunctionMutant<T>(
  tx: TransactionSql,
  identity: string,
  mutate: (definition: string) => string,
  body: () => Promise<T>,
): Promise<T> {
  const original = await functionDefinition(tx, identity);
  const mutant = mutate(original);
  if (!mutant || mutant === original)
    throw new Error(`Mutation did not change ${identity}`);
  await tx.unsafe(mutant);
  try {
    return await body();
  } finally {
    await tx.unsafe(original);
  }
}

async function expectInvariantFailure(
  label: string,
  assertion: () => void | Promise<void>,
) {
  let failure: unknown;
  try {
    await assertion();
  } catch (error) {
    failure = error;
  }
  expect(
    failure,
    `${label} mutant must fail its named invariant`,
  ).toBeDefined();
}

const CORE =
  'app_private.materialize_intake_assignment_occurrence_core(uuid,uuid,text,date)';

it('kills replay and audience snapshot mutants', async () => {
  await withFormsPolicyF13Fixtures(async (tx, f, scenarios) => {
    const [todayRow] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`;
    const today = todayRow!.day as string;
    const replayForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      replayForm,
      'specific_clients',
      [scenarios.recurringActive.clientId],
      'recurring',
      {
        recurrence_interval_days: 1,
        recurrence_starts_on: today,
        client_deadline_days: 3,
      },
    );
    expect(
      await core(
        tx,
        f.po.userId,
        f.wsA.id,
        replayForm,
        `recurring:${today}`,
        today,
      ),
    ).toMatchObject({ status: 'materialized', count: 1 });
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition.replace(
          /  if exists\(select 1 from app_private\.form_assignment_occurrences[\s\S]*?end if;\r?\n  deadline_days/,
          '  deadline_days',
        ),
      async () => {
        const replay = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          replayForm,
          `recurring:${today}`,
          today,
        );
        await expectInvariantFailure(
          'replay must return already_materialized',
          () =>
            expect(replay).toEqual({
              status: 'already_materialized',
              count: 0,
            }),
        );
      },
    );

    const audienceForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      audienceForm,
      'specific_clients',
      [scenarios.recurringActive.clientId],
      'manual',
      {
        client_deadline_days: 3,
      },
    );
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition.replace(
          "or (policy.audience_kind='specific_clients' and c.id=any(policy.specific_client_ids))",
          'or true',
        ),
      async () => {
        const result = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          audienceForm,
          `manual:${randomUUID()}`,
          today,
        );
        await expectInvariantFailure(
          'specific-client audience must contain exactly one fixture',
          () => expect(result.count).toBe(1),
        );
      },
    );
  });
});

it('kills payment-time, frozen-stop, inactive-stop, and freeze-catch-up mutants', async () => {
  await withFormsPolicyF13Fixtures(async (tx, f, scenarios) => {
    const [todayRow] =
      await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`;
    const today = todayRow!.day as string;

    const renewalForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      renewalForm,
      'specific_clients',
      [scenarios.earlyPaidRenewal.clientId],
      'renewal',
      {
        client_deadline_days: 3,
      },
    );
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition
          .replace(
            'if service_start is null or today<service_start then return \'{"status":"not_found"}\'::jsonb; end if;',
            '',
          )
          .replace(
            "policy.trigger_kind='renewal' and s.id=sub_id\n        and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'",
            "policy.trigger_kind='renewal' and s.id=sub_id\n        and exists(select 1 from public.payment_events pe where pe.workspace_id=s.workspace_id and pe.subscription_id=s.id and pe.kind='collection')",
          ),
      async () => {
        const result = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          renewalForm,
          scenarios.earlyPaidRenewal.occurrenceKey!,
          today,
        );
        await expectInvariantFailure(
          'early payment must not deliver before service start',
          () => expect(result).toEqual({ status: 'not_found' }),
        );
      },
    );

    const frozenForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      frozenForm,
      'specific_clients',
      [scenarios.recurringFreeze.clientId],
      'recurring',
      {
        recurrence_interval_days: 1,
        recurrence_starts_on: today,
        client_deadline_days: 3,
      },
    );
    await changePolicyFixtureFreeze(
      tx,
      f,
      scenarios.recurringFreeze,
      'apply',
      0,
    );
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition.replace(
          "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'",
          "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status' in ('active','frozen')",
        ),
      async () => {
        const result = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          frozenForm,
          `recurring:${today}`,
          today,
        );
        await expectInvariantFailure(
          'frozen subscription must be omitted from occurrence audience',
          () => expect(result.count).toBe(0),
        );
      },
    );

    const inactiveForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      inactiveForm,
      'specific_clients',
      [scenarios.expiredSubscription.clientId],
      'recurring',
      {
        recurrence_interval_days: 1,
        recurrence_starts_on: today,
        client_deadline_days: 3,
      },
    );
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition.replace(
          "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'",
          "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status' in ('active','expired')",
        ),
      async () => {
        const result = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          inactiveForm,
          `recurring:${today}`,
          today,
        );
        await expectInvariantFailure(
          'expired subscription must be omitted from occurrence audience',
          () => expect(result.count).toBe(0),
        );
      },
    );

    const catchupForm = await createForm(tx, f.wsA.id);
    await configure(
      tx,
      f.po.userId,
      f.wsA.id,
      catchupForm,
      'specific_clients',
      [scenarios.recurringFreeze.clientId],
      'recurring',
      {
        recurrence_interval_days: 2,
        recurrence_starts_on: today,
        client_deadline_days: 3,
      },
    );
    const freezeId = await changePolicyFixtureFreeze(
      tx,
      f,
      scenarios.recurringFreeze,
      'remove',
      1,
      (
        await tx`select id from public.subscription_freezes where subscription_id=${scenarios.recurringFreeze.subscriptionId}`
      )[0]!.id as string,
    );
    void freezeId;
    await withFunctionMutant(
      tx,
      CORE,
      (definition) =>
        definition.replace('or p_occurrence_key<>expected_key', 'or false'),
      async () => {
        const skippedOccurrenceKey = `recurring:${today}`;
        const laterDate = await dateOffset(tx, today, 2);
        const result = await core(
          tx,
          f.po.userId,
          f.wsA.id,
          catchupForm,
          skippedOccurrenceKey,
          laterDate,
        );
        await expectInvariantFailure(
          'frozen recurrence key must not catch up after unfreeze',
          () => expect(result).toEqual({ status: 'not_found' }),
        );
      },
    );
  });
});

it('kills approval cutoff, future eligibility, and transition-only renewal mutants', async () => {
  await withFormsPolicyF13Fixtures(
    async (tx, f, scenarios) => {
      const candidate = scenarios.pendingCandidate;
      if (!candidate)
        throw new Error('Pending F12 candidate fixture was not created');
      const onboardingForm = await createForm(tx, f.wsA.id);
      await configure(
        tx,
        f.po.userId,
        f.wsA.id,
        onboardingForm,
        'new_clients',
        [],
        'onboarding',
        {
          client_deadline_days: 3,
        },
      );
      const approved = await f.po.client.rpc('registration_approve', {
        request: request(f, candidate),
      });
      expect((approved.data as { status: string }).status).toBe('ok');
      const subscriptionId = (
        approved.data as { receipt: { subscription_id: string } }
      ).receipt.subscription_id;
      const [todayRow] =
        await tx`select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as day`;
      const today = todayRow!.day as string;
      const futureDate = await dateOffset(tx, today, 5);
      await tx`insert into public.subscription_activations(
      workspace_id,subscription_id,activated_at,delivery_event_id
    ) values(${f.wsA.id},${subscriptionId},
      (${futureDate}::date::timestamp at time zone 'Africa/Cairo'),${randomUUID()})`;
      const [cutoffFacts] = await tx`
      select c.created_at<p.configured_at as created_before_policy,
        a.approved_at>=p.configured_at as approved_after_policy
      from public.clients c join app_private.registration_approval_events a
        on a.workspace_id=c.workspace_id and a.client_id=c.id
      join app_private.form_assignment_policies p
        on p.workspace_id=c.workspace_id and p.form_id=${onboardingForm}
      where c.workspace_id=${f.wsA.id} and c.id=${candidate.id}
    `;
      expect(cutoffFacts).toEqual({
        created_before_policy: true,
        approved_after_policy: true,
      });

      await withFunctionMutant(
        tx,
        CORE,
        (definition) =>
          definition.replace(
            'a.approved_at>=policy.configured_at',
            'c.created_at>=policy.configured_at',
          ),
        async () => {
          const result = await core(
            tx,
            f.po.userId,
            f.wsA.id,
            onboardingForm,
            `onboarding:${randomUUID()}`,
            today,
          );
          await expectInvariantFailure(
            'onboarding cutoff must use F12 approved_at',
            () =>
              expect(result).toMatchObject({
                status: 'materialized',
                count: 1,
              }),
          );
        },
      );

      const manualForm = await createForm(tx, f.wsA.id);
      await configure(
        tx,
        f.po.userId,
        f.wsA.id,
        manualForm,
        'specific_clients',
        [candidate.id],
        'manual',
        {
          client_deadline_days: 3,
        },
      );
      const recurringForm = await createForm(tx, f.wsA.id);
      await configure(
        tx,
        f.po.userId,
        f.wsA.id,
        recurringForm,
        'specific_clients',
        [candidate.id],
        'recurring',
        {
          recurrence_interval_days: 1,
          recurrence_starts_on: today,
          client_deadline_days: 3,
        },
      );
      await withFunctionMutant(
        tx,
        CORE,
        (definition) =>
          definition.replaceAll("->>'status'='future'", "->>'status'='never'"),
        async () => {
          const onboarding = await core(
            tx,
            f.po.userId,
            f.wsA.id,
            onboardingForm,
            `onboarding:${randomUUID()}`,
            today,
          );
          await expectInvariantFailure(
            'future entitlement must remain valid for onboarding',
            () =>
              expect(onboarding).toMatchObject({
                status: 'materialized',
                count: 1,
              }),
          );
          const manual = await core(
            tx,
            f.po.userId,
            f.wsA.id,
            manualForm,
            `manual:${randomUUID()}`,
            today,
          );
          await expectInvariantFailure(
            'future entitlement must remain valid for manual specific delivery',
            () =>
              expect(manual).toMatchObject({
                status: 'materialized',
                count: 1,
              }),
          );
        },
      );

      await withFunctionMutant(
        tx,
        CORE,
        (definition) =>
          definition.replace(
            "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'",
            "policy.trigger_kind='recurring' and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status' in ('active','future')",
          ),
        async () => {
          const result = await core(
            tx,
            f.po.userId,
            f.wsA.id,
            recurringForm,
            `recurring:${today}`,
            today,
          );
          await expectInvariantFailure(
            'future entitlement must remain excluded from recurring',
            () => expect(result.count).toBe(0),
          );
        },
      );

      const transitionForm = await createForm(tx, f.wsA.id);
      await configure(
        tx,
        f.po.userId,
        f.wsA.id,
        transitionForm,
        'specific_clients',
        [scenarios.missedRenewal.clientId],
        'renewal',
        {
          client_deadline_days: 3,
        },
      );
      const missedDate = await dateOffset(
        tx,
        scenarios.missedRenewal.serviceStart!,
        1,
      );
      await withFunctionMutant(
        tx,
        CORE,
        (definition) =>
          definition.replace(
            "and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'\n        )",
            "and app_private.f13_project_entitlement(s.workspace_id,s.id,today)->>'status'='active'\n        and app_private.f13_project_entitlement(s.workspace_id,s.id,today-1)->>'status'='future'\n        )",
          ),
        async () => {
          const result = await core(
            tx,
            f.po.userId,
            f.wsA.id,
            transitionForm,
            scenarios.missedRenewal.occurrenceKey!,
            missedDate,
          );
          await expectInvariantFailure(
            'missed renewal evaluation must not require a future yesterday projection',
            () =>
              expect(result).toMatchObject({
                status: 'materialized',
                count: 1,
              }),
          );
        },
      );
    },
    { pendingCandidate: true },
  );
});

it('kills Sales configuration and stale authorization after lock-wait mutants', async () => {
  await withFormsPolicyF13Fixtures(async (tx, f) => {
    const formId = await createForm(tx, f.wsA.id);
    const identity =
      'public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb)';
    await withFunctionMutant(
      tx,
      identity,
      (definition) =>
        definition.replace(
          /role is null or not app_private\.role_has_capability\(role,'assign_intake_form'\) or not app_private\.has_workspace_access\(p_workspace_id,'assign_intake_form'\)/g,
          'false',
        ),
      async () => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.salesA.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        try {
          const [row] = await tx`
          select public.configure_intake_assignment_policy(
            ${f.wsA.id},${formId},1,'all_active_clients','{}'::uuid[],'manual',
            '{"client_deadline_days":3}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb
          ) as result
        `;
          await expectInvariantFailure(
            'Sales must not configure assignment policies',
            () => expect(row!.result).toEqual({ status: 'not_found' }),
          );
        } finally {
          await tx`reset role`;
        }
      },
    );
  });

  const f = await clientContext();
  const formId = await createForm(db as unknown as TransactionSql, f.wsA.id);
  const initial = await f.po.client.rpc('configure_intake_assignment_policy', {
    p_workspace_id: f.wsA.id,
    p_form_id: formId,
    p_version_number: 1,
    p_audience_kind: 'all_active_clients',
    p_specific_client_ids: [],
    p_trigger_kind: 'manual',
    p_timing: { client_deadline_days: 3 },
    p_stop_conditions: { frozen: true, inactive: true },
  });
  expect(initial.data).toEqual({ status: 'configured' });

  const lockKey = `${f.wsA.id}:${formId}`;
  const blocker = sql();
  const caller = sql();
  let signal!: () => void;
  let release!: () => void;
  let pending: Promise<unknown> | undefined;
  const acquired = new Promise<void>((resolve) => (signal = resolve));
  const hold = blocker.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(pg_catalog.hashtextextended(${lockKey},0))`;
    signal();
    await new Promise<void>((resolve) => (release = resolve));
  });
  try {
    await acquired;
    pending = caller.begin(async (tx) => {
      const identity =
        'public.configure_intake_assignment_policy(uuid,uuid,integer,text,uuid[],text,jsonb,jsonb)';
      return withFunctionMutant(
        tx,
        identity,
        (definition) =>
          definition.replace(
            /if role is null or not app_private\.role_has_capability\(role,'assign_intake_form'\) or not app_private\.has_workspace_access\(p_workspace_id,'assign_intake_form'\) then raise exception 'assignment policy authorization changed while waiting'; end if;/,
            "if false then raise exception 'assignment policy authorization changed while waiting'; end if;",
          ),
        async () => {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
          await tx`set local role authenticated`;
          try {
            const [row] = await tx`
            select public.configure_intake_assignment_policy(
              ${f.wsA.id},${formId},1,'new_clients','{}'::uuid[],'onboarding',
              '{"client_deadline_days":7}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb
            ) as result
          `;
            return row!.result;
          } finally {
            await tx`reset role`;
          }
        },
      );
    });

    let waiting = false;
    const deadline = Date.now() + 10000;
    while (!waiting && Date.now() < deadline) {
      const [row] = await db`
        select exists(select 1 from pg_stat_activity
          where datname=current_database() and state='active' and wait_event_type='Lock'
            and wait_event='advisory' and query ilike '%configure_intake_assignment_policy%') as waiting
      `;
      waiting = Boolean(row!.waiting);
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(
      waiting,
      'configuration call must wait on the serialized form lock',
    ).toBe(true);
    await db`update public.workspace_memberships
      set revoked_at=clock_timestamp(),revoked_by=${f.po.userId}
      where workspace_id=${f.wsA.id} and user_id=${f.trainerA.userId} and revoked_at is null`;
    release();
    await hold;
    const result = await pending;
    await expectInvariantFailure(
      'authorization revoked during lock wait must return not_found',
      () => expect(result).toEqual({ status: 'not_found' }),
    );
    const baseline = await caller.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.trainerA.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      try {
        const [row] = await tx`
          select public.configure_intake_assignment_policy(
            ${f.wsA.id},${formId},1,'new_clients','{}'::uuid[],'onboarding',
            '{"client_deadline_days":7}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb
          ) as result
        `;
        return row!.result;
      } finally {
        await tx`reset role`;
      }
    });
    expect(
      baseline,
      'unmutated function must return not_found for the revoked trainer',
    ).toEqual({ status: 'not_found' });
  } finally {
    if (release) release();
    await Promise.allSettled([hold, ...(pending ? [pending] : [])]);
    await blocker.end();
    await caller.end();
  }
});
