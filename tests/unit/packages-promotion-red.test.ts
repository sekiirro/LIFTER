/**
 * T067 [FR-024, FR-026, FR-030, SC-021] - unit tests (spec 009).
 *
 * Promotion window/link rules (FR-024/FR-030/SC-021): these tests specify the
 * pure unit-level promotion evaluation implemented in
 * `lib/packages/promotion.ts`. The observable rules mirror the settled
 * database contract `app_private.package_promotion_period_active`
 * (migration 20261124020000_f9_package_promotion_periods.sql, verified by the
 * T056/T057 integration tests) and FR-024/FR-030/SC-021:
 *   - a missing start means available from the category's creation instant
 *     (instant comparison, inclusive at the creation instant);
 *   - a missing end means indefinite;
 *   - supplied bounds are Africa/Cairo calendar dates, start-inclusive and
 *     end-exclusive, evaluated on the Cairo calendar day of the instant
 *     (never the UTC date, never elapsed-hours arithmetic);
 *   - expiry blocks new registration links only; issued-link snapshots are
 *     never rewritten, so the evaluation MUST stay pure (no input mutation).
 *
 * RED convention (as landed for T058 in `tests/unit/packages-fx-red.test.ts`
 * at cbcca5e4): these cases were planned-RED via `it.fails(...)` and merge-safe
 * while the module was absent. With the implementing task landed, `redIt` is
 * now `it` so every case runs as a real test. Both
 * `npx vitest run tests/unit/packages-promotion-red.test.ts` and
 * `PROMOTION_RED_STRICT=1 npx vitest run tests/unit/packages-promotion-red.test.ts`
 * must pass 100%.
 *
 * Module contract (names as implemented in `lib/packages/promotion.ts`):
 *   type PromotionPeriod = {
 *     createdAt: string;        // ISO instant of the category's creation
 *     startsAt: string | null;   // Africa/Cairo date 'YYYY-MM-DD' or null
 *     endsAt: string | null;    // Africa/Cairo date 'YYYY-MM-DD' or null
 *   };
 *   isPromotionPeriodActive(period: PromotionPeriod, at: string): boolean
 *
 * FX clause (FR-026): the pinned-provider (S61-PO-1) latest-prior-valid-
 * publication rule is already implemented as PURE selection logic in
 * `lib/packages/fx.ts` (T059, verified). The cases below are deliberately
 * regular `it` regression tests against that pure selection function only -
 * no network, no provider calls, synthetic publications only.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  FX_PROVIDER_PINS,
  resolveFxSnapshot,
  selectFxSnapshot,
  type FxPublication,
  type FxSnapshot,
} from '../../lib/packages/fx';

type PromotionPeriod = {
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
};
interface PromotionModule {
  isPromotionPeriodActive(period: PromotionPeriod, at: string): boolean;
}

// Vite root-relative id so the missing module is not a static (typecheck)
// import.
const PROMOTION_MODULE = '/lib/packages/promotion';
const loadPromotion = async (): Promise<PromotionModule> =>
  (await import(/* @vite-ignore */ PROMOTION_MODULE)) as PromotionModule;

// T067 is implemented in lib/packages/promotion.ts; all cases are real tests.
const redIt = it;

const active = async (period: PromotionPeriod, at: string): Promise<boolean> =>
  (await loadPromotion()).isPromotionPeriodActive(period, at);

// Creation instant for periods whose supplied bounds carry the decision.
const CREATED_AT = '2026-01-01T00:00:00.000Z';

