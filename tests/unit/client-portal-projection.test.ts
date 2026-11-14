import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/server', () => ({
  createSessionClient: async () => null,
}));
import {
  parseRevisionParam,
  projectClientPortalOverview,
  projectClientPortalPlan,
} from '../../lib/client-access/portal-projection';
import {
  loadClientPortalOverview,
  loadClientPortalPlan,
} from '../../lib/client-access/portal';

// Synthetic identifiers only.
const planA = '11111111-1111-4111-8111-111111111111';
const planB = '22222222-2222-4222-8222-222222222222';
const active = { status: 'active', effective_end_exclusive: '2026-12-14' };

const deliveredPlan = (planId: string, kind: string, revision: number) => ({
  plan_id: planId,
  plan_kind: kind,
  revision_number: revision,
  published_at: '2026-11-14T10:00:00+02:00',
});

describe('F22 delivered-plan projection (T012; FR-004/005, SC-004)', () => {
  it('returns each delivered plan once with its latest delivered revision and F13 summary', () => {
    const result = projectClientPortalOverview({
      status: 'ok',
      subscription: active,
      plans: [
        deliveredPlan(planA, 'workout', 3),
        deliveredPlan(planB, 'nutrition', 1),
      ],
    });
    expect(result).toEqual({
      status: 'ok',
      subscription: { status: 'active', effectiveEndExclusive: '2026-12-14' },
      plans: [
        {
          planId: planA,
          kind: 'workout',
          revisionNumber: 3,
          publishedAt: '2026-11-14T10:00:00+02:00',
        },
        {
          planId: planB,
          kind: 'nutrition',
          revisionNumber: 1,
          publishedAt: '2026-11-14T10:00:00+02:00',
        },
      ],
    });
  });

  it('keeps the empty state with the subscription summary', () => {
    expect(
      projectClientPortalOverview({
        status: 'ok',
        subscription: active,
        plans: [],
      }),
    ).toMatchObject({ status: 'ok', plans: [] });
  });

  it('denies duplicated plan identities and malformed rows instead of rendering them', () => {
    expect(
      projectClientPortalOverview({
        status: 'ok',
        subscription: active,
        plans: [
          deliveredPlan(planA, 'workout', 2),
          deliveredPlan(planA, 'workout', 1),
        ],
      }),
    ).toEqual({ status: 'denied' });
    expect(
      projectClientPortalOverview({
        status: 'ok',
        subscription: active,
        plans: [deliveredPlan(planA, 'draft', 1)],
      }),
    ).toEqual({ status: 'denied' });
    for (const raw of [null, [], 'ok', { status: 'invalid' }, { status: 'ok' }])
      expect(projectClientPortalOverview(raw)).toEqual({ status: 'denied' });
  });

  it('rejects an unknown F13 status or a non-date end boundary', () => {
    expect(
      projectClientPortalOverview({
        status: 'ok',
        subscription: { status: 'overdue', effective_end_exclusive: null },
        plans: [],
      }),
    ).toEqual({ status: 'denied' });
    expect(
      projectClientPortalOverview({
        status: 'ok',
        subscription: { status: 'active', effective_end_exclusive: 'soon' },
        plans: [],
      }),
    ).toEqual({ status: 'denied' });
  });
});

