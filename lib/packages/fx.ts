import 'server-only';
import { cairoDateAt } from '../time/cairo-calendar';

/**
 * T059 [FR-026, FR-027, FR-031, SC-017, SC-018, SC-022] - server-only
 * Frankfurter v2 adapter and pure FX selection/aggregation (spec 009, S61-PO-1
 * FX=B).
 *
 * Each foreign line currency is pinned to ONE named Frankfurter v2 provider
 * and that provider's own publication calendar is used:
 *   USD -> EGP : CBE  (Central Bank of Egypt, official rate; Sunday-Thursday)
 *   SAR -> EGP : SAMA (Saudi Central Bank, indicative rate; every calendar day)
 *   EGP -> EGP : exactly 1, no lookup, no provider
 * No blended (unpinned) series, no other provider and no fallback is ever used.
 * Provider terms of use are NOT verified by this code (see
 * specs/009-packages/fx-coverage-verification.md and the T062 review).
 */

export type FxCurrency = 'EGP' | 'USD' | 'SAR';
export type FxProviderKey = 'CBE' | 'SAMA';
export type FxSnapshot =
  | {
      status: 'ready';
      rate: string;
      publicationDate: string | null;
      provider: FxProviderKey | null;
    }
  | { status: 'pending' };
export type FxPublication = { date: string; rate: string };
export type SelectFxInput = {
  transactionAt: string;
  currency: FxCurrency;
  publications: readonly FxPublication[];
};
export type FxReportLine = {
  id: string;
  groupKey: string;
  amountMinor: bigint;
  currency: FxCurrency;
  snapshot: FxSnapshot;
};
export type FxSettlement = {
  id: string;
  amountMinor: bigint;
  currency: string;
};
export type FxReport = {
  aggregates: Record<string, bigint>;
  excludedLineIds: string[];
  /** Ready lines whose snapshot is inconsistent with the pin or implausible. */
  flaggedLineIds: string[];
  lines: FxReportLine[];
  settlements: FxSettlement[];
};

export const FX_BASE_URL = 'https://api.frankfurter.dev/v2';
export const FX_TARGET_CURRENCY = 'EGP';
export const FX_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_CHARS = 256 * 1024;
const MAX_ROWS = 100;
const MAX_TIMEOUT_MS = 15_000;

/**
 * Settle period after the transaction's Africa/Cairo date before a rate may be
 * frozen without a provider row dated on or after that date. ARCHITECT
 * PARAMETER (T062 finding 1): needs PO/architect confirmation.
 */
export const FX_SETTLE_DAYS = 3;

/** Plausibility bounds (inclusive) of the EGP rate per pinned currency. */
export const FX_RATE_BOUNDS: Readonly<
  Record<Exclude<FxCurrency, 'EGP'>, { min: number; max: number }>
> = Object.freeze({
  USD: { min: 1, max: 1000 },
  SAR: { min: 0.5, max: 300 },
});

function isPinnedCurrency(
  currency: unknown,
): currency is Exclude<FxCurrency, 'EGP'> {
  return (
    typeof currency === 'string' && Object.hasOwn(FX_PROVIDER_PINS, currency)
  );
}

function rateInBounds(
  currency: Exclude<FxCurrency, 'EGP'>,
  rate: string,
): boolean {
  const n = Number(rate);
  const b = FX_RATE_BOUNDS[currency];
  return Number.isFinite(n) && n >= b.min && n <= b.max;
}

/** One pinned provider per foreign currency (S61-PO-1). */
export const FX_PROVIDER_PINS: Readonly<
  Record<Exclude<FxCurrency, 'EGP'>, FxProviderKey>
> = Object.freeze({ USD: 'CBE', SAR: 'SAMA' });

/** Publication weekdays (0 = Sunday) of each pinned provider, from live data. */
const PROVIDER_PUBLICATION_WEEKDAYS: Readonly<
  Record<FxProviderKey, readonly number[]>
