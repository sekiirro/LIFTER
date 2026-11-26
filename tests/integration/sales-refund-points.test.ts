import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { call, request, sql } from './registration-approval-operations-fixture';
import { pending } from './client-accounts-fixture';
import { checked, issue, registrationFixture } from './registration-links-fixture';

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
    const client = await pending(tx, f, { registration_link_id: link });
    return {
      id: client.id as string,
      userId: client.auth_user_id as string,
      link,
      rows: null,
      email: client.email_normalized as string,
      password: 'Synthetic-only',
    };
  });
  const approved = await call(f.po.client, 'approve', request(f, target));
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

  const first = await refund(f.po.client, f.wsA.id, target.id, purchaseId, '1');
  expect(first.status).toBe('ok');
  const second = await refund(f.po.client, f.wsA.id, target.id, purchaseId, '1');
  expect(second.status).toBe('ok');

  const reversals = await db`
    select points::text as points, source_key
    from public.p7_adjustment_entries
    where workspace_id=${f.wsA.id} and source_key=${unit!.id}`;
  expect(reversals).toEqual([{ points: '-1.00', source_key: unit!.id }]);
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

  const fullSetup = await salesAcquisition();
  const { target: fullTarget, approved: fullApproval } = fullSetup;
  expect(fullApproval.status).toBe('ok');
  const [fullUnit] = await db`
    select u.id, e.amount_minor::text as collected
    from public.sales_productivity_units u
    join app_private.registration_approval_events a
      on a.workspace_id=u.workspace_id and a.id=u.approval_event_id
    join public.payment_events e
      on e.workspace_id=a.workspace_id and e.subscription_id=a.subscription_id
        and e.kind='collection'
    where u.workspace_id=${f.wsA.id} and u.client_id=${fullTarget.id}`;
  expect(fullUnit?.id).toBeTruthy();
  const requestKey = randomUUID();
  const fullPurchase = fullApproval.receipt!.subscription_id as string;
  const concurrent = await Promise.all([
    refund(f.po.client, f.wsA.id, fullTarget.id, fullPurchase, fullUnit!.collected, requestKey),
    refund(f.po.client, f.wsA.id, fullTarget.id, fullPurchase, fullUnit!.collected, requestKey),
  ]);
  expect(concurrent.map((result) => result.status)).toEqual(['ok', 'ok']);
  const reviews = await db`
    select acquisition_key, state from public.p7_refund_fault_reviews
    where workspace_id=${f.wsA.id} and acquisition_key=${fullUnit!.id}`;
  expect(reviews).toEqual([{ acquisition_key: fullUnit!.id, state: 'open' }]);
});

it('T023 denies Sales access to the full-refund questionnaire decision RPC', async () => {
  const f = await registrationFixture();
  const result = await f.salesA.client.rpc('p7_resolve_refund_fault_review', {
    request: {
      workspace_id: f.wsA.id,
      acquisition_key: randomUUID(),
      expected_revision: 0,
      staff_deductions: [],
      staff_fault: false,
      request_key: randomUUID(),
    },
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ status: 'not_permitted' });
});
