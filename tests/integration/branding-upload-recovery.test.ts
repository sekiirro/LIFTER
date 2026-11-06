import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, loadEnv, sql, twoWorkspaceFixture } from './harness';
import {
  createBrandingGc,
  runBrandingGc,
} from '../../workers/cron/src/branding-gc';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
const mutateStagingVisibility =
  process.env.BRANDING_GC_STAGING_VISIBILITY_MUTATION === 'validated_only';
const cleanupObjects: { bucket: string; path: string }[] = [];

beforeAll(async () => {
  fixture = await twoWorkspaceFixture();
  if (mutateStagingVisibility) {
    await db`drop policy branding_gc_definer_read on storage.objects`;
    await db`create policy branding_gc_definer_read on storage.objects
      for select to branding_definer using(bucket_id='branding-validated')`;
  }
});

afterAll(async () => {
  for (const object of cleanupObjects)
    await admin().storage.from(object.bucket).remove([object.path]);
  if (mutateStagingVisibility) {
    await db`drop policy branding_gc_definer_read on storage.objects`;
    await db`create policy branding_gc_definer_read on storage.objects
      for select to branding_definer
      using(bucket_id in ('branding-staging','branding-validated'))`;
    console.log('F14 GC staging visibility mutation restored');
  }
  await db.end();
});

it('does not leave an attachment-failure status update before its rolled-back stale exception', async () => {
  const [functionRow] = await db<{ body: string }[]>`
    select pg_get_functiondef(
      'app_private.branding_asset_attach(uuid,bigint)'::regprocedure
    ) as body
  `;
  expect(functionRow?.body).toMatch(/stale_branding_upload/);
  expect(functionRow?.body).not.toMatch(
    /set status\s*=\s*'attachment_failed_stale'[\s\S]*?stale_branding_upload/,
  );
});

it('keeps attached uploads in both GC candidate and finalize paths', async () => {
  const [claim] = await db<{ body: string }[]>`
    select pg_get_functiondef(
      'app_private.branding_gc_claim(integer)'::regprocedure
    ) as body
  `;
  const [finalize] = await db<{ body: string }[]>`
    select pg_get_functiondef(
      'app_private.branding_gc_finalize(uuid)'::regprocedure
    ) as body
  `;
  expect(claim?.body).toMatch(/status in \([^)]*'attached'[^)]*\)/);
  expect(finalize?.body).toMatch(/status in \([^)]*'attached'[^)]*\)/);
  expect(finalize?.body).toMatch(/set status='cleaned'/);
});

it('collects stale staging and validated bytes through bounded GC leases', async () => {
  const uploadId = crypto.randomUUID();
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  const validatedObject = `${fixture.wsA.id}/validated/logo/${'b'.repeat(64)}.png`;
  cleanupObjects.push(
    { bucket: 'branding-staging', path: stagingObject },
    { bucket: 'branding-validated', path: validatedObject },
  );
  await db`insert into app_private.branding_uploads(
    id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,
    validated_bucket,validated_object,validated_sha256,validated_size,validator_credential_hash,updated_at
  ) values (
    ${uploadId},${fixture.wsA.id},'logo',0,'branding-staging',${stagingObject},
    'attachment_failed_stale','branding-validated',${validatedObject},${'b'.repeat(64)},64,${'c'.repeat(64)},
    to_timestamp(946684800)
  )`;
  for (const [bucket, objectName, bytes] of [
    [
      'branding-staging',
      stagingObject,
      Buffer.from('interrupted staging bytes'),
    ],
    [
      'branding-validated',
      validatedObject,
      Buffer.from('orphan validated bytes'),
    ],
  ] as const) {
    const uploaded = await admin()
      .storage.from(bucket)
      .upload(objectName, bytes, {
        contentType: 'image/png',
      });
    expect(uploaded.error).toBeNull();
  }

  const config = loadEnv();
  const env = {
    SUPABASE_URL: config.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
  };
  const batches: number[] = [];
  const gcDeadline = Date.now() + 60_000;
  let uploadStatus: string | undefined;
  while (Date.now() < gcDeadline) {
    const processed = await runBrandingGc(createBrandingGc(env), 1);
    batches.push(processed);
    const [upload] = await db<{ status: string }[]>`
      select status from app_private.branding_uploads where id=${uploadId}
    `;
    uploadStatus = upload?.status;
    if (uploadStatus === 'cleaned' || processed === 0) break;
  }
  expect(
    uploadStatus,
    `fixture upload was not cleaned within 60000ms (${batches.length} one-row GC batches; last status=${uploadStatus ?? 'missing'})`,
  ).toBe('cleaned');
  expect(batches.every((batch) => batch >= 0 && batch <= 1)).toBe(true);

  const [row] = await db<
    {
      status: string;
      validated_object: string | null;
    }[]
  >`select status,validated_object from app_private.branding_uploads where id=${uploadId}`;
  expect(row).toEqual({ status: 'cleaned', validated_object: null });
  for (const [bucket, objectName] of [
    ['branding-staging', stagingObject],
    ['branding-validated', validatedObject],
  ] as const) {
    const absent = await admin().storage.from(bucket).download(objectName);
    expect(
      absent.error,
      `${bucket}/${objectName} remains readable`,
    ).toBeTruthy();
  }
});

