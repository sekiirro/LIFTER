import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { call, request, sql } from './registration-approval-operations-fixture';
import { pending } from './client-accounts-fixture';
import {
  checked,
  issue,
  registrationFixture,
} from './registration-links-fixture';

const db = sql();
afterAll(() => db.end());

async function refund(
  client: Awaited<ReturnType<typeof registrationFixture>>['po']['client'],
  workspaceId: string,
  clientId: string,
  purchaseId: string,
  amountMinor: string,
  requestKey = randomUUID(),
) {
  const result = await client.rpc('record_refund', {
    request: {
      workspace_id: workspaceId,
      client_id: clientId,
      purchase_id: purchaseId,
      request_key: requestKey,
      amount_minor: amountMinor,
      external_confirmation: true,
    },
  });
  if (result.error) return { status: 'rpc_error', code: result.error.code };
  return result.data as { status: string };
}

async function salesAcquisition() {
  const f = await registrationFixture();
  const link = checked(await issue(f, f.salesA.client)) as string;
  const target = await db.begin(async (tx) => {
    const client = await pending(
      tx,
      { ...f, link },
      { registration_link_id: link },
    );
    return {
      id: client.id as string,
      userId: client.auth_user_id as string,
      link,
      rows: null,
      email: client.email_normalized as string,
      password: 'Synthetic-only',
    };
  });
  const approved = await call(
    f.po.client,
    'approve',
    request({ ...f, link }, target),
  );
  return { f, target, approved };
}

it('T022 reverses a Sales acquisition once across repeated completed partial refunds', async () => {
  const { f, target, approved } = await salesAcquisition();
  expect(approved.status).toBe('ok');
  const purchaseId = approved.receipt!.subscription_id as string;
  const [unit] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(unit?.id).toBeTruthy();

  const concurrent = await Promise.all([
    refund(f.po.client, f.wsA.id, target.id, purchaseId, '1'),
    refund(f.po.client, f.wsA.id, target.id, purchaseId, '1'),
  ]);
  expect(concurrent.map((result) => result.status)).toEqual(['ok', 'ok']);

  const reversals = await db`
    select points::text as points, source_key
    from public.p7_adjustment_entries
    where workspace_id=${f.wsA.id} and source_key=${unit!.id}`;
  expect(reversals).toEqual([{ points: '-1.00', source_key: unit!.id }]);
  const reversalAudit = await db`
    select action,details from public.audit_events
    where workspace_id=${f.wsA.id} and action='workforce.sales_acquisition_reversed'`;
  expect(reversalAudit).toHaveLength(1);
  expect(Object.keys(reversalAudit[0]?.details as object)).toEqual([
    'reference',
  ]);
});

it('T022 opens one PO review for a full refund and none for a partial refund', async () => {
  const partialSetup = await salesAcquisition();
  const { f } = partialSetup;
  const { target: partialTarget, approved: partialApproval } = partialSetup;
  expect(partialApproval.status).toBe('ok');
  const [partialUnit] = await db`
    select id from public.sales_productivity_units
    where workspace_id=${f.wsA.id} and client_id=${partialTarget.id}`;
  const partial = await refund(
    f.po.client,
    f.wsA.id,
    partialTarget.id,
    partialApproval.receipt!.subscription_id as string,
    '1',
  );
  expect(partial.status).toBe('ok');
  const partialReviews = await db`
    select acquisition_key from public.p7_refund_fault_reviews
    where workspace_id=${f.wsA.id} and acquisition_key=${partialUnit!.id}`;
  expect(partialReviews).toEqual([]);

  const requestKey = randomUUID();
  const fullPurchase = partialApproval.receipt!.subscription_id as string;
  const concurrent = await Promise.all([
    refund(
      f.po.client,
      f.wsA.id,
      partialTarget.id,
      fullPurchase,
      '1199',
      requestKey,
    ),
    refund(
      f.po.client,
      f.wsA.id,
      partialTarget.id,
      fullPurchase,
      '1199',
      requestKey,
    ),
  ]);
  expect(concurrent.map((result) => result.status)).toEqual(['ok', 'ok']);
  const reviews = await db`
    select acquisition_key, state from public.p7_refund_fault_reviews
    where workspace_id=${f.wsA.id} and acquisition_key=${partialUnit!.id}`;
  expect(reviews).toEqual([
    { acquisition_key: partialUnit!.id, state: 'open' },
  ]);
  const openedAudit = await db`
    select action,details from public.audit_events
    where workspace_id=${f.wsA.id} and action='workforce.refund_fault_review_opened'`;
  expect(openedAudit).toHaveLength(1);
  expect(Object.keys(openedAudit[0]?.details as object)).toEqual(['reference']);
  const [reversalCount] = await db`
    select count(*)::int as count from public.p7_adjustment_entries
    where workspace_id=${f.wsA.id} and source_key=${partialUnit!.id}`;
  expect(reversalCount?.count).toBe(1);
  const [hold] = await db`select app_private.p7_retention_has_open_dispute(
    ${f.wsA.id},${partialTarget.id}) as blocked`;
  expect(hold?.blocked).toBe(true);
});

