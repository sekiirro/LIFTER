import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { createPublishedBannerFixture } from './branding-banner-fixture';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
let cleanup: (() => Promise<void>) | null = null;

beforeEach(async () => {
  fixture = await twoWorkspaceFixture();
});

afterAll(async () => {
  await db.end();
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

it('keeps every current F11/F12 audit mapping in the live trigger function', async () => {
  const [row] = await db<{ body: string }[]>`
    select pg_get_functiondef('app_private.audit_row_change()'::regprocedure) as body
  `;
  const body = row!.body.toLowerCase();
  const mappings = [
    ['public', 'workspaces', 1],
    ['public', 'staff_profiles', 1],
    ['public', 'workspace_memberships', 1],
    ['public', 'recovery_link_issuances', 1],
    ['public', 'packages', 1],
    ['public', 'package_versions', 1],
    ['public', 'package_offers', 1],
    ['public', 'registration_links', 1],
    ['public', 'clients', 2],
    ['public', 'payment_events', 1],
    ['public', 'jobs', 1],
    ['app_private', 'branding_published_versions', 1],
  ] as const;

  for (const [schema, table, expectedCount] of mappings) {
    const escaped = `tg_table_schema\\s*=\\s*'${schema}'\\s+and\\s+tg_table_name\\s*=\\s*'${table}'`;
    const count = [...body.matchAll(new RegExp(escaped, 'g'))].length;
    expect(count, `${schema}.${table} audit branch count`).toBe(expectedCount);
  }
});

it('preserves the final main audit mapper body byte-for-byte before the F14 branch', async () => {
  const mainSource = readFileSync(
    'supabase/migrations/20261101120000_registration_approval_model.sql',
    'utf8',
  );
  const mainFunction = mainSource.slice(
    mainSource.indexOf(
      'create or replace function app_private.audit_row_change()',
    ),
    mainSource.indexOf('alter function app_private.audit_row_change()'),
  );
  const [live] = await db<{ body: string }[]>`
    select pg_get_functiondef('app_private.audit_row_change()'::regprocedure) as body
  `;
  const f14BranchRemoved = live!.body.replace(
    /  -- F14 publication event extension begin[\s\S]*?  -- F14 publication event extension end\n/,
    '',
  );
  const legacyBranch = (body: string) => {
    const start = body.indexOf('  if tg_table_schema');
    return body
      .slice(
        start,
        body.indexOf("  else\n    raise exception 'No audit mapping"),
      )
      .trim();
  };
  const mainBody = mainFunction.slice(
    mainFunction.indexOf('  if tg_table_schema'),
    mainFunction.indexOf("  else\n    raise exception 'No audit mapping"),
  );
  expect(legacyBranch(f14BranchRemoved)).toBe(mainBody.trim());
});

it('stores branding audit metadata without URLs, tokens, bytes, or authored text', async () => {
  const published = await createPublishedBannerFixture();
  cleanup = published.cleanup;

  const [event] = await db<{ details: Record<string, unknown> }[]>`
    select details from public.audit_events
    where workspace_id=${published.wsA.id} and action='branding.published'
  `;
  expect(Object.keys(event!.details)).toEqual(['sequence']);
  const serialized = JSON.stringify(event!.details);
  for (const forbidden of [
    'Elite Center',
    'Blue banner',
    published.validatedPath,
    published.processed.contentHash,
    'branding-validated',
    String(published.processed.bytes.byteLength),
    'token',
    'http',
  ])
    expect(serialized).not.toContain(forbidden);
});

it('keeps audit rows detached from collectible targets and immutable', async () => {
  const target = randomUUID();
  const [inserted] = await db<{ id: number }[]>`
    insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'branding.published','branding_published_versions',${target},${fixture.wsA.id},'{}')
    returning id::int as id
  `;
  const targetForeignKeys = await db<{ count: number }[]>`
    select count(*)::int as count
    from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.audit_events'::regclass and c.contype='f' and a.attname='target_id'
  `;
  expect(targetForeignKeys[0]?.count).toBe(0);
  expect(inserted?.id).toBeGreaterThan(0);

  await expect(
    db`update public.audit_events set details='{}' where id=${inserted!.id}`,
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db`delete from public.audit_events where id=${inserted!.id}`,
  ).rejects.toMatchObject({ code: '23514' });
  expect(
    await db`select id,target_id from public.audit_events where id=${inserted!.id}`,
  ).toEqual([{ id: String(inserted!.id), target_id: target }]);
});
