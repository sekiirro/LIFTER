import { afterAll, beforeAll, expect, it } from 'vitest';
import { brandingFixture, credential } from './branding-security-fixture';
import { admin, loadEnv, sql } from './harness';
import {
  createBrandingGc,
  runBrandingGc,
} from '../../workers/cron/src/branding-gc';
import { brandingValidatedObjectName } from '../../lib/branding/object-path';

const db = sql();
let fixture: Awaited<ReturnType<typeof brandingFixture>>;
let mutationOriginal: string | undefined;
async function applyGcFunctionDefinition(definition: string) {
  await db`grant create on schema app_private to branding_definer`;
  await db`grant branding_definer to postgres`;
  try {
    await db.begin(async (tx) => {
      await tx`set local role branding_definer`;
      await tx.unsafe(definition);
    });
  } finally {
    await db`revoke branding_definer from postgres`;
    await db`revoke create on schema app_private from branding_definer`;
  }
}
afterAll(async () => {
  if (mutationOriginal) {
    await applyGcFunctionDefinition(mutationOriginal);
    console.log('T050 mutation restored');
  }
  await db.end();
});
beforeAll(async () => {
  fixture = await brandingFixture(db);
  const mutation = process.env.BRANDING_GC_MUTATION;
  if (!mutation) return;
  const signatures = {
    publish: 'app_private.branding_publish(uuid,bigint)',
    attach: 'app_private.branding_asset_attach(uuid,bigint)',
    finalize: 'app_private.branding_gc_finalize(uuid)',
  } as const;
  if (!(mutation in signatures)) throw new Error('unknown_gc_mutation');
  const signature = signatures[mutation as keyof typeof signatures];
  const [row] = await db<{ definition: string }[]>`
    select pg_get_functiondef(${signature}::regprocedure) as definition
  `;
  if (!row?.definition) throw new Error('missing_gc_mutation_target');
  mutationOriginal = row.definition;
  const replacements: Record<string, [RegExp, string]> = {
    publish: [
      /if exists\(select 1 from app_private\.branding_gc_claims g where g\.workspace_id=d\.workspace_id\)\s*then\s*raise exception using errcode='40001',message='branding_deletion_in_progress';\s*end if;/,
      "if false then raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;",
    ],
    attach: [
      /if exists\(select 1 from app_private\.branding_gc_claims g where g\.bucket_id=u\.validated_bucket\s*and g\.object_name=u\.validated_object\) then\s*raise exception using errcode='40001',message='branding_deletion_in_progress';\s*end if;/,
      "if false then raise exception using errcode='40001',message='branding_deletion_in_progress'; end if;",
    ],
    finalize: [
      /AS \$function\$[\s\S]*\$function\$/,
      'AS $function$ begin return true; end; $function$',
    ],
  };
  const [pattern, replacement] = replacements[mutation]!;
  const mutated = mutationOriginal.replace(pattern, replacement);
  if (mutated === mutationOriginal)
    throw new Error('gc_mutation_target_not_found');
  await applyGcFunctionDefinition(mutated);
});

