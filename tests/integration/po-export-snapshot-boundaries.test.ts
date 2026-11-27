import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PO_EXPORT_FIELDS } from '../../lib/po-export/manifest';
import { createHandlers } from '../../workers/cron/src/handlers';
import type { Rpc } from '../../workers/cron/src/drain';
import { admin, sql } from './harness';
import { portalFixture, type PortalFixture } from './client-portal-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';

const svc = admin();
const db = sql();
let home: PortalFixture;
let foreign: PortalFixture;
let homeClient: Awaited<ReturnType<PortalFixture['makeClient']>>;
let foreignClient: Awaited<ReturnType<PortalFixture['makeClient']>>;

beforeAll(async () => {
  home = await portalFixture();
  foreign = await portalFixture();
  homeClient = await home.makeClient({
    activate: false,
    label: 'export-snapshot-home',
  });
  foreignClient = await foreign.makeClient({
    activate: false,
    label: 'export-snapshot-foreign',
  });
  await db.begin((tx) =>
    seedSubmittedIntake(tx, home.fixture.wsA.id, homeClient.clientId, {
      q1: 'submitted',
      fitness_goals: 'strength-canary',
      health_notes: 'health-canary-private',
    }),
  );
  const [membership] = await db`
    select id from public.workspace_memberships
    where workspace_id=${home.fixture.wsA.id} and user_id=${home.fixture.trainerA.userId} and revoked_at is null
  `;
  await db`
    insert into public.client_trainer_assignments(workspace_id,client_id,trainer_user_id,assigned_by,workspace_membership_id)
    values(${home.fixture.wsA.id},${homeClient.clientId},${home.fixture.trainerA.userId},${home.fixture.po.userId},${membership!.id})
  `;
});

afterAll(async () => {
  await home.close();
  await foreign.close();
  await db.end();
});

async function runningJob(workspaceId: string | null) {
  const jobId = randomUUID();
  const lease = randomUUID();
  await db`
    insert into public.jobs(id,kind,workspace_id,payload,idempotency_key,status,lease_token,lease_expires_at)
    values(${jobId},'po.export',${workspaceId},${db.json({
      actor_user_id: home.fixture.po.userId,
      scope_workspace_id: workspaceId,
      manifest_version: '030-v1',
    })},${`po-export-snapshot-${jobId}`},'running',${lease},now()+interval '5 minutes')
  `;
  return { jobId, lease };
}

const expectedColumns = [
  'clients.id',
  'clients.workspace_id',
  'clients.name',
  'clients.email_normalized',
  'clients.phone_e164',
  'clients.approval_state',
  'clients.created_at',
  'subscriptions.package_name',
  'subscriptions.status',
  'subscriptions.start_at',
  'subscriptions.expires_at',
  'client_trainer_assignments.trainer_name',
  'client_trainer_assignments.assigned_at',
  'forms.intake_submitted_at',
  'forms.fitness_goals',
];

