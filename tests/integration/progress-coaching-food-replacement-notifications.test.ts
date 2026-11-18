import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TransactionSql } from 'postgres';
import {
  ITEM_NO_ALTS,
  ITEM_ONE_ALT,
  ITEM_THREE_ALTS,
  setupFoodReplacement,
  type FoodReplacementFixture,
} from './progress-coaching-food-replacement-fixture';

// Spec 023 T033 (FR-027, FR-036): the workspace owner is notified when a request opens and the
// client when it is approved or rejected, on the F22 client inbox seam and the staff sibling
// inbox. Foreign-workspace and wrong-role negatives plus rolled-back mutants of the producers.

let x: FoodReplacementFixture;
const rollback = Symbol('rollback');

beforeAll(async () => {
  x = await setupFoodReplacement();
});
afterAll(async () => x?.db.end());

async function submit(revisionId: string, itemId: string) {
  const result = await x.client.client.rpc('submit_food_replacement_request', {
    p_plan_version_id: revisionId,
    p_item_id: itemId,
    p_request_text: 'notification probe',
  });
  expect(result.data).toMatchObject({ status: 'created' });
  return (result.data as { request_id: string }).request_id;
}

type Notice = {
  notice_id: string;
  workspace_id?: string;
  notice_kind: string;
  source_key?: string;
  read_at: string | null;
};

async function staffNotices(actor: SupabaseClient) {
  const result = await actor.rpc('read_staff_notices', {});
  return result as {
    data: { status: string; notices: Notice[] } | null;
    error: { code?: string } | null;
  };
}

async function clientNotices(actor: SupabaseClient) {
  const result = await actor.rpc('read_client_notices', {});
  expect(result.error).toBeNull();
  return (result.data as { notices: Notice[] }).notices;
}

