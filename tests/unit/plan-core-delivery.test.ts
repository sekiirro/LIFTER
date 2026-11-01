import { describe, expect, it } from 'vitest';
import {
  PlanCoreValidationError,
  normalizeDeliveryKind,
  normalizeFirstDeliveryRecord,
  normalizeActivation,
  MAX_ACTIVATIONS,
  WORKOUT_FIRST_DELIVERY_FIXTURE,
  NUTRITION_FIRST_DELIVERY_FIXTURE,
  DELAYED_SECOND_DELIVERY_FIXTURE,
  ACTIVATION_EXACTLY_ONCE_FIXTURE,
  recordFirstDelivery,
  activateSubscription,
  hasBothDeliveries,
} from '../../lib/plan-core/delivery-contract';

describe('plan core first-delivery and activation contract', () => {
  it('has distinct workout and nutrition delivery kinds', () => {
    expect(WORKOUT_FIRST_DELIVERY_FIXTURE.kind).toBe('workout');
    expect(NUTRITION_FIRST_DELIVERY_FIXTURE.kind).toBe('nutrition');
    expect(WORKOUT_FIRST_DELIVERY_FIXTURE.kind).not.toBe(
      NUTRITION_FIRST_DELIVERY_FIXTURE.kind,
    );
  });

  it('allows delayed second delivery on a different day', () => {
    expect(DELAYED_SECOND_DELIVERY_FIXTURE.first.deliveredAt).not.toBe(
      DELAYED_SECOND_DELIVERY_FIXTURE.second.deliveredAt,
    );
  });

  it('records idempotent replay as the same durable result', () => {
    const existing = [WORKOUT_FIRST_DELIVERY_FIXTURE];
    const { record, replayed } = recordFirstDelivery(existing, {
      subscriptionId: WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      planId: WORKOUT_FIRST_DELIVERY_FIXTURE.planId,
      kind: 'workout',
      idempotencyKey: WORKOUT_FIRST_DELIVERY_FIXTURE.idempotencyKey,
    });
    expect(replayed).toBe(true);
    expect(record.deliveryId).toBe(WORKOUT_FIRST_DELIVERY_FIXTURE.deliveryId);
  });

  it('does not activate after only the first delivery', () => {
    const records = [WORKOUT_FIRST_DELIVERY_FIXTURE];
    const activation = activateSubscription(
      WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      records,
      [],
    );
    expect(activation).toBeNull();
    expect(
      hasBothDeliveries(records, WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId),
    ).toBe(false);
  });

  it('activates exactly once after both deliveries', () => {
    const records = [
      WORKOUT_FIRST_DELIVERY_FIXTURE,
      NUTRITION_FIRST_DELIVERY_FIXTURE,
    ];
    const activation = activateSubscription(
      WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      records,
      [],
    );
    expect(activation).not.toBeNull();
    expect(activation?.activationCount).toBe(1);
    // second call must not create another
    const second = activateSubscription(
      WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId,
      records,
      activation ? [activation] : [],
    );
    expect(second).toBe(activation);
  });

  it('encodes PC-FR-004/005 fixtures', () => {
    expect(MAX_ACTIVATIONS).toBe(1);
    expect(ACTIVATION_EXACTLY_ONCE_FIXTURE.activationCount).toBe(1);
  });

  it('validates delivery and activation schemas', () => {
    expect(
      normalizeFirstDeliveryRecord(WORKOUT_FIRST_DELIVERY_FIXTURE),
    ).toBeTruthy();
    expect(normalizeActivation(ACTIVATION_EXACTLY_ONCE_FIXTURE)).toBeTruthy();
    expect(normalizeDeliveryKind('workout')).toBe('workout');
  });

  it('rejects invalid delivery and activation payloads', () => {
    expect(() =>
      normalizeFirstDeliveryRecord({
        ...WORKOUT_FIRST_DELIVERY_FIXTURE,
        kind: 'x',
      }),
    ).toThrow(PlanCoreValidationError);
    expect(() => normalizeDeliveryKind('x')).toThrow(PlanCoreValidationError);
    expect(() => normalizeActivation({})).toThrow(PlanCoreValidationError);
  });
});
