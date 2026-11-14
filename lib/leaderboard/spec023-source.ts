import type { SupabaseClient } from '@supabase/supabase-js';
import {
  readWeeklyAdherence,
  type MeasurementBaselineRow,
  type WeeklyAdherenceRow,
} from '../progress-coaching/contract';
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
 * NOT resolved (PO-DECISION-NEEDED): neither spec defines the per-goal-type
 * normalization of baseline improvement (FR-018), the meaning of the FR-021
 * "achievement date", a client goal-type source, or a "client code". These
 * are explicit injected resolvers. While any is missing the source fails
 * closed: it throws `LeaderboardInputsUnresolvedError` before reading any
 * spec 023 data, so no candidate is generated and nothing is guessed.
 */
export type GoalProgressResolution = {
  /** Improvement versus baseline normalized for the client's goal type, [0, 1]. */
  normalizedProgress: number;
  /** FR-021 achievement date (Cairo YYYY-MM-DD). */
  achievedOn: string;
};

export interface GoalProgressResolver {
  /** Baselines come from `progress_measurement_baselines` (spec 023). */
  resolve(input: {
    clientId: string;
    baselines: readonly MeasurementBaselineRow[];
  }): GoalProgressResolution | null;
  loadBaselines(request: {
    workspaceId: string;
    asOf: string;
  }): Promise<readonly MeasurementBaselineRow[]>;
}

export interface ClientCodeResolver {
  codesFor(
    workspaceId: string,
    clientIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}

export type UnresolvedLeaderboardInput =
  'goal_progress_normalization' | 'achievement_date' | 'client_code';

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

export function createSpec023ScoreInputSource(options: {
  client: SupabaseClient;
  goalProgress: GoalProgressResolver | null;
  clientCodes: ClientCodeResolver | null;
  now?: () => Date;
}): LeaderboardScoreInputSource {
  return {
    async loadScoreInputs(
      request: LeaderboardScoreRequest,
    ): Promise<readonly LeaderboardScoreInputs[]> {
      const missing: UnresolvedLeaderboardInput[] = [];
      if (!options.goalProgress)
        missing.push('goal_progress_normalization', 'achievement_date');
      if (!options.clientCodes) missing.push('client_code');
      // Fail closed before any spec 023 read: nothing is fetched for a
      // ranking that cannot be computed without guessing.
      if (missing.length > 0 || !options.goalProgress || !options.clientCodes)
        throw new LeaderboardInputsUnresolvedError(missing);
      if (request.clientIds.length === 0) return [];

      const window = resultMonthWindow(
        request.periodMonth,
        cairoToday((options.now ?? (() => new Date()))()),
      );
      const adherence = await readWeeklyAdherence(options.client, {
        workspaceId: request.workspaceId,
        from: window.from,
        to: window.to,
      });
      if (adherence.status !== 'ok')
        throw new LeaderboardSourceUnavailableError();
      const monthly = aggregateMonthlyAdherence(
        adherence.rows,
        request.clientIds,
      );
      if (monthly.length === 0) return [];

      const [baselines, codes] = await Promise.all([
        options.goalProgress.loadBaselines({
          workspaceId: request.workspaceId,
          asOf: window.to,
        }),
        options.clientCodes.codesFor(
          request.workspaceId,
          monthly.map((row) => row.clientId),
        ),
      ]);
      const inputs: LeaderboardScoreInputs[] = [];
      for (const row of monthly) {
        const progress = options.goalProgress.resolve({
          clientId: row.clientId,
          baselines: baselines.filter(
            (baseline) => baseline.clientId === row.clientId,
          ),
        });
        const clientCode = codes.get(row.clientId);
        // A client without a resolvable progress value or code is omitted.
        if (!progress || !clientCode) continue;
        inputs.push({
          clientId: row.clientId,
          clientCode,
          workoutAdherence: row.workoutAdherence,
          dietAdherence: row.dietAdherence,
          normalizedProgress: progress.normalizedProgress,
          achievedOn: progress.achievedOn,
        });
      }
      return inputs;
    },
  };
}
