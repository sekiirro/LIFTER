import { afterAll, beforeEach, expect, it } from 'vitest';
import { validateBrandingImage } from '../../lib/branding/image-validation';
import { brandingValidatedObjectName } from '../../lib/branding/object-path';
import { admin } from './harness';
import { createPublishedBannerFixture } from './branding-banner-fixture';
import { credential } from './branding-security-fixture';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

beforeEach(async () => {
  fixture = await twoWorkspaceFixture();
});
afterAll(async () => {
  await db.end();
});

it('denies foreign workspace, missing capability, and stale upload begin', async () => {
  const foreign = await fixture.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsB.id,
    role: 'logo',
    expected_revision: 0,
  });
  const unauthorized = await fixture.salesA.client.rpc(
    'branding_upload_begin',
    {
      workspace_id: fixture.wsA.id,
      role: 'logo',
      expected_revision: 0,
    },
  );
  expect(foreign.error).not.toBeNull();
  expect(unauthorized.error).not.toBeNull();
  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: {
      name: { ar: 'اسم', en: 'Name' },
      bannerAlt: { ar: '', en: '' },
      color: '#2563EB',
    },
  });
  expect(saved.error).toBeNull();
  const stale = await fixture.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'logo',
    expected_revision: 0,
  });
  expect(stale.error?.code).toBe('40001');
});

it('revision-checks audited detach and keeps the published asset authoritative', async () => {
  const workspace = fixture.wsA.id;
  const saved = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: workspace,
    expected_revision: 0,
    fields: {
      name: { ar: 'اسم', en: 'Name' },
      bannerAlt: { ar: 'لافتة', en: 'Banner' },
      color: '#2563EB',
    },
  });
  expect(saved.error).toBeNull();
  const [before] = await db<{ id: string; sequence: number }[]>`
    select v.id,v.sequence from app_private.branding_current_publications c
    join app_private.branding_published_versions v on v.workspace_id=c.workspace_id and v.id=c.version_id
    where c.workspace_id=${workspace}`;
  const removed = await fixture.woA.client.rpc('branding_asset_detach', {
    workspace_id: workspace,
    asset_role: 'logo',
    expected_revision: 1,
  });
  expect(removed.error).toBeNull();
  expect(removed.data).toBe(2);
  const audit = await db<
    {
      action: string;
      details: { asset_role: string; revision: number };
    }[]
  >`
    select action,details from public.audit_events
    where workspace_id=${workspace} and action='branding.asset_detached'
  `;
  expect(audit).toEqual([
    {
      action: 'branding.asset_detached',
      details: { asset_role: 'logo', revision: 2 },
    },
  ]);
  const draft = await fixture.woA.client.rpc('branding_draft_read', {
    workspace_id: workspace,
  });
  expect(draft.error).toBeNull();
  expect(draft.data?.fields?.logo).toBeNull();
  const [after] = await db<{ id: string; sequence: number }[]>`
    select v.id,v.sequence from app_private.branding_current_publications c
    join app_private.branding_published_versions v on v.workspace_id=c.workspace_id and v.id=c.version_id
    where c.workspace_id=${workspace}`;
  expect(after).toEqual(before);
  const stale = await fixture.woA.client.rpc('branding_asset_detach', {
    workspace_id: workspace,
    asset_role: 'banner',
    expected_revision: 1,
  });
  expect(stale.error?.code).toBe('40001');
});

it('restores draft image metadata for the authenticated thumbnail endpoint', async () => {
  const [definition] = await db<{ def: string }[]>`
    select pg_get_functiondef('app_private.branding_draft_read(uuid)'::regprocedure) as def`;
  expect(definition!.def).toContain("'logo',draft_row.fields->'logo'");
  expect(definition!.def).toContain("'banner',draft_row.fields->'banner'");
  const [policy] = await db<{ qual: string }[]>`
    select pg_get_expr(polqual,polrelid) as qual from pg_policy where polname='branding_owner_draft_asset_read'`;
  expect(policy!.qual).toContain('branding_draft_asset_read_allowed');
  const denied = await fixture.salesA.client
    .from('storage.objects')
    .select('name')
    .eq('bucket_id', 'branding-validated')
    .limit(1);
  expect(denied.error).not.toBeNull();
});

