import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { issue, checked, schedule } from './registration-links-fixture';
import { calculateCommissionMinor } from '../../lib/registration-approval/money';
import {
  sql,
  probe,
  graph,
  append,
  clientContext,
  tables,
  type Context,
} from './registration-approval-fixture';
const db = sql();
let f: Context;
let sibling: Context;
beforeAll(async () => {
  f = await clientContext();
  sibling = { ...f, link: checked(await issue(f)) as string };
});
afterAll(() => db.end());
it('T009 valid initial graph, exact original reversal and recollection preserve all originals', async () => {
  await probe(async (tx) => {
    const ids = await graph(tx, f);
    await tx`set constraints all immediate`;
    const original =
      await tx`select * from public.payment_events where id=${ids.event}`;
    await tx`set constraints all deferred`;
    const reversal = await append(tx, f, ids);
    await tx`set constraints all immediate`;
    const operation = randomUUID(),
      event = randomUUID();
    await tx`set constraints all deferred`;
    await tx`insert into app_private.registration_operations(id,workspace_id,actor_user_id,request_key,operation,client_id,subscription_id,obligation_id,event_id,expected_installment_seq,expected_revision,expected_previous_event_id,canonical_args_hash,result_receipt) values(${operation},${f.wsA.id},${f.po.userId},${randomUUID()},'collect',${ids.client},${ids.subscription},${ids.obligation},${event},1,2,${reversal.id},decode(repeat('ab',32),'hex'),'{}')`;
    await tx`insert into public.payment_events(id,workspace_id,subscription_id,obligation_id,installment_seq,revision,previous_event_id,kind,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,operation_id) values(${event},${f.wsA.id},${ids.subscription},${ids.obligation},1,3,${reversal.id},'collection',1200,'USD',2,'1900-01-02','1900-01-02',${f.po.userId},${operation})`;
    await tx`set constraints all immediate`;
    expect(
      await tx`select * from public.payment_events where id=${ids.event}`,
    ).toEqual(original);
    const [net] =
      await tx`select sum(amount_minor)::text as amount,sum(commission_minor)::text as commission from public.payment_events where obligation_id=${ids.obligation}`;
    expect(net).toEqual({ amount: '1200', commission: '2' });
  });
});
it.each([
  { price: '1201' },
  { installment: '1199' },
  { commission: '1' },
  { amount: '1199' },
  { currency: 'EGP' },
  { offset: 1 },
])(
  'T009 rejects snapshot, total, money and commission drift %#',
  async (options) => {
    await expect(
      probe(async (tx) => {
        await graph(tx, f, options);
        await tx`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  },
);
it.each([
  { amount_minor: '-1199' },
  { commission_minor: '-1' },
  { revision: 3 },
  {
    kind: 'collection',
    reverses_event_id: null,
    amount_minor: '1200',
    commission_minor: '2',
    collected_on: '1900-01-01',
  },
  { effective_on: '1900-01-01' },
])(
  'T009 malformed chain/reversal/date fails independently of public RPC %#',
  async (patch) => {
    await expect(
      probe(async (tx) => {
        const ids = await graph(tx, f);
        await append(tx, f, ids, patch);
        await tx`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  },
);
it('T009 deferred schedule correspondence survives bypassing immediate insert guard', async () => {
  await expect(
    probe(async (tx) => {
      await tx`alter table public.subscription_installments disable trigger f12_installment_insert`;
      await graph(tx, f, { installment: '1199', amount: '1199' });
      await tx`set constraints all immediate`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('T009 deferred chain correspondence survives bypassing immediate event guard', async () => {
  await expect(
    probe(async (tx) => {
      await tx`alter table public.payment_events disable trigger f12_payment_insert`;
      const ids = await graph(tx, f);
      await append(tx, f, ids, { commission_minor: '-1' });
      await tx`set constraints all immediate`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('T009 unique root/revision/successor and reversal indexes independently prevent branches', async () => {
  const rows =
    await db`select indexname,indexdef from pg_indexes where schemaname='public' and tablename='payment_events'`;
  for (const name of [
    'f12_payment_root',
    'f12_payment_revision',
    'f12_payment_successor',
    'f12_payment_reversal',
  ]) {
    expect(rows.map((row) => row.indexname)).toContain(name);
    expect(rows.find((r) => r.indexname === name)?.indexdef).toContain(
      'UNIQUE',
    );
  }
  await expect(
    probe(async (tx) => {
      await tx`alter table public.payment_events disable trigger f12_payment_insert`;
      const ids = await graph(tx, f);
      await tx`insert into public.payment_events select ${randomUUID()}::uuid,workspace_id,subscription_id,obligation_id,installment_seq,revision,previous_event_id,kind,reverses_event_id,amount_minor,currency,commission_minor,collected_on,effective_on,recorded_by,recorded_at,operation_id from public.payment_events where id=${ids.event}`;
    }),
  ).rejects.toMatchObject({ code: '23505' });
});
it('T009 cross-workspace and wrong-subscription obligation FK independently reject', async () => {
  for (const patch of [
    { workspace_id: f.wsB.id },
    { subscription_id: randomUUID() },
    { obligation_id: randomUUID() },
  ])
    await expect(
      probe(async (tx) => {
        await tx`alter table public.payment_events disable trigger f12_payment_insert`;
        const ids = await graph(tx, f);
        await append(tx, f, ids, patch);
      }),
    ).rejects.toMatchObject({ code: '23503' });
});
it.each(tables)(
  'T009 privileged UPDATE/DELETE/TRUNCATE guard: %s',
  async (table) => {
    for (const role of ['postgres', 'service_role'])
      for (const op of ['update', 'delete', 'truncate'])
        await expect(
          probe(async (tx) => {
            const ids = await graph(tx, f);
            await tx`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id, activation_source) values(${f.wsA.id},${ids.subscription},now(),${randomUUID()}, 'po_override')`;
            await tx`set constraints all immediate`;
            // Remove incoming FKs only within this rolled-back probe to avoid FK masking.
            if (op === 'truncate') {
              const incoming =
                await tx`select format('alter table %s drop constraint %I',conrelid::regclass,conname) as ddl from pg_constraint where contype='f' and confrelid=${table}::regclass`;
              for (const row of incoming) await tx.unsafe(row.ddl);
            }
            if (role === 'service_role') {
              await tx`grant usage on schema app_private to service_role`;
              await tx.unsafe(
                `grant select,update,delete,truncate on ${table} to service_role`,
              );
              await tx`set local role service_role`;
            }
            await tx.unsafe(
              op === 'update'
                ? `update ${table} set id=id`
                : op === 'delete'
                  ? `delete from ${table}`
                  : `truncate ${table}`,
            );
          }),
        ).rejects.toMatchObject({ code: '23514' });
  },
);
it('T009 SQL commission agrees with BigInt at ties and bigint bounds; invalid inputs fail', async () => {
  for (const amount of ['1', '2500', '9007199254740993', '9223372036854775807'])
    for (const rate of [0, 17, 5000, 10000]) {
      const [row] =
        await db`select app_private.f12_commission_minor(${amount}::bigint,${rate})::text as result`;
      expect(row!.result).toBe(calculateCommissionMinor(amount, rate));
    }
  for (const rate of [-1, 10001])
    await expect(
      db`select app_private.f12_commission_minor(1,${rate})`,
    ).rejects.toMatchObject({ code: '22023' });
  await expect(
    db`select app_private.f12_commission_minor(9223372036854775808::bigint,17)`,
  ).rejects.toMatchObject({ code: '22003' });
});
it('T009 unmatched decision, unsigned client state/identity changes and forged transaction proof fail', async () => {
  await expect(
    probe(async (tx) => {
      const ids = await graph(tx, f);
      await tx`update public.clients set approval_state='rejected' where id=${ids.client}`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    probe(async (tx) => {
      const ids = await graph(tx, f);
      await tx`update public.clients set name='changed' where id=${ids.client}`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    probe(async (tx) => {
      await tx`alter table public.clients disable trigger f12_client_transition`;
      const ids = await graph(tx, f);
      await tx`update public.clients set approval_state='pending-approval' where id=${ids.client}`;
      await tx`set constraints all immediate`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});

it('T009 existing same-workspace wrong parent cannot borrow an obligation or predecessor', async () => {
  for (const field of [
    'subscription_id',
    'obligation_id',
    'previous_event_id',
    'reverses_event_id',
  ])
    await expect(
      probe(async (tx) => {
        await tx`alter table public.payment_events disable trigger f12_payment_insert`;
        const a = await graph(tx, f),
          b = await graph(tx, sibling);
        const other =
          field === 'subscription_id'
            ? b.subscription
            : field === 'obligation_id'
              ? b.obligation
              : b.event;
        await append(tx, f, a, {
          [field]: other,
          ...(field === 'previous_event_id'
            ? { reverses_event_id: other }
            : {}),
        });
        await tx`set constraints all immediate`;
      }),
    ).rejects.toMatchObject({
      code: field === 'reverses_event_id' ? '23514' : '23503',
    });
});
it('T009 only one initial subscription per client, independently of operation key', async () => {
  await expect(
    probe(async (tx) => {
      const ids = await graph(tx, f);
      await tx`insert into public.subscriptions(id,workspace_id,client_id,registration_link_id,package_version_id,price_minor,currency,commission_rate_bp,duration_days,duration_months,created_by)
    values(${randomUUID()},${f.wsA.id},${ids.client},${f.link},${f.p.versionId},1200,'USD',17,61,null,${f.po.userId})`;
    }),
  ).rejects.toMatchObject({ code: '23505' });
});
it('T009 client identity remains frozen even alongside a legitimate decision', async () => {
  await expect(
    probe(async (tx) => {
      await tx`alter table public.clients disable trigger f12_client_transition`;
      await tx`alter table public.clients disable trigger audit_client_approval`;
      const ids = await graph(tx, f);
      await tx`set constraints all immediate`;
      await tx`alter table public.clients enable trigger f12_client_transition`;
      await tx`alter table public.clients enable trigger audit_client_approval`;
      await tx`update public.clients set name='forged' where id=${ids.client}`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
});
it('T009 existing F10 schedule first/second offsets stay exact with no current-offer assumption', async () => {
  const link = checked(
    await issue(f, f.po.client, { installments: schedule }),
  ) as string;
  await expect(
    probe(async (tx) => {
      await graph(tx, { ...f, link });
      await tx`set constraints all immediate`;
    }),
  ).rejects.toMatchObject({ code: '23514' });
  await probe(async (tx) => {
    const ids = await graph(
      tx,
      { ...f, link },
      { issuedRows: schedule, amount: '400', commission: '1' },
    );
    await tx`set constraints all immediate`;
    expect(
      await tx`select seq,amount_minor::text,issued_day_offset as due_offset_days from public.subscription_installments where subscription_id=${ids.subscription} order by seq`,
    ).toEqual(schedule);
  });
});
