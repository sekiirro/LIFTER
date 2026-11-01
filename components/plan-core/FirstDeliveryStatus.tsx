'use client';

import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import { getMessages } from '../../lib/i18n';
import type {
  Activation,
  FirstDeliveryRecord,
} from '../../lib/plan-core/delivery-contract';
import { activationState as deriveActivationState } from '../../lib/plan-core/delivery-contract';
import { Bidi } from '../ui/Bidi';
import { Card } from '../ui/Card';

type DeliveryProjection = {
  subscriptionId?: string;
  deliveries?: FirstDeliveryRecord[] | readonly FirstDeliveryRecord[];
  activation?: Activation | null;
  activationState?: 'pending' | 'complete';
  state?: 'pending' | 'complete';
  workoutDelivered?: boolean;
  nutritionDelivered?: boolean;
  workoutDelivery?: FirstDeliveryRecord | null;
  nutritionDelivery?: FirstDeliveryRecord | null;
};

function asMessages(props: Record<string, unknown>): Messages {
  if (props.messages) return props.messages as Messages;
  const locale = (props.locale as Locale | undefined) ?? 'en';
  return getMessages(locale);
}

function toArray(value: unknown): FirstDeliveryRecord[] {
  if (Array.isArray(value)) return value as FirstDeliveryRecord[];
  return [];
}

export function FirstDeliveryStatus(props: Record<string, unknown>) {
  const m = asMessages(props);
  const projection = (props.projection ??
    props.status ??
    props.deliveryStatus ??
    props.deliveryProjection ??
    {}) as DeliveryProjection;

  const subscriptionId =
    (props.subscriptionId as string | undefined) ??
    projection.subscriptionId ??
    '';

  let deliveries = toArray(
    props.deliveries ??
      props.records ??
      props.firstDeliveries ??
      projection.deliveries,
  );

  const workoutDelivery = (props.workoutDelivery ??
    props.workoutRecord ??
    projection.workoutDelivery) as FirstDeliveryRecord | null | undefined;
  const nutritionDelivery = (props.nutritionDelivery ??
    props.nutritionRecord ??
    projection.nutritionDelivery) as FirstDeliveryRecord | null | undefined;

  if (workoutDelivery) deliveries = [...deliveries, workoutDelivery];
  if (nutritionDelivery) deliveries = [...deliveries, nutritionDelivery];

  let workoutDelivered = props.workoutDelivered ?? projection.workoutDelivered;
  let nutritionDelivered =
    props.nutritionDelivered ?? projection.nutritionDelivered;

  if (workoutDelivered === undefined) {
    workoutDelivered = deliveries.some(
      (d) =>
        d.kind === 'workout' &&
        (!subscriptionId || d.subscriptionId === subscriptionId),
    );
  }
  if (nutritionDelivered === undefined) {
    nutritionDelivered = deliveries.some(
      (d) =>
        d.kind === 'nutrition' &&
        (!subscriptionId || d.subscriptionId === subscriptionId),
    );
  }

  const activation = (props.activation ??
    projection.activation ??
    null) as Activation | null;

  const providedState = (props.activationState ??
    props.state ??
    projection.activationState ??
    projection.state) as 'pending' | 'complete' | undefined;

  const state =
    providedState ??
    deriveActivationState(deliveries, subscriptionId, activation);

  const workoutLabel = workoutDelivered
    ? m['planCore.delivery.delivered']
    : m['planCore.delivery.notDelivered'];
  const nutritionLabel = nutritionDelivered
    ? m['planCore.delivery.delivered']
    : m['planCore.delivery.notDelivered'];
  const activationLabel =
    state === 'complete'
      ? m['planCore.delivery.activationComplete']
      : m['planCore.delivery.activationPending'];

  return (
    <Card as="section" aria-labelledby="first-delivery-title">
      <header>
        <h2 id="first-delivery-title">{m['planCore.delivery.independent']}</h2>
      </header>
      <div
        data-testid="workout-delivery"
        data-delivery="workout"
        data-delivered={workoutDelivered ? 'true' : 'false'}
      >
        <span>{m['planCore.delivery.workout']}</span>
        <span data-status={workoutDelivered ? 'delivered' : 'not-delivered'}>
          {workoutLabel}
        </span>
      </div>
      <div
        data-testid="nutrition-delivery"
        data-delivery="nutrition"
        data-delivered={nutritionDelivered ? 'true' : 'false'}
      >
        <span>{m['planCore.delivery.nutrition']}</span>
        <span data-status={nutritionDelivered ? 'delivered' : 'not-delivered'}>
          {nutritionLabel}
        </span>
      </div>
      <div
        data-testid="activation-status"
        data-activation={state}
        data-state={state}
      >
        <span>{m['planCore.delivery.activation']}</span>
        <span data-status={state}>{activationLabel}</span>
      </div>
      {subscriptionId ? (
        <p>
          <Bidi dir="ltr">{subscriptionId}</Bidi>
        </p>
      ) : null}
    </Card>
  );
}
