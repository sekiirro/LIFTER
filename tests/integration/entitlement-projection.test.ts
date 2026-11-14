import { afterAll, expect, it } from 'vitest';
import {
  clientContext,
  graph,
  probe,
  sql,
} from './registration-approval-fixture';

const db = sql();
afterAll(() => db.end());

it('T011 exposes a tenant-scoped immutable-fact projection and service-only materializer', async () => {
  const [projection] = await db`
    select p.prosrc, p.prosecdef, p.proconfig,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
    from pg_proc p
    where p.oid=to_regprocedure('app_private.f13_project_entitlement(uuid,uuid,date)')`;
  const [materializer] = await db`
    select p.prosrc, p.prosecdef, p.proconfig,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
    from pg_proc p
    where p.oid=to_regprocedure('app_private.f13_materialize_entitlement(uuid,uuid,date)')`;
  expect(projection).toBeDefined();
  expect(projection).toMatchObject({ prosecdef: true, auth_execute: false });
  expect(projection!.proconfig).toContain('search_path=""');
  expect(projection!.prosrc).toMatch(/subscription_activations/i);
  expect(projection!.prosrc).toMatch(/subscription_freezes/i);
  expect(projection!.prosrc).toMatch(/refund_operations/i);
  expect(projection!.prosrc).not.toMatch(
    /subscription_entitlement_projection/i,
  );
  expect(materializer).toMatchObject({
    prosecdef: true,
    auth_execute: false,
    service_execute: true,
  });
  expect(materializer!.prosrc).toMatch(/f13_project_entitlement/i);
  expect(materializer!.prosrc).toMatch(/on conflict/i);
});

it('T011 derives awaiting, future, frozen and exclusive-expiry states directly from source facts', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    const [awaiting] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-11-01'::date) as projection
    `;
    expect(awaiting!.projection).toMatchObject({
      status: 'awaiting_activation',
    });

    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${ids.subscription},'2026-11-01 10:00:00+02',${ids.event}, 'po_override')`;
    const [future] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-10-31'::date) as projection
    `;
    expect(future!.projection).toMatchObject({ status: 'future' });

    await tx`insert into public.subscription_freezes(workspace_id,subscription_id,applied_on,duration_days,applied_by)
      values(${f.wsA.id},${ids.subscription},'2026-11-05',3,${f.po.userId})`;
    const [frozen] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-11-06'::date) as projection
    `;
    expect(frozen!.projection).toEqual({
      status: 'frozen',
      effective_end_exclusive: '2027-01-04',
      coverage_end_exclusive: '2027-01-04',
    });
    const [exclusiveEnd] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2027-01-04'::date) as projection
    `;
    expect(exclusiveEnd!.projection).toMatchObject({ status: 'expired' });
  });
});

it('T011 materializes the derived exclusive expiry idempotently and does not gate projection freshness', async () => {
  const f = await clientContext();
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source)
      values(${f.wsA.id},${ids.subscription},'2026-11-01 10:00:00+02',${ids.event}, 'po_override')`;
    const [fresh] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2026-11-01'::date) as projection
    `;
    expect(fresh!.projection).toMatchObject({ status: 'active' });
    const [first] = await tx`
      select app_private.f13_materialize_entitlement(${f.wsA.id},${ids.subscription},'2026-11-01'::date)`;
    const [snapshot] = await tx`
      select status, effective_end_exclusive::text as effective_end_exclusive, materialized_at
      from app_private.subscription_entitlement_projection
      where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}`;
    expect(snapshot).toMatchObject({
      status: 'active',
      effective_end_exclusive: '2027-01-01',
    });
    await tx`select app_private.f13_materialize_entitlement(${f.wsA.id},${ids.subscription},'2026-11-01'::date)`;
    const [again] = await tx`
      select status, effective_end_exclusive::text as effective_end_exclusive, materialized_at
      from app_private.subscription_entitlement_projection
      where workspace_id=${f.wsA.id} and subscription_id=${ids.subscription}`;
    expect(again).toEqual(snapshot);
    expect(first).toBeDefined();
    const [expired] = await tx`
      select app_private.f13_project_entitlement(${f.wsA.id},${ids.subscription},'2027-01-01'::date)`;
    expect(expired).toEqual({
      f13_project_entitlement: {
        status: 'expired',
        effective_end_exclusive: '2027-01-01',
        coverage_end_exclusive: null,
      },
    });
  });
});
