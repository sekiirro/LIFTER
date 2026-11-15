/**
 * T058 [FR-026, FR-031, SC-017, SC-022] - RED-first FX contract tests (spec 009).
 *
 * These tests specify the pure FX selection/aggregation contract that T059 must
 * implement in `lib/packages/fx.ts`. That module does NOT exist yet and no
 * placeholder is created here. T059 stays BLOCKED on T075 (see
 * specs/009-packages/fx-coverage-verification.md): no Frankfurter service that
 * matches the ECB/TARGET assumption covers EGP or SAR, so no provider, rate or
 * fallback is assumed by these fixtures. All rates below are SYNTHETIC test
 * data chosen only to make selection and rounding observable.
 *
 * RED convention (planned-RED, merge-safe): every case is `it.fails(...)` and
 * therefore passes in CI while the module is absent. Run
 * `FX_RED_STRICT=1 npx vitest run tests/unit/packages-fx-red.test.ts` to see
 * the real RED failures. When T059 lands, `it.fails` turns into a failure,
 * which is the signal to drop `.fails` (set `redIt = it`) in the T059 PR.
 *
 * Proposed module contract (T059 may refine names, not the observable rules):
 *   isTargetBusinessDay(date: 'YYYY-MM-DD'): boolean
 *   selectFxSnapshot({ transactionAt: ISO instant, currency, publications })
 *     -> { status: 'ready', rate: decimal string, publicationDate: 'YYYY-MM-DD' | null }
 *      | { status: 'pending' }
 *   resolveFxSnapshot({ existing, ...selectFxSnapshot input })
 *     -> the existing snapshot when it is ready, otherwise a fresh selection
 *   buildFxReport({ lines, settlements })
 *     -> { aggregates, excludedLineIds, lines, settlements }
 * `publications` are rate-to-EGP publications for the line currency, each
 * `{ date, rate }` with rate a decimal string (exact rational arithmetic only).
 */
import { describe, expect, it } from 'vitest';

type Snapshot =
  | { status: 'ready'; rate: string; publicationDate: string | null }
  | { status: 'pending' };
type Publication = { date: string; rate: string };
type SelectInput = {
  transactionAt: string;
  currency: 'EGP' | 'USD' | 'SAR';
  publications: readonly Publication[];
};
type ReportLine = {
  id: string;
  groupKey: string;
  amountMinor: bigint;
  currency: 'EGP' | 'USD' | 'SAR';
  snapshot: Snapshot;
};
type Settlement = { id: string; amountMinor: bigint; currency: string };
type Report = {
  aggregates: Record<string, bigint>;
  excludedLineIds: string[];
  lines: ReportLine[];
  settlements: Settlement[];
};
interface FxModule {
  isTargetBusinessDay(date: string): boolean;
  selectFxSnapshot(input: SelectInput): Snapshot;
  resolveFxSnapshot(
    input: SelectInput & { existing: Snapshot | null },
  ): Snapshot;
  buildFxReport(input: {
    lines: readonly ReportLine[];
    settlements: readonly Settlement[];
  }): Report;
}

// Vite root-relative id so the missing module is not a static (typecheck) import.
const FX_MODULE = '/lib/packages/fx';
const loadFx = async (): Promise<FxModule> =>
  (await import(/* @vite-ignore */ FX_MODULE)) as FxModule;

// Planned-RED marker (T058): merge-safe while T059 is blocked on T075.
const redIt = process.env.FX_RED_STRICT ? it : it.fails;

const ready = (
  rate: string,
  publicationDate: string | null = '2026-11-06',
): Snapshot => ({
  status: 'ready',
  rate,
  publicationDate,
});
const pending: Snapshot = { status: 'pending' };
const select = async (input: SelectInput) =>
  (await loadFx()).selectFxSnapshot(input);

describe('T058 ECB/TARGET business-day calendar', () => {
  redIt.each([
    ['2026-11-10', true, 'ordinary Tuesday'],
    ['2026-10-06', true, 'Egyptian national holiday is a TARGET business day'],
    ['2026-12-24', true, 'Christmas Eve is a TARGET business day'],
    ['2026-12-31', true, 'New Year Eve is a TARGET business day'],
    ['2026-04-02', true, 'Maundy Thursday'],
    ['2026-04-07', true, 'Tuesday after Easter Monday'],
    ['2026-11-07', false, 'Saturday'],
    ['2026-11-08', false, 'Sunday'],
    ['2026-01-01', false, 'New Year'],
    ['2025-01-01', false, 'New Year'],
    ['2026-04-03', false, 'Good Friday 2026'],
    ['2026-04-06', false, 'Easter Monday 2026'],
    ['2025-04-18', false, 'Good Friday 2025'],
    ['2025-04-21', false, 'Easter Monday 2025'],
    ['2026-05-01', false, 'Labour Day'],
    ['2025-12-25', false, 'Christmas Day'],
    ['2025-12-26', false, 'second day of Christmas'],
    ['2024-12-25', false, 'Christmas Day 2024'],
    ['2024-12-26', false, 'second day of Christmas 2024'],
  ])('%s -> %s (%s)', async (date, expected) => {
    expect((await loadFx()).isTargetBusinessDay(date)).toBe(expected);
  });
});

