import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graph, clientContext, sql } from './registration-approval-fixture';

let db: ReturnType<typeof sql>;
beforeAll(() => {
  db = sql();
});
afterAll(async () => db?.end());

describe('F11 T061 unassigned-client visibility', () => {
  it('lets the PO and Workspace Owner read approved unassigned clients only in their workspace', async () => {
    const context = await clientContext();
    const { client } = await db.begin((tx) => graph(tx, context));
    const [po, owner, trainer] = await Promise.all([
      context.po.client.rpc('unassigned_clients', {
        p_workspace_id: context.wsA.id,
      }),
      context.woA.client.rpc('unassigned_clients', {
        p_workspace_id: context.wsA.id,
      }),
      context.trainerA.client.rpc('unassigned_clients', {
        p_workspace_id: context.wsA.id,
      }),
    ]);
    expect(po.data).toMatchObject({ status: 'ok', client_ids: [client] });
    expect(owner.data).toMatchObject({ status: 'ok', client_ids: [client] });
    expect(trainer.data).toMatchObject({ status: 'not_permitted' });
    const rows = await context.woA.client
      .from('client_trainer_assignments')
      .select('id')
      .eq('workspace_id', context.wsA.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
    const write = await context.woA.client
      .from('client_trainer_assignments')
      .insert({ workspace_id: context.wsA.id, client_id: client });
    expect(write.error).not.toBeNull();
    const foreign = await context.woA.client.rpc('unassigned_clients', {
      p_workspace_id: context.wsB.id,
    });
    expect(foreign.data).toMatchObject({ status: 'not_permitted' });
  });
});
