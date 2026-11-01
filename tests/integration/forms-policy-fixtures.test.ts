import { expect, it } from 'vitest';
import { sql } from './registration-approval-operations-fixture';
import { withFormsPolicyF13Fixtures } from './forms-policy-fixtures';

it('builds early-paid, freeze-reflowed, resumed, and expired F13 policy fixtures', async () => {
  let checked = false;
  await withFormsPolicyF13Fixtures(async (_tx, _f, scenarios) => {
    expect(scenarios.earlyPaidRenewal.occurrenceKey).toMatch(/^renewal:/);
    expect(scenarios.earlyPaidRenewal.serviceStart).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(scenarios.reflowedRenewal.occurrenceKey).toMatch(/^renewal:/);
    expect(scenarios.reflowedRenewal.serviceStart).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(scenarios.frozenThenUnfrozen.subscriptionId).toBeTruthy();
    expect(scenarios.expiredSubscription.subscriptionId).toBeTruthy();
    checked = true;
  });
  expect(checked).toBe(true);
});

it('keeps the date core private and the public RPC bound to Cairo today', async () => {
  const db = sql();
  try {
    const [row] = await db`
      select core.proowner::regrole::text as core_owner,core.prosecdef as core_definer,
        core.proconfig as core_config,
        has_function_privilege('anon',core.oid,'EXECUTE') as anon_execute,
        has_function_privilege('authenticated',core.oid,'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role',core.oid,'EXECUTE') as service_execute,
        public_fn.proowner::regrole::text as public_owner,
        pg_catalog.pg_get_function_identity_arguments(public_fn.oid) as public_args,
        pg_catalog.pg_get_functiondef(public_fn.oid) as public_definition,
        has_function_privilege('authenticated',public_fn.oid,'EXECUTE') as public_authenticated_execute,
        has_function_privilege('anon',public_fn.oid,'EXECUTE') as public_anon_execute,
        has_function_privilege('service_role',public_fn.oid,'EXECUTE') as public_service_execute
      from pg_catalog.pg_proc core
      join pg_catalog.pg_namespace core_ns on core_ns.oid=core.pronamespace
      cross join pg_catalog.pg_proc public_fn
      join pg_catalog.pg_namespace public_ns on public_ns.oid=public_fn.pronamespace
      where core_ns.nspname='app_private'
        and core.proname='materialize_intake_assignment_occurrence_core'
        and core.proargtypes='2950 2950 25 1082'::oidvector
        and public_ns.nspname='public'
        and public_fn.proname='materialize_intake_assignment_occurrence'
        and public_fn.proargtypes='2950 2950 25'::oidvector
    `;
    expect(row).toMatchObject({
      core_owner: 'postgres',
      core_definer: true,
      anon_execute: false,
      authenticated_execute: false,
      service_execute: false,
      public_owner: 'postgres',
      public_args: 'p_workspace_id uuid, p_form_id uuid, p_occurrence_key text',
      public_authenticated_execute: true,
      public_anon_execute: false,
      public_service_execute: false,
    });
    expect(row?.core_config).toContain('search_path=""');
    expect(row?.public_definition).toMatch(
      /transaction_timestamp\(\) at time zone 'Africa\/Cairo'\)\:\:date/i,
    );
  } finally {
    await db.end();
  }
});