it('allows preview reads only for assets referenced by the caller workspace draft', async () => {
  const attachedPath = `${fixture.wsA.id}/validated/logo/${'a'.repeat(64)}-${crypto.randomUUID()}.png`;
  const unattachedPath = `${fixture.wsA.id}/validated/logo/${'b'.repeat(64)}-${crypto.randomUUID()}.png`;
  const previewBytes = Buffer.from('private draft preview');
  const paths = [attachedPath, unattachedPath];
  try {
    for (const path of paths) {
      const uploaded = await admin()
        .storage.from('branding-validated')
        .upload(path, previewBytes, {
          contentType: 'image/png',
          upsert: false,
        });
      expect(uploaded.error).toBeNull();
    }
    await db`insert into app_private.branding_drafts(workspace_id,revision,fields)
      values(${fixture.wsA.id},1,jsonb_build_object('logo',jsonb_build_object(
        'bucket','branding-validated','object',${attachedPath}::text,'content_type','image/png','byte_size',${previewBytes.byteLength}::int
      )))`;

    const ownerRead = await fixture.woA.client.storage
      .from('branding-validated')
      .download(attachedPath);
    expect(ownerRead.error).toBeNull();
    const foreignRead = await fixture.trainerB.client.storage
      .from('branding-validated')
      .download(attachedPath);
    expect(foreignRead.error).not.toBeNull();
    const unauthorizedRead = await fixture.salesA.client.storage
      .from('branding-validated')
      .download(attachedPath);
    expect(unauthorizedRead.error).not.toBeNull();
    const unattachedRead = await fixture.woA.client.storage
      .from('branding-validated')
      .download(unattachedPath);
    expect(unattachedRead.error).not.toBeNull();
  } finally {
    await admin().storage.from('branding-validated').remove(paths);
  }
});

it('runs a real begin to staging to validation to attach to draft-read cycle', async () => {
  const uploaded = await createPublishedBannerFixture();
  try {
    const draft = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    expect(draft.error).toBeNull();
    expect(draft.data?.fields?.banner).toMatchObject({
      bucket: 'branding-validated',
      object: uploaded.validatedPath,
      content_type: 'image/png',
      byte_size: uploaded.processed.bytes.byteLength,
    });
    const thumbnail = await uploaded.woA.client.storage
      .from('branding-validated')
      .download(uploaded.validatedPath);
    expect(thumbnail.error).toBeNull();
    expect(thumbnail.data?.size).toBe(uploaded.processed.bytes.byteLength);
    const staleRemove = await uploaded.woA.client.rpc('branding_asset_detach', {
      workspace_id: uploaded.wsA.id,
      asset_role: 'banner',
      expected_revision: draft.data!.revision - 1,
    });
    expect(staleRemove.error?.code).toBe('40001');
    const preserved = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    expect(preserved.data?.fields?.banner?.object).toBe(uploaded.validatedPath);
    const removed = await uploaded.woA.client.rpc('branding_asset_detach', {
      workspace_id: uploaded.wsA.id,
      asset_role: 'banner',
      expected_revision: draft.data!.revision,
    });
    expect(removed.error).toBeNull();
    const detached = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    expect(detached.data?.fields?.banner).toBeNull();
    expect(detached.data?.current_publication?.fields?.bannerAlt?.en).toBe(
      'Blue banner',
    );
  } finally {
    await uploaded.cleanup();
  }
});

it('keeps publish blocked when banner alt text is empty in both locales', async () => {
  const uploaded = await createPublishedBannerFixture();
  try {
    const saved = await uploaded.woA.client.rpc('branding_draft_save', {
      workspace_id: uploaded.wsA.id,
      expected_revision: 2,
      fields: {
        name: { ar: 'مركز النخبة', en: 'Elite Center' },
        bannerAlt: { ar: '', en: '' },
        color: '#2563EB',
      },
    });
    expect(saved.error).toBeNull();
    const publication = await uploaded.woA.client.rpc('branding_publish', {
      workspace_id: uploaded.wsA.id,
      expected_revision: 3,
    });
    expect(publication.error?.code).toBe('22023');
  } finally {
    await uploaded.cleanup();
  }
});

