import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checked as harnessChecked, createStaff } from './harness';
import {
  registrationFixture,
  issue,
  schedule,
  checked,
  publish,
  secret,
  sql,
  type RegistrationFixture,
} from './registration-links-fixture';
import { publishedFixture } from './packages-fixture';
let f: RegistrationFixture;
const db = sql();
beforeAll(async () => {
  f = await registrationFixture();
});
afterAll(() => db.end());
async function events(target: string) {
  return db`select actor_user_id,action,target_table,target_id,workspace_id,details from public.audit_events where target_id=${target} order by id`;
}
async function openedEvents(target: string) {
  return db`select actor_user_id,action,target_table,target_id,workspace_id,details from public.audit_events where target_id=${target} and action='registration_link.opened' order by id`;
}
it.each([null, schedule])(
  'issued audit counts final rows exactly once %#',
  async (installments) => {
    const s = secret();
    const id = checked(
      await issue(f, f.salesA.client, {
        installments,
        token_hash: s.hash,
      }),
    );
    const rows = await events(id);
    expect(rows).toEqual([
      {
        actor_user_id: f.salesA.userId,
        action: 'registration_link.issued',
        target_table: 'registration_links',
        target_id: id,
        workspace_id: f.wsA.id,
        details: {
          package_version_id: f.p.versionId,
          offer_id: f.p.offer.id,
          installment_count: installments?.length ?? 0,
          price_minor: '1200',
          currency: 'XTS',
        },
      },
    ]);
    const details = rows[0]!.details;
    expect(Object.keys(details).sort()).toEqual([
      'currency',
      'installment_count',
      'offer_id',
      'package_version_id',
      'price_minor',
    ]);
    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain(s.hash);
    expect(serialized).not.toContain(s.token);
    expect(serialized).not.toMatch(/token|hash|commission|rate|@/);
  },
);
it('first anonymous open emits exactly one empty-detail event; repeat/invalid/consumed-only emit none', async () => {
  const s = secret();
  const id = checked(await issue(f, f.salesA.client, { token_hash: s.hash }));
  for (let i = 0; i < 3; i++)
    expect(
      (
        await f.actors.anon.client.rpc('registration_link_open', {
          token: s.token,
        })
      ).data,
    ).toEqual({ status: 'valid', workspace_name: f.wsA.name });
  expect(await openedEvents(id)).toMatchObject([
    {
      actor_user_id: null,
      action: 'registration_link.opened',
      target_table: 'registration_links',
      target_id: id,
      workspace_id: f.wsA.id,
      details: {},
    },
  ]);
  expect(Object.keys((await openedEvents(id))[0]!.details)).toEqual([]);
  const [before] =
    await db`select count(*)::int as n from public.audit_events where action='registration_link.opened'`;
  expect(
    (
      await f.actors.anon.client.rpc('registration_link_open', {
        token: secret().token,
      })
    ).data,
  ).toEqual({ status: 'invalid' });
  const consumedSecret = secret();
  const consumed = checked(
    await issue(f, f.salesA.client, { token_hash: consumedSecret.hash }),
  );
  await db`update public.registration_links set consumed_at=now() where id=${consumed}`;
  expect(
    (
      await f.actors.anon.client.rpc('registration_link_open', {
        token: consumedSecret.token,
      })
    ).data,
  ).toEqual({ status: 'invalid' });
  expect(await openedEvents(consumed)).toEqual([]);
  const [after] =
    await db`select count(*)::int as n from public.audit_events where action='registration_link.opened'`;
  expect(after).toEqual(before);
});
it('audit failure rolls back issuance and first open', async () => {
  const s = secret();
  const id = checked(await issue(f, f.po.client, { token_hash: s.hash }));
  // Rollback-scoped DDL never survives the probe; failure injected at actual audit INSERT.
  for (const opening of [false, true])
    await expect(
      db.begin(async (tx) => {
        await tx`alter table public.audit_events add constraint f10_force_failure check(action not like 'registration_link.%') not valid`;
        if (opening) await tx`select public.registration_link_open(${s.token})`;
        else {
          await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
          await tx`select public.issue_registration_link(${f.wsA.id},${f.p.versionId},${secret().hash},null)`;
        }
      }),
    ).rejects.toMatchObject({ code: '23514' });
  const [r] =
    await db`select opened_at from public.registration_links where id=${id}`;
  expect(r!.opened_at).toBeNull();
  expect(
    await db`select id from public.audit_events where target_id=${id} and action='registration_link.opened'`,
  ).toHaveLength(0);
});
describe('legacy audit mapping regression', () => {
  it('workspace creation keeps its pre-F10 shape', async () => {
    const id = randomUUID(),
      slug = `f10-audit-${randomUUID()}`;
    harnessChecked(
      await f.po.client.from('workspaces').insert({
        id,
        name: 'F10 audit workspace',
        slug,
        created_by: f.po.userId,
      }),
    );
    expect(await events(id)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'workspace.created',
        target_table: 'workspaces',
        target_id: id,
        workspace_id: id,
        details: {},
      },
    ]);
  });
  it('staff role assignment keeps its pre-F10 shape', async () => {
    const staff = await createStaff(null, 'f10-audit-staff');
    harnessChecked(
      await f.po.client.from('staff_profiles').insert({
        user_id: staff.userId,
        role: 'sales',
        display_name: 'Sales Staff',
      }),
    );
    expect(await events(staff.userId)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'staff_role.assigned',
        target_table: 'staff_profiles',
        target_id: staff.userId,
        workspace_id: null,
        details: { role: 'sales' },
      },
    ]);
  });
  it('membership grant keeps its pre-F10 shape', async () => {
    const staff = await createStaff('sales', 'f10-audit-membership'),
      id = randomUUID();
    harnessChecked(
      await f.po.client.from('workspace_memberships').insert({
        id,
        workspace_id: f.wsA.id,
        user_id: staff.userId,
        granted_by: f.po.userId,
      }),
    );
    expect(await events(id)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'membership.granted',
        target_table: 'workspace_memberships',
        target_id: id,
        workspace_id: f.wsA.id,
        details: { user_id: staff.userId },
      },
    ]);
  });
  it('recovery issuance keeps its pre-F10 shape', async () => {
    const id = await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.po.userId, role: 'authenticated' })},true)`;
      const [row] =
        await tx`insert into public.recovery_link_issuances(workspace_id,target_user_id,issued_by) values(${f.wsA.id},${f.actors.client.userId},${f.po.userId}) returning id`;
      return row!.id as string;
    });
    expect(await events(id)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'recovery_link.generated',
        target_table: 'recovery_link_issuances',
        target_id: id,
        workspace_id: f.wsA.id,
        details: { target_user_id: f.actors.client.userId },
      },
    ]);
  });
  it('package creation keeps its pre-F10 shape', async () => {
    const code = `f10-audit-${randomUUID()}`;
    const id = checked(
      await f.po.client.rpc('create_package', { code }),
    ) as string;
    expect(await events(id)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'package.created',
        target_table: 'packages',
        target_id: id,
        workspace_id: null,
        details: { code },
      },
    ]);
  });
  it('offer availability keeps its pre-F10 shape', async () => {
    const p = await publishedFixture(f, { tier_rank: 1 });
    checked(
      await f.po.client.rpc('set_package_offer_available', {
        workspace_id: f.wsA.id,
        offer_id: p.offer.id,
        available: true,
      }),
    );
    expect(await events(p.offer.id)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'package_offer.availability_changed',
        target_table: 'package_offers',
        target_id: p.offer.id,
        workspace_id: f.wsA.id,
        details: { available: true },
      },
    ]);
  });
  it('package version publication keeps its pre-F10 shape', async () => {
    const versionId = checked(
      await publish(f, f.p.id, { tier_rank: 1, price_minor: '1301' }),
    ) as string;
    const [version] =
      await db`select version from public.package_versions where id=${versionId}`;
    expect(await events(versionId)).toEqual([
      {
        actor_user_id: f.po.userId,
        action: 'package_version.published',
        target_table: 'package_versions',
        target_id: versionId,
        workspace_id: f.wsA.id,
        details: {
          offer_id: f.p.offer.id,
          package_id: f.p.id,
          version: version!.version,
          price_minor: '1301',
          currency: 'XTS',
          commission_rate_bp: 17,
          duration_days: 61,
        },
      },
    ]);
  });
  it('job dead-letter keeps its pre-F10 shape', async () => {
    const id = randomUUID(),
      key = randomUUID();
    await db`insert into public.jobs(id,kind,workspace_id,payload,idempotency_key,run_at,max_attempts,attempts) values(${id},'test.audit',${f.wsA.id},'{}'::jsonb,${key},now(),5,1)`;
    await db`update public.jobs set status='dead',last_error='exhausted',attempts=2 where idempotency_key=${key}`;
    const [job] =
      await db`select id from public.jobs where idempotency_key=${key}`;
    expect(job).toEqual({ id });
    expect(await events(id)).toEqual([
      {
        actor_user_id: null,
        action: 'job.dead_lettered',
        target_table: 'jobs',
        target_id: id,
        workspace_id: f.wsA.id,
        details: { kind: 'test.audit', error: 'exhausted', attempts: 2 },
      },
    ]);
  });
});
