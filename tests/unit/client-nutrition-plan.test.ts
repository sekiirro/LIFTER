import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadClientNutritionPlan } from '../../lib/client-access/portal';
import { projectClientNutritionPlan } from '../../lib/client-access/nutrition-projection';
import {
  ALT_ONE,
  ALT_TWO,
  CLIENT_ID,
  ITEM_ID,
  PLAN_ID,
  REVISION_ID,
  WORKSPACE_ID,
  rawOk,
} from './client-nutrition-fixture';

// F22 T017/T027/T029 (FR-004, FR-006, FR-008, FR-010; S57-PO-9): the app wall
// over the client-wall read of one own delivered nutrition revision.
const requested = { planId: PLAN_ID, revisionNumber: null };

describe('F22 client nutrition plan projection', () => {
  it('builds the F18 export projection for the selected revision without selections', () => {
    const result = projectClientNutritionPlan(rawOk(), requested);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.projection).toMatchObject({
      plan: {
        id: PLAN_ID,
        workspaceId: WORKSPACE_ID,
        clientId: CLIENT_ID,
        title: 'Synthetic Plan',
      },
      revision: {
        id: REVISION_ID,
        revisionNumber: 2,
        publishedAt: '2026-11-10T12:00:00Z',
      },
      selection: [],
      selectedValues: null,
    });
    expect(result.projection.selectedAlternativeIds).toEqual({});
  });

  it('recomputes selected totals from the revision snapshot (client selection, S43-PO-8)', () => {
    const result = projectClientNutritionPlan(
      rawOk({ selections: [{ item_id: ITEM_ID, alternative_id: ALT_ONE }] }),
      requested,
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.projection.selectedAlternativeIds).toEqual({
      [ITEM_ID]: ALT_ONE,
    });
    // 150 g of 150 kcal/100 g.
    expect(result.projection.selectedValues?.items[ITEM_ID]?.kcal).toBe(
      '225.00',
    );
    const other = projectClientNutritionPlan(
      rawOk({
        selections: [{ item_id: ITEM_ID, alternative_id: ALT_TWO }],
        revisionNumber: 1,
      }),
      { planId: PLAN_ID, revisionNumber: 1 },
    );
    if (other.status !== 'ok') throw new Error('expected ok');
    expect(other.projection.selectedValues?.items[ITEM_ID]?.kcal).toBe(
      '400.00',
    );
  });

  it('fails closed on a selection that the revision cannot resolve', () => {
    expect(
      projectClientNutritionPlan(
        rawOk({
          selections: [{ item_id: ITEM_ID, alternative_id: 'not-an-alt' }],
        }),
        requested,
      ),
    ).toEqual({ status: 'denied' });
  });

  it('never returns content for a restricted or non-active state', () => {
    for (const status of [
      'awaiting_activation',
      'future',
      'frozen',
      'expired',
      'refunded',
    ]) {
      const raw = {
        ...rawOk(),
        subscription: {
          status,
          effective_end_exclusive: null,
          ...(status === 'refunded' ? { refund_scope: 'full' } : {}),
        },
      };
      const result = projectClientNutritionPlan(raw, requested);
      expect(result.status, status).toBe('restricted');
      expect(JSON.stringify(result), status).not.toContain('Synthetic Plan');
      expect(JSON.stringify(result), status).not.toContain(REVISION_ID);
    }
    // A `restricted` status with an active state carries no content either.
    expect(
      projectClientNutritionPlan(
        { status: 'restricted', subscription: rawOk().subscription },
        requested,
      ).status,
    ).toBe('restricted');
  });

  it('passes not_found through and denies malformed, mismatched or unknown shapes', () => {
    expect(
      projectClientNutritionPlan({ status: 'not_found' }, requested),
    ).toEqual({ status: 'not_found' });
    for (const raw of [
      null,
      [],
      { status: 'invalid' },
      { status: 'ok' },
      { ...rawOk(), plan: { ...rawOk().plan, plan_id: REVISION_ID } },
      { ...rawOk(), plan: { ...rawOk().plan, revision_number: 0 } },
      { ...rawOk(), plan: { ...rawOk().plan, revision_id: 'x' } },
      { ...rawOk(), content: { ...rawOk().content, document: null } },
      { ...rawOk(), selections: [{ item_id: '', alternative_id: ALT_ONE }] },
      {
        ...rawOk(),
        selections: [
          { item_id: ITEM_ID, alternative_id: ALT_ONE },
          { item_id: ITEM_ID, alternative_id: ALT_TWO },
        ],
      },
    ])
      expect(projectClientNutritionPlan(raw, requested), String(raw)).toEqual({
        status: 'denied',
      });
    // A response for another revision than the requested one is denied.
    expect(
      projectClientNutritionPlan(rawOk({ revisionNumber: 3 }), {
        planId: PLAN_ID,
        revisionNumber: 2,
      }),
    ).toEqual({ status: 'denied' });
  });

  it('reads through client_portal_nutrition_plan with only the plan and revision', async () => {
    const rpc = vi.fn(async () => ({
      data: rawOk({ revisionNumber: 2 }),
      error: null,
    }));
    const result = await loadClientNutritionPlan({ rpc }, PLAN_ID, 2);
    expect(result.status).toBe('ok');
    expect(rpc).toHaveBeenCalledWith('client_portal_nutrition_plan', {
      p_plan_id: PLAN_ID,
      p_revision_number: 2,
    });
    const failing = vi.fn(async () => ({
      data: null,
      error: { code: '42501' },
    }));
    await expect(
      loadClientNutritionPlan({ rpc: failing }, PLAN_ID, null),
    ).resolves.toEqual({ status: 'denied' });
    const thrown = vi.fn(async () => {
      throw new Error('network');
    });
    await expect(
      loadClientNutritionPlan({ rpc: thrown }, PLAN_ID, null),
    ).resolves.toEqual({ status: 'denied' });
  });
});
