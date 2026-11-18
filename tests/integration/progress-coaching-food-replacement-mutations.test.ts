import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JSONValue, TransactionSql } from 'postgres';
import {
  ITEM_NO_ALTS,
  ITEM_ONE_ALT,
  ITEM_THREE_ALTS,
  setupFoodReplacement,
  type FoodReplacementFixture,
} from './progress-coaching-food-replacement-fixture';

// Spec 023 T034 (FR-025, FR-027): CI-runnable database mutation evidence for the food
// replacement state machine. Each control is first shown to hold, then replaced inside a
// rolled-back transaction by a mutant with the control removed; the paired invariant must
// then fail. The transaction always rolls back, so nothing leaks into other suites.

type Tx = TransactionSql;
const rollback = Symbol('rollback');

let x: FoodReplacementFixture;
beforeAll(async () => {
  x = await setupFoodReplacement();
});
afterAll(async () => x?.db.end());

async function inRolledBackTx(body: (tx: Tx) => Promise<void>) {
  try {
    await x.db.begin(async (tx) => {
      await body(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function asUser<T>(
  tx: Tx,
  userId: string,
  run: (sp: Tx) => Promise<T>,
): Promise<T> {
  return (await tx.savepoint(async (sp) => {
    await sp`select set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated' })},true)`;
    await sp`set local role authenticated`;
    const result = await run(sp as Tx);
    await sp`reset role`;
    return result;
  })) as T;
}

async function definition(tx: Tx, identity: string) {
  const [row] =
    await tx`select pg_catalog.pg_get_functiondef(${identity}::regprocedure) as d`;
  return row!.d as string;
}

async function withMutant(
  tx: Tx,
  identity: string,
  edits: [string, string][],
  body: () => Promise<void>,
) {
  const original = await definition(tx, identity);
  let mutant = original;
  for (const [from, to] of edits) {
    if (!mutant.includes(from))
      throw new Error(`Mutation anchor missing in ${identity}: ${from}`);
    mutant = mutant.replace(from, to);
  }
  await tx.unsafe(mutant);
  try {
    await body();
  } finally {
    await tx.unsafe(original);
  }
}

async function expectInvariantFailure(
  label: string,
  invariant: () => Promise<void>,
) {
  let failure: unknown;
  try {
    await invariant();
  } catch (error) {
    failure = error;
  }
  expect(failure, `${label}: the mutant must fail its invariant`).toBeDefined();
}

const GUARD = 'app_private.f23_guard_food_replacement_request()';
const REJECT = 'public.reject_food_replacement_request(uuid)';
const APPROVE =
  'public.approve_food_replacement_request(uuid,uuid,integer,jsonb,text,bigint,uuid)';
const RECONCILE = 'app_private.f23_reconcile_food_requests()';

async function openRequest(itemId: string) {
  const { planId, revisionId } = await x.publish(x.doc());
  const created = await x.client.client.rpc('submit_food_replacement_request', {
    p_plan_version_id: revisionId,
    p_item_id: itemId,
    p_request_text: 'mutation probe',
  });
  expect(created.data).toMatchObject({ status: 'created' });
  return {
    planId,
    requestId: (created.data as { request_id: string }).request_id,
  };
}

const quantity = {
  value: '120',
  unit: { kind: 'basis', value: 'g' },
} as unknown as JSONValue;

async function approveAs(
  tx: Tx,
  requestId: string,
  expectedDraftVersion: number,
) {
  return asUser(tx, x.f.trainerA.userId, async (sp) => {
    const [row] = await sp`
      select public.approve_food_replacement_request(
        ${requestId}, ${x.foods.replacement}, 1, ${sp.json(quantity)}, null,
        ${expectedDraftVersion}, ${randomUUID()}) as r`;
    return row!.r as { status: string };
  });
}

describe('food replacement database mutation evidence', () => {
  it('kills mutants of the write guard: direct DML, closed rows and the immutable text', async () => {
    const { requestId } = await openRequest(ITEM_ONE_ALT);
    await inRolledBackTx(async (tx) => {
      // Control: direct DML is refused, even for the table owner.
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update public.food_replacement_requests set status = 'approved', resolved_at = now() where id = ${requestId}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await withMutant(
        tx,
        GUARD,
        [
          [
            "pg_catalog.current_setting('app.f23_food_request_write', true) is distinct from 'on'",
            'false',
          ],
        ],
        async () => {
          await expectInvariantFailure('direct DML guard', async () => {
            await expect(
              tx.savepoint(
                (sp) =>
                  sp`update public.food_replacement_requests set status = 'approved', resolved_at = now() where id = ${requestId}`,
              ),
            ).rejects.toMatchObject({ code: '23514' });
          });
        },
      );
    });

    await inRolledBackTx(async (tx) => {
      await tx`select set_config('app.f23_food_request_write', 'on', true)`;
      await tx`update public.food_replacement_requests set status = 'rejected', resolved_at = now() where id = ${requestId}`;
      // Control: a closed row cannot change again.
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update public.food_replacement_requests set status = 'approved' where id = ${requestId}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await withMutant(
        tx,
        GUARD,
        [["if old.status <> 'open' then", 'if false then']],
        async () => {
          await expectInvariantFailure(
            'closed rows are immutable',
            async () => {
              await expect(
                tx.savepoint(
                  (sp) =>
                    sp`update public.food_replacement_requests set status = 'approved' where id = ${requestId}`,
                ),
              ).rejects.toMatchObject({ code: '23514' });
            },
          );
        },
      );
    });

    await inRolledBackTx(async (tx) => {
      await tx`select set_config('app.f23_food_request_write', 'on', true)`;
      // Control: the request text never changes while open.
      await expect(
        tx.savepoint(
          (sp) =>
            sp`update public.food_replacement_requests set request_text = 'edited' where id = ${requestId}`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await withMutant(
        tx,
        GUARD,
        [
          [
            "raise exception 'food_replacement_request_text_immutable' using errcode = '23514';",
            'null;',
          ],
        ],
        async () => {
          await expectInvariantFailure('text immutability', async () => {
            await expect(
              tx.savepoint(
                (sp) =>
                  sp`update public.food_replacement_requests set request_text = 'edited' where id = ${requestId}`,
              ),
            ).rejects.toMatchObject({ code: '23514' });
          });
        },
      );
    });
  });

  it('kills a mutant of the SECURITY DEFINER coaching wall on reject', async () => {
    const { requestId } = await openRequest(ITEM_ONE_ALT);
    await inRolledBackTx(async (tx) => {
      const salesRejects = () =>
        asUser(tx, x.f.salesA.userId, async (sp) => {
          await sp`select public.reject_food_replacement_request(${requestId})`;
        });
      await expect(salesRejects()).rejects.toMatchObject({ code: '42501' });
      await withMutant(
        tx,
        REJECT,
        [
          [
            "not app_private.has_workspace_access(v_request.workspace_id, 'coaching_work')",
            'false',
          ],
        ],
        async () => {
          await expectInvariantFailure('reject wall', async () => {
            await expect(salesRejects()).rejects.toMatchObject({
              code: '42501',
            });
          });
        },
      );
    });
  });

  it('kills mutants of the max-3 cap and of the draft-only approval', async () => {
    const { planId, requestId } = await openRequest(ITEM_THREE_ALTS);
    await inRolledBackTx(async (tx) => {
      // Control: a fourth alternative is refused and the draft is untouched.
      expect((await approveAs(tx, requestId, 1)).status).toBe('cap_reached');
      await withMutant(
        tx,
        APPROVE,
        [
          ['if jsonb_array_length(v_alts) >= 3 then', 'if false then'],
          ['if jsonb_array_length(v_next_alts) > 3 then', 'if false then'],
        ],
        async () => {
          await expectInvariantFailure('max-3 cap', async () => {
            expect((await approveAs(tx, requestId, 1)).status).toBe(
              'cap_reached',
            );
          });
        },
      );
    });
    const [draft] =
      await x.db`select draft_version from public.plan_drafts where plan_id = ${planId}`;
    expect(Number(draft!.draft_version)).toBe(1);

    const open = await openRequest(ITEM_NO_ALTS);
    await inRolledBackTx(async (tx) => {
      await approveAs(tx, open.requestId, 1);
      // Control: approval leaves the request open and creates no revision.
      const [state] = await tx`
        select r.status, (select count(*)::int from public.plan_revisions where plan_id = ${open.planId}) as revisions
        from public.food_replacement_requests r where r.id = ${open.requestId}`;
      expect(state).toMatchObject({ status: 'open', revisions: 1 });
    });
  });

  it('kills a mutant of the stale-close on publish', async () => {
    for (const mutate of [false, true]) {
      const { planId, requestId } = await openRequest(ITEM_ONE_ALT);
      const run = async (tx: Tx) => {
        await asUser(tx, x.f.trainerA.userId, async (sp) => {
          await sp`select public.save_plan_draft(${planId}, 1,
            ${sp.json(x.doc('without-item-one') as unknown as JSONValue)}, ${randomUUID()})`;
          await sp`select public.publish_nutrition_revision(${planId}, 2, 1, ${randomUUID()})`;
        });
        const [row] =
          await tx`select status from public.food_replacement_requests where id = ${requestId}`;
        expect(row!.status).toBe('stale_closed');
      };
      await inRolledBackTx(async (tx) => {
        if (!mutate) return run(tx);
        await withMutant(
          tx,
          RECONCILE,
          [["v_next := 'stale_closed';", 'v_next := null;']],
          async () => {
            await expectInvariantFailure('stale-close', () => run(tx));
          },
        );
      });
    }
  });
});
