import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createStaff } from './harness';
import {
  clientContext,
  registered,
  request,
  sql,
} from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());

async function createSelection(
  workspaceId: string,
  label: string,
  connection = db,
) {
  const policy = `t008-${randomUUID()}`;
  const formId = randomUUID();
  const definition = { questions: [{ id: 'q1', type: 'short_text' }] };
  await connection`
    insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')
  `;
  await connection`insert into public.forms(id,workspace_id,name)
    values(${formId},${workspaceId},${label})`;
  await connection`
    insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${policy},${connection.json(definition)},'published')
  `;
  return { formId, policy, definition };
}

it('T008 serializes distinct selections racing with the F12 approval fact', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const first = await createSelection(
    context.wsA.id,
    'T008 concurrent option one',
  );
  const second = await createSelection(
    context.wsA.id,
    'T008 concurrent option two',
  );

  const [approval, firstSelection, secondSelection] = await Promise.all([
    context.po.client.rpc('registration_approve', {
      request: request(context, client),
    }),
    context.po.client.rpc('select_intake_form', {
      p_workspace_id: context.wsA.id,
      p_client_id: client.id,
      p_form_id: first.formId,
      p_version_number: 1,
    }),
    context.po.client.rpc('select_intake_form', {
      p_workspace_id: context.wsA.id,
      p_client_id: client.id,
      p_form_id: second.formId,
      p_version_number: 1,
    }),
  ]);

  expect(approval.error).toBeNull();
  expect((approval.data as { status: string }).status).toBe('ok');
  expect(firstSelection.error).toBeNull();
  expect(secondSelection.error).toBeNull();
  const selectionStatuses = [
    (firstSelection.data as { status: string }).status,
    (secondSelection.data as { status: string }).status,
  ];
  expect(
    selectionStatuses.some((status) =>
      ['assigned', 'waiting_for_approval'].includes(status),
    ),
  ).toBe(true);
  expect(
    selectionStatuses.every((status) =>
      ['assigned', 'waiting_for_approval', 'conflict', 'not_found'].includes(
        status,
      ),
    ),
  ).toBe(true);

  const [selectionRows, assignmentRows, consumptionRows, audits] =
    await Promise.all([
      db`select form_id from app_private.form_assignment_selections
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
      db`select form_id,id from public.form_assignments
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
      db`select subscription_id,assignment_id from app_private.form_assignment_consumptions
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
      db`select count(*)::int as count from public.audit_events
        where action='form.assignment_created' and workspace_id=${context.wsA.id}
          and target_id in (select id from public.form_assignments where client_id=${client.id})`,
    ]);
  expect(selectionRows).toHaveLength(1);
  expect([first.formId, second.formId]).toContain(selectionRows[0]?.form_id);
  expect(assignmentRows).toHaveLength(1);
  expect(consumptionRows).toHaveLength(1);
  expect(consumptionRows[0]?.assignment_id).toBe(assignmentRows[0]?.id);
  expect(audits).toEqual([{ count: 1 }]);
});

it('T008 leaves a rejected F12 client unassigned when a selection fact exists', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const selection = await createSelection(
    context.wsA.id,
    'T008 rejected client',
  );

  const selected = await context.po.client.rpc('select_intake_form', {
    p_workspace_id: context.wsA.id,
    p_client_id: client.id,
    p_form_id: selection.formId,
    p_version_number: 1,
  });
  expect(selected.error).toBeNull();
  expect((selected.data as { status: string }).status).toBe(
    'waiting_for_approval',
  );

  const rejected = await context.po.client.rpc('registration_reject', {
    request: request(context, client, 'reject'),
  });
  expect(rejected.error).toBeNull();
  expect((rejected.data as { status: string }).status).toBe('ok');
  expect(
    await db`select 1 from app_private.registration_approval_events
      where workspace_id=${context.wsA.id} and client_id=${client.id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from public.form_assignments
      where workspace_id=${context.wsA.id} and client_id=${client.id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from app_private.form_assignment_consumptions
      where workspace_id=${context.wsA.id} and client_id=${client.id}`,
  ).toHaveLength(0);
});

it('T008 rolls back selection, assignment, consumption, and audit when assignment audit fails', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const selection = await createSelection(
    context.wsA.id,
    'T008 audit rollback',
  );
  const auditGuard = `t008_reject_audit_${randomUUID().replaceAll('-', '')}`;
  const auditTrigger = `t008_reject_audit_trigger_${randomUUID().replaceAll('-', '')}`;

  const approved = await context.po.client.rpc('registration_approve', {
    request: request(context, client),
  });
  expect(approved.error).toBeNull();
  expect((approved.data as { status: string }).status).toBe('ok');

  await db.unsafe(`create function app_private.${auditGuard}() returns trigger
    language plpgsql set search_path = '' as $$ begin
      if new.action='form.assignment_created' then raise exception 'synthetic assignment audit outage'; end if;
      return new;
    end $$`);
  await db.unsafe(`create trigger ${auditTrigger}
    before insert on public.audit_events for each row
    execute function app_private.${auditGuard}()`);
  try {
    const result = await context.po.client.rpc('select_intake_form', {
      p_workspace_id: context.wsA.id,
      p_client_id: client.id,
      p_form_id: selection.formId,
      p_version_number: 1,
    });
    expect(result.error).toBeNull();
    expect((result.data as { status: string }).status).toBe('unavailable');
    expect(
      await db`select 1 from app_private.form_assignment_selections
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from public.form_assignments
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from app_private.form_assignment_consumptions
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from public.audit_events
        where action='form.assignment_created' and workspace_id=${context.wsA.id}
          and target_id in (select id from public.form_assignments where client_id=${client.id})`,
    ).toHaveLength(0);
  } finally {
    await db.unsafe(
      `drop trigger if exists ${auditTrigger} on public.audit_events`,
    );
    await db.unsafe(`drop function if exists app_private.${auditGuard}()`);
  }
});

it('T008 rechecks selection authorization after an advisory-lock wait', async () => {
  const context = await clientContext();
  const client = await registered(context);
  const trainer = await createStaff('trainer', 't008-stale-authorization');
  const selection = await createSelection(
    context.wsA.id,
    'T008 stale authorization',
  );
  const lockKey = `${context.wsA.id}:${client.id}`;
  await db`
    insert into public.workspace_memberships(workspace_id,user_id,granted_by)
    values(${context.wsA.id},${trainer.userId},${context.po.userId})
  `;

  const blocker = sql();
  const selector = sql();
  let signalLock!: () => void;
  let releaseLock!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    signalLock = resolve;
  });
  const hold = blocker.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(pg_catalog.hashtextextended(${lockKey},0))`;
    signalLock();
    await new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
  });
  await lockAcquired;

  let selected: Promise<unknown> | undefined;
  try {
    selected = selector.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: trainer.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [row] = await tx`
        select public.select_intake_form(${context.wsA.id},${client.id},${selection.formId},1) as result
      `;
      return row?.result;
    });

    let waiting = false;
    const deadline = Date.now() + 8000;
    while (!waiting && Date.now() < deadline) {
      const [row] = await db`
        select exists(
          select 1 from pg_catalog.pg_stat_activity
          where datname=current_database() and state='active'
            and wait_event_type='Lock' and wait_event='advisory'
            and query ilike '%select_intake_form%'
        ) as waiting
      `;
      waiting = Boolean(row?.waiting);
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(
      waiting,
      'select_intake_form must reach the controlled advisory-lock wait',
    ).toBe(true);

    await db`
      update public.workspace_memberships
      set revoked_at=clock_timestamp(), revoked_by=${context.po.userId}
      where workspace_id=${context.wsA.id} and user_id=${trainer.userId} and revoked_at is null
    `;
    releaseLock();
    await hold;
    const result = (await selected) as { status: string };
    expect(result.status).toBe('unavailable');
    expect(
      await db`select 1 from app_private.form_assignment_selections
        where workspace_id=${context.wsA.id} and client_id=${client.id}`,
    ).toHaveLength(0);
  } finally {
    if (releaseLock) releaseLock();
    await Promise.allSettled([hold, ...(selected ? [selected] : [])]);
    await blocker.end();
    await selector.end();
  }
});

