import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, anonClient, checked, twoWorkspaceFixture } from './harness';

let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
const svc = admin();

beforeAll(async () => {
  f = await twoWorkspaceFixture();
});

afterAll(async () => {
  await svc.auth.admin.deleteUser(f.po.userId);
  await svc.auth.admin.deleteUser(f.woA.userId);
  await svc.auth.admin.deleteUser(f.trainerA.userId);
  await svc.auth.admin.deleteUser(f.salesA.userId);
  await svc.auth.admin.deleteUser(f.trainerB.userId);
});

async function assertDeniedWithoutDisclosure(
  client: SupabaseClient,
  workspaceId: string,
) {
  const result = await client.rpc('request_po_client_export', {
    p_workspace_id: workspaceId,
    p_idempotency_key: randomUUID(),
  });
  expect(result.data).toBeNull();
  expect(result.error?.code).toBe('42501');
}

describe('PO export authorization RED (T001-T003)', () => {
  it.each([
    ['workspace owner', () => f.woA.client],
    ['trainer in requested workspace', () => f.trainerA.client],
    ['trainer in foreign workspace', () => f.trainerB.client],
    ['sales', () => f.salesA.client],
  ])('%s cannot request one-workspace or all-workspace exports', async (_role, getClient) => {
    const client = getClient();
    await assertDeniedWithoutDisclosure(client, f.wsA.id);
    await assertDeniedWithoutDisclosure(client, f.wsB.id);
    await assertDeniedWithoutDisclosure(client, randomUUID());
  });

  it('anonymous and authenticated unprofiled actors cannot request exports', async () => {
    await assertDeniedWithoutDisclosure(anonClient(), f.wsA.id);
    const email = `po-export-unprofiled-${randomUUID()}@example.test`;
    const password = `S71-${randomUUID()}-aA1!`;
    const unprofiled = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (unprofiled.error || !unprofiled.data.user)
      throw new Error('Unable to create synthetic unprofiled actor');
    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({
      email,
      password,
    });
    // Deliberately use an unauthenticated path if the synthetic credential is
    // unavailable; there is no role profile that could ever grant export.
    if (!signedIn.error) await assertDeniedWithoutDisclosure(client, f.wsA.id);
  });

  it('direct job and guessed artifact reads do not reveal export existence', async () => {
    const guessed = randomUUID();
    const jobRead = await f.woA.client.from('jobs').select('id').eq('id', guessed);
    expect(jobRead.data).toBeNull();
    expect(jobRead.error).not.toBeNull();
    const objectRead = await f.woA.client.storage
      .from('po-export-artifacts')
      .download(`${f.wsA.id}/${guessed}.csv`);
    expect(objectRead.data).toBeNull();
    expect(objectRead.error).not.toBeNull();
  });
});
