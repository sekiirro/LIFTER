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

// Mutation: revert supabase/migrations/20261102150000 function body to the
// 20261102137000/138000 capability+membership guard (or replace the
// has_workspace_access call with `false`) and this test must fail.
it('authorizes draft reads through has_workspace_access, allowing a membership-less platform owner', async () => {
  const [definition] =
    await db`select pg_get_functiondef('app_private.branding_draft_read(uuid)'::regprocedure) as def`;
  expect(definition!.def).toMatch(
    /app_private\.has_workspace_access\s*\(\s*branding_draft_read\.workspace_id/,
  );
  expect(definition!.def).not.toContain('from public.workspace_memberships');

  await db`delete from public.workspace_memberships
    where workspace_id=${fixture.wsB.id} and user_id=${fixture.po.userId}`;
  const ownerRead = await fixture.po.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsB.id,
  });
  expect(ownerRead.error).toBeNull();
  expect(ownerRead.data?.workspace_id).toBe(fixture.wsB.id);
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

it('reads an empty draft as revision zero without creating a draft row', async () => {
  const before = await db<{ count: number }[]>`
    select count(*)::int as count from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(before[0]?.count).toBe(0);

  const result = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsA.id,
  });

  expect(result.error).toBeNull();
  expect(result.data).toEqual({
    workspace_id: fixture.wsA.id,
    revision: 0,
    fields: { name: null, bannerAlt: null, color: null },
    current_publication: null,
  });
  const after = await db<{ count: number }[]>`
    select count(*)::int as count from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(after[0]?.count).toBe(0);
});

it('allows the first save after an empty read using the returned revision', async () => {
  const read = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: fixture.wsA.id,
  });
  expect(read.error).toBeNull();

  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: read.data?.revision,
    fields: {
      name: { ar: '', en: 'First save' },
      bannerAlt: { ar: '', en: '' },
      color: '#2563EB',
      logo: null,
      banner: null,
    },
  });

  expect(saved.error).toBeNull();
  expect(saved.data).toBe(1);
});