it('keeps validated bytes referenced by a draft out of stale-upload cleanup', async () => {
  const uploadId = crypto.randomUUID();
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  const validatedObject = `${fixture.wsA.id}/validated/logo/${'d'.repeat(64)}.png`;
  cleanupObjects.push({ bucket: 'branding-validated', path: validatedObject });
  await db`insert into app_private.branding_uploads(
    id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,
    validated_bucket,validated_object,validated_sha256,validated_size,validator_credential_hash,updated_at
  ) values (
    ${uploadId},${fixture.wsA.id},'logo',0,'branding-staging',${stagingObject},
    'attachment_failed_stale','branding-validated',${validatedObject},${'d'.repeat(64)},64,${'e'.repeat(64)},
    to_timestamp(946684800)
  )`;
  await db`insert into app_private.branding_drafts(workspace_id,fields)
    values(${fixture.wsA.id},'{}'::jsonb) on conflict do nothing`;
  await db`update app_private.branding_drafts set fields=jsonb_build_object(
    'logo',jsonb_build_object('bucket','branding-validated','object',${validatedObject}::text)
  ) where workspace_id=${fixture.wsA.id}`;
  const [draft] = await db<{ logo: unknown }[]>`
    select fields->'logo' as logo from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(draft?.logo).toEqual({
    bucket: 'branding-validated',
    object: validatedObject,
  });
  const uploaded = await admin()
    .storage.from('branding-validated')
    .upload(validatedObject, Buffer.from('draft referenced bytes'), {
      contentType: 'image/png',
    });
  expect(uploaded.error).toBeNull();

  const config = loadEnv();
  const env = {
    SUPABASE_URL: config.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
  };
  await runBrandingGc(createBrandingGc(env), 50);
  const claimId = crypto.randomUUID();
  await expect(
    db.begin(async (tx) => {
      await tx`insert into app_private.branding_gc_claims(
        id,workspace_id,bucket_id,object_name,lease_until
      ) values(
        ${claimId},${fixture.wsA.id},'branding-validated',${validatedObject},
        statement_timestamp()+interval '5 minutes'
      )`;
      await tx`select app_private.branding_gc_finalize(${claimId}::uuid)`;
    }),
  ).rejects.toThrow(/branding_asset_referenced/);

  const [row] = await db<
    { status: string; validated_object: string | null }[]
  >`select status,validated_object from app_private.branding_uploads where id=${uploadId}`;
  expect(row).toEqual({
    status: 'attachment_failed_stale',
    validated_object: validatedObject,
  });
  const retained = await admin()
    .storage.from('branding-validated')
    .download(validatedObject);
  expect(retained.error).toBeNull();
});
