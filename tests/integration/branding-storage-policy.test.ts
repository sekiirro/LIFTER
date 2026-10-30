import { afterAll, beforeAll, expect, it } from 'vitest';
import { brandingFixture } from './branding-security-fixture';
import { admin, sql } from './harness';

const db = sql();
const mutateForeignStaging =
  process.env.BRANDING_STORAGE_POLICY_MUTATION === 'foreign_staging';
let fixture: Awaited<ReturnType<typeof brandingFixture>>;
let stagedPath: string | undefined;
let validatedPath: string | undefined;

beforeAll(async () => {
  fixture = await brandingFixture(db);
  if (mutateForeignStaging) {
    await db`drop policy branding_owner_staging_insert on storage.objects`;
    await db`create policy branding_owner_staging_insert on storage.objects
      for insert to authenticated with check (bucket_id='branding-staging')`;
  }
});

afterAll(async () => {
  if (stagedPath)
    await admin().storage.from('branding-staging').remove([stagedPath]);
  if (validatedPath)
    await admin().storage.from('branding-validated').remove([validatedPath]);
  if (mutateForeignStaging) {
    await db`drop policy branding_owner_staging_insert on storage.objects`;
    await db`create policy branding_owner_staging_insert on storage.objects
      for insert to authenticated with check (
        bucket_id='branding-staging'
        and app_private.branding_staging_upload_allowed(bucket_id,name)
      )`;
    console.log('F14 storage policy mutation restored');
  }
  await db.end();
});

it('keeps F14 buckets private and confines staging writes to the owning upload', async () => {
  const buckets = await db<{ id: string; public: boolean }[]>`
    select id, public from storage.buckets
    where id in ('branding-staging','branding-validated') order by id
  `;
  expect(buckets).toEqual([
    { id: 'branding-staging', public: false },
    { id: 'branding-validated', public: false },
  ]);

  const upload = await fixture.actors.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'logo',
    expected_revision: 0,
  });
  expect(upload.error).toBeNull();
  const uploadId = upload.data as string;
  stagedPath = `${fixture.wsA.id}/staging/${uploadId}`;
  const ownerWrite = await fixture.actors.woA.client.storage
    .from('branding-staging')
    .upload(stagedPath, Buffer.from('owner staging bytes'), {
      contentType: 'image/png',
    });
  expect(ownerWrite.error).toBeNull();

  const foreignPath = `${fixture.wsA.id}/staging/${crypto.randomUUID()}`;
  const foreignWrite = await fixture.actors.woB.client.storage
    .from('branding-staging')
    .upload(foreignPath, Buffer.from('foreign staging bytes'), {
      contentType: 'image/png',
    });
  if (!foreignWrite.error) {
    await admin().storage.from('branding-staging').remove([foreignPath]);
  }
  expect(foreignWrite.error).toBeTruthy();
});

it('denies anon and foreign-workspace reads and owner mutation of validated bytes', async () => {
  validatedPath = `${fixture.wsA.id}/validated/logo/${'a'.repeat(64)}.png`;
  const seeded = await admin()
    .storage.from('branding-validated')
    .upload(validatedPath, Buffer.from('immutable validated bytes'), {
      contentType: 'image/png',
    });
  expect(seeded.error).toBeNull();

  const anonList = await fixture.actors.anon.client.storage
    .from('branding-validated')
    .list(fixture.wsA.id);
  expect(anonList.error || anonList.data?.length === 0).toBe(true);
  const anonRead = await fixture.actors.anon.client.storage
    .from('branding-validated')
    .download(validatedPath);
  expect(anonRead.error).toBeTruthy();

  const foreignRead = await fixture.actors.woB.client.storage
    .from('branding-validated')
    .download(validatedPath);
  expect(foreignRead.error).toBeTruthy();
  const ownerOverwrite = await fixture.actors.woA.client.storage
    .from('branding-validated')
    .update(validatedPath, Buffer.from('replacement bytes'), {
      contentType: 'image/png',
    });
  expect(ownerOverwrite.error).toBeTruthy();
  const ownerDelete = await fixture.actors.woA.client.storage
    .from('branding-validated')
    .remove([validatedPath]);
  const preserved = await admin()
    .storage.from('branding-validated')
    .download(validatedPath);
  expect(preserved.error).toBeNull();
  expect(await preserved.data!.text()).toBe('immutable validated bytes');
  expect(ownerDelete.data).toBeDefined();
});
