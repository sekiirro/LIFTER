/**
 * F13 productivity point rules (FR-040/041; SC-019/026).
 *
 * Exactly one point is awarded per new client, once. Returning clients,
 * upgrades, renewals and plan publications award no additional points, and
 * plan revisions/publications carry no product-imposed count limit.
 *
 * The production award entry point (which event and role records the point)
 * is pending a PO decision; persistence and guard coverage live in migration
 * `20261111222000_f13_trainer_productivity_points.sql` and the T044
 * integration suite. Do not add award callers until the PO decides.
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
