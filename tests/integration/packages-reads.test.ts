import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checked,
  createSynthetic,
  packagesFixture,
  publish,
  publishedFixture,
  sql,
  type PackagesFixture,
} from './packages-fixture';
const db = sql();
let f: PackagesFixture;
let a: Awaited<ReturnType<typeof publishedFixture>>;
let b: typeof a;
let unattached: Awaited<ReturnType<typeof createSynthetic>>;
beforeAll(async () => {
  f = await packagesFixture();
  a = await publishedFixture(f, { tier_rank: 1 });
  b = await publishedFixture(f, { tier_rank: 1, workspace_id: f.wsB.id });
  unattached = await createSynthetic(f);
  checked(
    await publish(f, a.id, {
      tier_rank: 1,
      price_minor: '9223372036854775807',
    }),
  );
});
afterAll(async () => {
  await db.end();
});
describe('scoped package reads and commission secrecy', () => {
  it('covers every identity x workspace on offers, safe/base versions, packages, rate RPC and audit', async () => {
    for (const [name, actor] of Object.entries(f.actors))
      for (const [workspace, p] of [
        [{ id: a.workspace_id }, a],
        [f.wsB, b],
      ] as const) {
        const allowed =
          name === 'po' ||
          (workspace.id === a.workspace_id
            ? ['woA', 'salesA', 'trainerA']
            : ['woB', 'salesB', 'trainerB']
          ).includes(name);
        const privileged = allowed && ['po', 'woA', 'woB'].includes(name);
        for (const [table, columns, filter, value] of [
          [
            'package_offers',
            'id,workspace_id,available',
            'workspace_id',
            workspace.id,
          ],
          [
            'package_versions_safe',
            'id,workspace_id,price_minor',
            'workspace_id',
            workspace.id,
          ],
          [
            'package_versions',
            'id,workspace_id,price_minor',
            'workspace_id',
            workspace.id,
          ],
          ['packages', 'id,code', 'id', p.id],
        ]) {
          const result = await actor.client
            .from(table as never)
            .select(columns as string)
            .eq(filter as string, value as string);
          if (name === 'anon') expect(result.error?.code).toBe('42501');
          else {
            expect(result.error, `${name}/${table}`).toBeNull();
            expect(
              (result.data ?? []).length > 0,
              `${name}/${table}/${workspace.id}`,
            ).toBe(allowed);
          }
        }
        const rates = await actor.client.rpc(
          'get_package_version_commissions',
          { workspace_id: workspace.id },
        );
        if (privileged) {
          expect(rates.error).toBeNull();
          expect(
            rates.data?.some(
              (r: { version_id: string }) => r.version_id === p.versionId,
            ),
          ).toBe(true);
        } else expect(rates.error?.code, `${name}/rates`).toBe('42501');
        const audit = await actor.client
          .from('audit_events')
          .select('details')
          .eq('target_id', p.versionId);
        if (name === 'anon') expect(audit.error?.code).toBe('42501');
        else {
          expect(audit.error).toBeNull();
          expect((audit.data ?? []).length > 0, `${name}/audit`).toBe(
            privileged,
          );
        }
      }
  });
  it('PO sees unattached identity, foreign-only identity hidden from own staff', async () => {
    expect(
      checked(
        await f.po.client.from('packages').select('id').eq('id', unattached.id),
      ),
    ).toHaveLength(1);
    for (const actor of [f.woA, f.salesA, f.trainerA]) {
      expect(
        checked(
          await actor.client
            .from('packages')
            .select('id')
            .in('id', [b.id, unattached.id]),
        ),
      ).toEqual([]);
    }
  });
  it('retains unavailable and historical rows and exact text above 2^53', async () => {
    const versions = checked(
      await f.salesA.client
        .from('package_versions_safe')
        .select('id,price_minor')
        .eq('offer_id', a.offer.id),
    );
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.price_minor).sort()).toEqual([
      '9007199254740993',
      '9223372036854775807',
    ]);
    expect(
      checked(
        await f.salesA.client
          .from('package_offers')
          .select('available')
          .eq('id', a.offer.id),
      ),
    ).toEqual([{ available: false }]);
  });
  it('explicit, wildcard, embedded commission requests fail for every authenticated SQL role', async () => {
    for (const actor of Object.values(f.actors))
      for (const projection of ['commission_rate_bp', '*']) {
        const result = await actor.client
          .from('package_versions')
          .select(projection)
          .eq('offer_id', a.offer.id);
        expect(result.error?.code).toBe('42501');
      }
    for (const actor of [f.salesA, f.trainerA]) {
      const result = await actor.client
        .from('package_offers')
        .select(
          'id,package_versions!package_versions_workspace_id_offer_id_fkey(commission_rate_bp)',
        )
        .eq('id', a.offer.id);
      expect(result.error?.code).toBe('42501');
    }
  });
  it('embedded safe relations never expose foreign offers', async () => {
    const result = checked(
      await f.salesA.client
        .from('packages')
        .select(
          'id,package_offers!package_offers_package_id_fkey(id,workspace_id)',
        )
        .in('id', [a.id, b.id]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(a.id);
    expect(
      result[0]?.package_offers.every(
        (o: { workspace_id: string }) => o.workspace_id === a.workspace_id,
      ),
    ).toBe(true);
  });
  it('denies unknown commission workspace generically', async () =>
    expect(
      (
        await f.po.client.rpc('get_package_version_commissions', {
          workspace_id: randomUUID(),
        })
      ).error,
    ).toMatchObject({ code: '42501', message: 'not_permitted' }));
  it('every API role has no direct mutation grants, including service_role', async () => {
    for (const role of ['anon', 'authenticated', 'service_role'])
      for (const table of ['packages', 'package_offers', 'package_versions'])
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          const [row] =
            await db`select has_table_privilege(${role},${`public.${table}`},${privilege}) as allowed`;
          expect(row?.allowed).toBe(false);
        }
    for (const actor of Object.values(f.actors)) {
      expect(
        (
          await actor.client
            .from('packages')
            .insert({ code: `test-pkg-${randomUUID()}` })
        ).error?.code,
      ).toBe('42501');
      expect(
        (
          await actor.client
            .from('package_offers')
            .update({ available: true })
            .eq('id', a.offer.id)
        ).error?.code,
      ).toBe('42501');
      expect(
        (
          await actor.client
            .from('package_versions')
            .delete()
            .eq('id', a.versionId)
        ).error?.code,
      ).toBe('42501');
    }
  });
});
