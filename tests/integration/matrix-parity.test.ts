import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorize, type Actor } from '../../lib/auth/authorize';
import {
  CAPABILITIES,
  MATRIX,
  ROLES,
  roleHasCapability,
} from '../../lib/auth/capabilities';
import { createStaff, sql, twoWorkspaceFixture } from './harness';
import {
  registrationFixture,
  crossWorkspaceOffer,
  issue,
  schedule,
  type RegistrationFixture,
} from './registration-links-fixture';

const db = sql();
// Catalog-derived candidates, never a second hand-maintained capability list.
// Evaluate literals across all roles: this excludes role names and other SQL
// strings while retaining capabilities that exist only in the SQL grant matrix.
const sources =
  await db`select prosrc from pg_proc where oid in ('app_private.role_has_capability(public.staff_role,text)'::regprocedure,'app_private.has_workspace_access(uuid,text)'::regprocedure)`;
const candidates = [
  ...new Set(
    sources.flatMap((row) =>
      [...(row.prosrc as string).matchAll(/'((?:''|[^'])*)'/g)].map((match) =>
        match[1]!.replaceAll("''", "'"),
      ),
    ),
  ),
];
const sqlCapabilities: string[] = [];
for (const candidate of candidates) {
  const rows =
    await db`select app_private.role_has_capability(r,${candidate}) as allowed from unnest(enum_range(null::public.staff_role)) r`;
  if (rows.some((row) => row.allowed)) sqlCapabilities.push(candidate);
}
// Include ungranted literals too: a has_workspace_access-only special case must
// be exercised even if role_has_capability would deny that literal.
const parityCapabilities = [
  ...new Set<string>([
    ...CAPABILITIES,
    ...sqlCapabilities,
    ...candidates,
    'unknown',
    'toString',
  ]),
];
it('bidirectional catalog capability names equal TypeScript exactly', () => {
  expect([...sqlCapabilities].sort()).toEqual([...CAPABILITIES].sort());
});
afterAll(async () => {
  await db.end();
});

describe('registration RPC/app two-capability parity', () => {
  let fixture: RegistrationFixture;
  beforeAll(async () => {
    fixture = await registrationFixture();
  });
  for (const name of [
    'po',
    'woA',
    'salesA',
    'trainerA',
    'trainerB',
    'revoked',
    'noProfile',
  ] as const)
    for (const present of [false, true])
      it(`${name} schedule ${present}`, async () => {
        const identity = fixture.actors[name];
        const roles = {
          po: 'platform_owner',
          woA: 'workspace_owner',
          salesA: 'sales',
          trainerA: 'trainer',
          trainerB: 'trainer',
          revoked: 'sales',
          noProfile: null,
        } as const;
        const actor: Actor = {
          userId: identity.userId!,
          role: roles[name],
          activeWorkspaceIds: ['woA', 'salesA', 'trainerA'].includes(name)
            ? [fixture.wsA.id]
            : name === 'trainerB'
              ? [fixture.wsB.id]
              : [],
        };
        const allowed =
          authorize(actor, 'generate_registration_link', fixture.wsA.id) &&
          (!present ||
            authorize(actor, 'configure_installment_schedule', fixture.wsA.id));
        const result = await issue(fixture, identity.client, {
          installments: present ? schedule : null,
        });
        expect(result.error?.code ?? null).toBe(allowed ? null : '42501');
      });
});

