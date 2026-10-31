import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

function fields(name: string) {
  return {
    name: { ar: '', en: name },
    bannerAlt: { ar: '', en: '' },
    color: '#2563EB',
    logo: null,
    banner: null,
  };
}

beforeEach(async () => {
  fixture = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
});

it('serializes concurrent publication and emits exactly one event for a changed snapshot', async () => {
  const saved = await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('First publication'),
  });
  expect(saved.error).toBeNull();

  const results = await Promise.all(
    [1, 2].map(() =>
      fixture.po.client.rpc('branding_publish', {
        workspace_id: fixture.wsA.id,
        expected_revision: 1,
      }),
    ),
  );
  expect(results.map(({ error }) => error)).toEqual([null, null]);
  expect(results[0]?.data).toBe(results[1]?.data);

  const versions = await db<{ id: string }[]>`
    select id from app_private.branding_published_versions
    where workspace_id=${fixture.wsA.id}
  `;
  const events = await db<
    { action: string; target_id: string; details: object }[]
  >`
    select action,target_id,details from public.audit_events
    where workspace_id=${fixture.wsA.id} and action='branding.published'
  `;
  expect(versions).toEqual([{ id: results[0]!.data }]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    action: 'branding.published',
    target_id: results[0]!.data,
  });
  const details = events[0]?.details as {
    sequence: number;
  };
  expect(details).toEqual({ sequence: 1 });
});

it('rejects stale publication and leaves no version or audit event', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Revision one'),
  });
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
    fields: fields('Revision two'),
  });

  const stale = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(stale.error?.code).toBe('40001');
  expect(
    await db`select 1 from app_private.branding_published_versions where workspace_id=${fixture.wsA.id}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from public.audit_events where workspace_id=${fixture.wsA.id} and action='branding.published'`,
  ).toHaveLength(0);
});

it('does not append an audit event for an unchanged publication', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Unchanged'),
  });
  const first = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(first.error).toBeNull();
  const before =
    await db`select id from public.audit_events where workspace_id=${fixture.wsA.id} and action='branding.published'`;

  const unchanged = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });

  expect(unchanged.error).toBeNull();
  expect(unchanged.data).toBe(first.data);
  expect(
    await db`select id from public.audit_events where workspace_id=${fixture.wsA.id} and action='branding.published'`,
  ).toEqual(before);
});

it('retains only the current version after a text-only republish', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Text publication one'),
  });
  const first = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(first.error).toBeNull();

  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
    fields: fields('Text publication two'),
  });
  const second = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
  });
  expect(second.error).toBeNull();

  const versions = await db<{ id: string; sequence: string }[]>`
    select id,sequence from app_private.branding_published_versions
    where workspace_id=${fixture.wsA.id} order by sequence
  `;
  expect(versions).toEqual([{ id: second.data, sequence: '2' }]);
  expect(
    await db<{ version_id: string }[]>`
      select version_id from app_private.branding_current_publications
      where workspace_id=${fixture.wsA.id}
    `,
  ).toEqual([{ version_id: second.data }]);
  const auditTargets = await db<{ target_id: string }[]>`
    select target_id from public.audit_events
    where workspace_id=${fixture.wsA.id} and action='branding.published'
  `;
  expect(auditTargets.map(({ target_id }) => target_id).sort()).toEqual(
    [first.data, second.data].sort(),
  );
});

it('keeps superseded versions with assets and removes orphaned assetless versions', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Asset-backed publication'),
  });
  const first = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(first.error).toBeNull();

  await db`
    insert into app_private.branding_published_assets(
      workspace_id,version_id,slot,bucket_id,object_name,content_type,byte_size
    ) values(
      ${fixture.wsA.id},${first.data},'logo','branding-validated',
      ${`${fixture.wsA.id}/${'a'.repeat(64)}.png`},'image/png',32
    )
  `;
  const orphanId = randomUUID();
  await db`
    insert into app_private.branding_published_versions(
      workspace_id,id,sequence,fields,published_by
    ) values(
      ${fixture.wsA.id},${orphanId},2,${db.json(fields('Orphaned snapshot'))},
      ${fixture.po.userId}
    )
  `;

  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
    fields: fields('New current publication'),
  });
  const second = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
  });
  expect(second.error).toBeNull();

  const versions = await db<{ id: string }[]>`
    select id from app_private.branding_published_versions
    where workspace_id=${fixture.wsA.id} order by sequence
  `;
  expect(versions).toEqual([{ id: first.data }, { id: second.data }]);
  expect(
    await db`select 1 from app_private.branding_published_versions where id=${orphanId}`,
  ).toHaveLength(0);
  expect(
    await db`select 1 from app_private.branding_published_assets where version_id=${first.data}`,
  ).toHaveLength(1);
});