async function denied<T>(run: () => T | Promise<T>) {
  let rejected = false;
  try {
    const result = await run();
    rejected = Boolean((result as { error?: unknown } | null)?.error);
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

it('T049 stages, attaches, and publishes only within current manage_branding scope', async () => {
  const f = fixture.actors;
  const begin = (actor: typeof f.woA, workspaceId: string) =>
    actor.client.rpc('branding_upload_begin', {
      workspace_id: workspaceId,
      role: 'logo',
      expected_revision: 0,
    });
  await denied(() => begin(f.salesA, fixture.wsA.id));
  await denied(() => begin(f.trainerA, fixture.wsA.id));
  await denied(() => begin(f.woA, fixture.wsB.id));

  const staged = await begin(f.woA, fixture.wsA.id);
  expect(staged.error).toBeNull();
  expect(staged.data).toBeTruthy();
  const uploadId = staged.data as string;
  const stagingObject = `${fixture.wsA.id}/staging/${uploadId}`;
  const stagedBytes = await f.woA.client.storage
    .from('branding-staging')
    .upload(stagingObject, Buffer.from('staged owner bytes'), {
      contentType: 'image/png',
    });
  expect(stagedBytes.error).toBeNull();

  await denied(() =>
    f.salesA.client.rpc('branding_asset_attach', {
      upload_id: uploadId,
      expected_revision: 0,
    }),
  );
  await denied(() =>
    f.woA.client.rpc('branding_asset_attach', {
      upload_id: uploadId,
      expected_revision: 0,
    }),
  ); // No validator receipt exists.

  const saved = await f.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: { name: { ar: 'هوية', en: 'Identity' }, color: '#123456' },
  });
  expect(saved.error).toBeNull();
  expect(saved.data).toBe(1);
  const stale = await f.woA.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
  });
  expect(stale.error).toBeTruthy();
  const second = await f.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'logo',
    expected_revision: 1,
  });
  expect(second.error).toBeNull();
  const attachId = second.data as string;
  const digest = 'a'.repeat(64);
  const validatedObject = `${fixture.wsA.id}/validated/logo/${digest}.png`;
  const objectUpload = await admin()
    .storage.from('branding-validated')
    .upload(validatedObject, Buffer.from('validated test bytes'), {
      contentType: 'image/png',
    });
  expect(objectUpload.error).toBeNull();
  await db`update app_private.branding_uploads set status='validated',validated_bucket='branding-validated',
    validated_object=${validatedObject},validated_sha256=${digest},validated_size=20,validator_credential_hash=${'b'.repeat(64)}
    where id=${attachId}`;
  await db`insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,
    validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    select ${crypto.randomUUID()},workspace_id,id,staging_bucket,staging_object,'branding-validated',${validatedObject},
      ${digest},20,'image/png',${'b'.repeat(64)} from app_private.branding_uploads where id=${attachId}`;
  const attached = await f.woA.client.rpc('branding_asset_attach', {
    upload_id: attachId,
    expected_revision: 1,
  });
  expect(attached.error).toBeNull();
  expect(attached.data).toBe(2);
  const published = await f.woA.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
  });
  expect(published.error).toBeNull();
  expect(published.data).toBeTruthy();
  const publishedAssets =
    await db`select count(*)::int as count from app_private.branding_published_assets
    where workspace_id=${fixture.wsA.id} and version_id=${published.data}`;
  expect(publishedAssets[0]?.count).toBe(1);
  const opened = await f.anon.client.rpc('registration_link_open', {
    token: fixture.token,
  });
  expect(opened.error).toBeNull();
  const oldHandle = (opened.data as { render_handle?: string }).render_handle;
  expect(oldHandle).toBeTruthy();
  const updated = await f.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
    fields: {
      name: { ar: 'هوية جديدة', en: 'Identity updated' },
      color: '#123456',
      bannerAlt: { ar: '', en: '' },
      logo: null,
    },
  });
  expect(updated.error).toBeNull();
  const replacement = await f.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 3,
  });
  expect(replacement.error).toBeNull();
  const proxy = await credential(db, 'branding_proxy');
  const oldRead = await proxy.client.rpc('registration_brand_asset_resolve', {
    token: fixture.token,
    render_handle: oldHandle,
    slot: 'logo',
  });
  expect(oldRead.error).toBeNull();
  expect((oldRead.data as { status: string }).status).toBe('invalid');
  const workerEnv = loadEnv();
  await runBrandingGc(
    createBrandingGc({
      SUPABASE_URL: workerEnv.apiUrl,
      SUPABASE_SERVICE_ROLE_KEY: workerEnv.serviceRoleKey,
    }),
    50,
  );
  const [oldClaim] = await db<{ id: string }[]>`
    select target_id::text as id from public.audit_events
    where workspace_id=${fixture.wsA.id} and action='branding.gc_claimed'
    order by occurred_at desc limit 1
  `;
  expect(oldClaim?.id).toBeTruthy();
  const claimAudit = await f.po.client
    .from('audit_events')
    .select('action,details')
    .eq('target_id', oldClaim!.id)
    .eq('action', 'branding.gc_claimed')
    .single();
  expect(claimAudit.error).toBeNull();
  expect(claimAudit.data?.action).toBe('branding.gc_claimed');
  expect(claimAudit.data?.details).toEqual({ lease_seconds: 300 });
  const finalizeAudit = await f.po.client
    .from('audit_events')
    .select('action,details')
    .eq('target_id', oldClaim!.id)
    .eq('action', 'branding.gc_finalized')
    .single();
  expect(finalizeAudit.error).toBeNull();
  expect(finalizeAudit.data?.action).toBe('branding.gc_finalized');
  expect(finalizeAudit.data?.details).toEqual({});
  const oldReadAfterDelete = await proxy.client.rpc(
    'registration_brand_asset_resolve',
    {
      token: fixture.token,
      render_handle: oldHandle,
      slot: 'logo',
    },
  );
  expect((oldReadAfterDelete.data as { status: string }).status).toBe(
    'invalid',
  );
  await denied(() =>
    f.salesA.client.rpc('branding_publish', {
      workspace_id: fixture.wsA.id,
      expected_revision: 2,
    }),
  );
  const revokedUpload = await f.woA.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsA.id,
    role: 'banner',
    expected_revision: 3,
  });
  expect(revokedUpload.error).toBeNull();
  const revokedId = revokedUpload.data as string;
  const revokedObject = `${fixture.wsA.id}/validated/banner/${'c'.repeat(64)}.png`;
  await db`update app_private.branding_uploads set status='validated',validated_bucket='branding-validated',
    validated_object=${revokedObject},validated_sha256=${'c'.repeat(64)},validated_size=20,validator_credential_hash=${'d'.repeat(64)}
    where id=${revokedId}`;
  await db`insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,
    validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    select ${crypto.randomUUID()},workspace_id,id,staging_bucket,staging_object,'branding-validated',${revokedObject},
      ${'c'.repeat(64)},20,'image/png',${'d'.repeat(64)} from app_private.branding_uploads where id=${revokedId}`;

  await db`update public.workspace_memberships set revoked_at=now(), revoked_by=${f.po.userId}
    where workspace_id=${fixture.wsA.id} and user_id=${f.woA.userId}`;
  await denied(() => begin(f.woA, fixture.wsA.id));
  await denied(() =>
    f.woA.client.rpc('branding_publish', {
      workspace_id: fixture.wsA.id,
      expected_revision: 3,
    }),
  );
  await denied(() =>
    f.woA.client.rpc('branding_asset_attach', {
      upload_id: revokedId,
      expected_revision: 3,
    }),
  );
  const [attachDefinition] =
    await db`select pg_get_functiondef('app_private.branding_asset_attach(uuid,bigint)'::regprocedure) as body`;
  const attachWithoutAuthority = (attachDefinition!.body as string).replace(
    /or not app_private\.has_workspace_access\(u\.workspace_id,\s*'manage_branding'\)/,
    'or false',
  );
  expect(attachWithoutAuthority).not.toContain(
    'has_workspace_access(u.workspace_id',
  );
  expect(attachDefinition!.body).toContain(
    'has_workspace_access(u.workspace_id',
  );
  const removedStaging = await admin()
    .storage.from('branding-staging')
    .remove([stagingObject]);
  expect(removedStaging.error).toBeNull();
});

