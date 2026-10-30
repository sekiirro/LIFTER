import { compareCairoDates } from '../time/cairo-calendar';
import { addCairoDays } from '../time/cairo-calendar';
import {
  calculateFreezeContribution,
  type FreezeApplication,
} from './freeze-service';

export type CoverageInterval = {
  serviceStartDate: string;
  serviceEndExclusive: string;
};

export type EntitlementProjectionInput = {
  asOfDate: string;
  activationDate: string | null;
  serviceStartDate: string | null;
  durationDays: number;
  freezes: readonly FreezeApplication[];
  successorCoverage: readonly CoverageInterval[];
  terminalRefund: boolean;
};

export type EntitlementProjection = {
  status:
    | 'awaiting_activation'
    | 'future'
    | 'active'
    | 'frozen'
    | 'expired'
    | 'refunded';
  effectiveEndExclusive: string | null;
  coverageEndExclusive: string | null;
};

/** Derives current entitlement from immutable facts; scheduled materialization is not an input. */
export function projectEntitlement(
  input: EntitlementProjectionInput,
): EntitlementProjection {
  compareCairoDates(input.asOfDate, input.asOfDate);
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays <= 0)
    throw new RangeError(
      'Entitlement duration must be a positive safe integer',
    );
  if (input.terminalRefund)
    return {
      status: 'refunded',
      effectiveEndExclusive: null,
      coverageEndExclusive: null,
    };
  if (input.activationDate === null) {
    if (input.serviceStartDate !== null)
      throw new RangeError(
        'Unactivated entitlement cannot have a service start',
      );
    return {
      status: 'awaiting_activation',
      effectiveEndExclusive: null,
      coverageEndExclusive: null,
    };
  }
  compareCairoDates(input.activationDate, input.activationDate);
  if (input.serviceStartDate === null)
    throw new RangeError('Activated entitlement requires a service start');
  compareCairoDates(input.serviceStartDate, input.serviceStartDate);

  let effectiveEndExclusive = addCairoDays(
    input.serviceStartDate,
    input.durationDays,
  );
  for (const freeze of input.freezes) {
    effectiveEndExclusive = addCairoDays(
      effectiveEndExclusive,
      calculateFreezeContribution(freeze),
    );
  }
  const intervals = projectCoverage([
    {
      serviceStartDate: input.serviceStartDate,
      serviceEndExclusive: effectiveEndExclusive,
    },
    ...input.successorCoverage,
  ]);
  const current = intervals.find(
    (interval) =>
      compareCairoDates(input.asOfDate, interval.serviceStartDate) >= 0 &&
      compareCairoDates(input.asOfDate, interval.serviceEndExclusive) < 0,
  );
  const first = intervals[0];
  const coverageEndExclusive = current?.serviceEndExclusive ?? null;
  if (
    !current &&
    first &&
    compareCairoDates(input.asOfDate, first.serviceStartDate) < 0
  )
    return { status: 'future', effectiveEndExclusive, coverageEndExclusive };

  const frozen = input.freezes.some((freeze) => {
    const contribution = calculateFreezeContribution(freeze);
    if (freeze.removed || contribution <= 0) return false;
    const freezeEnd = addCairoDays(freeze.applyDate, contribution);
    return (
      compareCairoDates(input.asOfDate, freeze.applyDate) >= 0 &&
      compareCairoDates(input.asOfDate, freezeEnd) < 0
    );
  });
  if (current)
    return {
      status: frozen ? 'frozen' : 'active',
      effectiveEndExclusive,
      coverageEndExclusive,
    };
  return { status: 'expired', effectiveEndExclusive, coverageEndExclusive };
}

/** Merges overlapping or contiguous eligible service intervals and preserves gaps. */
export function projectCoverage(
  intervals: readonly CoverageInterval[],
): CoverageInterval[] {
  const sorted = intervals.map((interval) => {
    compareCairoDates(interval.serviceStartDate, interval.serviceStartDate);
    compareCairoDates(
      interval.serviceEndExclusive,
      interval.serviceEndExclusive,
    );
    if (
      compareCairoDates(
        interval.serviceStartDate,
        interval.serviceEndExclusive,
      ) >= 0
    ) {
      throw new RangeError('Coverage interval must have a positive duration');
    }
    return { ...interval };
  });

  sorted.sort((left, right) =>
    compareCairoDates(left.serviceStartDate, right.serviceStartDate),
  );
  const result: CoverageInterval[] = [];
  for (const interval of sorted) {
    const current = result.at(-1);
    if (
      !current ||
      compareCairoDates(
        interval.serviceStartDate,
        current.serviceEndExclusive,
      ) > 0
    ) {
      result.push(interval);
      continue;
    }
    if (
      compareCairoDates(
        interval.serviceEndExclusive,
        current.serviceEndExclusive,
      ) > 0
    ) {
      current.serviceEndExclusive = interval.serviceEndExclusive;
    }
  }
  return result;
}