function assertF12LockOrder(body: string) {
  const clientLock = body.indexOf('select * into c from public.clients');
  const subscriptionLock = body.indexOf(
    'perform s.id from public.subscriptions',
  );
  const obligationLock = body.indexOf(
    'perform i.id from public.subscription_installments',
  );
  const eventLock = body.indexOf('perform e.id from public.payment_events');
  expect(clientLock).toBeGreaterThanOrEqual(0);
  expect(subscriptionLock).toBeGreaterThan(clientLock);
  expect(obligationLock).toBeGreaterThan(subscriptionLock);
  expect(eventLock).toBeGreaterThan(obligationLock);
}

it('T008 preserves the F12 client, subscription, obligation, and event lock order', async () => {
  const [row] = await db`
    select p.prosrc as body from pg_catalog.pg_proc p
    where p.oid=to_regprocedure('app_private.f12_u3_operation(text,jsonb)')
  `;
  expect(row?.body).toBeTruthy();
  assertF12LockOrder(row?.body as string);
});

it('T008 lock-order assertion kills a client/subscription lock-order mutant', async () => {
  const [row] = await db`
      select p.prosrc as body from pg_catalog.pg_proc p
      where p.oid='app_private.f12_u3_operation(text,jsonb)'::regprocedure
  `;
  const clientLock =
    'select * into c from public.clients where workspace_id=ws and id=cid for update;';
  const subscriptionLock =
    'perform s.id from public.subscriptions s where s.workspace_id=ws and s.client_id=cid order by s.id for update;';
  const body = row?.body as string;
  expect(body).toContain(clientLock);
  expect(body).toContain(subscriptionLock);
  const mutatedBody = body
    .replace(clientLock, '__LOCK_SWAP__')
    .replace(subscriptionLock, clientLock)
    .replace('__LOCK_SWAP__', subscriptionLock);
  expect(() => assertF12LockOrder(mutatedBody)).toThrow();
});
