import { compareCairoDates } from '../time/cairo-calendar';

export type CoverageInterval = {
  serviceStartDate: string;
  serviceEndExclusive: string;
};

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