> = Object.freeze({
  CBE: [0, 1, 2, 3, 4], // no Friday/Saturday rows; holidays are simply absent
  SAMA: [0, 1, 2, 3, 4, 5, 6], // daily rows including weekends
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_RE = /^\d+(\.\d+)?$/;

function weekdayOf(date: string): number | null {
  if (!DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    return null;
  return d.getUTCDay();
}

/** Whether the pinned provider's own calendar can publish on this date. */
export function isProviderPublicationDay(
  provider: FxProviderKey,
  date: string,
): boolean {
  const weekdays = PROVIDER_PUBLICATION_WEEKDAYS[provider];
  const weekday = weekdayOf(date);
  return weekday !== null && !!weekdays && weekdays.includes(weekday);
}

function isValidRate(rate: unknown): rate is string {
  return (
    typeof rate === 'string' &&
    DECIMAL_RE.test(rate) &&
    /[1-9]/.test(rate.replace('.', ''))
  );
}

const EGP_IDENTITY: FxSnapshot = Object.freeze({
  status: 'ready',
  rate: '1',
  publicationDate: null,
  provider: null,
});
const PENDING: FxSnapshot = Object.freeze({ status: 'pending' });

/**
 * Latest valid publication strictly before the Africa/Cairo date of the
 * instant, on the pinned provider's own calendar. Rows on days the provider
 * does not publish, or with an invalid rate, are skipped.
 */
export function selectFxSnapshot(input: SelectFxInput): FxSnapshot {
  if (input.currency === 'EGP') return Object.freeze({ ...EGP_IDENTITY });
  if (!isPinnedCurrency(input.currency)) return { ...PENDING };
  const provider = FX_PROVIDER_PINS[input.currency];
  let transactionDate: string;
  try {
    transactionDate = cairoDateAt(input.transactionAt);
  } catch {
    return { ...PENDING };
  }
  let best: FxPublication | null = null;
  for (const publication of input.publications) {
    if (
      !isProviderPublicationDay(provider, publication.date) ||
      publication.date >= transactionDate ||
      !isValidRate(publication.rate) ||
      !rateInBounds(input.currency, publication.rate)
    )
      continue;
    if (!best || publication.date > best.date) best = publication;
  }
  if (!best) return { ...PENDING };
  return Object.freeze({
    status: 'ready',
    rate: best.rate,
    publicationDate: best.date,
    provider,
  });
}

/** A ready snapshot is immutable; only a missing or pending one is selected. */
export function resolveFxSnapshot(
  input: SelectFxInput & { existing: FxSnapshot | null },
): FxSnapshot {
  if (input.existing && input.existing.status === 'ready')
    return Object.freeze({ ...input.existing });
  return selectFxSnapshot(input);
}

// ---------------------------------------------------------------------------
// Request construction (FR-027: no client/workspace/transaction data)
// ---------------------------------------------------------------------------

export type FxRequestWindow = { from: string; to: string };

/**
 * Calendar-month-aligned window: previous month start .. current month end of
 * the transaction's Africa/Cairo date. Only a coarse month is revealed, never
 * the exact date, and it covers every provider gap observed in live data.
 */
export function fxRequestWindow(transactionAt: string): FxRequestWindow {
  const date = cairoDateAt(transactionAt);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${prevYear}-${pad(prevMonth)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * The v2 range endpoint carries the latest earlier row in when `from` has no
 * row of its own (observed: from=2026-10-09 returns the 2026-10-07 CBE row), so
 * rows may precede `from`; anything older than 31 days before it is rejected.
 */
function carryInFloor(from: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 31);
  return d.toISOString().slice(0, 10);
}

/** Pinned-provider URL; contains only provider, currency pair and date range. */
export function buildFxRequestUrl(
  currency: Exclude<FxCurrency, 'EGP'>,
  window: FxRequestWindow,
): string {
  const provider = FX_PROVIDER_PINS[currency];
  const params = new URLSearchParams({
    base: currency,
    quotes: FX_TARGET_CURRENCY,
    providers: provider,
    from: window.from,
    to: window.to,
  });
  return `${FX_BASE_URL}/rates?${params.toString()}`;
}

export class FxProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxProviderError';
  }
}

/**
 * Strict validation of a v2 /rates body for a pinned currency. Any unexpected
 * shape, base/quote, date outside the window or outside the pinned provider's
 * calendar (evidence of a blended series), duplicate date, or non-finite /
 * non-positive rate rejects the whole response.
 */
export function validateFxResponse(
  currency: Exclude<FxCurrency, 'EGP'>,
  body: unknown,
  window: FxRequestWindow,
): FxPublication[] {
  const provider = FX_PROVIDER_PINS[currency];
  if (!Array.isArray(body) || body.length > MAX_ROWS)
    throw new FxProviderError('unexpected response shape');
  const seen = new Set<string>();
  const out: FxPublication[] = [];
  for (const row of body as unknown[]) {
    if (typeof row !== 'object' || row === null || Array.isArray(row))
      throw new FxProviderError('unexpected row shape');
    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'base,date,quote,rate')
      throw new FxProviderError('unexpected row fields');
    const { date, base, quote, rate } = row as Record<string, unknown>;
    if (base !== currency || quote !== FX_TARGET_CURRENCY)
      throw new FxProviderError('unexpected currency');
    if (
      typeof date !== 'string' ||
      weekdayOf(date) === null ||
      date < carryInFloor(window.from) ||
      date > window.to
    )
      throw new FxProviderError('unexpected date');
    if (!isProviderPublicationDay(provider, date))
      throw new FxProviderError('row outside pinned provider calendar');
    if (seen.has(date)) throw new FxProviderError('duplicate date');
    seen.add(date);
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0)
      throw new FxProviderError('invalid rate');
    const text = String(rate);
    if (!isValidRate(text) || !rateInBounds(currency, text))
      throw new FxProviderError('invalid rate');
    out.push({ date, rate: text });
  }
  return out;
}

