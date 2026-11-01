import { describe, expect, it } from 'vitest';
import {
  ImmutableRevisionRefSchema,
  ALLOW_IN_PLACE_REVISION_MUTATION,
  isRevisionAppendOnly,
  validateRevisionAppendOnly,
} from '../../lib/plan-core/schemas';
import {
  WORKOUT_FIRST_DELIVERY_FIXTURE,
  activateSubscription,
} from '../../lib/plan-core/delivery-contract';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('plan core revision and audit contract', () => {
  it('preserves same plan identity across revisions', () => {
    const rev1 = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      authorId: VALID_UUID,
    });
    const rev2 = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: '223e4567-e89b-12d3-a456-426614174000',
      revisionNumber: 2,
      authorId: VALID_UUID,
    });
    expect(rev1.planId).toBe(rev2.planId);
  });

  it('preserves authorship on a revision', () => {
    const parsed = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      authorId: VALID_UUID,
    });
    expect(parsed.authorId).toBe(VALID_UUID);
  });

  it('rejects in-place revision mutation (overwrite)', () => {
    const prev = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      authorId: VALID_UUID,
    });
    const sameRevisionMutated = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      authorId: VALID_UUID,
    });
    expect(isRevisionAppendOnly(prev, sameRevisionMutated)).toBe(false);
    expect(() =>
      validateRevisionAppendOnly(prev, sameRevisionMutated),
    ).toThrow();
  });

  it('rejects a changed revision earning first-delivery credit', () => {
    const records = [
      WORKOUT_FIRST_DELIVERY_FIXTURE,
      {
        ...WORKOUT_FIRST_DELIVERY_FIXTURE,
        deliveryId: '99999999-9999-4999-8999-999999999999',
        kind: 'nutrition' as const,
      },
    ];
    // reuse existing activation: later revision must not reactivate
    const activation = {
      subscriptionId: WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      activatedAt: '2026-01-03T10:00:00.000Z',
      productivityUnitId: '77777777-7777-4777-8777-777777777777',
      activationCount: 1,
      activated: true,
    };
    const result = activateSubscription(
      WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      records,
      [activation],
    );
    expect(result).toBe(activation);
    expect(ALLOW_IN_PLACE_REVISION_MUTATION).toBe(false);
  });

  it('accepts a properly appended revision', () => {
    const prev = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: VALID_UUID,
      revisionNumber: 1,
      authorId: VALID_UUID,
    });
    const next = ImmutableRevisionRefSchema.parse({
      planId: VALID_UUID,
      revisionId: '223e4567-e89b-12d3-a456-426614174000',
      revisionNumber: 2,
      authorId: VALID_UUID,
    });
    expect(isRevisionAppendOnly(prev, next)).toBe(true);
  });
});
