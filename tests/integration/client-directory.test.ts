import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  portalFixture,
  type PortalClient,
  type PortalFixture,
} from './client-portal-fixture';

// F22 T031 (FR-011; SC-008): search, filters and indicator. Synthetic data only.
let p: PortalFixture;
let active: PortalClient;
let awaiting: PortalClient;

type Row = {
  client_id: string;
  name: string;
  approval_state: string;
  subscription_status: string | null;
  plans_waiting_for_delivery: number;
};

async function directory(
  client: SupabaseClient,
  args: Record<string, unknown>,
): Promise<{ status: string; clients?: Row[]; has_more?: boolean }> {
  const result = await client.rpc('staff_client_directory', {
    p_workspace_id: p.fixture.wsA.id,
    p_search: null,
    p_approval_state: null,
    p_subscription_status: null,
    p_limit: 50,
    p_offset: 0,
    ...args,
  });
  expect(result.error).toBeNull();
  return result.data as { status: string; clients?: Row[] };
}

const ids = (rows: Row[] | undefined) => (rows ?? []).map((r) => r.client_id);

beforeAll(async () => {
  p = await portalFixture();
  active = await p.makeClient({ activate: true, label: 'Directory active' });
  awaiting = await p.makeClient({
    activate: false,
    label: 'Directory waiting',
  });
});
afterAll(async () => p?.close());

describe('F22 staff directory search (T031)', () => {
  it('searches by client name', async () => {
    const result = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
    });
    expect(result.status).toBe('ok');
    expect(ids(result.clients).sort()).toEqual(
      [active.clientId, awaiting.clientId].sort(),
    );
    expect(
      result.clients!.find((r) => r.client_id === active.clientId),
    ).toEqual({
      client_id: active.clientId,
      name: active.name,
      approval_state: 'approved',
      subscription_status: 'active',
      plans_waiting_for_delivery: 0,
    });
  });

  it('searches by email and by phone without returning contact fields', async () => {
    const byEmail = await directory(p.fixture.trainerA.client, {
      p_search: active.email.toUpperCase(),
    });
    expect(ids(byEmail.clients)).toEqual([active.clientId]);
    const byPhone = await directory(p.fixture.trainerA.client, {
      p_search: active.phone.slice(3),
    });
    expect(ids(byPhone.clients)).toContain(active.clientId);
    expect(JSON.stringify(byPhone)).not.toContain(active.phone);
    expect(JSON.stringify(byEmail)).not.toContain(active.email);
  });

  it('treats LIKE metacharacters in the search as literal text', async () => {
    const result = await directory(p.fixture.trainerA.client, {
      p_search: `${p.run}%`,
    });
    expect(result.clients).toEqual([]);
  });
});

describe('F22 staff directory filters (T031)', () => {
  it('filters by the existing F11 approval state', async () => {
    const approved = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_approval_state: 'approved',
    });
    expect(ids(approved.clients)).toHaveLength(2);
    const rejected = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_approval_state: 'rejected',
    });
    expect(rejected.clients).toEqual([]);
  });

  it('filters by the F13 projected subscription status', async () => {
    const activeOnly = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_subscription_status: 'active',
    });
    expect(ids(activeOnly.clients)).toEqual([active.clientId]);
    const waiting = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_subscription_status: 'awaiting_activation',
    });
    expect(ids(waiting.clients)).toEqual([awaiting.clientId]);
  });

  it('rejects statuses that do not exist in F11/F13', async () => {
    for (const args of [
      { p_approval_state: 'deleted' },
      { p_subscription_status: 'overdue' },
      { p_limit: 101 },
      { p_offset: -1 },
      { p_search: 'x'.repeat(101) },
    ])
      expect(
        await directory(p.fixture.trainerA.client, args),
        JSON.stringify(args),
      ).toEqual({ status: 'invalid_input' });
  });

  it('paginates with a bounded page size', async () => {
    const first = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_limit: 1,
    });
    const second = await directory(p.fixture.trainerA.client, {
      p_search: p.run,
      p_limit: 1,
      p_offset: 1,
    });
    expect(first.has_more).toBe(true);
    expect(second.has_more).toBe(false);
    expect([...ids(first.clients), ...ids(second.clients)].sort()).toEqual(
      [active.clientId, awaiting.clientId].sort(),
    );
  });
});

describe('F22 plans-waiting-for-delivery indicator (T031)', () => {
  it('counts F19 draft-only plans and clears after Ready & Publish', async () => {
    const planId = await p.createDraft(
      active.clientId,
      'workout',
      'F22 waiting',
    );
    const waiting = await directory(p.fixture.trainerA.client, {
      p_search: active.email,
    });
    expect(waiting.clients![0]!.plans_waiting_for_delivery).toBe(1);
    await p.publish(planId, 1, 0);
    const delivered = await directory(p.fixture.trainerA.client, {
      p_search: active.email,
    });
    expect(delivered.clients![0]!.plans_waiting_for_delivery).toBe(0);
  });
});
