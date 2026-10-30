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