describe('F22 restricted projection (T015/T018 control; FR-004/006/007, SC-006)', () => {
  it('exposes only status, end date and the restricted state when F13 denies', () => {
    const result = projectClientPortalOverview({
      status: 'restricted',
      subscription: {
        status: 'expired',
        effective_end_exclusive: '2026-11-01',
      },
      plans: [deliveredPlan(planA, 'workout', 1)],
    });
    expect(result).toEqual({
      status: 'restricted',
      subscription: { status: 'expired', effectiveEndExclusive: '2026-11-01' },
    });
    expect(JSON.stringify(result)).not.toContain(planA);
  });

  it('treats every non-active F13 state as restricted even if the transport says ok', () => {
    for (const status of [
      'awaiting_activation',
      'future',
      'frozen',
      'expired',
      'refunded',
    ]) {
      const result = projectClientPortalOverview({
        status: 'ok',
        subscription: { status, effective_end_exclusive: null },
        plans: [deliveredPlan(planA, 'workout', 1)],
      });
      expect(result, status).toEqual({
        status: 'restricted',
        subscription: { status, effectiveEndExclusive: null },
      });
    }
  });

  it('never returns plan content for a restricted plan read', () => {
    const result = projectClientPortalPlan(
      {
        status: 'ok',
        subscription: {
          status: 'frozen',
          effective_end_exclusive: '2026-12-01',
        },
        plan: { ...deliveredPlan(planA, 'workout', 1), content: { secret: 1 } },
        revisions: [
          { revision_number: 1, published_at: '2026-11-14T10:00:00Z' },
        ],
      },
      { planId: planA, revisionNumber: null },
    );
    expect(result).toEqual({
      status: 'restricted',
      subscription: { status: 'frozen', effectiveEndExclusive: '2026-12-01' },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('fails closed when the RPC errors or throws', async () => {
    const failing = {
      rpc: async () => ({ data: null, error: { code: '42501' } }),
    };
    const throwing = {
      rpc: () => Promise.reject(new Error('transport')),
    };
    await expect(loadClientPortalOverview(failing)).resolves.toEqual({
      status: 'denied',
    });
    await expect(loadClientPortalOverview(throwing)).resolves.toEqual({
      status: 'denied',
    });
    await expect(loadClientPortalPlan(failing, planA, 1)).resolves.toEqual({
      status: 'denied',
    });
  });
});

describe('F22 published-revision selection (T012; FR-004, SC-005)', () => {
  const okPlan = (revision: number) => ({
    status: 'ok',
    subscription: active,
    plan: {
      ...deliveredPlan(planA, 'nutrition', revision),
      content: { r: revision },
    },
    revisions: [
      { revision_number: 3, published_at: '2026-11-14T10:00:00Z' },
      { revision_number: 2, published_at: '2026-11-13T10:00:00Z' },
      { revision_number: 1, published_at: '2026-11-12T10:00:00Z' },
    ],
  });

  it('accepts the selected delivered revision and keeps its content', () => {
    const result = projectClientPortalPlan(okPlan(2), {
      planId: planA,
      revisionNumber: 2,
    });
    expect(result).toMatchObject({
      status: 'ok',
      plan: { planId: planA, revisionNumber: 2, content: { r: 2 } },
    });
    expect(result.status === 'ok' && result.revisions).toHaveLength(3);
  });

  it('defaults to whatever latest revision the server selected', () => {
    expect(
      projectClientPortalPlan(okPlan(3), {
        planId: planA,
        revisionNumber: null,
      }),
    ).toMatchObject({ status: 'ok', plan: { revisionNumber: 3 } });
  });

  it('denies a response for another plan or another revision than requested', () => {
    expect(
      projectClientPortalPlan(okPlan(3), {
        planId: planB,
        revisionNumber: null,
      }),
    ).toEqual({ status: 'denied' });
    expect(
      projectClientPortalPlan(okPlan(3), { planId: planA, revisionNumber: 2 }),
    ).toEqual({ status: 'denied' });
  });

  it('denies a selected revision outside the delivered revision list', () => {
    const raw = {
      ...okPlan(4),
      plan: { ...okPlan(4).plan, revision_number: 4 },
    };
    expect(
      projectClientPortalPlan(raw, { planId: planA, revisionNumber: 4 }),
    ).toEqual({ status: 'denied' });
  });

  it('keeps foreign, draft and unknown targets indistinguishable', () => {
    expect(
      projectClientPortalPlan(
        { status: 'not_found' },
        { planId: planA, revisionNumber: null },
      ),
    ).toEqual({ status: 'not_found' });
  });

  it('parses only canonical revision numbers from the URL', () => {
    expect(parseRevisionParam(undefined)).toBeNull();
    expect(parseRevisionParam('7')).toBe(7);
    for (const value of ['0', '-1', '01', '1.5', 'x', '', '1234567890'])
      expect(parseRevisionParam(value), value).toBe('invalid');
    expect(parseRevisionParam(['1', '2'])).toBe('invalid');
  });

  it('passes the selected revision to the server read', async () => {
    const rpc = vi.fn(async () => ({ data: okPlan(2), error: null }));
    await loadClientPortalPlan({ rpc }, planA, 2);
    expect(rpc).toHaveBeenCalledWith('client_portal_plan', {
      p_plan_id: planA,
      p_revision_number: 2,
    });
  });
});
