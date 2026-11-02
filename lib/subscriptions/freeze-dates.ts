import {
  compareCairoDates,
  daysBetweenCairoDates,
} from '../time/cairo-calendar';

/** Counts frozen Cairo dates, including Apply and excluding Stop. */
export function countFreezeDays(applyDate: string, stopDate: string): number {
  const order = compareCairoDates(applyDate, stopDate);
  if (order > 0) throw new RangeError('Stop date cannot precede Apply date');
  if (order === 0) return 1;
  return daysBetweenCairoDates(applyDate, stopDate);
}
