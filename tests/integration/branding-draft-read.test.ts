import { afterAll, beforeEach, expect, it } from 'vitest';
import { admin, sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeEach(async () => {
  fixture = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
});

it('reads only the caller’s active authorized workspace draft and current publication', async () => {
  const crossMembership = await admin().from('workspace_memberships').insert({
    workspace_id: fixture.wsB.id,
    user_id: fixture.woA.userId,
    granted_by: fixture.po.userId,
  });
  expect(crossMembership.error).toBeNull();
  const foreignDraft = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsB.id,
    expected_revision: 0,
    fields: {
      name: { ar: 'مسودة أجنبية', en: 'Foreign Draft' },
      bannerAlt: { ar: 'وصف أجنبي', en: 'Foreign Alt' },
      color: '#FF00FF',
    },
  });
  expect(foreignDraft.error).toBeNull();
  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: {
      name: { ar: 'مسودة', en: 'Draft A' },
      bannerAlt: { ar: 'وصف', en: 'Banner A' },
      color: '#2563EB',
    },
  });
  expect(saved.error).toBeNull();
  const result = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsA.id,
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    workspace_id: fixture.wsA.id,
    revision: 1,
    fields: {
      name: { ar: 'مسودة', en: 'Draft A' },
      bannerAlt: { ar: 'وصف', en: 'Banner A' },
      color: '#2563EB',
    },
    current_publication: null,
  });
});

it('denies a foreign workspace and a caller without manage_branding', async () => {
  const foreign = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsB.id,
  });
  const unauthorized = await fixture.salesA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsA.id,
  });
  expect(foreign.error).not.toBeNull();
  expect(unauthorized.error).not.toBeNull();
});

it('denies a workspace after the caller membership is revoked', async () => {
  const revoked = await fixture.po.client
    .from('workspace_memberships')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: fixture.po.userId,
    })
    .eq('user_id', fixture.woA.userId)
    .eq('workspace_id', fixture.wsA.id);
  expect(revoked.error).toBeNull();
  const result = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsA.id,
  });
  expect(result.error).not.toBeNull();
});
