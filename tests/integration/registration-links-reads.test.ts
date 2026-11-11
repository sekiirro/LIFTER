import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  registrationFixture,
  issue,
  checked,
  sql,
  schedule,
  publish,
  crossWorkspaceOffer,
  type RegistrationFixture,
} from './registration-links-fixture';
let f: RegistrationFixture;
let id: string;
const db = sql();
beforeAll(async () => {
  f = await registrationFixture();
  id = checked(
    await issue(f, f.salesA.client, { installments: schedule }),
  ) as string;
});
afterAll(() => db.end());
for (const role of [
  'po',
  'woA',
  'salesA',
  'trainerA',
  'woB',
  'salesB',
  'trainerB',
  'revoked',
  'noProfile',
  'client',
  'anon',
] as const) {
  it(`safe reads and secret-column denial ${role}`, async () => {
    const client = f.actors[role].client;
    const r = await client
      .from('registration_links_safe')
      .select('id,price_minor')
      .eq('id', id);
    if (role === 'anon') expect(r.error).not.toBeNull();
    else {
      expect(r.error).toBeNull();
      expect(r.data).toEqual(
        ['po', 'woA', 'salesA', 'trainerA'].includes(role)
          ? [{ id, price_minor: '1200' }]
          : [],
      );
    }
    for (const column of ['token_hash', 'commission_rate_bp', '*'])
      expect(
        (await client.from('registration_links').select(column)).error,
      ).not.toBeNull();
    expect(
      (
        await client
          .from('registration_links')
          .insert({ workspace_id: f.wsA.id })
      ).error,
    ).not.toBeNull();
    for (const table of [
      'registration_links',
      'registration_link_installments',
    ]) {
      expect(
        (
          await client
            .from(table)
            .update(
              table === 'registration_links'
                ? { price_minor: '1300' }
                : { amount_minor: '1300' },
            )
            .eq('workspace_id', f.wsA.id)
        ).error,
      ).not.toBeNull();
      expect(
        (await client.from(table).delete().eq('workspace_id', f.wsA.id)).error,
      ).not.toBeNull();
    }
    const children = await client
      .from('registration_link_installments_safe')
      .select('seq,amount_minor')
      .eq('link_id', id)
      .order('seq');
    if (role === 'anon') expect(children.error).not.toBeNull();
    else {
      expect(children.error).toBeNull();
      expect(children.data).toEqual(
        ['po', 'woA', 'salesA', 'trainerA'].includes(role)
          ? [
              { seq: 1, amount_minor: '400' },
              { seq: 2, amount_minor: '800' },
            ]
          : [],
      );
    }
    for (const projection of [
      'registration_links(token_hash)',
      'registration_links(commission_rate_bp)',
    ])
      expect(
        (await client.from('registration_link_installments').select(projection))
          .error,
      ).not.toBeNull();
    const rate = await client.rpc('get_registration_link_commissions', {
      workspace_id: f.wsA.id,
    });
    if (['po', 'woA'].includes(role)) {
      expect(rate.error).toBeNull();
      expect(rate.data).toEqual([{ link_id: id, commission_rate_bp: 17 }]);
    } else expect(rate.error).not.toBeNull();
  });
}
it('secret SELECT grants absent at the column level', async () => {
  for (const column of ['token_hash', 'commission_rate_bp']) {
    const [r] =
      await db`select has_column_privilege('authenticated','public.registration_links',${column},'SELECT') as allowed`;
    expect(r!.allowed).toBe(false);
  }
});
it('foreign workspace links are visible only within their scope', async () => {
  const foreign = await crossWorkspaceOffer(f),
    foreignId = checked(
      await issue(f, f.po.client, {
        workspace_id: f.wsB.id,
        package_version_id: foreign.versionId,
      }),
    ) as string;
  for (const name of [
    'po',
    'woA',
    'salesA',
    'trainerA',
    'woB',
    'salesB',
    'trainerB',
    'revoked',
    'noProfile',
    'client',
    'anon',
  ] as const) {
    const result = await f.actors[name].client
      .from('registration_links_safe')
      .select('id')
      .eq('id', foreignId);
    if (name === 'anon') expect(result.error).not.toBeNull();
    else
      expect(result.data).toEqual(
        ['po', 'woB', 'salesB', 'trainerB'].includes(name)
          ? [{ id: foreignId }]
          : [],
      );
  }
});
it('embedded child and version joins traverse safe views without secrets', async () => {
  const result = await f.po.client
    .from('registration_links_safe')
    .select(
      'id,price_minor,package_version_id,registration_link_installments_safe(seq,amount_minor,due_offset_days),package_versions_safe(id,price_minor,duration_days)',
    )
    .eq('id', id)
    .single();
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    id,
    price_minor: '1200',
    package_version_id: f.p.versionId,
    registration_link_installments_safe: [
      { seq: 1, amount_minor: '400', due_offset_days: 2 },
      { seq: 2, amount_minor: '800', due_offset_days: 12 },
    ],
    package_versions_safe: {
      id: f.p.versionId,
      price_minor: '1200',
      duration_days: 61,
    },
  });
  const serialized = JSON.stringify(result.data);
  expect(serialized).not.toContain('token_hash');
  expect(serialized).not.toContain('commission_rate_bp');
});
it('PO/WO commission reads are scoped and every other role is denied', async () => {
  const own = await registrationFixture(),
    ownLink = checked(await issue(own, own.salesA.client)) as string;
  const foreign = await crossWorkspaceOffer(own),
    foreignId = checked(
      await issue(own, own.po.client, {
        workspace_id: own.wsB.id,
        package_version_id: foreign.versionId,
      }),
    ) as string;
  const expected: Record<string, { workspace: 'A' | 'B'; ids: string[] }> = {
    po: { workspace: 'A', ids: [ownLink] },
    woA: { workspace: 'A', ids: [ownLink] },
    woB: { workspace: 'B', ids: [foreignId] },
  };
  for (const [name, client] of [
    ['po', own.actors.po.client],
    ['woA', own.actors.woA.client],
    ['woB', own.actors.woB.client],
  ] as const) {
    const scope = expected[name]!;
    const result = await client.rpc('get_registration_link_commissions', {
      workspace_id: scope.workspace === 'A' ? own.wsA.id : own.wsB.id,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual(
      scope.ids.map((link_id) => ({ link_id, commission_rate_bp: 17 })),
    );
  }
  expect(
    (
      await own.actors.po.client.rpc('get_registration_link_commissions', {
        workspace_id: own.wsA.id,
      })
    ).data,
  ).not.toEqual(
    expect.arrayContaining([{ link_id: foreignId, commission_rate_bp: 17 }]),
  );
  for (const name of [
    'salesA',
    'trainerA',
    'salesB',
    'trainerB',
    'revoked',
    'noProfile',
    'client',
    'anon',
  ] as const)
    expect(
      (
        await own.actors[name].client.rpc('get_registration_link_commissions', {
          workspace_id: own.wsA.id,
        })
      ).error,
    ).not.toBeNull();
});
it('Sales/Trainer cannot read registration audit details', async () => {
  for (const name of ['salesA', 'trainerA'] as const) {
    const result = await f.actors[name].client
      .from('audit_events')
      .select('*')
      .eq('target_id', id);
    expect(result.data ?? []).toEqual([]);
    if (result.error) expect(result.error.code).toBe('42501');
  }
  const poEvents = checked(
    await f.actors.po.client
      .from('audit_events')
      .select('details')
      .eq('target_id', id),
  );
  expect(JSON.stringify(poEvents)).not.toMatch(/commission|token|hash/);
});
it('safe views preserve text amounts above 2^53 and old terms after publish/disable', async () => {
  const fresh = await registrationFixture(),
    amount = '9007199254740993';
  const version = checked(
    await publish(fresh, fresh.p.id, { tier_rank: 1, price_minor: amount }),
  );
  const oldId = checked(
    await issue(fresh, fresh.salesA.client, {
      package_version_id: version,
      installments: [{ seq: 1, amount_minor: amount, due_offset_days: 2 }],
    }),
  ) as string;
  checked(
    await publish(fresh, fresh.p.id, { tier_rank: 1, price_minor: '1300' }),
  );
  checked(
    await fresh.po.client.rpc('set_package_offer_available', {
      workspace_id: fresh.wsA.id,
      offer_id: fresh.p.offer.id,
      available: false,
    }),
  );
  expect(
    checked(
      await fresh.salesA.client
        .from('registration_links_safe')
        .select('price_minor,package_version_id')
        .eq('id', oldId)
        .single(),
    ),
  ).toEqual({ price_minor: amount, package_version_id: version });
  expect(
    checked(
      await fresh.salesA.client
        .from('registration_link_installments_safe')
        .select('amount_minor')
        .eq('link_id', oldId)
        .single(),
    ),
  ).toEqual({ amount_minor: amount });
  expect(
    checked(
      await fresh.salesA.client
        .from('package_versions_safe')
        .select('id,price_minor')
        .eq('id', version)
        .single(),
    ),
  ).toEqual({ id: version, price_minor: amount });
});
it('safe views expose no write surface', async () => {
  for (const table of [
    'registration_links_safe',
    'registration_link_installments_safe',
  ]) {
    expect(
      (
        await f.po.client
          .from(table)
          .update({ currency: 'XXX' })
          .eq('workspace_id', f.wsA.id)
      ).error,
    ).not.toBeNull();
    expect(
      (await f.po.client.from(table).delete().eq('workspace_id', f.wsA.id))
        .error,
    ).not.toBeNull();
  }
});
