import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readMeasurementBaselines,
  readMeasurementHistory,
  readWeeklyAdherence,
  type WeeklyAdherenceRow,
} from '../progress-coaching/contract';
import {
  missingResolvers,
  type LeaderboardInputResolver,
  type LeaderboardResolverInput,
  type LeaderboardResolvers,
  type UnresolvedLeaderboardInput,
} from './resolvers';
import type {
  LeaderboardScoreInputSource,
  LeaderboardScoreInputs,
  LeaderboardScoreRequest,
} from './score-inputs';

/**
 * Spec 023 -> F24 adapter (FR-017, FR-018, FR-031, FR-033).
 *
 * Resolved here: the adherence component, read by name from spec 023's
 * `progress_weekly_adherence` for the current result month.
 *
 * NOT resolved (PO-DECISION-NEEDED): FR-018 normalization per goal type, the
 * FR-021 "achievement date" and the FR-021 client code. Each is one injected
 * resolver (see `resolvers.ts`). While any is missing the source fails
 * closed: it throws `LeaderboardInputsUnresolvedError` before reading any
 * spec 023 data, so no candidate is generated and nothing is guessed.
 */
export type { UnresolvedLeaderboardInput } from './resolvers';

export class LeaderboardInputsUnresolvedError extends Error {
  readonly missing: readonly UnresolvedLeaderboardInput[];
  constructor(missing: readonly UnresolvedLeaderboardInput[]) {
    super('leaderboard_inputs_unresolved');
    this.name = 'LeaderboardInputsUnresolvedError';
    this.missing = missing;
  }
}

export class LeaderboardSourceUnavailableError extends Error {
  constructor() {
    super('leaderboard_source_unavailable');
    this.name = 'LeaderboardSourceUnavailableError';
  }
}

export type MonthlyAdherence = {
  clientId: string;
  /** Mean of the month's answered 0-10 workout values. */
  workoutAdherence: number;
  /** Mean of the month's answered 0-10 diet values. */
  dietAdherence: number;
  /** Submitted check-ins in the window with both answers present. */
  checkins: number;
};

/**
 * Current-month adherence per client: the mean of each answered question
 * over the month's submitted check-ins where both answers are present.
 * Unanswered (null) values are never treated as zero. Clients with no
 * complete check-in in the window are omitted (no guessed value).
 */
export function aggregateMonthlyAdherence(
  rows: readonly WeeklyAdherenceRow[],
  allowedClientIds: readonly string[],
): MonthlyAdherence[] {
  const allowed = new Set(allowedClientIds);
  const totals = new Map<
    string,
    { workout: number; diet: number; count: number }
  >();
  for (const row of rows) {
    if (!allowed.has(row.clientId)) continue;
    if (row.workoutAdherence === null || row.dietAdherence === null) continue;
    const total = totals.get(row.clientId) ?? { workout: 0, diet: 0, count: 0 };
    total.workout += row.workoutAdherence;
    total.diet += row.dietAdherence;
    total.count += 1;
    totals.set(row.clientId, total);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([clientId, total]) => ({
      clientId,
      workoutAdherence: total.workout / total.count,
      dietAdherence: total.diet / total.count,
      checkins: total.count,
    }));
}

/** Result-month window clipped to `today` (both Cairo dates, inclusive). */
export function resultMonthWindow(
  periodMonth: string,
  today: string,
): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})-01$/u.exec(periodMonth);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/u.test(today))
    throw new RangeError('Invalid result month window');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`;
  const to = today < monthEnd ? today : monthEnd;
  if (to < periodMonth) throw new RangeError('Result month is in the future');
  return { from: periodMonth, to };
}

function cairoToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const CAIRO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Runs one resolver and checks its output: only requested clients, only
 * well-formed values. A resolver that widens the client set is a defect and
 * fails the whole generation; a client without a value is simply omitted.
 */
async function resolveAll<T>(
  resolver: LeaderboardInputResolver<T>,
  input: LeaderboardResolverInput,
  valid: (value: unknown) => value is T,
): Promise<ReadonlyMap<string, T>> {
  const resolved = await resolver.resolve(input);
  if (!(resolved instanceof Map))
    throw new RangeError('Resolver returned a malformed result');
  const requested = new Set(input.clients.map((row) => row.clientId));
  for (const [clientId, value] of resolved) {
    if (!requested.has(clientId))
      throw new RangeError('Resolver returned a client outside the request');
    if (!valid(value)) throw new RangeError('Resolver returned a bad value');
  }
  return resolved;
}

const isProgress = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;
const isCairoDate = (value: unknown): value is string =>
  typeof value === 'string' && CAIRO_DATE.test(value);
const isCode = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

export function createSpec023ScoreInputSource(options: {
  client: SupabaseClient;
  resolvers: LeaderboardResolvers;
  now?: () => Date;
}): LeaderboardScoreInputSource {
  return {
    async loadScoreInputs(
      request: LeaderboardScoreRequest,
    ): Promise<readonly LeaderboardScoreInputs[]> {
      const { goalProgress, achievementDate, clientCode } = options.resolvers;
      // Fail closed before any spec 023 read: nothing is fetched for a
      // ranking that cannot be computed without guessing.
      if (!goalProgress || !achievementDate || !clientCode)
        throw new LeaderboardInputsUnresolvedError(
          missingResolvers(options.resolvers),
        );
      if (request.clientIds.length === 0) return [];

      const window = resultMonthWindow(
        request.periodMonth,
        cairoToday((options.now ?? (() => new Date()))()),
      );
      const scope = {
        workspaceId: request.workspaceId,
        from: window.from,
        to: window.to,
      };
      const [adherence, measurements, baselines] = await Promise.all([
        readWeeklyAdherence(options.client, scope),
        readMeasurementHistory(options.client, scope),
        readMeasurementBaselines(options.client, {
          workspaceId: request.workspaceId,
          asOf: window.to,
        }),
      ]);
      if (
        adherence.status !== 'ok' ||
        measurements.status !== 'ok' ||
        baselines.status !== 'ok'
      )
        throw new LeaderboardSourceUnavailableError();
      const monthly = aggregateMonthlyAdherence(
        adherence.rows,
        request.clientIds,
      );
      if (monthly.length === 0) return [];

      const input: LeaderboardResolverInput = {
        workspaceId: request.workspaceId,
        periodMonth: request.periodMonth,
        window,
        clients: monthly.map(({ clientId }) => ({
          clientId,
          adherence: adherence.rows.filter((row) => row.clientId === clientId),
          measurements: measurements.rows.filter(
            (row) => row.clientId === clientId,
          ),
          baselines: baselines.rows.filter((row) => row.clientId === clientId),
        })),
      };
      const [progress, achieved, codes] = await Promise.all([
        resolveAll(goalProgress, input, isProgress),
        resolveAll(achievementDate, input, isCairoDate),
        resolveAll(clientCode, input, isCode),
      ]);
      const inputs: LeaderboardScoreInputs[] = [];
      for (const row of monthly) {
        const normalizedProgress = progress.get(row.clientId);
        const achievedOn = achieved.get(row.clientId);
        const code = codes.get(row.clientId);
        // A client without every resolved input is omitted, never guessed.
        if (
          normalizedProgress === undefined ||
          achievedOn === undefined ||
          code === undefined
        )
          continue;
        inputs.push({
          clientId: row.clientId,
          clientCode: code,
          workoutAdherence: row.workoutAdherence,
          dietAdherence: row.dietAdherence,
          normalizedProgress,
          achievedOn,
        });
      }
      return inputs;
    },
  };
}