it('denies anon and authenticated callers access to the service GC wrappers', async () => {
  for (const actor of [fixture.actors.anon, fixture.actors.woA]) {
    await denied(() =>
      actor.client.rpc('branding_gc_claim', { batch_size: 1 }),
    );
    await denied(() =>
      actor.client.rpc('branding_gc_finalize', {
        claim_id: crypto.randomUUID(),
      }),
    );
  }
});

it('T050 claims only unreferenced assets, blocks new references, and requires a live claim to finalize', async () => {
  const functions = await db`select
    to_regprocedure('app_private.branding_gc_claim(integer)') is not null as claim_exists,
    to_regprocedure('app_private.branding_gc_finalize(uuid)') is not null as finalize_exists,
    to_regprocedure('public.branding_gc_claim(integer)') is not null as cron_claim_exists,
    to_regprocedure('public.branding_gc_finalize(uuid)') is not null as cron_finalize_exists`;
  expect(functions[0]?.claim_exists).toBe(true);
  expect(functions[0]?.finalize_exists).toBe(true);
  expect(functions[0]?.cron_claim_exists).toBe(true);
  expect(functions[0]?.cron_finalize_exists).toBe(true);

  const versionId = crypto.randomUUID();
  const objectName = `${fixture.wsB.id}/validated/logo/${'f'.repeat(64)}.png`;
  const savedDraft = await fixture.actors.woB.client.rpc(
    'branding_draft_save',
    {
      workspace_id: fixture.wsB.id,
      expected_revision: 0,
      fields: {
        name: { ar: '', en: 'GC workspace' },
        color: '#123456',
        bannerAlt: { ar: '', en: '' },
      },
    },
  );
  expect(savedDraft.error).toBeNull();
  await db`insert into app_private.branding_published_versions(workspace_id,id,sequence,fields)
    values(${fixture.wsB.id},${versionId},1,'{"name":{"ar":"","en":"Old"},"color":"#123456","logo":null,"banner":null,"bannerAlt":{"ar":"","en":""}}'::jsonb)`;
  await db`insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
    values(${fixture.wsB.id},${versionId},'logo','branding-validated',${objectName},'image/png',32)`;
  const uploaded = await admin()
    .storage.from('branding-validated')
    .upload(objectName, Buffer.from('gc fixture bytes'), {
      contentType: 'image/png',
    });
  expect(uploaded.error).toBeNull();
  const claims = await db`select * from app_private.branding_gc_claim(50)`;
  const row = claims.find((candidate) => candidate.object_name === objectName);
  expect(row?.id).toBeTruthy();
  const claimId = row?.id as string;
  const workspaceId = row?.workspace_id as string;
  const claimedObject = row?.object_name as string;
  expect(claimedObject).toBe(objectName);
  const leaseMs = Date.parse(row!.lease_until as string) - Date.now();
  expect(leaseMs).toBeGreaterThan(0);
  expect(leaseMs).toBeLessThanOrEqual(5 * 60 * 1000);
  await denied(() =>
    fixture.actors.woB.client.rpc('branding_upload_begin', {
      workspace_id: workspaceId,
      role: 'logo',
      expected_revision: 0,
    }),
  );
  await denied(() =>
    fixture.actors.woB.client.rpc('branding_publish', {
      workspace_id: workspaceId,
      expected_revision: 1,
    }),
  );
  await denied(
    () =>
      db`select app_private.branding_gc_finalize(${crypto.randomUUID()}::uuid)`,
  );
  await denied(
    () => db`select app_private.branding_gc_finalize(${claimId}::uuid)`,
  );
  await db`update app_private.branding_gc_claims set lease_until=statement_timestamp()-interval '1 second' where id=${claimId}::uuid`;
  const retried = await db`select * from app_private.branding_gc_claim(50)`;
  const retryClaim = retried.find(
    (candidate) => candidate.object_name === objectName,
  );
  expect(retryClaim?.id).toBe(claimId);
  expect(Date.parse(retryClaim!.lease_until as string)).toBeGreaterThan(
    Date.now(),
  );
  await denied(() =>
    fixture.actors.woB.client.rpc('branding_publish', {
      workspace_id: workspaceId,
      expected_revision: 1,
    }),
  );
  const removed = await admin()
    .storage.from('branding-validated')
    .remove([objectName]);
  expect(removed.error).toBeNull();
  const [done] =
    await db`select app_private.branding_gc_finalize(${claimId}::uuid) as deleted`;
  expect(done?.deleted).toBe(true);
  await denied(
    () => db`select app_private.branding_gc_finalize(${claimId}::uuid)`,
  );

  const attachObject = `${fixture.wsB.id}/validated/logo/${'e'.repeat(64)}.png`;
  const pending = await fixture.actors.woB.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsB.id,
    role: 'logo',
    expected_revision: 1,
  });
  expect(pending.error).toBeNull();
  const pendingId = pending.data as string;
  await db`update app_private.branding_uploads set status='validated',validated_bucket='branding-validated',
    validated_object=${attachObject},validated_sha256=${'e'.repeat(64)},validated_size=20,validator_credential_hash=${'f'.repeat(64)}
    where id=${pendingId}`;
  await db`insert into app_private.branding_validation_receipts(id,workspace_id,upload_id,staging_bucket,staging_object,
    validated_bucket,validated_object,output_sha256,output_size,content_type,credential_hash)
    select ${crypto.randomUUID()},workspace_id,id,staging_bucket,staging_object,'branding-validated',${attachObject},
      ${'e'.repeat(64)},20,'image/png',${'f'.repeat(64)} from app_private.branding_uploads where id=${pendingId}`;
  const attachClaimId = crypto.randomUUID();
  await db`insert into app_private.branding_gc_claims(id,workspace_id,bucket_id,object_name,lease_until)
    values(${attachClaimId},${fixture.wsB.id},'branding-validated',${attachObject},statement_timestamp()+interval '5 minutes')`;
  await denied(() =>
    fixture.actors.woB.client.rpc('branding_asset_attach', {
      upload_id: pendingId,
      expected_revision: 1,
    }),
  );
  await db`delete from app_private.branding_gc_claims where id=${attachClaimId}`;
});