describe('T067 supplied bounds are Cairo start-inclusive/end-exclusive', () => {
  redIt.each([
    [
      '2026-11-09T21:59:59Z',
      false,
      'winter UTC+2: last instant before the Cairo start day',
    ],
    [
      '2026-11-09T22:00:00Z',
      true,
      'winter UTC+2: Cairo midnight of the inclusive start day',
    ],
    [
      '2026-11-10T21:59:59Z',
      true,
      'winter UTC+2: last instant inside the window',
    ],
    [
      '2026-11-10T22:00:00Z',
      false,
      'winter UTC+2: Cairo midnight of the exclusive end day',
    ],
  ] as const)('%s -> %s (%s)', async (at, expected, label) => {
    void label;
    expect(
      await active(
        { createdAt: CREATED_AT, startsAt: '2026-11-10', endsAt: '2026-11-11' },
        at,
      ),
    ).toBe(expected);
  });

  redIt.each([
    [
      '2026-07-19T20:59:59Z',
      false,
      'summer UTC+3: last instant before the Cairo start day',
    ],
    [
      '2026-07-19T21:00:00Z',
      true,
      'summer UTC+3: Cairo midnight of the inclusive start day',
    ],
    [
      '2026-07-20T20:59:59Z',
      true,
      'summer UTC+3: last instant inside the window',
    ],
    [
      '2026-07-20T21:00:00Z',
      false,
      'summer UTC+3: Cairo midnight of the exclusive end day',
    ],
  ] as const)('%s -> %s (%s)', async (at, expected, label) => {
    void label;
    expect(
      await active(
        { createdAt: CREATED_AT, startsAt: '2026-07-20', endsAt: '2026-07-21' },
        at,
      ),
    ).toBe(expected);
  });

  redIt('uses the Africa/Cairo date, not the UTC date (winter)', async () => {
    // 22:30Z on 2026-11-09 is 00:30 on 2026-11-10 in Cairo.
    const period: PromotionPeriod = {
      createdAt: CREATED_AT,
      startsAt: '2026-11-10',
      endsAt: null,
    };
    expect(await active(period, '2026-11-09T21:59:59.999Z')).toBe(false);
    expect(await active(period, '2026-11-09T22:30:00Z')).toBe(true);
  });

  redIt(
    'spring-forward start day: the skipped Cairo midnight hour stays excluded',
    async () => {
      // Egypt jumps 00:00 -> 01:00 on Friday 2026-04-24, so the first
      // existing instant of Cairo 2026-04-24 is 2026-04-23T22:00:00Z.
      const period: PromotionPeriod = {
        createdAt: CREATED_AT,
        startsAt: '2026-04-24',
        endsAt: null,
      };
      expect(await active(period, '2026-04-23T21:59:59.999Z')).toBe(false);
      expect(await active(period, '2026-04-23T22:00:00Z')).toBe(true);
    },
  );

  redIt(
    'fall-back end day: both passes of the repeated 23:00 hour stay inside',
    async () => {
      // Cairo midnight of 2026-10-30 is 2026-10-29T22:00:00Z; the local
      // 23:00 hour of 2026-10-29 exists twice (20:xxZ UTC+3 and 21:xxZ UTC+2).
      const period: PromotionPeriod = {
        createdAt: CREATED_AT,
        startsAt: null,
        endsAt: '2026-10-30',
      };
      expect(await active(period, '2026-10-29T20:59:59.999Z')).toBe(true);
      expect(await active(period, '2026-10-29T21:59:59.999Z')).toBe(true);
      expect(await active(period, '2026-10-29T22:00:00Z')).toBe(false);
    },
  );
});

describe('T067 missing promotion start is available from creation', () => {
  redIt.each([
    ['2026-11-05T10:15:29.999999Z', false, 'one microsecond before creation'],
    ['2026-11-05T10:15:30.000Z', true, 'exactly the creation instant'],
    ['2026-11-06T00:00:00.000Z', true, 'after creation'],
  ] as const)('%s -> %s (%s)', async (at, expected, label) => {
    void label;
    expect(
      await active(
        {
          createdAt: '2026-11-05T10:15:30.000Z',
          startsAt: null,
          endsAt: null,
        },
        at,
      ),
    ).toBe(expected);
  });

  redIt(
    'missing start with a supplied end still opens at the creation instant',
    async () => {
      const period: PromotionPeriod = {
        createdAt: '2026-11-05T10:15:30.000Z',
        startsAt: null,
        endsAt: '2026-11-10',
      };
      expect(await active(period, '2026-11-05T10:15:30.000Z')).toBe(true);
      expect(await active(period, '2026-11-09T21:59:59.999Z')).toBe(true);
      expect(await active(period, '2026-11-09T22:00:00Z')).toBe(false);
    },
  );
});

