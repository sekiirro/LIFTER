import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, sql } from './harness';
import { clientContext, type Context } from './registration-approval-fixture';
import { createRecoveryClientTarget } from './client-accounts-fixture';

const db = sql();
let f: Context;
let clientActor: Awaited<ReturnType<typeof createRecoveryClientTarget>>;

beforeAll(async () => {
  f = await clientContext();
  clientActor = await createRecoveryClientTarget(f);
});

afterAll(async () => {
  await db.end();
});

const aggregate = (client: Context['po']['client'], workspaceId: string | null) =>
  client.rpc('po_reporting_aggregate', {
    p_workspace_id: workspaceId,
    p_month_start: null,
    p_package_id: null,
  });

const sourceRows = (
  client: Context['po']['client'],
  workspaceId: string,
  packageId: string | null = null,
) =>
  client.rpc('po_reporting_source_rows', {
    p_workspace_id: workspaceId,
    p_month_start: null,
    p_package_id: packageId,
    p_page_size: 50,
    p_cursor_recorded_at: null,
    p_cursor_event_id: null,
  });

it('T001 denies platform aggregates to every non-PO role without count disclosure', async () => {
  for (const actor of [
    f.actors.woA,
    f.actors.trainerA,
    f.actors.salesA,
    clientActor,
    f.actors.anon,
  ]) {
    const result = await aggregate(actor.client, null);
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  }
});

it('T002 denies direct source-row probes to non-PO actors for own, foreign, and unknown workspaces', async () => {
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';
  for (const actor of [
    f.actors.woA,
    f.actors.trainerA,
    f.actors.salesA,
    clientActor,
    f.actors.anon,
  ]) {
    for (const workspaceId of [f.wsA.id, f.wsB.id, unknownWorkspace]) {
      const result = await sourceRows(actor.client, workspaceId);
      expect(result.error?.code).toBe('42501');
      expect(result.data).toBeNull();
    }
  }
});

it('T003 makes platform, workspace, month, package, and source-row reads available only to PO', async () => {
  const platform = await aggregate(f.po.client, null);
  expect(platform.error).toBeNull();
  expect(platform.data).toMatchObject({ status: 'ok', currency_totals: [], workspaces: [] });

  const workspace = await aggregate(f.po.client, f.wsA.id);
  expect(workspace.error).toBeNull();
  expect(workspace.data).toMatchObject({ status: 'ok', workspace_id: f.wsA.id });
  expect(workspace.data.months).toEqual([]);
  expect(workspace.data.packages).toEqual([]);

  const rows = await sourceRows(f.po.client, f.wsA.id);
  expect(rows.error).toBeNull();
  expect(rows.data).toMatchObject({ status: 'ok', rows: [], next_cursor: null });
});

it('T004 returns the same safe denial for foreign and unknown workspace identifiers', async () => {
  const unknownWorkspace = '00000000-0000-0000-0000-000000000001';
  for (const workspaceId of [f.wsB.id, unknownWorkspace]) {
    const result = await sourceRows(f.actors.woA.client, workspaceId);
    expect(result.error?.code).toBe('42501');
    expect(result.data).toBeNull();
  }
});

it('T005 keeps RPC execution unavailable to anon and service-role clients', async () => {
  const anon = await aggregate(f.actors.anon.client, null);
  expect(anon.error?.code).toBe('42501');

  const privileged = await admin().rpc('po_reporting_aggregate', {
    p_workspace_id: null,
    p_month_start: null,
    p_package_id: null,
  });
  expect(privileged.error?.code).toBe('42501');
});
