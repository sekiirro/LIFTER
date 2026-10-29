import { afterAll, beforeAll, expect, it } from 'vitest';
import type { TransactionSql } from 'postgres';
import { credential, brandingFixture, hash } from './branding-security-fixture';
import { admin, checked, sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof brandingFixture>>;
afterAll(() => db.end());

beforeAll(async () => {
  fixture = await brandingFixture(db);
});

async function asValidator<T>(
  claims: unknown,
  run: (tx: TransactionSql) => Promise<T>,
) {
  return db.begin(async (tx) => {
    await tx`set local role branding_validator`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    return run(tx);
  });
}

async function expectDenied(action: () => Promise<unknown>) {
  let denied = false;
  try {
    await action();
  } catch {
    denied = true;
  }
  expect(denied).toBe(true);
}

it('T049 creates durable uploads and validator-only receipts with forced RLS', async () => {
  for (const table of ['branding_uploads', 'branding_validation_receipts']) {
    const [row] =
      await db`select relrowsecurity and relforcerowsecurity as ok from pg_class where oid=${`app_private.${table}`}::regclass`;
    expect(row?.ok).toBe(true);
    for (const role of [
      'anon',
      'authenticated',
      'service_role',
      'branding_proxy',
      'branding_validator',
    ]) {
      const [access] =
        await db`select has_table_privilege(${role}, ${`app_private.${table}`}, 'SELECT,INSERT,UPDATE,DELETE') as allowed`;
      expect(access?.allowed).toBe(false);
    }
  }
  for (const table of [
    'public.clients',
    'public.workspace_memberships',
    'auth.users',
    'app_private.branding_credentials',
  ]) {
    const [access] =
      await db`select has_table_privilege('branding_validator', ${table}, 'SELECT,INSERT,UPDATE,DELETE') as allowed`;
    expect(access?.allowed).toBe(false);
  }
  const [storageAccess] = await db`select
    has_table_privilege('branding_validator','storage.objects','INSERT') as can_insert,
    has_table_privilege('branding_validator','storage.objects','SELECT,UPDATE,DELETE') as can_read_or_change`;
  expect(storageAccess?.can_insert).toBe(true);
  expect(storageAccess?.can_read_or_change).toBe(false);
  const [policy] = await db`select roles,cmd,with_check from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='branding_validator_insert_validated'`;
  expect(policy?.roles).toEqual(['branding_validator']);
  expect(policy?.cmd).toBe('INSERT');
  expect(policy?.with_check).toMatch(/branding-validated/);
  expect(policy?.with_check).toMatch(/branding_credential_allowed/);
  expect(policy?.with_check).toMatch(
    /branding_validator_upload_binding_matches/,
  );
});

it('T049 accepts, validates, and idempotently records a receipt bound to upload, objects, hash, and enabled credential', async () => {
  const c = await credential(db, 'branding_validator');
  const uploadId = crypto.randomUUID();
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  const outputHash = 'a'.repeat(64);
  const outputObject = `${fixture.wsA.id}/validated/logo/${outputHash}.png`;
  await db`insert into app_private.branding_uploads(id,workspace_id,role,draft_revision,staging_bucket,staging_object,status)
    values(${uploadId},${fixture.wsA.id},'logo',0,'branding-staging',${stagingObject},'staging')`;

  let receiptId: string | undefined;
  await asValidator(c.claims, async (tx) => {
    await tx`select app_private.branding_validation_prepare(${uploadId})`;
    const [receipt] = await tx`select app_private.branding_validation_complete(
      ${uploadId}, ${stagingObject}, 'branding-validated', ${outputObject}, ${outputHash}, 128, 'image/png') as id`;
    receiptId = receipt?.id;
    expect(receiptId).toBeTruthy();
    const [again] = await tx`select app_private.branding_validation_complete(
      ${uploadId}, ${stagingObject}, 'branding-validated', ${outputObject}, ${outputHash}, 128, 'image/png') as id`;
    expect(again?.id).toBe(receiptId);
  });

  const [row] =
    await db`select u.status, r.id, r.workspace_id, r.staging_bucket, r.staging_object,
      r.validated_bucket, r.validated_object, r.output_sha256, r.credential_hash
    from app_private.branding_uploads u join app_private.branding_validation_receipts r on r.upload_id=u.id
    where u.id=${uploadId}`;
  expect(row?.status).toBe('validated');
  expect(row?.id).toBe(receiptId);
  expect(row?.workspace_id).toBe(fixture.wsA.id);
  expect(row?.staging_bucket).toBe('branding-staging');
  expect(row?.staging_object).toBe(stagingObject);
  expect(row?.validated_bucket).toBe('branding-validated');
  expect(row?.validated_object).toBe(outputObject);
  expect(row?.output_sha256).toBe(outputHash);
  expect(row?.credential_hash).toBeTruthy();
  expect(row?.credential_hash).not.toBe(c.id);
});

it('T049 denies owner or stale credentials and rejects mismatched staging/output claims', async () => {
  const c = await credential(db, 'branding_validator');
  const uploadId = crypto.randomUUID();
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  await db`insert into app_private.branding_uploads(id,workspace_id,role,draft_revision,staging_bucket,staging_object,status)
    values(${uploadId},${fixture.wsA.id},'banner',4,'branding-staging',${stagingObject},'staging')`;
  await expectDenied(() =>
    asValidator(
      { ...c.claims, role: 'authenticated' },
      async (tx) =>
        tx`select app_private.branding_validation_prepare(${uploadId})`,
    ),
  );
  await expectDenied(() =>
    asValidator(
      { ...c.claims, credential_id: crypto.randomUUID() },
      async (tx) =>
        tx`select app_private.branding_validation_prepare(${uploadId})`,
    ),
  );
  await asValidator(
    c.claims,
    (tx) => tx`select app_private.branding_validation_prepare(${uploadId})`,
  );
  await expectDenied(() =>
    asValidator(
      c.claims,
      (tx) => tx`select app_private.branding_validation_complete(
    ${uploadId}, ${'other/staging/object'}, 'branding-validated', ${'other/validated/banner/' + 'b'.repeat(64) + '.png'}, ${'b'.repeat(64)}, 128, 'image/png')`,
    ),
  );
  await db`select app_private.branding_credential_set_enabled(${c.id}, false, true)`;
  await expectDenied(() =>
    asValidator(
      c.claims,
      async (tx) =>
        tx`select app_private.branding_validation_prepare(${uploadId})`,
    ),
  );
});

it('T049 binds validated Storage inserts to a matching validating upload', async () => {
  const c = await credential(db, 'branding_validator');
  const workspaceC = checked(
    await admin()
      .from('workspaces')
      .insert({
        name: `Fixture validator-${crypto.randomUUID()}`,
        slug: `f3-validator-${crypto.randomUUID()}`,
        created_by: fixture.po.userId,
      })
      .select('id')
      .single(),
  ).id;
  const path = (workspaceId: string, role: string, hashValue: string) =>
    `${workspaceId}/validated/${role}/${hashValue}.png`;
  const upload = async (input: {
    workspaceId: string;
    role: 'logo' | 'banner';
    status: 'staging' | 'validating';
    id?: string;
  }) => {
    const id = input.id ?? crypto.randomUUID();
    await db`insert into app_private.branding_uploads(
      id,workspace_id,role,draft_revision,staging_bucket,staging_object,status,validator_credential_hash
    ) values(
      ${id},${input.workspaceId},${input.role},0,'branding-staging',
      ${`${input.workspaceId}/staging/${id}`},${input.status},
      ${input.status === 'validating' ? hash(c.id) : null}
    )`;
    return id;
  };
  const matchingUpload = await upload({
    workspaceId: fixture.wsA.id,
    role: 'logo',
    status: 'validating',
  });
  await upload({
    workspaceId: fixture.wsA.id,
    role: 'banner',
    status: 'validating',
  });
  await upload({
    workspaceId: fixture.wsB.id,
    role: 'banner',
    status: 'validating',
  });
  await upload({
    workspaceId: workspaceC,
    role: 'logo',
    status: 'staging',
  });
  const image = Buffer.from('validator storage binding probe');
  const attempt = async (objectName: string) =>
    c.client.storage
      .from('branding-validated')
      .upload(objectName, image, { contentType: 'image/png' });

  for (const objectName of [
    path(crypto.randomUUID(), 'banner', 'a'.repeat(64)), // No matching upload.
    path(workspaceC, 'banner', 'b'.repeat(64)), // Upload is bound to another workspace.
    path(fixture.wsB.id, 'logo', 'd'.repeat(64)), // Matching upload is for banner.
    path(workspaceC, 'logo', 'e'.repeat(64)), // Matching upload is still staging.
  ]) {
    const result = await attempt(objectName);
    if (!result.error) {
      const cleanup = await admin()
        .storage.from('branding-validated')
        .remove([objectName]);
      expect(cleanup.error).toBeNull();
    }
    expect(result.error, objectName).toBeTruthy();
  }

  const allowed = await attempt(path(fixture.wsA.id, 'logo', 'c'.repeat(64)));
  expect(allowed.error).toBeNull();
  const cleanup = await admin()
    .storage.from('branding-validated')
    .remove([path(fixture.wsA.id, 'logo', 'c'.repeat(64))]);
  expect(cleanup.error).toBeNull();
  expect(matchingUpload).toBeTruthy();
});

it('T051 keeps PO global authority and requires active own-workspace membership for WO', async () => {
  const f = await twoWorkspaceFixture();
  async function authorized(userId: string, workspaceId: string) {
    return db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub',${userId},true)`;
      const [result] =
        await tx`select app_private.has_workspace_access(${workspaceId}::uuid,'generate_registration_link') as allowed`;
      return result?.allowed as boolean;
    });
  }
  expect(await authorized(f.po.userId, f.wsB.id)).toBe(true);
  expect(await authorized(f.woA.userId, f.wsA.id)).toBe(true);
  expect(await authorized(f.woA.userId, f.wsB.id)).toBe(false);
  await db`update public.workspace_memberships set revoked_at=now(), revoked_by=${f.po.userId} where workspace_id=${f.wsA.id} and user_id=${f.woA.userId}`;
  expect(await authorized(f.woA.userId, f.wsA.id)).toBe(false);
  const [definition] =
    await db`select pg_get_functiondef('app_private.has_workspace_access(uuid,text)'::regprocedure) as body`;
  expect(definition?.body).toMatch(/is_platform_owner\(\)\s+or/i);
  expect(definition?.body).toMatch(
    /workspace_memberships[\s\S]*revoked_at\s+is\s+null/i,
  );
  expect(definition?.body).not.toMatch(/manage_branding/);
});
