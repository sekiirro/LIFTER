import { describe, expect, it } from 'vitest';
import { lastCoveredDay } from '../../lib/client-access/portal-projection';
import { formatCalendarDate } from '../../components/client-portal/format';

// PO 2026-11-14 PO-2 "Last covered day": display = F13 exclusive boundary - 1 day.
describe('F22 subscription end date presenter (PO-2)', () => {
  it('shows the day before the F13 exclusive boundary', () => {
    expect(lastCoveredDay('2026-12-14')).toBe('2026-12-13');
  });

  it('crosses month, year and leap-day boundaries on the Cairo calendar', () => {
    expect(lastCoveredDay('2026-12-01')).toBe('2026-11-30');
    expect(lastCoveredDay('2027-01-01')).toBe('2026-12-31');
    expect(lastCoveredDay('2026-03-01')).toBe('2026-02-28');
    expect(lastCoveredDay('2028-03-01')).toBe('2028-02-29');
  });

  it('is a pure calendar-date shift, independent of the server clock and time zone', () => {
    // The F13 boundary is a Cairo calendar date: access ends at 00:00 Cairo on
    // 2026-12-01 (22:00 UTC on 2026-11-30). The shown day is 2026-11-30 no
    // matter which zone the server process runs in.
    const before = process.env.TZ;
    try {
      for (const tz of [
        'UTC',
        'Africa/Cairo',
        'Pacific/Kiritimati',
        'America/Los_Angeles',
      ]) {
        process.env.TZ = tz;
        const shown = lastCoveredDay('2026-12-01');
        expect(shown, tz).toBe('2026-11-30');
        expect(formatCalendarDate(shown, 'en'), tz).toBe('Nov 30, 2026');
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it('rejects malformed boundaries instead of guessing', () => {
    for (const value of ['2026-13-01', '2026-02-30', 'tomorrow', ''])
      expect(() => lastCoveredDay(value), value).toThrow();
  });
});
