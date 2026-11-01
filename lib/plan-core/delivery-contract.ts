import { PlanCoreValidationError, normalizePlanId } from './schemas';

export { PlanCoreValidationError } from './schemas';

/**
 * Shared Plan Core (F19) first-delivery and activation contract fixtures.
 *
 * Encodes PC-FR-004/005 and scenarios 3-5: distinct workout/nutrition
 * delivery records, delayed second delivery, idempotent replay, activation
 * exactly once. Pure TypeScript; no database or auth.
 */

// ---------------------------------------------------------------------------
// Activation limits
// ---------------------------------------------------------------------------

export const MAX_ACTIVATIONS = 1;

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type DeliveryKind = 'workout' | 'nutrition';

const DELIVERY_KINDS: readonly DeliveryKind[] = ['workout', 'nutrition'];

export function normalizeDeliveryKind(input: unknown): DeliveryKind {
  if (
    typeof input !== 'string' ||
    !DELIVERY_KINDS.includes(input as DeliveryKind)
  ) {
    throw new PlanCoreValidationError(
      `Delivery kind must be one of: ${DELIVERY_KINDS.join(', ')}`,
    );
  }
  return input as DeliveryKind;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type FirstDeliveryRecord = {
  deliveryId: string;
  subscriptionId: string;
  planId: string;
  kind: DeliveryKind;
  deliveredAt: string;
  idempotencyKey?: string;
  requestKey?: string;
  replayed?: boolean;
};

const FIRST_DELIVERY_KEYS = [
  'deliveryId',
  'subscriptionId',
  'planId',
  'kind',
  'deliveredAt',
  'idempotencyKey',
  'requestKey',
  'replayed',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) {
    throw new PlanCoreValidationError(`${label} must be a valid UUID`);
  }
  return value;
}

function checkAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new PlanCoreValidationError(
        `${label} has an unknown field: ${key}`,
      );
    }
  }
}