it('preserves the attached draft image and publication when replacement validation fails', async () => {
  const uploaded = await createPublishedBannerFixture();
  const stagingObjects: string[] = [];
  try {
    const initial = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    const begin = await uploaded.woA.client.rpc('branding_upload_begin', {
      workspace_id: uploaded.wsA.id,
      role: 'banner',
      expected_revision: initial.data!.revision,
    });
    expect(begin.error).toBeNull();
    const stagingPath = `${uploaded.wsA.id}/staging/${begin.data}`;
    stagingObjects.push(stagingPath);
    const staged = await uploaded.woA.client.storage
      .from('branding-staging')
      .upload(stagingPath, Buffer.from('not an image'), {
        contentType: 'image/png',
        upsert: false,
      });
    expect(staged.error).toBeNull();
    expect(() =>
      validateBrandingImage(Buffer.from('not an image'), { role: 'banner' }),
    ).toThrow();
    const after = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    expect(after.data?.fields?.banner?.object).toBe(uploaded.validatedPath);
    expect(after.data?.revision).toBe(initial.data?.revision);
    const [current] = await db<{ version_id: string }[]>`
      select version_id from app_private.branding_current_publications
      where workspace_id=${uploaded.wsA.id}`;
    expect(current).toBeDefined();
  } finally {
    if (stagingObjects.length)
      await admin().storage.from('branding-staging').remove(stagingObjects);
    await uploaded.cleanup();
  }
});

it('preserves the attached image when a validated replacement loses the revision race', async () => {
  const uploaded = await createPublishedBannerFixture();
  const cleanup = { staging: '', validated: '' };
  try {
    const begin = await uploaded.woA.client.rpc('branding_upload_begin', {
      workspace_id: uploaded.wsA.id,
      role: 'banner',
      expected_revision: 2,
    });
    expect(begin.error).toBeNull();
    const uploadId = begin.data as string;
    cleanup.staging = `${uploaded.wsA.id}/staging/${uploadId}`;
    const bytes = uploaded.processed.bytes;
    const staged = await uploaded.woA.client.storage
      .from('branding-staging')
      .upload(cleanup.staging, bytes, {
        contentType: 'image/png',
        upsert: false,
      });
    expect(staged.error).toBeNull();

    const processed = validateBrandingImage(bytes, { role: 'banner' });
    cleanup.validated = brandingValidatedObjectName(
      uploaded.wsA.id,
      'banner',
      processed.contentHash,
      uploadId,
      processed.mediaType,
    );
    const validator = await credential(db, 'branding_validator');
    await db.begin(async (tx) => {
      await tx`set local role branding_validator`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(validator.claims)}, true)`;
      await tx`select app_private.branding_validation_prepare(${uploadId})`;
    });
    const promoted = await validator.client.storage
      .from('branding-validated')
      .upload(cleanup.validated, processed.bytes, {
        contentType: processed.mediaType,
        upsert: false,
      });
    expect(promoted.error).toBeNull();
    await db.begin(async (tx) => {
      await tx`set local role branding_validator`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(validator.claims)}, true)`;
      await tx`select app_private.branding_validation_complete(
        ${uploadId}, ${cleanup.staging}, 'branding-validated', ${cleanup.validated},
        ${processed.contentHash}, ${processed.bytes.byteLength}, ${processed.mediaType})`;
    });

    const racedSave = await uploaded.woA.client.rpc('branding_draft_save', {
      workspace_id: uploaded.wsA.id,
      expected_revision: 2,
      fields: {
        name: { ar: 'Ù…Ø±ÙƒØ² Ø§Ù„Ù†Ø®Ø¨Ø©', en: 'Elite Center' },
        bannerAlt: { ar: 'Ù„Ø§ÙØªØ© Ø²Ø±Ù‚Ø§Ø¡', en: 'Blue banner' },
        color: '#2563EB',
      },
    });
    expect(racedSave.error).toBeNull();
    const attach = await uploaded.woA.client.rpc('branding_asset_attach', {
      upload_id: uploadId,
      expected_revision: 2,
    });
    expect(attach.error?.code).toBe('40001');
    const after = await uploaded.woA.client.rpc('branding_draft_read', {
      workspace_id: uploaded.wsA.id,
    });
    expect(after.data?.revision).toBe(3);
    expect(after.data?.fields?.banner?.object).toBe(uploaded.validatedPath);
  } finally {
    if (cleanup.staging)
      await admin().storage.from('branding-staging').remove([cleanup.staging]);
    if (cleanup.validated)
      await admin()
        .storage.from('branding-validated')
        .remove([cleanup.validated]);
    await uploaded.cleanup();
  }
});
