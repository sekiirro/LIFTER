/**
 * T058 [FR-026, FR-031, SC-017, SC-022] - FX contract tests (spec 009), now GREEN
 * against `lib/packages/fx.ts` (T059). History: these were planned-RED
 * (`it.fails`) while T059 was blocked on T075; S61-PO-1 FX=B unblocked them
 * and amended the calendar fixtures to the pinned providers' own calendars:
 *   USD -> EGP : CBE  (Sunday-Thursday rows, no Friday/Saturday, holidays absent)
 *   SAR -> EGP : SAMA (daily rows including weekends; SAR/USD peg 3.75)
 * All rates below are SYNTHETIC test data chosen only to make selection and
 * rounding observable. No live network is used.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildFxReport,
  isProviderPublicationDay,
  resolveFxSnapshot,
  selectFxSnapshot,
  type FxCurrency,
  type FxProviderKey,
  type FxReportLine,
  type FxSettlement,
  type FxSnapshot,
  type SelectFxInput,
} from '../../lib/packages/fx';

type Snapshot = FxSnapshot;
type ReportLine = FxReportLine;
type Settlement = FxSettlement;
type SelectInput = SelectFxInput;

const ready = (
  rate: string,
  publicationDate: string | null = '2026-11-05',
  provider: FxProviderKey | null = 'CBE',
): Snapshot => ({
  status: 'ready',
  rate,
  publicationDate,
  provider,
});
const pending: Snapshot = { status: 'pending' };
const select = async (input: SelectInput) => selectFxSnapshot(input);
const USD: FxCurrency = 'USD';
const SAR: FxCurrency = 'SAR';

describe('T058 pinned-provider publication calendars', () => {
  it.each([
    ['CBE', '2026-11-08', true, 'Sunday'],
    ['CBE', '2026-11-05', true, 'Thursday'],
    [
      'CBE',
      '2026-10-06',
      true,
      'Egyptian holiday weekday: rows are absent, not a calendar rule',
    ],
    ['CBE', '2026-11-06', false, 'Friday'],
    ['CBE', '2026-11-07', false, 'Saturday'],
    ['SAMA', '2026-11-06', true, 'Friday'],
    ['SAMA', '2026-11-07', true, 'Saturday'],
    ['SAMA', '2026-11-08', true, 'Sunday'],
    ['CBE', '2026-02-30', false, 'impossible date'],
    ['CBE', 'abc', false, 'malformed date'],
  ] as const)('%s %s -> %s (%s)', (provider, date, expected, label) => {
    void label;
    expect(isProviderPublicationDay(provider, date)).toBe(expected);
  });
});

describe('T058 latest prior valid publication, strictly before the Africa/Cairo date', () => {
  it('maps the instant to its Africa/Cairo date, not the UTC date (winter, UTC+2)', async () => {
    const publications = [
      { date: '2026-11-08', rate: '54.10' },
      { date: '2026-11-09', rate: '54.20' },
    ];
    // 22:30Z on 2026-11-09 is 00:30 on 2026-11-10 in Cairo: prior = Mon 11-09.
    expect(
      await select({
        transactionAt: '2026-11-09T22:30:00Z',
        currency: USD,
        publications,
      }),
    ).toEqual(ready('54.20', '2026-11-09'));
    // 21:30Z on 2026-11-09 is 23:30 on 2026-11-09 in Cairo: prior = Sun 11-08.
    expect(
      await select({
        transactionAt: '2026-11-09T21:30:00Z',
        currency: USD,
        publications,
      }),
    ).toEqual(ready('54.10', '2026-11-08'));
  });

  it('maps the instant using Cairo summer time (UTC+3)', async () => {
    const publications = [
      { date: '2026-07-08', rate: '50.10' },
      { date: '2026-07-09', rate: '50.20' },
    ];
    // 21:30Z on 2026-07-09 is 00:30 on 2026-07-10 in Cairo (UTC+3).
    expect(
      await select({
        transactionAt: '2026-07-09T21:30:00Z',
        currency: USD,
        publications,
      }),
    ).toEqual(ready('50.20', '2026-07-09', 'CBE'));
  });

  it('never uses a publication dated on the transaction date itself', async () => {
    const publications = [
      { date: '2026-11-10', rate: '99.99' },
      { date: '2026-11-09', rate: '54.20' },
    ];
    expect(
      await select({
        transactionAt: '2026-11-10T09:00:00Z',
        currency: USD,
        publications,
      }),
    ).toEqual(ready('54.20', '2026-11-09'));
  });

  it('(a) CBE weekend fixture: Fri, Sat and Sun transactions use Thursday; a stray Friday row is rejected', async () => {
    const publications = [
      { date: '2026-11-04', rate: '54.50' },
      { date: '2026-11-05', rate: '54.10' },
      { date: '2026-11-06', rate: '77.77' }, // not a CBE publication day
    ];
    for (const transactionAt of [
      '2026-11-06T10:00:00Z', // Friday
      '2026-11-07T10:00:00Z', // Saturday
      '2026-11-08T10:00:00Z', // Sunday (strictly before: Thursday)
    ]) {
      expect(
        await select({ transactionAt, currency: USD, publications }),
      ).toEqual(ready('54.10', '2026-11-05'));
    }
    // Monday uses the Sunday publication, which CBE does publish.
    expect(
      await select({
        transactionAt: '2026-11-09T10:00:00Z',
        currency: USD,
        publications: [...publications, { date: '2026-11-08', rate: '54.30' }],
      }),
    ).toEqual(ready('54.30', '2026-11-08'));
  });

  it('(b) CBE holiday fixture: absent holiday rows fall back to the latest earlier valid publication', async () => {
    const publications = [
      { date: '2026-05-24', rate: '50.40' },
      { date: '2026-05-25', rate: '50.10' },
      // 2026-05-26..28 (holiday run) and Sunday 05-31 have no CBE rows.
    ];
    for (const transactionAt of [
      '2026-05-27T10:00:00Z',
      '2026-05-31T10:00:00Z',
      '2026-06-01T10:00:00Z',
    ]) {
      expect(
        await select({ transactionAt, currency: USD, publications }),
      ).toEqual(ready('50.10', '2026-05-25'));
    }
  });

  it('SAMA (SAR) publishes on weekends: Mon uses Sunday, Sunday uses Saturday', async () => {
    const publications = [
      { date: '2026-11-06', rate: '14.374' },
      { date: '2026-11-07', rate: '14.3802' },
      { date: '2026-11-08', rate: '14.3803' },
    ];
    expect(
      await select({
        transactionAt: '2026-11-09T10:00:00Z',
        currency: SAR,
        publications,
      }),
    ).toEqual(ready('14.3803', '2026-11-08', 'SAMA'));
    expect(
      await select({
        transactionAt: '2026-11-08T10:00:00Z',
        currency: SAR,
        publications,
      }),
    ).toEqual(ready('14.3802', '2026-11-07', 'SAMA'));
  });

  it('SAMA missing-publication fallback: 2025-08-05..07 absent falls back to 2025-08-04', async () => {
    const publications = [
      { date: '2025-08-03', rate: '14.0' },
      { date: '2025-08-04', rate: '14.1' },
    ];
    expect(
      await select({
        transactionAt: '2025-08-08T10:00:00Z',
        currency: SAR,
        publications,
      }),
    ).toEqual(ready('14.1', '2025-08-04', 'SAMA'));
  });

  it('falls back to the latest earlier valid publication when the immediately prior day has none', async () => {
    const publications = [
      { date: '2026-11-04', rate: '54.50' },
      { date: '2026-11-09', rate: '54.20' },
    ];
    expect(
      await select({
        transactionAt: '2026-11-11T10:00:00Z',
        currency: USD,
        publications,
      }),
    ).toEqual(ready('54.20', '2026-11-09'));
  });

  it.each([['0'], ['-1.5'], ['NaN'], [''], ['abc'], ['1e3'], ['0.000']])(
    'treats rate %j on the prior day as not valid and continues to the earlier publication',
    async (badRate) => {
      const publications = [
        { date: '2026-11-09', rate: '54.20' },
        { date: '2026-11-10', rate: badRate },
      ];
      expect(
        await select({
          transactionAt: '2026-11-11T10:00:00Z',
          currency: USD,
          publications,
        }),
      ).toEqual(ready('54.20', '2026-11-09'));
    },
  );

  it('no valid prior publication -> pending, deterministic and idempotent on retry', async () => {
    const input: SelectInput = {
      transactionAt: '2026-11-10T10:00:00Z',
      currency: USD,
      publications: [{ date: '2026-11-10', rate: '54.00' }], // not strictly before
    };
    const first = await select(input);
    const second = await select(input);
    expect(first).toEqual(pending);
    expect(second).toEqual(first);
    expect(await select({ ...input, publications: [] })).toEqual(pending);
    expect(
      await select({
        ...input,
        publications: [{ date: '2026-11-09', rate: '54.20' }],
      }),
    ).toEqual(ready('54.20', '2026-11-09'));
  });

  it('an invalid transaction instant is pending, never a thrown error', async () => {
    expect(
      await select({
        transactionAt: 'not-a-date',
        currency: USD,
        publications: [],
      }),
    ).toEqual(pending);
  });

  it('EGP identity: exactly 1 with no publication lookup, even with no publications', async () => {
    expect(
      await select({
        transactionAt: '2026-11-10T10:00:00Z',
        currency: 'EGP',
        publications: [],
      }),
    ).toEqual(ready('1', null, null));
    // A stray EGP publication must not override the identity rate.
    expect(
      await select({
        transactionAt: '2026-11-10T10:00:00Z',
        currency: 'EGP',
        publications: [{ date: '2026-11-09', rate: '1.0001' }],
      }),
    ).toEqual(ready('1', null, null));
  });

  it('immutable snapshot: a ready snapshot is never recalculated by later publications or mutated', async () => {
    const existing = Object.freeze(ready('54.20', '2026-11-09')) as Snapshot;
    const publications = Object.freeze([
      Object.freeze({ date: '2026-11-09', rate: '60.00' }),
      Object.freeze({ date: '2026-11-10', rate: '61.00' }),
    ]);
    const result = resolveFxSnapshot({
      existing,
      transactionAt: '2026-11-11T10:00:00Z',
      currency: USD,
      publications,
    });
    expect(result).toEqual(ready('54.20', '2026-11-09'));
    expect(existing).toEqual(ready('54.20', '2026-11-09'));
  });

  it('a pending snapshot is re-selected on retry', async () => {
    const result = resolveFxSnapshot({
      existing: pending,
      transactionAt: '2026-11-11T10:00:00Z',
      currency: USD,
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
    buildFxReport({ lines, settlements });

  it('odd-cent fixture: two USD 0.01 lines at 1.5 EGP/USD = 0.03 EGP = 3 minor units, not 4', async () => {
    const result = await report([
      line('a', 1n, ready('1.5')),
      line('b', 1n, ready('1.5')),
    ]);
    expect(result.aggregates['2026-11']).toBe(3n);
  });

  it('exact half-minor-unit tie rounds up (never banker rounding)', async () => {
    const one = async (minor: bigint) =>
      (await report([line('a', minor, ready('0.5'))])).aggregates['2026-11'];
    expect(await one(1n)).toBe(1n); // 0.5 -> 1
    expect(await one(3n)).toBe(2n); // 1.5 -> 2
    expect(await one(5n)).toBe(3n); // 2.5 -> 3
  });

  it('lines are not rounded individually: two 0.4-minor lines sum to 0.8 -> 1', async () => {
    const result = await report([
      line('a', 1n, ready('0.4')),
      line('b', 1n, ready('0.4')),
    ]);
    expect(result.aggregates['2026-11']).toBe(1n);
  });

  it('below the tie rounds down, above it rounds up', async () => {
    expect(
      (await report([line('a', 1n, ready('0.49'))])).aggregates['2026-11'],
    ).toBe(0n);
    expect(
      (await report([line('a', 1n, ready('0.51'))])).aggregates['2026-11'],
    ).toBe(1n);
  });

  it('each reported aggregate (group) is rounded once, independently', async () => {
    const result = await report([
      line('a', 1n, ready('0.5'), 'USD', '2026-10'),
      line('b', 1n, ready('0.5'), 'USD', '2026-11'),
    ]);
    expect(result.aggregates).toEqual({ '2026-10': 1n, '2026-11': 1n });
  });

  it('mixes currencies exactly: USD, SAR and EGP identity in one aggregate', async () => {
    const result = await report([
      line('usd', 10_000n, ready('54.5'), 'USD'), // 100.00 USD -> 545000 minor
      line('sar', 3n, ready('14.5', '2026-11-05', 'SAMA'), 'SAR'), // 43.5 minor
      line('egp', 12_345n, ready('1', null, null), 'EGP'), // identity
    ]);
    // 545000 + 43.5 + 12345 = 557388.5 -> half-up 557389
    expect(result.aggregates['2026-11']).toBe(557_389n);
  });

  it('pending lines are excluded from converted totals and listed for retry', async () => {
    const result = await report([
      line('ok', 100n, ready('2')),
      line('wait', 999_999n, pending),
    ]);
    expect(result.aggregates['2026-11']).toBe(200n);
    expect(result.excludedLineIds).toEqual(['wait']);
  });

  it('settlement records stay separate and original amount/currency is unchanged', async () => {
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
  });
});
