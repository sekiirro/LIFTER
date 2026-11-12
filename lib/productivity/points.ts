/**
 * F13 productivity point rules (FR-040/041; SC-019/026).
 *
 * Exactly one point is awarded per new client, once. Returning clients,
 * upgrades, renewals and plan publications award no additional points, and
 * plan revisions/publications carry no product-imposed count limit.
 *
 * The assigned trainer's one point is awarded on the first normal plan
 * delivery/activation. The award caller remains deferred to P4 (T044); this
 * module only defines event totals and the current persistence guard.
 */
export const POINTS_PER_NEW_CLIENT = 1 as const;

export type ProductivityPointEvent =
  | 'new_client'
  | 'returning_client'
  | 'upgrade'
  | 'renewal'
  | 'plan_publication';

/** Returns the specified point award for a lifecycle event: 1 for a new client, 0 otherwise. */
export function pointsForEvent(event: ProductivityPointEvent): 0 | 1 {
  return event === 'new_client' ? POINTS_PER_NEW_CLIENT : 0;
}