it('T023 denies Sales access to the full-refund questionnaire decision RPC', async () => {
  const { f, target, approved } = await salesAcquisition();
  const purchaseId = approved.receipt!.subscription_id as string;
  const [funds] = await db`
    select sum(e.amount_minor)::text as collected
    from public.payment_events e
    where e.workspace_id=${f.wsA.id} and e.subscription_id=${purchaseId} and e.kind='collection'`;
  expect(
    (
      await refund(
        f.po.client,
        f.wsA.id,
        target.id,
        purchaseId,
        funds!.collected,
      )
    ).status,
  ).toBe('ok');
  const [review] = await db`
    select id from public.p7_refund_fault_reviews
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  expect(review?.id).toBeTruthy();
  const result = await f.salesA.client.rpc('p7_resolve_refund_fault_review', {
    request: {
      workspace_id: f.wsA.id,
      review_id: review!.id,
      expected_revision: 0,
      staff_deductions: [{ staff_user_id: f.trainerA.userId, points: '-1.00' }],
      staff_fault: true,
      request_key: randomUUID(),
    },
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'not_permitted' });
});

it('T023 lets the PO answer yes and atomically posts one selected point deduction', async () => {
  const { f, target, approved } = await salesAcquisition();
  const purchaseId = approved.receipt!.subscription_id as string;
  const [funds] = await db`
    select sum(e.amount_minor)::text as collected
    from public.payment_events e
    where e.workspace_id=${f.wsA.id} and e.subscription_id=${purchaseId} and e.kind='collection'`;
  expect(
    (
      await refund(
        f.po.client,
        f.wsA.id,
        target.id,
        purchaseId,
        funds!.collected,
      )
    ).status,
  ).toBe('ok');
  const [review] = await db`
    select id,acquisition_key from public.p7_refund_fault_reviews
    where workspace_id=${f.wsA.id} and client_id=${target.id}`;
  const listed = await f.po.client.rpc('p7_list_open_refund_fault_reviews', {
    p_workspace_id: f.wsA.id,
  });
  expect(listed.error).toBeNull();
  expect(listed.data).toMatchObject({
    status: 'ok',
    reviews: [
      { review_id: review!.id, acquisition_key: review!.acquisition_key },
    ],
  });

  const input = {
    workspace_id: f.wsA.id,
    review_id: review!.id,
    expected_revision: 0,
    staff_fault: true,
    staff_deductions: [{ staff_user_id: f.trainerA.userId, points: '-0.50' }],
    request_key: randomUUID(),
  };
  const salaryBefore = await db`
    select count(*)::int as count from public.p7_salary_revisions
    where employee_id=${f.trainerA.userId}`;
  const answers = await Promise.all([
    f.po.client.rpc('p7_resolve_refund_fault_review', { request: input }),
    f.po.client.rpc('p7_resolve_refund_fault_review', { request: input }),
  ]);
  expect(answers.map((answer) => answer.data?.status)).toEqual(['ok', 'ok']);
  expect(answers[0]?.data).toEqual(answers[1]?.data);
  expect(answers.map((answer) => answer.error)).toEqual([null, null]);
  const entries = await db`
    select staff_user_id,points::text as points,reason_code,source_key
    from public.p7_adjustment_entries
    where workspace_id=${f.wsA.id} and reason_code='refund_staff_fault'`;
  expect(entries).toEqual([
    {
      staff_user_id: f.trainerA.userId,
      points: '-0.50',
      reason_code: 'refund_staff_fault',
      source_key: expect.any(String),
    },
  ]);
  const [resolution] = await db`
    select staff_fault,state from public.p7_refund_fault_review_resolutions d
    join public.p7_refund_fault_reviews r on r.workspace_id=d.workspace_id and r.id=d.review_id
    where d.workspace_id=${f.wsA.id} and d.review_id=${review!.id}`;
  expect(resolution).toEqual({ staff_fault: true, state: 'resolved' });
  const salaryAfter = await db`
    select count(*)::int as count from public.p7_salary_revisions
    where employee_id=${f.trainerA.userId}`;
  expect(salaryAfter).toEqual(salaryBefore);
  const [hold] = await db`select app_private.p7_retention_has_open_dispute(
    ${f.wsA.id},${target.id}) as blocked`;
  expect(hold?.blocked).toBe(false);
  const audit = await db`
    select action,details from public.audit_events
    where workspace_id=${f.wsA.id} and action='workforce.refund_fault_review_resolved'`;
  expect(audit).toHaveLength(1);
  expect(audit[0]?.details).toMatchObject({ reference: expect.any(String) });
  expect(Object.keys(audit[0]?.details as object)).toEqual(['reference']);
});

it('T022/T023 mutation probes kill the reversal and PO authorization guard mutants', async () => {
  const reversalSetup = await salesAcquisition();
  const reversalDefinition = await db`
    select pg_catalog.pg_get_functiondef('public.record_refund(jsonb)'::regprocedure) as definition`;
  const originalRefund = reversalDefinition[0]!.definition as string;
  const reversalNeedle =
    'on conflict(workspace_id,source_key) do nothing returning id into reversal_id;';
  const reversalMutant = originalRefund.replace(
    reversalNeedle,
    'returning id into reversal_id;',
  );
  expect(reversalMutant).not.toBe(originalRefund);
  const purchaseId = reversalSetup.approved.receipt!.subscription_id as string;
  try {
    await db.unsafe(reversalMutant);
    const outcomes = await Promise.all([
      refund(
        reversalSetup.f.po.client,
        reversalSetup.f.wsA.id,
        reversalSetup.target.id,
        purchaseId,
        '1',
      ),
      refund(
        reversalSetup.f.po.client,
        reversalSetup.f.wsA.id,
        reversalSetup.target.id,
        purchaseId,
        '1',
      ),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).not.toEqual(['ok', 'ok']);
  } finally {
    await db.unsafe(originalRefund);
    const [restored] = await db`
      select pg_catalog.pg_get_functiondef('public.record_refund(jsonb)'::regprocedure) as definition`;
    expect(restored?.definition).toBe(originalRefund);
  }

  const guardSetup = await salesAcquisition();
  const guardPurchase = guardSetup.approved.receipt!.subscription_id as string;
  expect(
    (
      await refund(
        guardSetup.f.po.client,
        guardSetup.f.wsA.id,
        guardSetup.target.id,
        guardPurchase,
        '1200',
      )
    ).status,
  ).toBe('ok');
  const [review] = await db`select id from public.p7_refund_fault_reviews
    where workspace_id=${guardSetup.f.wsA.id} and client_id=${guardSetup.target.id}`;
  const guardDefinition = await db`
    select pg_catalog.pg_get_functiondef('public.p7_resolve_refund_fault_review(jsonb)'::regprocedure) as definition`;
  const originalResolver = guardDefinition[0]!.definition as string;
  const resolverNeedle =
    'if actor is null or not app_private.is_platform_owner() then';
  const resolverMutant = originalResolver.replace(
    resolverNeedle,
    'if actor is null then',
  );
  expect(resolverMutant).not.toBe(originalResolver);
  try {
    await db.unsafe(resolverMutant);
    const rollback = new Error('T022/T023 mutation probe rollback');
    let mutatedResult: { status: string } | undefined;
    try {
      await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: guardSetup.f.salesA.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] =
          await tx`select public.p7_resolve_refund_fault_review(jsonb_build_object(
          'workspace_id',${guardSetup.f.wsA.id}::uuid,'review_id',${review!.id}::uuid,'expected_revision',0,
          'staff_fault',true,'staff_deductions',jsonb_build_array(jsonb_build_object(
            'staff_user_id',${guardSetup.f.trainerA.userId}::uuid,'points','-1.00'::text)),
          'request_key',${randomUUID()}::uuid)::jsonb) as result`;
        mutatedResult = row!.result as { status: string };
        await tx`reset role`;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(mutatedResult).toMatchObject({ status: 'ok' });
  } finally {
    await db.unsafe(originalResolver);
    const [restored] = await db`
      select pg_catalog.pg_get_functiondef('public.p7_resolve_refund_fault_review(jsonb)'::regprocedure) as definition`;
    expect(restored?.definition).toBe(originalResolver);
  }
});
