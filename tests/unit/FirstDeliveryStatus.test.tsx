import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstDeliveryStatus } from '../../components/plan-core/FirstDeliveryStatus';
import { WORKOUT_FIRST_DELIVERY_FIXTURE } from '../../lib/plan-core/delivery-contract';
import { getMessages } from '../../lib/i18n';

const subscriptionId = WORKOUT_FIRST_DELIVERY_FIXTURE.subscriptionId;

describe('first delivery status', () => {
  it('shows one successful first delivery as delivered without activation', () => {
    const html = renderToStaticMarkup(
      createElement(FirstDeliveryStatus, {
        locale: 'en',
        subscriptionId,
        deliveries: [WORKOUT_FIRST_DELIVERY_FIXTURE],
        activation: null,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('data-delivery="workout"');
    expect(html).toContain('data-delivered="true"');
    expect(html).toContain('data-activation="pending"');
  });

  it('keeps nutrition independent and pending until it is delivered', () => {
    const html = renderToStaticMarkup(
      createElement(FirstDeliveryStatus, {
        locale: 'en',
        subscriptionId,
        deliveries: [WORKOUT_FIRST_DELIVERY_FIXTURE],
        activation: null,
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('data-delivery="nutrition"');
    expect(html).toContain('data-delivered="false"');
  });

  it('shows activation complete only after both deliveries', () => {
    const html = renderToStaticMarkup(
      createElement(FirstDeliveryStatus, {
        locale: 'en',
        subscriptionId,
        deliveries: [
          WORKOUT_FIRST_DELIVERY_FIXTURE,
          {
            ...WORKOUT_FIRST_DELIVERY_FIXTURE,
            deliveryId: '55555555-5555-4555-8555-555555555555',
            kind: 'nutrition',
            planId: '33333333-3333-4333-8333-333333333333',
          },
        ],
        activation: {
          subscriptionId,
          activatedAt: '2026-01-03T10:00:00.000Z',
          activationCount: 1,
          activated: true,
        },
        messages: getMessages('en'),
      }),
    );
    expect(html).toContain('data-delivered="true"');
    expect(html).toContain('data-activation="complete"');
  });

  it('projects workout and nutrition delivery states independently', () => {
    const html = renderToStaticMarkup(
      createElement(FirstDeliveryStatus, {
        locale: 'ar',
        subscriptionId,
        workoutDelivered: true,
        nutritionDelivered: false,
        activationState: 'pending',
        messages: getMessages('ar'),
      }),
    );
    expect(html).toContain('تم التسليم');
    expect(html).toContain('لم يتم التسليم');
    expect(html).toContain('قيد الانتظار');
  });
});