describe('T067 missing promotion end is indefinite', () => {
  redIt.each([
    [
      '2026-01-14T21:59:59.999Z',
      false,
      'last instant before the supplied start day',
    ],
    ['2026-01-14T22:00:00Z', true, 'Cairo midnight of the supplied start day'],
    ['2031-06-01T12:00:00Z', true, 'years later: no end bound, still sellable'],
  ] as const)('%s -> %s (%s)', async (at, expected, label) => {
    void label;
    expect(
      await active(
        { createdAt: CREATED_AT, startsAt: '2026-01-15', endsAt: null },
        at,
      ),
    ).toBe(expected);
  });

  redIt(
    'no bounds at all stays sellable indefinitely after creation',
    async () => {
      const period: PromotionPeriod = {
        createdAt: '2026-11-05T10:15:30.000Z',
        startsAt: null,
        endsAt: null,
      };
      expect(await active(period, '2031-06-01T12:00:00Z')).toBe(true);
    },
  );
});

describe('T067 expiry blocks only new links; issued links retain snapshots', () => {
  const expired: PromotionPeriod = {
    createdAt: '1999-12-01T00:00:00.000Z',
    startsAt: null,
    endsAt: '2000-01-01',
  };

  redIt.each([
    ['2000-01-01T00:00:00Z', 'at the exclusive end day itself'],
    ['2026-11-10T12:00:00Z', 'years after the approved end'],
    ['2031-06-01T12:00:00Z', 'far future after the approved end'],
  ] as const)('%s -> false (%s)', async (at, label) => {
    void label;
    expect(await active(expired, at)).toBe(false);
  });

  redIt(
    'evaluation changes zero stored snapshots: the period input is never mutated',
    async () => {
      const period: PromotionPeriod = {
        createdAt: '2026-11-05T10:15:30.000Z',
        startsAt: '2026-11-10',
        endsAt: '2026-11-20',
      };
      const before = JSON.parse(JSON.stringify(period)) as PromotionPeriod;
      for (const at of [
        '2026-11-09T21:59:59.999Z',
        '2026-11-09T22:00:00Z',
        '2026-11-15T12:00:00Z',
        '2026-11-19T21:59:59.999Z',
        '2026-11-19T22:00:00Z',
        '2031-06-01T12:00:00Z',
      ]) {
        await active(period, at);
      }
      expect(period).toEqual(before);
    },
  );

  redIt(
    'repeated evaluation is idempotent: the decision never drifts',
    async () => {
      const results: boolean[] = [];
      for (let i = 0; i < 5; i += 1) {
        results.push(await active(expired, '2026-11-10T12:00:00Z'));
      }
      expect(results).toEqual([false, false, false, false, false]);
    },
  );
});