async function inRolledBackTx(body: (tx: TransactionSql) => Promise<void>) {
  try {
    await x.db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function definition(tx: TransactionSql, identity: string) {
  const [row] =
    await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
  return row!.d as string;
}

describe('staff notice when a request opens', () => {
  it('reaches the workspace owner once, never Sales or a foreign workspace, and can be marked read', async () => {
    const { revisionId } = await x.publish(x.doc());
    const requestId = await submit(revisionId, ITEM_ONE_ALT);
    // A repeated submit (already open) does not notify again.
    await x.client.client.rpc('submit_food_replacement_request', {
      p_plan_version_id: revisionId,
      p_item_id: ITEM_ONE_ALT,
      p_request_text: 'again',
    });

    const owner = await staffNotices(x.f.woA.client);
    expect(owner.error).toBeNull();
    const mine = owner.data!.notices.filter((n) => n.source_key === requestId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      notice_kind: 'food_replacement_open',
      workspace_id: x.f.wsA.id,
      read_at: null,
    });

    for (const outsider of [x.f.salesA.client, x.f.trainerB.client]) {
      const view = await staffNotices(outsider);
      expect(view.error).toBeNull();
      expect(
        view.data!.notices.filter((n) => n.source_key === requestId),
      ).toEqual([]);
    }
    // A client is not staff: the staff inbox is closed to them.
    expect((await staffNotices(x.client.client)).error?.code).toBe('42501');

    // Foreign staff, a same-workspace non-recipient and a client cannot mark it read.
    const noticeId = mine[0]!.notice_id;
    for (const actor of [x.f.trainerB.client, x.f.salesA.client]) {
      const attempt = await actor.rpc('mark_staff_notice_read', {
        p_notice_id: noticeId,
      });
      expect(attempt.data).toEqual({ status: 'not_found' });
    }
    expect(
      (
        await x.client.client.rpc('mark_staff_notice_read', {
          p_notice_id: noticeId,
        })
      ).error?.code,
    ).toBe('42501');
    const read = await x.f.woA.client.rpc('mark_staff_notice_read', {
      p_notice_id: noticeId,
    });
    expect(read.data).toEqual({ status: 'read' });
    expect(
      (
        await x.f.woA.client.rpc('mark_staff_notice_read', {
          p_notice_id: noticeId,
        })
      ).data,
    ).toEqual({ status: 'read' });

    // Ids only: neither the notice row nor its audit carries the request text.
    const audit = await x.db`
      select details from public.audit_events
      where action like 'staff_notice.%' and workspace_id = ${x.f.wsA.id}`;
    expect(JSON.stringify(audit)).not.toContain('notification probe');
  });

  it('kills mutants of the owner recipient rule and the mark-read recipient filter', async () => {
    const { revisionId } = await x.publish(x.doc());
    const requestId = await submit(revisionId, ITEM_NO_ALTS);
    const [owner] = await x.db`select id from app_private.staff_inbox_notices
      where source_key = ${requestId} and recipient_user_id = ${x.f.woA.userId}`;
    const noticeId = owner!.id as string;
    await inRolledBackTx(async (tx) => {
      const asUser = async <T>(userId: string, run: () => Promise<T>) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        try {
          return await run();
        } finally {
          await tx`reset role`;
        }
      };
      const trainerMarks = () =>
        asUser(x.f.trainerA.userId, async () => {
          const [row] =
            await tx`select public.mark_staff_notice_read(${noticeId}) as r`;
          return row!.r as { status: string };
        });
      // Control: a same-workspace staff member who is not the recipient cannot mark it.
      expect((await trainerMarks()).status).toBe('not_found');
      const identity = 'public.mark_staff_notice_read(uuid)';
      const original = await definition(tx, identity);
      const mutant = original.replace(
        'where n.id = p_notice_id and n.recipient_user_id = actor',
        'where n.id = p_notice_id',
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      let failed = false;
      try {
        expect((await trainerMarks()).status).toBe('not_found');
      } catch {
        failed = true;
      }
      await tx.unsafe(original);
      expect(failed, 'recipient filter mutant must fail').toBe(true);
    });

    // The owner rule: dropping the owner branch leaves the owner without a notice.
    await inRolledBackTx(async (tx) => {
      const identity = 'app_private.f23_notify_food_request_change()';
      const original = await definition(tx, identity);
      const mutant = original.replace(
        "p.role = 'workspace_owner'::public.staff_role",
        "p.role = 'sales'::public.staff_role",
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      let failed = false;
      try {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: x.client.authUserId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        const [created] =
          await tx`select public.submit_food_replacement_request(${revisionId}, ${ITEM_THREE_ALTS}, 'owner rule probe') as r`;
        await tx`reset role`;
        const newId = (created!.r as { request_id: string }).request_id;
        const [count] =
          await tx`select count(*)::int as n from app_private.staff_inbox_notices
          where source_key = ${newId} and recipient_user_id = ${x.f.woA.userId}`;
        expect(count!.n).toBe(1);
      } catch {
        failed = true;
      }
      await tx.unsafe(original);
      expect(failed, 'owner rule mutant must fail').toBe(true);
    });
  });
});

describe('client notice when a request is resolved', () => {
  it('notifies the client on reject and on approval, never on cancel or stale, and no other client', async () => {
    // Reject.
    const first = await x.publish(x.doc());
    const rejectedId = await submit(first.revisionId, ITEM_ONE_ALT);
    expect(
      (
        await x.f.trainerA.client.rpc('reject_food_replacement_request', {
          p_request_id: rejectedId,
        })
      ).data,
    ).toEqual({ status: 'rejected' });

    // Cancel (silent).
    const cancelId = await submit(first.revisionId, ITEM_NO_ALTS);
    await x.client.client.rpc('cancel_food_replacement_request', {
      p_request_id: cancelId,
    });

    // Approve through the manual publish.
    const second = await x.publish(x.doc());
    const approvedId = await submit(second.revisionId, ITEM_ONE_ALT);
    const approval = await x.f.trainerA.client.rpc(
      'approve_food_replacement_request',
      {
        p_request_id: approvedId,
        p_food_id: x.foods.replacement,
        p_food_version: 1,
        p_quantity: { value: '120', unit: { kind: 'basis', value: 'g' } },
        p_replace_alternative_id: null,
        p_expected_draft_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(approval.data).toMatchObject({ status: 'prepared' });
    // Prepared but unpublished: no client notice yet.
    const beforePublish = await clientNotices(x.client.client);
    expect(
      beforePublish.filter((n) => n.notice_kind === 'food_replacement_resolved')
        .length,
    ).toBe(1);
    const published = await x.f.trainerA.client.rpc(
      'publish_nutrition_revision',
      {
        p_plan_id: (
          await x.db`select plan_id from public.food_replacement_requests where id = ${approvedId}`
        )[0]!.plan_id,
        p_expected_draft_version: 2,
        p_expected_published_version: 1,
        p_operation_key: randomUUID(),
      },
    );
    expect(published.data).toMatchObject({ status: 'ok' });

    const rows = await x.db`
      select n.source_key, n.notice_kind from app_private.client_inbox_notices n
      where n.workspace_id = ${x.f.wsA.id} and n.client_id = ${x.clientId}
        and n.notice_kind = 'food_replacement_resolved'`;
    const keys = rows.map((row) => row.source_key as string).sort();
    expect(keys).toEqual([rejectedId, approvedId].sort());
    expect(keys).not.toContain(cancelId);

    // The owning client reads them; another client of the workspace and staff do not.
    expect(
      (await clientNotices(x.client.client)).filter(
        (n) => n.notice_kind === 'food_replacement_resolved',
      ),
    ).toHaveLength(2);
    expect(
      (await clientNotices(x.otherClient.client)).filter(
        (n) => n.notice_kind === 'food_replacement_resolved',
      ),
    ).toEqual([]);
    expect(
      (await x.f.trainerB.client.rpc('read_client_notices', {})).data,
    ).toEqual({ status: 'invalid' });
  });

  it('does not notify the client when the request closes as stale', async () => {
    const { planId, revisionId } = await x.publish(x.doc());
    const requestId = await submit(revisionId, ITEM_ONE_ALT);
    await x.f.trainerA.client.rpc('save_plan_draft', {
      p_plan_id: planId,
      p_expected_draft_version: 1,
      p_content: x.doc('without-item-one'),
      p_operation_key: randomUUID(),
    });
    await x.f.trainerA.client.rpc('publish_nutrition_revision', {
      p_plan_id: planId,
      p_expected_draft_version: 2,
      p_expected_published_version: 1,
      p_operation_key: randomUUID(),
    });
    const [status] =
      await x.db`select status from public.food_replacement_requests where id = ${requestId}`;
    expect(status!.status).toBe('stale_closed');
    const [notices] =
      await x.db`select count(*)::int as n from app_private.client_inbox_notices
      where source_key = ${requestId}`;
    expect(notices!.n).toBe(0);
  });

  it('kills a mutant of the resolution producer', async () => {
    const { revisionId } = await x.publish(x.doc());
    const requestId = await submit(revisionId, ITEM_ONE_ALT);
    await inRolledBackTx(async (tx) => {
      const identity = 'app_private.f23_notify_food_request_change()';
      const original = await definition(tx, identity);
      const resolved = async () => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: x.f.trainerA.userId, role: 'authenticated' })},true)`;
        await tx`set local role authenticated`;
        await tx`select public.reject_food_replacement_request(${requestId})`;
        await tx`reset role`;
        const [row] =
          await tx`select count(*)::int as n from app_private.client_inbox_notices
          where source_key = ${requestId} and notice_kind = 'food_replacement_resolved'`;
        expect(row!.n).toBe(1);
      };
      const mutant = original.replace(
        "new.status in ('approved', 'rejected')",
        "new.status in ('approved')",
      );
      expect(mutant).not.toBe(original);
      await tx.unsafe(mutant);
      let failed = false;
      try {
        await resolved();
      } catch {
        failed = true;
      }
      await tx.unsafe(original);
      expect(failed, 'resolution producer mutant must fail').toBe(true);
    });
  });
});
