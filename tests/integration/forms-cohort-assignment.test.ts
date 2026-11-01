import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { clientContext, sql } from './registration-approval-operations-fixture';

const db = sql();
afterAll(() => db.end());
async function createForm(workspaceId: string) {
  const policy = `t010-${randomUUID()}`;
  const formId = randomUUID();
  await db`insert into app_private.terms_policy_versions(version,policy_kind,status)
    values(${policy},'terms','published')`;
  await db`insert into public.forms(id,workspace_id,name) values(${formId},${workspaceId},'T010 policy')`;
  await db`insert into public.form_versions(workspace_id,form_id,version_number,terms_policy_version,definition,status)
    values(${workspaceId},${formId},1,${policy},${db.json({ questions: [] })},'published')`;
  return formId;
}

function policyArgs(
  workspaceId: string,
  formId: string,
  audience = 'all_active_clients',
  trigger = 'manual',
) {
  return {
    p_workspace_id: workspaceId,
    p_form_id: formId,
    p_version_number: 1,
    p_audience_kind: audience,
    p_specific_client_ids: [],
    p_trigger_kind: trigger,
    p_timing: { client_deadline_days: 3 },
    p_stop_conditions: { frozen: true, inactive: true },
  };
}

describe('T010/T023 per-form assignment policy', () => {
  it('defines scoped audience policy and occurrence-bound immutable snapshots with separate deadlines', async () => {
    const policies = await db`
      select column_name from information_schema.columns
      where table_schema='app_private' and table_name='form_assignment_policies'
    `;
    expect(policies.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'workspace_id',
        'form_id',
        'version_number',
        'audience_kind',
        'specific_client_ids',
        'trigger_kind',
        'timing',
        'stop_conditions',
        'configured_by',
        'configured_at',
      ]),
    );
    const assignmentColumns = await db`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='form_assignments'
    `;
    expect(assignmentColumns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining([
        'occurrence_key',
        'audience_snapshot_at',
        'client_deadline_at',
        'policy_id',
        'configured_by',
      ]),
    );
    const indexes = await db`
      select indexdef from pg_indexes
      where schemaname='public' and tablename='form_assignments'
    `;
    expect(indexes.map((row) => row.indexdef).join('\n')).toMatch(
      /workspace_id, client_id, form_id, occurrence_key/,
    );
  });

  it('rejects replayed occurrences and mutation of frozen audience/version/deadline facts', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const configured = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(configured.error).toBeNull();
    expect(configured.data).toEqual({ status: 'configured' });
    const occurrenceKey = `occ-${randomUUID()}`;
    const materialized = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(materialized.error).toBeNull();
    expect(materialized.data).toMatchObject({
      status: 'materialized',
      count: 0,
    });
    const replay = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(replay.data).toEqual({ status: 'already_materialized', count: 0 });
    const changedAudience = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      {
        ...policyArgs(context.wsA.id, formId, 'new_clients', 'onboarding'),
        p_timing: { client_deadline_days: 7 },
      },
    );
    expect(changedAudience.data).toEqual({ status: 'configured' });
    const replayAfterPolicyChange = await context.po.client.rpc(
      'materialize_intake_assignment_occurrence',
      {
        p_workspace_id: context.wsA.id,
        p_form_id: formId,
        p_occurrence_key: occurrenceKey,
      },
    );
    expect(replayAfterPolicyChange.data).toEqual({
      status: 'already_materialized',
      count: 0,
    });
    const [snapshot] =
      await db`select * from app_private.form_assignment_occurrences
      where workspace_id=${context.wsA.id} and occurrence_key=${occurrenceKey}`;
    expect(snapshot?.audience_client_ids).toEqual([]);
    expect(snapshot?.trigger_kind).toBe('manual');
    const [currentPolicy] =
      await db`select audience_kind from app_private.form_assignment_policies
      where workspace_id=${context.wsA.id} and form_id=${formId}`;
    expect(currentPolicy?.audience_kind).toBe('new_clients');
    await expect(db`
      update app_private.form_assignment_occurrences set audience_client_ids=array[${randomUUID()}::uuid]
      where workspace_id=${context.wsA.id} and occurrence_key=${occurrenceKey}
    `).rejects.toThrow(/immutable/);
  });

  it('denies Sales configuration and rechecks the configuring actor after lock wait', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const denied = await context.salesA.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(denied.error).toBeNull();
    expect(denied.data).toEqual({ status: 'not_found' });
  });

  it('returns no policy write when authorization is revoked during the form lock wait', async () => {
    const context = await clientContext();
    const formId = await createForm(context.wsA.id);
    const initial = await context.po.client.rpc(
      'configure_intake_assignment_policy',
      policyArgs(context.wsA.id, formId),
    );
    expect(initial.data).toEqual({ status: 'configured' });
    const lockKey = `${context.wsA.id}:${formId}`;
    const blocker = sql();
    const selector = sql();
    let signal!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => (signal = resolve));
    const hold = blocker.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(pg_catalog.hashtextextended(${lockKey},0))`;
      signal();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await acquired;
    let pending: Promise<unknown> | undefined;
    try {
      pending = selector.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: context.trainerA.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [row] = await tx`select public.configure_intake_assignment_policy(
          ${context.wsA.id},${formId},1,'new_clients','{}'::uuid[],'onboarding',
          '{"client_deadline_days":7}'::jsonb,'{"frozen":true,"inactive":true}'::jsonb) as result`;
        return row?.result;
      });
      let waiting = false;
      const deadline = Date.now() + 8000;
      while (!waiting && Date.now() < deadline) {
        const [row] = await db`select exists(select 1 from pg_stat_activity
          where datname=current_database() and state='active' and wait_event_type='Lock'
            and wait_event='advisory' and query ilike '%configure_intake_assignment_policy%') as waiting`;
        waiting = Boolean(row?.waiting);
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(
        waiting,
        'configuration must wait on the serialized policy lock',
      ).toBe(true);
      await db`update public.workspace_memberships set revoked_at=clock_timestamp(),revoked_by=${context.po.userId}
        where workspace_id=${context.wsA.id} and user_id=${context.trainerA.userId} and revoked_at is null`;
      release();
      await hold;
      expect(await pending).toEqual({ status: 'not_found' });
      const [row] =
        await db`select audience_kind,configured_by from app_private.form_assignment_policies
        where workspace_id=${context.wsA.id} and form_id=${formId}`;
      expect(row?.audience_kind).toBe('all_active_clients');
      expect(row?.configured_by).toBe(context.po.userId);
    } finally {
      if (release) release();
      await Promise.allSettled([hold, ...(pending ? [pending] : [])]);
      await blocker.end();
      await selector.end();
    }
  });
});