describe('registration read and commission parity', () => {
  let fixture: RegistrationFixture;
  let foreignVersionId: string;
  let linkA: string;
  let linkB: string;
  const names = [
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
  ] as const;
  const roleOf = (name: (typeof names)[number]) =>
    name === 'po'
      ? 'platform_owner'
      : name.startsWith('wo')
        ? 'workspace_owner'
        : name.startsWith('sales') || name === 'revoked'
          ? 'sales'
          : name.startsWith('trainer')
            ? 'trainer'
            : null;
  beforeAll(async () => {
    fixture = await registrationFixture();
    linkA = checkedIssue(
      await issue(fixture, fixture.salesA.client, { installments: schedule }),
    );
    const foreign = await crossWorkspaceOffer(fixture);
    foreignVersionId = foreign.versionId;
    linkB = checkedIssue(
      await issue(fixture, fixture.po.client, {
        workspace_id: fixture.wsB.id,
        package_version_id: foreign.versionId,
      }),
    );
  });
  function checkedIssue(result: {
    data: unknown;
    error: { message: string } | null;
  }) {
    if (result.error) throw new Error(result.error.message);
    return result.data as string;
  }
  for (const name of names)
    for (const workspace of ['A', 'B'] as const)
      it(`${name} / ${workspace}: safe reads and commission gate match authorize()`, async () => {
        const identity = fixture.actors[name],
          workspaceId = workspace === 'A' ? fixture.wsA.id : fixture.wsB.id,
          actor: Actor = {
            userId: identity.userId ?? '',
            role: roleOf(name),
            activeWorkspaceIds: name.endsWith('A')
              ? [fixture.wsA.id]
              : name.endsWith('B')
                ? [fixture.wsB.id]
                : [],
          };
        const canRead = authorize(
          actor,
          'generate_registration_link',
          workspaceId,
        );
        const expectedLink = workspace === 'A' ? linkA : linkB;
        const read = await identity.client
          .from('registration_links_safe')
          .select('id')
          .eq('workspace_id', workspaceId);
        if (name === 'anon') expect(read.error).not.toBeNull();
        else expect(read.data).toEqual(canRead ? [{ id: expectedLink }] : []);
        const canCommission =
          canRead &&
          (actor.role === 'platform_owner' || actor.role === 'workspace_owner');
        const rates = await identity.client.rpc(
          'get_registration_link_commissions',
          { workspace_id: workspaceId },
        );
        if (canCommission) {
          expect(rates.error).toBeNull();
          expect(rates.data).toEqual([
            { link_id: expectedLink, commission_rate_bp: 17 },
          ]);
        } else expect(rates.error).not.toBeNull();
      });
  it("the read fixture's foreign version is not readable from workspace A", async () => {
    const result = await fixture.actors.po.client
      .from('package_versions_safe')
      .select('id')
      .eq('id', foreignVersionId);
    expect(result.data).toEqual([{ id: foreignVersionId }]);
    const [row] =
      await db`select workspace_id from public.package_versions where id=${foreignVersionId}`;
    expect(row!.workspace_id).toBe(fixture.wsB.id);
  });
});

it('keeps the role and capability definitions unchanged', () => {
  expect(ROLES).toEqual([
    'platform_owner',
    'workspace_owner',
    'trainer',
    'sales',
  ]);
  expect(CAPABILITIES).toEqual([
    'generate_recovery_link',
    'set_package_pricing',
    'generate_registration_link',
    'configure_installment_schedule',
    'approve_registration',
    'record_payment',
    'manage_freeze',
    'record_refund',
    'delete_client',
    'export_client_dataset',
    'manage_workspaces',
    'manage_staff_access',
    'coaching_work',
  ]);
  expect(
    Object.fromEntries(ROLES.map((role) => [role, [...MATRIX[role]]])),
  ).toEqual({
    platform_owner: [...CAPABILITIES],
    workspace_owner: [
      'generate_recovery_link',
      'generate_registration_link',
      'configure_installment_schedule',
      'approve_registration',
      'record_payment',
      'manage_freeze',
      'coaching_work',
    ],
    trainer: ['generate_registration_link', 'coaching_work'],
    sales: [
      'generate_registration_link',
      'configure_installment_schedule',
      'record_payment',
      'manage_freeze',
    ],
  });
});

for (const role of ROLES) {
  for (const capability of parityCapabilities) {
    it(`T010 parity: ${role} / ${capability}`, async () => {
      const [row] =
        await db`select app_private.role_has_capability(${role}::public.staff_role, ${capability}) as allowed`;
      expect(row?.allowed).toBe(roleHasCapability(role, capability));
    });
  }
}

it('null role denies every known capability', async () => {
  for (const capability of parityCapabilities) {
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
      for (const capability of [
        ...parityCapabilities,
        'typo_capability',
        null,
      ]) {
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