export function normalizeFirstDeliveryRecord(
  input: unknown,
): FirstDeliveryRecord {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError(
      'First delivery record must be an object',
    );
  }
  checkAllowedKeys(input, FIRST_DELIVERY_KEYS, 'First delivery record');

  const deliveryId = requireUuid(input.deliveryId, 'Delivery id');
  const subscriptionId = requireUuid(input.subscriptionId, 'Subscription id');
  const planId = normalizePlanId(input.planId);
  const kind = normalizeDeliveryKind(input.kind);
  if (typeof input.deliveredAt !== 'string') {
    throw new PlanCoreValidationError('Delivered at must be a string');
  }
  const deliveredAt = input.deliveredAt;

  let idempotencyKey: string | undefined;
  if (input.idempotencyKey !== undefined) {
    idempotencyKey = requireUuid(input.idempotencyKey, 'Idempotency key');
  }

  let requestKey: string | undefined;
  if (input.requestKey !== undefined) {
    requestKey = requireUuid(input.requestKey, 'Request key');
  }

  let replayed: boolean | undefined;
  if (input.replayed !== undefined) {
    if (typeof input.replayed !== 'boolean') {
      throw new PlanCoreValidationError('Replayed must be a boolean');
    }
    replayed = input.replayed;
  }

  return {
    deliveryId,
    subscriptionId,
    planId,
    kind,
    deliveredAt,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    ...(requestKey !== undefined ? { requestKey } : {}),
    ...(replayed !== undefined ? { replayed } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type Activation = {
  subscriptionId: string;
  activatedAt: string;
  productivityUnitId?: string;
  activationCount?: number;
  activated?: boolean;
};

const ACTIVATION_KEYS = [
  'subscriptionId',
  'activatedAt',
  'productivityUnitId',
  'activationCount',
  'activated',
] as const;

export function normalizeActivation(input: unknown): Activation {
  if (!isRecord(input)) {
    throw new PlanCoreValidationError('Activation must be an object');
  }
  checkAllowedKeys(input, ACTIVATION_KEYS, 'Activation');

  const subscriptionId = requireUuid(input.subscriptionId, 'Subscription id');
  if (typeof input.activatedAt !== 'string') {
    throw new PlanCoreValidationError('Activated at must be a string');
  }
  const activatedAt = input.activatedAt;

  let productivityUnitId: string | undefined;
  if (input.productivityUnitId !== undefined) {
    productivityUnitId = requireUuid(
      input.productivityUnitId,
      'Productivity unit id',
    );
  }

  let activationCount: number | undefined;
  if (input.activationCount !== undefined) {
    if (
      typeof input.activationCount !== 'number' ||
      !Number.isInteger(input.activationCount) ||
      input.activationCount < 0
    ) {
      throw new PlanCoreValidationError(
        'Activation count must be a non-negative integer',
      );
    }
    activationCount = input.activationCount;
  }

  let activated: boolean | undefined;
  if (input.activated !== undefined) {
    if (typeof input.activated !== 'boolean') {
      throw new PlanCoreValidationError('Activated must be a boolean');
    }
    activated = input.activated;
  }

  return {
    subscriptionId,
    activatedAt,
    ...(productivityUnitId !== undefined ? { productivityUnitId } : {}),
    ...(activationCount !== undefined ? { activationCount } : {}),
    ...(activated !== undefined ? { activated } : {}),
  };
}

// ---------------------------------------------------------------------------
// In-memory helpers
// ---------------------------------------------------------------------------

export type FirstDeliveryInput = {
  subscriptionId: string;
  planId: string;
  kind: DeliveryKind;
  idempotencyKey?: string;
  requestKey?: string;
  deliveredAt?: string;
  deliveryId?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newUuid(): string {
  // crypto is available in node 24
  return (globalThis.crypto as Crypto).randomUUID();
}

export function createFirstDeliveryRecord(
  input: FirstDeliveryInput,
  now?: string,
): FirstDeliveryRecord {
  return {
    deliveryId: input.deliveryId ?? newUuid(),
    subscriptionId: input.subscriptionId,
    planId: input.planId,
    kind: input.kind,
    deliveredAt: input.deliveredAt ?? now ?? nowIso(),
    idempotencyKey: input.idempotencyKey ?? input.requestKey,
    requestKey: input.requestKey ?? input.idempotencyKey,
    replayed: false,
  };
}

export function findExistingDelivery(
  records: readonly FirstDeliveryRecord[],
  input: FirstDeliveryInput,
): FirstDeliveryRecord | undefined {
  return records.find(
    (r) =>
      r.subscriptionId === input.subscriptionId &&
      r.kind === input.kind &&
      (input.idempotencyKey === undefined ||
        r.idempotencyKey === input.idempotencyKey ||
        r.requestKey === input.idempotencyKey ||
        r.requestKey === input.requestKey),
  );
}

export function recordFirstDelivery(
  records: readonly FirstDeliveryRecord[],
  input: FirstDeliveryInput,
): {
  record: FirstDeliveryRecord;
  replayed: boolean;
  records: FirstDeliveryRecord[];
} {
  const existing = findExistingDelivery(records, input);
  if (existing) {
    const replayed = { ...existing, replayed: true };
    return { record: replayed, replayed: true, records: [...records] };
  }
  const created = createFirstDeliveryRecord(input);
  return { record: created, replayed: false, records: [...records, created] };
}

export function hasBothDeliveries(
  records: readonly FirstDeliveryRecord[],
  subscriptionId: string,
): boolean {
  const kinds = new Set(
    records
      .filter((r) => r.subscriptionId === subscriptionId)
      .map((r) => r.kind),
  );
  return kinds.has('workout') && kinds.has('nutrition');
}

export function hasDeliveryKind(
  records: readonly FirstDeliveryRecord[],
  subscriptionId: string,
  kind: DeliveryKind,
): boolean {
  return records.some(
    (r) => r.subscriptionId === subscriptionId && r.kind === kind,
  );
}

export function createActivation(
  subscriptionId: string,
  deliveries: readonly FirstDeliveryRecord[],
  now?: string,
  productivityUnitId?: string,
): Activation {
  return {
    subscriptionId,
    activatedAt: now ?? nowIso(),
    productivityUnitId: productivityUnitId ?? newUuid(),
    activationCount: 1,
    activated: true,
  };
}

export function activateSubscription(
  subscriptionId: string,
  records: readonly FirstDeliveryRecord[],
  existingActivations: readonly Activation[] = [],
): Activation | null {
  if (existingActivations.length >= MAX_ACTIVATIONS) {
    // exactly once: return the existing activation, never a second
    return existingActivations[0] ?? null;
  }
  if (!hasBothDeliveries(records, subscriptionId)) {
    return null;
  }
  return createActivation(subscriptionId, records);
}

export function activationState(
  records: readonly FirstDeliveryRecord[],
  subscriptionId: string,
  activation: Activation | null,
): 'pending' | 'complete' {
  if (activation) return 'complete';
  return hasBothDeliveries(records, subscriptionId) ? 'complete' : 'pending';
}

export function isIdempotentReplay(
  existingKey: string | undefined,
  newKey: string | undefined,
): boolean {
  return existingKey !== undefined && existingKey === newKey;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_WORKOUT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_NUTRITION_ID = '33333333-3333-4333-8333-333333333333';
const DELIVERY_WORKOUT_ID = '44444444-4444-4444-8444-444444444444';
const DELIVERY_NUTRITION_ID = '55555555-5555-4555-8555-555555555555';
const IDEMPOTENCY_KEY = '66666666-6666-4666-8666-666666666666';

export const WORKOUT_FIRST_DELIVERY_FIXTURE: FirstDeliveryRecord = {
  deliveryId: DELIVERY_WORKOUT_ID,
  subscriptionId: SUBSCRIPTION_ID,
  planId: PLAN_WORKOUT_ID,
  kind: 'workout',
  deliveredAt: '2026-01-01T10:00:00.000Z',
  idempotencyKey: IDEMPOTENCY_KEY,
  requestKey: IDEMPOTENCY_KEY,
  replayed: false,
};

export const NUTRITION_FIRST_DELIVERY_FIXTURE: FirstDeliveryRecord = {
  deliveryId: DELIVERY_NUTRITION_ID,
  subscriptionId: SUBSCRIPTION_ID,
  planId: PLAN_NUTRITION_ID,
  kind: 'nutrition',
  deliveredAt: '2026-01-03T10:00:00.000Z',
  idempotencyKey: IDEMPOTENCY_KEY,
  requestKey: IDEMPOTENCY_KEY,
  replayed: false,
};

export const DELAYED_SECOND_DELIVERY_FIXTURE = {
  first: WORKOUT_FIRST_DELIVERY_FIXTURE,
  second: NUTRITION_FIRST_DELIVERY_FIXTURE,
};

export const IDEMPOTENT_REPLAY_FIXTURE = {
  original: WORKOUT_FIRST_DELIVERY_FIXTURE,
  replay: { ...WORKOUT_FIRST_DELIVERY_FIXTURE, replayed: true },
};

export const ACTIVATION_EXACTLY_ONCE_FIXTURE: Activation = {
  subscriptionId: SUBSCRIPTION_ID,
  activatedAt: '2026-01-03T10:00:00.000Z',
  productivityUnitId: '77777777-7777-4777-8777-777777777777',
  activationCount: 1,
  activated: true,
};

export const FIRST_DELIVERY_FIXTURES = [
  WORKOUT_FIRST_DELIVERY_FIXTURE,
  NUTRITION_FIRST_DELIVERY_FIXTURE,
];
