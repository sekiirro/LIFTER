import { afterAll, beforeAll, expect, it } from 'vitest';
import { admin, anonClient, sql } from './harness';
import {
  brandingFixture,
  credential,
  env,
  hash,
  opaque,
  negativeJwt,
} from './branding-security-fixture';
const db = sql();
let f: Awaited<ReturnType<typeof brandingFixture>>,
  c: Awaited<ReturnType<typeof credential>>,
  handle: string;
let object: string;
const cleanupObjects: string[] = [];
const bucket = 'branding-validated';
const bytes = Buffer.from('synthetic branding fixture');
beforeAll(async () => {
  f = await brandingFixture(db);
  c = await credential(db);
  object = `${f.wsA.id}/${hash(bytes.toString())}.png`;
  await db`insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size) values(${f.wsA.id},${f.versionId},'logo',${bucket},${object},'image/png',${bytes.length})`;
  const up = await admin()
    .storage.from(bucket)
    .upload(object, bytes, { contentType: 'image/png' });
  expect(up.error === null).toBe(true);
  cleanupObjects.push(object);
  handle = (
    await anonClient().rpc('registration_link_open', { token: f.token })
  ).data.render_handle;
});
afterAll(async () => {
  try {
    if (cleanupObjects.length)
      await admin().storage.from(bucket).remove(cleanupObjects);
  } finally {
    await db.end();
  }
});
async function resolve(token = f.token, render_handle = handle, slot = 'logo') {
  return c.client.rpc('registration_brand_asset_resolve', {
    token,
    render_handle,
    slot,
  });
}
async function download(
  options: {
    token?: string;
    handle?: string;
    jwt?: string;
    route?: string;
  } = {},
) {
  const r = await fetch(
    `${env.apiUrl}/storage/v1${options.route ?? `/object/authenticated/${bucket}/${object}`}`,
    {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${options.jwt ?? c.jwt}`,
        'x-lifter-registration-token': options.token ?? f.token,
        'x-lifter-render-handle': options.handle ?? handle,
        'x-lifter-brand-slot': 'logo',
      },
      redirect: 'manual',
    },
  );
  const b = Buffer.from(await r.arrayBuffer());
  return { status: r.status, match: b.equals(bytes) };
}
it('T046 RPC derives exact metadata; live Storage policy permits only bound download', async () => {
  const r = await resolve();
  expect(r.error === null && r.data.status === 'ok').toBe(true);
  expect(
    r.data.bucket === bucket &&
      r.data.object === object &&
      r.data.byte_size === bytes.length,
  ).toBe(true);
  expect((await download()).match).toBe(true);
  const [policy] =
    await db`select roles,cmd from pg_policies where policyname='branding_proxy_object_read'`;
  expect(
    policy!.cmd === 'SELECT' &&
      policy!.roles.length === 1 &&
      policy!.roles[0] === 'branding_proxy',
  ).toBe(true);
});
it('T046 Q-M21/22 missing authority/context and swapped token/handle/slot/path deny', async () => {
  for (const [token, h, slot] of [
    [opaque(), handle, 'logo'],
    [f.token, opaque(), 'logo'],
    [f.token, handle, 'banner'],
    [f.token, handle, 'history'],
  ]) {
    const r = await resolve(token, h, slot);
    expect(r.data?.status === 'invalid').toBe(true);
  }
  for (const o of [
    { token: '' },
    { handle: '' },
    { jwt: env.anonKey },
    { route: `/object/authenticated/${bucket}/${f.wsB.id}/foreign.png` },
  ]) {
    const r = await download(o);
    expect(r.status >= 400 && !r.match).toBe(true);
  }
  const denied = await anonClient().rpc('registration_brand_asset_resolve', {
    token: f.token,
    render_handle: handle,
    slot: 'logo',
  });
  expect(denied.error !== null).toBe(true);
});
it('T046 Q-M25 list/sign cannot borrow SELECT authority', async () => {
  const list = await c.client.storage.from(bucket).list(f.wsA.id);
  expect(list.error !== null || list.data?.length === 0).toBe(true);
  const signed = await c.client.storage
    .from(bucket)
    .createSignedUrl(object, 60);
  expect(signed.error !== null && signed.data === null).toBe(true);
});
it('T046 Q-M26 operation alone denies with otherwise-correct policy context (database probe)', async () => {
  await db.begin(async (tx) => {
    await tx`set local role branding_proxy`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify(c.claims)},true),
      set_config('request.headers',${JSON.stringify({ 'x-lifter-registration-token': f.token, 'x-lifter-render-handle': handle, 'x-lifter-brand-slot': 'logo' })},true),
      set_config('request.method','GET',true),set_config('request.path',${`/object/authenticated/${bucket}/${object}`},true),
      set_config('storage.operation','storage.object.get_authenticated',true)`;
    const [yes] =
      await tx`select app_private.branding_storage_read_allowed(${bucket},${object}) as ok`;
    expect(yes!.ok).toBe(true);
    for (const operation of [
      'storage.object.sign',
      'storage.object.list',
      'storage.render.image_authenticated',
    ]) {
      await tx`select set_config('storage.operation',${operation},true)`;
      const [no] =
        await tx`select app_private.branding_storage_read_allowed(${bucket},${object}) as ok`;
      expect(no!.ok).toBe(false);
    }
  });
});
it('T046 Q-M22 real foreign objects require their own token/handle; expired/unknown/validator JWTs deny', async () => {
  const other = await brandingFixture(db);
  const otherObject = `${other.wsA.id}/${hash(bytes.toString())}.png`;
  await db`insert into app_private.branding_published_assets(workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size) values(${other.wsA.id},${other.versionId},'logo',${bucket},${otherObject},'image/png',${bytes.length})`;
  const uploaded = await admin()
    .storage.from(bucket)
    .upload(otherObject, bytes, { contentType: 'image/png' });
  expect(uploaded.error === null).toBe(true);
  cleanupObjects.push(otherObject);
  const otherHandle = (
    await anonClient().rpc('registration_link_open', { token: other.token })
  ).data.render_handle;
  const route = `/object/authenticated/${bucket}/${otherObject}`;
  expect((await download({ route })).match).toBe(false);
  expect(
    (await download({ route, token: other.token, handle: otherHandle })).match,
  ).toBe(true);
  expect((await download({ token: other.token })).match).toBe(false);
  const validator = await credential(db, 'branding_validator');
  for (const jwt of [
    negativeJwt({ ...c.claims, exp: 1 }),
    negativeJwt({ ...c.claims, credential_id: opaque() }),
    validator.jwt,
  ]) {
    const r = await download({ jwt });
    expect(r.status >= 400 && !r.match).toBe(true);
  }
});
it('T046 Q-M24 publication replacement rejects old handle independently in RPC and RLS', async () => {
  const [v] =
    await db`insert into app_private.branding_published_versions(workspace_id) values(${f.wsA.id}) returning id`;
  await db`update app_private.branding_current_publications set version_id=${v!.id} where workspace_id=${f.wsA.id}`;
  try {
    expect((await resolve()).data.status).toBe('invalid');
    expect((await download()).match).toBe(false);
  } finally {
    await db`update app_private.branding_current_publications set version_id=${f.versionId} where workspace_id=${f.wsA.id}`;
  }
  expect((await download()).match).toBe(true);
});
it('T046 Q-M27 emergency credential disable is enforced independently by RPC and Storage; replacement works', async () => {
  await db`select app_private.branding_credential_set_enabled(${c.id},false,true)`;
  expect((await resolve()).data.status).toBe('invalid');
  expect((await download()).match).toBe(false);
  c = await credential(db);
  expect((await download()).match).toBe(true);
});
it('T046 Q-M23 live F10 grace/deadline is rechecked by both RPC and Storage', async () => {
  const [saved] =
    await db`select created_at,expires_at,opened_at from public.registration_links where id=${f.linkId}`;
  async function setTimes(expired: boolean) {
    await db.begin(async (tx) => {
      await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
      await tx`update public.registration_links set created_at=now()-interval '24 hours 20 minutes',expires_at=now()-interval '20 minutes',opened_at=now()-(${expired ? '31 minutes' : '25 minutes'})::interval where id=${f.linkId}`;
      await tx`alter table public.registration_links enable trigger registration_links_update_guard`;
    });
  }
  try {
    await setTimes(false);
    expect((await resolve()).data.status).toBe('ok');
    expect((await download()).match).toBe(true);
    await setTimes(true);
    expect((await resolve()).data.status).toBe('invalid');
    expect((await download()).match).toBe(false);
  } finally {
    await db.begin(async (tx) => {
      await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
      await tx`update public.registration_links set created_at=${saved!.created_at},expires_at=${saved!.expires_at},opened_at=${saved!.opened_at} where id=${f.linkId}`;
      await tx`alter table public.registration_links enable trigger registration_links_update_guard`;
    });
  }
});
it('T046 Q-M23 handle expiry and live token consumption deny without changing opened_at', async () => {
  const [before] =
    await db`select opened_at from public.registration_links where id=${f.linkId}`;
  await db`update app_private.branding_render_handles set expires_at=now()-interval '1 second' where handle_hash=${hash(handle)}`;
  expect((await resolve()).data.status).toBe('invalid');
  expect((await download()).match).toBe(false);
  handle = (
    await anonClient().rpc('registration_link_open', { token: f.token })
  ).data.render_handle;
  await db.begin(async (tx) => {
    await tx`alter table public.registration_links disable trigger registration_links_update_guard`;
    await tx`update public.registration_links set consumed_at=now() where id=${f.linkId}`;
    await tx`alter table public.registration_links enable trigger registration_links_update_guard`;
  });
  expect((await resolve()).data.status).toBe('invalid');
  expect((await download()).match).toBe(false);
  const [after] =
    await db`select opened_at from public.registration_links where id=${f.linkId}`;
  expect(+before!.opened_at === +after!.opened_at).toBe(true);
});
