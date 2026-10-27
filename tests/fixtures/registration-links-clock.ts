/**
 * Shared strict-clock rows for the F10 grace contract. Both the pure TS unit
 * table and the integration SQL-parity table import this single source so a
 * change to one cannot silently diverge from the other.
 */
export const graceExpiry = Date.parse('2026-10-20T00:00:00Z');
export const graceClockRows = [
  [null, graceExpiry - 1, true],
  [null, graceExpiry, false],
  [null, graceExpiry + 1, false],
  [graceExpiry - 7200000, graceExpiry - 1, true],
  [graceExpiry - 7200000, graceExpiry, false],
  [graceExpiry - 600000, graceExpiry + 1199999, true],
  [graceExpiry - 600000, graceExpiry + 1200000, false],
  [graceExpiry - 600000, graceExpiry + 1200001, false],
  [graceExpiry, graceExpiry + 1, false],
  [graceExpiry + 60000, graceExpiry + 120000, false],
] as const;
