/**
 * F22 client portal projection guard (FR-004..FR-007, FR-010; SC-004..SC-006).
 *
 * The database boundary (`client_portal_overview`, `client_portal_plan`)
 * derives the client from the signed identity and consults F13 on every
 * call. This module is the app-layer wall: it accepts only the closed result
 * shapes, and a restricted result can never carry plan identities or
 * content, whatever the transport returned.
 */

export type PlanKind = 'workout' | 'nutrition';

/** F13 projected states (lib/subscriptions/entitlement.ts). */
export const SUBSCRIPTION_STATUSES = [
  'awaiting_activation',
  'future',
  'active',
  'frozen',
  'expired',
  'refunded',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionSummary = {
  status: SubscriptionStatus;
  /** F13 exclusive Cairo end boundary, `YYYY-MM-DD`, or null before activation. */
  effectiveEndExclusive: string | null;
};

export type DeliveredPlanSummary = {
  planId: string;
  kind: PlanKind;
  revisionNumber: number;
  publishedAt: string;
};

export type PublishedRevisionRef = {
  revisionNumber: number;
  publishedAt: string;
};

export type ClientPortalOverview =
  | {
      status: 'ok';
      subscription: SubscriptionSummary;
      plans: DeliveredPlanSummary[];
    }
  | { status: 'restricted'; subscription: SubscriptionSummary }
  | { status: 'denied' };

export type ClientPortalPlan =
  | {
      status: 'ok';
      subscription: SubscriptionSummary;
      plan: DeliveredPlanSummary & { content: unknown };
      revisions: PublishedRevisionRef[];
    }
  | { status: 'restricted'; subscription: SubscriptionSummary }
  | { status: 'not_found' }
  | { status: 'denied' };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isRevisionNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseSubscription(value: unknown): SubscriptionSummary | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const end = value.effective_end_exclusive;
  if (!(SUBSCRIPTION_STATUSES as readonly unknown[]).includes(status))
    return null;
  if (end !== null && !(typeof end === 'string' && datePattern.test(end)))
    return null;
  return {
    status: status as SubscriptionStatus,
    effectiveEndExclusive: end,
  };
}

function parsePlanSummary(value: unknown): DeliveredPlanSummary | null {
  if (!isRecord(value)) return null;
  const { plan_id, plan_kind, revision_number, published_at } = value;
  if (
    !isUuid(plan_id) ||
    (plan_kind !== 'workout' && plan_kind !== 'nutrition') ||
    !isRevisionNumber(revision_number) ||
    !isTimestamp(published_at)
  )
    return null;
  return {
    planId: plan_id,
    kind: plan_kind,
    revisionNumber: revision_number,
    publishedAt: published_at,
  };
}

function parseRevision(value: unknown): PublishedRevisionRef | null {
  if (!isRecord(value)) return null;
  const { revision_number, published_at } = value;
  if (!isRevisionNumber(revision_number) || !isTimestamp(published_at))
    return null;
  return { revisionNumber: revision_number, publishedAt: published_at };
}

/**
 * Restricted projection: subscription status and end date only. Only an
 * explicit F13 `active` state may accompany plan data (F13-FR-028).
 */
function restricted(subscription: SubscriptionSummary): {
  status: 'restricted';
  subscription: SubscriptionSummary;
} {
  return {
    status: 'restricted',
    subscription: {
      status: subscription.status,
      effectiveEndExclusive: subscription.effectiveEndExclusive,
    },
  };
}

export function projectClientPortalOverview(
  raw: unknown,
): ClientPortalOverview {
  if (!isRecord(raw)) return { status: 'denied' };
  const subscription = parseSubscription(raw.subscription);
  if (!subscription) return { status: 'denied' };
  if (raw.status === 'restricted' || subscription.status !== 'active')
    return raw.status === 'restricted' || raw.status === 'ok'
      ? restricted(subscription)
      : { status: 'denied' };
  if (raw.status !== 'ok' || !Array.isArray(raw.plans))
    return { status: 'denied' };
  const plans: DeliveredPlanSummary[] = [];
  const seen = new Set<string>();
  for (const item of raw.plans) {
    const plan = parsePlanSummary(item);
    if (!plan || seen.has(plan.planId)) return { status: 'denied' };
    seen.add(plan.planId);
    plans.push(plan);
  }
  return { status: 'ok', subscription, plans };
}

export function projectClientPortalPlan(
  raw: unknown,
  requested: { planId: string; revisionNumber: number | null },
): ClientPortalPlan {
  if (!isRecord(raw)) return { status: 'denied' };
  if (raw.status === 'not_found') return { status: 'not_found' };
  const subscription = parseSubscription(raw.subscription);
  if (!subscription) return { status: 'denied' };
  if (raw.status === 'restricted' || subscription.status !== 'active')
    return raw.status === 'restricted' || raw.status === 'ok'
      ? restricted(subscription)
      : { status: 'denied' };
  if (
    raw.status !== 'ok' ||
    !isRecord(raw.plan) ||
    !Array.isArray(raw.revisions)
  )
    return { status: 'denied' };
  const plan = parsePlanSummary(raw.plan);
  if (
    !plan ||
    plan.planId !== requested.planId ||
    (requested.revisionNumber !== null &&
      plan.revisionNumber !== requested.revisionNumber)
  )
    return { status: 'denied' };
  const revisions: PublishedRevisionRef[] = [];
  for (const item of raw.revisions) {
    const revision = parseRevision(item);
    if (!revision) return { status: 'denied' };
    revisions.push(revision);
  }
  if (!revisions.some((r) => r.revisionNumber === plan.revisionNumber))
    return { status: 'denied' };
  return {
    status: 'ok',
    subscription,
    plan: { ...plan, content: raw.plan.content },
    revisions,
  };
}

/** Accept only a canonical positive revision number from a URL search value. */
export function parseRevisionParam(
  value: string | string[] | undefined,
): number | null | 'invalid' {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,8}$/u.test(value))
    return 'invalid';
  return Number(value);
}
