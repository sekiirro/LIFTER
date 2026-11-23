import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, sql, twoWorkspaceFixture } from './harness';
import { withCrashSafeFunctionMutant } from './function-drift-guard';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
const cleanupObjects: { bucket: string; path: string }[] = [];

beforeAll(async () => {
  fixture = await twoWorkspaceFixture();
});

afterAll(async () => {
  for (const object of cleanupObjects)
    await admin().storage.from(object.bucket).remove([object.path]);
  await db.end();
});

async function stagedUploadRow(
  workspaceId: string,
  startedBy: string,
  withBytes: boolean,
) {
  const uploadId = crypto.randomUUID();
  const stagingObject = `${workspaceId}/staging/${uploadId}`;
  await db`insert into app_private.branding_uploads(
    id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,started_by
  ) values (
    ${uploadId},${workspaceId},'logo',0,'branding-staging',${stagingObject},'staging',${startedBy}
  )`;
  if (withBytes) {
    const uploaded = await admin()
      .storage.from('branding-staging')
      .upload(stagingObject, Buffer.from('staged bytes'), {
        contentType: 'image/png',
      });
    expect(uploaded.error).toBeNull();
    cleanupObjects.push({ bucket: 'branding-staging', path: stagingObject });
  }
  return { uploadId, stagingObject };
}

async function statusOf(uploadId: string) {
  const [row] = await db<{ status: string }[]>`
    select status from app_private.branding_uploads where id=${uploadId}`;
  return row?.status;
}

async function liveStagingRows(uploadId: string) {
  const [row] = await db<{ n: number }[]>`
    select count(*)::int as n from app_private.branding_uploads
    where id=${uploadId} and status in ('staging','validating','validated',
      'promoted','attaching','reconciliation_pending','interrupted')`;
  return row?.n ?? -1;
}

async function stagedObjectRows(stagingObject: string) {
  const [row] = await db<{ n: number }[]>`
    select count(*)::int as n from storage.objects
    where bucket_id='branding-staging' and name=${stagingObject}`;
  return row?.n ?? -1;
}

it('refuses a foreign workspace even for the originating starter', async () => {
  const { uploadId, stagingObject } = await stagedUploadRow(
    fixture.wsB.id,
    fixture.woA.userId,
    true,
  );
  const denied = await fixture.woA.client.rpc('branding_upload_terminalize', {
    upload_id: uploadId,
  });
  expect(denied.error?.code).toBe('42501');
  expect(await statusOf(uploadId)).toBe('staging');
  expect(await stagedObjectRows(stagingObject)).toBe(1);
});

it('refuses a same-workspace caller without the owner capability', async () => {
  const { uploadId } = await stagedUploadRow(
    fixture.wsA.id,
    fixture.salesA.userId,
    false,
  );
  const denied = await fixture.salesA.client.rpc(
    'branding_upload_terminalize',
    { upload_id: uploadId },
  );
  expect(denied.error?.code).toBe('42501');
  expect(await statusOf(uploadId)).toBe('staging');
});

it('removes the staged object, marks failed, and is idempotent', async () => {
  const begun = await fixture.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'logo',
    expected_revision: 0,
  });
  expect(begun.error).toBeNull();
  const uploadId = begun.data as string;
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  cleanupObjects.push({ bucket: 'branding-staging', path: stagingObject });
  const staged = await fixture.woA.client.storage
    .from('branding-staging')
    .upload(stagingObject, Buffer.from([1, 2, 3]), {
      contentType: 'image/png',
      upsert: false,
    });
  expect(staged.error).toBeNull();

  const first = await fixture.woA.client.rpc('branding_upload_terminalize', {
    upload_id: uploadId,
  });
  expect(first.error).toBeNull();
  expect(first.data).toBe(true);
  expect(await statusOf(uploadId)).toBe('failed');
  expect(await stagedObjectRows(stagingObject)).toBe(0);

  const second = await fixture.woA.client.rpc('branding_upload_terminalize', {
    upload_id: uploadId,
  });
  expect(second.error).toBeNull();
  expect(second.data).toBe(true);
  expect(await statusOf(uploadId)).toBe('failed');
  expect(await liveStagingRows(uploadId)).toBe(0);
});

it('owner check is load-bearing: dropping it lets a non-owner terminalize', async () => {
  const { uploadId } = await stagedUploadRow(
    fixture.wsA.id,
    fixture.woA.userId,
    false,
  );
  await withCrashSafeFunctionMutant(
    'app_private.branding_upload_terminalize(uuid)',
    (source) => {
      expect(source).toContain('u.started_by');
      return source.replace(
        "if not found or u.started_by is distinct from auth.uid()\n    or not app_private.has_workspace_access(u.workspace_id,'manage_branding') then",
        "if not found then raise exception using errcode='42501',message='not_permitted'; end if; if false then",
      );
    },
    async () => {
      const mutated = await fixture.salesA.client.rpc(
        'branding_upload_terminalize',
        { upload_id: uploadId },
      );
      expect(mutated.error).toBeNull();
      expect(mutated.data).toBe(true);
    },
  );
  // The dropped-check mutant acted: the row is terminal, not live.
  expect(await statusOf(uploadId)).toBe('failed');
  expect(await liveStagingRows(uploadId)).toBe(0);
});
