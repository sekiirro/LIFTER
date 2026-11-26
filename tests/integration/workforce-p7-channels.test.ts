import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  anonClient,
  checked,
  sql,
} from './harness';
import { clientContext, graph } from './registration-approval-fixture';

const db = sql();
let fixture: Awaited<ReturnType<typeof clientContext>>;

beforeAll(async () => {
  fixture = await clientContext();
});

afterAll(async () => {
  await db.end();
  const users = [
    fixture?.po?.userId,
    fixture?.woA?.userId,
    fixture?.trainerA?.userId,
    fixture?.salesA?.userId,
    fixture?.trainerB?.userId,
  ].filter(Boolean);
  for (const uid of users) {
    await admin().auth.admin.deleteUser(uid!);
  }
});

describe('T032 P7 Confidentiality Channels & Audit Protection', () => {
  const p7Tables = [
    'public.p7_earned_points',
    'public.p7_salary_revisions',
    'public.p7_monetary_payroll_inputs',
    'public.p7_payroll_snapshots',
    'public.p7_payroll_approvals',
    'app_private.workforce_checkin_transitions',
  ] as const;

  it('1. publications: no P7 relation belongs to any publication', async () => {
    const publications = await db`
      select pubname, schemaname, tablename
      from pg_catalog.pg_publication_tables
      where (schemaname = 'public' and tablename in (
        'p7_earned_points', 'p7_salary_revisions', 'p7_monetary_payroll_inputs',
        'p7_payroll_snapshots', 'p7_payroll_approvals'
      ))
      or (schemaname = 'app_private' and tablename = 'workforce_checkin_transitions')
    `;
    expect(publications).toHaveLength(0);
  });

  it('2. grants: anon, authenticated, and service_role have no table privileges on any P7 relation', async () => {
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
    const roles = ['anon', 'authenticated', 'service_role'];
    for (const rel of p7Tables) {
      for (const role of roles) {
        for (const priv of privileges) {
          const [grant] = await db`
            select has_table_privilege(${role}, ${rel}, ${priv}) as allowed
          `;
          expect(grant?.allowed, `${role} ${priv} on ${rel}`).toBe(false);
        }
      }
    }
  });

  it('3. rls: RLS enabled and forced on all six P7 relations, zero public policies, private postgres-only', async () => {
    for (const rel of p7Tables) {
      const [table] = await db`
        select relrowsecurity, relforcerowsecurity
        from pg_catalog.pg_class
        where oid = ${rel}::regclass
      `;
      expect(table?.relrowsecurity, `${rel} relrowsecurity`).toBe(true);
      expect(table?.relforcerowsecurity, `${rel} relforcerowsecurity`).toBe(
        true,
      );
    }

    const publicPolicies = await db`
      select policyname, tablename
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename in (
        'p7_earned_points', 'p7_salary_revisions', 'p7_monetary_payroll_inputs',
        'p7_payroll_snapshots', 'p7_payroll_approvals'
      )
    `;
    expect(publicPolicies).toHaveLength(0);

    const privatePolicies = await db`
      select policyname, roles
      from pg_catalog.pg_policies
      where schemaname = 'app_private' and tablename = 'workforce_checkin_transitions'
    `;
    expect(privatePolicies).toHaveLength(1);
    expect(privatePolicies[0]?.roles).toEqual(['postgres']);
  });

  it('4. function-grants: public P7 RPCs execute authenticated only with security definer and empty search_path; private helpers revoked', async () => {
    const publicRpcs = [
      'public.get_trainer_checkins(uuid,date,date,integer,integer)',
      'public.confirm_trainer_checkin_followup(uuid,uuid)',
      'public.p7_set_basic_salary(uuid,date,text,bigint,text,integer,uuid)',
      'public.p7_post_monetary_payroll_input(uuid,date,text,bigint,text,uuid,uuid,uuid)',
      'public.p7_create_payroll_snapshot(uuid,date,uuid)',
      'public.p7_approve_external_payroll(uuid,date,uuid,integer,bigint,text,uuid)',
    ];

    for (const rpc of publicRpcs) {
      const [fn] = await db`
        select p.prosecdef, p.proconfig,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure(${rpc})
      `;
      expect(fn?.prosecdef, `${rpc} prosecdef`).toBe(true);
      expect(fn?.proconfig, `${rpc} proconfig`).toEqual(['search_path=""']);
      expect(fn?.auth_exec, `${rpc} authenticated execute`).toBe(true);
      expect(fn?.anon_exec, `${rpc} anon execute`).toBe(false);
      expect(fn?.sr_exec, `${rpc} service_role execute`).toBe(false);
    }

    const privateHelpers = [
      'app_private.p7_payroll_lineage(uuid,date)',
      'app_private.p7_payroll_lock(uuid,date)',
      'app_private.p7_require_payroll_employee(uuid)',
      'app_private.p7_require_platform_owner()',
      'app_private.p7_reject_immutable_write()',
      'app_private.p7_reject_mutation()',
      'app_private.p7_month_for_trigger(timestamp with time zone)',
      'app_private.p7_lock_period(uuid,date)',
      'app_private.p7_earn_f19_activation()',
      'app_private.guard_workforce_checkin_transition()',
      'app_private.guard_workforce_checkin_transition_truncate()',
    ];

    for (const helper of privateHelpers) {
      const [fn] = await db`
        select
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec
        from pg_catalog.pg_proc p
        where p.oid = to_regprocedure(${helper})
      `;
      expect(fn?.auth_exec, `${helper} authenticated execute`).toBe(false);
      expect(fn?.anon_exec, `${helper} anon execute`).toBe(false);
      expect(fn?.sr_exec, `${helper} service_role execute`).toBe(false);
    }
  });

  it('5. direct-channels: anon, PO, WO, trainer, and sales get uniform rejection on select, HEAD, and count', async () => {
    const clients = [
      { role: 'anon', client: anonClient() },
      { role: 'po', client: fixture.po.client },
      { role: 'wo', client: fixture.woA.client },
      { role: 'trainer', client: fixture.trainerA.client },
      { role: 'sales', client: fixture.salesA.client },
    ];

    const targetTables = [
      'p7_earned_points',
      'p7_salary_revisions',
      'p7_monetary_payroll_inputs',
      'p7_payroll_snapshots',
      'p7_payroll_approvals',
    ];

    for (const table of targetTables) {
      for (const { role, client } of clients) {
        const selectRes = await client.from(table).select('*');
        expect(selectRes.error, `${role} select on ${table}`).not.toBeNull();
        expect(selectRes.status).toBeGreaterThanOrEqual(400);

        const headRes = await client.from(table).select('*', { head: true });
        expect(
          headRes.error || headRes.status >= 400,
          `${role} HEAD on ${table}`,
        ).toBeTruthy();

        const countRes = await client
          .from(table)
          .select('id', { count: 'exact' });
        expect(countRes.error, `${role} count on ${table}`).not.toBeNull();
        expect(countRes.status).toBeGreaterThanOrEqual(400);
        expect(countRes.count).toBeNull();
      }
    }
  });

  it('6. existence-oracle: missing target, foreign workspace, and unauthorized role yield uniform error code', async () => {
    const randomId = randomUUID();
    const foreignWs = fixture.wsB.id;
    const ownWs = fixture.wsA.id;

    // get_trainer_checkins: WO, sales, and foreign trainer get uniform 42501 not_permitted
    const checkinResWo = await fixture.woA.client.rpc('get_trainer_checkins', {
      p_workspace_id: ownWs,
      p_from: '2026-11-01',
      p_to: '2026-11-30',
      p_limit: 10,
      p_offset: 0,
    });
    expect(checkinResWo.error?.code).toBe('42501');
    expect(checkinResWo.error?.message).toBe('not_permitted');

    const checkinResForeign = await fixture.trainerA.client.rpc(
      'get_trainer_checkins',
      {
        p_workspace_id: foreignWs,
        p_from: '2026-11-01',
        p_to: '2026-11-30',
        p_limit: 10,
        p_offset: 0,
      },
    );
    expect(checkinResForeign.error?.code).toBe('42501');
    expect(checkinResForeign.error?.message).toBe('not_permitted');

    const checkinResMissing = await fixture.trainerA.client.rpc(
      'get_trainer_checkins',
      {
        p_workspace_id: randomId,
        p_from: '2026-11-01',
        p_to: '2026-11-30',
        p_limit: 10,
        p_offset: 0,
      },
    );
    expect(checkinResMissing.error?.code).toBe('42501');
    expect(checkinResMissing.error?.message).toBe('not_permitted');

    // confirm_trainer_checkin_followup: missing vs foreign vs denied all yield 42501 not_permitted
    const confirmResWo = await fixture.woA.client.rpc(
      'confirm_trainer_checkin_followup',
      {
        p_workspace_id: ownWs,
        p_assignment_id: randomId,
      },
    );
    expect(confirmResWo.error?.code).toBe('42501');
    expect(confirmResWo.error?.message).toBe('not_permitted');

    const confirmResForeign = await fixture.trainerA.client.rpc(
      'confirm_trainer_checkin_followup',
      {
        p_workspace_id: foreignWs,
        p_assignment_id: randomId,
      },
    );
    expect(confirmResForeign.error?.code).toBe('42501');
    expect(confirmResForeign.error?.message).toBe('not_permitted');

    // Payroll RPCs: non-PO callers uniformly receive 42501 p7_platform_owner_required
    const payrollRpcs = [
      {
        name: 'p7_set_basic_salary',
        args: {
          p_employee_id: fixture.trainerA.userId,
          p_effective_month: '2026-11-01',
          p_market: 'Egypt',
          p_amount_minor: '500000',
          p_currency: 'EGP',
          p_expected_revision: 0,
          p_idempotency_key: randomUUID(),
        },
      },
      {
        name: 'p7_post_monetary_payroll_input',
        args: {
          p_employee_id: fixture.trainerA.userId,
          p_effective_month: '2026-11-01',
          p_category: 'incentive',
          p_amount_minor: '100000',
          p_currency: 'EGP',
          p_reason_ref: randomUUID(),
          p_supersedes_input_id: null,
          p_idempotency_key: randomUUID(),
        },
      },
      {
        name: 'p7_create_payroll_snapshot',
        args: {
          p_employee_id: fixture.trainerA.userId,
          p_effective_month: '2026-11-01',
          p_idempotency_key: randomUUID(),
        },
      },
      {
        name: 'p7_approve_external_payroll',
        args: {
          p_employee_id: fixture.trainerA.userId,
          p_effective_month: '2026-11-01',
          p_snapshot_id: randomUUID(),
          p_snapshot_version: 1,
          p_amount_minor: '500000',
          p_currency: 'EGP',
          p_idempotency_key: randomUUID(),
        },
      },
    ];

    for (const rpc of payrollRpcs) {
      for (const nonPo of [fixture.woA, fixture.trainerA, fixture.salesA]) {
        const res = await nonPo.client.rpc(rpc.name, rpc.args);
        expect(res.error?.code, `${nonPo.userId} calling ${rpc.name}`).toBe(
          '42501',
        );
        expect(res.error?.message).toContain('p7_platform_owner_required');
      }
    }
  });

  it('7. audit-readers-real-roles & 11. audit-action-table-opaque-earned: WO cannot read P7 audit events', async () => {
    const wsId = fixture.wsA.id;
    const testTag = randomUUID();

    // Insert 4 test audit events: 3 P7 events and 1 unrelated event
    await db`
      insert into public.audit_events (
        workspace_id, actor_user_id, action, target_table, target_id, details
      ) values
      (${wsId}, ${fixture.po.userId}, 'workforce.earned_fact_recorded', 'p7_earned_points', ${randomUUID()}, ${db.json({ reference: testTag })}),
      (${wsId}, ${fixture.po.userId}, 'workforce.checkin_transition', 'workforce_checkin_transitions', ${randomUUID()}, ${db.json({ reference_id: testTag })}),
      (${wsId}, ${fixture.po.userId}, 'workforce.custom_action', 'other_table', ${randomUUID()}, ${db.json({ tag: testTag })}),
      (${wsId}, ${fixture.po.userId}, 'workspace.updated', 'workspaces', ${wsId}, ${db.json({ tag: testTag })})
    `;

    // Platform Owner can read all of them
    const poAudit =
      checked(
        await fixture.po.client
          .from('audit_events')
          .select('action, target_table, details')
          .eq('workspace_id', wsId)
          .or(`action.like.workforce.%,action.eq.workspace.updated`),
      ) ?? [];
    expect(poAudit.length).toBeGreaterThanOrEqual(4);

    // Workspace Owner must NOT be able to read any workforce.* or p7_* or workforce_checkin_transitions rows
    const woAudit =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('action, target_table, details')
          .eq('workspace_id', wsId),
      ) ?? [];

    const woP7Rows = woAudit.filter(
      (r) =>
        r.action.startsWith('workforce.') ||
        (r.target_table && r.target_table.startsWith('p7_')) ||
        r.target_table === 'workforce_checkin_transitions',
    );
    expect(woP7Rows, 'WO must read zero P7 audit rows').toHaveLength(0);

    // Unrelated audit row IS read by WO
    const woUnrelated = woAudit.filter(
      (r) => r.action === 'workspace.updated' && r.details?.tag === testTag,
    );
    expect(woUnrelated.length).toBeGreaterThanOrEqual(1);

    // Trainer, sales, and anon read zero rows from audit_events
    const trainerAudit = checked(
      await fixture.trainerA.client.from('audit_events').select('*'),
    );
    expect(trainerAudit).toHaveLength(0);

    const salesAudit = checked(
      await fixture.salesA.client.from('audit_events').select('*'),
    );
    expect(salesAudit).toHaveLength(0);

    const anonRes = await anonClient().from('audit_events').select('*');
    expect(anonRes.error?.code).toBe('42501');
  });

  it('7b. real-checkin-producers-audit-hidden: Trainer calls get_trainer_checkins and confirm_trainer_checkin_followup; WO sees 0 audit rows; PO sees them', async () => {
    const wsId = fixture.wsA.id;
    const [clock] = await db`
      select (clock_timestamp() at time zone 'Africa/Cairo')::date::text as today
    `;
    const today = clock!.today as string;
    let assignmentId: string;

    await db.begin(async (tx) => {
      const ids = await graph(tx, fixture);
      const [termsRow] = await tx`
        select version from app_private.terms_policy_versions
        where policy_kind = 'terms' and status = 'published'
        order by created_at desc, version desc limit 1
      `;
      let terms = termsRow?.version as string;
      if (!terms) {
        terms = `terms-${randomUUID()}`;
        await tx`insert into app_private.terms_policy_versions(version,policy_kind,status)
          values(${terms},'terms','published')`;
      }
      const formId = randomUUID();
      await tx`insert into public.forms(id,workspace_id,name)
        values(${formId},${wsId},'P7 synthetic check-in')`;
      const definition = {
        questions: [
          { id: 'workoutAdherence', sectionId: 'checkin', type: 'number' },
        ],
      };
      await tx`insert into public.form_versions(
        workspace_id,form_id,version_number,terms_policy_version,definition,status,published_at
      ) values(${wsId},${formId},1,${terms},${tx.json(definition)},'published',clock_timestamp())`;
      const policyId = randomUUID();
      await tx`insert into app_private.form_assignment_policies(
        id,workspace_id,form_id,version_number,audience_kind,trigger_kind,configured_by
      ) values(
        ${policyId},${wsId},${formId},1,'all_active_clients','weekly_checkin',${fixture.po.userId}
      )`;
      await tx`insert into app_private.form_assignment_occurrences(
        workspace_id,policy_id,occurrence_key,snapshot_at,audience_client_ids,version_number,trigger_kind,created_by
      ) values(
        ${wsId},${policyId},${'weekly_checkin:' + today},clock_timestamp(),${[ids.client]},1,'weekly_checkin',${fixture.po.userId}
      )`;
      const [assignment] = await tx`
        insert into public.form_assignments(
          workspace_id,client_id,form_id,version_number,terms_policy_version,
          version_snapshot,occurrence_key,policy_id,configured_by,client_deadline_at
        ) values(
          ${wsId},${ids.client},${formId},1,${terms},
          ${tx.json(definition)},${'weekly_checkin:' + today},${policyId},${fixture.po.userId},clock_timestamp() + interval '2 days'
        ) returning id
      `;
      assignmentId = assignment!.id as string;
      await tx`insert into public.form_answer_revisions(workspace_id,assignment_id,revision,answer_values)
        values(${wsId},${assignmentId},1,${tx.json({ workoutAdherence: 8 })})`;
      await tx`insert into app_private.form_submissions(
        workspace_id,assignment_id,revision,submitted_at
      ) values(
        ${wsId},${assignmentId},1,clock_timestamp() - interval '26 hours'
      )`;
    });

    // Real producer 1: Trainer calls get_trainer_checkins
    const getRes = await fixture.trainerA.client.rpc('get_trainer_checkins', {
      p_workspace_id: wsId,
      p_from: today,
      p_to: today,
      p_limit: 10,
      p_offset: 0,
    });
    expect(getRes.error).toBeNull();

    // Real producer 2: Trainer calls confirm_trainer_checkin_followup
    const confirmRes = await fixture.trainerA.client.rpc(
      'confirm_trainer_checkin_followup',
      {
        p_workspace_id: wsId,
        p_assignment_id: assignmentId!,
      },
    );
    expect(confirmRes.error).toBeNull();
    expect(confirmRes.data).toMatchObject({ status: 'ok' });

    // Verify audit rows were actually written by real producers in the database
    const producerAudit = await db`
      select action, target_table, details
      from public.audit_events
      where workspace_id = ${wsId}
        and (action = 'audit.opaque_reference' or target_table = 'opaque_reference')
    `;
    expect(producerAudit.length).toBeGreaterThanOrEqual(2);

    // Workspace Owner must see 0 resulting audit rows from these checkin producers
    const woAudit =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('action, target_table, details')
          .eq('workspace_id', wsId),
      ) ?? [];
    const woOpaqueRows = woAudit.filter(
      (r) =>
        r.action === 'audit.opaque_reference' ||
        r.target_table === 'opaque_reference',
    );
    expect(
      woOpaqueRows,
      'WO of that workspace must see 0 resulting check-in audit rows',
    ).toHaveLength(0);

    // Platform Owner sees them
    const poAudit =
      checked(
        await fixture.po.client
          .from('audit_events')
          .select('action, target_table, details')
          .eq('workspace_id', wsId),
      ) ?? [];
    const poOpaqueRows = poAudit.filter(
      (r) =>
        r.action === 'audit.opaque_reference' ||
        r.target_table === 'opaque_reference',
    );
    expect(
      poOpaqueRows.length,
      'PO must see the check-in audit rows',
    ).toBeGreaterThanOrEqual(2);
  });

  it('8. unrelated-wo-audit-preserved: WO retains read rights for all non-P7 workspace audit events', async () => {
    const wsId = fixture.wsA.id;
    const tag = randomUUID();

    await db`
      insert into public.audit_events (
        workspace_id, actor_user_id, action, target_table, target_id, details
      ) values
      (${wsId}, ${fixture.woA.userId}, 'workspace.updated', 'workspaces', ${wsId}, ${db.json({ tag })}),
      (${wsId}, ${fixture.woA.userId}, 'staff_role.changed', 'staff_profiles', ${fixture.trainerA.userId}, ${db.json({ tag })}),
      (${wsId}, ${fixture.woA.userId}, 'membership.granted', 'workspace_memberships', ${randomUUID()}, ${db.json({ tag })})
    `;

    const woAudit =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('action, target_table, details')
          .eq('workspace_id', wsId),
      ) ?? [];

    const preserved = woAudit.filter((r) => r.details?.tag === tag);
    expect(preserved).toHaveLength(3);
    const actions = preserved.map((r) => r.action).sort();
    expect(actions).toEqual([
      'membership.granted',
      'staff_role.changed',
      'workspace.updated',
    ]);
  });

  it('9. audit-details-earned-opaque: earned points audit details contains only opaque reference', async () => {
    // Assert on any earned-point audit event in database
    const rows = await db`
      select details
      from public.audit_events
      where target_table = 'p7_earned_points'
      limit 5
    `;
    for (const row of rows) {
      const keys = Object.keys(row.details || {});
      expect(keys).toEqual(['reference']);
      expect(row.details).not.toHaveProperty('amount');
      expect(row.details).not.toHaveProperty('currency');
      expect(row.details).not.toHaveProperty('employee_id');
      expect(row.details).not.toHaveProperty('salary');
      expect(row.details).not.toHaveProperty('points');
      expect(row.details).not.toHaveProperty('reason');
      expect(row.details).not.toHaveProperty('month');
      expect(row.details).not.toHaveProperty('client_id');
    }
  });

  it('10. audit-details-checkin-opaque & RISK 2: check-in audit transition UUID is not joinable to client data by non-PO', async () => {
    // Verify that workforce_checkin_transitions table is private and not joinable
    const [transitionsPriv] = await db`
      select has_table_privilege('authenticated', 'app_private.workforce_checkin_transitions', 'SELECT') as allowed
    `;
    expect(transitionsPriv?.allowed).toBe(false);

    // Verify no public foreign keys point to workforce_checkin_transitions
    const fks = await db`
      select conname, confrelid::regclass as target
      from pg_catalog.pg_constraint
      where confrelid = 'app_private.workforce_checkin_transitions'::regclass
    `;
    expect(fks).toHaveLength(0);

    // Verify check-in audit events details key set is exactly ['reference_id']
    const checkinAudits = await db`
      select details, target_id
      from public.audit_events
      where action = 'audit.opaque_reference' and target_table = 'opaque_reference'
      limit 5
    `;
    for (const audit of checkinAudits) {
      expect(Object.keys(audit.details)).toEqual(['reference_id']);
    }
  });

  it('12. audit-count-disclosure: WO, trainer, and sales cannot discover P7 activity through count/aggregates', async () => {
    const wsId = fixture.wsA.id;
    // Querying count of workforce.* actions as WO returns 0
    const woCount =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('id', { count: 'exact' })
          .eq('workspace_id', wsId)
          .like('action', 'workforce.%'),
      ) ?? [];
    expect(woCount.length).toBe(0);

    const woTargetCount =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('id', { count: 'exact' })
          .eq('workspace_id', wsId)
          .like('target_table', 'p7_%'),
      ) ?? [];
    expect(woTargetCount.length).toBe(0);
  });

  it('13. notifications-outbox-clean: no P7 amounts/points/salary in jobs or inbox notices', async () => {
    // Check notices
    const staffNotices = await db`
      select id, source_key
      from app_private.staff_inbox_notices
      where source_key::text ~* '(p7_|salary|points)'
    `;
    expect(staffNotices).toHaveLength(0);

    const clientNotices = await db`
      select id, source_key
      from app_private.client_inbox_notices
      where source_key::text ~* '(p7_|salary|points)'
    `;
    expect(clientNotices).toHaveLength(0);

    // Check jobs
    const p7Jobs = await db`
      select id, payload
      from public.jobs
      where payload::text ~* '(amount_minor|p7_salary|points)'
    `;
    expect(p7Jobs).toHaveLength(0);
  });

  it('14. search-export-report-clean: catalog scan finds no public report/search function projecting P7 tables', async () => {
    const violatingProcs = await db`
      select p.proname, n.nspname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.proname not in (
          'get_trainer_checkins', 'confirm_trainer_checkin_followup',
          'p7_set_basic_salary', 'p7_post_monetary_payroll_input',
          'p7_create_payroll_snapshot', 'p7_approve_external_payroll'
        )
        and pg_catalog.pg_get_functiondef(p.oid) ~* '(p7_salary_revisions|p7_monetary_payroll_inputs|p7_payroll_snapshots|p7_payroll_approvals|workforce_checkin_transitions)'
    `;
    expect(violatingProcs).toHaveLength(0);
  });

  it('15. replay-cache-receipts & RISK 4: non-PO replay rejected, PO replay re-authorized and idempotent', async () => {
    const idempotencyKey = randomUUID();
    const effectiveMonth = '2026-11-01';

    // 1. PO sets basic salary
    const poResult = checked(
      await fixture.po.client.rpc('p7_set_basic_salary', {
        p_employee_id: fixture.trainerA.userId,
        p_effective_month: effectiveMonth,
        p_market: 'Egypt',
        p_amount_minor: '600000',
        p_currency: 'EGP',
        p_expected_revision: 0,
        p_idempotency_key: idempotencyKey,
      }),
    );
    expect(poResult).toMatchObject({
      amount_minor: '600000',
      currency: 'EGP',
    });

    // 2. Non-PO (WO, Trainer, Sales) attempts replay with the exact same known idempotencyKey -> 42501 before lookup
    for (const nonPo of [fixture.woA, fixture.trainerA, fixture.salesA]) {
      const replayRes = await nonPo.client.rpc('p7_set_basic_salary', {
        p_employee_id: fixture.trainerA.userId,
        p_effective_month: effectiveMonth,
        p_market: 'Egypt',
        p_amount_minor: '600000',
        p_currency: 'EGP',
        p_expected_revision: 0,
        p_idempotency_key: idempotencyKey,
      });
      expect(replayRes.error?.code).toBe('42501');
      expect(replayRes.error?.message).toContain('p7_platform_owner_required');
    }

    // 3. PO same-key replay returns identical receipt without inserting duplicate row
    const poReplay = checked(
      await fixture.po.client.rpc('p7_set_basic_salary', {
        p_employee_id: fixture.trainerA.userId,
        p_effective_month: effectiveMonth,
        p_market: 'Egypt',
        p_amount_minor: '600000',
        p_currency: 'EGP',
        p_expected_revision: 0,
        p_idempotency_key: idempotencyKey,
      }),
    );
    expect(poReplay).toEqual(poResult);

    // 4. PO replay with changed parameters fails 23514 idempotency_key_reused
    const changedReplay = await fixture.po.client.rpc('p7_set_basic_salary', {
      p_employee_id: fixture.trainerA.userId,
      p_effective_month: effectiveMonth,
      p_market: 'Egypt',
      p_amount_minor: '700000', // Changed amount
      p_currency: 'EGP',
      p_expected_revision: 0,
      p_idempotency_key: idempotencyKey,
    });
    expect(changedReplay.error?.code).toBe('23514');
    expect(changedReplay.error?.message).toContain('idempotency_key_reused');
  });

  it('16. role-change-after-lock: rechecks platform owner authorization after lock wait', async () => {
    // Verify that all 4 payroll functions call p7_require_platform_owner() both on entry and after advisory lock
    const funcs = [
      'p7_set_basic_salary',
      'p7_post_monetary_payroll_input',
      'p7_create_payroll_snapshot',
      'p7_approve_external_payroll',
    ];
    for (const name of funcs) {
      const [fn] = await db`
        select pg_catalog.pg_get_functiondef(to_regproc(${name})) as def
      `;
      // Must contain p7_require_platform_owner after pg_advisory_xact_lock
      const lockIndex = fn!.def.indexOf('pg_advisory_xact_lock');
      expect(lockIndex, `${name} has advisory lock`).toBeGreaterThan(0);
      const afterLock = fn!.def.slice(lockIndex);
      expect(afterLock, `${name} rechecks PO after lock`).toContain(
        'p7_require_platform_owner()',
      );
    }
  });

  it('17. errors-non-disclosing: denied errors disclose no P7 ids, amounts, currency, employee name, or month', async () => {
    const res = await fixture.trainerA.client.rpc('p7_set_basic_salary', {
      p_employee_id: fixture.trainerA.userId,
      p_effective_month: '2026-11-01',
      p_market: 'Egypt',
      p_amount_minor: '999999',
      p_currency: 'EGP',
      p_expected_revision: 0,
      p_idempotency_key: randomUUID(),
    });
    expect(res.error?.message).toBe('p7_platform_owner_required');
    expect(res.error?.message).not.toContain('999999');
    expect(res.error?.message).not.toContain('EGP');
    expect(res.error?.message).not.toContain('2026-11-01');
    expect(res.error?.message).not.toContain(fixture.trainerA.userId);
  });

  it('18. kill-test: removing audit exclusion predicate allows WO to read P7 rows; restoring hides them', async () => {
    // Read the current policy qual from pg_catalog
    const [policyBefore] = await db`
      select qual
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_select_scoped'
    `;
    expect(policyBefore?.qual).toContain('workforce');
    expect(policyBefore?.qual).toContain('opaque_reference');

    // Mutate the policy to remove the P7 exclusion predicate (simulate regression)
    await db.unsafe(`
      alter policy audit_events_select_scoped on public.audit_events
        using (app_private.is_platform_owner() or (
          workspace_id is not null
          and app_private.current_staff_role() = 'workspace_owner'::public.staff_role
          and app_private.has_workspace_access(workspace_id, null)
        ))
    `);

    // Under mutated policy, WO can read P7 rows (the guard is breached!)
    const woBreached =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('action, target_table')
          .eq('workspace_id', fixture.wsA.id),
      ) ?? [];
    const leaked = woBreached.filter(
      (r) =>
        r.action.startsWith('workforce.') ||
        r.action === 'audit.opaque_reference' ||
        (r.target_table && r.target_table.startsWith('p7_')) ||
        r.target_table === 'workforce_checkin_transitions' ||
        r.target_table === 'opaque_reference',
    );
    expect(
      leaked.length,
      'Mutated policy must leak P7 rows to WO',
    ).toBeGreaterThan(0);

    // Restore the policy with the exclusion predicate
    await db.unsafe(`
      alter policy audit_events_select_scoped on public.audit_events
        using (
          app_private.is_platform_owner()
          or (
            workspace_id is not null
            and app_private.current_staff_role() = 'workspace_owner'::public.staff_role
            and app_private.has_workspace_access(workspace_id, null)
            and (action not like 'workforce.%' and action <> 'audit.opaque_reference')
            and (target_table is null or (target_table not like 'p7_%' and target_table not in ('workforce_checkin_transitions', 'opaque_reference')))
          )
        )
    `);

    // Verify restored policy restores protection
    const woRestored =
      checked(
        await fixture.woA.client
          .from('audit_events')
          .select('action, target_table')
          .eq('workspace_id', fixture.wsA.id),
      ) ?? [];
    const protectedRows = woRestored.filter(
      (r) =>
        r.action.startsWith('workforce.') ||
        r.action === 'audit.opaque_reference' ||
        (r.target_table && r.target_table.startsWith('p7_')) ||
        r.target_table === 'workforce_checkin_transitions' ||
        r.target_table === 'opaque_reference',
    );
    expect(protectedRows).toHaveLength(0);
  });
});