describe('T058 latest prior valid publication, strictly before the Africa/Cairo date', () => {
  redIt(
    'maps the instant to its Africa/Cairo date, not the UTC date',
    async () => {
      const publications = [
        { date: '2026-11-06', rate: '54.10' },
        { date: '2026-11-09', rate: '54.20' },
      ];
      // 22:30Z on 2026-11-09 is 00:30 on 2026-11-10 in Cairo (UTC+2): prior = Mon 11-09.
      expect(
        await select({
          transactionAt: '2026-11-09T22:30:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
      // 21:30Z on 2026-11-09 is 23:30 on 2026-11-09 in Cairo: prior = Fri 11-06.
      expect(
        await select({
          transactionAt: '2026-11-09T21:30:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('54.10', '2026-11-06'));
    },
  );

  redIt(
    'never uses a publication dated on the transaction date itself',
    async () => {
      const publications = [
        { date: '2026-11-10', rate: '99.99' },
        { date: '2026-11-09', rate: '54.20' },
      ];
      expect(
        await select({
          transactionAt: '2026-11-10T09:00:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  redIt(
    '(a) weekend fixture: Sat, Sun and Mon transactions use Friday, distinct from Thursday',
    async () => {
      const publications = [
        { date: '2026-11-05', rate: '54.50' },
        { date: '2026-11-06', rate: '54.10' },
      ];
      for (const transactionAt of [
        '2026-11-07T10:00:00Z',
        '2026-11-08T10:00:00Z',
        '2026-11-09T10:00:00Z',
      ]) {
        expect(
          await select({ transactionAt, currency: 'USD', publications }),
        ).toEqual(ready('54.10', '2026-11-06'));
      }
    },
  );

  redIt(
    '(b) TARGET-holiday fixture: Good Friday, Easter Monday and the weekend fall back to Maundy Thursday',
    async () => {
      const publications = [
        { date: '2026-04-01', rate: '50.40' },
        { date: '2026-04-02', rate: '50.10' },
      ];
      for (const transactionAt of [
        '2026-04-03T10:00:00Z', // Good Friday
        '2026-04-06T10:00:00Z', // Easter Monday
        '2026-04-07T10:00:00Z', // Tuesday after
      ]) {
        expect(
          await select({ transactionAt, currency: 'USD', publications }),
        ).toEqual(ready('50.10', '2026-04-02'));
      }
    },
  );

  redIt(
    '(b) Christmas fixture: a transaction on 2025-12-29 uses Wed 2025-12-24, not Tue 12-23',
    async () => {
      const publications = [
        { date: '2025-12-23', rate: '47.80' },
        { date: '2025-12-24', rate: '47.60' },
      ];
      expect(
        await select({
          transactionAt: '2025-12-29T10:00:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('47.60', '2025-12-24'));
    },
  );

  redIt(
    'falls back to the latest earlier valid publication when the immediately prior business day has none',
    async () => {
      const publications = [
        { date: '2026-11-05', rate: '54.50' },
        { date: '2026-11-09', rate: '54.20' },
        // 2026-11-10 (the immediately prior business day) has no publication.
      ];
      expect(
        await select({
          transactionAt: '2026-11-11T10:00:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  redIt.each([['0'], ['-1.5'], ['NaN'], [''], ['abc']])(
    'treats rate %j on the prior business day as not valid and continues to the earlier publication',
    async (badRate) => {
      const publications = [
        { date: '2026-11-09', rate: '54.20' },
        { date: '2026-11-10', rate: badRate },
      ];
      expect(
        await select({
          transactionAt: '2026-11-11T10:00:00Z',
          currency: 'USD',
          publications,
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  redIt(
    'no valid prior publication -> pending, deterministic and idempotent on retry',
    async () => {
      const input: SelectInput = {
        transactionAt: '2026-11-10T10:00:00Z',
        currency: 'USD',
        publications: [{ date: '2026-11-10', rate: '54.00' }], // not strictly before
      };
      const first = await select(input);
      const second = await select(input);
      expect(first).toEqual(pending);
      expect(second).toEqual(first);
      expect(await select({ ...input, publications: [] })).toEqual(pending);
      // A retry after a prior publication becomes available resolves to ready.
      expect(
        await select({
          ...input,
          publications: [{ date: '2026-11-09', rate: '54.20' }],
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  redIt(
    'EGP identity: exactly 1 with no publication lookup, even with no publications',
    async () => {
      expect(
        await select({
          transactionAt: '2026-11-10T10:00:00Z',
          currency: 'EGP',
          publications: [],
        }),
      ).toMatchObject({ status: 'ready', rate: '1' });
      // A stray EGP publication must not override the identity rate.
      expect(
        await select({
          transactionAt: '2026-11-10T10:00:00Z',
          currency: 'EGP',
          publications: [{ date: '2026-11-09', rate: '1.0001' }],
        }),
      ).toMatchObject({ status: 'ready', rate: '1' });
    },
  );

  redIt(
    'immutable snapshot: a ready snapshot is never recalculated by later publications or mutated',
    async () => {
      const existing = Object.freeze(ready('54.20', '2026-11-09')) as Snapshot;
      const publications = Object.freeze([
        Object.freeze({ date: '2026-11-09', rate: '60.00' }),
        Object.freeze({ date: '2026-11-10', rate: '61.00' }),
      ]);
      const result = (await loadFx()).resolveFxSnapshot({
        existing,
        transactionAt: '2026-11-11T10:00:00Z',
        currency: 'USD',
        publications,
      });
      expect(result).toEqual(ready('54.20', '2026-11-09'));
      expect(existing).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  redIt('a pending snapshot is re-selected on retry', async () => {
    const result = (await loadFx()).resolveFxSnapshot({
      existing: pending,
      transactionAt: '2026-11-11T10:00:00Z',
      currency: 'USD',
      publications: [{ date: '2026-11-10', rate: '54.00' }],
    });
    expect(result).toEqual(ready('54.00', '2026-11-10'));
  });
});

describe('T058 exact per-line conversion and one half-up rounding per reported aggregate', () => {
  const line = (
    id: string,
    amountMinor: bigint,
    snapshot: Snapshot,
    currency: ReportLine['currency'] = 'USD',
    groupKey = '2026-11',
  ): ReportLine => ({ id, groupKey, amountMinor, currency, snapshot });
  const report = async (lines: ReportLine[], settlements: Settlement[] = []) =>
    (await loadFx()).buildFxReport({ lines, settlements });

  redIt(
    'odd-cent fixture: two USD 0.01 lines at 1.5 EGP/USD = 0.03 EGP = 3 minor units, not 4',
    async () => {
      const result = await report([
        line('a', 1n, ready('1.5')),
        line('b', 1n, ready('1.5')),
      ]);
      expect(result.aggregates['2026-11']).toBe(3n);
    },
  );

  redIt(
    'exact half-minor-unit tie rounds up (never banker rounding)',
    async () => {
      const one = async (minor: bigint) =>
        (await report([line('a', minor, ready('0.5'))])).aggregates['2026-11'];
      expect(await one(1n)).toBe(1n); // 0.5 -> 1
      expect(await one(3n)).toBe(2n); // 1.5 -> 2
      expect(await one(5n)).toBe(3n); // 2.5 -> 3
    },
  );

  redIt(
    'lines are not rounded individually: two 0.4-minor lines sum to 0.8 -> 1',
    async () => {
      const result = await report([
        line('a', 1n, ready('0.4')),
        line('b', 1n, ready('0.4')),
      ]);
      expect(result.aggregates['2026-11']).toBe(1n);
    },
  );

  redIt('below the tie rounds down, above it rounds up', async () => {
    expect(
      (await report([line('a', 1n, ready('0.49'))])).aggregates['2026-11'],
    ).toBe(0n);
    expect(
      (await report([line('a', 1n, ready('0.51'))])).aggregates['2026-11'],
    ).toBe(1n);
  });

  redIt(
    'each reported aggregate (group) is rounded once, independently',
    async () => {
      const result = await report([
        line('a', 1n, ready('0.5'), 'USD', '2026-10'),
        line('b', 1n, ready('0.5'), 'USD', '2026-11'),
      ]);
      expect(result.aggregates).toEqual({ '2026-10': 1n, '2026-11': 1n });
    },
  );

  redIt(
    'mixes currencies exactly: USD, SAR and EGP identity in one aggregate',
    async () => {
      const result = await report([
        line('usd', 10_000n, ready('54.5'), 'USD'), // 100.00 USD -> 545000 minor
        line('sar', 3n, ready('14.5'), 'SAR'), // 43.5 minor
        line('egp', 12_345n, ready('1', null), 'EGP'), // identity
      ]);
      // 545000 + 43.5 + 12345 = 557388.5 -> half-up 557389
      expect(result.aggregates['2026-11']).toBe(557_389n);
    },
  );

  redIt(
    'pending lines are excluded from converted totals and listed for retry',
    async () => {
      const result = await report([
        line('ok', 100n, ready('2')),
        line('wait', 999_999n, pending),
      ]);
      expect(result.aggregates['2026-11']).toBe(200n);
      expect(result.excludedLineIds).toEqual(['wait']);
    },
  );

  redIt(
    'settlement records stay separate and original amount/currency is unchanged',
    async () => {
      const settlements: Settlement[] = [
        { id: 's1', amountMinor: 700n, currency: 'USD' },
      ];
      const lines = [line('a', 100n, ready('2'))];
      const result = await report(lines, settlements);
      expect(result.aggregates['2026-11']).toBe(200n);
      expect(result.settlements).toEqual(settlements);
      expect(result.lines).toEqual(lines);
      expect(result.lines[0]).toMatchObject({
        amountMinor: 100n,
        currency: 'USD',
      });
    },
  );
});
