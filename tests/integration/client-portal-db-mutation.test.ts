import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import {
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 DB-level mutation evidence (T015, T026 read gate, T033/T038, T020).
// Each test kills one database control inside a transaction that is always
// rolled back, shows the negative assertion fails under the mutant, and then
// proves the installed definition still contains the control.
let p: PortalFixture;
let awaiting: PortalClient;
let owner: PortalClient;
let other: PortalClient;
let otherNotice: string;

beforeAll(async () => {
  p = await portalFixture();
  awaiting = await p.makeClient({ activate: false, label: 'kill awaiting' });
  owner = await p.makeClient({ activate: true, label: 'kill owner' });
  other = await p.makeClient({ activate: true, label: 'kill other' });
  const plan = await p.createDraft(awaiting.clientId, 'workout', 'F22 kill');
  await p.publish(plan, 1, 0);
  const [row] = await p.db`select app_private.f22_enqueue_client_notice(
    ${p.fixture.wsA.id}::uuid, ${other.clientId}::uuid, 'workout_delivered',
    ${randomUUID()}::uuid) as id`;
  otherNotice = row!.id as string;
});
afterAll(async () => p?.close());

const rollback = new Error('rollback F22 mutation');

/** Install a mutated definition, run `probe` as `userId`, always roll back. */
async function underMutant(
  signature: string,
  control: string,
  replacement: string,
  userId: string,
  probe: (tx: TransactionSql) => Promise<unknown>,
): Promise<unknown> {
  let observed: unknown = 'not-reached';
  try {
    await p.db.begin(async (tx) => {
      const [row] =
        await tx`select pg_get_functiondef(${signature}::regprocedure) as definition`;
      const definition = row!.definition as string;
      const mutated = definition.replace(control, replacement);
      expect(mutated, `${signature} control present`).not.toBe(definition);
      await tx.unsafe(mutated);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      observed = await probe(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return observed;
}

async function stillInstalled(signature: string, control: string) {
  const [row] =
    await p.db`select pg_get_functiondef(${signature}::regprocedure) as body`;
  expect(row!.body as string).toContain(control);
}

describe('F22 database control kill tests', () => {
  it('K1 portal entitlement gate: skipping the F13 active check leaks plans to an awaiting client', async () => {
    const signature = 'public.client_portal_overview()';
    const control = "if summary->>'status' is distinct from 'active' then";
    const observed = (await underMutant(
      signature,
      control,
      'if false then',
      awaiting.authUserId,
      async (tx) => {
        const [row] = await tx`select public.client_portal_overview() as value`;
        return row!.value;
      },
    )) as { status: string };
    // The real control returns `restricted` (client-portal-access.test.ts).
    expect(observed.status).toBe('ok');
    await stillInstalled(signature, control);
  });

  it('K2 directory workspace wall: dropping has_workspace_access lets a foreign trainer list clients', async () => {
    const signature =
      'public.staff_client_directory(uuid,text,text,text,integer,integer)';
    const control =
      "or not app_private.has_workspace_access(p_workspace_id, 'coaching_work')";
    const observed = (await underMutant(
      signature,
      control,
      'or false',
      p.fixture.trainerB.userId,
      async (tx) => {
        const [row] = await tx`select public.staff_client_directory(
          ${p.fixture.wsA.id}::uuid, ${p.run}, null, null, 100, 0) as value`;
        return row!.value;
      },
    )) as { status: string; clients: Array<{ client_id: string }> };
    // The real control raises 42501 (client-portal-isolation.test.ts).
    expect(observed.status).toBe('ok');
    expect(observed.clients.map((c) => c.client_id)).toContain(owner.clientId);
    await stillInstalled(signature, control);
  });

  it('K3 notice read scope: dropping the own-client filter shows another client’s notice', async () => {
    const signature =
      'public.read_client_notices(integer,timestamp with time zone)';
    const control = 'and n.client_id = client_row.client_id';
    const observed = (await underMutant(
      signature,
      control,
      '',
      owner.authUserId,
      async (tx) => {
        const [row] =
          await tx`select public.read_client_notices(100, null) as value`;
        return row!.value;
      },
    )) as { notices: Array<{ notice_id: string }> };
    expect(observed.notices.map((n) => n.notice_id)).toContain(otherNotice);
    await stillInstalled(signature, control);
  });

  it('K4 mark-read scope: dropping the own-client filter lets a client mark another client’s notice', async () => {
    const signature = 'public.mark_client_notice_read(uuid)';
    const control = 'and n.client_id = client_row.client_id';
    const observed = await underMutant(
      signature,
      control,
      '',
      owner.authUserId,
      async (tx) => {
        const [row] =
          await tx`select public.mark_client_notice_read(${otherNotice}::uuid) as value`;
        return row!.value;
      },
    );
    // The real control returns not_found (client-portal-notices.test.ts).
    expect(observed).toEqual({ status: 'read' });
    await stillInstalled(signature, control);
    const [after] =
      await p.db`select read_at from app_private.client_inbox_notices where id=${otherNotice}`;
    expect(after!.read_at).toBeNull();
  });
});
