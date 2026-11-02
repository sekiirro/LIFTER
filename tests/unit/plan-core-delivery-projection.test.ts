import { describe, expect, it } from 'vitest';
import { projectClientDelivery } from '../../lib/plan-core/delivery-projection';
import type {
  Activation,
  FirstDeliveryRecord,
} from '../../lib/plan-core/delivery-contract';
import type {
  PlanRootDto,
  PublishedRevisionDto,
} from '../../lib/plan-core/client';

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const OLD_REVISION_ID = '33333333-3333-4333-8333-333333333333';
const NEW_REVISION_ID = '44444444-4444-4444-8444-444444444444';
const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

const root: PlanRootDto = {
  planId: PLAN_ID,
  draft: {
    planId: PLAN_ID,
    visibility: 'private',
    content: {
      kind: 'workout',
      schemaVersion: 1,
      document: { secretDraft: true },
    },
  },
  publishedVersion: 4,
  readiness: 'published',
};

const revisions: PublishedRevisionDto[] = [
  {
    planId: PLAN_ID,
    revisionId: OLD_REVISION_ID,
    revisionNumber: 3,
    createdAt: '2026-10-01T10:00:00.000Z',
    authorId: '66666666-6666-4666-8666-666666666666',
    content: {
      kind: 'workout',
      schemaVersion: 1,
      document: { exerciseCount: 2 },
    },
  },
  {
    planId: PLAN_ID,
    revisionId: NEW_REVISION_ID,
    revisionNumber: 4,
    createdAt: '2026-11-01T10:00:00.000Z',
    authorId: '77777777-7777-4777-8777-777777777777',
    content: {
      kind: 'workout',
      schemaVersion: 1,
      document: { exerciseCount: 4 },
    },
  },
];

const delivery: FirstDeliveryRecord = {
  deliveryId: DELIVERY_ID,
  subscriptionId: SUBSCRIPTION_ID,
  planId: PLAN_ID,
  kind: 'workout',
  deliveredAt: '2026-10-02T10:00:00.000Z',
};

const input = {
  subscriptionId: SUBSCRIPTION_ID,
  root,
  kind: 'workout' as const,
  revisions,
  deliveries: [delivery],
  activation: null as Activation | null,
};

describe('Plan Core client delivery projection', () => {
  it('projects only approved fields and omits draft, delivery ID, author, and internal counters', () => {
    const result = projectClientDelivery(input);

    expect(result).toEqual({
      planId: PLAN_ID,
      kind: 'workout',
      revisionNumber: 4,
      publishedAt: revisions[1]?.createdAt,
      content: revisions[1]?.content,
      delivery: { status: 'delivered' },
      activation: { status: 'pending' },
    });
    expect(Object.keys(result ?? {}).sort()).toEqual([
      'activation',
      'content',
      'delivery',
      'kind',
      'planId',
      'publishedAt',
      'revisionNumber',
    ]);
  });

  it('keeps activation pending after one delivery and while durable retry is uncommitted', () => {
    const result = projectClientDelivery({ ...input, activation: null });
    expect(result?.delivery.status).toBe('delivered');
    expect(result?.activation.status).toBe('pending');
  });

  it('marks activation complete only when the matching activation record committed', () => {
    const activation: Activation = {
      subscriptionId: SUBSCRIPTION_ID,
      activatedAt: '2026-11-02T10:00:00.000Z',
      activationCount: 1,
      activated: true,
    };

    expect(
      projectClientDelivery({ ...input, activation })?.activation.status,
    ).toBe('complete');
  });

  it('does not expose content for a not-delivered plan', () => {
    const result = projectClientDelivery({ ...input, deliveries: [] });

    expect(result?.delivery.status).toBe('not_delivered');
    expect(result?.content).toBeNull();
  });

  it('does not use another subscription delivery or activation', () => {
    const foreignDelivery = {
      ...delivery,
      subscriptionId: '88888888-8888-4888-8888-888888888888',
    };
    const foreignActivation: Activation = {
      subscriptionId: foreignDelivery.subscriptionId,
      activatedAt: '2026-11-02T10:00:00.000Z',
    };
    const result = projectClientDelivery({
      ...input,
      deliveries: [foreignDelivery],
      activation: foreignActivation,
    });

    expect(result?.delivery.status).toBe('not_delivered');
    expect(result?.activation.status).toBe('pending');
    expect(result?.content).toBeNull();
  });
});
