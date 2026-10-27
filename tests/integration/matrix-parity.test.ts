import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorize, type Actor } from '../../lib/auth/authorize';
import {
  CAPABILITIES,
  ROLES,
  roleHasCapability,
} from '../../lib/auth/capabilities';
import { createStaff, sql, twoWorkspaceFixture } from './harness';

const db = sql();
afterAll(async () => {
  await db.end();
});

for (const role of ROLES) {
  for (const capability of [...CAPABILITIES, 'unknown', 'toString']) {
    it(`T010 parity: ${role} / ${capability}`, async () => {
      const [row] =
        await db`select app_private.role_has_capability(${role}::public.staff_role, ${capability}) as allowed`;
      expect(row?.allowed).toBe(roleHasCapability(role, capability));
    });
  }
}

it('null role denies every known capability', async () => {
  for (const capability of CAPABILITIES) {
    const [row] =
      await db`select app_private.role_has_capability(null::public.staff_role, ${capability}) as allowed`;
    expect(row?.allowed).toBe(false);
  }
});

describe('has_workspace_access parity', () => {
  let f: Awaited<ReturnType<typeof twoWorkspaceFixture>>;
  const identities = [
    'po',
    'woA',
    'trainerA',
    'salesA',
    'trainerB',
    'noProfile',
  ] as const;
  let actors: Record<(typeof identities)[number], Actor>;

  beforeAll(async () => {
    f = await twoWorkspaceFixture();
    const noProfile = await createStaff(null, 'parity-no-profile');
    actors = {
      po: {
        userId: f.po.userId,
        role: 'platform_owner',
        activeWorkspaceIds: [],
      },
      woA: {
        userId: f.woA.userId,
        role: 'workspace_owner',
        activeWorkspaceIds: [f.wsA.id],
      },
      trainerA: {
        userId: f.trainerA.userId,
        role: 'trainer',
        activeWorkspaceIds: [f.wsA.id],
      },
      salesA: {
        userId: f.salesA.userId,
        role: 'sales',
        activeWorkspaceIds: [f.wsA.id],
      },
      trainerB: {
        userId: f.trainerB.userId,
        role: 'trainer',
        activeWorkspaceIds: [f.wsB.id],
      },
      noProfile: {
        userId: noProfile.userId,
        role: null,
        activeWorkspaceIds: [],
      },
    };
  });

  for (const identity of identities) {
    for (const workspace of ['wsA', 'wsB'] as const) {
      for (const capability of [...CAPABILITIES, 'typo_capability', null]) {
        it(`${identity} / ${workspace} / ${capability}`, async () => {
          const actor = actors[identity];
          const workspaceId = f[workspace].id;
          // Null asks only for workspace access; authorize requires a capability.
          const expected =
            capability === null
              ? actor.role !== null &&
                (actor.role === 'platform_owner' ||
                  actor.activeWorkspaceIds.includes(workspaceId))
              : authorize(actor, capability, workspaceId);

          await db.begin(async (tx) => {
            await tx`select set_config('role', 'authenticated', true)`;
            await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor.userId, role: 'authenticated' })}, true)`;
            const [row] =
              await tx`select app_private.has_workspace_access(${workspaceId}::uuid, ${capability}::text) as allowed`;
            expect(row?.allowed).toBe(expected);
            if (identity === 'po' && capability === 'typo_capability') {
              expect(row?.allowed).toBe(false);
            }
          });
        });
      }
    }
  }
});

describe('package operation parity', () => {
  it('pricing and registration scope match app/DB for active, revoked, null-role and membership-free PO', async () => {
    const { packagesFixture, createSynthetic, publish, publishedFixture } =
      await import('./packages-fixture');
    const fixture = await packagesFixture();
    const p = await publishedFixture(fixture);
    const canonical = await createSynthetic(fixture);
    for (const [name, identity] of Object.entries(fixture.actors)) {
      const role =
        name === 'po'
          ? 'platform_owner'
          : name.startsWith('wo')
            ? 'workspace_owner'
            : name.startsWith('sales') || name === 'revoked'
              ? 'sales'
              : name.startsWith('trainer')
                ? 'trainer'
                : null;
      const activeWorkspaceIds = name.endsWith('A')
        ? [fixture.wsA.id]
        : name.endsWith('B')
          ? [fixture.wsB.id]
          : [];
      const actor: Actor = {
        userId: identity.userId ?? '',
        role,
        activeWorkspaceIds,
      };
      for (const workspaceId of [fixture.wsA.id, fixture.wsB.id]) {
        for (const capability of [
          'set_package_pricing',
          'generate_registration_link',
        ])
          await db.begin(async (tx) => {
            await tx`select set_config('role',${name === 'anon' ? 'anon' : 'authenticated'},true)`;
            await tx`select set_config('request.jwt.claims',${JSON.stringify(identity.userId ? { sub: identity.userId, role: 'authenticated' } : { role: 'anon' })},true)`;
            if (name === 'anon') return; // Private helper has no anon EXECUTE; public RPC negatives below exercise it.
            const [row] =
              await tx`select app_private.has_workspace_access(${workspaceId}::uuid,${capability}) as allowed`;
            expect(row?.allowed).toBe(
              authorize(actor, capability, workspaceId),
            );
          });
        const write = await publish(
          fixture,
          canonical.id,
          { workspace_id: workspaceId },
          identity.client,
        );
        expect(write.error === null).toBe(
          authorize(actor, 'set_package_pricing', workspaceId),
        );
        const toggle = await identity.client.rpc(
          'set_package_offer_available',
          { workspace_id: workspaceId, offer_id: p.offer.id, available: false },
        );
        expect(toggle.error === null).toBe(
          authorize(actor, 'set_package_pricing', workspaceId) &&
            workspaceId === fixture.wsA.id,
        );
      }
    }
  });
});