it('T050 collects a stale attached upload after its asset references disappear', async () => {
  const [draft] = await db<{ revision: number }[]>`
    select revision from app_private.branding_drafts where workspace_id=${fixture.wsB.id}
  `;
  const started = await fixture.actors.woB.client.rpc('branding_upload_begin', {
    workspace_id: fixture.wsB.id,
    role: 'logo',
    expected_revision: draft?.revision ?? 0,
  });
  expect(started.error).toBeNull();
  const uploadId = started.data as string;
  const validatedObject = `${fixture.wsB.id}/validated/logo/${'a'.repeat(64)}.png`;
  await db`update app_private.branding_uploads
    set status='attached', validated_bucket='branding-validated',
      validated_object=${validatedObject}, validated_sha256=${'a'.repeat(64)},
      validated_size=32, validator_credential_hash=${'b'.repeat(64)},
      updated_at=statement_timestamp()-interval '31 minutes'
    where id=${uploadId}`;

  const claims = await db`select * from app_private.branding_gc_claim(50)`;
  const claim = claims.find(
    (row) => row.object_name === `${fixture.wsB.id}/staging/${uploadId}`,
  );
  expect(claim).toBeDefined();
  const finalized =
    await db`select app_private.branding_gc_finalize(${claim!.id}::uuid) as cleaned`;
  expect(finalized[0]?.cleaned).toBe(true);
  const [upload] = await db<{ status: string }[]>`
    select status from app_private.branding_uploads where id=${uploadId}
  `;
  expect(upload?.status).toBe('cleaned');
});