describe('PO export real database snapshot', () => {
  it('uses the exact approved 15 fields and excludes health_notes across workspace scope', async () => {
    expect(PO_EXPORT_FIELDS.map((field) => field.key)).toEqual(expectedColumns);
    const homeJob = await runningJob(home.fixture.wsA.id);
    const homeResult = await svc.rpc('po_export_snapshot', {
      p_job_id: homeJob.jobId,
      p_lease_token: homeJob.lease,
    });
    expect(homeResult.error).toBeNull();
    const homeData = homeResult.data as {
      rows: Array<{ client_id: string; row: Record<string, unknown> }>;
      row_count: number;
    };
    expect(homeData.row_count).toBe(1);
    const row = homeData.rows.find(
      (item) => item.client_id === homeClient.clientId,
    )?.row;
    expect(row).toBeDefined();
    expect(Object.keys(row!).sort()).toEqual([...expectedColumns].sort());
    expect(row).toMatchObject({
      'clients.id': homeClient.clientId,
      'clients.workspace_id': home.fixture.wsA.id,
      'clients.name': homeClient.name,
      'forms.fitness_goals': 'strength-canary',
    });
    expect(JSON.stringify(row)).not.toContain('health-canary-private');

    const foreignJob = await runningJob(foreign.fixture.wsA.id);
    const foreignResult = await svc.rpc('po_export_snapshot', {
      p_job_id: foreignJob.jobId,
      p_lease_token: foreignJob.lease,
    });
    expect(foreignResult.error).toBeNull();
    const foreignData = foreignResult.data as {
      rows: Array<{ client_id: string }>;
      row_count: number;
    };
    expect(foreignData.row_count).toBe(1);
    expect(foreignData.rows.map((item) => item.client_id)).toEqual([
      foreignClient.clientId,
    ]);

    const allJob = await runningJob(null);
    const allResult = await svc.rpc('po_export_snapshot', {
      p_job_id: allJob.jobId,
      p_lease_token: allJob.lease,
    });
    expect(allResult.error).toBeNull();
    expect((allResult.data as { row_count: number }).row_count).toBe(2);
  });

  it('keeps one MVCC view while a client row is concurrently updated', async () => {
    const job = await runningJob(home.fixture.wsA.id);
    const [profile] =
      await db`select display_name,display_name_version from public.staff_profiles where user_id=${home.fixture.trainerA.userId}`;
    let updateStarted!: () => void;
    let releaseUpdate!: () => void;
    const ready = new Promise<void>((resolve) => (updateStarted = resolve));
    const hold = new Promise<void>((resolve) => (releaseUpdate = resolve));
    const update = db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: home.fixture.po.userId, role: 'authenticated' })},true)`;
      await tx`set local role authenticated`;
      const [result] = await tx`
        select public.set_staff_display_name(
          ${home.fixture.trainerA.userId},'Concurrent Export Trainer',${profile!.display_name_version},${randomUUID()}
        ) as value
      `;
      expect(result?.value).toEqual({ status: 'ok' });
      updateStarted();
      await hold;
    });
    await ready;
    try {
      const snapshot = await svc.rpc('po_export_snapshot', {
        p_job_id: job.jobId,
        p_lease_token: job.lease,
      });
      expect(snapshot.error).toBeNull();
      const result = snapshot.data as {
        rows: Array<{ client_id: string; row: Record<string, unknown> }>;
      };
      const row = result.rows.find(
        (item) => item.client_id === homeClient.clientId,
      )?.row;
      expect(row?.['client_trainer_assignments.trainer_name']).toBe(
        profile!.display_name,
      );
    } finally {
      releaseUpdate();
      await update;
    }
    const afterCommit = await svc.rpc('po_export_snapshot', {
      p_job_id: job.jobId,
      p_lease_token: job.lease,
    });
    const committed = (
      afterCommit.data as {
        rows: Array<{ client_id: string; row: Record<string, unknown> }>;
      }
    ).rows.find((item) => item.client_id === homeClient.clientId)?.row;
    expect(committed?.['client_trainer_assignments.trainer_name']).toBe(
      'Concurrent Export Trainer',
    );
  });

  it('accepts 10,000 real rows and fails closed at 10,001 without an artifact', async () => {
    const seedNonce = randomUUID();
    for (let first = 1; first <= 9999; first += 500) {
      const last = Math.min(first + 499, 9999);
      await db.begin(async (tx) => {
        await tx`create temporary table po_export_seed_users(n integer, id uuid, email text, phone text) on commit drop`;
        await tx`insert into po_export_seed_users
          select n, gen_random_uuid(), ${`po-export-${seedNonce}-`}||n||'@example.test', '+12'||lpad(n::text,10,'0')
          from generate_series(${first}::integer,${last}::integer) n`;
        await tx`alter table public.registration_links disable trigger user`;
        await tx`alter table public.clients disable trigger signup_client_insert_guard`;
        await tx`alter table public.clients disable trigger signup_client_integrity`;
        await tx`alter table public.clients disable trigger audit_client_signup`;
        await tx`insert into auth.users(id,instance_id,aud,role,email,phone,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
          select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,substring(phone from 2),'',now(),'{}','{}',now(),now()
          from po_export_seed_users`;
        await tx`create temporary table po_export_seed_links(n integer,id uuid) on commit drop`;
        await tx`insert into po_export_seed_links select n,gen_random_uuid() from po_export_seed_users`;
        await tx`insert into public.registration_links(workspace_id,id,package_version_id,token_hash,created_by,created_at,expires_at,consumed_at,price_minor,currency,duration_days,duration_months,commission_rate_bp)
          select ${home.fixture.wsA.id},l.id,c.package_version_id,md5(l.id::text)||md5(l.id::text||'x'),${home.fixture.po.userId},now(),now()+interval '24 hours',now(),1200,'USD',30,1,0
          from po_export_seed_links l cross join lateral (select package_version_id from public.clients where id=${homeClient.clientId}) c`;
        await tx`insert into public.clients(workspace_id,auth_user_id,registration_link_id,package_version_id,email_normalized,phone_e164,name,created_at)
          select ${home.fixture.wsA.id},u.id,l.id,c.package_version_id,lower(u.email),u.phone,'bulk-row-'||u.n,now()
          from po_export_seed_users u join po_export_seed_links l using(n)
          cross join lateral (select package_version_id from public.clients where id=${homeClient.clientId}) c`;
        await tx`alter table public.registration_links enable trigger user`;
        await tx`alter table public.clients enable trigger signup_client_insert_guard`;
        await tx`alter table public.clients enable trigger signup_client_integrity`;
        await tx`alter table public.clients enable trigger audit_client_signup`;
      });
    }

    const atLimit = await runningJob(home.fixture.wsA.id);
    const accepted = await svc.rpc('po_export_snapshot', {
      p_job_id: atLimit.jobId,
      p_lease_token: atLimit.lease,
    });
    expect(accepted.error).toBeNull();
    expect(
      (accepted.data as { row_count: number; exceeded_limit: boolean })
        .row_count,
    ).toBe(10000);
    expect((accepted.data as { exceeded_limit: boolean }).exceeded_limit).toBe(
      false,
    );

    const overflow = await runningJob(null);
    const rpc = (async (name: string, args: Record<string, unknown>) => {
      const result = await svc.rpc(name, args as never);
      if (result.error) throw new Error('test_worker_rpc_failed');
      return result.data;
    }) as unknown as Rpc;
    const fetchBefore = vi.spyOn(globalThis, 'fetch');
    const handler = createHandlers(rpc, {
      SUPABASE_URL: 'http://127.0.0.1:35421',
      SUPABASE_SERVICE_ROLE_KEY: 'stack-injected',
    })['po.export'];
    await expect(
      handler({
        jobId: overflow.jobId,
        kind: 'po.export',
        workspaceId: null,
        payload: {},
        leaseToken: overflow.lease,
      }),
    ).rejects.toMatchObject({
      code: 'po_export_row_cap_exceeded',
      permanent: true,
    });
    expect(
      fetchBefore.mock.calls.some(([input]) =>
        String(input).includes('/storage/v1/object/po-export-artifacts/'),
      ),
    ).toBe(false);
    const artifact = await svc.storage
      .from('po-export-artifacts')
      .download(`${overflow.jobId}/${overflow.lease}/archive.csv`);
    expect(artifact.data).toBeNull();
    fetchBefore.mockRestore();
  }, 180_000);
});