it('allows publication when the workspace has only an expired GC claim', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Expired claim publish'),
  });
  await db`insert into app_private.branding_gc_claims(workspace_id,bucket_id,object_name,lease_until)
    values(${fixture.wsA.id},'branding-validated',${`${fixture.wsA.id}/validated/logo/${'a'.repeat(64)}.png`},statement_timestamp()-interval '1 second')`;

  const result = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });

  expect(result.error).toBeNull();
  expect(result.data).toBeTruthy();
});

it('rejects a banner publication without usable alternate text', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Missing banner alt'),
  });
  await db`update app_private.branding_drafts set fields=fields || jsonb_build_object('banner',
    jsonb_build_object('bucket','branding-validated'::text,'object',${`${fixture.wsA.id}/validated/banner/${'b'.repeat(64)}.png`}::text,
      'content_type','image/png'::text,'byte_size',32)) where workspace_id=${fixture.wsA.id}`;

  const result = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });

  expect(result.error?.code).toBe('22023');
  expect(
    await db`select 1 from app_private.branding_published_versions where workspace_id=${fixture.wsA.id}`,
  ).toHaveLength(0);
});

it('copies a single banner alt locale into the published fallback locale', async () => {
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: {
      ...fields('Banner alt fallback'),
      bannerAlt: { ar: '', en: 'Published banner' },
    },
  });
  await db`update app_private.branding_drafts set fields=fields || jsonb_build_object('banner',
    jsonb_build_object('bucket','branding-validated'::text,'object',${`${fixture.wsA.id}/validated/banner/${'c'.repeat(64)}.png`}::text,
      'content_type','image/png'::text,'byte_size',32)) where workspace_id=${fixture.wsA.id}`;

  const result = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(result.error).toBeNull();
  const published = await db<
    { fields: { bannerAlt: { ar: string; en: string } } }[]
  >`
    select fields from app_private.branding_published_versions where workspace_id=${fixture.wsA.id}`;
  expect(published[0]?.fields.bannerAlt).toEqual({
    ar: 'Published banner',
    en: 'Published banner',
  });
});

it('rolls back the version, current pointer, and event when audit insertion fails', async () => {
  const failFunction = `branding_test_fail_audit_${randomUUID().replaceAll('-', '')}`;
  const failTrigger = `branding_test_fail_audit_${randomUUID().replaceAll('-', '')}`;
  await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: fields('Rollback test'),
  });
  await db.unsafe(
    `create function app_private.${failFunction}() returns trigger language plpgsql set search_path='' as $$ begin if new.workspace_id = '${fixture.wsA.id}'::uuid and new.action = 'branding.published' then raise exception 'injected audit failure'; end if; return new; end $$`,
  );
  await db.unsafe(
    `create trigger ${failTrigger} before insert on public.audit_events for each row execute function app_private.${failFunction}()`,
  );
  try {
    const failed = await fixture.po.client.rpc('branding_publish', {
      workspace_id: fixture.wsA.id,
      expected_revision: 1,
    });
    expect(failed.error).not.toBeNull();
    expect(
      await db`select 1 from app_private.branding_published_versions where workspace_id=${fixture.wsA.id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from app_private.branding_current_publications where workspace_id=${fixture.wsA.id}`,
    ).toHaveLength(0);
    expect(
      await db`select 1 from public.audit_events where workspace_id=${fixture.wsA.id} and action='branding.published'`,
    ).toHaveLength(0);
  } finally {
    await db.unsafe(
      `drop trigger if exists ${failTrigger} on public.audit_events`,
    );
    await db.unsafe(`drop function if exists app_private.${failFunction}()`);
  }
});
