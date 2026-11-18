import type {
  MeasurementBaselineRow,
  MeasurementHistoryRow,
  WeeklyAdherenceRow,
} from '../progress-coaching/contract';
import { bodyWeightBaseline, goalProgress, type GoalType } from './goals';

/**
 * The three F24 score inputs that the spec left to the PO, one resolver each.
 * PO decision 2026-11-14:
 *
 * - `goalProgress`    FR-018, option A: trainer-set goal type; first body
 *                     weight vs this month's latest (see `goals.ts`).
 * - `achievementDate` FR-021, "Last scoring input": the instant of the
 *                     client's latest check-in or measurement counted in
 *                     this month's score. Earlier ranks higher.
 * - `clientCode`      FR-021, "Registration order": earlier registration
 *                     approval ranks higher.
 *
 * The spec 023 source still fails closed (`LeaderboardInputsUnresolvedError`
 * before any read) when a resolver is missing, and omits any client whose
 * input cannot be resolved instead of guessing.
 *
 * Resolvers are server-only. Their inputs and outputs never reach a DTO, an
 * audit payload or a log line (FR-023, FR-024, FR-040).
 */

/** Spec 023 rows for one client, already restricted to that client. */
export type ClientProgressData = {
  clientId: string;
  /** Submitted weekly check-ins due inside the result-month window. */
  adherence: readonly WeeklyAdherenceRow[];
  /** Measurements recorded inside the result-month window. */
  measurements: readonly MeasurementHistoryRow[];
  /** First and latest value per measurement type, as of the window end. */
  baselines: readonly MeasurementBaselineRow[];
};

export type LeaderboardResolverInput = {
  workspaceId: string;
  /** First day of the result month (YYYY-MM-01, Africa/Cairo). */
  periodMonth: string;
  /** Result-month window clipped to today (Cairo dates, inclusive). */
  window: { from: string; to: string };
  /** Only clients that are eligible and have current-month adherence. */
  clients: readonly ClientProgressData[];
};

/**
 * Batch and async so an implementation can load extra facts once. A client
 * missing from the returned map is omitted from the candidate, never guessed.
 */
export interface LeaderboardInputResolver<T> {
  resolve(input: LeaderboardResolverInput): Promise<ReadonlyMap<string, T>>;
}

export type LeaderboardResolvers = {
  /** FR-018 normalized goal-relative progress, [0, 1]. */
  goalProgress: LeaderboardInputResolver<number> | null;
  /** FR-021 achievement instant, canonical UTC ISO string. */
  achievementDate: LeaderboardInputResolver<string> | null;
  /** FR-021 client code (ordinal ascending comparison). */
  clientCode: LeaderboardInputResolver<string> | null;
};

export type UnresolvedLeaderboardInput =
  'goal_progress_normalization' | 'achievement_date' | 'client_code';

export function missingResolvers(
  resolvers: LeaderboardResolvers,
): UnresolvedLeaderboardInput[] {
  const missing: UnresolvedLeaderboardInput[] = [];
  if (!resolvers.goalProgress) missing.push('goal_progress_normalization');
  if (!resolvers.achievementDate) missing.push('achievement_date');
  if (!resolvers.clientCode) missing.push('client_code');
  return missing;
}

/** Server-side facts from the PO candidate pool (never sent to a browser). */
export type LeaderboardClientFacts = {
  goalType: GoalType | null;
  /** Earliest registration approval instant, any parseable timestamp. */
  registrationApprovedAt: string | null;
};

/**
 * The client's body-weight baseline when its latest value was recorded in
 * this month's window ("this month's latest"); otherwise null.
 */
export function monthBodyWeight(
  client: ClientProgressData,
  window: { from: string; to: string },
): MeasurementBaselineRow | null {
  const weight = bodyWeightBaseline(client.baselines);
  if (!weight) return null;
  if (
    weight.latestRecordedOn < window.from ||
    weight.latestRecordedOn > window.to
  )
    return null;
  return weight;
}

function instant(value: string): number | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * The last instant of a Cairo calendar day. A measurement known only by its
 * date is placed at the end of that day, so missing time precision never
 * ranks a client earlier.
 */
export function cairoEndOfDay(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (!match) throw new RangeError('Invalid Cairo date');
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // Cairo is UTC+2 or UTC+3 (DST): take the later midnight that still belongs to the next day.
  for (const offsetHours of [2, 3]) {
    const nextMidnight = Date.UTC(year, month - 1, date + 1, -offsetHours);
    const candidate = nextMidnight - 1;
    if (
      format.format(new Date(candidate)) === day &&
      format.format(new Date(nextMidnight)) !== day
    )
      return candidate;
  }
  throw new RangeError('Unresolvable Cairo day boundary');
}

/**
 * FR-021 "last scoring input": the latest of (a) the submission instant of
 * every check-in counted in the month's adherence (both answers present) and
 * (b) the counted body-weight measurement. A check-in-sourced measurement
 * takes its check-in's submission instant; otherwise the end of its Cairo day.
 */
export function lastScoringInput(
  client: ClientProgressData,
  window: { from: string; to: string },
): string | null {
  const weight = monthBodyWeight(client, window);
  if (!weight) return null;
  const times: number[] = [];
  const consider = (value: number | null) => {
    if (value !== null) times.push(value);
  };
  for (const row of client.adherence)
    if (row.workoutAdherence !== null && row.dietAdherence !== null)
      consider(instant(row.submittedAt));
  const measured = client.measurements.find(
    (row) =>
      row.measurementType === weight.measurementType &&
      row.recordedOn === weight.latestRecordedOn,
  );
  const source =
    measured?.sourceKind === 'checkin' && measured.sourceAssignmentId
      ? client.adherence.find(
          (row) => row.assignmentId === measured.sourceAssignmentId,
        )
      : undefined;
  consider(
    source
      ? instant(source.submittedAt)
      : cairoEndOfDay(weight.latestRecordedOn),
  );
  return times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
}

/**
 * FR-021 "registration order" as an ordinal key: the approval instant in
 * canonical UTC form (lexicographic order = time order), then the client id
 * so the key is unique.
 */
export function registrationOrderCode(
  clientId: string,
  registrationApprovedAt: string | null,
): string | null {
  if (!registrationApprovedAt) return null;
  const time = instant(registrationApprovedAt);
  return time === null ? null : `${new Date(time).toISOString()}#${clientId}`;
}

/** Production resolvers implementing the PO decision of 2026-11-14. */
export function productionLeaderboardResolvers(
  facts: ReadonlyMap<string, LeaderboardClientFacts>,
): LeaderboardResolvers {
  const each = <T>(
    compute: (
      client: ClientProgressData,
      input: LeaderboardResolverInput,
    ) => T | null,
  ): LeaderboardInputResolver<T> => ({
    resolve: async (input) => {
      const resolved = new Map<string, T>();
      for (const client of input.clients) {
        const value = compute(client, input);
        if (value !== null) resolved.set(client.clientId, value);
      }
      return resolved;
    },
  });
  return {
    goalProgress: each((client, input) => {
      const goalType = facts.get(client.clientId)?.goalType ?? null;
      if (!goalType) return null; // no goal set -> not eligible
      const weight = monthBodyWeight(client, input.window);
      if (!weight) return null; // no usable weight this month -> omitted
      return goalProgress(goalType, weight.baselineValue, weight.latestValue);
    }),
    achievementDate: each((client, input) =>
      lastScoringInput(client, input.window),
    ),
    clientCode: each((client) =>
      registrationOrderCode(
        client.clientId,
        facts.get(client.clientId)?.registrationApprovedAt ?? null,
      ),
    ),
  };
}