it('T050 preserves a live same-content upload when an expired GC worker resumes', async () => {
  const workspaceId = fixture.wsB.id;
  const contentHash = '9'.repeat(64);
  const staleUploadId = crypto.randomUUID();
  const staleObject = brandingValidatedObjectName(
    workspaceId,
    'logo',
    contentHash,
    staleUploadId,
    'image/png',
  );
  const oldVersionId = crypto.randomUUID();
  const oldSequenceRows = await db<{ next_sequence: number }[]>`
    select coalesce(max(sequence),0)+1 as next_sequence
    from app_private.branding_published_versions where workspace_id=${workspaceId}`;
  const oldUpload = await admin()
    .storage.from('branding-validated')
    .upload(staleObject, Buffer.from('old validated bytes'), {
      contentType: 'image/png',
      upsert: false,
    });
  expect(oldUpload.error).toBeNull();
  await db`insert into app_private.branding_published_versions(
      workspace_id,id,sequence,fields,published_by,published_at)
    values(${workspaceId},${oldVersionId},${oldSequenceRows[0]!.next_sequence},
      jsonb_build_object('name',jsonb_build_object('ar','','en','Old GC asset'),
        'color','#123456','logo',null,'banner',null,
        'bannerAlt',jsonb_build_object('ar','','en','')),
      ${fixture.po.userId},'2000-01-01'::timestamptz)`;
  await db`insert into app_private.branding_published_assets(
      workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
    values(${workspaceId},${oldVersionId},'logo','branding-validated',${staleObject},'image/png',18)`;

  const [claimed] = await db<
    {
      id: string;
      workspace_id: string;
      bucket_id: string;
      object_name: string;
    }[]
  >`select * from app_private.branding_gc_claim(1)`;
  expect(claimed?.object_name).toBe(staleObject);
  const claim = {
    id: claimed!.id,
    workspace_id: claimed!.workspace_id,
    bucket_id: claimed!.bucket_id,
    object_name: claimed!.object_name,
  };
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  const storage = admin().storage;
  const staleWorker = runBrandingGc({
    claim: async () => [claim],
    remove: async (bucket, objectName) => {
      expect(bucket).toBe('branding-validated');
      expect(objectName).toBe(staleObject);
      signalStarted();
      await deleteGate;
      const removed = await storage.from(bucket).remove([objectName]);
      if (removed.error) throw removed.error;
    },
    finalize: async (claimId) => {
      const [result] = await db<{ finalized: boolean }[]>`
        select app_private.branding_gc_finalize(${claimId}::uuid) as finalized`;
      return result?.finalized ?? false;
    },
  });
  await started;
  await db`update app_private.branding_gc_claims
    set lease_until=statement_timestamp()-interval '1 second' where id=${claim.id}::uuid`;
  const [reclaimed] = await db<
    {
      id: string;
      workspace_id: string;
      bucket_id: string;
      object_name: string;
    }[]
  >`select * from app_private.branding_gc_claim(1)`;
  expect(reclaimed?.id).toBe(claim.id);
  const secondPass = await runBrandingGc({
    claim: async () => [reclaimed!],
    remove: async (bucket, objectName) => {
      const removed = await storage.from(bucket).remove([objectName]);
      if (removed.error) throw removed.error;
    },
    finalize: async (claimId) => {
      const [result] = await db<{ finalized: boolean }[]>`
        select app_private.branding_gc_finalize(${claimId}::uuid) as finalized`;
      return result?.finalized ?? false;
    },
  });
  expect(secondPass).toBe(1);

  const liveUploadId = crypto.randomUUID();
  const liveObject = brandingValidatedObjectName(
    workspaceId,
    'logo',
    contentHash,
    liveUploadId,
    'image/png',
  );
  expect(liveObject).not.toBe(staleObject);
  const liveBytes = Buffer.from('new live validated bytes');
  const liveUpload = await storage
    .from('branding-validated')
    .upload(liveObject, liveBytes, { contentType: 'image/png', upsert: false });
  expect(liveUpload.error).toBeNull();
  const liveVersionId = crypto.randomUUID();
  const liveSequenceRows = await db<{ next_sequence: number }[]>`
    select coalesce(max(sequence),0)+1 as next_sequence
    from app_private.branding_published_versions where workspace_id=${workspaceId}`;
  await db`insert into app_private.branding_published_versions(
      workspace_id,id,sequence,fields,published_by,published_at)
    values(${workspaceId},${liveVersionId},${liveSequenceRows[0]!.next_sequence},
      jsonb_build_object('name',jsonb_build_object('ar','','en','Live GC asset'),
        'color','#123456','logo',jsonb_build_object('bucket','branding-validated',
          'object',${liveObject}::text,'content_type','image/png','byte_size',${liveBytes.byteLength}::bigint),
        'banner',null,'bannerAlt',jsonb_build_object('ar','','en','')),
      ${fixture.po.userId},statement_timestamp())`;
  await db`insert into app_private.branding_published_assets(
      workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size)
    values(${workspaceId},${liveVersionId},'logo','branding-validated',${liveObject},'image/png',${liveBytes.byteLength})`;
  await db`insert into app_private.branding_current_publications(workspace_id,version_id)
    values(${workspaceId},${liveVersionId}) on conflict(workspace_id)
    do update set version_id=excluded.version_id`;

  releaseDelete();
  await expect(staleWorker).rejects.toThrow();
  const readBack = await storage
    .from('branding-validated')
    .download(liveObject);
  expect(readBack.error).toBeNull();
  expect(Buffer.from(await readBack.data!.arrayBuffer())).toEqual(liveBytes);

  await storage.from('branding-validated').remove([staleObject, liveObject]);
  await db`delete from app_private.branding_current_publications where workspace_id=${workspaceId} and version_id=${liveVersionId}`;
  await db`delete from app_private.branding_published_assets where workspace_id=${workspaceId} and version_id=${liveVersionId}`;
  await db`delete from app_private.branding_published_versions where workspace_id=${workspaceId} and id=${liveVersionId}`;
});
