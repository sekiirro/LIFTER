import { afterAll, beforeEach, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeEach(async () => {
  fixture = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
});

it('returns only the current published identity to an active workspace member', async () => {
  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: {
      name: { ar: 'مركز', en: 'Center' },
      bannerAlt: { ar: '', en: '' },
      color: '#2563EB',
    },
  });
  expect(saved.error).toBeNull();
  const published = await fixture.woA.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(published.error).toBeNull();

  const visibleToSales = await fixture.salesA.client.rpc(
    'branding_current_read',
    {
      workspace_id: fixture.wsA.id,
    },
  );
  expect(visibleToSales.error).toBeNull();
  expect(visibleToSales.data).toEqual({
    name: { ar: 'مركز', en: 'Center' },
    color: '#2563EB',
  });
  const foreign = await fixture.salesA.client.rpc('branding_current_read', {
    workspace_id: fixture.wsB.id,
  });
  expect(foreign.error).not.toBeNull();
});

it('denies current brand after membership revocation', async () => {
  const revoked = await fixture.po.client
    .from('workspace_memberships')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: fixture.po.userId,
    })
    .eq('user_id', fixture.salesA.userId)
    .eq('workspace_id', fixture.wsA.id);
  expect(revoked.error).toBeNull();
  const result = await fixture.salesA.client.rpc('branding_current_read', {
    workspace_id: fixture.wsA.id,
  });
  expect(result.error).not.toBeNull();
});
