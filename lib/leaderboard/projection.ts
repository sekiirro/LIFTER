/**
 * FR-022-FR-024, FR-027, SC-004: the only shape a leaderboard read may take
 * beyond the server. Rows carry rank and username; nothing else is copied
 * from the RPC payload, so an extra field (score, client id, health value)
 * can never reach a page even if the database returned one.
 */
export const LEADERBOARD_ENTRY_FIELDS = ['rank', 'username'] as const;
export const LEADERBOARD_VIEW_FIELDS = [
  'status',
  'periodMonth',
  'entries',
] as const;

export type LeaderboardEntryView = { rank: number; username: string };

export type LeaderboardView =
  | {
      status: 'available';
      /** First day of the approved result month (YYYY-MM-01). */
      periodMonth: string;
      entries: LeaderboardEntryView[];
    }
  | { status: 'empty' }
  | { status: 'not_permitted' }
  | { status: 'unavailable' };

const monthStart = /^\d{4}-(0[1-9]|1[0-2])-01$/u;
const username = /^[a-z0-9_.]{3,20}$/u;

function entryFrom(value: unknown): LeaderboardEntryView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.rank !== 'number' ||
    !Number.isInteger(record.rank) ||
    record.rank < 1 ||
    record.rank > 5 ||
    typeof record.username !== 'string' ||
    !username.test(record.username)
  )
    return null;
  return { rank: record.rank, username: record.username };
}

export function toLeaderboardView(value: unknown): LeaderboardView {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { status: 'unavailable' };
  const record = value as Record<string, unknown>;
  if (record.status === 'empty') return { status: 'empty' };
  if (record.status === 'not_permitted') return { status: 'not_permitted' };
  if (
    record.status !== 'available' ||
    typeof record.period_month !== 'string' ||
    !monthStart.test(record.period_month) ||
    !Array.isArray(record.entries) ||
    record.entries.length > 5
  )
    return { status: 'unavailable' };
  const entries: LeaderboardEntryView[] = [];
  for (const raw of record.entries) {
    const entry = entryFrom(raw);
    if (!entry) return { status: 'unavailable' };
    entries.push(entry);
  }
  const ranks = new Set(entries.map((entry) => entry.rank));
  if (ranks.size !== entries.length) return { status: 'unavailable' };
  entries.sort((left, right) => left.rank - right.rank);
  // Every visible entry may have opted out since approval (FR-008).
  if (entries.length === 0) return { status: 'empty' };
  return { status: 'available', periodMonth: record.period_month, entries };
}

export type PendingCandidateView =
  | {
      status: 'pending';
      publicationId: string;
      periodMonth: string;
      entries: LeaderboardEntryView[];
    }
  | { status: 'none' }
  | { status: 'not_permitted' }
  | { status: 'unavailable' };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** PO review DTO: the same rank/username allow-list plus the decision handle. */
export function toPendingCandidateView(value: unknown): PendingCandidateView {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { status: 'unavailable' };
  const record = value as Record<string, unknown>;
  if (record.status === 'none') return { status: 'none' };
  if (record.status === 'not_permitted') return { status: 'not_permitted' };
  if (record.status !== 'pending' || typeof record.publication_id !== 'string')
    return { status: 'unavailable' };
  if (!uuid.test(record.publication_id)) return { status: 'unavailable' };
  const view = toLeaderboardView({ ...record, status: 'available' });
  if (view.status === 'empty')
    return {
      status: 'pending',
      publicationId: record.publication_id,
      periodMonth: record.period_month as string,
      entries: [],
    };
  if (view.status !== 'available') return { status: 'unavailable' };
  return {
    status: 'pending',
    publicationId: record.publication_id,
    periodMonth: view.periodMonth,
    entries: view.entries,
  };
}

export type ClientLeaderboardSelf =
  | {
      status: 'ok';
      username: string | null;
      optedOut: boolean;
      eligible: boolean;
    }
  | { status: 'not_permitted' }
  | { status: 'unavailable' };

export function toClientLeaderboardSelf(value: unknown): ClientLeaderboardSelf {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { status: 'unavailable' };
  const record = value as Record<string, unknown>;
  if (record.status === 'not_permitted') return { status: 'not_permitted' };
  if (
    record.status !== 'ok' ||
    !(record.username === null || typeof record.username === 'string') ||
    typeof record.opted_out !== 'boolean' ||
    typeof record.eligible !== 'boolean'
  )
    return { status: 'unavailable' };
  return {
    status: 'ok',
    username: record.username,
    optedOut: record.opted_out,
    eligible: record.eligible,
  };
}