function clampTimeout(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return FX_TIMEOUT_MS;
  return Math.min(ms, MAX_TIMEOUT_MS);
}

/** Reads the body with a byte cap; null when the cap is exceeded. */
async function readCapped(response: Response): Promise<string | null> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return text.length > MAX_RESPONSE_CHARS ? null : text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_CHARS) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * A rate may be frozen only once the provider has provably published past the
 * day before the transaction: a row dated on or after the transaction's Cairo
 * date exists, or the settle period has elapsed (T062 finding 1).
 */
export function isSettled(
  transactionAt: string,
  publications: readonly FxPublication[],
  now: Date,
): boolean {
  const transactionDate = cairoDateAt(transactionAt);
  if (publications.some((p) => p.date >= transactionDate)) return true;
  const deadline = new Date(`${transactionDate}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + FX_SETTLE_DAYS);
  return cairoDateAt(now) >= deadline.toISOString().slice(0, 10);
}

export type FetchFxOptions = {
  transactionAt: string;
  currency: FxCurrency;
  existing?: FxSnapshot | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injectable clock for the settle rule; defaults to the current time. */
  now?: Date;
};

/**
 * Resolves the immutable EGP snapshot for a line. EGP and an existing ready
 * snapshot make no network call. Every failure (network, timeout, HTTP error,
 * oversize or invalid body, no prior publication) returns `pending` so the
 * caller retries idempotently and excludes the line from converted totals.
 * Never throws.
 */
export async function fetchFxSnapshot(
  options: FetchFxOptions,
): Promise<FxSnapshot> {
  const { transactionAt, currency } = options;
  if (currency === 'EGP') return Object.freeze({ ...EGP_IDENTITY });
  if (options.existing && options.existing.status === 'ready')
    return Object.freeze({ ...options.existing });
  if (!isPinnedCurrency(currency)) return { ...PENDING };
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    clampTimeout(options.timeoutMs),
  );
  try {
    const window = fxRequestWindow(transactionAt);
    const url = buildFxRequestUrl(currency, window);
    const response = await doFetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { ...PENDING };
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS)
      return { ...PENDING };
    const text = await readCapped(response);
    if (text === null) return { ...PENDING };
    const publications = validateFxResponse(currency, JSON.parse(text), window);
    if (!isSettled(transactionAt, publications, options.now ?? new Date()))
      return { ...PENDING };
    return selectFxSnapshot({ transactionAt, currency, publications });
  } catch {
    return { ...PENDING };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Exact conversion and one half-up rounding per aggregate
// ---------------------------------------------------------------------------

function parseRate(rate: string): { num: bigint; scale: number } {
  if (!isValidRate(rate)) throw new RangeError('invalid FX rate');
  const [whole, frac = ''] = rate.split('.');
  return { num: BigInt(whole + frac), scale: frac.length };
}

function snapshotMatchesPin(
  currency: FxCurrency,
  snapshot: Extract<FxSnapshot, { status: 'ready' }>,
): boolean {
  if (currency === 'EGP')
    return snapshot.provider === null && snapshot.rate === '1';
  if (!isPinnedCurrency(currency)) return false;
  return (
    snapshot.provider === FX_PROVIDER_PINS[currency] &&
    isValidRate(snapshot.rate)
  );
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/**
 * Converts each ready line exactly (amountMinor * rate, no per-line rounding),
 * sums per group and rounds each group once, half-up, to EGP minor units.
 * Pending lines are excluded and listed; settlements and original lines are
 * returned unchanged.
 */
export function buildFxReport(input: {
  lines: readonly FxReportLine[];
  settlements: readonly FxSettlement[];
}): FxReport {
  const sums = new Map<string, { num: bigint; scale: number }>();
  const excludedLineIds: string[] = [];
  const flaggedLineIds: string[] = [];
  for (const line of input.lines) {
    if (line.snapshot.status !== 'ready') {
      excludedLineIds.push(line.id);
      continue;
    }
    if (!snapshotMatchesPin(line.currency, line.snapshot)) {
      flaggedLineIds.push(line.id);
      continue;
    }
    const rate =
      line.currency === 'EGP'
        ? { num: 1n, scale: 0 }
        : parseRate(line.snapshot.rate);
    const term = line.amountMinor * rate.num;
    const current = sums.get(line.groupKey) ?? { num: 0n, scale: 0 };
    const scale = Math.max(current.scale, rate.scale);
    sums.set(line.groupKey, {
      num:
        current.num * 10n ** BigInt(scale - current.scale) +
        term * 10n ** BigInt(scale - rate.scale),
      scale,
    });
  }
  const aggregates: Record<string, bigint> = {};
  for (const [groupKey, { num, scale }] of sums) {
    const den = 10n ** BigInt(scale);
    aggregates[groupKey] = floorDiv(2n * num + den, 2n * den);
  }
  return {
    aggregates,
    excludedLineIds,
    flaggedLineIds,
    lines: [...input.lines],
    settlements: [...input.settlements],
  };
}
