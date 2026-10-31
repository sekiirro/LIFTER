import { afterAll, beforeAll, expect, it } from 'vitest';
import { anonClient, sql } from './harness';
import { brandingFixture, hash, opaque } from './branding-security-fixture';
const db = sql();
let f: Awaited<ReturnType<typeof brandingFixture>>;
beforeAll(async () => {
  f = await brandingFixture(db);
});
afterAll(() => db.end());
async function open() {
  return (await anonClient().rpc('registration_link_open', { token: f.token }))
    .data;
}
it('T045 canonical random handle is hash-only and bound to link/workspace/version/deadline', async () => {
  const a = await open(),
    b = await open();
  expect(a.status === 'valid' && b.status === 'valid').toBe(true);
  expect(
    typeof a.render_handle === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(a.render_handle),
  ).toBe(true);
  expect(a.render_handle !== b.render_handle).toBe(true);
  const [r] =
    await db`select workspace_id,link_id,version_id,expires_at<=created_at+interval '5 minutes' as bounded from app_private.branding_render_handles where handle_hash=${hash(a.render_handle)}`;
  expect(
    r!.workspace_id === f.wsA.id &&
      r!.link_id === f.linkId &&
      r!.version_id === f.versionId &&
      r!.bounded,
  ).toBe(true);
});
it('T045 concurrent opens obey active cap without invalidating a valid F10 link', async () => {
  const results = await Promise.all(Array.from({ length: 16 }, () => open()));
  expect(results.every((r) => r.status === 'valid')).toBe(true);
  const [r] =
    await db`select count(*)::int as n from app_private.branding_render_handles where link_id=${f.linkId} and expires_at>now()`;
  expect(r!.n).toBe(8);
});
it('T045 rate history survives expiry cleanup; expiry cleanup is bounded and preserves F10 opened_at', async () => {
  await db`update app_private.branding_render_handles set expires_at=now()-interval '1 second' where link_id=${f.linkId}`;
  // Expire each issuance so the active cap cannot mask a missing rate cap.
  for (let i = 0; i < 40; i++) {
    await db`update app_private.branding_render_handles set expires_at=now()-interval '1 second' where link_id=${f.linkId}`;
    await open();
  }
  const [rate] =
    await db`select count(*)::int as n from app_private.branding_render_handles where link_id=${f.linkId} and created_at>now()-interval '5 minutes'`;
  expect(rate!.n).toBe(30);
  expect((await open()).render_handle === undefined).toBe(true);
  const [before] =
    await db`select opened_at from public.registration_links where id=${f.linkId}`;
  await db`update app_private.branding_render_handles set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' where link_id=${f.linkId}`;
  expect((await open()).status).toBe('valid');
  const [after] =
    await db`select opened_at from public.registration_links where id=${f.linkId}`;
  expect(+after!.opened_at === +before!.opened_at).toBe(true);
  const [expired] =
    await db`select count(*)::int as n from app_private.branding_render_handles where link_id=${f.linkId} and expires_at<now()`;
  expect(expired!.n).toBe(0);
});
it('T045 operator cleanup is bounded and unavailable to API roles; nonexistent workspaces fail FK', async () => {
  for (let i = 0; i < 10; i++)
    await db`insert into app_private.branding_render_handles(handle_hash,workspace_id,link_id,version_id,created_at,expires_at) values(${hash(opaque())},${f.wsA.id},${f.linkId},${f.versionId},now()-interval '6 minutes',now()-interval '1 minute')`;
  const [r] =
    await db`select app_private.branding_render_handles_cleanup(3) as n`;
  expect(r!.n).toBe(3);
  const [acl] =
    await db`select has_function_privilege('anon','app_private.branding_render_handles_cleanup(integer)','EXECUTE') as allowed`;
  expect(acl!.allowed).toBe(false);
  await expect(
    db`insert into app_private.branding_published_versions(workspace_id) values('00000000-0000-0000-0000-000000000000')`,
  ).rejects.toMatchObject({ code: '23503' });
});
it('T045 invalid output is byte-identical and publication replacement produces a new binding', async () => {
  for (const token of ['bad', null]) {
    const r = await anonClient().rpc('registration_link_open', { token });
    expect(JSON.stringify(r.data) === '{"status":"invalid"}').toBe(true);
  }
  const [v] =
    await db`insert into app_private.branding_published_versions(workspace_id) values(${f.wsA.id}) returning id`;
  await db`update app_private.branding_current_publications set version_id=${v!.id} where workspace_id=${f.wsA.id}`;
  const a = await open();
  const [r] =
    await db`select version_id from app_private.branding_render_handles where handle_hash=${hash(a.render_handle)}`;
  expect(r!.version_id === v!.id).toBe(true);
});
