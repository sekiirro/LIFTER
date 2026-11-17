import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import {
  clientContext,
  graph,
  sql,
  type Context,
} from './registration-approval-fixture';
import { checked, issue } from './registration-links-fixture';
import { seedSubmittedIntake } from './f17-plan-publish-fixture';
import { PUBLISH_RPC } from '../../lib/plans/ready-and-publish';

type PlanKind = 'workout' | 'nutrition';

// Current F17/F18 document shapes (the generic F19 fixture shape is gone: F18
// validates nutrition documents at publish and F17 gates workout delivery).
export function portalPlanContent(kind: PlanKind, title: string) {
  return kind === 'nutrition'
    ? {
        schemaVersion: 1,
        structure: 'single_day',
        implicitDayTypeId: 'dt-1',
        dayTypes: [
          { id: 'dt-1', trainingDay: false, name: { ar: 'يوم', en: 'Day' } },
        ],
        meals: [],
        title: { ar: title, en: title },
      }
    : { schema_version: 1, days: [], notes: title };
}

// F22 synthetic fixtures. Every client, plan and name is generated test data.
export type PortalClient = {
  clientId: string;
  subscriptionId: string;
  authUserId: string;
  name: string;
  email: string;
  phone: string;
};

export type PortalFixture = Awaited<ReturnType<typeof portalFixture>>;

export async function portalFixture() {
  const fixture: Context = await clientContext();
  const db = sql();
  let firstLinkUsed = false;
  const run = `F22-${randomUUID().slice(0, 8)}`;
  const planKinds = new Map<string, PlanKind>();
  const intakeSeeded = new Set<string>();

  async function makeClient(options: {
    activate: boolean;
    label: string;
    // Existing auth user (e2e sign-in); default: a fresh synthetic identity.
    authUserId?: string;
  }): Promise<PortalClient> {
    const linkId = firstLinkUsed
      ? (checked(await issue(fixture)) as string)
      : fixture.link;
    firstLinkUsed = true;
    const name = `${run} ${options.label}`;
    const ids = await db.begin(async (tx) => {
      const created = await graph(tx, fixture, {
        linkId,
        ...(options.authUserId ? { authUserId: options.authUserId } : {}),
      });
      // Synthetic display name so directory searches are unique to this run.
      // Bypass the F12 transition guard for this synthetic fixture edit only.
      // ALTER TABLE cannot run here: graph() leaves pending trigger events.
      await tx`set local session_replication_role = replica`;
      await tx`update public.clients set name=${name} where id=${created.client}`;
      await tx`set local session_replication_role = origin`;
      return created;
    });
    if (options.activate)
      // F19 T021 guard: a synthetic activation without deliveries is a PO override.
      await db`insert into public.subscription_activations(workspace_id,subscription_id,activated_at,delivery_event_id,activation_source)
        values(${fixture.wsA.id},${ids.subscription},clock_timestamp(),${randomUUID()},'po_override')`;
    const [row] =
      await db`select auth_user_id,email_normalized,phone_e164 from public.clients where id=${ids.client}`;
    return {
      clientId: ids.client,
      subscriptionId: ids.subscription,
      authUserId: row!.auth_user_id as string,
      name,
      email: row!.email_normalized as string,
      phone: row!.phone_e164 as string,
    };
  }

  async function createDraft(
    clientId: string,
    kind: PlanKind,
    title: string,
    // The creator. F17/F18 record contributors per revision: a revision whose
    // draft creator never saved through save_plan_draft must be published by
    // that same creator (F19 plan_revision_contributors rule).
    creator: { rpc: typeof fixture.trainerA.client.rpc } = fixture.trainerA
      .client,
  ): Promise<string> {
    // F17 T020: workout delivery requires a submitted F15 intake.
    if (kind === 'workout' && !intakeSeeded.has(clientId)) {
      await db.begin((tx) => seedSubmittedIntake(tx, fixture.wsA.id, clientId));
      intakeSeeded.add(clientId);
    }
    const created = await creator.rpc('create_plan_draft', {
      p_workspace_id: fixture.wsA.id,
      p_client_id: clientId,
      p_plan_kind: kind,
      p_content: portalPlanContent(kind, title),
      p_operation_key: randomUUID(),
    });
    if (created.error) throw new Error('F22 fixture draft failed');
    planKinds.set(created.data as string, kind);
    return created.data as string;
  }

  /** The kind-specific publish RPC for a plan made by `createDraft`. */
  function publishRpc(planId: string): string {
    const kind = planKinds.get(planId);
    if (!kind) throw new Error('F22 fixture plan kind unknown');
    return PUBLISH_RPC[kind];
  }

  function planKind(planId: string): PlanKind {
    const kind = planKinds.get(planId);
    if (!kind) throw new Error('F22 fixture plan kind unknown');
    return kind;
  }

  async function publish(
    planId: string,
    expectedDraftVersion: number,
    expectedPublishedVersion: number,
  ) {
    const result = await fixture.trainerA.client.rpc(publishRpc(planId), {
      p_plan_id: planId,
      p_expected_draft_version: expectedDraftVersion,
      p_expected_published_version: expectedPublishedVersion,
      p_operation_key: randomUUID(),
    });
    if (result.error || (result.data as { status?: string })?.status !== 'ok')
      throw new Error('F22 fixture publish failed');
    return result.data as { revision_number: number };
  }

  async function revise(planId: string, draftVersion: number, title: string) {
    const saved = await fixture.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: draftVersion,
      p_content: portalPlanContent(planKind(planId), title),
      p_operation_key: randomUUID(),
    });
    if (saved.error) throw new Error('F22 fixture save failed');
    return saved.data as number;
  }

  return {
    fixture,
    db,
    run,
    makeClient,
    createDraft,
    publishRpc,
    planKind,
    publish,
    revise,
    close: () => db.end(),
  };
}

/** Run SQL as a signed `authenticated` identity inside one transaction. */
export async function asUser<T>(
  tx: TransactionSql,
  userId: string,
  body: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
  await tx`set local role authenticated`;
  try {
    return await body(tx);
  } finally {
    await tx`reset role`;
  }
}

export async function clientRead(
  db: ReturnType<typeof sql>,
  userId: string,
  call: 'overview' | { planId: string; revision: number | null },
): Promise<Record<string, unknown>> {
  return db.begin((tx) =>
    asUser(tx, userId, async (inner) => {
      const [row] =
        call === 'overview'
          ? await inner`select public.client_portal_overview() as value`
          : await inner`select public.client_portal_plan(${call.planId}::uuid,${call.revision}::integer) as value`;
      return row!.value as Record<string, unknown>;
    }),
  );
}
