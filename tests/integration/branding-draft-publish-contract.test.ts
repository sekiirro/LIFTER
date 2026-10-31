import { afterAll, beforeEach, expect, it } from 'vitest';
import { sql, twoWorkspaceFixture } from './harness';

const db = sql();
let fixture: Awaited<ReturnType<typeof twoWorkspaceFixture>>;

function fields(name: string, color: string) {
  return {
    name: { ar: '', en: name },
    color,
    bannerAlt: { ar: '', en: '' },
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

it('uses persisted compare-and-set so only one save wins the same revision', async () => {
  const candidates = [
    fields('Concurrent one', '#123456'),
    fields('Concurrent two', '#654321'),
  ];
  const results = await Promise.all(
    candidates.map((value) =>
      fixture.woA.client.rpc('branding_draft_save', {
        workspace_id: fixture.wsA.id,
        expected_revision: 0,
        fields: value,
      }),
    ),
  );
  expect(results.filter((result) => result.error === null)).toHaveLength(1);
  expect(results.filter((result) => result.error !== null)).toHaveLength(1);

  const [draft] = await db<
    { revision: number; fields: Record<string, unknown> }[]
  >`
    select revision::int as revision,fields from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(draft?.revision).toBe(1);
  expect(candidates).toContainEqual(draft?.fields);
});

it('rejects missing or non-string localized draft identity before persistence', async () => {
  const invalid = [
    { color: '#123456', bannerAlt: { ar: '', en: '' } },
    {
      ...fields('Invalid Arabic', '#123456'),
      name: { ar: 7, en: 'Invalid Arabic' },
    },
    {
      ...fields('Invalid alt', '#123456'),
      bannerAlt: { ar: '', en: false },
    },
  ];
  for (const value of invalid) {
    const result = await fixture.woA.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: 0,
      fields: value,
    });
    expect(result.error).toBeTruthy();
  }
  const [draft] = await db<{ revision: number }[]>`
    select revision::int as revision from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(draft).toBeUndefined();
});

it('rejects drafts whose localized names are both blank at the persisted boundary', async () => {
  const [functionRow] = await db<{ body: string }[]>`
    select pg_get_functiondef(
      'app_private.branding_draft_save(uuid,bigint,jsonb)'::regprocedure
    ) as body
  `;
  expect(functionRow?.body).toContain("!~ '[^[:space:]]'");
  for (const names of [
    { ar: '', en: '' },
    { ar: '  ', en: '\t' },
  ]) {
    const result = await fixture.woA.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: 0,
      fields: {
        ...fields('ignored', '#123456'),
        name: names,
      },
    });
    expect(result.error).toBeTruthy();
  }
  const [draft] = await db<{ revision: number }[]>`
    select revision::int as revision from app_private.branding_drafts
    where workspace_id=${fixture.wsA.id}
  `;
  expect(draft).toBeUndefined();
});

it('applies the same 1000-character bound to persisted localized identity and banner alt text', async () => {
  for (const value of [
    fields('n'.repeat(1001), '#123456'),
    {
      ...fields('Invalid alt length', '#123456'),
      bannerAlt: { ar: '', en: 'a'.repeat(1001) },
    },
  ]) {
    const result = await fixture.woA.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: 0,
      fields: value,
    });
    expect(result.error).toBeTruthy();
  }
  const boundary = await fixture.woA.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 0,
    fields: {
      ...fields('n'.repeat(1000), '#123456'),
      bannerAlt: { ar: '', en: 'a'.repeat(1000) },
    },
  });
  expect(boundary.error).toBeNull();
});

it('publishes immutable per-workspace sequences and makes unchanged publication a no-op', async () => {
  const drafts = await Promise.all([
    fixture.po.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsA.id,
      expected_revision: 0,
      fields: fields('Workspace A', '#123456'),
    }),
    fixture.po.client.rpc('branding_draft_save', {
      workspace_id: fixture.wsB.id,
      expected_revision: 0,
      fields: fields('Workspace B', '#654321'),
    }),
  ]);
  expect(drafts.map((draft) => draft.error)).toEqual([null, null]);

  const [aFirst, bFirst] = await Promise.all([
    fixture.po.client.rpc('branding_publish', {
      workspace_id: fixture.wsA.id,
      expected_revision: 1,
    }),
    fixture.po.client.rpc('branding_publish', {
      workspace_id: fixture.wsB.id,
      expected_revision: 1,
    }),
  ]);
  expect(aFirst.error).toBeNull();
  expect(bFirst.error).toBeNull();

  const unchanged = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
  });
  expect(unchanged.error).toBeNull();
  expect(unchanged.data).toBe(aFirst.data);

  const changedDraft = await fixture.po.client.rpc('branding_draft_save', {
    workspace_id: fixture.wsA.id,
    expected_revision: 1,
    fields: fields('Workspace A changed', '#abcdef'),
  });
  expect(changedDraft.error).toBeNull();
  const aSecond = await fixture.po.client.rpc('branding_publish', {
    workspace_id: fixture.wsA.id,
    expected_revision: 2,
  });
  expect(aSecond.error).toBeNull();
  expect(aSecond.data).not.toBe(aFirst.data);

  const versions = await db<
    { workspace_id: string; id: string; sequence: number; name: string }[]
  >`
    select workspace_id,id,sequence::int as sequence,fields->'name'->>'en' as name
    from app_private.branding_published_versions
    where workspace_id in (${fixture.wsA.id},${fixture.wsB.id})
    order by workspace_id,sequence
  `;
  expect(
    versions.map(({ workspace_id, sequence }) => ({ workspace_id, sequence })),
  ).toEqual(
    [
      { workspace_id: fixture.wsA.id, sequence: 1 },
      { workspace_id: fixture.wsA.id, sequence: 2 },
      { workspace_id: fixture.wsB.id, sequence: 1 },
    ].sort(
      (left, right) =>
        left.workspace_id.localeCompare(right.workspace_id) ||
        left.sequence - right.sequence,
    ),
  );
  expect(
    versions.find(
      (version) =>
        version.workspace_id === fixture.wsA.id && version.sequence === 1,
    )?.name,
  ).toBe('Workspace A');
  expect(
    versions.find(
      (version) =>
        version.workspace_id === fixture.wsA.id && version.sequence === 2,
    )?.name,
  ).toBe('Workspace A changed');

  const current = await db<{ workspace_id: string; version_id: string }[]>`
    select workspace_id,version_id from app_private.branding_current_publications
    where workspace_id in (${fixture.wsA.id},${fixture.wsB.id})
    order by workspace_id
  `;
  expect(current).toEqual(
    [
      { workspace_id: fixture.wsA.id, version_id: aSecond.data },
      { workspace_id: fixture.wsB.id, version_id: bFirst.data },
    ].sort((left, right) =>
      left.workspace_id.localeCompare(right.workspace_id),
    ),
  );
});
