/**
 * T067 [FR-024, FR-026, FR-030, SC-021] - pure promotion-period evaluation
 * (spec 009).
 *
 * Mirrors the settled database contract
 * `app_private.package_promotion_period_active` (migration
 * 20261124020000_f9_package_promotion_periods.sql, verified by the T056/T057
 * integration tests) at the unit layer:
 *
 *   return (period.starts_at is null and at_time >= category.created_at
 *       or period.starts_at is not null and cairo_day >= period.starts_at)
 *     and (period.ends_at is null or cairo_day < period.ends_at);
 *
 * Supplied bounds are Africa/Cairo calendar dates (start-inclusive,
 * end-exclusive) evaluated on the Cairo calendar day of the instant - never
 * the UTC date and never elapsed-hours arithmetic, so the spring-forward and
 * fall-back transitions are handled by the IANA time-zone rules. A missing
 * start makes the period available from the category's creation instant
 * (inclusive, an instant comparison); a missing end is indefinite. This
 * function is pure: expiry only blocks new registration links, never rewrites
 * an issued-link snapshot, and the period input is never mutated.
 */
import { cairoDateAt } from '../time/cairo-calendar';

export type PromotionPeriod = {
  /** ISO instant of the category's creation. */
  createdAt: string;
  /** Africa/Cairo date 'YYYY-MM-DD', or null for "from creation". */
  startsAt: string | null;
  /** Africa/Cairo date 'YYYY-MM-DD', or null for "indefinite". */
  endsAt: string | null;
};

/**
 * Whether a promotion period is active at the given instant.
 *
 * @param period the promotion bounds (read-only; never mutated)
 * @param at     ISO instant to evaluate
 */
export function isPromotionPeriodActive(
  period: PromotionPeriod,
  at: string,
): boolean {
  const atMs = Date.parse(at);
  if (!Number.isFinite(atMs)) return false;

  // The DB contract resolves the Cairo calendar day unconditionally; do the
  // same so supplied bounds use the local date, not the UTC date.
  const cairoDay = cairoDateAt(at);

  let lower: boolean;
  if (period.startsAt === null) {
    const createdMs = Date.parse(period.createdAt);
    lower = Number.isFinite(createdMs) && atMs >= createdMs;
  } else {
    lower = cairoDay >= period.startsAt;
  }

  const upper = period.endsAt === null || cairoDay < period.endsAt;
  return lower && upper;
}