describe('T067 pinned-provider latest prior valid publication (pure selection)', () => {
  const select = (input: {
    transactionAt: string;
    currency: 'EGP' | 'USD' | 'SAR';
    publications: readonly FxPublication[];
  }): FxSnapshot => selectFxSnapshot(input);

  it('USD->CBE: latest prior valid publication strictly before the Cairo date', () => {
    // 22:30Z on 2026-11-09 is 00:30 on 2026-11-10 in Cairo (UTC+2), so the
    // 2026-11-10 row is on the transaction's own Cairo date and is excluded.
    expect(
      select({
        transactionAt: '2026-11-09T22:30:00Z',
        currency: 'USD',
        publications: [
          { date: '2026-11-05', rate: '54.10' },
          { date: '2026-11-09', rate: '54.20' },
          { date: '2026-11-10', rate: '54.30' },
        ],
      }),
    ).toEqual({
      status: 'ready',
      rate: '54.20',
      publicationDate: '2026-11-09',
      provider: 'CBE',
    });
  });

  it('CBE weekend rows are never selected; the fallback stays on the calendar', () => {
    expect(
      select({
        transactionAt: '2026-11-08T12:00:00Z', // Cairo Sunday
        currency: 'USD',
        publications: [
          { date: '2026-11-06', rate: '54.99' }, // Friday: CBE never publishes
          { date: '2026-11-07', rate: '54.98' }, // Saturday: CBE never publishes
          { date: '2026-11-05', rate: '54.10' }, // Thursday
        ],
      }),
    ).toEqual({
      status: 'ready',
      rate: '54.10',
      publicationDate: '2026-11-05',
      provider: 'CBE',
    });
  });

  it('SAMA publishes daily, so a weekend row is selectable for SAR', () => {
    expect(
      select({
        transactionAt: '2026-11-08T12:00:00Z',
        currency: 'SAR',
        publications: [
          { date: '2026-11-07', rate: '13.60' }, // Saturday on SAMA's calendar
          { date: '2026-11-06', rate: '13.55' },
        ],
      }),
    ).toEqual({
      status: 'ready',
      rate: '13.60',
      publicationDate: '2026-11-07',
      provider: 'SAMA',
    });
  });

  it('a CBE holiday row is simply absent: selection continues to the latest earlier valid publication', () => {
    // 2026-10-06 (Tuesday, national holiday) has no CBE row, so a transaction
    // on Cairo 2026-10-07 falls back to Monday 2026-10-05.
    expect(
      select({
        transactionAt: '2026-10-07T12:00:00Z',
        currency: 'USD',
        publications: [
          { date: '2026-10-05', rate: '54.05' },
          { date: '2026-10-04', rate: '54.00' },
        ],
      }),
    ).toEqual({
      status: 'ready',
      rate: '54.05',
      publicationDate: '2026-10-05',
      provider: 'CBE',
    });
  });

  it('no valid prior publication stays idempotent pending, never a fabricated rate', () => {
    const input = {
      transactionAt: '2026-11-09T22:30:00Z',
      currency: 'USD' as const,
    };
    expect(select({ ...input, publications: [] })).toEqual({
      status: 'pending',
    });
    expect(
      select({
        ...input,
        publications: [{ date: '2026-11-10', rate: '54.30' }],
      }),
    ).toEqual({ status: 'pending' });
  });

  it('one pinned provider per currency (S61-PO-1) and EGP identity without lookup', () => {
    expect(FX_PROVIDER_PINS).toEqual({ USD: 'CBE', SAR: 'SAMA' });
    expect(
      select({
        transactionAt: '2026-11-09T22:30:00Z',
        currency: 'EGP',
        publications: [{ date: '2026-11-05', rate: '99' }],
      }),
    ).toEqual({
      status: 'ready',
      rate: '1',
      publicationDate: null,
      provider: null,
    });
  });

  it('a ready snapshot remains immutable even when a newer publication exists', () => {
    const existing: FxSnapshot = {
      status: 'ready',
      rate: '54.20',
      publicationDate: '2026-11-09',
      provider: 'CBE',
    };
    expect(
      resolveFxSnapshot({
        transactionAt: '2026-11-09T22:30:00Z',
        currency: 'USD',
        publications: [{ date: '2026-11-09', rate: '54.99' }],
        existing,
      }),
    ).toEqual(existing);
    expect(
      resolveFxSnapshot({
        transactionAt: '2026-11-09T22:30:00Z',
        currency: 'USD',
        publications: [{ date: '2026-11-09', rate: '54.99' }],
        existing: { status: 'pending' },
      }),
    ).toEqual({
      status: 'ready',
      rate: '54.99',
      publicationDate: '2026-11-09',
      provider: 'CBE',
    });
  });
});
